import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundledPack = JSON.parse(
  readFileSync(join(root, "extension/packs/mendocino-farms.json"), "utf8"),
);

async function loadBackground({
  storedPack = { ...bundledPack, version: 2 },
  remotePack = { ...bundledPack, version: 3, updatedAt: "2026-08-08" },
  remoteOk = true,
} = {}) {
  const listeners = { installed: [], alarm: [], message: [] };
  const alarmCreates = [];
  const storage = {
    packs: [structuredClone(storedPack)],
    meta: { existing: "kept" },
  };

  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      onInstalled: { addListener: (listener) => listeners.installed.push(listener) },
      onMessage: { addListener: (listener) => listeners.message.push(listener) },
    },
    alarms: {
      create: async (...args) => alarmCreates.push(args),
      onAlarm: { addListener: (listener) => listeners.alarm.push(listener) },
    },
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.map((key) => [key, storage[key]]));
        },
        async set(values) {
          Object.assign(storage, structuredClone(values));
        },
      },
    },
  };

  globalThis.fetch = async (url) => {
    if (url.startsWith("chrome-extension://")) {
      return { ok: true, json: async () => structuredClone(bundledPack) };
    }
    return {
      ok: remoteOk,
      json: async () => structuredClone(remotePack),
    };
  };

  const module = await import(
    `../extension/background.js?test=${Date.now()}-${Math.random()}`
  );
  return { ...module, listeners, alarmCreates, storage };
}

function sendMessage(listener, message) {
  return new Promise((resolve, reject) => {
    const keepChannelOpen = listener(message, {}, resolve);
    if (keepChannelOpen !== true) {
      reject(new Error(`message channel was not kept open for ${message.type}`));
    }
  });
}

test("installation creates the weekly refresh alarm", async () => {
  const { listeners, alarmCreates } = await loadBackground();

  await listeners.installed[0]();

  assert.deepEqual(alarmCreates, [
    ["mm-pack-refresh", { periodInMinutes: 10080 }],
  ]);
});

test("refreshPacks atomically saves valid remote packs", async () => {
  const { refreshPacks, storage } = await loadBackground();

  const result = await refreshPacks({ reason: "manual" });

  assert.deepEqual(result, { ok: true });
  assert.equal(storage.packs[0].version, 3);
  assert.equal(storage.packs[0].updatedAt, "2026-08-08");
  assert.equal(storage.meta.lastRefreshOk, true);
  assert.match(storage.meta.lastRefreshAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("failed refresh keeps the last good packs and records failure", async () => {
  const { refreshPacks, storage } = await loadBackground({ remoteOk: false });
  const packsBefore = structuredClone(storage.packs);

  const result = await refreshPacks({ reason: "manual" });

  assert.deepEqual(result, { ok: false });
  assert.deepEqual(storage.packs, packsBefore);
  assert.deepEqual(storage.meta.existing, "kept");
  assert.equal(storage.meta.lastRefreshOk, false);
  assert.match(storage.meta.lastRefreshAttemptAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("alarm refreshes only for the pack refresh alarm", async () => {
  const { listeners, storage } = await loadBackground();

  await listeners.alarm[0]({ name: "another-alarm" });
  assert.equal(storage.packs[0].version, 2);

  await listeners.alarm[0]({ name: "mm-pack-refresh" });
  assert.equal(storage.packs[0].version, 3);
});

test("messages expose refresh, status, and pack summaries", async () => {
  const { listeners, storage } = await loadBackground();
  const listener = listeners.message[0];

  const status = await sendMessage(listener, { type: "MM_STATUS" });
  assert.deepEqual(status, { meta: { existing: "kept" } });

  const packs = await sendMessage(listener, { type: "MM_GET_PACKS" });
  assert.deepEqual(packs, {
    packs: [{
      id: "mendocino-farms",
      displayName: "Mendocino Farms",
      updatedAt: "2026-02-01",
      version: 2,
    }],
  });

  const refreshed = await sendMessage(listener, { type: "MM_REFRESH" });
  assert.deepEqual(refreshed, { ok: true });
  assert.equal(storage.packs[0].version, 3);
});
