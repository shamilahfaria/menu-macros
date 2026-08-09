# menu-macros MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a sideloadable Chrome MV3 extension that silently shows Mendocino Farms nutrition macros inline on DoorDash menu tiles and item modifiers.

**Architecture:** Content script detects a Mendocino Farms DoorDash store, matches visible item/modifier names against a versioned JSON nutrition pack (high-confidence only), and injects a native-looking nutrition strip. A service worker keeps a bundled pack as fallback and silently refreshes from a GitHub-hosted JSON weekly. No toasts, badges, or auto popups.

**Tech Stack:** Chrome Manifest V3, vanilla JS (ES modules), `chrome.storage` + `chrome.alarms`, Node.js built-in test runner (`node:test`) for matcher/pack/UI unit tests, no bundler for MVP.

**Spec:** [`docs/2026-08-08-menu-macros-mvp-design.md`](../2026-08-08-menu-macros-mvp-design.md)

## Global Constraints

- DoorDash only for MVP; Mendocino Farms pack only
- High-confidence matches only — never show guessed numbers
- Primary macros always visible: calories (with price), protein, carbs, fat, sodium, sugar, fiber
- Extras via 🔍 hover only; hide magnifier when `extras` empty
- Layout B: do not resize DoorDash images; inject strip under title/price
- Refresh is silent: no notifications, toasts, badges, or auto-opened popup
- On refresh/schema failure: keep last good / bundled pack
- CSS must not leak into DoorDash (Shadow DOM for the strip)
- Official nutrition source: `https://contact.mendocinofarms.com/wp-content/uploads/2026/02/Feb2026_NutritionalAllergen.pdf`

---

## File structure

```text
extension/
  manifest.json
  background.js              # alarms, silent fetch, message handlers
  content/
    content.js               # boot, observer, page orchestration
    doordash.js              # store detect + DOM item/modifier discovery
    ui.js                    # Shadow DOM nutrition strip + modifier deltas
  lib/
    matcher.js               # normalize + high-confidence match
    pack.js                  # validatePack, findPackForStore
    storage.js               # load/save active packs + meta
  packs/
    mendocino-farms.json     # bundled fallback
  popup/
    popup.html
    popup.css
    popup.js
packs/
  mendocino-farms.json       # same file published for remote refresh (repo root path for raw URL)
scripts/
  sync-pack.mjs              # copy extension pack ↔ packs/ + validate
tests/
  matcher.test.js
  pack.test.js
  ui.test.js
package.json
README.md
docs/
  2026-08-08-menu-macros-mvp-design.md
  plans/2026-08-08-menu-macros-mvp.md
  manual-qa.md
```

---

### Task 1: Extension scaffold + test harness

**Files:**
- Create: `package.json`
- Create: `extension/manifest.json`
- Create: `extension/background.js` (stub)
- Create: `extension/content/content.js` (stub)
- Create: `extension/popup/popup.html`
- Create: `extension/popup/popup.css`
- Create: `extension/popup/popup.js` (stub)
- Modify: `README.md` (load instructions)
- Create: `docs/manual-qa.md` (empty checklist shell)

**Interfaces:**
- Produces: loadable unpacked extension with empty content/background/popup entrypoints

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "menu-macros",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/**/*.test.js",
    "sync-pack": "node scripts/sync-pack.mjs"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "menu-macros",
  "version": "0.1.0",
  "description": "Inline nutrition macros on DoorDash for supported restaurants.",
  "permissions": ["storage", "alarms"],
  "host_permissions": [
    "https://www.doordash.com/*",
    "https://raw.githubusercontent.com/shamilahfaria/menu-macros/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_title": "menu-macros",
    "default_popup": "popup/popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://www.doordash.com/*"],
      "js": ["content/content.js"],
      "type": "module",
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["packs/*.json"],
      "matches": ["https://www.doordash.com/*"]
    }
  ]
}
```

- [ ] **Step 3: Add stub entrypoints**

`extension/background.js`:
```js
chrome.runtime.onInstalled.addListener(() => {
  // pack seed + alarm setup land in later tasks
});
```

`extension/content/content.js`:
```js
console.debug("[menu-macros] content script loaded");
```

`extension/popup/popup.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <h1>menu-macros</h1>
    <p id="status">Loading…</p>
    <button id="refresh" type="button">Refresh nutrition data</button>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

