# Purpose: Aligning app documentation and tests with current behavior

## 2026-11-13 — Session a471872d-f4e4-45e1-8534-c7608c40f234 (partial)

- Read the slice workflow, reader/editor design contracts, DLC 04 and DLC 37,
  the data model, and the current reader/editor division paths and tests.
- Created and revised the proposed
  [DLC 38 brief](../../plans/slices/dlc/dlc-38-separate-divide-from-preparation.md)
  following user feedback.
- Verified the brief with targeted Markdown lint; all referenced repository
  files exist. The repository-wide Markdown lint also ran and reported existing
  errors in unrelated files; the new brief was not among them.
- User approved implementation with one shared persisted portion ratio.
  The selected editor unit is not persisted; the display chooses a readable
  measure for dual-measure rows based on formatted integer portions, then the
  smaller displayed sum, with Volume as the final tie-break.

This trace is partial and covers the preparation phase through approval.

## 2026-11-13 — Session a471872d-f4e4-45e1-8534-c7608c40f234: DLC 38 completion

- Ran focused `vitest` reader and ingredient-rule tests: 83 passed.
- Ran targeted Playwright tests for Divide editing and the mobile editor:
  four passed across Chromium and Fold 6, including responsive geometry and
  accessibility checks at the tested viewport sizes.
- Ran `npm run typecheck` and error-level Biome checks on changed code: passed.
- Ran `npm run build`: passed.
- Linted the three changed DLC and roadmap Markdown files: passed. The full
  repository Markdown command still reports 37 errors in unrelated existing
  prompts and workstream records.
- Bumped the app to 1.12.0 with `npm version minor --no-git-tag-version`;
  verified `package.json` and the lockfile root version match.
- Started `npm run dev:test` for integrated-browser inspection; it loaded the
  sign-in page. No authenticated recipe screenshot was captured. Stopped the
  server and restored the generated `next-env.d.ts` references.
- Ran `git diff --check`: passed.

## 2026-11-14 — Session a471872d-f4e4-45e1-8534-c7608c40f234: Clarified Divide editor

- Ran initial test-first checks and confirmed the expected behavior gaps: the
  old serializer rejected a blank first-portion amount, the checkbox hid that
  input, and the form remained narrower than the approved desktop width.
- Implemented the always-visible input without a checkbox. Blank and cleared
  values now clear the staged ratio; unsupported or invalid divisions retain
  explicit validation. Keyboard Enter focuses the first-portion input.
- Expanded `.recipe-form` to a 1200px maximum and removed checkbox styles.
- Updated the DLC 38 brief and visual design guidance to document blank-value
  semantics, the no-checkbox editor, and the wider form.
- Ran `npx vitest run tests/unit/ingredient-rules.test.tsx`: 24 passed.
- Ran all `tests/e2e/measurements.spec.ts` browser tests: 10 passed across
  Chromium and Fold 6. The mobile ingredient-row test also passed in both
  projects during focused testing.
- Ran `npm run typecheck`, `npm run build`, focused Biome checks, and
  Markdownlint on the two changed product docs: passed. The combined Biome
  check of the stylesheet exited successfully with 33 warnings at unchanged
  stylesheet rules.
- Captured and inspected authenticated editor screenshots at 1440px desktop and
  Fold 6 mobile viewports. Both showed the intended wide form and fitted mobile
  row pane; the temporary screenshot files were removed.

## 2026-11-13 — Session a471872d-f4e4-45e1-8534-c7608c40f234: Reader refinements

- Updated the reader and mobile Preparation E2E assertions. The Fold 6 failure
  showed the expected mobile “Ingredient” and “Amount” headers, so the test now
  checks both semantic columns.
- Updated the DLC 38 brief and visual-design contract for reader labels,
  mobile Preparation sizing, table-cell padding, and stacked measurement gap.
- Ran targeted ingredient-row, ingredient-set, and measurement E2E cases in
  Chromium and Fold 6: 8 passed. One dev-server stream-write error was logged
  during the run, but no test failed.
- Ran focused ingredient and reader unit tests: 84 passed; `npm run typecheck`
  and `npm run build` passed.
- Ran Biome on the affected source, style, and test files: exit 0 with 57
  warnings and no errors. Markdownlint on the DLC 38 brief and visual-design
  document reported no errors.
- Temporarily captured authenticated Standard and Ingredient-first screenshots
  at desktop and mobile sizes in the measurement E2E test. The screenshot run
  passed; inspected images showed the “divided” desktop header, the Standard
  “divided” label, and the mobile “divide” note below Preparation. Removed the
  temporary screenshot instrumentation and all four temporary image files.

