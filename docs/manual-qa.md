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
