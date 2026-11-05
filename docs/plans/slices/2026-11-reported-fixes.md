# November 2026 Reported Fixes

## Status and outcome

Implementation and regression verification complete; changes remain uncommitted.
This plan groups the eight reported items into five
independently demonstrable work packages: A, B, C1, C2, and D. It
does not assign a new DLC number or reopen unrelated work.

The outcome is readable publication headings, faithful instruction rendering,
usable recipe-edit controls and nutrition layout, and reliable recipe import
into the Recipe Tin. Complete and verify each package separately.

## Sources and authority

- [Slice workflow](../../../.github/prompts/slice.prompt.md)
- [Product summary](../first-draft-spec.md)
- [Comprehensive reference](../comprehensive-reference.md), especially
  sections 2.5, 5, 6, 11, and 13
- [Data model](../data-model.md)
- [Design philosophy](../design-philosophy.md)
- [Visual design guide](../visual-design.md), especially Nutrition, Data
  Management, Ingredient Presentation, and Publication Editing
- [Decision log](../decision-log.md)
- [Publication editing](12.5-edit-publications.md),
  [images](12-images.md), and [scoped import](21b-scoped-import.md)
- [Instruction authoring](dlc/dlc-05-instruction-authoring-and-references.md),
  [reader and print layout](dlc/dlc-08-recipe-public-and-print-layout.md),
  [standalone exports](dlc/dlc-09-standalone-recipe-exports.md), and
  [nutrition](dlc/dlc-12-recipe-nutrition.md)

The user supplied the reports and two clarifying screenshots on November 4,
2026. Item 2 concerns both a publication header and the recipe instruction
containing that screenshot. Its indentation complaint concerns Markdown list
nesting, not indentation of publication controls.

The subsequent screenshots clarify items 6 and 7: outer recipe-content
margins must never exceed 1 inch, and section containers must use consistent
outer alignment. The screenshots show excessive reader insets and an
additional inset for Nutrition Per Serving and Notes relative to the reading
area.

The comprehensive reference remains product authority. The work-package
contracts below record the approved scope; the implementation record distinguishes
verified changes from the original reports. The comprehensive reference,
visual guide, and decision log now reflect the shared desktop/mobile transfer menu,
maximum screen gutters, nested lists, and bounded instruction photos.

## A. Publication header and cover paste

### Reports and evidence

- Item 1: add Ctrl+V image paste for publications.
- Item 2: the publication title is squeezed beside oversized actions; combine
  Import/Export into one action.
- The screenshot shows a Site cover, a narrow wrapped title and URL, and four
  wide actions competing for the same row.
- [Publication detail](../../../src/app/publications/[id]/page.tsx) uses a
  cover/title/actions grid. Its title receives the space left by the actions.
- [The shared media manager](../../../src/app/media/media-manager.tsx)
  already handles pasted image files for publication covers. Treat the report
  as a discoverability or behavior defect to reproduce, not proof that a new
  clipboard implementation is needed.

### Proposed contract

Use the existing compact publication toolbar and
[transfer menu](../../../src/app/publications/publication-transfer-menu.tsx)
as the closest reference. Their actions and keyboard behavior fit this
workflow; restricting the menu to mobile no longer fits the requested desktop
layout.

- Use one Import/Export trigger on desktop and mobile, retaining explicit
  `Export publication` and `Import recipe` menu items.
- Compact Edit and Add Recipe without sacrificing accessible names, visible
  focus, tooltips, or the applicable touch targets.
- Keep the title and source link readable. Reflow the actions before their
  intrinsic width forces excessive title or URL wrapping. Derive the reflow
  threshold from representative content rather than shrinking title text.
- Preserve Book, Magazine, Site, and Recipe Tin identity and cover behavior;
  the Tin remains non-editable.
- Make Ctrl+V and Cmd+V work in the open cover-management pane with clear
  guidance. Retain the file-picker alternative and mobile paste behavior.
