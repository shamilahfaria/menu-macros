import { getPacks } from "../lib/storage.js";
import { findPackForStore } from "../lib/pack.js";
import { matchItem, matchModifier } from "../lib/matcher.js";
import {
  getStoreHaystack,
  findMenuItemNodes,
  findDetailNameEl,
  findModifierNodes,
  isItemDetailPage,
} from "./doordash.js";
import { createNutritionStrip, createModifierDelta } from "./ui.js";

const MARK = "data-mm-painted";
const DETAIL_STRIP_MARK = "data-mm-detail-strip";
const PAINT_DEBOUNCE_MS = 150;
const PREFETCH_SCROLL_STEP_PX = 700;
const PREFETCH_SETTLE_MS = 120;
const PREFETCH_MAX_STEPS = 60;
const PREFETCH_IDLE_PASSES = 3;
const PREFETCH_STYLE_ID = "mm-prefetch-style";

// Cached for the lifetime of the page so repeated MutationObserver passes
// don't re-fetch/re-validate chrome.storage on every DOM tick. Only
// refetched when the store haystack text changes (e.g. a SPA navigation to
// a different store without a full page reload).
let cachedPacks = null;
let cachedHaystack = null;

async function getActivePack() {
  const haystack = getStoreHaystack();
  if (!cachedPacks || cachedHaystack !== haystack) {
    cachedPacks = await getPacks();
    cachedHaystack = haystack;
  }
  return findPackForStore(cachedPacks, haystack);
}

// The strip mounts as an overlay on the card photo (doordash.js picks the
// host), so nothing here has to resize or unclip DoorDash's boxes — the card
// keeps its natural height and the virtualized grid stays consistent.
export function mountListStrip(node, strip) {
  const mount = node.stripMount || { type: "append", el: node.root };

  // Side-image cards wrap the photo in static boxes, so the band would resolve
  // against the whole card and span its text column. `position: relative` with
  // no offsets moves nothing; it only makes the photo box a containing block.
  if (mount.ensureRelative && mount.el.style.position === "") {
    mount.el.style.position = "relative";
  }

  if (mount.type === "after") {
    mount.el.insertAdjacentElement("afterend", strip);
    return;
  }
  mount.el.appendChild(strip);
}

