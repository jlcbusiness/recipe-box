# Purpose: Move account tools and admin work into clear destinations

## Progress History

- 2026-11-11: Confirmed that Username and App data should be separate pages
  reached from the Account menu, not embedded in Settings or the dropdown.
  Drafted DLC 34 to move Accounts and Updates into admin-only Settings tabs.
  Production changes await review of the proposed brief and route paths.
- 2026-11-11: `git diff --check` passed for the planning changes. Targeted
  Markdown lint could not run because the local `markdownlint` executable is
  unavailable; no dependencies were restored for this documentation-only
  checkpoint.
- 2026-11-11: Clarified the brief to state that Preferences and Recipe data
  remain for all users, only Account & data is removed, and App admin/Updates
  are added for admins.
- 2026-11-11: The user approved DLC 34 and the proposed Username and App data
  route paths. Proceeding to canonical contract updates and implementation.
- 2026-11-11: Updated the canonical product and visual contracts, added
  standalone authenticated Username and App data pages, moved admin Accounts
  and Updates into role-gated Settings tabs, and updated the legacy `/admin`
  redirect and related action return paths. Added and updated E2E coverage.
- 2026-11-11: TypeScript passed; 629 unit tests and 8 bootstrap-admin tests
  passed; repository lint passed with warnings; `git diff --check` passed.
  Markdown lint found a trailing-space issue in the new brief, now corrected,
  plus existing issues in `.github/prompts/slice.prompt.md` and another
  workstream. At that checkpoint, focused E2E and rendered checks remained
  blocked by the local migration failure.
- 2026-11-11: With approval, made the protected-reference migration tolerate
  either the old allow-list (replace exactly once) or the already-updated
  allow-list (no-op exactly once). The local schema already had the new
  fragment; `supabase migration up` applied the pending migration without a
  reset. Fixed mobile App data action ordering and a stale reset-test route,
  and corrected the legacy import fixture's table list. Reset/import E2E tests
  passed on Chromium and Fold 6 (12/12); account/admin destination tests passed
  on both projects (4/4).
- 2026-11-11: Reviewed App data screenshots at desktop and 307px mobile width;
  layout and no-overflow assertions passed. A broader 104-test E2E run had
  82 passes, 20 failures, and 2 skips. After the targeted fixes, the remaining
  failures observed were in nutrition, recipe-column persistence, and a
  footer computed-style assertion, outside this slice. Release versioning was
  still pending at that checkpoint.
- 2026-11-11: Updated `package.json` and `package-lock.json` to 1.8.0 as
  proposed in DLC 34. Confirmed both lockfile version fields match and reran
  account/admin destination E2E tests (4 passed across Chromium and Fold 6)
  and repository lint.
- 2026-11-11: Resumed this workstream in session
  `626131e5-5a28-43d6-90cd-9eddeedde4d3` to address Account menu spacing and
  App data action placement. Menu links now use compact 48px rows; transfer
  actions are centered, followed by the centered Wipe action 12px above the
  normal-flow footer. Ten focused Chromium and Fold 6 E2E tests passed,
  including no-scroll and alignment checks. Typecheck and the changed-file
  Biome check passed; the check reported 39 CSS warnings.
- 2026-11-11: The user clarified that 48px still left an entire line of blank
  space in the Account menu and chose 32px rows. Updated the Account menu,
  focused geometry assertion, DLC 34 acceptance criteria, and visual design
  contract to use 32px links as an explicit touch-target exception. Four
  focused Chromium and Fold 6 E2E tests, typecheck, and changed-file Biome check
  passed; the mobile menu screenshot confirmed the tighter visual spacing.
- 2026-11-11: The user then requested separation between App data and Sign out.
  Added an 8px gap after the final link only, preserving the 32px spacing
  between Username and App data. Both account-menu E2E projects passed, as did
  typecheck, changed-file Biome check, and diff check.
- 2026-11-11: Ran the DLC 34 focused Settings, admin Updates/invitation, reset,
  import, and account E2E selection: 52 of 56 tests passed. Two Settings tests
  failed on both Chromium and Fold 6: the footer computed-style assertion
  expected `flex-end` but observed `flow-end`, and recipe column reordering
  reported `Recipe column order could not be saved.` The latter leaves the
  preserved Recipe data workflow unverified for sign-off.