- A pasted cover remains staged: Submit commits it, Cancel discards it.
  Unsupported content, invalid images, and upload failures must be explicit
  and recoverable without losing the publication draft.

### Acceptance

Extend `tests/e2e/publications.spec.ts` and `tests/e2e/media.spec.ts`:
test the supplied Site-title example, long names and URLs, all publication
types, narrow desktop and mobile. Assert no overlap or page overflow and no
title-font shrinkage. Test transfer-menu keyboard navigation, Escape and focus
return, both actions, clipboard paste, canceled selection, failed upload,
Submit persistence, and Cancel discard.

## B. Instruction nesting and explicit photo width

### Reports and evidence

Item 2 includes this exact authored step:

```markdown
+photo09-w800
- fix title shrinkage
- but also fix huge buttons
  - at least, import/export can be one button
    - also, this and the item above it should be indented.
- also, that image to the right doesn't look 800px wide
```

The nested entries render as peers. The referenced screenshot renders small.
[The Markdown parser](../../../src/lib/recipes/instruction-markdown.ts)
accepts leading whitespace but stores a flat list of inline-token arrays.
[Instruction-photo CSS](../../../src/app/styles/recipe-media.css) caps
desktop photos at `min(55%, 20rem)`, independently of the requested width.
These are confirmed implementation constraints, not yet a full diagnosis of
every output surface.

### Proposed contract

Preserve the existing Markdown entry flow, stable photo references, alignment
modifiers, decorative alt text, and image viewer. Correct the shared rendering
path rather than applying a visual indent to otherwise flat markup.

- Render the example as three semantic list levels. Preserve sibling order,
  mixed ordered/unordered nesting, and surrounding paragraphs.
- Retain authored indentation through editing, Save, reload, history viewing,
  and bundle round trips. Do not silently rewrite existing step text.
- Treat `-w800` as an 800 CSS-pixel requested width when the content area
  permits it, bounded by available space. Remove the unrelated 320px/55%
  ceiling for explicit widths; preserve the 200px default.
- When a requested width leaves no usable text lane, use a full-width bounded
  image block rather than overflow or an unnecessarily tiny float. Verify
  this transition against actual content and record its measurable reflow
  condition before extending it across output surfaces.
- Preserve mobile block layout, aspect ratio, saved framing, existing
  modifiers, float clearing, and separation below images.
- Apply equivalent behavior to private/public reading, offline rendering,
  print, and standalone HTML/PDF/image outputs. Printed output is constrained
  by its usable page or column width, not forced to overflow at 800px.

### Acceptance

Extend `tests/unit/instruction-markdown.test.tsx` with the exact fixture and
ordered/unordered nesting cases. Extend the relevant instruction/media
browser tests and `tests/e2e/exports.spec.ts`:

- Assert the nested DOM structure, not merely visible bullet characters.
- Measure 800px image width within rounding tolerance when at least 800px is
  available; assert available-width clamping otherwise.
- Cover default and explicit widths, left/right placement, portrait/landscape
  images, and adjacent/following instructions.
- Verify stored text survives reload and bundle round trips; verify nested
  structure and image bounds in the affected output formats.
- Exercise nested lists and large photos across print/download page breaks.
  Assert no clipped content, overlapping text, missing list items, or
  accidental extra blank pages. On-screen indentation alone is not sufficient
  acceptance for this shared-renderer change.

## C1. Recipe-editor controls

### Reports

- Item 3: explain the Main Ingredient checkbox.
- Item 4: desktop ingredient Preparation remains extremely narrow.
- Item 5: move recipe-edit Cancel and Delete to the left.

### Proposed contract

Use the existing ingredient control rail and compact cell editors as
references. Preserve those mechanisms, but do not copy their reported layout
defects. Deliver these controls independently from reader/nutrition layout.

- Keep Main in its edit-only control rail, not a new ingredient-data column.
  Give it a descriptive accessible name and a tooltip explaining that it marks
  a main ingredient for search. Add compact visible rail labeling where it
  fits; ensure the explanation is also available without hover.
