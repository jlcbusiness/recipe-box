# Purpose: Deliver Count and Things measure equivalents

## 2026-11-12 — Session 46ab8600-3135-4196-bb9f-f8af616ee1a0

- Read repository guidance and the slice/update prompt files; confirmed the worktree was clean on `main`.
- Read product/data/design references, roadmap, DLC 12 and 16 briefs, and existing density/equivalent decisions.
- Inspected the recipe reader's unit picklist and transient overrides, density
  conversion rules, Settings equivalent editor, and related browser tests.
- Ran `git diff --check` successfully and checked the candidate brief's linked
  files; all exist.
- Ran `npm run lint:md`. It reported no errors in the new brief or this
  workstream, but 30 existing errors in `.github/prompts/slice.prompt.md` and
  two earlier workstreams.
- The user changed the proposed density precedence: trusted density now
  derives a missing equivalent dimension, and both equivalent dimensions are
  manually entered only when no trusted density exists. The brief and roadmap
  were revised; legacy two-dimension records remain an open decision.
- The user resolved the legacy behavior: preserve both existing values, use
  Weight as the temporary source while density exists, and ask which source
  to retain when the mapping is next edited. The derived field is read-only;
  clear its source to switch dimensions. Updated the candidate brief.
- The user requested a tooltip on the calculator icon. Updated the brief to
  require hover/focus/touch access and preserve a separate screen-reader
  description for the derived state.
- Re-ran `npm run lint:md` and `git diff --check` after revising the brief.
  The updated brief and workstream have no Markdown errors, whitespace
  validation passes, and the same 30 unrelated lint errors remain.
- Inspected `nutrition-rules.ts`: `amountInBasis` uses a direct equivalent for
  the target dimension before considering density. Updated the brief to require
  the same trusted-density and legacy-pair resolution for nutrition, including
  public recipe-level calculations without exposing Settings data.
- The user approved the revised brief and nutrition-consistency scope. Work can
  proceed to canonical contract updates, tests, and implementation.
- No production code was changed. The candidate brief is awaiting user review.

## Session 46ab8600-3135-4196-bb9f-f8af616ee1a0 — 2026-11-12

- Updated DLC 35 and the delivery roadmap to mark implementation complete;
  release version remains pending.
- Ran focused `test:unit`: 77 tests passed. `typecheck`, targeted Biome on 12
  source/test files, and `git diff --check` passed.
- Ran the ingredient-density UI E2E suite: six tests passed across Chromium
  and Fold 6.
- Ran the private print and public-link privacy tests: two tests passed for
  each flow across Chromium and Fold 6.
- Re-ran the private print test with one Chromium worker: it passed. The Next
  web server logged `The destination stream errored while writing data` in
  both parallel and single-worker runs; the cause was not isolated.
- Ran `npm run lint:md`: 110 files checked, with 30 errors in unrelated
  existing files; no reported issue was in this feature's docs or workstream.

## Reader interaction follow-up — session 46ab8600-3135-4196-bb9f-f8af616ee1a0

- Updated DLC 35, the comprehensive reference, decision log, and visual design
  to specify the dual-dimension `Units` switch, independent Count/Things
  choices in each unit list, single-dimension behavior, and visible mobile
  text controls.
- Reworked transient reader conversion state to track each dimension's
  Count/Things choice. The dual-dimension reader starts with Count/Things,
  reveals both resolved dimensions on `Units`, preserves the other slot when
  one is switched, and collapses only after both slots return. A single
  resolved dimension starts in that unit list with Count/Things available.
- Added unit coverage for dual/single-dimension conversion and ensuring a
  stored-measure reader does not expose equivalents. Added desktop/Fold 6 E2E
  coverage for the full selection flow, accessible labels, print output, and
  page overflow.
- Verified `npm run test:unit`: 641 tests passed; `npm run typecheck` passed;
  targeted Biome and `git diff --check` passed.
- Verified `npm run test:e2e -- tests/e2e/ingredient-density-ui.spec.ts`: all
  six tests passed across Chromium and Fold 6. The equivalent reader test also
  passed its accessibility scan, active-state print checks, and mobile
  overflow assertion.
