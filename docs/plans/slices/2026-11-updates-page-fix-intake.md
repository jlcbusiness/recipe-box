# November 2026 Updates Fixes: Brief and Split Proposal

**Status: Packages A, B, D+H, E, and G are implemented and verified in
Chromium and Fold 6. C+F remains an intake grouping with two separate review
briefs.**

## Outcome and recommendation

Turn the ten unchecked **Fix** entries from the Updates page into independently
testable work packages, distinguish current defects from behavior already
present, and identify the product decisions needed before implementation.

These entries do not all share one demonstrable outcome, so they were split into
the work packages below. **Ingredient-first reader parity** (#2 and #3) was
selected, briefed, approved, and implemented as the first package. Packages
D+H, E, and A have since been selected, approved, implemented, and verified.
G was selected and clarified as a distinct persisted note field, then
implemented and verified. The user grouped C and F as input consistency.
Review identified distinct demonstrations and data boundaries, so they now
have separate implementation briefs under one intake grouping; neither is
approved for implementation.

## Source and original notes

Source: [Recipe Box Settings > Updates](https://recipe-box-gray-chi.vercel.app/settings?tab=updates),
reviewed November 18, 2026. The page had completed updates hidden; Playwright
confirmed the listed entries were unchecked. Only **Fix** entries are included;
**Feature** and **Change** entries are out of scope.

1. “fix updates table width (should under the same width parameters as recipe pages)”
2. “screen lock still adds a massive amount of space between the checkbox and
   the text in ingredients-first (both in private and moreso in shared
   (probably because of the text size))”
3. “ingredients are not the same size in ingredient-first view between private and shared recipes (shared is too large)”
4. “Math doesn't work in trusted densities? Should work for all integer fields”
5. “On recipe edit, space between unit type and volume amount fields is zero”
6. “Don't show "0 min"”
7. “for Things, in standard view, remember to include "of" (like "dash of salt")
   (and add option for "a" in amount field (special exception) (as in "a dash
   of salt" instead of "1 dash of salt")(and include that in the help)(I would
   convert all "1"s to "a"s, except some words need a number. "a bunch of
   parsley" could mean "a lot" or "(specifically) a bunch", so you need "1
   bunch of parsley")”
8. “And in an notes field so you can have things like "milk, whole, (or half
   and half)" (alternate ingredients and such don't work in standard view
   specifics field) (note, it should go immediately after the ingredient in
   standard view, before "feel"s)(since those are place at the end instead of
   the beginning)(in ingredients-first, it should be comma'd in with specifics,
   e.g., "whole, or half and half")”
9. “Do not allow labeling sections unless there are more than 1”
10. “Add the ability to add to the Things list like all the other addable picklists”

## Candidate work packages

### A. Full-width Updates tab (#1)

**Status:** Implemented and verified. At a normalized 1280px Chromium viewport,
the Settings content track measured 1118px while the active tab panel and
Updates list stopped at 407px. The panel was the constraining box; setting
`.settings-tab-panel` to `width: 100%` makes it and the Updates content fill the
track. Browser assertions verify the panel, tracker, and list align within 1
CSS px at desktop and mobile widths, with no page-level horizontal overflow.

**Contract and closest pattern:** DLC 34 says Settings tabs retain full-width,
unframed sections. The existing Updates tracker is the correct functional
pattern, but its observed width does not satisfy that workspace contract.
See [DLC 34](./dlc/dlc-34-account-and-admin-settings.md), the
[Settings tab implementation](../../../src/app/settings/settings-tabs.tsx),
and [Updates styles](../../../src/app/styles/account-admin.css).

**Verified outcome:** The Updates tracker uses the available Settings content
width, like the neighboring full-width Settings sections, without changing its
row layout or editing behavior.

**Acceptance criteria:**

- At desktop and mobile widths, the visible Updates panel/list spans the
  Settings content track to within 1 CSS px on each side.
- The page has no horizontal overflow; the list remains readable and its
  existing completion, reorder, edit, and type controls remain usable.
- Browser tests assert the panel-to-content width relationship at a 1280px
  desktop viewport and at 641px, 640px, 473px, and 390px, including the
  configured Fold 6 browser project. Desktop and mobile screenshots are
  captured and inspected by the existing Updates flow.

### B. Ingredient-first reader parity in Cook mode (#2 and #3)

**Status:** Implemented and verified. See the
[Ingredient-first reader parity brief](./2026-11-ingredient-first-reader-parity.md).
Private and shared pages use the same
[`RecipeReader`](../../../src/app/recipes/recipe-reader.tsx). Desktop names are
now 18px in both contexts, and focused browser coverage measures typography and
3px/6px Cook-mode spacing at desktop and mobile widths.

**Contract and closest pattern:** Follow the
[reader and measurement contract](./dlc/dlc-02-reader-and-measurement-polish.md)
and [Ingredient Presentation guide](../visual-design.md#ingredient-presentation).
The shared reader is the right reuse point; the current font-size divergence
is not a pattern to preserve. The accepted reference is implemented as 18px
desktop names with 0.92em Specifics; mobile font sizing remains unchanged.

**Proposed outcome:** Ingredient-first names and Specifics have consistent
typography in private and shared recipes, and Cook mode does not leave an
excessive checkbox-to-ingredient gap in either context.

**Acceptance criteria:**

- The user's first visual reference is the intended Ingredient-first text
  size; the larger second reference is not acceptable.
- In Cook mode, the checkbox is 3px from the left border and 6px from the
  ingredient text in private and shared views; retain a 48px mobile target and
  keep desktop rows compact.
- Vertically center Ingredient-first table cells in shared views to match
  private views.
- Match private/shared Ingredient-first cell padding and text line-height;
  keep the tinted stripe rows' top and bottom rules visible.
- Keep unit-control hit areas at least 48px on mobile and compact on desktop in
  private and shared recipes.
- At desktop and mobile sizes, Playwright compares private/shared typography,
  measures both checkbox gaps, and checks for page-level overflow. Wake-lock
  status, check-off, print, and accessibility behavior remain unchanged.

### C+F. Numeric input consistency and Things units (#4, #7, and #10)

**Status:** Grouped for coordination, split into two reviewable implementation
briefs. Neither is approved for implementation.

- **C, Numeric Arithmetic (#4):** extend exact arithmetic to every editable
  numeric input, update time expressions, use the standard mobile text
  keyboard, and preserve legacy ranges. See the
  [Numeric Arithmetic brief](./2026-11-numeric-arithmetic.md).
- **F, Things Wording and Addable Units (#7 and #10):** support natural “of”
  wording, inline add/reuse, and explicit standalone `a` with a persisted
  marker. Show `a` only in Things presentation; converted Volume/Weight values
  remain numeric. See the [Things brief](./2026-11-things-units.md).

The [input-consistency overview](./2026-11-numeric-input-consistency.md)
records their shared rationale, complete numeric-field inventory, and
cross-cutting decisions. Separate briefs keep their acceptance and approval
gates clear.

### D. Recipe editor spacing and single-set labels (#5 and #9)

**Status:** Implemented and verified in Chromium and Fold 6. The user confirmed
a 1mm minimum gap and chose to hide the editor heading when one set remains,
while preserving the stored label. Both fixes are local to the recipe editor
and do not require a schema change.
See the
[combined recipe-editor brief](./2026-11-recipe-editor-spacing-and-sections.md).

- **#5, Measurement Type-to-Amount spacing:** The E2E test currently sets only
  a 9px upper bound, so zero still passes. The brief proposes a positive 1mm
  minimum while preserving the one-line layout at 901px.
- **#9, Single-set title editing:** The reader already hides a label for one
  non-empty set, but the editor still renders an editable title button for one
  set. The brief preserves the required stored label and asks whether the
  editor should show it as static text or hide the heading.

### E. Hide zero total-time labels (#6)

**Status:** Implemented and verified in Chromium and Fold 6. The user chose to
omit the duration portion for zero in publication Details and Grid. Zero was
shown as `0 min` in both views; the simple List view does not show duration.
Other recipe detail and finder surfaces already omit non-positive totals. See the
[publication zero-time brief](./2026-11-publication-zero-time.md).

### F. Natural Things display and addable Things units (#7 and #10)

**Status:** Open; the display and editor behaviors belong together as one
Things workflow. Current standard formatting produces `1 bunch herbs`; a
preconfigured `Pinch of` value is a special case and already produces wording
such as `1-2 pinches of herbs`. The Things selector in
[`MeasurementEditor`](../../../src/app/recipes/measurement-editor.tsx) has no
Add option. The editor's server-side `createOrGetRecipePicklistValue` allowlist
excludes `informal_unit`, although the category is already Settings-managed.
The existing [`SuggestionCellEditor`](../../../src/app/recipes/ingredient-rows-editor.tsx)
and recipe-picklist action are the closest addable-picklist patterns.

**Contract and proposed outcome:** Things units remain account-managed and
numeric amounts remain numeric for scaling and conversion. Standard reading
renders natural unit phrases with “of” where needed, pluralizes from the
existing maximum-quantity rule, and never duplicates “of” when a saved unit
already contains it. Recipe editing can add or reuse a Things unit inline;
the catalog addition follows the existing picklist revision/conflict and
authorization rules, while recipe assignment remains a draft until Save.
Update Help with the approved article/amount rule.

**Open decision:** The note requests an option for `a` but also says some
one-unit Things should retain the numeral. Choose whether `a` is an explicit
per-row display choice or an automatic display rule with a numeric override.
The proposed safe invariant is that the stored quantity remains numeric and
`a` is shown only when the displayed scalar amount is exactly one; confirm
whether that is the intended behavior after scaling.

**Acceptance criteria after that choice:**

- Unit tests cover singular/plural Things, ranges (using their maximum),
  labels with and without a built-in “of,” the chosen `a` behavior, and scaled
  values without changing stored quantities.
- Browser tests cover keyboard search, explicit Add/reuse, duplicate or
  concurrent catalog additions, visible failures, draft-only recipe
  assignment, and Help text.
- Private, shared, print, and offline reader output preserve the existing
  privacy and public allow-list contracts.

### G. Alternate-ingredient note field (#8)

**Status:** Implemented and verified in Chromium and Fold 6. Ingredient rows
now have a distinct “Alternative / note” free-text field. The note is trimmed
at save and remains separate from Specifics and Preparation.

**Implemented outcome:** Standard places a non-empty note in parentheses after
the other row content, including any Feel phrase, Preparation, Size, and
Divide. Ingredient-first places it on its own line below Specifics, or directly
below the name when Specifics is empty. The wording is preserved; the note is
not merged into Specifics.

**Data and lifecycle:** `recipe_ingredients.alternate_note` is included in
recipe save and history snapshots, public recipe projection/copy, print and
offline HTML, and portable exports (schema version 14). Older bundles import
an empty note. Public output exposes the note only with the recipe's existing
public ingredient data.

**Verified behavior:** Focused unit tests cover trimming, formatting order,
reader output, history text, public projection/copy, schema-14 export, and
schema-13 import compatibility. Browser tests verify desktop/mobile editing,
save/reload/history, private/shared Ingredient-first rendering, database
import, print output, and offline HTML output at representative viewports.

## Suggested split and review gate

These are six intake groupings after grouping fixes #2/#3, #5/#9, and #4/#7/#10.
C+F has two separately reviewable implementation briefs. Packages A, B, D+H,
E, and G are implemented; C and F remain open.
The updated
[slice prompt](../../../.github/prompts/slice.prompt.md) permits grouping
smaller fixes when they do not require significant restructuring. D+H share
the recipe editor, require no schema change, and retain separate acceptance
checks. Their behavior choices and approval are recorded in the briefs.

Package **G** was implemented separately because it adds persisted recipe
data. C+F remains grouped as a coherent input-consistency effort, but its
arithmetic and Things implementations are separate outcomes with separate
approval gates.

## Preparation references

- [Slice workflow](../../../.github/prompts/slice.prompt.md)
- [First-draft specification](../first-draft-spec.md)
- [Delivery roadmap](../delivery-roadmap.md)
- [Design philosophy](../design-philosophy.md)
- [Visual design guide](../visual-design.md)
- [Data model](../data-model.md)
- [Comprehensive reference: Ingredients and presentation](../comprehensive-reference/02-ingredients-and-presentation.md)
- [Decision log](../decision-log.md)
- [Completed November reported-fixes brief](./2026-11-reported-fixes.md)

This intake began as a research pass; implementation and verification status
for each package is recorded above.
