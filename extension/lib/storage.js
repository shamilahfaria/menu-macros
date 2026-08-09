import { validatePack } from "./pack.js";

export const STORAGE_KEYS = { packs: "packs", meta: "meta" };

export function pickPacks(storedPacks, bundledPacks) {
  const byId = new Map();

  for (const pack of bundledPacks || []) {
    const result = validatePack(pack);
    if (result.ok) byId.set(result.pack.id, result.pack);
  }

  for (const pack of storedPacks || []) {
    const result = validatePack(pack);
    if (!result.ok) continue;

    const current = byId.get(result.pack.id);
    if (!current || result.pack.version >= current.version) {
      byId.set(result.pack.id, result.pack);
    }
  }

  return [...byId.values()];
}

export async function getBundledPacks() {
  const url = chrome.runtime.getURL("packs/mendocino-farms.json");
  const response = await fetch(url);
  const json = await response.json();
  const result = validatePack(json);
  if (!result.ok) throw new Error(result.error);
  return [result.pack];
}

export async function getPacks() {
  const bundledPacks = await getBundledPacks();
  const data = await chrome.storage.local.get([STORAGE_KEYS.packs]);
  return pickPacks(data[STORAGE_KEYS.packs], bundledPacks);
}

export async function savePacks(packs, meta) {
  const validPacks = [];
  for (const pack of packs) {
    const result = validatePack(pack);
    if (result.ok) validPacks.push(result.pack);
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.packs]: validPacks,
    [STORAGE_KEYS.meta]: meta || {},
  });
}

export async function getMeta() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.meta]);
  return data[STORAGE_KEYS.meta] || {};
}