- `npm run lint:md` still reports 30 existing errors in unrelated files.
  Initial E2E runs exposed incorrect test fixture and print selectors; after
  correcting those test details, the full density UI suite passed.

## Picklist copy and saved-unit follow-up — session 46ab8600-3135-4196-bb9f-f8af616ee1a0

- Updated DLC 35, the comprehensive reference, and visual design contract to
  document concise Count/Things labels, no separate `Recipe default` item, and
  restoring the saved unit by selecting it.
- Added unit and E2E assertions for the concise options and removed menu item.
  Corrected the unit test's expected Things label capitalization and used a
  supported exact-name regular expression for the saved-unit option.
- Ran `npx vitest run tests/unit/recipe-reader-rules.test.tsx`: 55 tests passed.
- Ran the equivalent UI E2E test: 2 tests passed across Chromium and Fold 6.
- Ran `npm run typecheck`, targeted `npx biome check`, and `git diff --check`:
  all passed.
- Ran `npm run lint:md`: 30 existing errors remain in unrelated files; the
  updated feature documents reported no lint errors.

## DLC 35 app version — session 46ab8600-3135-4196-bb9f-f8af616ee1a0

- The user selected app version 1.9.0.
- Ran `npm version 1.9.0 --no-git-tag-version --ignore-scripts`; npm reported
  `v1.9.0`.
- Updated the DLC 35 brief and delivery roadmap to record app version 1.9.0.
- Verified `package.json` and both lockfile version fields are 1.9.0;
  `npx biome check package.json` and the scoped roadmap/package
  `git diff --check` passed.
- Repository Markdown lint still reports 30 unrelated errors. The full
  `git diff --check` reports trailing whitespace in the pre-existing
  `.github/prompts/update.prompt.md` edit; that file was not changed here.
## 2026-11-12 — Session 55a5aef2-c5f1-44fb-ad69-976e9f10efbd (partial)

- Resumed the DLC 35 stream and read its checklist/current status plus the
  legacy Settings editor, public payload projection, and related E2E patterns.
- Added a legacy-pair E2E that seeds an explicit equivalent before adding
  trusted density, verifies saving is blocked until a source is chosen, and
  checks the chosen source is persisted without changing density.
- Added a Guest/public E2E that configures private equivalents, publishes a
  Count recipe, and verifies the private values are absent from returned HTML
  and rendered controls.
- Initial focused runs exposed test setup issues: direct settings mutations
  required a page reload, the public test needed the Recipe data tab, and the
  derived-status element made a broad status locator ambiguous. Updated the
  setup/assertions and reran successfully.
- Ran focused Playwright tests for both specs on Chromium and Fold 6: 2 passed
  per project. `npm run typecheck`, scoped Biome check, and focused
  `git diff --check` passed.
- This entry covers only the 2026-11-12 acceptance-coverage follow-up, not the
  earlier DLC 35 implementation trace.
## 2026-11-12 — Full-suite verification (session `55a5aef2-c5f1-44fb-ad69-976e9f10efbd`)

- `npm test`: unit phase passed (653/653); E2E phase reported 380 passed, 52
  failed, and 10 skipped, so the chained accessibility phase did not run.
- `npm run test:a11y`: 100 passed, 25 failed, and 1 skipped.
- `npm run build`: passed.
- Isolated the measure-equivalent database bundle E2E after its full-suite
  timeout. The error context showed Settings remained on Preferences; selected
  the Recipe data tab in the source and destination workflows.
- The nutrition public-output E2E failed because its test user had no public
  username. Added the existing `set_public_username` RPC setup before publish.
- Focused nutrition/settings/database-bundle E2Es on Chromium and Fold 6:
  5 passed, 1 expected Fold 6 skip. `npx biome check
  tests/e2e/nutrition.spec.ts` and `npm run typecheck` passed.
- Untriaged E2E and accessibility failures remain; no conclusion was reached
  about whether they are related to DLC 35.

Last recorded action: focused nutrition and equivalent E2Es passed on both
projects, with typecheck and scoped Biome passing.