`extension/popup/popup.css`:
```css
body {
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  margin: 12px;
  min-width: 240px;
  color: #191919;
}
button {
  margin-top: 8px;
}
```

`extension/popup/popup.js`:
```js
document.getElementById("status").textContent = "Scaffold only";
```

- [ ] **Step 4: Document sideload in README**

Append:

```markdown
## Load in Chrome (dev)

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked → select the `extension/` folder
4. Open a DoorDash store page and confirm the service worker / content script appear in the extension details
```

- [ ] **Step 5: Verify stubs load**

Run: open Chrome → Load unpacked `extension/` → visit `https://www.doordash.com` → extension service worker shows no errors; content script log appears.

Expected: no manifest errors.

- [ ] **Step 6: Commit**

```bash
git add package.json extension README.md docs/manual-qa.md
git commit -m "Scaffold MV3 extension and Node test harness"
```

---

### Task 2: Pack schema + validation + starter Mendocino pack

**Files:**
- Create: `extension/lib/pack.js`
- Create: `extension/packs/mendocino-farms.json`
- Create: `packs/mendocino-farms.json` (identical copy for remote URL)
- Create: `scripts/sync-pack.mjs`
- Create: `tests/pack.test.js`

**Interfaces:**
- Produces:
  - `export function validatePack(pack: unknown): { ok: true, pack: RestaurantPack } | { ok: false, error: string }`
  - `export function findPackForStore(packs: RestaurantPack[], haystack: string): RestaurantPack | null`
  - `RestaurantPack` shape per spec (`version`, `matchHints`, `items[]`, `extras[]`, `modifiers[]`)

- [ ] **Step 1: Write failing pack tests**

`tests/pack.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validatePack, findPackForStore } from "../extension/lib/pack.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("validatePack accepts bundled mendocino pack", () => {
  const raw = JSON.parse(
    readFileSync(join(root, "extension/packs/mendocino-farms.json"), "utf8")
  );
  const result = validatePack(raw);
  assert.equal(result.ok, true);
  assert.equal(result.pack.id, "mendocino-farms");
});

test("validatePack rejects missing version", () => {
  const result = validatePack({ id: "x", displayName: "X", matchHints: ["x"], items: [] });
  assert.equal(result.ok, false);
});

test("findPackForStore matches hint substring", () => {
  const pack = validatePack(
    JSON.parse(readFileSync(join(root, "extension/packs/mendocino-farms.json"), "utf8"))
  ).pack;
  assert.equal(findPackForStore([pack], "Mendocino Farms - Downtown"), pack);
  assert.equal(findPackForStore([pack], "Some Other Place"), null);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test`
Expected: FAIL resolving `../extension/lib/pack.js` or missing JSON

- [ ] **Step 3: Implement `extension/lib/pack.js`**

