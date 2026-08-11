import { build } from "esbuild";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";

import { validatePack } from "../extension/lib/pack.js";

export const PACK_INDEX = "index.json";

// MV3 content scripts cannot use `"type": "module"`, so the ES-module
// source in extension/content/content.js (which the Node test suite
// imports directly) is bundled into a plain IIFE here for the manifest
// to load. Source modules stay untouched for `npm test`.
await build({
  entryPoints: ["extension/content/content.js"],
  outfile: "extension/content/content.bundle.js",
  bundle: true,
  format: "iife",
  target: "chrome110",
  logLevel: "info",
});

// packs/ is the committed source of truth (GitHub raw serves it to the weekly
// refresh). The extension's bundled copy is generated here so the two can't
// drift; it is git-ignored.
//
// A content script cannot list a directory, so the pack filenames are written
// to an index that both the bundled loader and (later) remote discovery read.
// Generating it from the directory means adding a restaurant is one new file.
await mkdir("extension/packs", { recursive: true });

const packFiles = (await readdir("packs"))
  .filter((f) => f.endsWith(".json") && f !== PACK_INDEX)
  .sort();

for (const file of packFiles) {
  const result = validatePack(JSON.parse(await readFile(`packs/${file}`, "utf8")));
  if (!result.ok) {
    console.error(`packs/${file}: ${result.error}`);
    process.exit(1);
  }
  await copyFile(`packs/${file}`, `extension/packs/${file}`);
}

const index = `${JSON.stringify({ packs: packFiles }, null, 2)}\n`;
await writeFile(`packs/${PACK_INDEX}`, index);
await writeFile(`extension/packs/${PACK_INDEX}`, index);

console.log(`packs: ${packFiles.length} copied, index written`);