## 2026-11-13 — Session a471872d-f4e4-45e1-8534-c7608c40f234: Divide reader follow-up

- Updated the synthetic sample's Chickpea Flour casing, reader presentation,
  focused tests, and DLC 38/visual-design contracts for the desktop “divided”
  label, mobile comma, and internal column spacing.
- Ran the focused Chromium measurement E2E case: 1 passed. Captured and inspected
  desktop and mobile screenshots; the label, comma, and table spacing matched
  the requested layout. Removed the temporary screenshot code and image files.
- Ran the reader unit tests: 60 passed. Ran Biome on the affected source, style,
  and test files: exit 0, 28 warnings, no errors. Earlier checks for this
  follow-up also passed typecheck, production build, fixture JSON validation,
  and changed-document lint.
- Reviewed the current visual-design Divide contract; no stale behavior wording
  was found. The earlier dev-server stream-write error remains uninvestigated.

## 2026-11-13 — Session a471872d-f4e4-45e1-8534-c7608c40f234: Mobile Standard wrapping

- Added mobile Standard ingredient-row `line-height: 1.25` and right alignment;
  updated the visual-design contract and DLC 38 brief.
- Ran the focused Preparation/Divide E2E test on Chromium and Fold 6: both
  passed. The mobile Standard assertions checked right alignment and the 1.25
  line-height ratio. Captured and inspected a temporary 300px screenshot of a
  long flour row; it wrapped compactly and ended at the right edge, then the
  temporary image was removed.
- `npm run typecheck` passed. Targeted Markdown lint reported 0 errors; Biome
  formatting and lint checks on the changed CSS and measurement test passed.
- The full check reports an existing `!important` lint error in
  `recipe-media.css` and a formatting error in the otherwise unchanged
  `recipes.spec.ts`. The broader `recipe detail print matches the active
presentation` E2E reached a pre-existing cell-count assertion and found 4
  cells where it expects 3; the hidden mobile Amount cell accounts for the
  extra DOM cell. No unrelated test assertion was changed.

## 2026-11-13 — Session a471872d-f4e4-45e1-8534-c7608c40f234: Reader layout and casing follow-up

- Updated the Standard reader markup/CSS for a left-aligned primary line and a
  compact, right-aligned mobile continuation without a leading comma. Kept the
  desktop presentation inline. Hid the visible desktop Divide table header
  while retaining its semantic `th`; raised internal mobile Ingredient-first
  padding from 4px to 6px with outer padding still zero.
- Updated the DLC 38 and visual-design contracts. Ran the focused responsive
  measurement E2E on Chromium and Fold 6: 2 passed. Ran focused reader and
  fixture unit tests: 67 passed; typecheck, changed-code Biome, stylesheet
  formatting, targeted Markdown lint, and `git diff --check` passed.
- Captured and inspected authenticated Standard-mobile and
  Ingredient-first-desktop screenshots from the E2E flow, then removed the
  temporary screenshot calls and files. The integrated browser showed the
  offline shell instead of an authenticated recipe.
- `npm run seed:synthetic -- --local --dry-run` reported local loopback and
  zero writes. A subsequent local seed attempt failed while trying to rename
  `chickpea flour`; a read-only local catalog check still returned
  `Chickpea Flour`. The database trigger in
  `supabase/migrations/20261028010000_normalize_alphabetize_ingredient_catalog.sql`
  applies `initcap` on inserts and renames. The attempt stopped before recipe
  processing, after account-ensure/admin steps; possible fixture-account
  provisioning was not reconciled. Removed the ineffective seeder code.
- The fixture is lowercase, but recipe display preserves title case for
  multiword canonical names. Awaiting a user decision on whether recipe views
  should lowercase all multiword ingredient names; no schema or catalog-rule
  change was made.

## 2026-11-13 — Session a471872d-f4e4-45e1-8534-c7608c40f234: Multiword recipe display

- Read the installed Next.js Server and Client Components guide, the shared
  ingredient-display helper, its editor and reader call sites, focused tests,
  visual-design contract, and DLC 38 brief.
- Implemented the user's choice to lowercase all multiword ingredient names in
  recipe views. Added an opt-in helper option and enabled it only in
  `recipe-reader.tsx`; editor preview and canonical catalog values remain
  title-cased. Updated the visual-design contract and DLC 38 brief.
- Added unit coverage proving the helper preserves default/editor casing and
  lowers the recipe display when requested. The focused responsive E2E test
  now checks the name in Standard and Ingredient-first views.
