# Purpose: Implement and verify configurable recipe times

- [x] Review the slice prompt, current time implementation, picklist management, and affected contracts.
- [x] Draft DLC 33 and add it as a candidate in the DLC roadmap.
- [x] Agree on total-only migration to Cook, nearest-minute half-up rounding,
  and removing component-time Explorer filters; the User and assistant are the
  only reviewers.
- [x] Update canonical requirements and record the decisions.
- [x] Add automated coverage for expression parsing, time-entry persistence
  and history, Settings management, outputs, imports, and Explorer behavior.
- [x] Implement account-scoped configurable time entries, Time Types, arithmetic entry, and the derived total.
- [x] Verify focused unit, database, typecheck, Settings, recipe-time, import, public-copy, and trash/restore/purge behavior.
- [x] Align time-entry reordering with the shared drag-grip and keyboard-reorder pattern.
- [x] Replace the prominent Add time button with a full-width italic add-time row.
- [x] Update the design contracts and verify desktop/mobile time-row behavior.
- [x] Reuse ingredient/preparation autocomplete for Time Type with explicit type creation and no Tab-only creation.
- [x] Show one aligned Minutes/Time Type header and verify menu sizing and row geometry.
- [x] Update the design contracts and focused browser coverage for the Time Type refinement.
- [x] Align Total under the minute column, constrain minute and Time Type widths, and show Total as a grouped integer.
- [x] Put remove actions beside Time Type fields at every viewport and align minute and Time Type controls vertically on mobile.
- [x] Consolidate to one Save action after Instructions and immediately before Time.
- [x] Compare all 51 legacy-shaped synthetic-owner fixture recipes to current
  entries and totals without resetting the active local database. No separate
  total-only fixture is needed for the known data in scope.
- [x] Update the synthetic seed loader to convert legacy fixture times into
  current time entries while preserving the fixture shape.
- [x] Update the standalone DLC 13 advanced-rules script to use the current
  time-entry save path and supported time filters.
- [x] Complete standalone screenshot review and attribute the earlier public-header and Find Recipes E2E failures.
- [x] Bump the app release version for DLC 33 and record it in the slice brief and roadmap.
- [x] Update outdated project and global CLI tools, including Supabase, Node,
  npm, Corepack, and Vercel.
- [x] Verify the production build and relevant checks under the updated toolchain.
- [x] Update the DLC 33 legacy backfill to satisfy lifecycle guards and verify
  migration, pgTAP, and browser acceptance in the isolated public-links suite
  without touching the active local database.
- [x] Fix the isolated runner's public-site URL and stale browser assumptions
  for CSS serialization, Settings tabs, and responsive print controls; confirm
  the full suite passes.
