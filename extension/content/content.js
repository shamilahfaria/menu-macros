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

// Some DoorDash layouts nest the name element directly under the card
// root, in which case mountEl === root and inserting "afterend" would
// place the strip as a sibling of the card (outside it) instead of inside.
// Falling back to appending into root keeps the strip contained.
function mountStrip(root, mountEl, strip) {
  if (mountEl && mountEl !== root && mountEl.parentElement) {
    mountEl.insertAdjacentElement("afterend", strip);
  } else {
    root.appendChild(strip);
  }
}

async function paintList() {
  const pack = await getActivePack();
  if (!pack) return;

  for (const node of findMenuItemNodes()) {
    if (node.root.getAttribute(MARK) === "1") continue;
    const item = matchItem(node.name, pack.items);
    const priceText = node.priceEl?.textContent?.trim() || "";
    const strip = createNutritionStrip({ item, priceText });
    mountStrip(node.root, node.mountEl, strip);
    node.root.setAttribute(MARK, "1");
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

  schedulePaint();

  const debouncedPaint = debounce(schedulePaint, PAINT_DEBOUNCE_MS);
  const obs = new MutationObserver(() => debouncedPaint());
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

boot().catch(() => {});
