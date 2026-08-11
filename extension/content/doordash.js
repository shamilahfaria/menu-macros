// DoorDash DOM adapter
// ---------------------------------------------------------------------------
// Verified 2026-08-09 on Mendocino Farms (Los Angeles store page):
//   - Featured carousel cards: [data-testid="image-action-card-container"]
//     with name in innerText line 1 and price on following line.
//   - Category list cards: [data-testid="MenuItem"] / data-anchor-id="MenuItem"
//     with name in h3 and price in [data-testid="StoreMenuItemPrice"].
//   - List sections lazy-load on scroll; MutationObserver must re-run.
// Every query is wrapped so a miss degrades to [] rather than throwing.
// ---------------------------------------------------------------------------

const PRICE_PATTERN = /\$\s?\d+(?:\.\d{2})?/;
const ADD_TO_ORDER_PATTERN = /add \d+ item|add to (cart|order)/i;
const SKIP_CARD_LINE = /^(?:\$\s?\d|•|\d+%|\(\d+\))/;

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

function cardLines(root) {
  return (root.innerText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function nameFromCardLines(lines) {
  return lines.find((line) =>
    line.length >= 2
    && !SKIP_CARD_LINE.test(line)
    && !PRICE_PATTERN.test(line)) || "";
}

function rootDedupeKey(root) {
  const itemId = root.getAttribute("data-item-id");
  if (itemId) return `id:${itemId}`;

  const lines = cardLines(root);
  const name = nameFromCardLines(lines);
  const priceLine = lines.find((line) => PRICE_PATTERN.test(line)) || "";
  if (name) return `name:${name.toLowerCase()}|${priceLine}`;

  return `node:${textOf(root).slice(0, 120)}`;
}

function candidateRoots(doc) {
  const menuItems = safeQueryAll(
    doc,
    '[data-anchor-id="MenuItem"], [data-testid="MenuItem"]',
  );

  const featured = safeQueryAll(doc, '[data-testid="image-action-card-container"]')
    .filter((el) => !el.closest('[data-testid="MenuItem"]'));

  const fallback = menuItems.length || featured.length
    ? []
    : safeQueryAll(doc, '[class*="MenuItem"], [data-testid*="MenuItem"]');

  const seen = new Set();
  const roots = [];

  for (const root of [...menuItems, ...featured, ...fallback]) {
    const key = rootDedupeKey(root);
    if (seen.has(key)) continue;
    seen.add(key);
    roots.push(root);
  }

  return roots;
}

function findNameEl(root) {
  for (const selector of [
    "h3",
    "h2",
    "[data-testid*='name']",
    "[data-testid*='Name']",
    "[class*='ItemName']",
    "[class*='itemName']",
  ]) {
    const el = safeQuery(root, selector);
    if (textOf(el).length >= 2) return el;
  }

  for (const span of safeQueryAll(root, "span")) {
    const text = textOf(span);
    if (text.length >= 2 && !PRICE_PATTERN.test(text) && !SKIP_CARD_LINE.test(text)) {
      return span;
    }
  }

  const lines = cardLines(root);
  const parsed = nameFromCardLines(lines);
  if (!parsed) return null;

  // Synthetic element so callers can still use parentElement for mount.
  return { textContent: parsed, parentElement: root };
}

function isElement(el) {
  return Boolean(el && typeof el.insertAdjacentElement === "function");
}

function viewOf(root) {
  return root.ownerDocument?.defaultView || null;
}

// Non-rendering documents report an empty string rather than "static", so an
// unstyled element would otherwise look positioned.
function isPositioned(view, el) {
  const { position } = view.getComputedStyle(el);
  return Boolean(position) && position !== "static";
}

// The band overlays the card photo, so it mounts into the photo's positioned
// box. Appending there keeps the strip out of normal flow, which is what the
// virtualized grid requires (see ui.js).
//
// Featured carousel tiles render the photo without an <img> until it loads, so
// when there is no image we fall back to geometry: the first positioned box
// flush with the card's top edge, wide as the card but clearly shorter than it
// (a full-height match is the card wrapper, not the photo).
const PHOTO_MIN_HEIGHT_RATIO = 0.25;
const PHOTO_MAX_HEIGHT_RATIO = 0.8;
const PHOTO_MIN_WIDTH_RATIO = 0.9;

// Walks up from the image while the box still matches the photo, and stops as
// soon as it widens into the card. Side-image cards (wide category rows) wrap
// the photo in purely static boxes, so the closest photo-sized box is returned
// with a flag asking the mount step to make it a containing block. The <picture>
// element in between reports a degenerate height, hence the width-based stop.
function findImageHost(root, img, view) {
  const imageBox = img.getBoundingClientRect();

  // No geometry yet (not laid out, or a non-rendering document): fall back to
  // the nearest positioned ancestor, which is what the photo box normally is.
  if (!imageBox.width) {
    for (let el = img.parentElement; el && el !== root; el = el.parentElement) {
      if (isPositioned(view, el)) {
        return { el, ensureRelative: false };
      }
    }
    return null;
  }

  let best = null;
  for (let el = img.parentElement; el && el !== root; el = el.parentElement) {
    const box = el.getBoundingClientRect();
    if (box.width > imageBox.width + 4) break;
    if (box.height + 1 < imageBox.height) continue;

    best = el;
    if (isPositioned(view, el)) {
      return { el, ensureRelative: false };
    }
  }
  return best ? { el: best, ensureRelative: true } : null;
}

function findPhotoHost(root) {
  const view = viewOf(root);
  if (!view) return null;

  const img = safeQuery(root, "img");
  if (img) {
    const host = findImageHost(root, img, view);
    if (host) return host;
  }

  const cardBox = root.getBoundingClientRect();
  if (!cardBox.height) return null;

  for (const el of safeQueryAll(root, "*")) {
    if (el.classList?.contains("mm-root")) continue;
    if (!isPositioned(view, el)) continue;

    const box = el.getBoundingClientRect();
    if (
      Math.abs(box.top - cardBox.top) <= 2
      && box.width >= cardBox.width * PHOTO_MIN_WIDTH_RATIO
      && box.height >= cardBox.height * PHOTO_MIN_HEIGHT_RATIO
      && box.height <= cardBox.height * PHOTO_MAX_HEIGHT_RATIO
    ) {
      return { el, ensureRelative: false };
    }
  }
  return null;
}

// Fallback for cards with no photo. DoorDash renders the price inside a
// nowrap flex row; inserting there squeezes the price to zero width, so climb
// out of the flex rows first and mount as a block-level sibling below them.
function findFlowMount(root, priceEl) {
  const view = viewOf(root);
  if (!isElement(priceEl) || !view) return null;

  let el = priceEl;
  while (
    el.parentElement
    && el.parentElement !== root
    && view.getComputedStyle(el.parentElement).display !== "block"
  ) {
    el = el.parentElement;
  }
  return el;
}

export function resolveStripMount(root, priceEl) {
  const photo = findPhotoHost(root);
  if (photo) {
    return { type: "append", el: photo.el, ensureRelative: photo.ensureRelative };
  }

  // ponytail: imageless cards get an in-flow strip, which is correct on
  // ordinary sections but can still overlap on the fixed-pitch virtualized
  // grid. Upgrade to a synthetic photo-less anchor only if such cards show up
  // there in practice.
  const flow = findFlowMount(root, priceEl);
  if (isElement(flow) && flow !== root) {
    return { type: "after", el: flow };
  }

  return { type: "after", el: root };
}

function findPriceEl(root) {
  const priceTestId = safeQuery(root, '[data-testid="StoreMenuItemPrice"]');
  if (priceTestId && PRICE_PATTERN.test(textOf(priceTestId))) return priceTestId;

  const candidates = safeQueryAll(
    root,
    "[data-testid*='price'], [data-testid*='Price'], [class*='Price'], [class*='price'], span, div",
  );
  const match = candidates.find((el) => PRICE_PATTERN.test(textOf(el)));
  if (match) return match;

  const line = cardLines(root).find((entry) => PRICE_PATTERN.test(entry));
  if (!line) return null;
  return { textContent: line.match(PRICE_PATTERN)[0], parentElement: root };
}

export function findMenuItemNodes(doc = document) {
  const nodes = [];
  try {
    for (const root of candidateRoots(doc)) {
      const nameEl = findNameEl(root);
      const name = textOf(nameEl);
      if (!name || name.length < 2) continue;

      const priceEl = findPriceEl(root);
      nodes.push({
        root,
        name,
        priceEl,
        stripMount: resolveStripMount(root, priceEl),
      });
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

// Item detail + modifier discovery (same defensive strategy as list cards).

function findModalRoot(doc) {
  return safeQuery(doc, '[role="dialog"], [aria-modal="true"]') || doc;
}

const DETAIL_NAME_SELECTOR = "h1, h2, [data-testid*='ItemName'], [data-testid*='itemName'],"
  + " [class*='ItemName'], [class*='itemName']";

export function findDetailNameEl(doc = document) {
  try {
    const scope = findModalRoot(doc);
    for (const el of safeQueryAll(scope, DETAIL_NAME_SELECTOR)) {
      if (textOf(el).length >= 2) return el;
    }
    return null;
  } catch {
    return null;
  }
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
  return text.replace(/\+?\s?\$\s?\d+(?:\.\d{2})?\s*$/, "").trim();
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