```js
const REQUIRED_ITEM_NUMBERS = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "sodiumMg",
  "sugarG",
  "fiberG",
];

export function validatePack(pack) {
  if (!pack || typeof pack !== "object") return { ok: false, error: "pack must be object" };
  if (typeof pack.id !== "string" || !pack.id) return { ok: false, error: "id required" };
  if (typeof pack.displayName !== "string") return { ok: false, error: "displayName required" };
  if (!Number.isInteger(pack.version)) return { ok: false, error: "version int required" };
  if (!Array.isArray(pack.matchHints) || pack.matchHints.length === 0) {
    return { ok: false, error: "matchHints required" };
  }
  if (!pack.source || typeof pack.source.url !== "string") {
    return { ok: false, error: "source.url required" };
  }
  if (typeof pack.updatedAt !== "string") return { ok: false, error: "updatedAt required" };
  if (!Array.isArray(pack.items)) return { ok: false, error: "items required" };

  for (const item of pack.items) {
    if (typeof item.id !== "string" || typeof item.canonicalName !== "string") {
      return { ok: false, error: "item id/canonicalName required" };
    }
    if (!Array.isArray(item.aliases)) return { ok: false, error: "aliases must be array" };
    for (const key of REQUIRED_ITEM_NUMBERS) {
      if (typeof item[key] !== "number") return { ok: false, error: `item.${key} number required` };
    }
    if (item.extras != null) {
      if (!Array.isArray(item.extras)) return { ok: false, error: "extras must be array" };
      for (const extra of item.extras) {
        if (typeof extra.label !== "string" || typeof extra.value !== "string") {
          return { ok: false, error: "extras entries need label/value strings" };
        }
      }
    }
    if (item.modifiers != null) {
      if (!Array.isArray(item.modifiers)) return { ok: false, error: "modifiers must be array" };
      for (const mod of item.modifiers) {
        if (typeof mod.canonicalName !== "string") {
          return { ok: false, error: "modifier.canonicalName required" };
        }
        if (!Array.isArray(mod.aliases)) return { ok: false, error: "modifier.aliases required" };
        if (!mod.deltas || typeof mod.deltas !== "object") {
          return { ok: false, error: "modifier.deltas required" };
        }
      }
    }
  }
  return { ok: true, pack };
}

export function findPackForStore(packs, haystack) {
  const text = (haystack || "").toLowerCase();
  if (!text) return null;
  for (const pack of packs) {
    for (const hint of pack.matchHints) {
      if (text.includes(String(hint).toLowerCase())) return pack;
    }
  }
  return null;
}
```

- [ ] **Step 4: Create starter pack with ≥3 real items from the Feb 2026 PDF**

`extension/packs/mendocino-farms.json` (numbers must match the PDF; expand in Task 10):

```json
{
  "id": "mendocino-farms",
  "displayName": "Mendocino Farms",
  "version": 1,
  "matchHints": ["mendocino farms", "mendocino-farms"],
  "source": {
    "url": "https://contact.mendocinofarms.com/wp-content/uploads/2026/02/Feb2026_NutritionalAllergen.pdf",
    "label": "Mendocino Farms Nutritional & Allergen PDF (Feb 2026)"
  },
  "updatedAt": "2026-02-01",
  "remoteUrl": "https://raw.githubusercontent.com/shamilahfaria/menu-macros/main/packs/mendocino-farms.json",
  "items": [
    {
      "id": "the-farm-club",
      "canonicalName": "The Farm Club",
      "aliases": ["Farm Club", "The Farm Club Sandwich"],
      "calories": 760,
      "proteinG": 40,
      "carbsG": 69,
      "fatG": 34,
      "sodiumMg": 1620,
      "sugarG": 7,
      "fiberG": 6,
      "extras": [
        { "label": "Calories from fat", "value": "320" },
        { "label": "Saturated fat", "value": "8g" },
        { "label": "Trans fat", "value": "0g" },
        { "label": "Cholesterol", "value": "100mg" }
      ],
      "modifiers": [
        {
          "canonicalName": "Add Chicken",
          "aliases": ["Chicken", "Add chicken"],
          "deltas": { "calories": 110, "proteinG": 18, "fatG": 2, "sodiumMg": 60 }
        },
        {
          "canonicalName": "Add Avocado",
          "aliases": ["Avocado", "Add avocado"],
          "deltas": { "calories": 80, "fatG": 7, "fiberG": 3 }
        }
      ]
    }
  ]
}
```

**Important:** Re-check every number against the PDF before committing. If a PDF value differs, use the PDF. Include at least two more sandwich/salad items in the same commit so matcher tests have coverage.

- [ ] **Step 5: Add `scripts/sync-pack.mjs`**

```js
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
```

- [ ] **Step 6: Run sync + tests**

Run:
```bash
mkdir -p packs
npm run sync-pack
npm test
```
Expected: all pack tests PASS

- [ ] **Step 7: Commit**

```bash
git add extension/lib/pack.js extension/packs packs scripts/sync-pack.mjs tests/pack.test.js
git commit -m "Add nutrition pack schema validation and Mendocino starter pack"
```

---

### Task 3: High-confidence matcher

