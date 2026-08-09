// DoorDash DOM adapter
// ---------------------------------------------------------------------------
// BLOCKER (2026-08-08): a live Mendocino Farms DoorDash store page could not
// be reached from this environment — browser tooling had no usable tab and
// a direct fetch of doordash.com timed out (likely bot/geo protection).
// The selectors below are therefore a *defensive heuristic*, not a
// live-verified lock. They combine:
//   - `[data-anchor-id*="MenuItem"]` — a menu-item region naming convention
//     independently observed by third-party DoorDash DOM-inspection tooling
//     (browse.sh DoorDash extract-menu skill, checked 2026-08-08).
//   - Hashed-class / data-testid substring fallbacks, since DoorDash rotates
//     build-hashed class names across deploys and stable attributes are
//     preferred when present.
// Every query is wrapped so a selector miss degrades to an empty node list
// rather than throwing into the host page. Re-verify against a live store
// page (DevTools inspection per task-6-brief.md) and update the comments
// with the new discovery date before relying on this in production; see
// docs/manual-qa.md for the outstanding verification checklist.
// ---------------------------------------------------------------------------

const PRICE_PATTERN = /\$\s?\d/;
const ADD_TO_ORDER_PATTERN = /add \d+ item|add to (cart|order)/i;

function textOf(el) {
  return (el?.textContent || "").trim();
}

function safeQueryAll(doc, selector) {
  try {
    return [...doc.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

function safeQuery(root, selector) {
  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

export function getStoreHaystack(doc = document) {
  try {
    const title = textOf(doc.querySelector("h1"));
    const docTitle = doc.title || "";
    const pathname = doc.location?.pathname
      ?? (typeof location !== "undefined" ? location.pathname : "");
    return `${title} ${docTitle} ${pathname}`;
  } catch {
    return "";
  }
}

function candidateRoots(doc) {
  const anchored = safeQueryAll(doc, '[data-anchor-id*="MenuItem"]');
  if (anchored.length) return anchored;
  return safeQueryAll(doc, '[class*="MenuItem"], [data-testid*="MenuItem"]');
}

function findNameEl(root) {
  return (
    safeQuery(root, "h3, h2")
    || safeQuery(root, "[data-testid*='name'], [data-testid*='Name']")
    || safeQuery(root, "[class*='ItemName'], [class*='itemName']")
    || safeQuery(root, "span")
  );
}

function findPriceEl(root) {
  const candidates = safeQueryAll(
    root,
    "[data-testid*='price'], [data-testid*='Price'], [class*='Price'], [class*='price'], span",
  );
  return candidates.find((el) => PRICE_PATTERN.test(textOf(el))) || null;
}

export function findMenuItemNodes(doc = document) {
  const nodes = [];
  try {
    for (const root of candidateRoots(doc)) {
      const nameEl = findNameEl(root);
      const name = textOf(nameEl);
      if (!name || name.length < 2) continue;

      const priceEl = findPriceEl(root);
      const mountEl = nameEl.parentElement || root;
      nodes.push({ root, name, priceEl, mountEl });
    }
  } catch {
    return [];
  }
  return nodes;
}

export function isItemDetailPage(doc = document) {
  try {
    const modal = safeQuery(doc, '[role="dialog"], [aria-modal="true"]');
    if (!modal) return false;
    return ADD_TO_ORDER_PATTERN.test(textOf(modal));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Task 7 (2026-08-08): item detail + modifier discovery. Same blocker as
// above — no live DoorDash session was reachable, so these selectors are
// defensive heuristics (not live-verified) using the same fallback strategy
// as `findMenuItemNodes`: prefer stable `data-anchor-id`/`data-testid`
// substrings, fall back to hashed-class substrings, and finally fall back to
// generic DOM shape (headings for the name; checkbox/radio `<label>`s for
// modifier options). Re-verify against a live item-detail modal and update
// this comment; see docs/manual-qa.md.
// ---------------------------------------------------------------------------

function findModalRoot(doc) {
  return safeQuery(doc, '[role="dialog"], [aria-modal="true"]') || doc;
}

function detailNameCandidates(scope) {
  return [
    ...safeQueryAll(scope, "h1, h2"),
    ...safeQueryAll(scope, "[data-testid*='ItemName'], [data-testid*='itemName']"),
    ...safeQueryAll(scope, "[class*='ItemName'], [class*='itemName']"),
  ];
}

export function findDetailNameEl(doc = document) {
  try {
    const scope = findModalRoot(doc);
    for (const el of detailNameCandidates(scope)) {
      if (textOf(el).length >= 2) return el;
    }
    return null;
  } catch {
    return null;
  }
}

export function findDetailItemName(doc = document) {
  const el = findDetailNameEl(doc);
  return el ? textOf(el) : null;
}

const MODIFIER_ROW_SELECTORS = [
  '[data-anchor-id*="OptionRow"], [data-anchor-id*="Option"]',
  "[data-testid*='OptionRow'], [data-testid*='ModifierOption'], [data-testid*='Option']",
  "[class*='OptionRow'], [class*='ModifierOption'], [class*='OptionItem']",
];

function checkboxLabelRoots(scope) {
  return safeQueryAll(scope, "label").filter((label) =>
    safeQuery(label, 'input[type="checkbox"], input[type="radio"]'));
}

function modifierRowRoots(scope) {
  for (const selector of MODIFIER_ROW_SELECTORS) {
    const found = safeQueryAll(scope, selector);
    if (found.length) return found;
  }
  return checkboxLabelRoots(scope);
}

function findModifierNameEl(root) {
  return (
    safeQuery(root, "[data-testid*='label'], [data-testid*='Label']")
    || safeQuery(root, "[class*='OptionName'], [class*='Label'], [class*='label']")
    || safeQuery(root, "span")
  );
}

function stripTrailingPrice(text) {
  return text.replace(/\+?\s?\$\s?\d+(\.\d+)?\s*$/, "").trim();
}

export function findModifierNodes(doc = document) {
  const nodes = [];
  try {
    const scope = findModalRoot(doc);
    for (const root of modifierRowRoots(scope)) {
      const nameEl = findModifierNameEl(root);
      const name = stripTrailingPrice(textOf(nameEl));
      if (!name || name.length < 2) continue;

      const mountEl = nameEl.parentElement || root;
      nodes.push({ root, name, mountEl });
    }
  } catch {
    return [];
  }
  return nodes;
}
