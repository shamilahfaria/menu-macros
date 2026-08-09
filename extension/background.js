import {
  getBundledPacks,
  getMeta,
  getPacks,
  savePacks,
} from "./lib/storage.js";
import { validatePack } from "./lib/pack.js";

const ALARM = "mm-pack-refresh";

// Must match the raw.githubusercontent.com host_permissions entry in
// manifest.json. A pack's remoteUrl is untrusted stored data (it can be
// overwritten by a previous refresh), so it's re-validated here rather than
// trusted just because it parsed as a URL.
const ALLOWED_REMOTE_HOST = "raw.githubusercontent.com";
const ALLOWED_REMOTE_PATH_PREFIX = "/shamilahfaria/menu-macros/";

function isAllowedRemoteUrl(remoteUrl) {
  try {
    const url = new URL(remoteUrl);
    return (
      url.protocol === "https:"
      && url.host === ALLOWED_REMOTE_HOST
      && url.pathname.startsWith(ALLOWED_REMOTE_PATH_PREFIX)
    );
  } catch {
    return false;
  }
}

export async function refreshPacks({ reason: _reason } = { reason: "manual" }) {
  try {
    const current = await getPacks();
    const updated = [];

    for (const pack of current) {
      if (!pack.remoteUrl) {
        updated.push(pack);
        continue;
      }
      if (!isAllowedRemoteUrl(pack.remoteUrl)) {
        throw new Error("remoteUrl host/path not allowed");
      }

      const response = await fetch(pack.remoteUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("fetch failed");

      const result = validatePack(await response.json());
      if (!result.ok) throw new Error(result.error);
      if (result.pack.id !== pack.id) throw new Error("id mismatch");
      updated.push(result.pack);
    }

    const meta = await getMeta();
    await savePacks(updated, {
      ...meta,
      lastRefreshAt: new Date().toISOString(),
      lastRefreshOk: true,
    });
    return { ok: true };
  } catch {
    const meta = await getMeta();
    await chrome.storage.local.set({
      meta: {
        ...meta,
        lastRefreshOk: false,
        lastRefreshAttemptAt: new Date().toISOString(),
      },
    });
    return { ok: false };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const packs = await getBundledPacks();
    const meta = await getMeta();
    if (!meta.lastRefreshAt) {
      await savePacks(packs, { lastRefreshAt: null, lastRefreshOk: null });
    }
  } catch {
    // Installation should not fail if pack seeding is unavailable.
  }

  await chrome.alarms.create(ALARM, { periodInMinutes: 60 * 24 * 7 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) {
    return refreshPacks({ reason: "alarm" });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "MM_REFRESH") {
    refreshPacks({ reason: "manual" }).then(sendResponse);
    return true;
  }

  if (message?.type === "MM_STATUS") {
    getMeta().then((meta) => sendResponse({ meta }));
    return true;
  }

  if (message?.type === "MM_GET_PACKS") {
    getPacks().then((packs) => {
      sendResponse({
        packs: packs.map(({ id, displayName, updatedAt, version }) => ({
          id,
          displayName,
          updatedAt,
          version,
        })),
      });
    });
    return true;
  }
});
