import { getPacks } from "../lib/storage.js";
import { findPackForStore } from "../lib/pack.js";
import { matchItem } from "../lib/matcher.js";
import { getStoreHaystack, findMenuItemNodes, isItemDetailPage } from "./doordash.js";
import { createNutritionStrip } from "./ui.js";

const MARK = "data-mm-painted";

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

async function boot() {
  if (isItemDetailPage()) return; // Task 7
  await paintList();
  const obs = new MutationObserver(() => {
    paintList().catch(() => {});
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

boot().catch(() => {});