**Files:**
- Create: `extension/lib/matcher.js`
- Create: `tests/matcher.test.js`

**Interfaces:**
- Consumes: pack `items[]` / `modifiers[]` with `canonicalName` + `aliases`
- Produces:
  - `export function normalizeName(name: string): string`
  - `export function matchItem(name: string, items: Item[]): Item | null`
  - `export function matchModifier(name: string, modifiers: Modifier[]): Modifier | null`

- [ ] **Step 1: Write failing matcher tests**

```js
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
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test`
Expected: FAIL missing matcher module

- [ ] **Step 3: Implement `extension/lib/matcher.js`**

```js
const FILLER = new Set(["the", "a", "an", "and", "with", "w"]);

export function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/w\//g, " with ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFiller(normalized) {
  return normalized
    .split(" ")
    .filter((tok) => tok && !FILLER.has(tok))
    .join(" ");
}

function candidatesFor(entry) {
  return [entry.canonicalName, ...(entry.aliases || [])].map(normalizeName);
}

function matchInList(name, list) {
  const needle = normalizeName(name);
  if (!needle) return null;

  const exact = [];
  for (const entry of list) {
    if (candidatesFor(entry).includes(needle)) exact.push(entry);
  }
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const strippedNeedle = stripFiller(needle);
  const strippedHits = [];
  for (const entry of list) {
    const opts = candidatesFor(entry).map(stripFiller);
    if (opts.includes(strippedNeedle)) strippedHits.push(entry);
  }
  if (strippedHits.length === 1) return strippedHits[0];
  return null;
}

export function matchItem(name, items) {
  return matchInList(name, items || []);
}

export function matchModifier(name, modifiers) {
  return matchInList(name, modifiers || []);
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extension/lib/matcher.js tests/matcher.test.js
git commit -m "Add high-confidence menu name matcher"
```

---

### Task 4: Storage + pack resolution

**Files:**
- Create: `extension/lib/storage.js`
- Modify: `extension/background.js`
- Create: `tests/storage.test.js` (logic that does not need chrome — pure helpers)

**Interfaces:**
- Produces:
  - `export const STORAGE_KEYS = { packs: "packs", meta: "meta" }`
  - `export function pickPacks(storedPacks, bundledPacks): RestaurantPack[]` — prefer stored if `version` ≥ bundled and `validatePack` ok
  - `export async function getPacks(): Promise<RestaurantPack[]>` (chrome)
  - `export async function savePacks(packs, meta): Promise<void>` (chrome)
  - Background seeds bundled pack on install

- [ ] **Step 1: Write failing pure helper test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pickPacks } from "../extension/lib/storage.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(
  readFileSync(join(root, "extension/packs/mendocino-farms.json"), "utf8")
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
```

- [ ] **Step 2: Implement `extension/lib/storage.js`**

```js
import { validatePack } from "./pack.js";

export const STORAGE_KEYS = { packs: "packs", meta: "meta" };

export function pickPacks(storedPacks, bundledPacks) {
  const byId = new Map();
  for (const pack of bundledPacks || []) {
    const v = validatePack(pack);
    if (v.ok) byId.set(v.pack.id, v.pack);
  }
  for (const pack of storedPacks || []) {
    const v = validatePack(pack);
    if (!v.ok) continue;
    const current = byId.get(v.pack.id);
    if (!current || v.pack.version >= current.version) byId.set(v.pack.id, v.pack);
  }
  return [...byId.values()];
}

export async function getBundledPacks() {
  const url = chrome.runtime.getURL("packs/mendocino-farms.json");
  const res = await fetch(url);
  const json = await res.json();
  const v = validatePack(json);
  if (!v.ok) throw new Error(v.error);
  return [v.pack];
}

export async function getPacks() {
  const bundled = await getBundledPacks();
  const data = await chrome.storage.local.get([STORAGE_KEYS.packs]);
  return pickPacks(data[STORAGE_KEYS.packs], bundled);
}

export async function savePacks(packs, meta) {
  const valid = [];
  for (const pack of packs) {
    const v = validatePack(pack);
    if (v.ok) valid.push(v.pack);
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.packs]: valid,
    [STORAGE_KEYS.meta]: meta || {},
  });
}

