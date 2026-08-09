const REQUIRED_ITEM_NUMBERS = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "sodiumMg",
  "sugarG",
  "fiberG",
];

function isNonEmptyStringArray(value) {
  return Array.isArray(value)
    && value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

export function validatePack(pack) {
  if (!pack || typeof pack !== "object") return { ok: false, error: "pack must be object" };
  if (typeof pack.id !== "string" || !pack.id) return { ok: false, error: "id required" };
  if (typeof pack.displayName !== "string") return { ok: false, error: "displayName required" };
  if (!Number.isInteger(pack.version)) return { ok: false, error: "version int required" };
  if (!isNonEmptyStringArray(pack.matchHints) || pack.matchHints.length === 0) {
    return { ok: false, error: "matchHints required" };
  }
  if (!pack.source || typeof pack.source.url !== "string") {
    return { ok: false, error: "source.url required" };
  }
  if (typeof pack.updatedAt !== "string") return { ok: false, error: "updatedAt required" };
  if (!Array.isArray(pack.items)) return { ok: false, error: "items required" };

  for (const item of pack.items) {
    if (typeof item.id !== "string" || typeof item.canonicalName !== "string") {
      return { ok: false, error: "item id/canonicalName required" };
    }
    if (!isNonEmptyStringArray(item.aliases)) {
      return { ok: false, error: "aliases must contain non-empty strings" };
    }
    for (const key of REQUIRED_ITEM_NUMBERS) {
      if (typeof item[key] !== "number") return { ok: false, error: `item.${key} number required` };
    }
    if (item.extras != null) {
      if (!Array.isArray(item.extras)) return { ok: false, error: "extras must be array" };
      for (const extra of item.extras) {
        if (typeof extra.label !== "string" || typeof extra.value !== "string") {
          return { ok: false, error: "extras entries need label/value strings" };
        }
      }
    }
    if (item.modifiers != null) {
      if (!Array.isArray(item.modifiers)) return { ok: false, error: "modifiers must be array" };
      for (const mod of item.modifiers) {
        if (typeof mod.canonicalName !== "string") {
          return { ok: false, error: "modifier.canonicalName required" };
        }
        if (!isNonEmptyStringArray(mod.aliases)) {
          return { ok: false, error: "modifier.aliases must contain non-empty strings" };
        }
        if (!mod.deltas || typeof mod.deltas !== "object" || Array.isArray(mod.deltas)) {
          return { ok: false, error: "modifier.deltas required" };
        }
        if (!Object.values(mod.deltas).every(Number.isFinite)) {
          return { ok: false, error: "modifier.deltas values must be finite numbers" };
        }
      }
    }
  }
  return { ok: true, pack };
}

export function findPackForStore(packs, haystack) {
  const text = (haystack || "").toLowerCase();
  if (!text) return null;
  for (const pack of packs) {
    for (const hint of pack.matchHints) {
      if (text.includes(String(hint).toLowerCase())) return pack;
    }
  }
  return null;
}