- Size desktop Preparation to readable content using the established
  content-fit picklist rule. Test the trigger, editor, and open popup
  separately, including empty values, long custom values, divided portions,
  and cubed Size. Preserve mobile sizing and keyboard commit behavior.
- Left-align Cancel and Delete at the recipe-edit footer. Keep them distinct
  text actions, preserve delete confirmation and optimistic conflict handling,
  and leave Save actions in their established locations.

### Acceptance

Extend `tests/e2e/recipes.spec.ts` with keyboard, label, focus, and geometry
assertions. Test long ingredient names and preparation variants, checkbox
explanations using keyboard and touch, and left-aligned footer placement.
Preserve Save, Cancel, and Delete behavior and saved recipe values.

## C2. Reader gutters and nutrition alignment

### Reports and evidence

- Item 6: Nutrition Per Serving and Notes are inset further than the
  Ingredients/Instructions reading area.
- Item 7: outer content margins exceed the user's maximum of 1 inch.
- The screenshots demonstrate both the excessive outer inset and inconsistent
  section alignment. They identify reader layout, not nutrient-input widths,
  as the scope of the margin complaint.

### Proposed contract

Use the full-main-content alignment specified in the
[DLC 08 brief](dlc/dlc-08-recipe-public-and-print-layout.md) as the private
reader reference. Preserve the useful Ingredients/Instructions and
Nutrition/Notes column compositions; repair their outer containers rather than
stretching individual controls or removing meaningful internal indentation.

- Use one shared outer horizontal content boundary for the recipe summary,
  reading area, and Nutrition/Notes row. Each row or section group spans that
  boundary; individual columns retain their deliberate internal alignment.
- Cap the combined outer gutter on each side at 1 CSS inch (96 CSS pixels).
  Measure from the available main-content area's edges, excluding the private
  navigation rail. Include accumulated parent padding and centered margins,
  not just the nearest element's declared margin.
- Let the content container expand on wide screens instead of allowing an old
  fixed maximum width to create gutters larger than 96px. Keep existing
  smaller mobile gutters; 1 inch is a maximum, not a required inset.
- Apply this outer-gutter rule to private and public recipe reading. Do not
  stack public page padding and a second reader inset beyond the cap.
  Preserve print/download page-margin contracts separately.
- Align the Nutrition/Notes row's left edge with the reading area's left edge
  and its outer right edge with the shared content boundary. Nutrition's
  heading and label block must not inherit an extra centered section inset.
  Preserve nutrient sub-item indentation and right-aligned values.
- Check recipe edit and the shared nutrition pane for regressions, but do not
  widen a dialog or change unrelated screens to satisfy a reader-page rule.
- Maintain readable column composition, responsive stacking, and no horizontal
  overflow. Do not reintroduce oversized outer gutters as a prose-width fix.

### Acceptance

Extend `tests/e2e/recipes.spec.ts` and `tests/e2e/nutrition.spec.ts`, plus
public-reader coverage, with measured geometry:

- Assert each effective outer gutter is at most 96px, allowing 1px for
  rounding. Include 1920px and wider desktop viewports so a centered
  maximum-width regression cannot pass only at laptop widths.
- Assert shared section-group left and right edges agree within 1px.
  Distinguish intentional internal column gaps from outer gutters.
- Test short and long recipes, both ingredient presentations, nutrition
  present/absent, Notes present/absent, optional nutrients, large photos,
  mobile stacking, and widths around actual reflow boundaries.
- Inspect screenshots matching both reported failures and check readability,
  not just numerical bounds. Preserve nutrition calculations, overrides,
  estimates, and saved data.

## D. Recipe Tin import failure

### Report and initial lead

Item 8 reports `Unable to import this archive. No changes were committed.`
The user notes likely similarity to the earlier database import/export
failures.