export async function getMeta() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.meta]);
  return data[STORAGE_KEYS.meta] || {};
}
```

- [ ] **Step 3: Seed on install in `background.js`**

```js
import { getBundledPacks, savePacks, getMeta } from "./lib/storage.js";

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const packs = await getBundledPacks();
    const meta = await getMeta();
    if (!meta.lastRefreshAt) {
      await savePacks(packs, { lastRefreshAt: null, lastRefreshOk: null });
    }
  } catch {
    // silent
  }
});
```

- [ ] **Step 4: Run unit tests**

Run: `npm test`
Expected: storage helper tests PASS

- [ ] **Step 5: Commit**

```bash
git add extension/lib/storage.js extension/background.js tests/storage.test.js
git commit -m "Add pack storage with bundled fallback preference"
```

---

### Task 5: Nutrition strip UI (Shadow DOM)

**Files:**
- Create: `extension/content/ui.js`
- Create: `tests/ui.test.js`

**Interfaces:**
- Consumes: matched item (`calories`, macros, `extras`) or `null` for unavailable
- Produces:
  - `export function createNutritionStrip({ item, priceText? }): HTMLElement`
  - `export function createModifierDelta(modifier): HTMLElement | null`
  - Host element class: `mm-root` (outside shadow); internals use shadow CSS only

- [ ] **Step 1: Write UI tests with happy-dom or minimal DOM stub**

Prefer zero deps: test pure HTML string builders first.

Add to `extension/content/ui.js`:
- `export function formatMacros(item)` → array of `{ label, value }`
- `export function formatExtras(item)` → extras or `[]`
- `export function shouldShowMagnifier(item)` → boolean

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMacros,
  shouldShowMagnifier,
  formatDeltaText,
} from "../extension/content/ui.js";

test("formatMacros order is fixed", () => {
  const rows = formatMacros({
    proteinG: 40,
    carbsG: 69,
    fatG: 34,
    sodiumMg: 1620,
    sugarG: 7,
    fiberG: 6,
  });
  assert.deepEqual(
    rows.map((r) => r.label),
    ["Protein", "Carbs", "Fat", "Sodium", "Sugar", "Fiber"]
  );
});

test("magnifier only when extras exist", () => {
  assert.equal(shouldShowMagnifier({ extras: [] }), false);
  assert.equal(shouldShowMagnifier({ extras: [{ label: "Sat fat", value: "8g" }] }), true);
});

test("formatDeltaText compact", () => {
  assert.equal(
    formatDeltaText({ deltas: { calories: 110, proteinG: 18 } }),
    "+110 cal · +18g P"
  );
});
```

- [ ] **Step 2: Implement formatters + DOM builders in `ui.js`**

Implement:
- `formatMacros`, `shouldShowMagnifier`, `formatDeltaText` as tested
- `createNutritionStrip({ item })`:
  - matched: price row left empty slot (caller may set price), calories right; 3×2 grid; footer `Base item · excludes customizations`; optional 🔍 with hover popover listing `extras`
  - unmatched (`item == null`): `—` cells; footer `Nutrition unavailable`
- Use `host.attachShadow({ mode: "open" })` and inline `<style>` inside shadow with DoorDash-quiet styles from the design mock (system font, `#191919` / `#6b6b6b` / `#9a9a9a`, hairline `#f0f0f0`)
- `createModifierDelta(mod)` returns a small span with `formatDeltaText` or `null` if no deltas

- [ ] **Step 3: Run tests — PASS**

Run: `npm test`

- [ ] **Step 4: Commit**

```bash
git add extension/content/ui.js tests/ui.test.js
git commit -m "Add Shadow DOM nutrition strip and delta formatters"
```

---

### Task 6: DoorDash DOM adapter + menu list injection

**Files:**
- Create: `extension/content/doordash.js`
- Modify: `extension/content/content.js`

**Interfaces:**
- Produces:
  - `export function getStoreHaystack(doc = document): string`
  - `export function findMenuItemNodes(doc = document): Array<{ root: Element, name: string, priceEl: Element | null, mountEl: Element }>`
  - `export function isItemDetailPage(doc = document): boolean`
  - Content script: if pack found, paint strips; if not, do nothing on page

