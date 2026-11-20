# Purpose: Research and draft a new small-adjustments slice brief

## 2026-11-16 — session 3706593a-4fac-42c0-88f8-b20bbd0950e6

- Read `.github/prompts/slice.prompt.md`, the DLC roadmap, relevant
  comprehensive-reference and visual-design sections, and related existing
  slice briefs.
- Inspected current ingredient-size formatting, equipment assignment/display,
  recipe reference editing/loading/rendering, root metadata, Ingredient-first
  mobile layout, and Time Type suggestion handling.
- Searched related unit and browser tests for current format, responsive
  layout, and keyboard coverage.
- Checked repository state with `git status --short --branch`; worktree was clean.
- Checked local app availability with
  `curl --max-time 2 -sS -I http://localhost:3000/recipes`; no local server was
  listening.

**Boundary:** Research and local availability checks only; no brief or implementation changes made.

## 2026-11-16 — user decisions and brief draft

- Asked the user to resolve slice boundaries, external URL-title lookup and
  fallback, Equipment casing, mobile wrapping, Time Type Enter behavior, and
  page-title coverage.
- The user chose an umbrella with focused packages; approved bounded
  server-side lookup with URL fallback; chose recipe-output-only Equipment
  casing; confirmed mobile wrapping to avoid horizontal scrolling; chose Enter
  to append a blank time row and focus Minutes; and applied descriptive titles
  to all app routes.
- Drafted `docs/plans/slices/fixes/2026-11-17-small-adjustments.md` and updated the
  relevant comprehensive-reference, visual-design, decision-log, and
  workstream records to match those decisions.

**Boundary:** Documentation and continuity-record edits only; no application code or tests changed.

## Session 3706593a-4fac-42c0-88f8-b20bbd0950e6 — documentation validation on 2026-11-16

- `npm run lint:md` — reported eight errors: one 716-character existing
  decision-log table row outside this change, and seven errors in the unrelated
  `f550af59-9365-4e65-ad83-b3a167e99653` workstream.
- Focused Markdown lint on nine changed Markdown files, excluding the existing
  decision-log violation — zero errors. The new decision-log section has no
  lines over 120 characters.
- Local links in the new brief — zero missing. A broader scan found older
  broken links in unchanged sections of the comprehensive reference and
  decision log.
- `git diff --check` — passed. The added decision-log section is the only
  decision-log diff; its lint-reported line is unchanged.
- Checklist and save point updated for handoff. Rendered behavior remains
  unverified because the local app was unavailable during research.
## 2026-11-16 — session 3706593a-4fac-42c0-88f8-b20bbd0950e6

- `npm run typecheck` — passed.
- `npx vitest run tests/unit/ingredient-rules.test.tsx tests/unit/external-reference-title.test.tsx` — 34 tests passed.
- Focused `npx biome check` on changed implementation files — no errors; 17 warnings, including existing unused-import and CSS specificity warnings.
- Focused Playwright Time Type test — passed when run alone; combined run timed out. A source-link test failed to find an expected URL-labeled link.
- Settings, Updates, and reader Playwright checks timed out. `curl` to ports 3000 and 3001 also timed out while server processes were idle; stopped the local servers started for validation. Browser geometry was not verified.
- `git status --short` — confirmed generated `next-env.d.ts` was restored; worktree contains the expected implementation and documentation changes.
## 2026-11-16 — session 3706593a-4fac-42c0-88f8-b20bbd0950e6

- Updated the desktop editor table to size to content within the available
  width; captured and inspected a populated desktop editor screenshot.
- Ran the focused desktop ingredient-row e2e test. One run failed after reaching
  `Saving…`; a subsequent run passed the geometry, accessibility, and workflow
  assertions.
- Ran the responsive ingredient-entry e2e test at widths 901px through 390px;
  it passed without page overflow.
- Opened the supplied EatingWell URL in the integrated browser; it loaded with
  the title “Stovetop Chicken & Broccoli Casserole.” The earlier server-side
  probes returned 403, including one with an identifying app User-Agent.
- Ran focused Biome and `git diff --check`; both exited successfully. Biome
  reported existing CSS warnings. Removed the temporary screenshot.
## 2026-11-16 — session 3706593a-4fac-42c0-88f8-b20bbd0950e6

- Updated the manual-label e2e test to await the Edit Recipe heading after
  navigation. Removed temporary screenshot capture code after inspecting the
  desktop and Fold 6 captures.
- Updated the slice brief, comprehensive reference, visual design, and
  decision log to describe the optional label and lookup fallback behavior.
- `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test --workers=1 --timeout=120000 tests/e2e/source-links.spec.ts --project=chromium --project='Fold 6' --grep 'manual URL labels are saved'` — both projects passed.
- Focused `npx biome check` on the implementation and test files — exited
  successfully with one existing CSS specificity warning.