## 2026-11-12 — Session 55a5aef2-c5f1-44fb-ad69-976e9f10efbd

- `npx playwright test tests/e2e/source-links.spec.ts --project=chromium
  --project='Fold 6'`: initially failed on Chromium because the replacement
  geometry target was the full-width time-fields container; Fold 6 passed.
- Updated the source-links geometry contract to the desktop 3-inch minimum and
  50% row maximum, removed the unused Rest-input measurement effect, and
  updated the Slice 11, visual-design, and comprehensive-reference wording.
- Re-ran the source-links E2E on Chromium and Fold 6: 2 passed.
- `npm run typecheck`: passed.
- Biome including `recipe-media.css` reported existing diagnostics elsewhere
  in that stylesheet. After correcting formatting in the edited E2E file,
  focused Biome for the changed TypeScript files passed.
- `git diff --check`: passed.

Last recorded action: source-links E2E, typecheck, focused TypeScript Biome,
and whitespace checks passed; remaining suite failures are pending.

## 2026-11-12 — Session 55a5aef2-c5f1-44fb-ad69-976e9f10efbd continued

- `npx playwright test tests/e2e/offline.spec.ts --grep "public recipe pages
  are excluded from private offline storage" --project=chromium
  --project='Fold 6'`: initially failed on both projects with "Recipe
  unavailable"; the fixture had not made its recipe public.
- Added the existing public username and `set_recipe_privacy` setup to the
  test fixture, then reran the same test: 2 passed.
- `npx playwright test tests/e2e/media.spec.ts --grep "media cleanup requires
  authorization and drains queued missing objects" --project=chromium
  --project='Fold 6'`: 2 passed without changes.

Last recorded action: offline public-cache E2E passes after correcting its
privacy setup, and the media cleanup queue E2E passes without changes.

## 2026-11-12 — Session 55a5aef2-c5f1-44fb-ad69-976e9f10efbd continued

- `npx playwright test tests/e2e/measurements.spec.ts --project=chromium
  --project='Fold 6'`: initially failed the Preparation text-width assertion
  on both projects; the measured width included space reserved for the
  longest suggestion.
- Updated the geometry checks to verify the 3mm gap between the suggestion
  editor and inline controls, and to click within that actual gap.
- Reran the full measurement spec: 8 passed across Chromium and Fold 6.
- `npx biome check tests/e2e/measurements.spec.ts`: passed.
- The passing Playwright run logged a Next destination-stream write error;
  tests still passed and the error has not been diagnosed.

Last recorded action: all measurement E2Es and focused Biome passed; one
non-failing Next destination-stream error remains unexplained.

## 2026-11-12 — Session 55a5aef2-c5f1-44fb-ad69-976e9f10efbd continued

- `npx playwright test tests/e2e/recipe-search.spec.ts --workers=1`: 31 passed,
  1 expected skip.
- `npx playwright test tests/e2e/reported-fixes.spec.ts --workers=1`: 4 passed
  across Chromium and Fold 6 after correcting the public-recipe action setup.
- `npm run test:a11y -- --workers=1`: initial run had three stale assertions.
  Updated the admin mobile heading expectation to the 34px responsive rule and
  limited the recipe-action row check to visible controls. The full rerun passed
  125 tests with 1 expected skip.
- The first final E2E rerun had three failures among 442 tests. Updated the
  Count-average test to select Recipe data in Settings, changed the private
  Rating assertion to match a numeric token (avoiding a username substring),
  and verified the offline transition by rerunning the failing case and the
  complete offline file (18 passed across both projects).
- `npm run test:unit`: bootstrap tests 8/8 and Vitest 653/653 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- After formatting the three flagged test files, `npm run lint` passed with 171
  advisory warnings; `git diff --check` passed.
- Final `npm run test:e2e -- --workers=1`: 432 passed, 10 expected skips, no
  failures. E2E logs still include non-failing Next.js stream errors, including
  an `ECONNRESET` abort; the cause remains unverified.

Last recorded action: full unit, E2E, and accessibility suites pass with only
expected skips; build, typecheck, lint, and whitespace checks pass.