function ensurePrefetchStyles() {
  if (document.getElementById(PREFETCH_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = PREFETCH_STYLE_ID;
  style.textContent = `
    html.mm-prefetching .mm-root { visibility: hidden !important; }
  `;
  document.head.appendChild(style);
}

function maxScrollTop() {
  return Math.max(
    0,
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
      - window.innerHeight,
  );
}

// DoorDash lazy-loads menu sections on scroll. Walk the page once at load,
// paint every card while strips are hidden, then restore the user's scroll
// position so they don't watch strips pop in while browsing.
async function prefetchLazyMenu(paintListFn) {
  const pack = await getActivePack();
  if (!pack) return;

  ensurePrefetchStyles();
  document.documentElement.classList.add("mm-prefetching");
  const savedScrollY = window.scrollY;
  let lastNodeCount = 0;
  let idlePasses = 0;

  try {
    for (let step = 0; step < PREFETCH_MAX_STEPS; step += 1) {
      await paintListFn();

      const nodeCount = findMenuItemNodes().length;
      const targetY = Math.min(maxScrollTop(), (step + 1) * PREFETCH_SCROLL_STEP_PX);
      window.scrollTo(0, targetY);
      await new Promise((resolve) => setTimeout(resolve, PREFETCH_SETTLE_MS));

      const atBottom = targetY >= maxScrollTop() - 4;
      if (nodeCount === lastNodeCount && atBottom) {
        idlePasses += 1;
        if (idlePasses >= PREFETCH_IDLE_PASSES) break;
      } else {
        idlePasses = 0;
      }
      lastNodeCount = nodeCount;
    }

    await paintListFn();
  } finally {
    window.scrollTo(0, savedScrollY);
    document.documentElement.classList.remove("mm-prefetching");
  }
}

// A strip can be mounted inside the card (photo overlay, in-flow fallback) or
// as the card's next sibling, so look in both places.
function existingStrip(root) {
  const inside = root.querySelector(".mm-root");
  if (inside) return inside;
  const sibling = root.nextElementSibling;
  return sibling?.classList?.contains("mm-root") ? sibling : null;
}

// Repaints whenever the match *state* (matched vs unavailable) differs from
// what's mounted, rather than locking after the first pass. A card painted
// before the pack resolves would otherwise stay "Nutrition unavailable"
// forever — same reasoning as paintDetailStrip below.
export function paintListNode(node, item) {
  const state = item ? "1" : "0";
  if (node.root.getAttribute(MARK) === state) return;

  existingStrip(node.root)?.remove();
  mountListStrip(node, createNutritionStrip({ item, variant: "list" }));
  node.root.setAttribute(MARK, state);
}

async function paintList() {
  const pack = await getActivePack();
  if (!pack) return;

  for (const node of findMenuItemNodes()) {
    paintListNode(node, matchItem(node.name, pack.items));
  }
}

// Exported (pure DOM, no chrome/storage dependency) so the mount-once /
// retry-until-stable logic below can be unit tested directly with jsdom
// elements — see tests/content.test.js.

// Repaints the base strip whenever the match *state* (matched vs
// unavailable) differs from what's already mounted, instead of locking
// permanently after the first pass. This avoids the bug where an early
// paint (before the name/pack fully resolves) renders "unavailable" and
// then never updates even once a real match becomes available on a later
// MutationObserver pass. Once a state is re-confirmed unchanged, it's a
// no-op (no needless DOM churn).
export function paintDetailStrip(headerMount, item) {
  const state = item ? "1" : "0";
  if (headerMount.getAttribute(DETAIL_STRIP_MARK) === state) return;

  const existing = headerMount.nextElementSibling;
  if (existing?.classList?.contains("mm-root")) existing.remove();

  const strip = createNutritionStrip({ item });
  headerMount.insertAdjacentElement("afterend", strip);
  headerMount.setAttribute(DETAIL_STRIP_MARK, state);
}

// Only marks a modifier row painted once a delta is actually inserted.
// An unmatched/low-confidence row is left unmarked so a later hydration
// pass (e.g. once modifier text finishes rendering) gets another chance
// to match, instead of being permanently skipped.
export function paintModifierDeltas(modifierNodes, item) {
  for (const node of modifierNodes) {
    if (node.root.getAttribute(MARK) === "1") continue;

    const modifier = matchModifier(node.name, item?.modifiers || []);
    const delta = modifier ? createModifierDelta(modifier) : null;
    if (!delta) continue; // unmatched or no delta values → retry next pass

    node.mountEl.insertAdjacentElement("beforeend", delta);
    node.root.setAttribute(MARK, "1");
  }
}

async function paintDetail() {
  const pack = await getActivePack();
  if (!pack) return;

  const nameEl = findDetailNameEl();
  if (!nameEl) return;
  const item = matchItem(nameEl.textContent?.trim() || "", pack.items);

  const headerMount = nameEl.parentElement || nameEl;
  paintDetailStrip(headerMount, item);

  if (!item) return; // no high-confidence item match → no modifier deltas

  paintModifierDeltas(findModifierNodes(), item);
}

// Serializes paint passes so a mutation firing mid-paint queues a follow-up
// run instead of starting a second concurrent pass — an overlapping pass
// could observe unmarked nodes before the in-flight one finishes marking
// them, producing duplicate strips.
function createPaintScheduler(paint) {
  let inFlight = null;
  let queued = false;

  function run() {
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = paint()
      .catch(() => {})
      .finally(() => {
        inFlight = null;
        if (queued) {
          queued = false;
          run();
        }
      });
  }

  return run;
}

function debounce(fn, ms) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

async function boot() {
  const paint = () => (isItemDetailPage() ? paintDetail() : paintList());
  const schedulePaint = createPaintScheduler(paint);

  if (!isItemDetailPage()) {
    await prefetchLazyMenu(paintList);
  }

  schedulePaint();

  const debouncedPaint = debounce(schedulePaint, PAINT_DEBOUNCE_MS);
  const obs = new MutationObserver(() => debouncedPaint());
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

boot().catch(() => {});
