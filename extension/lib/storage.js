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

const PACK_INDEX_PATH = "packs/index.json";

async function fetchJson(path) {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) throw new Error(`could not load ${path}`);
  return response.json();
}

// The index is generated at build time from the contents of packs/ — adding a
// restaurant means adding one file, not editing this loader. One malformed
// pack is skipped rather than taking every other restaurant down with it.
export async function getBundledPacks() {
  const index = await fetchJson(PACK_INDEX_PATH);
  const files = Array.isArray(index?.packs) ? index.packs : [];

  const packs = [];
  for (const file of files) {
    try {
      const result = validatePack(await fetchJson(`packs/${file}`));
      if (result.ok) packs.push(result.pack);
    } catch {
      // Skip an unreadable pack; the rest of the restaurants still load.
    }
  }
  return packs;
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
