import { copyFileSync, readFileSync } from "node:fs";
import { validatePack } from "../extension/lib/pack.js";

const src = "extension/packs/mendocino-farms.json";
const dest = "packs/mendocino-farms.json";
const raw = JSON.parse(readFileSync(src, "utf8"));
const result = validatePack(raw);
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}
copyFileSync(src, dest);
console.log("synced", dest);
