# Adding a restaurant

Every step here exists because it went wrong once. The traps in
[Transcription hazards](#transcription-hazards) are not hypothetical — each one
was hit while building the Mendocino Farms pack, and two of them would have
shipped wrong nutrition numbers to users.

## The shape of the work

A restaurant is one JSON file in `packs/`. No code changes:

- `build.mjs` regenerates `packs/index.json` from the directory
- `getBundledPacks()` loads every file in that index
- `findPackForStore()` picks a pack by matching `matchHints` against the store
  page's heading, title, and pathname

So the work is entirely **transcription and verification**, and that is where
the risk lives.

## 1. Find the authoritative source

You need the operator's own published nutrition document. Never a third-party
nutrition site, never a calorie-estimate service — the transparency principle
means only real published values ship.

**Check the publication date before anything else.** Mendocino Farms' pack was
built from a February PDF and sat six months stale; seasonal items had rotated,
so live menu items matched nothing and read "Nutrition unavailable" while
looking like a matching bug.

Record it in the pack:

```json
"source": { "url": "https://…", "label": "… (June 2026)" },
"updatedAt": "2026-06-24"
```

Then run `npm run check:packs --update` to record the HTTP validators, so a
later in-place edit of that PDF is detected.

## 2. Extract the rows

```bash
pdftotext -layout nutrition.pdf nutrition.txt
```

`-layout` matters — without it the columns interleave and every row is garbage.

Read the column header before mapping anything. Mendocino Farms' order is:

```
Serving, Calories, Calories-from-Fat, Total Fat, Saturated Fat, Trans Fat,
Cholesterol, Sodium, Carbohydrates, Fiber, Total Sugar, Protein
```

Do not assume another chain uses that order. Fiber and sugar in particular
swap around between publishers.

## Transcription hazards

### Duplicate names at different serving sizes

The single most dangerous one. Chains list the same item twice — full portion,
then half:

```
line 24: Chicken Pesto Caprese   13.8 oz   800 cal   ← full
line 30: Chicken Pesto Caprese    6.9 oz   400 cal   ← half
```

A parser that keys on name keeps whichever it sees last and **halves the
calories on your most popular items**. The values look entirely plausible,
which is what makes it dangerous — nothing downstream flags it.

Take the **first** occurrence (full size), and treat any diff that looks like
"all values roughly halved" as this bug until proven otherwise.

### Ligatures vanish in PDF extraction

`pdftotext` drops `ti`/`tt` ligatures, producing names that will never match:

| Extracted | Actual |
| --- | --- |
| `ProsciuAo` | Prosciutto |
| `Peanut BuAer` | Peanut Butter |
| `CiabaAa` | Ciabatta |
| `porXon` | portion |

Repair these before matching, and grep the extracted text for stray capitals
mid-word as a check.

### Continuation rows

Modifier lines like `without dressing` appear as their own row with no item
name, belonging to the row above. Attach them to the preceding item
(`… (No Dressing)`) or they become orphans.

### Unattributable rows

Some rows are bare portion sizes (`Low Portion`, `High Portion`) with no item
name at all. **Skip them.** Guessing which item they belong to is exactly the
estimation the transparency principle forbids.

## 3. Name the items the way the delivery platform does

Matching is high-confidence only: an exact match, or a unique match after
filler words are stripped. Anything ambiguous returns nothing and the card
reads "Nutrition unavailable". That is the correct failure — a wrong number is
worse than no number.

The published name and the DoorDash name routinely differ:

| PDF | DoorDash | Fix |
| --- | --- | --- |
| `"Not So Fried" Chicken Salad` | `"Not So Fried" Chicken Sandwich - Salad Style` | add the DoorDash string as an alias |
| `Add Chicken` | `Extra Chicken` | add `Extra X` alias for every `Add X` |

Put the platform's exact string in `aliases`. Do not loosen the matcher —
`"Not So Fried" Chicken Sandwich - Salad Style` contains both "Sandwich"
(900 cal) and "Salad Style" (740 cal), and a fuzzier matcher has a coin-flip
chance of showing someone the wrong one.

## 4. Verify against the live store

```bash
npm run build      # required before every extension reload
npm test
```

Load the store page and open the console. Every paint pass reports:

```
[menu-macros] pack coverage 7/11  ["Joe's Classic Chips", "Spicy Curried Couscous", …]
```

Work the unmatched list item by item and classify each one:

- **In the PDF under a different name** → add an alias
- **Not in the PDF at all** (sides, drinks, LTOs) → correct, leave it
- **In the PDF and named identically** → a matcher bug, investigate

A pack is not done at some coverage percentage. It is done when every
unmatched name has been explained.

## 5. Check the card layout holds

The band anchors to the card photo, and three DoorDash card shapes are known:

| Shape | Photo box |
| --- | --- |
| 3-column grid (Most Ordered) | 304×144, top of card |
| Featured carousel | 177×168, no `<img>` until loaded |
| Wide category row | 156×156, right-hand column, static wrappers |

If a new store renders a fourth, check that `findPhotoHost` resolves to the
photo and not the whole card — a band spanning the full card width is the
symptom. **Never** solve a layout problem by making cards taller: DoorDash's
menu grid is virtualized on a fixed row pitch, and a taller card overlaps its
neighbour instead of making room.

## Checklist

- [ ] Source is the operator's own published document, dated within 90 days
- [ ] `source.url`, `label`, `updatedAt` recorded; `check:packs --update` run
- [ ] Column order read from the header, not assumed
- [ ] First-occurrence rows taken; no halved-looking values
- [ ] Ligature damage repaired
- [ ] Continuation rows attached; unattributable rows skipped
- [ ] `matchHints` set to how the store names itself on the platform
- [ ] Every unmatched name in the coverage report explained
- [ ] Band renders on every card shape the store uses
- [ ] `npm test` green, `npm run check:packs` clean
