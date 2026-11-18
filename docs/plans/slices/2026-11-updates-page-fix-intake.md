# November 2026 Updates Fixes: Brief and Split Proposal

**Status: Package B is implemented and verified. The remaining packages are
proposals and are not authorized for implementation.**

## Outcome and recommendation

Turn the ten unchecked **Fix** entries from the Updates page into independently
testable work packages, distinguish current defects from behavior already
present, and identify the product decisions needed before implementation.

These entries do not share one demonstrable outcome, so they were split into the
work packages below. **Ingredient-first reader parity** (#2 and #3) was selected,
briefed, approved, and implemented as the first package. The other packages
remain proposals; each needs its own selection, brief, and approval.

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

**Status:** Open. The prior Playwright inspection found the Updates list much
narrower than the Settings main content at both inspected sizes. At 473 CSS px,
the list measured 373px and the main content 421px. The desktop run measured
400px for the list and 1198px for the main content, but its browser viewport
had a zoom-scale mismatch; repeat that geometry check with a normalized CSS
viewport before using the desktop numbers as a baseline. No explicit width cap
was found on the inspected Updates list styles, so the layout cause still needs
to be traced before choosing a CSS change.

**Contract and closest pattern:** DLC 34 says Settings tabs retain full-width,
unframed sections. The existing Updates tracker is the correct functional
pattern, but its observed width does not satisfy that workspace contract.
See [DLC 34](./dlc/dlc-34-account-and-admin-settings.md), the
[Settings tab implementation](../../../src/app/settings/settings-tabs.tsx),
and [Updates styles](../../../src/app/styles/account-admin.css).

**Proposed outcome:** The Updates tracker uses the available Settings content
width, like the neighboring full-width Settings sections, without changing its
row layout or editing behavior.

**Acceptance criteria:**

- At desktop and mobile widths, the visible Updates panel/list spans the
  Settings content track to within 1 CSS px on each side.
- The page has no horizontal overflow; the list remains readable and its
  existing completion, reorder, edit, and type controls remain usable.
- Browser tests assert the list-to-content width relationship at representative
  desktop and mobile viewports. Inspect screenshots at both sizes after the
  layout cause is identified.

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
  ingredient text in private and shared views; retain a 48px-tall target.
- At desktop and mobile sizes, Playwright compares private/shared typography,
  measures both checkbox gaps, and checks for page-level overflow. Wake-lock
  status, check-off, print, and accessibility behavior remain unchanged.

### C. Trusted-density arithmetic (#4)

**Status:** Open; scope is ambiguous. Density preview currently calls
`parseQuantityInput`, which accepts quantity syntax but not arithmetic.
`parseTimeExpression` is an existing expression parser, but it rounds to whole
minutes; reusing it for density would lose fractional measurement values.
See the [density manager](../../../src/app/settings/ingredient-density-manager.tsx),
[`parseQuantityInput`](../../../src/lib/recipes/measurement-rules.ts), and
[`parseTimeExpression`](../../../src/lib/recipes/time-rules.ts).

**Proposed outcome if scoped to density:** A person can enter supported
arithmetic in both the Volume and Weight amount fields of a trusted density.
Preview and save use the same exact parsed values, preserve supported
fractional results, and reject malformed, zero, negative, or out-of-range
values with a visible correction message.

**Open decision:** The note says “all integer fields,” which could mean only
the two density amounts or every integer-valued field in the app. Do not expand
quantity grammar across unrelated forms without approval. Decide whether this
package is density-only or requires a shared expression-entry contract.

**Acceptance criteria after scope is chosen:**

- Unit tests cover operator precedence, parentheses, fractions/decimals if in
  scope, invalid syntax, division by zero, negative results, and supported
  precision/range limits.
- Browser tests verify that preview and saved density values agree and that an
  invalid expression is announced without persisting a rounded or fallback
  value.

### D. Measurement type-to-amount spacing (#5)

**Status:** Open. The recipe editor's current E2E test asserts that the gap
between the type control and Volume amount is at most 9px, so a zero gap still
passes. It also verifies the controls stay on one line at 901px. See the
[measurement editor](../../../src/app/recipes/measurement-editor.tsx) and
[existing geometry assertions](../../../tests/e2e/measurements.spec.ts).

**Proposed outcome:** The type selector and first amount field have a visible,
consistent separation without making the desktop measurement row wrap or
overflow.

**Acceptance criteria:**

- At the existing 901px desktop test width, the measured gap is at least 1mm
  (approximately 3.8 CSS px) and no more than the existing 9px upper bound.
- The desktop controls remain on one line and the mobile layout remains usable
  without page-level horizontal overflow.
- Extend the current geometry test with a positive lower bound; keep the
  existing selector, amount, keyboard, and validation behavior.

### E. Hide zero total-time labels (#6)

**Status:** Open on one confirmed surface; already handled on others. Private
and public recipe detail builders omit non-positive time totals/entries, and
the private recipe finder also omits a zero total. The publication recipe
explorer still renders `0 min` when `total_time_minutes` is zero; its E2E test
currently expects that output. See the
[publication recipe explorer](../../../src/app/publications/[id]/recipe-explorer.tsx#L560),
[existing test](../../../tests/e2e/publications.spec.ts#L1497), and
[private recipe finder](../../../src/app/recipes/find/page.tsx#L880).

**Proposed outcome:** A zero total is not presented as a duration in the
publication recipe explorer; positive durations remain visible. Other already
correct surfaces are unchanged.

**Open decision:** For a zero total, should the publication card omit the time
entirely (matching the private finder), or display “No total time” (the current
publication card text for a `null` value)? In either case, it must not display
`0 min`.

**Acceptance criteria after that choice:**

- Browser tests cover zero, null, and positive totals in the publication
  recipe explorer and verify the chosen no-time wording and unchanged positive
  duration.
- Keep detail-page and private finder behavior unchanged.

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

**Status:** Open; this is a data-model feature, not a formatting-only fix.
Ingredient rows currently have Specifics and Preparation but no separate
alternate-ingredient note. The current reader places those fields differently
in Standard and Ingredient-first views, so putting alternatives in Specifics
cannot satisfy the requested Standard order.

**Proposed outcome:** A recipe ingredient can store an optional plain-text
alternate/detail note. In Standard view it appears immediately after the
ingredient and before any Feel phrase. In Ingredient-first view it joins
Specifics in the ingredient cell, comma-separated as requested. Existing
Specifics and Preparation retain their meanings and positions.

**Data and lifecycle scope:** Add a distinct recipe-ingredient field and carry
it through explicit save, version/history snapshots, public recipe projection,
print and offline output, and every supported import/export bundle scope.
Public output exposes it only where that recipe's existing public ingredient
data is exposed. Do not overload Specifics or encode the note in free-form
Markdown.

**Acceptance criteria:**

- Unit tests cover empty/trimmed notes and exact composition/order in both
  reader formats, including Feel phrases and Preparation.
- Focused migration, save/history, import/export, public projection, print, and
  offline tests prove the note survives the existing recipe lifecycle and does
  not change unrelated ingredient data.
- Browser tests cover editing, saving, validation/error retention, and
  private/shared rendering at desktop and mobile widths.

### H. Single-set section-title editing (#9)

**Status:** Partially satisfied. The reader already suppresses a label when a
recipe has one non-empty set, as required by [DLC 03](./dlc/dlc-03-ingredient-sets.md).
The recipe editor still renders an editable title button for a single set.
Existing section-title E2E coverage exercises multi-set recipes but does not
assert the single-set editor behavior.

**Proposed interpretation:** Keep the required stored label and show it as
non-editable text while the recipe has one set. Enable title editing when a
second set exists. If a recipe returns to one set, preserve its remaining
label but remove the rename affordance. This changes neither the set schema
nor the reader's existing one-set appearance.

**Open decision:** Confirm that the request targets the editor's rename
affordance. If it refers only to reader headings, that behavior is already
implemented and this package can be closed.

**Acceptance criteria after confirmation:**

- Browser tests verify the single-set title is not editable, adding a second
  set enables editing, removing back to one set disables it again, and the
  remaining label is preserved.
- Existing multi-set rename, keyboard focus, validation, and save behavior
  continue to pass.

## Suggested split and review gate

These are eight packages after grouping the two Ingredient-first notes and the
two Things notes. They should not be implemented as one slice. Advance one
approved package at a time; update the canonical reference and visual guide
only for behavior that is approved and verified. Do not start production
changes until the user selects the package and resolves its listed open
decision(s).

The recommended first package is **B. Ingredient-first reader parity (#2/#3)**.
Packages **C**, **E**, **F**, and **H** have explicit product decisions to
settle first. Package **G** is larger because it adds persisted recipe data and
must be briefed independently.

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

No product tests were run for this documentation and research pass. No
production code, migration, or local/hosted database was changed.