[The commit route](../../../src/app/api/imports/commit/route.ts) uses the
shared `commit_database_import_with_media_sources` RPC and emits this message
for otherwise unclassified database errors. The recent
[trashed-recipe import-ID repair](../../../supabase/migrations/20261215000000_fix_trashed_recipe_import_ids.sql)
is an initial lead, not a confirmed cause. Recipe Tin mapping and transaction
context must both be checked.

### Investigation and preservation boundaries

1. Reproduce with the failing ZIP and selected preview choices, if available.
   Otherwise use synthetic recipe-scoped exports and record the missing
   reproduction evidence. A successful synthetic import alone does not close
   the reported failure.
2. Compare the earlier ZIP, media, and database-commit fixes with this path.
   Inspect the sanitized database error, constraint, and current function
   definitions. Verify migration application; do not infer it from repository
   presence or blindly reapply an existing migration.
3. Trace upload, archive validation, preview, ID mapping, destination choice,
   media staging, and database commit. Check active and trashed ID collisions,
   multi-recipe transaction context, and permanent-Tin resolution.
4. Add a failing test at the actual defect boundary, then repair the shared
   cause if demonstrated. Do not create a Tin-specific bypass or weaken
   validation to suppress the error.

Do not ship a speculative patch based only on similarity to earlier failures.
If the reported failure cannot be reproduced or tied to a specific sanitized
database error, report the investigation and leave this item unverified while
the independent UI work proceeds.

Preserve owner isolation, supported bundle versions, conflict choices,
privacy, relationship/media remapping, and atomic rollback. Recipe Tin maps to
the destination owner's existing collection; no second Tin is imported.
Replace retains the matched recipe's current publication; new/duplicate
imports retain the existing destination-selection contract.

Before any hosted migration, inspect linked migration history and run the
linked dry-run. Verify schema effects before repairing history. Never reset a
hosted database. Keep archive contents and sensitive database details out of
logs and user-facing errors.

### Acceptance

Use `tests/unit/import-planning.test.tsx`,
`tests/unit/import-commit-route.test.tsx`, `tests/e2e/import-scoped.spec.ts`,
and `tests/e2e/import-commit.spec.ts` as applicable.

Test new, Replace, and Duplicate recipe imports; Tin and ordinary-publication
sources/destinations; active and trashed collisions; multiple recipe roots;
media and supported legacy bundles. Verify saved graphs after reload, one
permanent Tin, retained privacy, and cleanup. Inject a commit failure and
verify that no partial records persist. Re-run the relevant database-import
and export regression cases because the commit path is shared.

## Delivery order, dependencies, and review gate

1. Review the revised plan. The 1-inch target is resolved as a maximum outer
   gutter, with consistent section-group alignment. Obtain the failing
   archive or sanitized error evidence for D when available.
2. Start D with the prior-import-fix comparison; data-transfer correctness is
   the highest-risk item. A and B have no implementation dependency on D.
3. Deliver A, B, C1, and C2 as separate focused changes. Each package starts
   with failing tests and its own end-to-end demonstration. C1 is independent
   of C2; coordinate B's photo geometry with C2's available-width changes and
   repeat the combined layout assertions after both are complete.
4. Reuse an existing development server. Inspect the reference and changed
   screens in the running app with representative desktop/mobile content,
   screenshots, and geometry/behavior assertions. Include widths immediately
   above/below each actual reflow boundary and an intermediate width.
5. Run focused unit/browser tests, relevant accessibility checks, TypeScript,
   targeted lint, and a production build for the implemented changes. Run
   database checks when D changes SQL. Update the product documents to match
   verified behavior and record any remaining limitations.

No schema changes are expected for A, B, C1, or C2. D may require a forward migration,
depending on the reproduced cause. No dependency upgrades, unrelated redesign,
nutrition-model changes, or local data resets are part of this plan.

## Implementation record

### A, B, C1, and C2

- Publication detail reuses the existing keyboard-operable transfer menu on
  desktop and mobile, alongside compact Edit and Add Recipe controls.
