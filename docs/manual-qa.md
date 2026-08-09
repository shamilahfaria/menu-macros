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

## Task 10 — Complete Mendocino pack from official PDF (2026-08-08)

**Status: pack complete and verified against the PDF; storefront coverage
still unverified** (same missing DoorDash session as Tasks 6 and 7).

The pack grew from the 3-item starter to **101 items and 14 add-on modifiers**,
covering every row on pages 1-3 of the Feb 2026 Nutritional & Allergen PDF:
seasonal, sandwiches, half sandwiches, salads (and their "without dressing"
rows), wraps, kids meals, dressings & sauces, breads, deli sides, soups and
beverages.

### Data provenance

Numbers were not typed by hand. The PDF was downloaded and converted with
`pdftotext -layout`, then a throwaway script mapped each table row to an item.
The column order is fixed by the PDF header: Serving, Calories, Calories from
Fat, Total Fat, Saturated Fat, Trans Fat, Cholesterol, Sodium, Carbohydrates,
**Fiber, Total Sugar**, Protein. Note fiber precedes sugar — reading those two
in the printed order matters, and `Lemonade (16 oz)` (0 g fiber / 58 g sugar)
is the easiest row to confirm it on.

Conventions applied:

- Primary macros are the seven the strip renders; the remaining published
  columns go to `extras[]` labelled with the PDF's own header text.
- Where the PDF prints `< 1g`, the numeric field is `0` and an extras row
  (e.g. `Protein (g) as published` / `< 1g`) preserves the printed value. In
  modifier `deltas` the key is omitted entirely rather than guessed.
- Add-on deltas are attached only to the items the PDF publishes them under.
  The same add-on is published with different sodium in different sections
  (Chicken Adobado is 500 mg under salads, 520 mg under wraps), so they are
  not copied across items.

### What was verified

- `npm run sync-pack` passes `validatePack` and `packs/` matches `extension/packs/`.
- `npm test` — 50/50 passing (3 new pack tests).
- A second script re-parsed the PDF with a different splitter (right-anchored
  regex rather than column gutters) and reconciled all 115 in-scope rows
  against the JSON; the only differences were the intentionally omitted
  `< 1g` delta keys.
- Hand spot-check of 5 items against the printed rows: The Farm Club
  (760/40 P), Chicken Parm Dip (940/46 P), Thai Mango Salad (840/35 P),
  Golden State Cobb (750/30 P), Modern Caesar Wrap (1090/26 P) — all match.
- The real `matchItem`/`matchModifier` were run against DoorDash-style titles
  ("Farm Club", "Not So Fried Chicken Sandwich", "Golden State Cobb Salad",
  "1/2 The Farm Club", …) and all resolved; "Some Random Burrito" and
  "Add Avocado" correctly miss.
- The generator fails loudly if any two items share a normalized name or
  alias, and `pack.test.js` now asserts the same property on the shipped file,
  so an ambiguous alias can't silently make an item unmatchable.

### What is NOT yet verified (requires a live DoorDash session)

- [ ] Compare the storefront's actual section list against the pack — the PDF
      is the full brand menu, and a given store may not carry every row.
- [ ] Confirm DoorDash's item titles match the aliases (especially the
      seasonal items, which rotate, and the sized rows below).
- [ ] Sized items (`Iced Tea (16 oz)`, `Curried Couscous (Small)`, soups
      `(Cup)`/`(Bowl)`) are separate pack items. If DoorDash instead lists one
      item with a size *modifier*, those need aliases or size deltas.
- [ ] `(No Dressing)` rows are separate items. If DoorDash exposes "no
      dressing" as a modifier instead, it will show no delta (the PDF
      publishes absolute rows, not deltas, so none were derived).
- [ ] Confirm which add-ons the storefront actually offers per item.

### Known oddity in the source data

`The Farmhouse Ranch Salad` is published as 350 cal at 15.2 oz, but its
"without dressing" row is **460 cal at 16.0 oz** — heavier and higher-calorie
than the dressed salad, unlike every other salad pair in the PDF. Both rows
are transcribed as printed rather than "corrected". This is one reason no
`No Dressing` deltas were derived by subtraction: on this pair the subtraction
would produce a nonsensical *positive* calorie delta. Worth raising with
Mendocino Farms or re-checking against the next PDF revision.
