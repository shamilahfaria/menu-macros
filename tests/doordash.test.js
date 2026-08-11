import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  findDetailNameEl,
  findMenuItemNodes,
  findModifierNodes,
  getStoreHaystack,
  isItemDetailPage,
  resolveStripMount,
} from "../extension/content/doordash.js";

const textOf = (el) => (el?.textContent || "").trim() || null;

function docFrom(html, url = "https://www.doordash.com/store/mendocino-farms-123/") {
  return new JSDOM(html, { url }).window.document;
}

test("findMenuItemNodes reads name/price from MenuItem cards", () => {
  const doc = docFrom(`
    <div data-anchor-id="MenuItem" data-testid="MenuItem" data-item-id="901">
      <h3>The Farm Club</h3>
      <span data-testid="StoreMenuItemPrice">$14.50</span>
    </div>
  `);

  const nodes = findMenuItemNodes(doc);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "The Farm Club");
  assert.equal(nodes[0].priceEl.textContent, "$14.50");
});

test("findMenuItemNodes reads featured carousel image-action cards", () => {
  const doc = docFrom(`
    <div data-testid="image-action-card-container">
      <span>The Farm Club</span>
      <span>$16.74</span>
      <span>96% (32)</span>
    </div>
  `);

  const nodes = findMenuItemNodes(doc);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "The Farm Club");
  assert.match(nodes[0].priceEl.textContent, /\$16\.74/);
});

// Mirrors the structure measured on the live store page: PhotoItemCard is a
// block stack of image / title / description / price row, the image sits in
// its own position:relative wrapper, and the price lives inside nested
// nowrap flex rows alongside the rating.
const LIVE_CARD = `
  <div data-testid="MenuItem" id="item" style="position: relative">
    <div data-testid="ThemingWrapper">
      <div data-testid="PhotoItemCard">
        <div><div><div id="photo" style="position: relative"><img src="cobb.jpg"></div></div></div>
        <div><div style="display: flex"><h3>Golden State Cobb</h3></div></div>
        <div><span id="desc">Organic romaine and grilled chicken</span></div>
        <div id="pricerow" style="display: flex">
          <div><div style="display: flex">
            <span data-testid="StoreMenuItemPrice">$17.94</span>
            <span>•</span><span id="rating">97% (89)</span>
          </div></div>
        </div>
      </div>
    </div>
  </div>
`;

test("findMenuItemNodes anchors the list band to the card photo, never the price row", () => {
  const doc = docFrom(LIVE_CARD);

  const nodes = findMenuItemNodes(doc);
  assert.equal(nodes[0].stripMount.type, "append");
  assert.equal(nodes[0].stripMount.el.id, "photo");
});

test("resolveStripMount anchors to the photo box on side-image cards", () => {
  // Wide category rows put the photo in a right-hand column wrapped in purely
  // static boxes, and the <picture> in between reports a degenerate height.
  // Measured on the live page: card 464x156, photo 156x156 at x=308.
  const doc = docFrom(`
    <div data-testid="MenuItem" id="item" style="position: relative">
      <div id="text"><h3>Pork Belly Banh Mi</h3>
        <span data-testid="StoreMenuItemPrice">$17.94</span></div>
      <div id="photobox"><picture id="pic"><img id="pic-img" src="banh.jpg"></picture></div>
    </div>
  `);
  const box = (el, x, w, h) => {
    el.getBoundingClientRect = () => ({ x, left: x, width: w, height: h, top: 0, bottom: h, right: x + w });
  };
  box(doc.getElementById("item"), 0, 464, 156);
  box(doc.getElementById("text"), 0, 308, 156);
  box(doc.getElementById("photobox"), 308, 156, 156);
  box(doc.getElementById("pic"), 308, 156, 19);
  box(doc.getElementById("pic-img"), 308, 156, 156);

  const root = doc.getElementById("item");
  const mount = resolveStripMount(root, root.querySelector("[data-testid]"));

  assert.equal(mount.type, "append");
  assert.equal(mount.el.id, "photobox", "band anchors to the photo, not the whole card");
  assert.equal(mount.ensureRelative, true, "static photo box must become a containing block");
});

test("resolveStripMount escapes the nowrap flex row on cards with no photo", () => {
  // Inserting inside DoorDash's price row squeezes the price to zero width,
  // so the fallback has to climb out to the first block-level ancestor.
  const doc = docFrom(LIVE_CARD.replace('<img src="cobb.jpg">', ""));
  const root = doc.getElementById("item");
  const price = root.querySelector('[data-testid="StoreMenuItemPrice"]');
  const name = root.querySelector("h3");

  const mount = resolveStripMount(root, price);
  assert.equal(mount.type, "after");
  assert.equal(
    mount.el.contains(price),
    true,
    "the resolved node is an ancestor of the price, so the strip lands below it",
  );
  assert.equal(
    doc.defaultView.getComputedStyle(mount.el.parentElement).display,
    "block",
    "strip lands in block flow, never inside a nowrap flex row",
  );
});

test("findMenuItemNodes keeps every featured carousel card, not just the first", () => {
  const doc = docFrom(`
    <div data-testid="image-action-card-container">
      <span>The Farm Club</span><span>$16.74</span>
    </div>
    <div data-testid="image-action-card-container">
      <span>Avocado & Quinoa Superfood Ensalada</span><span>$13.95</span>
    </div>
    <div data-testid="image-action-card-container">
      <span>Not So Fried Chicken</span><span>$14.25</span>
    </div>
  `);

  const nodes = findMenuItemNodes(doc);
  assert.equal(nodes.length, 3);
  assert.deepEqual(nodes.map((node) => node.name), [
    "The Farm Club",
    "Avocado & Quinoa Superfood Ensalada",
    "Not So Fried Chicken",
  ]);
});

