#!/usr/bin/env node
// Flags packs whose upstream nutrition source may have moved on.
//
// Why this exists: the weekly in-extension refresh fetches our own curated
// JSON, so it can only ever redistribute the last hand-transcribed edition.
// Nothing was watching the vendor, and a pack sat six months stale.
//
// Two things this deliberately does NOT do:
//   - It does not parse the PDF. A naive parse of the June 2026 edition picked
//     half-portion rows over full ones and would have halved the calories on
//     seven popular items. Transcription stays human-reviewed.
//   - It cannot discover a moved PDF. Vendors rotate host and filename
//     (contact.mendocinofarms.com/... -> a.storyblok.com/...), and their sites
//     answer 403 to non-browser clients, so the link cannot be scraped here.
//     The old URL keeps serving the old file indefinitely, so age is the only
//     reliable backstop: past MAX_AGE_DAYS a human has to go look.
//
// Usage:
//   node scripts/check-pack-freshness.mjs           # check, exit 1 if stale
//   node scripts/check-pack-freshness.mjs --update  # record current validators

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PACK_DIR = "packs";
const PACK_INDEX = "index.json";  // generated listing, not a pack
const MAX_AGE_DAYS = 90;
const UPDATE = process.argv.includes("--update");

const daysSince = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);

async function head(url) {
  const res = await fetch(url, { method: "HEAD", redirect: "follow" });
  return {
    ok: res.ok,
    status: res.status,
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}

const problems = [];

const packFiles = (await readdir(PACK_DIR))
  .filter((f) => f.endsWith(".json") && f !== PACK_INDEX);

for (const file of packFiles) {
  const path = join(PACK_DIR, file);
  const pack = JSON.parse(await readFile(path, "utf8"));
  const { source, updatedAt, displayName } = pack;
  const flag = (msg) => problems.push(`${displayName || file}: ${msg}`);

  // A pack without a source cannot be freshness-checked; say so rather than
  // crashing on it or passing it silently.
  if (!source?.url) {
    flag("no source.url — cannot check freshness");
    continue;
  }

  const age = daysSince(updatedAt);

  let live;
  try {
    live = await head(source.url);
  } catch (err) {
    flag(`source unreachable (${err.message}) — ${source.url}`);
    continue;
  }

  if (!live.ok) {
    // A dead source usually means the vendor rotated to a new file.
    flag(`source returned ${live.status} — the PDF has probably moved: ${source.url}`);
  } else if (source.etag && live.etag && source.etag !== live.etag) {
    flag(`source PDF changed in place (etag ${source.etag} -> ${live.etag})`);
  } else if (!source.etag && !UPDATE) {
    flag("no recorded etag — run with --update to start tracking changes");
  }

  if (age > MAX_AGE_DAYS) {
    flag(`pack is ${age} days old (limit ${MAX_AGE_DAYS}) — check the vendor for a newer edition`);
  }

  if (UPDATE && live.ok) {
    pack.source = { ...source, etag: live.etag, lastModified: live.lastModified };
    await writeFile(path, `${JSON.stringify(pack, null, 2)}\n`);
    console.log(`recorded validators for ${displayName}`);
  }
}

if (problems.length) {
  console.error("Pack freshness problems:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log("All packs fresh.");
