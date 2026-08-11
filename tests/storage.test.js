import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pickPacks } from "../extension/lib/storage.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(
  readFileSync(join(root, "packs/mendocino-farms.json"), "utf8"),
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

test("getBundledPacks loads every pack in the index and skips a broken one", async () => {
  const second = { ...base, id: "sweetgreen", displayName: "Sweetgreen", matchHints: ["sweetgreen"] };
  const files = {
    "packs/index.json": { packs: ["mendocino-farms.json", "sweetgreen.json", "broken.json"] },
    "packs/mendocino-farms.json": base,
    "packs/sweetgreen.json": second,
    "packs/broken.json": { id: "broken" }, // fails validatePack
  };

  globalThis.chrome = { runtime: { getURL: (path) => path } };
  globalThis.fetch = async (path) => ({
    ok: path in files,
    json: async () => files[path],
  });

  const { getBundledPacks } = await import(
    `../extension/lib/storage.js?multi=${Date.now()}`
  );
  const packs = await getBundledPacks();

  assert.deepEqual(packs.map((p) => p.id), ["mendocino-farms", "sweetgreen"]);
});

test("getBundledPacks returns [] when the index is missing", async () => {
  globalThis.chrome = { runtime: { getURL: (path) => path } };
  globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

  const { getBundledPacks } = await import(
    `../extension/lib/storage.js?noindex=${Date.now()}`
  );
  await assert.rejects(getBundledPacks(), /could not load/);
});