- Ran `npx vitest run tests/unit/ingredient-rules.test.tsx tests/unit/recipe-reader-rules.test.tsx`:
  85 tests passed. Ran the focused `measurements.spec.ts` test on Chromium and
  Fold 6: 2 passed. The first run exposed a stale test variable after a fixture
  rename; corrected it and reran successfully. `npm run typecheck`, targeted
  Biome, product-document lint, and `git diff --check` passed.
- Opened the integrated browser at `http://localhost:3001/`; it showed the
  offline recipes page with no saved recipes. E2E verified rendered content in
  its authenticated browser context, but no authenticated screenshot of the
  live recipe was available.

## Session a471872d-f4e4-45e1-8534-c7608c40f234 — 2026-11-14

- Refined `tests/e2e/measurements.spec.ts`: allowed a 2px same-line baseline
  difference after observing 1.03125px; changed no-wrap measurement to inspect
  each text block independently so the intended Preparation/Divide line split
  is not counted as wrapping.
- Captured and inspected Standard and Ingredient-first screenshots at mobile
  and desktop sizes. The Ingredient-first table showed uppercase names because
  the private editor’s shared table rule transformed every row header. Scoped
  `text-transform: none` to reader ingredient-name spans and added exact text
  and computed-style assertions.
- Measured a 9,100px mobile table width caused by `width: 1%` on two columns
  combined with intrinsic max-content sizing. Removed those percentage widths;
  final mobile fixture fits at 320px, retains at least 8px column gaps, and
  avoids page-level overflow.
- Final `npx playwright test tests/e2e/measurements.spec.ts -g "Preparation and
Divide stay independent while Size remains tied to Preparation"
--project=chromium --project="Fold 6"`: 2 passed.
- `npm run typecheck`, `npx biome check tests/e2e/measurements.spec.ts`,
  `npx biome format src/app/styles/recipe-media.css`, product-document
  Markdown lint (2 files, 0 errors), and `git diff --check` passed. The focused
  CSS specificity check emitted existing unrelated warnings only.
- Removed temporary screenshots after inspection.
- After updating the checkpoint, Markdown lint on all three workstream records
  reported 0 errors; the final `git diff --check` passed.

## 2026-11-14 — Standard mobile wrapping follow-up (session `a471872d-f4e4-45e1-8534-c7608c40f234`)

- Read the current Standard reader, mobile CSS, DLC 38 brief, visual-design
  contract, focused E2E scenario, and this workstream's save point.
- Implemented intrinsic inline text flow and measured the full and
  Preparation/Size-only widths to choose between inline, Divide-only, and
  grouped-continuation layouts.
- Updated the responsive E2E fixture and contracts. Initial checks exposed
  subpixel line-baseline differences and a measurement that needed to override
  the continuation's mobile `white-space`; both were corrected.
- Ran the focused E2E on Chromium and Fold 6: both passed. Typecheck, Biome,
  Prettier, and `git diff --check` passed.
- Captured and inspected authenticated Standard screenshots at 300px, including
  a constrained-width case where Preparation and Divide share the continuation
  line. Repository Markdown lint reported 37 errors in unrelated existing
  files; no changed product document was listed.

Last recorded action: verified the responsive reader and inspected its
authenticated mobile rendering.
*** End of File

### 2026-11-14 — Wrapped continuation spacing (session a471872d-f4e4-45e1-8534-c7608c40f234, partial)

- Ran the focused measurements E2E on Chromium and Fold 6; both passed.
- A parallel Chromium/Fold 6 run first hit `EADDRINUSE` on the shared test
  port; running the projects sequentially resolved it.
- Ran `npm run typecheck`; it passed.
- Ran Biome on the changed TypeScript files; it passed. A whole-file check of
  `recipe-media.css` reports pre-existing formatter differences; CSS
  error-level lint passed.
- Ran `git diff --check`; it passed.
- Targeted Markdown lint of the two product contracts and three workstream
  records passed with zero errors.
- Captured and inspected the authenticated mobile ingredient list screenshot,
  then removed the temporary image.
- Trace covers this spacing follow-up only, not the entire session.

### 2026-11-14 — Ingredient-first small caps (session a471872d-f4e4-45e1-8534-c7608c40f234, partial)

- Ran the focused measurements E2E on Chromium and Fold 6; both passed with
  computed-style assertions for desktop and mobile Ingredient-first names.
- Ran `npm run typecheck`; it passed.
- Biome check on the E2E file and error-level lint on `recipe-media.css` passed.
- Targeted Markdown lint of the visual-design contract and DLC 38 brief passed.
- The shared browser tab was a Chrome error page; captured and inspected
  authenticated desktop and 320px E2E screenshots, then removed them.
- Desktop unification to a single Amount column was not implemented; kept as
  a deferred design idea.
- Trace covers this styling follow-up only, not the entire session.