test("findMenuItemNodes falls back to hashed-class heuristics when anchors are absent", () => {
  const doc = docFrom(`
    <div class="style_MenuItem__ab12">
      <span data-testid="itemName">Avocado & Quinoa Superfood Ensalada</span>
      <span class="style_Price__zz9">$13.95</span>
    </div>
  `);

  const nodes = findMenuItemNodes(doc);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "Avocado & Quinoa Superfood Ensalada");
  assert.match(nodes[0].priceEl.textContent, /\$13\.95/);
});

test("findMenuItemNodes skips cards without a usable name and returns [] when nothing matches", () => {
  const emptyName = docFrom(`<div data-anchor-id="MenuItem-1"><span></span></div>`);
  assert.deepEqual(findMenuItemNodes(emptyName), []);

  const noCards = docFrom(`<main><h1>Mendocino Farms</h1></main>`);
  assert.deepEqual(findMenuItemNodes(noCards), []);
});

test("findMenuItemNodes never throws, even against a broken document", () => {
  const broken = {
    querySelectorAll() {
      throw new Error("boom");
    },
  };
  assert.deepEqual(findMenuItemNodes(broken), []);
});

test("getStoreHaystack combines h1 text, doc title, and pathname", () => {
  const doc = docFrom(
    `<html><head><title>Mendocino Farms - Downtown | DoorDash</title></head><body><h1>Mendocino Farms</h1></body></html>`,
    "https://www.doordash.com/store/mendocino-farms-123/",
  );

  const haystack = getStoreHaystack(doc);
  assert.match(haystack, /Mendocino Farms/);
  assert.match(haystack, /DoorDash/);
  assert.match(haystack, /\/store\/mendocino-farms-123\//);
});

test("getStoreHaystack never throws against a broken document", () => {
  const broken = {
    querySelector() {
      throw new Error("boom");
    },
  };
  assert.equal(getStoreHaystack(broken), "");
});

test("isItemDetailPage detects an open item-customization dialog", () => {
  const withModal = docFrom(`
    <div role="dialog">
      <h2>The Farm Club</h2>
      <button>Add to order</button>
    </div>
  `);
  assert.equal(isItemDetailPage(withModal), true);

  const unrelatedModal = docFrom(`<div role="dialog"><p>Sign in</p></div>`);
  assert.equal(isItemDetailPage(unrelatedModal), false);

  const noModal = docFrom(`<main><h1>Mendocino Farms</h1></main>`);
  assert.equal(isItemDetailPage(noModal), false);
});

test("findDetailNameEl reads the heading inside an open item-detail dialog", () => {
  const doc = docFrom(`
    <div role="dialog">
      <h1>The Farm Club</h1>
      <button>Add to order</button>
    </div>
  `);
  assert.equal(textOf(findDetailNameEl(doc)), "The Farm Club");
});

test("findDetailNameEl falls back to data-testid/class heuristics without h1/h2", () => {
  const doc = docFrom(`
    <div role="dialog">
      <span data-testid="ItemName">Avocado & Quinoa Superfood Ensalada</span>
      <button>Add to order</button>
    </div>
  `);
  assert.equal(textOf(findDetailNameEl(doc)), "Avocado & Quinoa Superfood Ensalada");
});

test("findDetailNameEl returns null when no name element is found", () => {
  const doc = docFrom(`<div role="dialog"><button>Add to order</button></div>`);
  assert.equal(textOf(findDetailNameEl(doc)), null);
  assert.equal(findDetailNameEl({ querySelector() { throw new Error("boom"); } }), null);
});

// Mirrors a real Chicken Pesto Caprese modal captured 2026-08-11: no option
// testids or classes anywhere, and the <label> is a sibling of its <input>.
// The option name is the row's first line; price and notes follow beneath.
const MODIFIER_MODAL = `
  <div role="dialog">
    <h1>Chicken Pesto Caprese</h1>
    <button>Add 1 item to order</button>
    <div class="ToggleContainer-sc-a">
      <div class="StyledInlineChildren-sc-b">
        <div class="InputContainer-sc-c"><input type="radio" id="Toggle-:rv:" /></div>
        <label for="Toggle-:rv:">Panini-Pressed Ciabatta (Vegan)</label>
      </div>
    </div>
    <div class="ToggleContainer-sc-a">
      <div class="StyledInlineChildren-sc-b">
        <div class="InputContainer-sc-c"><input type="checkbox" id="Toggle-:r14:" /></div>
        <label for="Toggle-:r14:">Extra Chicken+$2.36</label>
      </div>
    </div>
  </div>
`;

test("findModifierNodes reads option rows from the toggle controls", () => {
  const nodes = findModifierNodes(docFrom(MODIFIER_MODAL));

  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].name, "Panini-Pressed Ciabatta (Vegan)");
  assert.equal(nodes[1].name, "Extra Chicken", "run-together price is stripped");
});

test("findModifierNodes handles a label that is not an ancestor of its input", () => {
  // The previous implementation looked for label:has(input) and so found
  // nothing at all on the real page.
  const doc = docFrom(MODIFIER_MODAL);
  assert.equal(
    [...doc.querySelectorAll("label")].filter((l) => l.querySelector("input")).length,
    0,
    "fixture reproduces the sibling label/input structure",
  );
  assert.equal(findModifierNodes(doc).length, 2);
});

test("findModifierNodes skips rows without a usable name and never throws", () => {
  const emptyRow = docFrom(`
    <div role="dialog"><div><input type="checkbox" /><span></span></div></div>
  `);
  assert.deepEqual(findModifierNodes(emptyRow), []);

  assert.deepEqual(findModifierNodes({ querySelector() { throw new Error("boom"); } }), []);
});
