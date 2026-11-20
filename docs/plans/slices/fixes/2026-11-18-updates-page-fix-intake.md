# November 2026 Updates Fixes: Brief and Split Proposal

**Status: All ten Fix entries have been implemented. Focused verification
passed for the six work packages; browser projects and viewports vary by the
package acceptance criteria. C+F has two completed implementation briefs.**

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
See [DLC 34](../dlc/dlc-34-account-and-admin-settings.md), the
[Settings tab implementation](../../../../src/app/settings/settings-tabs.tsx),
and [Updates styles](../../../../src/app/styles/account-admin.css).

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
[Ingredient-first reader parity brief](2026-11-18-ingredient-first-reader-parity.md).
Private and shared pages use the same
[`RecipeReader`](../../../../src/app/recipes/recipe-reader.tsx). Desktop names are
now 18px in both contexts, and focused browser coverage measures typography and
3px/6px Cook-mode spacing at desktop and mobile widths.

**Contract and closest pattern:** Follow the
[reader and measurement contract](../dlc/dlc-02-reader-and-measurement-polish.md)
and [Ingredient Presentation guide](../../visual-design.md#ingredient-presentation).
The shared reader is the right reuse point; the current font-size divergence
is not a pattern to preserve. The accepted reference is implemented as 18px
desktop names with 0.92em Specifics; mobile font sizing remains unchanged.

**Implemented outcome:** Ingredient-first names and Specifics have consistent
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

**Status:** The two separate briefs were approved, implemented, and verified
with focused unit, migration/database, and browser coverage.

- **C, Numeric Arithmetic (#4):** exact arithmetic now applies to editable
  numeric inputs, including time expressions, with the standard mobile text
  keyboard and legacy-range preservation. See the
  [Numeric Arithmetic brief](2026-11-18-numeric-arithmetic.md).
- **F, Things Wording and Addable Units (#7 and #10):** natural “of” wording,
  inline add/reuse, and an explicit persisted `a` marker are implemented.
  `a` appears only in Things presentation; converted Volume/Weight values
  remain numeric. Help explains when to use `a` versus `1`. See the
  [Things brief](2026-11-18-things-units.md).

The [input-consistency overview](2026-11-18-numeric-input-consistency.md)
records their shared rationale, complete numeric-field inventory, and
cross-cutting decisions. Each brief's separate acceptance criteria and
approval gate has been completed.

### D. Recipe editor spacing and single-set labels (#5 and #9)

**Status:** Implemented and verified in Chromium and Fold 6. The user confirmed
a 1mm minimum gap and chose to hide the editor heading when one set remains,
while preserving the stored label. Both fixes are local to the recipe editor
and do not require a schema change.
See the
[combined recipe-editor brief](2026-11-18-recipe-editor-spacing-and-sections.md).

- **#5, Measurement Type-to-Amount spacing:** The editor enforces and tests a
  positive 1mm minimum while preserving the one-line layout where controls fit.
  At constrained desktop widths, Size controls wrap below Preparation so its
  input remains usable.
- **#9, Single-set title editing:** When one set remains, the editor hides the
  heading and rename action while preserving the saved label. Multi-set
  editing behavior remains unchanged.

### E. Hide zero total-time labels (#6)

**Status:** Implemented and verified in Chromium and Fold 6. The user chose to
omit the duration portion for zero in publication Details and Grid. Zero was
shown as `0 min` in both views; the simple List view does not show duration.
Other recipe detail and finder surfaces already omit non-positive totals. See the
[publication zero-time brief](2026-11-18-publication-zero-time.md).

### F. Natural Things display and addable Things units (#7 and #10)

**Status:** Implemented and verified. Things amounts use natural Standard
wording, the explicit `a` marker, and inline Add/reuse while retaining numeric
scaling and account-managed units.

**Implemented outcome:** Standard includes “of” where needed and never
duplicates it; Ingredients-First omits trailing “of” because the ingredient
has its own column. Authors explicitly enter `a` for a single Things amount
when they want the article; typed `1` remains numeric. Readers display `a`
only when the effective Things amount is exactly one. Adding a unit updates
the account picklist, while assignment remains a draft until recipe Save. The
Help page explains the `a` versus `1` choice, scaling, view-specific wording,
and inline unit addition.

**Confirmed decision:** `a` is an explicit per-row choice, not an automatic
replacement for `1`. For example, use `1 bunch` when you mean one specific
bunch; `a bunch` can also mean “a lot.” The stored amount remains numeric, and
an equivalent Volume or Weight value is shown numerically.

**Verification:** Focused unit, migration/database, and browser coverage
passed for the behavior and persistence boundaries in the
[Things brief](2026-11-18-things-units.md). The authenticated Help test checks
the guidance, accessibility, and overflow at desktop and narrow mobile widths.

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
C+F has two separately reviewable implementation briefs. Packages A, B, C, F,
D+H, E, and G are implemented and verified.
The updated
[slice prompt](../../../../.github/prompts/slice.prompt.md) permits grouping
smaller fixes when they do not require significant restructuring. D+H share
the recipe editor, require no schema change, and retain separate acceptance
checks. Their behavior choices and approval are recorded in the briefs.

Package **G** was implemented separately because it adds persisted recipe
data. C+F remains grouped as a coherent input-consistency effort, with
arithmetic and Things recorded in separate completed briefs and approval
gates.

## Preparation references

- [Slice workflow](../../../../.github/prompts/slice.prompt.md)
- [First-draft specification](../../first-draft-spec.md)
- [Delivery roadmap](../../delivery-roadmap.md)
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md)
- [Data model](../../data-model.md)
- [Comprehensive reference: Ingredients and presentation](../../comprehensive-reference/02-ingredients-and-presentation.md)
- [Decision log](../../decision-log.md)
- [Completed November reported-fixes brief](2026-11-04-reported-fixes.md)

This intake began as a research pass; implementation and verification status
for each package is recorded above.
