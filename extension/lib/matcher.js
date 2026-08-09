const FILLER = new Set(["the", "a", "an", "and", "with", "w"]);

export function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/w\//g, " with ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFiller(normalized) {
  return normalized
    .split(" ")
    .filter((tok) => tok && !FILLER.has(tok))
    .join(" ");
}

function candidatesFor(entry) {
  return [entry.canonicalName, ...(entry.aliases || [])].map(normalizeName);
}

function matchInList(name, list) {
  const needle = normalizeName(name);
  if (!needle) return null;

  const exact = [];
  for (const entry of list) {
    if (candidatesFor(entry).includes(needle)) exact.push(entry);
  }
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const strippedNeedle = stripFiller(needle);
  const strippedHits = [];
  for (const entry of list) {
    const opts = candidatesFor(entry).map(stripFiller);
    if (opts.includes(strippedNeedle)) strippedHits.push(entry);
  }
  if (strippedHits.length === 1) return strippedHits[0];
  return null;
}

export function matchItem(name, items) {
  return matchInList(name, items || []);
}

export function matchModifier(name, modifiers) {
  return matchInList(name, modifiers || []);
}
