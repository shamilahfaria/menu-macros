import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validatePack, findPackForStore } from "../extension/lib/pack.js";
import { normalizeName } from "../extension/lib/matcher.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readBundledPack() {
  return JSON.parse(
    readFileSync(join(root, "packs/mendocino-farms.json"), "utf8")
  );
}

// Transcribed by hand from the Feb 2026 Nutritional & Allergen PDF so that a
// bad re-import of the pack fails here instead of shipping wrong macros.
const PDF_SPOT_CHECKS = [
  ["The Farm Club", 760, 40, 69, 34, 1620, 7, 6],
  ["\"Not So Fried\" Chicken", 900, 35, 79, 48, 1350, 10, 5],
  ["Avocado & Quinoa Superfood Ensalada", 690, 19, 47, 51, 1090, 10, 15],
  ["Chicken Parm Dip", 940, 46, 75, 49, 2030, 4, 3],
  ["Golden State Cobb", 750, 30, 29, 60, 1430, 9, 11],
  ["Thai Mango Salad", 840, 35, 70, 50, 1780, 38, 12],
  ["Modern Caesar Wrap", 1090, 26, 91, 70, 1540, 9, 12],
];

function itemNamed(pack, name) {
  return pack.items.find((item) => item.canonicalName === name);
}

function firstModifier(pack) {
  return pack.items.find((item) => item.modifiers?.length).modifiers[0];
}

test("validatePack accepts bundled mendocino pack", () => {
  const result = validatePack(readBundledPack());
  assert.equal(result.ok, true);
  assert.equal(result.pack.id, "mendocino-farms");
  assert.equal(result.pack.items.length >= 3, true);
});

test("bundled pack macros match the published PDF rows", () => {
  const pack = validatePack(readBundledPack()).pack;

  for (const [name, calories, proteinG, carbsG, fatG, sodiumMg, sugarG, fiberG] of PDF_SPOT_CHECKS) {
    const item = itemNamed(pack, name);
    assert.ok(item, `missing pack item: ${name}`);
    assert.deepEqual(
      { calories: item.calories, proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG,
        sodiumMg: item.sodiumMg, sugarG: item.sugarG, fiberG: item.fiberG },
      { calories, proteinG, carbsG, fatG, sodiumMg, sugarG, fiberG },
      name
    );
  }
});

test("bundled pack carries published add-on deltas", () => {
  const pack = validatePack(readBundledPack()).pack;
  const salad = itemNamed(pack, "Avocado & Quinoa Superfood Ensalada");
  const addChicken = salad.modifiers.find((mod) => mod.canonicalName === "Add Chicken");

  assert.deepEqual(addChicken.deltas, {
    calories: 110,
    proteinG: 20,
    carbsG: 0,
    fatG: 2.5,
    sodiumMg: 500,
    sugarG: 0,
    fiberG: 0,
  });
});

test("bundled pack item and modifier names are unambiguous", () => {
  const pack = validatePack(readBundledPack()).pack;
  const seen = new Map();

  for (const item of pack.items) {
    for (const name of [item.canonicalName, ...item.aliases]) {
      const key = normalizeName(name);
      assert.equal(seen.get(key) ?? item.id, item.id, `"${name}" is claimed by two items`);
      seen.set(key, item.id);
    }

    const modifierNames = (item.modifiers || [])
      .flatMap((mod) => [mod.canonicalName, ...mod.aliases])
      .map(normalizeName);
    assert.equal(
      new Set(modifierNames).size,
      modifierNames.length,
      `${item.id} has colliding modifier names`
    );
  }
});

test("validatePack rejects missing version", () => {
  const result = validatePack({ id: "x", displayName: "X", matchHints: ["x"], items: [] });
  assert.equal(result.ok, false);
});

test("validatePack rejects empty match hints", () => {
  const pack = readBundledPack();
  pack.matchHints = [""];
  assert.equal(validatePack(pack).ok, false);
});

test("validatePack rejects aliases containing empty or non-string entries", () => {
  for (const badAlias of ["", 42]) {
    const itemAliasPack = readBundledPack();
    itemAliasPack.items[0].aliases = [badAlias];
    assert.equal(validatePack(itemAliasPack).ok, false);

    const modifierAliasPack = readBundledPack();
    firstModifier(modifierAliasPack).aliases = [badAlias];
    assert.equal(validatePack(modifierAliasPack).ok, false);
  }
});

test("validatePack rejects modifier deltas that are not finite numbers", () => {
  for (const badDelta of ["110", Number.NaN, Number.POSITIVE_INFINITY]) {
    const pack = readBundledPack();
    firstModifier(pack).deltas.calories = badDelta;
    assert.equal(validatePack(pack).ok, false);
  }
});

test("findPackForStore matches hint substring", () => {
  const pack = validatePack(readBundledPack()).pack;
  assert.equal(findPackForStore([pack], "Mendocino Farms - Downtown"), pack);
  assert.equal(findPackForStore([pack], "Some Other Place"), null);
});
