import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { paintDetailStrip, paintModifierDeltas } from "../extension/content/content.js";

const item = {
  calories: 760,
  proteinG: 40,
  carbsG: 69,
  fatG: 34,
  sodiumMg: 1620,
  sugarG: 7,
  fiberG: 6,
  modifiers: [
    { canonicalName: "Add Chicken", aliases: ["Chicken"], deltas: { calories: 120, proteinG: 20 } },
  ],
};

function useDom(html) {
  const dom = new JSDOM(html, { url: "https://www.doordash.com/store/mendocino-farms-123/" });
  globalThis.document = dom.window.document;
  return dom.window.document;
}

test("paintDetailStrip replaces a stale unavailable strip once the item match resolves", () => {
  const doc = useDom(`<h1>The Farm Club</h1>`);
  const headerMount = doc.querySelector("h1");

  paintDetailStrip(headerMount, null);
  const firstStrip = headerMount.nextElementSibling;
  assert.ok(firstStrip, "strip mounted on first (unavailable) pass");
  assert.equal(headerMount.getAttribute("data-mm-detail-strip"), "0");
  assert.match(firstStrip.shadowRoot.innerHTML, /Nutrition unavailable/);

  paintDetailStrip(headerMount, null);
  assert.equal(headerMount.nextElementSibling, firstStrip, "no re-render while state is unchanged");

  paintDetailStrip(headerMount, item);
  const secondStrip = headerMount.nextElementSibling;
  assert.notEqual(secondStrip, firstStrip, "stale unavailable strip is replaced once the item matches");
  assert.equal(headerMount.getAttribute("data-mm-detail-strip"), "1");
  assert.match(secondStrip.shadowRoot.innerHTML, /760 cal/);
  assert.equal(doc.querySelectorAll(".mm-root").length, 1, "old strip is removed, not duplicated");

  paintDetailStrip(headerMount, item);
  assert.equal(headerMount.nextElementSibling, secondStrip, "matched strip is stable across later passes");
});

test("paintDetailStrip mounts directly in the matched state when resolved on the first pass", () => {
  const doc = useDom(`<h1>The Farm Club</h1>`);
  const headerMount = doc.querySelector("h1");

  paintDetailStrip(headerMount, item);
  assert.equal(headerMount.getAttribute("data-mm-detail-strip"), "1");
  assert.equal(doc.querySelectorAll(".mm-root").length, 1);
});

test("paintModifierDeltas leaves unmatched rows unmarked so a later hydration pass can retry", () => {
  const doc = useDom(`<div id="row"><span id="mount">Add Chicken</span></div>`);
  const root = doc.getElementById("row");
  const mountEl = doc.getElementById("mount");
  const node = { root, name: "Add Chicken", mountEl };

  paintModifierDeltas([node], { modifiers: [] });
  assert.equal(root.getAttribute("data-mm-painted"), null, "unmatched row is not marked painted");
  assert.equal(mountEl.children.length, 0, "no delta inserted for an unmatched row");

  paintModifierDeltas([node], item);
  assert.equal(root.getAttribute("data-mm-painted"), "1", "row is marked only once a delta is painted");
  assert.equal(
    mountEl.querySelector(".mm-modifier-delta")?.shadowRoot.querySelector("span").textContent,
    "+120 cal · +20g P",
  );

  paintModifierDeltas([node], item);
  assert.equal(mountEl.querySelectorAll(".mm-modifier-delta").length, 1, "already-painted row is not duplicated");
});

test("paintModifierDeltas never marks a row that never finds a delta", () => {
  const doc = useDom(`<div id="row"><span id="mount">Add Sriracha</span></div>`);
  const root = doc.getElementById("row");
  const mountEl = doc.getElementById("mount");
  const node = { root, name: "Add Sriracha", mountEl };

  paintModifierDeltas([node], item);
  paintModifierDeltas([node], item);

  assert.equal(root.getAttribute("data-mm-painted"), null);
  assert.equal(mountEl.children.length, 0);
});
