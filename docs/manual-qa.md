# Manual QA

Live QA run **2026-08-11** against the Mendocino Farms Los Angeles store
(`/store/mendocino-farms-los-angeles-5277/`) with the unpacked extension
loaded in Chrome.

The previous revision of this file was entirely unchecked because that session
had no browser access at all (`doordash.com` unreachable, no usable tab). That
is no longer the case. Items below are checked only where they were observed
on a live page, with the observation recorded.

Run `npm test` before manual QA (currently **69/69** passing).

## Spec checklist

- [x] **Matched item renders all seven macros, aligned** — band renders
      `800 cal · P 42g · C 57g · F 42g` over `Sodium 1180mg · Sugar 5g ·
      Fiber 4g` on the card photo. Verified on Chicken Pesto Caprese,
      Chimichurri Steak & Bacon, The Farm Club, Avocado & Quinoa, "Not So
      Fried" Chicken, The Modern Caesar, Turkey Avo Salsa Verde.
- [x] **Unknown item shows "Nutrition unavailable"** — Joe's Classic Chips and
      Spicy Curried Couscous render the quiet single-line variant. Coverage on
      the visible menu was 7/11; all four misses (chips, couscous, two chef's
      specials) are genuinely absent from the published PDF.
- [x] **Scroll / recycle still paints cards** — after scrolling, every mounted
      `[data-testid="MenuItem"]` still carries a band (`everyCardHasBand:
      true`). DoorDash recycles a fixed set of ~6-12 mounted cards.
- [x] **DoorDash's own layout is unaffected** — measured after injection:
      cards 246-266px against DoorDash's 301px virtualized row pitch, **0
      card overlaps**, price restored to its natural width (41px; it was
      being squeezed to 0 by the previous in-flow strip), descriptions,
      ratings and "#N Most liked" badges intact.
- [x] **Non-Mendocino store: no overlay** — Chipotle Mexican Grill (Austin)
      with 6 menu cards present: 0 strips, 0 injected styles, 0 mutated
      nodes.
- [x] **Item-detail modal is recognized** — `isItemDetailPage()` returns true
      on a real Chicken Pesto Caprese modal (dialog role + "Add 1 item to
      order"), and the heading resolves to "Chicken Pesto Caprese".
- [x] **Weekly refresh source is reachable** — `raw.githubusercontent.com/…/
      main/packs/mendocino-farms.json` returns 200 / 142 items
      unauthenticated. It returned **404 for the entire life of the project**
      until the repo was made public on 2026-08-11; every refresh silently
      failed into the catch and kept the bundled pack.
- [ ] **Modifier deltas render on a real modal** — the discovery and naming
      bugs below are fixed and unit-tested, but the fix has not yet been
      watched rendering on a live modal. **Needs an extension reload.**
- [ ] **Coverage line appears in the console** — `[menu-macros] pack coverage
      7/11` plus unmatched names. Shipped and unit-tested; not yet observed
      live. **Needs an extension reload.**
- [ ] **Popup opens only on click; refresh updates meta quietly** — requires
      clicking the browser toolbar, which is browser chrome that automation
      cannot drive. Must be done by hand.
- [ ] **Offline / blocked refresh: last pack still renders, no toast** —
      requires DevTools request blocking. Must be done by hand. Partial:
      `tests/background.test.js` asserts a failed refresh keeps prior packs
      and writes failure meta only, and the extension contains no
      notification, badge, or toast API calls.

### Superseded spec items

Two original items describe the pre-band design and are no longer meaningful:

- *"macros align in 3×2 grid, price left / calories right"* — the strip is now
  a photo-anchored overlay band, because DoorDash's menu grid is virtualized
  on a fixed row pitch and an in-flow strip cannot grow the card without
  overlapping the row below.
- *"🔍 appears only when extras exist"* — the band has no room for the
  magnifier, so `extras[]` and the "Base item · excludes customizations"
  caveat now appear only on the item-detail view.

## What live QA found that tests did not

Recorded because each was green in CI while broken in the browser.

1. **The strip was mounted inside DoorDash's price row**, a `nowrap` flex
   container. Its `flex: 0 0 100%` squeezed the price to **zero width** and
   overflowed the row by 34px.
2. **The card grid is virtualized** — wrappers are absolutely positioned on a
   fixed 301px pitch via transforms, so growing a card overlapped the next row
   by 46-66px. No CSS on the card can move a sibling's transform.
3. **Featured tiles have no `<img>` until their photo loads**, so photo
   lookup returned null and the band anchored to the wrong ancestor.
4. **Modifier rows were undiscoverable.** DoorDash renders none of the
   `OptionRow` / `ModifierOption` testids or classes the code looked for, and
   the `<label>` is a *sibling* of its `<input>`, not an ancestor — so all
   four strategies matched zero rows.
5. **Modifier names did not match** even in principle: DoorDash says
   `Extra Chicken` where the PDF says `Add Chicken`.
6. **Cards painted before the pack resolved were locked** as "Nutrition
   unavailable" permanently, because the paint mark was set unconditionally.

## How to run manual QA

1. `npm test` — confirm green.
2. `npm run build` — **required before every extension reload**; Chrome loads
   the generated bundle, not the source.
3. Reload the extension at `chrome://extensions`, then hard-refresh the store
   tab (Cmd+Shift+R). A stale bundle has already caused one false "it isn't
   working" report.
4. Open `https://www.doordash.com/store/mendocino-farms-los-angeles-5277/`.
   The generic `/store/mendocino-farms/` path is a 404 with no menu and has
   also produced a false failure report.
5. Open the console and read the coverage line; work the unmatched list.
6. Repeat on any non-Mendocino store for the no-overlay item.

## Known oddities in the source data

- `The Farmhouse Ranch Salad` is published as 350 cal at 15.2 oz, but its
  "without dressing" row is **460 cal at 16.0 oz** — heavier and higher
  calorie than the dressed salad, unlike every other pair in the PDF. Both are
  transcribed as printed rather than "corrected", and it is why no
  `No Dressing` deltas were derived by subtraction: on this pair subtraction
  yields a nonsensical positive calorie delta.
- DoorDash's own description for Chicken Pesto Caprese says **860 cal** while
  the June 2026 PDF row says **800**. Unresolved — possibly a bread variant,
  possibly DoorDash carrying newer data than the published PDF. Not
  reconciled; the pack follows the PDF.
