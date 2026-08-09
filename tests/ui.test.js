import test from "node:test";
import assert from "node:assert/strict";
import {
  createModifierDelta,
  createNutritionStrip,
  formatDeltaText,
  formatExtras,
  formatMacros,
  shouldShowMagnifier,
} from "../extension/content/ui.js";

class ElementStub {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.textContent = "";
    this.shadowRoot = null;
  }

  attachShadow({ mode }) {
    assert.equal(mode, "open");
    this.shadowRoot = { innerHTML: "" };
    return this.shadowRoot;
  }
}

globalThis.document = {
  createElement(tagName) {
    return new ElementStub(tagName);
  },
};

const item = {
  calories: 760,
  proteinG: 40,
  carbsG: 69,
  fatG: 34,
  sodiumMg: 1620,
  sugarG: 7,
  fiberG: 6,
  extras: [{ label: "Saturated fat", value: "8g" }],
};

test("formatMacros returns the fixed comparison order with units", () => {
  assert.deepEqual(formatMacros(item), [
    { label: "Protein", value: "40g" },
    { label: "Carbs", value: "69g" },
    { label: "Fat", value: "34g" },
    { label: "Sodium", value: "1620mg" },
    { label: "Sugar", value: "7g" },
    { label: "Fiber", value: "6g" },
  ]);
});

test("formatExtras safely defaults to an empty list", () => {
  assert.deepEqual(formatExtras(item), item.extras);
  assert.deepEqual(formatExtras(null), []);
  assert.deepEqual(formatExtras({}), []);
});

test("magnifier only appears when extras exist", () => {
  assert.equal(shouldShowMagnifier({ extras: [] }), false);
  assert.equal(shouldShowMagnifier(item), true);
  assert.equal(shouldShowMagnifier(null), false);
});

test("formatDeltaText uses compact labels in stable order", () => {
  assert.equal(
    formatDeltaText({
      deltas: {
        sodiumMg: 60,
        fatG: 2,
        calories: 110,
        proteinG: 18,
      },
    }),
    "+110 cal · +18g P · +2g F · +60mg Na",
  );
});

test("formatDeltaText handles negative and zero deltas", () => {
  assert.equal(
    formatDeltaText({ deltas: { calories: -50, carbsG: 0, sugarG: -2 } }),
    "-50 cal · 0g C · -2g S",
  );
  assert.equal(formatDeltaText(null), "");
});

test("matched nutrition strip renders price, calories, macros, footer, and extras", () => {
  const host = createNutritionStrip({ item, priceText: "$14.50" });
  const html = host.shadowRoot.innerHTML;

  assert.equal(host.className, "mm-root");
  assert.match(html, /\$14\.50/);
  assert.match(html, /760 cal/);
  assert.match(html, /Protein/);
  assert.match(html, /1620mg/);
  assert.match(html, /Base item · excludes customizations/);
  assert.match(html, /🔍/);
  assert.match(html, /Saturated fat/);
  assert.match(html, /8g/);
});

test("nutrition strip hides magnifier when no extras exist", () => {
  const host = createNutritionStrip({ item: { ...item, extras: [] } });

  assert.doesNotMatch(host.shadowRoot.innerHTML, /🔍/);
});

test("unmatched nutrition strip preserves layout with em dashes", () => {
  const host = createNutritionStrip({ item: null, priceText: "$14.50" });
  const html = host.shadowRoot.innerHTML;

  assert.match(html, /\$14\.50/);
  assert.equal((html.match(/>—</g) || []).length, 7);
  assert.match(html, /Nutrition unavailable/);
  assert.doesNotMatch(html, /🔍/);
});

test("modifier delta returns compact span only for known deltas", () => {
  const delta = createModifierDelta({ deltas: { calories: 110, proteinG: 18 } });

  assert.equal(delta.tagName, "SPAN");
  assert.equal(delta.className, "mm-modifier-delta");
  assert.equal(delta.textContent, "+110 cal · +18g P");
  assert.equal(createModifierDelta({ deltas: {} }), null);
  assert.equal(createModifierDelta(null), null);
});
