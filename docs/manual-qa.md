# Manual QA

## Task 6 — DoorDash DOM adapter + menu list injection (2026-08-08)

**Status: blocked on live verification.** Neither the in-IDE browser tooling
nor a direct `fetch`/`WebFetch` of `doordash.com` was reachable from this
environment (no usable browser tab could be created; the direct fetch timed
out, likely bot/geo protection). Per the task brief's fallback, `doordash.js`
ships the defensive heuristic strategy instead of live-locked selectors, and
this is recorded here as an open concern rather than silently assumed done.

### What was verified

- Automated tests (`node --test tests/doordash.test.js`, part of `npm test`,
  32/32 passing) exercise `getStoreHaystack`, `findMenuItemNodes`, and
  `isItemDetailPage` against real parsed DOM trees (via `jsdom`), covering:
  - the primary `[data-anchor-id*="MenuItem"]` selector path,
  - the hashed-class/`data-testid` fallback path,
  - empty-list behavior when no cards match,
  - no-throw behavior when `querySelectorAll`/`querySelector` throw.
- `findMenuItemNodes` never throws into the page — all queries are wrapped
  and degrade to `[]`.
- `content.js` wiring matches the brief: paints only when `findPackForStore`
  matches, marks painted nodes with `data-mm-painted`, re-runs on
  `MutationObserver` mutations, and returns early on `isItemDetailPage()`.

### What is NOT yet verified (requires a live DoorDash session)

- [ ] Load a real Mendocino Farms DoorDash store page with the unpacked
      extension installed.
- [ ] Confirm `[data-anchor-id*="MenuItem"]` (or the class/`data-testid`
      fallback) actually matches DoorDash's current menu-card markup.
- [ ] Matched items show the aligned macro grid; unknown items show `—`.
- [ ] Visiting a non-Mendocino DoorDash store shows no strips.
- [ ] Scrolling / "load more" produces new cards that get strips (via the
      `MutationObserver`).
- [ ] DoorDash's native layout (image sizing, card spacing) is unaffected.
- [ ] `isItemDetailPage()`'s dialog heuristic correctly recognizes an open
      item-customization modal on a real page (this only guards against
      double-painting the list; Task 7 owns the actual item-detail view).

### Next steps for whoever gets a working DoorDash session

1. Open a Mendocino Farms store on `doordash.com` with the extension loaded.
2. In DevTools, inspect a menu card and confirm/adjust the selectors in
   `extension/content/doordash.js` (each query is centralized in
   `candidateRoots`, `findNameEl`, `findPriceEl`, and the `isItemDetailPage`
   modal check).
3. Update the dated comment block at the top of `doordash.js` with the new
   discovery date and findings, then check off the boxes above.

## Task 7 — Item detail page + modifier deltas (2026-08-08)

**Status: blocked on live verification**, same root cause as Task 6: no
in-IDE browser tab could be created (`browser_tabs` lists none, and
`browser_navigate` to `doordash.com` and to a blank/new tab both fail with
"No browser tab available" in this environment). `findDetailNameEl` /
`findDetailItemName` / `findModifierNodes` in `doordash.js` therefore ship as
documented defensive heuristics — layered stable-attribute → hashed-class →
generic-DOM-shape fallbacks, all wrapped so a selector miss degrades to
`null`/`[]` instead of throwing into the host page — not live-locked
selectors.

### What was verified

- `node --test tests/doordash.test.js` (part of `npm test`, 38/38 passing)
  exercises `findDetailItemName` and `findModifierNodes` against real parsed
  DOM (via `jsdom`), covering:
  - `h1`/`h2` heading match inside an open `role="dialog"` modal,
  - `data-testid`/class-substring fallback when no heading is present,
  - `null`/`[]` when no name/rows are found, and when the document throws,
  - modifier option rows via `data-testid`/class row selectors,
  - modifier option fallback via `<label>` wrapping a `checkbox`/`radio`
    input when no row-selector matches,
  - trailing `+$1.50`-style price text stripped from the option name so it
    doesn't pollute matching.
- `content.js`'s `paintDetail` matches the brief: mounts the base strip once
  near the detail header (marked `data-mm-detail-strip` to avoid
  re-mounting on `MutationObserver` re-runs); only attempts modifier deltas
  when the item itself is a high-confidence `matchItem` hit; each modifier
  row only gets a delta span when `matchModifier` is also a high-confidence
  hit (unknown/ambiguous modifiers show nothing, never a wrong number);
  `boot()` now routes to `paintDetail()` vs `paintList()` based on
  `isItemDetailPage()` on every observed mutation, instead of the old
  early-return no-op on detail pages.
- No linter errors in changed files.

### What is NOT yet verified (requires a live DoorDash session)

- [ ] Open a Farm Club (or similar Mendocino Farms) item detail view.
- [ ] Confirm the header-name selectors in `findDetailNameEl` actually match
      DoorDash's current item-detail markup (heading text vs. `data-testid`/
      hashed-class fallback).
- [ ] Confirm the modifier-row selectors in `findModifierNodes` match real
      "Add Chicken" / "Add Avocado"-style option rows (row-container vs.
      checkbox/radio-`<label>` fallback), and that price text (e.g.
      `+$1.50`) is correctly stripped from the option name before matching.
- [ ] Base macros strip appears once near the header, doesn't duplicate on
      re-render.
- [ ] Known modifiers (e.g. Add Chicken / Add Avocado) show a
      `+N cal · +Ng P` delta beside the option when the pack defines deltas.
- [ ] Unknown/ambiguous modifiers show no delta (never a wrong number).
- [ ] Visiting a non-Mendocino store's item detail shows no strip/deltas.

### Next steps for whoever gets a working DoorDash session

1. Open a Mendocino Farms item detail view on `doordash.com` with the
   extension loaded.
2. In DevTools, inspect the header name and a modifier option row; adjust
   the selectors in `extension/content/doordash.js` (`detailNameCandidates`,
   `MODIFIER_ROW_SELECTORS`, `findModifierNameEl`) as needed.
3. Update the dated comment block above `findModalRoot` in `doordash.js`
   with the new discovery date and findings, then check off the boxes above.