- 2026-11-11: Updated the local recipe-column-order RPC to accept the current
  supported column set while preserving legacy keys required by the database
  constraint. The E2E save now succeeds and a direct authenticated read shows
  the value remains saved after reload.
- 2026-11-11: Replaced the footer `justify-content` assertion with a geometry
  check; the footer and unit-preferences Settings test passes on Chromium and
  Fold 6. The recipe-order test still fails on both projects because the
  Settings server render returns the previous order after reload, despite the
  direct API read showing the saved value.
- 2026-11-11: Confirmed the app and test helper use the same local Supabase
  endpoint and the Settings page and server action use the test account. A
  server-side Supabase read and raw no-store fetch both returned the previous
  value. Targeted `revalidatePath('/settings')`, a force-dynamic Settings route,
  and disabling the development HMR fetch cache did not change the result;
  temporary diagnostics and those ineffective experiments were removed.
- 2026-11-11: The focused two-project run passed both footer tests and failed
  both recipe-order reload assertions. `npm run typecheck` and
  `git diff --check` passed.
- 2026-11-11: Traced the recipe-order reload failure to normalization: the RPC
  retains nine legacy recipe-time keys required by the database constraint,
  while the client normalizer rejected those keys and fell back to defaults.
  The normalizer now ignores only those known legacy keys; unknown keys and
  duplicates remain invalid. Added a regression test; all 18 explorer-state
  unit tests passed.
- 2026-11-11: All 24 Settings E2E cases passed on Chromium and Fold 6. The
  broader 72-case selection exposed stale scoped-import fixtures missing
  `total_time_minutes`; the shared fixture now defaults omitted totals to zero.
  The scoped-import tests then passed 14/14, and the broader 72-case selection
  passed. Typecheck, targeted Biome, and diff checks passed.
- 2026-11-12: A targeted Username/export acceptance check passed the Username
  test on Chromium and Fold 6 and the App data export/retry test on Chromium.
  The Fold 6 export case failed its button-position stability assertion after
  showing the error alert, before reaching the retry assertions. The button
  moved about 13px; vertical centering of the transfer group is a plausible
  cause. The slice brief requires visible, retryable errors but does not
  explicitly require a stable button Y position.
- 2026-11-12: Anchored App data export feedback below the Export and Import
  actions and above Wipe all account data, without moving the controls. Added
  Fold 6 and desktop geometry checks and clarified both product contracts.
  The focused export/retry E2E passed on Chromium and Fold 6; screenshots show
  the alert does not cover Import. Typecheck, targeted Markdown lint, and
  `git diff --check` passed. Repository Markdown lint still reports 30
  existing issues in unrelated prompts and workstream trace entries.

## Save Point

- Goal: reorganize user account destinations and administrator workflows
  without changing existing data or authorization behavior.
- Status: The DLC 34 routes, tabs, account/admin workflows, footer assertion,
  recipe-column reload, and App data export-error geometry are verified. The
  full Settings E2E file passed 24/24, the broader focused workflow selection
  passed 72/72, and the focused export/retry E2E passed on Chromium and Fold 6.
  The full repository E2E suite was not rerun.
- Repository/branch: `/home/joshlamont/Code/recipe-box`, `main`.
- Current step: the identified export-error layout issue is fixed and its
  retry flow is verified. Full repository E2E was not run, so this is not a
  full repository sign-off.
- Last verified result: the focused export/retry E2E passed 2/2 on Chromium
  and Fold 6. The error alert renders below Import and above Wipe all account
  data while Export, Import, and Wipe retain their positions.
  `npm run typecheck`, targeted Markdown lint, and `git diff --check` passed. Biome
  exited successfully with existing CSS warnings; repository Markdown lint
  reports 30 existing issues outside the updated product-contract documents.
- Next action: none for the export-error geometry. The full repository E2E
  suite remains unrun.
- Checklist: [checklist.md](./checklist.md)
- Trace: [trace.md](./trace.md); current session
  `f101d50d-30c8-4f3b-8624-793c3b552a2b`; last recorded action: export-error
  geometry, responsive screenshots, and focused validations passed.
