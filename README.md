# menu-macros

Chrome extension that shows nutrition facts inline on food-ordering sites.

**MVP:** Mendocino Farms on DoorDash — calories and main macros on every menu tile, no hover required to compare.

Design: [`docs/2026-08-08-menu-macros-mvp-design.md`](docs/2026-08-08-menu-macros-mvp-design.md)

## Usage

1. Load the extension (steps below).
2. Open any DoorDash store page at `https://www.doordash.com/`.
3. On a **supported store** (Mendocino Farms for the MVP), each menu card gets a nutrition strip under the title/price: price left, calories right, then a fixed **3×2 macro grid** (Protein, Carbs, Fat, Sodium, Sugar, Fiber) so you can scan and compare items without opening each one.
4. Items the pack cannot match show em dashes (`—`) and **Nutrition unavailable** — the extension never guesses.
5. Click an item to customize: the detail view shows the same base strip plus compact **modifier deltas** (e.g. `+110 cal · +18g P`) when the pack defines them.
6. A small **🔍** control appears only when extra fields exist for that item; hover to see serving size, saturated fat, cholesterol, and other published columns from the source PDF.
7. **Popup (optional):** click the toolbar icon to see which pack is loaded, when it last refreshed, and a **Refresh** button. The popup never opens on its own; refresh is silent (no toasts or badges).

On DoorDash stores **without** a nutrition pack, the extension stays quiet — no on-page overlay.

Manual acceptance checklist: [`docs/manual-qa.md`](docs/manual-qa.md)

## Load unpacked (dev)

1. Clone this repo, run `npm install`, then `npm test` to confirm the suite passes.
2. Run `npm run build`. Chrome's Manifest V3 content scripts can't use `"type": "module"`, so this bundles the ES-module source at `extension/content/content.js` into a plain script, `extension/content/content.bundle.js` (git-ignored, generated), which is what the manifest actually loads. The background service worker still runs from source (`extension/background.js`) since MV3 service workers do support `type: "module"`.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** (top right).
5. Click **Load unpacked** and select the **`extension/`** folder (not the repo root).
6. Pin the extension if you like; open a Mendocino Farms store on DoorDash and confirm strips appear on menu cards.
7. In the extension details page, verify the service worker is active and the content script is listed for `https://www.doordash.com/*`.
8. After editing anything under `extension/content/` or `extension/lib/`, re-run `npm run build` and click the reload icon for the extension on `chrome://extensions`.

To update the bundled nutrition pack after editing `packs/mendocino-farms.json`, run `npm run sync-pack` before reloading the extension.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Cache the nutrition pack and refresh metadata in `chrome.storage.local` so pages load quickly and offline refresh failures still serve the last good pack. |
| `alarms` | Run a silent weekly check for an updated pack from GitHub (`mm-pack-refresh`). |
| `https://www.doordash.com/*` (host) | Inject the content script that reads menu DOM and paints nutrition strips only on DoorDash. |
| `https://raw.githubusercontent.com/shamilahfaria/menu-macros/*` (host) | Fetch updated pack JSON from the repo's raw URL (`remoteUrl` on each pack). |

The extension does **not** request `<all_urls>`, notifications, or background sync beyond the weekly alarm. Refresh failures are recorded in storage only — no user-facing toast.

## Data source

Nutrition numbers for Mendocino Farms come from the official published PDF:

**[Mendocino Farms Nutritional & Allergen PDF (Feb 2026)](https://contact.mendocinofarms.com/wp-content/uploads/2026/02/Feb2026_NutritionalAllergen.pdf)**

The curated JSON pack lives at `extension/packs/mendocino-farms.json` (bundled fallback) and is also published at the pack's `remoteUrl` for silent refresh. Provenance and transcription notes are in [`docs/manual-qa.md`](docs/manual-qa.md#task-10--complete-mendocino-pack-from-official-pdf-2026-08-08).

## Development

```bash
npm test          # unit tests (matcher, UI, DOM adapters, background, pack) — runs against source modules, no build needed
npm run build     # bundle extension/content/content.js → extension/content/content.bundle.js (required to load/reload the extension)
npm run sync-pack # copy packs/*.json → extension/packs/ after validation
```