**DoorDash selector strategy (discover live, then lock):**

DoorDash class names are often hashed. Prefer stable attributes/text structure:

1. Load Mendocino Farms on DoorDash with the extension.
2. In DevTools, find a menu card containing the item name + price.
3. Choose the mount point as the element that wraps name+price (insert strip as next sibling or last child).
4. Encode selectors in `doordash.js` with a short comment of the date discovered.
5. If selectors fail, `findMenuItemNodes` returns `[]` — never throw into the page.

Starter heuristic (replace after inspection):

```js
export function getStoreHaystack(doc = document) {
  const title = doc.querySelector("h1")?.textContent || "";
  return `${title} ${doc.title} ${location.pathname}`;
}

export function findMenuItemNodes(doc = document) {
  // TODO replace with inspected selectors — keep defensive.
  const nodes = [];
  for (const root of doc.querySelectorAll('[data-anchor-id*="MenuItem"], [class*="MenuItem"]')) {
    const nameEl =
      root.querySelector("h3, h2, [class*='ItemName'], [data-testid*='name']") ||
      root.querySelector("span");
    const name = nameEl?.textContent?.trim();
    if (!name || name.length < 2) continue;
    const priceEl = root.querySelector('[class*="Price"], [data-testid*="price"]');
    nodes.push({ root, name, priceEl, mountEl: nameEl.parentElement || root });
  }
  return nodes;
}
```

- [ ] **Step 1: Implement `doordash.js` with defensive queries + comments**

- [ ] **Step 2: Wire `content.js`**

```js
import { getPacks } from "../lib/storage.js";
import { findPackForStore } from "../lib/pack.js";
import { matchItem } from "../lib/matcher.js";
import { getStoreHaystack, findMenuItemNodes, isItemDetailPage } from "./doordash.js";
import { createNutritionStrip } from "./ui.js";

const MARK = "data-mm-painted";

async function paintList() {
  const packs = await getPacks();
  const pack = findPackForStore(packs, getStoreHaystack());
  if (!pack) return;

  for (const node of findMenuItemNodes()) {
    if (node.root.getAttribute(MARK) === "1") continue;
    const item = matchItem(node.name, pack.items);
    const strip = createNutritionStrip({ item });
    node.mountEl.insertAdjacentElement("afterend", strip);
    node.root.setAttribute(MARK, "1");
  }
}

async function boot() {
  if (isItemDetailPage()) return; // Task 7
  await paintList();
  const obs = new MutationObserver(() => {
    paintList().catch(() => {});
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

boot().catch(() => {});
```

- [ ] **Step 3: Manual verify on real Mendocino DoorDash page**

Checklist:
- Matched items show aligned grid
- Unknown items show `—`
- Non-Mendocino store: no strips
- Scroll/load more: new cards get strips
- DoorDash layout not broken

- [ ] **Step 4: Record working selectors in `doordash.js` comments + update `docs/manual-qa.md`**

- [ ] **Step 5: Commit**

```bash
git add extension/content/doordash.js extension/content/content.js docs/manual-qa.md
git commit -m "Inject nutrition strips into DoorDash menu cards"
```

---

### Task 7: Item detail page + modifier deltas

**Files:**
- Modify: `extension/content/doordash.js`
- Modify: `extension/content/content.js`
- Modify: `extension/content/ui.js` (if needed)

**Interfaces:**
- Produces:
  - `export function findDetailItemName(doc): string | null`
  - `export function findModifierNodes(doc): Array<{ root: Element, name: string, mountEl: Element }>`
  - Detail paint: base strip near header; deltas beside modifiers

- [ ] **Step 1: Extend `doordash.js` with detail/modifier discovery (inspect live)**

```js
export function isItemDetailPage(doc = document) {
  return /\/item\/|\/product\//i.test(location.pathname) ||
    Boolean(doc.querySelector('[data-testid*="Modifier"], [class*="Modifier"]'));
}
```

Refine against real DOM.

- [ ] **Step 2: Paint detail in `content.js`**

