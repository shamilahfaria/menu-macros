import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  createModifierDelta,
  createNutritionStrip,
  formatDeltaText,
  formatExtras,
  formatMacros,
  shouldShowMagnifier,
} from "../extension/content/ui.js";

// Real jsdom document (not a hand-rolled stub) so structure/escaping
// assertions below exercise actual DOM/shadow-DOM parsing semantics
// instead of just matching against raw HTML strings.
globalThis.document = new JSDOM("<!doctype html><html><body></body></html>").window.document;

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

test("matched nutrition strip renders price, calories, macros, footer, and extras in real DOM", () => {
  const host = createNutritionStrip({ item, priceText: "$14.50" });
  const shadow = host.shadowRoot;

  assert.equal(host.className, "mm-root");
  assert.equal(shadow.querySelector(".price").textContent, "$14.50");
  assert.equal(shadow.querySelector(".calories").textContent, "760 cal");

  const macroValues = [...shadow.querySelectorAll(".macro-value")].map((el) => el.textContent);
  assert.deepEqual(macroValues, ["40g", "69g", "34g", "1620mg", "7g", "6g"]);
  assert.equal(shadow.querySelector(".macro-label").textContent, "Protein");

  assert.equal(shadow.querySelector(".footer").textContent, "Base item · excludes customizations");
  assert.ok(shadow.querySelector(".extras-trigger"), "magnifier trigger is present");
  assert.equal(shadow.querySelector(".extra-label").textContent, "Saturated fat");
  assert.equal(shadow.querySelector(".extra-value").textContent, "8g");
  assert.equal(shadow.querySelector(".strip").classList.contains("unavailable"), false);
});

test("nutrition strip hides magnifier when no extras exist", () => {
  const host = createNutritionStrip({ item: { ...item, extras: [] } });

  assert.equal(host.shadowRoot.querySelector(".extras-trigger"), null);
});

test("unmatched nutrition strip preserves layout with em dashes", () => {
  const host = createNutritionStrip({ item: null, priceText: "$14.50" });
  const shadow = host.shadowRoot;

  assert.equal(shadow.querySelector(".price").textContent, "$14.50");
  const macroValues = [...shadow.querySelectorAll(".macro-value")].map((el) => el.textContent);
  assert.deepEqual(macroValues, ["—", "—", "—", "—", "—", "—"]);
  assert.equal(shadow.querySelector(".calories").textContent, "—");
  assert.equal(shadow.querySelector(".footer").textContent, "Nutrition unavailable");
  assert.equal(shadow.querySelector(".extras-trigger"), null);
  assert.equal(shadow.querySelector(".strip").classList.contains("unavailable"), true);
});

test("createNutritionStrip escapes HTML in priceText instead of injecting markup", () => {
  const host = createNutritionStrip({ item, priceText: '<img src=x onerror="alert(1)">' });
  const shadow = host.shadowRoot;

  assert.equal(shadow.querySelector("img"), null, "malicious markup is not parsed as an element");
  assert.equal(
    shadow.querySelector(".price").textContent,
    '<img src=x onerror="alert(1)">',
    "raw text is preserved and rendered as text, not HTML",
  );
});

test("createNutritionStrip escapes HTML in extras label/value", () => {
  const malicious = { ...item, extras: [{ label: "<script>evil()</script>", value: '1 & 2"' }] };
  const host = createNutritionStrip({ item: malicious });
  const shadow = host.shadowRoot;

  assert.equal(shadow.querySelector("script"), null);
  assert.equal(shadow.querySelector(".extra-label").textContent, "<script>evil()</script>");
  assert.equal(shadow.querySelector(".extra-value").textContent, '1 & 2"');
});

test("modifier delta renders text inside an isolated shadow root", () => {
  const delta = createModifierDelta({ deltas: { calories: 110, proteinG: 18 } });

  assert.equal(delta.tagName, "SPAN");
  assert.equal(delta.className, "mm-modifier-delta");
  assert.ok(delta.shadowRoot, "delta uses shadow DOM so page styles can't leak in or out");
  assert.equal(delta.shadowRoot.querySelector("span").textContent, "+110 cal · +18g P");
  assert.equal(delta.textContent, "", "light DOM carries no text; content lives in the shadow tree");
  assert.equal(createModifierDelta({ deltas: {} }), null);
  assert.equal(createModifierDelta(null), null);
});

test("modifier delta escapes HTML in the rendered text", () => {
  // formatDeltaText only ever emits numbers/suffixes from a fixed table, but
  // escaping defensively still matters if that assumption ever changes.
  const delta = createModifierDelta({ deltas: { calories: 110 } });

  assert.equal(delta.shadowRoot.querySelector("script"), null);
  assert.equal(delta.shadowRoot.querySelector("span").textContent, "+110 cal");
});