### 2026-11-14 — Reader toolbar alignment (session a471872d-f4e4-45e1-8534-c7608c40f234, partial)

- Updated `recipe-media.css`, `recipes.spec.ts`, and the visual-design
  contract to keep reader controls right-aligned independently of summary
  length; preserved the mobile stacked layout and desktop sort-direction slot.
- Geometry checks first found a 67px shift, then 34px after excluding the
  summary from heading sizing. Reserving the desktop direction-control slot
  removed the remaining movement across four summary states.
- Four focused browser tests passed across Chromium and Fold 6. Typecheck,
  Biome lint, and `git diff --check` passed.
- Inspected authenticated Standard and Ingredient-first screenshots on desktop
  and mobile, then removed the generated PNGs.
- The Biome formatter check reports one unrelated existing formatting
  difference in the equipment-menu bounds assertion. Targeted Markdown lint
  of the visual-design contract and workstream records passed; repository
  Markdown lint reports 37 errors in unrelated existing files.
- Trace covers this toolbar follow-up only, not the entire session.

### 2026-11-14 — Repository-wide audit opened (session a471872d-f4e4-45e1-8534-c7608c40f234, partial)

- The user broadened the goal from the completed DLC 38 work to checking that
  app documentation and tests reflect current behavior, running necessary
  suites, and addressing resulting issues.
- Expanded the existing DLC 38 workstream with user approval; preserved its
  prior records and all uncommitted repository changes.
- Added an audit checklist and dependency-tracked tasks. Next action is to
  inventory product documentation, test runners, and workflow coverage before
  baseline test execution.

## 2026-11-14 — Repository-wide audit verification (session a471872d-f4e4-45e1-8534-c7608c40f234)

- `npm test`: unit suite passed (667 tests); E2E suite exited 1 with 417
  passed, 25 failed, and 10 skipped. This run preceded the final test-only
  corrections below.
- Isolated the two new Divide E2E tests; fixed the legacy fixture by seeding
  its historical portion ratio through the local service role, then verified
  both tests on Chromium and Fold 6 (4 passed).
- Updated the mobile spacing assertion to the requested 8px and corrected
  ingredient-first print assertions for the current hidden mobile Amount cell.
  The measurement geometry test and reader print test passed in focused runs;
  the oversized public-print pagination test still reports one overflowing
  column. Serial checks also left the recipe multiselect and Save/Delete
  geometry tests failing; no clean-baseline comparison was made.
- `npm run test:database`: 14 pgTAP files and 187 tests passed.
- `npm run test:advanced-rules` and
  `npm run test:migration:ingredient-portions`: passed.
- `npm run test:a11y`: 121 passed and 6 failed in ingredient-density,
  ingredient-row reorder, Tags catalog, and nutrition Settings coverage.
- `npm run typecheck`, focused Biome checks, and `git diff --check` passed.
  Targeted product-document lint had passed earlier; full Markdown lint still
  reports 37 errors in unrelated existing files.
- No clean-baseline comparison was run for the remaining E2E/accessibility
  failures; do not treat them as proven pre-existing or caused by this audit.

## 2026-11-15 — Session a471872d-f4e4-45e1-8534-c7608c40f234 (continued)

- The print-overflow investigation constrained the generated ingredient table
  and wrapper to the output column. The focused public-recipe print test passed
  on Chromium and Fold 6 after the test normalized React comment separators
  when checking visible text.
- `npm test`: bootstrap tests (8) and unit tests (667) passed; E2E reported
  435 passed, 10 skipped, and 7 failed. Each failed case passed when rerun
  individually after the print assertion update.
- `npm run test:a11y`: 123 passed, 1 skipped, 4 timed out with two workers.
  `npm run test:a11y -- --workers=1`: 127 passed, 1 skipped.
- `npm run test:e2e -- --workers=1`: 437 passed, 10 skipped, 4 failed. The
  failed offline, admin-update, Advanced Rules mobile, and publication cases
  each passed when rerun individually; the Fold 6 publication ISBN flow passed
  three repeated runs. No root cause or clean-baseline comparison was
  established for the full-suite-only failures.
- Re-ran the density editor E2E test with screenshots enabled. Its responsive
  geometry assertions passed, and the long-derived-value screenshots were
  inspected at desktop and Fold 6 sizes; the value and calculator icon do not
  overlap.
- Final `npm run lint:md` checked 125 files with no errors; `npm run typecheck`,
  focused Biome on the updated public-recipe test, and `git diff --check`
  passed.
- After updating the continuity records, reran `npm run lint:md` and
  `git diff --check`; both passed. Removed the temporary density screenshot
  output directories.

*** End of File
