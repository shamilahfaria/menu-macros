import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  findDetailItemName,
  findMenuItemNodes,
  findModifierNodes,
  getStoreHaystack,
  isItemDetailPage,
} from "../extension/content/doordash.js";

function docFrom(html, url = "https://www.doordash.com/store/mendocino-farms-123/") {
  return new JSDOM(html, { url }).window.document;
}

test("findMenuItemNodes reads name/price from data-anchor-id MenuItem regions", () => {
  const doc = docFrom(`
    <div data-anchor-id="MenuItem-901">
      <h3>The Farm Club</h3>
      <span>$14.50</span>
    </div>
  `);

  const nodes = findMenuItemNodes(doc);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].name, "The Farm Club");
  assert.equal(nodes[0].priceEl.textContent, "$14.50");
  assert.equal(nodes[0].mountEl.tagName, "DIV");
  assert.equal(nodes[0].mountEl, nodes[0].root);
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

test("findDetailItemName reads the heading inside an open item-detail dialog", () => {
  const doc = docFrom(`
    <div role="dialog">
      <h1>The Farm Club</h1>
      <button>Add to order</button>
    </div>
  `);
  assert.equal(findDetailItemName(doc), "The Farm Club");
});

test("findDetailItemName falls back to data-testid/class heuristics without h1/h2", () => {
  const doc = docFrom(`
    <div role="dialog">
      <span data-testid="ItemName">Avocado & Quinoa Superfood Ensalada</span>
      <button>Add to order</button>
    </div>
  `);
  assert.equal(findDetailItemName(doc), "Avocado & Quinoa Superfood Ensalada");
});

test("findDetailItemName returns null when no name element is found", () => {
  const doc = docFrom(`<div role="dialog"><button>Add to order</button></div>`);
  assert.equal(findDetailItemName(doc), null);
  assert.equal(findDetailItemName({ querySelector() { throw new Error("boom"); } }), null);
});

test("findModifierNodes reads option rows via data-testid/class heuristics", () => {
  const doc = docFrom(`
    <div role="dialog">
      <h1>The Farm Club</h1>
      <div data-testid="ModifierOptionRow">
        <span data-testid="label">Add Chicken</span>
        <span>+$1.50</span>
      </div>
      <div data-testid="ModifierOptionRow">
        <span data-testid="label">Add Avocado</span>
        <span>+$1.75</span>
      </div>
    </div>
  `);

  const nodes = findModifierNodes(doc);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].name, "Add Chicken");
  assert.equal(nodes[1].name, "Add Avocado");
  assert.equal(nodes[0].mountEl.tagName, "DIV");
});

test("findModifierNodes falls back to checkbox/radio labels when no row selectors match", () => {
  const doc = docFrom(`
    <div role="dialog">
      <h1>The Farm Club</h1>
      <label><input type="checkbox" /><span>Add Chicken</span> <span>+$1.50</span></label>
      <label><input type="radio" /><span>No dressing</span></label>
    </div>
  `);

  const nodes = findModifierNodes(doc);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].name, "Add Chicken");
  assert.equal(nodes[1].name, "No dressing");
});

test("findModifierNodes skips rows without a usable name and never throws", () => {
  const emptyRow = docFrom(`
    <div role="dialog"><div data-testid="ModifierOptionRow"><span></span></div></div>
  `);
  assert.deepEqual(findModifierNodes(emptyRow), []);

  assert.deepEqual(findModifierNodes({ querySelector() { throw new Error("boom"); } }), []);
});
