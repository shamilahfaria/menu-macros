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

async function paintList() {
  const packs = await getPacks();
  const pack = findPackForStore(packs, getStoreHaystack());
  if (!pack) return;

  for (const node of findMenuItemNodes()) {
    if (node.root.getAttribute(MARK) === "1") continue;
    const item = matchItem(node.name, pack.items);
    const priceText = node.priceEl?.textContent?.trim() || "";
    const strip = createNutritionStrip({ item, priceText });
    node.mountEl.insertAdjacentElement("afterend", strip);
    node.root.setAttribute(MARK, "1");
  }
}

async function paintDetail() {
  const packs = await getPacks();
  const pack = findPackForStore(packs, getStoreHaystack());
  if (!pack) return;

  const nameEl = findDetailNameEl();
  if (!nameEl) return;
  const item = matchItem(nameEl.textContent?.trim() || "", pack.items);

  const headerMount = nameEl.parentElement || nameEl;
  if (headerMount.getAttribute(DETAIL_STRIP_MARK) !== "1") {
    const strip = createNutritionStrip({ item });
    headerMount.insertAdjacentElement("afterend", strip);
    headerMount.setAttribute(DETAIL_STRIP_MARK, "1");
  }

  if (!item) return; // no high-confidence item match → no modifier deltas

  for (const node of findModifierNodes()) {
    if (node.root.getAttribute(MARK) === "1") continue;
    node.root.setAttribute(MARK, "1");

    const modifier = matchModifier(node.name, item.modifiers || []);
    if (!modifier) continue; // unknown/low-confidence modifier → no delta

    const delta = createModifierDelta(modifier);
    if (delta) node.mountEl.insertAdjacentElement("beforeend", delta);
  }
}

async function boot() {
  const paint = () => (isItemDetailPage() ? paintDetail() : paintList());
  await paint().catch(() => {});
  const obs = new MutationObserver(() => {
    paint().catch(() => {});
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

boot().catch(() => {});