- Cover paste is verified through invalid clipboard content, staged Cancel,
  Submit, and reload. Non-image paste now gives an explicit recoverable error.
- One recursive semantic list renderer serves private/public instructions.
  Authored nested lists survive saving, reload, standalone HTML, and print.
- Explicit instruction photos reach their requested width up to available
  space; defaults remain 200px. A block fallback is used when less than 240px
  would remain for text. Paginated output also bounds photos to its columns.
- Main has visible and accessible search guidance. Empty Preparation editors
  use content-fit suggestion sizing. Cancel/Delete align left.
- Private/public reader section groups align, with effective outer gutters
  measured at no more than 96px per side, allowing 1px rounding. Geometry
  checks span 384px through 2560px, including intermediate/reflow widths.
- Desktop/mobile screenshots cover the reader, public reader, publication
  header, and editor. Existing cover-management, instruction-photo, nutrition,
  accessibility, and export-retry workflows are included in regression checks.

### D: reproduced and corrected

The supplied Site recipe archive reproduced HTTP 422 with database error 23514:
its source recipe URL remained in the primary location field after assigning
Recipe Tin, which forbids that field. The shared import planner now moves
incompatible URLs to external-URL References and incompatible printed locations
to printed citations, preserving source information and leaving compatible fields
unchanged. Equivalent imported references are not duplicated.

The actual supplied ZIP now imports successfully into a temporary local account.
Synthetic Site-to-Tin New, Replace, and Duplicate imports pass on desktop and
Fold 6, with the preserved URL verified after reload. The existing atomic
database-import and Recipe Tin regressions also pass. No SQL patch, hosted
migration, or local database reset was required.

### Follow-up visual corrections

The editor footer now has 18px separation above its divider so it does not
touch Add reference. The mobile Can Link switch stays 60px wide instead of
absorbing all remaining toolbar width. Geometry checks cover 320px through
900px and the 640px transition, plus desktop/mobile screenshots.

### Validation

- Full unit suite: 53 files and 546 tests passed, plus 8 bootstrap-admin tests.
- Added parser coverage for tabs and mixed list types, and shared-renderer
  coverage for repeated items, nested semantic lists, and nested photo clearing.
- TypeScript and production build passed. Full lint completed with 140 warnings
  and no errors; Markdown lint checked 89 files with no errors.
- Browser verification covers both Chromium desktop and Fold 6; see the
  focused regression suites in `tests/e2e/reported-fixes.spec.ts`,
  `publications.spec.ts`, `exports.spec.ts`, `media.spec.ts`, `nutrition.spec.ts`,
  `public-recipes.spec.ts`, `import-scoped.spec.ts`, and `import-commit.spec.ts`,
  plus focused editor, marker, Markdown, print, and accessibility workflows in
  `recipes.spec.ts`.
- Across those final runs, 111 distinct browser checks passed. Three existing
  project-specific skips remain: two desktop-only nutrition workflows on Fold 6
  and the touch-only crop workflow on desktop.
- The broad run passed 95 checks with 3 skips; 6 checks timed out under resource
  pressure. An overlapping recipe run passed 7 with 3 timeouts. All nine failed
  checks passed when rerun without overlapping browser jobs; that serial
  verification passed 17 checks with 1 intentional skip. No timeout limits or
  assertions were relaxed.
- Regression testing found screen gutter padding leaking into private print
  through a higher-specificity selector. Restricting that selector to screen
  preserves the independent 1/4-inch print margins. PDF checks verify title,
  metadata, and ingredient left edges at 18pt. Stale photo-cap and public-reader
  gutter expectations now assert the approved sizing rather than legacy insets.
- The supplied ZIP reproduction changed from HTTP 422 to a successful import;
  synthetic New, Replace, and Duplicate persistence tests cover the correction.
- The owned test server was stopped; the existing local app remains available.
- No commit or hosted deployment has been performed.
