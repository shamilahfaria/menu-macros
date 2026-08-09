import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validatePack, findPackForStore } from "../extension/lib/pack.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readBundledPack() {
  return JSON.parse(
    readFileSync(join(root, "extension/packs/mendocino-farms.json"), "utf8")
  );
}

test("validatePack accepts bundled mendocino pack", () => {
  const raw = readBundledPack();
  const result = validatePack(raw);
  assert.equal(result.ok, true);
  assert.equal(result.pack.id, "mendocino-farms");
  assert.equal(result.pack.items.length >= 3, true);
  assert.deepEqual(
    result.pack.items.map(({ canonicalName, calories, proteinG, carbsG, fatG, sodiumMg, sugarG, fiberG }) => ({
      canonicalName,
      calories,
      proteinG,
      carbsG,
      fatG,
      sodiumMg,
      sugarG,
      fiberG,
    })),
    [
      {
        canonicalName: "The Farm Club",
        calories: 760,
        proteinG: 40,
        carbsG: 69,
        fatG: 34,
        sodiumMg: 1620,
        sugarG: 7,
        fiberG: 6,
      },
      {
        canonicalName: "\"Not So Fried\" Chicken",
        calories: 900,
        proteinG: 35,
        carbsG: 79,
        fatG: 48,
        sodiumMg: 1350,
        sugarG: 10,
        fiberG: 5,
      },
      {
        canonicalName: "Avocado & Quinoa Superfood Ensalada",
        calories: 690,
        proteinG: 19,
        carbsG: 47,
        fatG: 51,
        sodiumMg: 1090,
        sugarG: 10,
        fiberG: 15,
      },
    ]
  );
  assert.deepEqual(result.pack.items[0].modifiers[0].deltas, {
    calories: 110,
    proteinG: 20,
    fatG: 2.5,
    sodiumMg: 500,
  });
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
    modifierAliasPack.items[0].modifiers[0].aliases = [badAlias];
    assert.equal(validatePack(modifierAliasPack).ok, false);
  }
});

test("validatePack rejects modifier deltas that are not finite numbers", () => {
  for (const badDelta of ["110", Number.NaN, Number.POSITIVE_INFINITY]) {
    const pack = readBundledPack();
    pack.items[0].modifiers[0].deltas.calories = badDelta;
    assert.equal(validatePack(pack).ok, false);
  }
});

test("findPackForStore matches hint substring", () => {
  const pack = validatePack(readBundledPack()).pack;
  assert.equal(findPackForStore([pack], "Mendocino Farms - Downtown"), pack);
  assert.equal(findPackForStore([pack], "Some Other Place"), null);
});
