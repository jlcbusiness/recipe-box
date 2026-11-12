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
