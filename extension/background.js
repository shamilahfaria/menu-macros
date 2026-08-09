import { getBundledPacks, getMeta, savePacks } from "./lib/storage.js";

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const packs = await getBundledPacks();
    const meta = await getMeta();
    if (!meta.lastRefreshAt) {
      await savePacks(packs, { lastRefreshAt: null, lastRefreshOk: null });
    }
  } catch {
    // Installation should not fail if pack seeding is unavailable.
  }
});