- Inspected both temporary screenshots; the label and URL fields fit the
  reference row. Removed both temporary screenshots after inspection.
- `git diff --check` — passed; verified the temporary screenshot names no
  longer appear in the e2e source.

## Verification continuation — 2026-11-16

- Updated the reader geometry e2e checks for long specifics, wrapping,
  centered mobile Preparation, no horizontal overflow, and 320px–761px widths.
- Focused Vitest on three reader/reference test files — 106 tests passed.
- `npm run typecheck` — passed.
- Focused Chromium Playwright tests passed for Time Type Enter and Recipe Tin
  title, public Equipment casing/catalog preservation, public page title and
  Size output, offline Size output, and reader responsive geometry.
- Initial concurrent browser runs encountered server startup/contention
  failures; rerunning each test with a managed server passed.
- `npx biome check --formatter-enabled=false` on changed files and
  `git diff --check` — passed; Biome reported 42 existing warnings.
- Focused Markdown lint on the slice, related product docs, and continuity
  records — passed. `npm run lint:md` — reported 22 existing decision-log and
  workstream formatting violations.
- Captured and inspected the authenticated reader at desktop 902px and mobile
  390px. Removed both temporary screenshots.

## 2026-11-18 — acceptance-gap verification, session 3706593a-4fac-42c0-88f8-b20bbd0950e6

- Added mobile reader stress coverage for a long ingredient name and a long
  formatted measurement at 320px, 390px, 540px, 760px, and 761px.
- Added private and public Equipment casing checks in the reader, print
  document, and standalone HTML output.
- Added a deterministic recipe-action unit test that injects a resolved page
  title and verifies it reaches the save RPC with the normalized URL.
- The protected-reference save test initially failed because title resolution
  cleared protected metadata on new recipes. Preserved incoming protected
  metadata while continuing to trust stored data for already-protected rows.
- `npx vitest run tests/unit/recipe-save-time-entries.test.tsx tests/unit/external-reference-title.test.tsx`
  — 15 tests passed.
- `npm run typecheck` — passed.
- Focused Playwright tests for long-content wrapping and private/public
  Equipment output — six tests passed across Chromium and Fold 6. The first
  run exposed an incorrect assumption that reader presentation switches
  automatically at 761px; the test now explicitly selects Standard view there.
- Focused Biome check — exited successfully with existing warnings.
- `git diff --check` — passed. `npm run lint:md` checked 145 files and reported
  existing decision-log/workstream formatting violations; the slice brief
  itself passed.

## Session 3706593a-4fac-42c0-88f8-b20bbd0950e6 — 2026-11-17

- Focused Vitest run across seven unit files — 118 tests passed. Covered URL
  lookup failure fallbacks and title-text preservation through bundle parsing,
  import planning, export, public-copy projection, and recipe duplication.
- Focused Playwright run for Ingredient-first wrapping and Settings Equipment
  casing — passed across Chromium and Fold 6. The stress fixture now seeds the
  divided ratio explicitly, and the Settings assertion compares the visible
  Equipment value with its stored display label.
- Focused Playwright run for Time Type keyboard flow and manual URL-label
  display — four tests passed across Chromium and Fold 6. Enter still appends
  exactly one row; Tab/blur do not append.
- `npm run typecheck` — passed. Focused Biome check of ten files — exited
  successfully with 33 warnings. `git diff --check` — passed.
- The long-content browser test checks no horizontal scrolling in the
  Ingredient-first layout through 760px and verifies Standard view at 761px;
  its extreme test content overflows the Standard view at 761px, outside the
  mobile wrapping behavior changed by this slice.
- Recipe history snapshots store recipe rows plus ingredient, ingredient-set,
  and time-entry data; references are separate records and are not currently
  part of the history snapshot.

## 2026-11-17 — breakpoint acceptance clarification, session 3706593a-4fac-42c0-88f8-b20bbd0950e6

- Reviewed the brief's breakpoint acceptance against the browser test and the
  recorded 761px Standard-view overflow.
- The user approved limiting the no-horizontal-scroll assertion to widths
  through 760px. Updated the brief to make the 761px desktop-presentation check
  explicit; the existing browser test already matches this boundary.
- No production or test code changed. No tests were rerun for this
  documentation-only clarification.

## 2026-11-17 — app version bump, session 3706593a-4fac-42c0-88f8-b20bbd0950e6

- The working version was 1.14.1. Existing project history uses patch bumps for
  small fixes, so ran `npm version patch --no-git-tag-version --ignore-scripts`.
- Package and lockfile root versions now report 1.14.2; confirmed the existing
  `parse5` dependency remained in the lockfile. `git diff --check` passed.
- Recorded version 1.14.2 in the small-adjustments brief. No tests were rerun
  for this metadata-only change; no commit or tag was created.
