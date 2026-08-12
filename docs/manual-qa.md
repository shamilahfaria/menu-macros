# Manual QA

Live QA run **2026-08-11** (all 11 items verified) against the Mendocino Farms Los Angeles store
(`/store/mendocino-farms-los-angeles-5277/`) with the unpacked extension
loaded in Chrome.

The previous revision of this file was entirely unchecked because that session
had no browser access at all (`doordash.com` unreachable, no usable tab). Every
item is now verified against a live page, with the observation recorded.

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
- [x] **Modifier deltas render on a real modal** — Avocado & Quinoa Superfood
      Ensalada: the "Add Chicken +$4.74" row renders
      `+110 cal · +20g P · 0g C · +2.5g F · +500mg Na · 0g S · 0g Fi` inline.
      31 toggle rows discovered, 1 delta shown — the other 30 options have no
      published deltas and correctly show nothing. The detail strip itself
      renders above DoorDash's content with the 3x2 macro grid, the
      "Base item · excludes customizations" caveat and the extras magnifier.
      Note DoorDash names this row "Add Chicken" here and "Extra Chicken"
      on Chicken Pesto Caprese; both now resolve.
- [x] **Coverage line appears in the console** — observed live:
      `[menu-macros] pack coverage 10/14` with the four unmatched names, at
      console.debug level so it stays hidden during normal use.
- [x] **Popup opens only on click; refresh updates meta quietly** — verified
      by hand 2026-08-11. Refresh succeeded and updated the status quietly,
      with no toast, badge or page notification. This was the first refresh
      that *could* succeed: the source returned 404 until the repo was made
      public earlier the same day.
- [x] **Offline / blocked refresh: last pack still renders, no toast** —
      verified by hand 2026-08-11. Set the *service worker's* DevTools to
      Offline (request blocking in the page's DevTools does not apply: the
      refresh fetch runs in the background worker, a separate context with
      its own network stack). Refresh reported failure quietly and strips
      continued rendering from the stored pack after a hard reload. No toast,
      badge or page notification at any point.

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
- **DoorDash's inline calorie notes disagree with the PDF on ~2/3 of items.**
  Measured 2026-08-11 across the six cards whose descriptions carry a
  `(N cal)` note:

  | Item | DoorDash | PDF / pack | Δ |
  | --- | --- | --- | --- |
  | The Modern Caesar | 610 | 680 | −70 |
  | Chicken Pesto Caprese | 860 | 800 | +60 |
  | Peruvian Steak | 760 | 780 | −20 |
  | Chimichurri Steak & Bacon | 940 | 950 | −10 |
  | Avocado & Quinoa Superfood Ensalada | 690 | 690 | 0 |
  | The Farm Club | 760 | 760 | 0 |

  This is **not** a transcription error: two items match exactly and the
  disagreements run in both directions, whereas a bad parse would skew one
  way. The `(N cal)` note is part of the merchant-authored description text,
  which drifts independently of the formal nutrition PDF.

  **Decided 2026-08-11: the operator's published PDF is the single source of
  truth.** Where DoorDash's description disagrees, the PDF wins and the
  disagreement is left visible rather than reconciled. It is also the only
  source that supplies the other six macros, so following it keeps every
  number on a card from one document. No further action; this is not an open
  question.
