import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  mountListStrip,
  paintDetailStrip,
  paintModifierDeltas,
  recordCoverage,
} from "../extension/content/content.js";

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

test("mountListStrip appends list strips to GenericItemCard", () => {
  const doc = useDom(`
    <div data-testid="MenuItem">
      <div data-testid="GenericItemCard" id="card">
        <div id="col"><h3>The Farm Club</h3><span>$14.50</span></div>
        <img alt="" />
      </div>
    </div>
  `);
  const card = doc.getElementById("card");
  const strip = doc.createElement("div");
  strip.className = "mm-root";

  mountListStrip({
    root: doc.querySelector('[data-testid="MenuItem"]'),
    layout: "list",
    stripMount: { type: "append", el: card },
  }, strip);

  assert.equal(card.lastElementChild, strip);
});

test("mountListStrip inserts list strips after the content anchor when needed", () => {
  const doc = useDom(`
    <div data-testid="MenuItem" id="item">
      <h3>The Farm Club</h3>
      <span id="price">$14.50</span>
      <span id="desc">Rotisserie chicken and bacon</span>
    </div>
  `);
  const desc = doc.getElementById("desc");
  const strip = doc.createElement("div");
  strip.className = "mm-root";

  mountListStrip({
    root: doc.getElementById("item"),
    layout: "list",
    stripMount: { type: "after", el: desc },
  }, strip);

  assert.equal(desc.nextElementSibling, strip);
});

test("mounting the strip leaves DoorDash's own boxes untouched", () => {
  const doc = useDom(`
    <div id="grid">
      <div id="cell">
        <div data-testid="MenuItem" id="item">
          <div id="photo" style="position: relative"><img src="x.jpg"></div>
        </div>
      </div>
    </div>
  `);
  const strip = doc.createElement("div");
  strip.className = "mm-root mm-band";

  mountListStrip({
    root: doc.getElementById("item"),
    layout: "list",
    stripMount: { type: "append", el: doc.getElementById("photo") },
  }, strip);

  assert.equal(strip.parentElement.id, "photo", "band anchors to the photo host");
  // The virtualized grid positions cards on a fixed pitch, so we must not
  // resize or unclip anything: no injected attributes, no layout stylesheet.
  for (const id of ["grid", "cell", "item", "photo"]) {
    const el = doc.getElementById(id);
    assert.equal(el.hasAttribute("data-mm-card"), false, id);
    assert.equal(el.hasAttribute("data-mm-card-host"), false, id);
    assert.equal(el.getAttribute("style") || "", id === "photo" ? "position: relative" : "", id);
  }
  assert.equal(doc.getElementById("mm-layout-style"), null, "no layout overrides injected");
});

test("mountListStrip mounts featured carousel strips as card siblings", () => {
  const doc = useDom(`
    <div id="wrap">
      <div data-testid="image-action-card-container"><span>The Farm Club</span></div>
    </div>
  `);
  const root = doc.querySelector('[data-testid="image-action-card-container"]');
  const strip = doc.createElement("div");
  strip.className = "mm-root";

  mountListStrip({
    root,
    layout: "featured",
    stripMount: { type: "after", el: root },
  }, strip);

  assert.equal(root.nextElementSibling, strip);
  assert.equal(root.parentElement.lastElementChild, strip);
});

test("recordCoverage reports the match rate and names the unmatched items", () => {
  const lines = [];
  const log = (msg, unmatched) => lines.push([msg, unmatched]);

  recordCoverage("The Farm Club", { calories: 760 }, log);
  recordCoverage("Joe's Classic Chips", null, log);
  recordCoverage("Chicken Pesto Caprese", { calories: 800 }, log);

  assert.deepEqual(lines.at(-1), [
    "[menu-macros] pack coverage 2/3",
    ["Joe's Classic Chips"],
  ]);

  // A repeat pass over the same cards must not spam an unchanged summary.
  const before = lines.length;
  recordCoverage("The Farm Club", { calories: 760 }, log);
  assert.equal(lines.length, before, "unchanged coverage is not re-reported");

  // A later pass that resolves a match updates the rate.
  recordCoverage("Joe's Classic Chips", { calories: 210 }, log);
  assert.deepEqual(lines.at(-1), ["[menu-macros] pack coverage 3/3", []]);
});