```js
async function paintDetail() {
  const packs = await getPacks();
  const pack = findPackForStore(packs, getStoreHaystack());
  if (!pack) return;
  const name = findDetailItemName();
  if (!name) return;
  const item = matchItem(name, pack.items);
  // mount base strip once near header
  // for each modifier node: matchModifier against item?.modifiers || []; mount createModifierDelta
}
```

Only show deltas when `item` matched and modifier high-confidence matched.

- [ ] **Step 3: Manual verify**

- Open a Farm Club (or similar) item
- Base macros appear
- Add Chicken / Add Avocado show `+N cal · +Ng P` when pack has deltas
- Unknown modifier: no delta

- [ ] **Step 4: Commit**

```bash
git add extension/content/doordash.js extension/content/content.js extension/content/ui.js docs/manual-qa.md
git commit -m "Show base macros and modifier deltas on item detail"
```

---

### Task 8: Silent weekly refresh

**Files:**
- Modify: `extension/background.js`
- Modify: `extension/lib/storage.js` (if needed)
- Modify: `extension/manifest.json` (host_permissions already set)

**Interfaces:**
- Produces:
  - Alarm name `mm-pack-refresh` period 10080 minutes (7 days)
  - `async function refreshPacks({ reason: "alarm" | "manual" }): Promise<{ ok: boolean }>`
  - On failure: leave storage unchanged; no UI chrome
  - Message: `{ type: "MM_REFRESH" }` → refresh; `{ type: "MM_STATUS" }` → meta

- [ ] **Step 1: Implement silent refresh in `background.js`**

```js
import { getBundledPacks, getPacks, savePacks, getMeta } from "./lib/storage.js";
import { validatePack } from "./lib/pack.js";

const ALARM = "mm-pack-refresh";

async function refreshPacks() {
  try {
    const current = await getPacks();
    const updated = [];
    for (const pack of current) {
      if (!pack.remoteUrl) {
        updated.push(pack);
        continue;
      }
      const res = await fetch(pack.remoteUrl, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      const v = validatePack(json);
      if (!v.ok) throw new Error(v.error);
      if (v.pack.id !== pack.id) throw new Error("id mismatch");
      updated.push(v.pack);
    }
    await savePacks(updated, {
      lastRefreshAt: new Date().toISOString(),
      lastRefreshOk: true,
    });
    return { ok: true };
  } catch {
    const meta = await getMeta();
    await chrome.storage.local.set({
      meta: { ...meta, lastRefreshOk: false, lastRefreshAttemptAt: new Date().toISOString() },
    });
    return { ok: false };
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  // existing seed…
  await chrome.alarms.create(ALARM, { periodInMinutes: 60 * 24 * 7 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) refreshPacks();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "MM_REFRESH") {
    refreshPacks().then(sendResponse);
    return true;
  }
  if (msg?.type === "MM_STATUS") {
    getMeta().then((meta) => sendResponse({ meta }));
    return true;
  }
});
```

Never call `chrome.notifications` or set badge text.

- [ ] **Step 2: Manual verify silence**

- Trigger refresh via temporary call from service worker console
- Fail URL → last pack remains; no toast
- DoorDash page unchanged during refresh

- [ ] **Step 3: Commit**

```bash
git add extension/background.js
git commit -m "Add silent weekly nutrition pack refresh"
```

---

### Task 9: Minimal popup (opt-in only)

**Files:**
- Modify: `extension/popup/popup.html`
- Modify: `extension/popup/popup.css`
- Modify: `extension/popup/popup.js`

**Interfaces:**
- Consumes: `MM_STATUS`, `MM_REFRESH` messages
- Shows: active pack name(s), last refresh time, last ok/fail, Refresh button
- Never opens itself

- [ ] **Step 1: Implement popup UI**

```js
async function render() {
  const packs = await chrome.runtime.sendMessage({ type: "MM_GET_PACKS" }); // add handler
  const { meta } = await chrome.runtime.sendMessage({ type: "MM_STATUS" });
  // fill #status with pack displayName + lastRefreshAt + ok flag
}

document.getElementById("refresh").addEventListener("click", async () => {
  const btn = document.getElementById("refresh");
  btn.disabled = true;
  await chrome.runtime.sendMessage({ type: "MM_REFRESH" });
  await render();
  btn.disabled = false;
});

render();
```

