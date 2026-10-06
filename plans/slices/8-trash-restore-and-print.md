# Slice 8: Trash, Restore, and Print

This brief delivers the recipe lifecycle after editing: a recipe owner can move
a recipe to Trash, restore it intact within 30 days, and print a clean,
unscaled recipe matching the current Standard view. It does not introduce
publications, sharing routes, scaling, alternate reader controls, or permanent
user-directed deletion.

The product authority is
[plans/comprehensive-reference.md](../comprehensive-reference.md), especially
[§ 4, Ingredient Presentation and Sorting](../comprehensive-reference.md#4-ingredient-presentation-and-sorting),
[§ 6.6, Trash, Restore, and Purge](../comprehensive-reference.md#66-trash-restore-and-purge),
[§ 12, Change History and Forensic Audit](../comprehensive-reference.md#12-change-history-and-forensic-audit),
and [§ 13, Interaction, Keyboard-First Design, and Accessibility](../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility).
Related boundaries are in the
[first-draft specification](../first-draft-spec.md),
[data model](../data-model.md),
[visual design guide](../visual-design.md),
[delivery roadmap](../delivery-roadmap.md),
and [decision log](../decision-log.md).

## Outcome

An authenticated owner can deliberately delete a saved recipe into a dedicated
Trash view, restore it before its 30-day retention period expires, and resume
viewing and editing the same recipe, ingredient rows, measurements, instruction
steps, and ingredient mentions. Normal recipe list, detail, and edit reads do
not expose trashed recipes. A daily local Supabase Cron job permanently removes
expired recipes and their recipe-owned content. From an active recipe detail,
the owner can invoke the browser print dialog and receive a clean, unscaled
paper layout that matches the Standard view without application or editor
chrome.

## Verified implementation constraints

- The current local stack pins Supabase CLI `2.119.0`, PostgreSQL 17, Next.js
  `16.3.8`, React `19.3.0`, Playwright `1.63.0`, and axe Playwright `4.13.0`.
- [Supabase Cron](https://supabase.com/docs/guides/cron) uses `pg_cron`, stores
  jobs in the `cron` schema, and can invoke a database function. Use it for a
  daily local purge trigger; do not require Vercel or any hosted account.
- `recipes` already has owner-scoped RLS, versioned explicit saves, and
  append-only `recipe_history`. Recipe ingredients, measurements, steps, and
  step mentions already belong to the recipe. No publication or public-link ID
  exists yet.
- Slice 20 owns public routes, random public-link IDs, private/trashed `404`
  behavior, permanently purged `410` behavior, and the `purged_recipe`
  public-ID tombstone. Slice 8 must not create a public route or a speculative
  public identifier.

## Scope

### Included

- A recipe-only soft-delete lifecycle: delete to Trash, restore before expiry,
  and a scheduled permanent purge after 30 complete days.
- A Trash screen in the authenticated shell with active and empty states,
  deleted and expiry dates, and an explicit Restore action.
- Version-checked, owner-scoped lifecycle mutations that leave a history event
  for trash and restore.
- Read boundaries that hide trashed recipes from normal recipe list, detail,
  edit, and save flows while allowing their owner to read them only through the
  Trash workflow.
- A baseline print action on active recipe detail and print-media styling that
  presents its persisted content in the current Standard view.
- Database, browser, accessibility, responsive, and deterministic time-boundary
  coverage written before production code.

### Excluded

- Publication trash, restoration, and its three delete choices; publications
  are introduced in Slice 9.
- Public recipe routes, public cache headers, random public IDs, and `404` or
  `410` responses; Slice 20 owns those external semantics and tombstones.
- User-facing permanent-delete, empty-trash, retention customization, or
  version restoration.
- Scaling, unit conversion, and alternate reader presentations; Slice 13 adds
  scaling and Slice 16 adds reader view controls. Until alternate views exist,
  this slice prints the Standard presentation shown in recipe detail, with the
  stored amounts and units exactly as saved.
- Recipe photos, publication attribution, custom paper sizes, application-
  generated PDF export, and print-preview infrastructure. Browser Print-to-PDF
  remains available through the native print dialog.

## Data and lifecycle contract

### Recipe state

- Add `trashed_at timestamptz null` and `trashed_by_user_id uuid null` to
  `recipes`. A `NULL` `trashed_at` value means active; a non-`NULL` value means
  trashed. Do not overload `is_private`, `updated_at`, or a presentation field
  for lifecycle state.
- Auth-user deletion may clear `trashed_by_user_id` through its foreign-key
  action. That Auth-only cleanup must not create recipe history after the
  owning account is deleted.
- Add an index supporting owner-scoped active list reads and owner-scoped Trash
  reads ordered by `trashed_at`.
- Soft deletion retains the recipe and every recipe-owned row unchanged:
  picklist assignments, ingredient rows, measurements, instruction steps, and
  ingredient mentions remain available for a later restore. It neither
  renumbers rows nor removes structured mention links.
- An active recipe is eligible for purge when `trashed_at <= cutoff`, where
  the scheduled cutoff is `now() - interval '30 days'`. At the exact 30-day
  boundary, it is eligible. The purge function accepts `cutoff timestamptz` as
  an explicit parameter so tests control time without changing the database or
  waiting for a clock.
- Permanent purge deletes the recipe, its recipe-owned rows through verified
  foreign-key cleanup, and its recipe history. History is append-only while its
  recipe exists; retaining a snapshot after a permanent purge would retain
  deleted private recipe content. No `recipe.purged` snapshot remains.

### Mutations, conflicts, and history

- Provide `trash_recipe(recipe_id, expected_version)` and
  `restore_recipe(recipe_id, expected_version)` database functions or an
  equivalently narrow authenticated mutation boundary. Each checks
  `auth.uid()`, verifies ownership and the expected current version, changes
  only the appropriate lifecycle state, increments the recipe version, and
  returns a distinguishable stale-version or invalid-state result.
- Deleting an active recipe records one `recipe.trashed` event with before and
  after snapshots. Restoring a trashed recipe records one `recipe.restored`
  event. Repeating either operation, a stale request, or a cross-account
  request writes no recipe state or history.
- Extend the existing history event constraint and trigger logic so ordinary
  saves remain `recipe.created` or `recipe.updated`; lifecycle transitions are
  identified from the `trashed_at` transition rather than from client-supplied
  event text.
- Update every active-recipe read and the existing recipe-save boundary to
  require `trashed_at is null`. A stale edit tab cannot silently save or
  restore a recipe after it has been trashed elsewhere.
- The scheduler invokes a narrow privileged purge function, not a browser
  route. Install the `pg_cron` job idempotently in the migration and run it
  daily. The job calls the same parameterized purge implementation exercised by
  integration tests.

## Screen and interaction contract

### Delete and restore

- Put a labeled destructive **Delete** command in the active recipe's edit mode,
  at the upper-right of the edit header and separated from the **Back to view**
  navigation action. Do not place it beside the routine detail actions or on
  recipe-list rows, where it could be activated while navigating or selecting
  a recipe. It opens a semantic confirmation dialog; it is never a one-click
  destructive action.
- The dialog names the recipe, states that it moves to Trash, says it can be
  restored for 30 days, and gives its destructive confirmation an unambiguous
  label such as **Move to Trash**. Cancel is the non-destructive default and
  Escape closes the dialog without changes.
- On confirmation, navigate to the authenticated recipe list and show a
  concise status message with a link to Trash. Do not render a soft-deleted
  detail underneath a stale editor.
- The Trash view is a quiet, dense working list rather than a card gallery. It
  shows recipe name, deleted date, and permanent-purge date in stable columns
  on desktop. On mobile, retain the name, clearly label the remaining retention
  information, and give Restore a 48px touch target. Use semantic list or table
  structure, visible focus, ordinary text labels, and no color-only expiration
  signal.
- Restore returns the recipe to its normal saved state and opens its detail
  view. The action must preserve its stable recipe ID and all retained ordered
  content.
- The empty Trash state explains that deleted recipes appear there and provides
  a route back to the active Recipe Tin. It is a compact state, not an
  illustrated landing page.

### Baseline printing

- Add an icon-only **Print** command, with the accessible name “Print” and a
  “Print recipe” tooltip, to active recipe detail. It invokes the browser print
  dialog with `window.print()` and has keyboard-visible focus.
- Print only the saved recipe reading content: title, relevant serving/time and
  equipment metadata, Standard-view ingredients, instructions, and notes.
  Show the stored amounts and units without scale controls, conversion controls,
  edit affordances, delete controls, navigation, account UI, popovers, drag
  rails, or blank editor rows.
- Render ingredients with the same formatter and ordering as the active recipe
  detail. Do not introduce a print-only ingredient projection or presentation
  preference. Slice 16 can extend printing when alternate reader views exist.
- Use a light paper surface, dark ink, ordinary document headings, restrained
  rules, and readable line lengths. Suppress the ruled page texture, shadows,
  interactive focus treatments, and screen-only decorative chrome in
  `@media print`. Avoid cards, a marketing layout, and a separate print route.
- Keep related ingredient cells and instruction steps together where CSS print
  fragmentation support permits; the result must remain readable if a browser
  still paginates a long recipe across sheets.

## Test fixtures and deterministic time

- Use local Auth users from `tests/support/local-supabase.ts`. Create recipes
  with ingredient rows, dual measurements, instruction steps, and confirmed
  mentions so restoration proves the full current recipe graph remains intact.
- Arrange trash timestamps directly through a narrowly test-only database
  fixture or a parameterized authenticated lifecycle helper, never by waiting
  30 days or changing the host clock.
- Test the purge function at one instant before, exactly at, and after its
  cutoff. Invoke the function directly in integration tests; separately assert
  that the migration registers one daily Cron job without requiring the suite
  to wait for it to run.

## Test-first acceptance

Write these tests before the migration, database functions, routes, or print
styles:

- Database/API tests prove only an owner can trash or restore a recipe, stale
  versions and invalid state transitions fail atomically, and normal reads and
  saves reject trashed records.
- Database/API tests prove trash and restore create exactly one correctly typed
  history event each; failed operations create none. Restore retains stable
  recipe, ingredient, measurement, step, and mention IDs and their order.
- Database/API tests prove purge leaves recipes newer than the cutoff intact,
  removes a recipe exactly at the cutoff with all recipe-owned content and
  history, and cannot purge another account's active or newly restored recipe.
- Migration/integration tests prove one idempotent daily `pg_cron` job targets
  the parameterized purge function. The job definition is testable locally;
  the test suite does not depend on elapsed wall-clock time.
- Browser tests cover Delete being absent from recipe detail and available in
  edit mode, opening and cancelling its dialog, successful trash navigation and
  status, exclusion from active lists and direct edit paths, Trash list dates,
  successful restore, and restored detail/edit persistence after reload.
- Desktop and Fold 6 browser tests cover keyboard dialog operation, visible
  focus, labeled controls, 48px mobile actions, desktop/mobile Trash layouts,
  no horizontal overflow at 352px and 390px, and axe WCAG 2 A/AA scans for
  active detail, confirmation dialog, populated Trash, and empty Trash states.
- Browser tests emulate print media and assert print CSS hides screen-only
  chrome and edit mechanics, preserves the Standard-view ingredient text and
  ordering, shows instructions, retains stored amounts, and does not expose
  scale or conversion controls. Unit tests cover ingredient formatting.

## Verification

Run focused lifecycle and ingredient-formatting unit tests first, then
database/RLS/Cron tests against the running local Supabase stack, then the
focused browser and axe suites in Chromium and Fold 6. Do not run `npm run dev:local`,
`npm run supabase:reset`, or another command that resets local data while
working against existing fixtures. Finish with `npm run typecheck`, `npm run
lint`, `npm run build`, and the relevant full recipe suite.

## Completion criteria

- An owner can trash and restore a recipe within 30 days without losing its
  current recipe-owned graph, ordering, stable IDs, or explicit-save semantics.
- Active views and save paths do not expose or mutate trashed recipes; lifecycle
  actions are owner-scoped, version-checked, and recorded in history.
- A daily local Cron job invokes a deterministic purge implementation, and a
  recipe at the exact 30-day boundary is permanently removed with its private
  content and history.
- Printing an active recipe produces a clean, unscaled paper layout matching
  the current Standard view, with no app/editor chrome, and remains accessible
  from keyboard and mobile layouts.
- Focused unit, database/API, end-to-end, responsive, axe, typecheck, Biome,
  build, and relevant full recipe-suite checks pass locally.

## Verification results

The baseline below was recorded for the initial implementation, before print
was changed to reuse the Standard-view formatter. The latest local verification
is recorded afterward.

- `npm run test:unit`: 56 tests passed.
- `npm run test:e2e`: 62 tests passed and 2 were skipped, including Chromium
  and Fold 6 Trash, restore, print, and recipe lifecycle coverage.
- `npm run test:a11y`: 17 tests passed and 1 was skipped. Trash dialog and
  populated/empty Trash states also passed focused axe scans.
- `npm run typecheck` and `npm run build` passed.
- `npm run lint` completed with no errors and three CSS specificity warnings:
  one for the Trash table and two in the earlier reorder interaction styles.
- Local migrations were applied with `supabase migration up --local`; no reset
  command was run.
- After print was aligned with the Standard view, the focused Chromium print
  E2E passed and continued to verify non-empty PDF output.

### Latest local verification - 2026-10-05

- Unit tests passed: 55 tests across 8 files.
- Focused recipe and lifecycle browser tests passed: 33 passed and 1 skipped
  across Chromium and Fold 6. Focused create, view, and edit flows also passed
  on both projects.
- Accessibility tests passed: 2 tests.
- `npm run typecheck` and the production build passed. The build used an
  isolated `NEXT_DIST_DIR`.
- `npm run lint` passed: Biome checked 71 files with no diagnostics.
- The full invite suite was not run because its cleanup can delete pre-existing
  pending invite users.