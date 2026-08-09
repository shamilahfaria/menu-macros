import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pickPacks } from "../extension/lib/storage.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(
  readFileSync(join(root, "extension/packs/mendocino-farms.json"), "utf8"),
);
const bundled = [{ ...base, version: 1 }];
const newer = [{ ...base, version: 2, displayName: "M2" }];
const older = [{ ...base, version: 0, displayName: "old" }];

test("pickPacks prefers newer stored pack", () => {
  assert.equal(pickPacks(newer, bundled)[0].version, 2);
});

test("pickPacks keeps bundled when stored older", () => {
  assert.equal(pickPacks(older, bundled)[0].version, 1);
});

test("pickPacks uses bundled when stored empty", () => {
  assert.equal(pickPacks(null, bundled)[0].version, 1);
});

test("pickPacks keeps bundled when stored pack is invalid", () => {
  const invalid = [{ ...base, version: 2, matchHints: [] }];

  assert.equal(pickPacks(invalid, bundled)[0].version, 1);
});
