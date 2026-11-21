# DLC 48: Pre-Recipe Preparation Instructions

**Status:** Implemented; focused acceptance checks pass.

## Outcome

Owners can save a pre-instruction describing work that must happen before the
ordinary recipe steps, such as marinating or defrosting. It is not a cooking
step or a personal note. In the editor it uses the standard compact,
auto-growing instruction row in its own **Pre-recipe Prep** section above
Instructions. It supports ingredient references and marked durations, but stays
unnumbered and does not create recipe time entries or schedule dates.

## Scope and dependencies

- Add `prep_ahead_markdown`, an optional recipe-level Markdown string for
  pre-work instructions, with an empty default for existing recipes and older
  imports.
- Add a separate **Pre-recipe Prep** section immediately before Instructions. Reuse
  the standard compact, auto-growing instruction-entry row; do not number or
  reorder this pre-instruction.
- Support the instruction editor's `#` ingredient autocomplete and marked
  duration emphasis. Duration markers are text formatting only and do not
  contribute to Total Time or create recipe-level time entries.
- Show the callout before the ordered steps and a compact **Pre-recipe Prep**
  indicator beside the recipe title only when saved content is non-empty.
- Carry the value through explicit saves, recipe history, private duplication,
  portable database/publication/recipe bundles, offline snapshots, recipe
  output, and public recipe copies.
- When a recipe is linkable, explicitly include this field in the public
  allow-list, public view and public print/download. Continue to omit personal
  Notes, history, account data, and every other non-allow-listed field.
- Do not add a schedule, recipe-level time entries, new step type, search
  filter, or new table. Recipe time entries retain their existing elapsed-time
  meaning.

## Confirmed decisions

- **Data shape:** Confirmed by the user on 2026-11-20: store this as the
  dedicated recipe field `prep_ahead_markdown`, not as a special row in
  `recipe_steps`. It is pre-work instruction by meaning, but does not occupy a
  step position, receive a step number, or participate in step reordering.
- **Public visibility:** Confirmed by the user on 2026-11-20: include this
  instructional field when the recipe is linkable. This intentionally adds one
  field to the existing public allow-list; private recipes remain unavailable
  to Guests.
- **Field and display label:** Use **Pre-recipe Prep** in the editor, callout, and
  title indicator. Give its label and decorative icon the existing tomato-red
  accent; keep the text label so the cue does not rely on color alone. The title
  indicator reflects saved data; clearing the field removes it after a successful
  save, not while an unsaved edit is in progress.
- **Editor behavior:** Confirmed by the user on 2026-11-20: treat this as a
  pre-instruction, not another ordered step. Reuse the standard instruction
  entry row, including ingredient references and duration markers, without step
  numbering, reordering, photo insertion, or temperature markers.
- **Markdown and safety:** Reuse the safe recipe instruction Markdown behavior
  for ordinary text, paragraphs, headings, lists, emphasis, code, and safe
  links. Resolve ingredient references against this recipe's rows and render
  marked durations as emphasis only. Do not interpret photo or temperature
  markers or render raw HTML or embedded images in this field.
- **Private output:** Treat this field as recipe instructions, so include it
  in private print and downloads regardless of the preference that controls
  private-only Notes, pairings, and references. Continue applying that
  preference to those existing private-only sections.
- **Bundles:** The code currently emits portable schema v14, while
  `import-export-format.md` still documents v13. Reconcile that existing
  discrepancy, then make schema v15 carry this field; v1–v14 imports default
  it to empty.

## Existing patterns to preserve

- Recipe editing already uses explicit Save, a labeled Notes Markdown textarea,
  and an ordered Instructions editor. Keep explicit-save and version-conflict
  behavior; do not autosave.
- The private and public readers already render ordered instructions in their
  own responsive reading columns. Put the callout in that instruction flow so
  it remains before the first step in screen, print, and standalone output.
- Existing Notes are rendered separately and excluded from public pages and
  default private output. Do not change their privacy or purpose.
- The nearest editor reference is the standard recipe instruction-entry row.
  Reuse its compact sizing, ingredient autocomplete, and auto-growth, but keep
  the pre-instruction outside the numbered/reorderable list. Notes remains a
  separate personal field. For reading, use the safe instruction renderer's
  supported subset and a restrained, bordered callout with a visible text
  heading and decorative icon; color must not be the only cue.

## Data, privacy, and failure boundaries

- Add a non-null text column defaulting to `''`; old recipes need no backfill
  beyond that default. Keep existing recipe ownership, RLS, optimistic version
  checks, and save-time history transaction.
- Save, duplicate, public-copy, and import paths must preserve the value
  without placing it in `notes_markdown`. Validate ingredient references
  against the recipe rows, unlink them to readable `#` text when a referenced
  row is removed, and remap their row IDs in copies and imports. A failed or
  stale save must not report success or publish an unsaved value.
- Public data includes the field only through the explicit allow-list and only
  for an active linkable recipe. Public-copy payloads copy this field while
  continuing to clear personal Notes and private metadata.
- Recipe history records before/after values under the new field label;
  history remains owner-only and excluded from bundles and public responses.
- Missing fields in schema v1–v14 bundles import as empty. Schema v15 exports
  preserve Markdown exactly through database and scoped exports/imports.

## User flow and layout

