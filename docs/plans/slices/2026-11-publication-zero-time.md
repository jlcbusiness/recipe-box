# November 2026 Hide zero total-time labels (#6)

**Status: Implemented and verified in Chromium. Fold 6 publication validation
remains incomplete because the browser test did not reach the zero-time checks.**

## Outcome

Do not display `0 min` for a recipe with a zero derived total in the
publication recipe explorer. Keep positive durations visible and preserve the
zero value used for filtering and sorting.

## Requirements and references

- Fix #6 from the
  [November Updates intake](./2026-11-updates-page-fix-intake.md).
- [Comprehensive reference, §2.2](../comprehensive-reference/01-recipe-card-and-metadata.md#22-time-tracking-and-overlapping-times),
  including the derived-total and card-display rules.
- [DLC 33: Configurable recipe times](./dlc/dlc-33-configurable-recipe-times.md)
  and [Slice 17: Find recipes](./17-find-recipes.md).
- [Data model](../data-model.md), [design philosophy](../design-philosophy.md),
  [visual design guide](../visual-design.md), and
  [decision log](../decision-log.md).
- Current implementation and tests:
  [`recipe-explorer.tsx`](<../../../src/app/publications/[id]/recipe-explorer.tsx>),
  [`recipes/find/page.tsx`](../../../src/app/recipes/find/page.tsx),
  [`data.ts`](../../../src/lib/recipes/data.ts), and
  [`publications.spec.ts`](../../../tests/e2e/publications.spec.ts).

## Existing behavior and closest pattern

The publication recipe explorer's Details table converts the numeric zero to
`0 min`; its Grid metadata also renders `0 min`. The existing browser test
expects that Grid output. Its simple List view does not show durations.
Private and public recipe detail pages and the private recipe finder already
omit non-positive totals.

Reuse each publication view's current empty-value treatment rather than adding
a new card style: the Details table uses `—` for an empty value, while Grid
uses `No total time` when the total is null. The existing views and private
recipe finder serve their workflows well; the requested delta is limited to
how zero is presented.

## Scope and display recommendation

- Treat a derived total of zero as having no displayable duration in the
  publication recipe explorer's Details and Grid views.
- For zero specifically, omit the duration portion entirely in both views.
  Preserve each view's existing empty-value display when the total is null.
- Keep all positive durations unchanged.
- Keep the recipe's numeric total at zero. Do not change filters, sorting,
  persisted time entries, or any recipe detail output.
- Do not add a duration to the simple List view.

**Confirmed display behavior:** The user chose to omit the time portion
entirely for zero in both Details and Grid. Existing null behavior remains
unchanged: Details uses `—`, and Grid uses `No total time`.

## Data, security, and failure boundaries

- This is presentation-only; `total_time_minutes` remains derived and is not
  rewritten.
- No migration, API, authorization, privacy, import/export, or public-payload
  change is needed.
- A query or rendering failure must remain an explicit error; do not substitute
  a successful-looking duration.

## Test-first acceptance

- Extend `publications.spec.ts` to cover zero, null, and positive totals in the
  Details and Grid views, using the existing recipe with no time entries where
  appropriate.
- Assert that zero renders no duration text in either view; verify null retains
  each view's existing fallback and positive duration text remains unchanged.
- Verify the simple List view remains unchanged and that zero remains
  filterable/sortable as numeric data.
- Exercise Grid at desktop and mobile widths. Inspect representative
  screenshots to ensure the existing state/time hierarchy remains clear.

## Review gate

The zero-total display treatment is implemented and verified in Chromium. No
data, migration, filter, or sort changes were made.
