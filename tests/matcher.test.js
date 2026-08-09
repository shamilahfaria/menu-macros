import test from "node:test";
import assert from "node:assert/strict";
import { normalizeName, matchItem, matchModifier } from "../extension/lib/matcher.js";

const items = [
  {
    id: "farm-club",
    canonicalName: "The Farm Club",
    aliases: ["Farm Club Sandwich"],
  },
  {
    id: "pesto",
    canonicalName: "Chicken Pesto Caprese",
    aliases: ["Chicken Pesto Caprese Sandwich"],
  },
];

test("normalizeName collapses noise", () => {
  assert.equal(normalizeName("  Chicken  Pesto  Caprese! "), "chicken pesto caprese");
  assert.equal(normalizeName("Turkey w/ Avocado"), "turkey with avocado");
});

test("exact alias hits", () => {
  assert.equal(matchItem("Farm Club Sandwich", items)?.id, "farm-club");
});

test("filler-stripped unique hit", () => {
  assert.equal(matchItem("The Farm Club", items)?.id, "farm-club");
});

test("ambiguous partial returns null", () => {
  assert.equal(matchItem("Chicken", items), null);
});

test("unknown returns null", () => {
  assert.equal(matchItem("Mystery Bowl", items), null);
});

test("matchModifier exact", () => {
  const modifiers = [
    { canonicalName: "Add Chicken", aliases: ["Chicken"] },
    { canonicalName: "Add Avocado", aliases: ["Avocado"] },
  ];
  assert.equal(matchModifier("Add Chicken", modifiers)?.canonicalName, "Add Chicken");
  assert.equal(matchModifier("Extra Mystery", modifiers), null);
});