1. In create/edit mode, enter or revise a pre-instruction in the compact
   **Pre-recipe Prep** row above Instructions. Type `#` to link an ingredient and
   mark a duration with `=...=`. Enter may continue an authored list or add a
   line, but never creates a numbered cooking step. Save or cancel using the
   existing recipe form behavior. Empty text means no callout.
2. In private and public reading, show a compact title indicator only for a
   non-empty saved value. In the instruction column, render a bordered callout
   with a visible **Pre-recipe Prep** heading, decorative icon, and safe Markdown
   body before the ordinary ordered steps.
3. Print, HTML, PNG, and PDF use the same content and order. In paginated
   output, show the callout once at the top of the first instructions page,
   never on continuation pages. Measure its rendered height before assigning
   steps; if it leaves no room for the first step, allow a pre-work-only first
   page. If the callout itself cannot fit at the minimum readable text size,
   fail with a visible, recoverable output error rather than clipping or
   repeating it. Offline snapshots retain the callout but remain read-only.
4. On mobile, the callout fills the available instruction-column width, wraps
   long content without page-level horizontal scrolling, and stays before the
   steps. No additional breakpoint is assumed; validate the existing reader
   reflow boundaries.

There is no new loading state or separate submit action. Empty content hides
both indicators. Save conflicts and other failures retain the existing recipe
form's visible error and retry behavior.

## Acceptance criteria and automated evidence

1. **Create/edit/clear:** A user can save, reload, edit, and clear the field
   without changing Notes or ordered steps. Cover the explicit save and
   optimistic-conflict path in `tests/e2e/recipes.spec.ts`; verify history
   before/after values in `tests/e2e/history.spec.ts`.
2. **Rendering and safety:** Non-empty pre-instructions render before the first
   step with a text heading, decorative icon, and border. Ingredient references
   resolve to this recipe's ingredient rows; marked durations render as
   emphasis and do not affect recipe time entries. Supported Markdown is
   preserved, raw HTML and unsafe links are not executable, and empty content
   renders no callout or title indicator. Add focused renderer/unit coverage
   and private-reader browser assertions in `tests/e2e/recipes.spec.ts`.
3. **Public boundary:** A linkable recipe includes the new field, including
   ingredient references and marked durations, in the public reader and public
   print/download; a private recipe remains unavailable and personal Notes
   remain absent. Public copies remap ingredient references and clear Notes.
   Extend public projection/copy tests and `tests/e2e/public-recipes.spec.ts`.
4. **Other persistence/output paths:** Private print and standalone HTML retain
   the callout even when private-only details are disabled; the offline snapshot
   keeps it; direct private duplication preserves it. Cover relevant behavior
   in `tests/e2e/exports.spec.ts`, `tests/e2e/offline.spec.ts`, and the recipe
   duplication tests.
5. **Portable compatibility:** Schema v15 exports and reimports pre-instruction
   Markdown for database and scoped bundles, remapping ingredient references to
   imported row IDs; v1–v14 inputs remain valid and default the field to empty.
   Extend `tests/unit/export-rules.test.tsx`, `tests/unit/import-rules.test.tsx`,
   and the existing import/commit coverage.
6. **Responsive/accessibility:** Validate callout order, readable wrapping,
   visible heading, textarea label/focus, and no horizontal overflow at
   representative desktop and mobile widths. Add the callout to existing
   recipe/public accessibility checks; exercise output pagination with a
   multi-paragraph/list example.

Write focused failing tests before production changes. Add a migration test for
the default, save, history, public allow-list, and import behavior. Do not reset
the local database unless a clean baseline is needed; if resetting, follow the
README recovery procedure and restore synthetic fixtures.

## Documentation and release updates

- Update the relevant sections of the comprehensive reference, data model,
  visual guide, decision log, and portable bundle format to match the verified
  behavior. Correct the existing schema-v13 documentation/code-v14 mismatch
  while documenting v15 compatibility.
- Update the DLC roadmap from draft candidate after acceptance criteria pass.
- The current package version is 1.19.0; propose 1.20.0 for this feature and
  verify the repository's versioning conventions before release metadata edits.

## References

- [Delivery roadmap: preparation, standing rules, completion](../../delivery-roadmap.md#mandatory-slice-preparation)
- [First-draft spec: recipes, privacy, outputs, history, accessibility](../../first-draft-spec.md)
- [Comprehensive reference: recipe metadata and Notes](../../comprehensive-reference/01-recipe-card-and-metadata.md#2-recipe-card-and-metadata)
- [Comprehensive reference: instructions and Markdown](../../comprehensive-reference/03-instructions-and-links.md#5-instructions-autocomplete-and-recipe-linking)
- [Comprehensive reference: public recipe experience and copies](../../comprehensive-reference/06-sharing-and-accounts.md#93-public-recipe-experience)
- [Data model](../../data-model.md)
- [Design philosophy](../../design-philosophy.md)
- [Visual guide: recipe detail](../../visual-design.md#recipe-list-detail-and-headings)
- [Visual guide: public recipe view](../../visual-design.md#public-recipe-view-slice-22-current-implementation)
- [Decision log](../../decision-log.md)
- [Portable bundle format](../../import-export-format.md)
- [Recipe form](../../../../src/app/recipes/recipe-form.tsx)
- [Private recipe detail](../../../../src/app/recipes/[id]/page.tsx)
- [Public recipe page](../../../../src/pages/r/[publicId].tsx)

**Review gate:** No material product decision remains open. Review this brief
before production code; recheck framework/library documentation and the live
reader at desktop and mobile sizes before implementing and validating UI.