Add `MM_GET_PACKS` handler in background that returns `getPacks()` summary (`id`, `displayName`, `updatedAt`, `version` only).

- [ ] **Step 2: Verify popup never auto-opens; refresh works when clicked**

- [ ] **Step 3: Commit**

```bash
git add extension/popup extension/background.js
git commit -m "Add opt-in popup status and manual refresh"
```

---

### Task 10: Complete Mendocino pack from official PDF

**Files:**
- Modify: `extension/packs/mendocino-farms.json`
- Modify: `packs/mendocino-farms.json` via `npm run sync-pack`
- Modify: `docs/manual-qa.md`

**Interfaces:**
- Produces: pack covering current DoorDash Mendocino menu items (full sandwiches/salads as listed in PDF), plus common add-on modifiers from the PDF add-ons section
- Every primary number and extra field transcribed from:
  `https://contact.mendocinofarms.com/wp-content/uploads/2026/02/Feb2026_NutritionalAllergen.pdf`
- Aliases include DoorDash title variants observed during Task 6/7

- [ ] **Step 1: Download PDF and transcribe items into JSON**

For each menu item DoorDash shows for Mendocino Farms:
1. Find the PDF row
2. Fill primary macros
3. Put remaining published nutrient columns into `extras[]` with labels matching the PDF headers
4. Add modifier deltas from add-ons section where published

- [ ] **Step 2: Validate**

```bash
npm run sync-pack
npm test
```

- [ ] **Step 3: Side-by-side spot check**

Pick 5 DoorDash items; confirm calories/protein match PDF.

- [ ] **Step 4: Commit**

```bash
git add extension/packs/mendocino-farms.json packs/mendocino-farms.json docs/manual-qa.md
git commit -m "Complete Mendocino Farms nutrition pack from official PDF"
```

---

### Task 11: Manual QA pass + README polish

**Files:**
- Modify: `docs/manual-qa.md`
- Modify: `README.md`

- [ ] **Step 1: Fill `docs/manual-qa.md` with checkboxes from the spec test plan**

```markdown
# Manual QA

- [ ] Mendocino store: matched macros align in 3×2 grid
- [ ] Unknown item: em dashes + "Nutrition unavailable"
- [ ] 🔍 appears only when extras exist; hover lists dynamic extras
- [ ] Scroll / category change still paints new cards
- [ ] Item detail: base + modifier deltas
- [ ] Non-Mendocino DoorDash store: no overlay
- [ ] Offline / blocked refresh: last pack still renders; no toast
- [ ] Popup opens only on click; refresh updates meta quietly
```

- [ ] **Step 2: Run full checklist on a real Mendocino Farms DoorDash page**

- [ ] **Step 3: README — usage, permissions rationale, data source link**

- [ ] **Step 4: Commit**

```bash
git add docs/manual-qa.md README.md
git commit -m "Document manual QA and extension usage"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| MV3 content script on DoorDash | 1, 6 |
| Mendocino pack + provenance | 2, 10 |
| High-confidence matcher | 3 |
| Bundled + storage fallback | 4 |
| Layout B native strip + aligned grid | 5, 6 |
| Unavailable state | 5, 6 |
| Dynamic 🔍 extras | 5 |
| Modifier deltas on detail | 7 |
| Silent weekly + manual refresh | 8, 9 |
| No noisy unsupported-store UI | 6 |
| Manual test plan | 11 |

## Placeholder / consistency check

- No TBD steps remain; DoorDash selectors are explicitly “inspect then lock” inside Task 6/7 with defensive empty behavior until locked.
- Types/names consistent: `validatePack`, `matchItem`, `matchModifier`, `createNutritionStrip`, `getPacks`, `MM_REFRESH`.
- `remoteUrl` lives on the pack object; refresh uses that field.

---

## Execution handoff

Plan complete and saved to `docs/plans/2026-08-08-menu-macros-mvp.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
