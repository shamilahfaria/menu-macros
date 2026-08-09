# menu-macros — MVP design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Repo:** https://github.com/shamilahfaria/menu-macros  

## Goal

Give diners transparent, always-visible nutrition facts on food-ordering pages so they can compare options at a glance — whether optimizing for protein, calories, sodium, or general awareness.

**MVP target:** Mendocino Farms on DoorDash.

## Non-goals (MVP)

- Other restaurants or platforms (Uber Eats, Grubhub, etc.)
- Sorting menu items by macro
- Showing uncertain / best-guess matches
- Live scraping restaurant sites from the browser at view time
- Chrome Web Store distribution
- Any user-facing sync UI, toasts, badges, or notifications about data refresh

## Product decisions

| Topic | Decision |
|---|---|
| Primary goal | Transparency; user goal varies by day |
| Activation | Auto-on for all DoorDash pages; nutrition overlay only when a pack matches the store |
| List page | Base-item macros + “excludes customizations” cue |
| Item detail | Base macros + inline modifier deltas when pack has them |
| Matching | High-confidence only; otherwise “unavailable” |
| Data | Curated nutrition pack + silent weekly refresh + optional manual refresh in popup |
| Refresh UX | Completely silent; never interrupt browsing |

## Architecture

Manifest V3 Chrome extension. No DoorDash API usage. Content script reads the DOM, matches names to a local nutrition pack, injects UI.

| Piece | Responsibility |
|---|---|
| Content script | Find menu tiles + modifier rows; inject/update nutrition UI; `MutationObserver` for SPA / infinite scroll |
| Nutrition pack | Per-restaurant JSON: items, aliases, primary macros, optional extras, optional modifiers |
| Matcher | Normalize names; high-confidence match only |
| Service worker | Weekly silent pack fetch; optional manual refresh; cache in `chrome.storage.local` |
| Popup | Opt-in only (user opens it): pack status, last refreshed, Refresh — never auto-opens |

**Data flow**

1. User opens a DoorDash store page → content script runs.
2. Detect store via URL / title / header against pack hints.
3. If Mendocino Farms pack matches → for each menu item node, match and render; else no overlay noise.
4. Item detail page: base block + per-modifier deltas on high-confidence modifier matches.
5. Weekly / manual refresh updates cached pack; content script reads latest (bundled pack is offline fallback).

## UI

### Menu list (Layout B — native DoorDash feel)

- Do **not** shrink or reflow DoorDash images.
- Inject a quiet strip under title/price.
- **Price left · calories right** on one baseline (`$14.50` … `720 cal`).
- **Primary macros** in a fixed **3×2 grid** (label above value), same order on every card for comparison:
  1. Protein  
  2. Carbs  
  3. Fat  
  4. Sodium  
  5. Sugar  
  6. Fiber  
- Footer line: `Base item · excludes customizations`.
- Styling: DoorDash-like system type, gray hierarchy, hairline divider only — no colored “extension” panels, pills, or badges.

### No nutrition data

- Keep the same grid footprint.
- Show `—` for calories and each macro cell.
- Footer: `Nutrition unavailable`.
- Muted gray — distinct while scanning, not alarming chrome.

### Extra details (🔍)

- Primary grid stays as above.
- Small gray magnifying-glass control in the macros pane.
- On hover: popover listing **whatever additional fields** that item’s pack entry provides (`extras[]`) — e.g. calories from fat, sat fat, trans fat, cholesterol, potassium, serving size, etc.
- Field set is **data-driven**, not hard-coded to Mendocino.
- If an item has no extras, **hide** the magnifier.

### Item detail / modifiers

- Same base macro strip near the item header.
- Beside each modifier option: compact delta when matched (e.g. `+120 cal · +18g P`).
- If space is tight: top macros inline; remaining detail on hover.
- Unmatched modifiers: no fake deltas.

### Unsupported store

- Extension may be active on DoorDash generally.
- No noisy on-page overlay without a pack.
- Popup (if opened) can note that no pack exists for this restaurant.

## Data & matching

### Pack schema (conceptual)

```text
RestaurantPack {
  id, displayName
  version               // integer; bump on breaking schema changes
  matchHints[]          // DoorDash name/slug patterns
  source { url, label }
  updatedAt
  items[] {
    id
    canonicalName
    aliases[]
    calories, proteinG, carbsG, fatG, sodiumMg, sugarG, fiberG
    extras[] { label, value }   // open-ended
    modifiers[] {
      canonicalName, aliases[]
      deltas { calories?, proteinG?, ... }
      extras[]?
    }
  }
}
```

### Matching rules (high-confidence only)

1. Normalize: lowercase; strip punctuation; collapse whitespace; `w/` → `with`; drop trademark noise.
2. Exact match on canonical name or alias → **hit**.
3. Else: equality after removing filler (`the`, `a`, size noise) **only if exactly one** unique candidate remains → **hit**.
4. Ambiguous or partial → **no data** (never show a maybe).

Same rules for modifier option labels.

### Provenance

Pack records the published restaurant source (PDF/page). Refresh pipeline re-ingests into the same schema.

## Refresh & hosting

- **Bundled pack** ships with the extension (works offline / first run).
- **Remote pack** hosted as static JSON in this repo (GitHub raw/Pages) — zero extra infra for MVP.
- **Build script** (local or CI later) converts Mendocino’s published nutrition source → pack JSON → publish URL.
- **Weekly** `chrome.alarms` fetch when Chrome is open; if due while closed, run on next startup.
- **Manual** refresh only via popup (for development / rare menu updates) — not part of everyday UX.

### Silent behavior (hard requirement)

- No browser notifications, toasts, badges, or auto-opened popup.
- Refresh success or failure: on-page UI unchanged.
- Failure → keep last good pack (or bundled).
- Schema mismatch → ignore remote; keep last good.
- Popup may show status **only if the user opens it**.

## Error handling

| Situation | Behavior |
|---|---|
| DoorDash DOM/selectors break | Do not inject; never break page layout |
| Unknown store | No overlay noise |
| Item/modifier unmatched | Unavailable / no delta |
| Network / refresh fail | Last good pack; silent on page |
| Pack missing extras | Hide 🔍 |

## Test plan (MVP)

1. Mendocino Farms store: matched items show aligned macros; unknowns show `—` / unavailable.
2. Scroll and category changes: strips survive via MutationObserver.
3. Item detail: base macros + modifier deltas where pack has them.
4. Non–Mendocino DoorDash store: no noisy overlay.
5. Offline: bundled/cached pack still renders.
6. Forced refresh failure: last good pack remains; no toast.
7. Item with extras shows 🔍; item without extras does not.

## Stretch (post-MVP)

- Sort menu by protein / calories / etc.
- More restaurant packs
- Other platforms if DOM strategy ports
- CI cron to rebuild published JSON

## Implementation notes

- Prefer reliable DOM injection (Layout B) over fighting DoorDash image sizing.
- Keep CSS scoped (shadow DOM or unique prefixes) to avoid leaking styles into DoorDash.
- Pack version field for forward-compatible storage migrations.
