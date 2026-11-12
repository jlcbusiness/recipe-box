# Purpose: Fix Admin Updates dialog and entry removal

## 2026-11-12 — Initial investigation (session c949706e-6049-4307-84f2-71b45e8975e6)

- Checked repository status; `main` was clean before work.
- Traced the completion pane to the native `<dialog>` in
  `src/app/admin/admin-updates.tsx` and its styles in
  `src/app/styles/foundation.css`. The global CSS reset sets `margin: 0`,
  overriding the native dialog's centering margin.
- Confirmed the Admin Updates data model already has audited archive/restore
  RPCs, while `admin_update_events.update_id` restricts deleting a parent row.
- Asked whether the requested x should archive or permanently delete. The user
  chose permanent deletion, including its audit history.
- Read the installed Next.js Server Function guide and existing update RPC,
  action, E2E, and pgTAP patterns.
- Added E2E assertions for centered completion/delete dialogs, the trailing
  mobile delete target, cancellation/focus return, and successful deletion.
  Added pgTAP checks for non-admin/anonymous denial, stale revisions, and
  deletion of both the entry and its audit history.
- Added the admin delete action, the security-definer database RPC, the
  confirmation UI, and the explicit native-dialog `margin: auto` override.
  Updated the DLC 28, visual-design, comprehensive-reference, and decision-log
  contracts.
- `npm run typecheck` and `git diff --check` passed. The first Biome run caught
  two formatting/style issues; formatted the TypeScript and removed
  `!important`, then the focused check exited successfully with warnings.
- Markdown lint reported 30 existing issues in unrelated files; none of the
  changed product docs or this workstream were listed.
- Applied `20261223100000_admin_update_permanent_delete.sql` to the local
  Supabase database using `supabase migration up --local`; no reset was run.
- Ran `npm exec -- supabase test db supabase/tests/admin_updates.test.sql`;
  all 52 pgTAP assertions passed, including authorization, stale revisions,
  and deletion of the entry and its audit history.
- Ran
  `npm exec -- playwright test tests/e2e/admin-updates.spec.ts --grep @e2e --workers=1`;
  all six Admin Updates cases passed across Chromium and Fold 6. The first two
  browser attempts exposed and corrected only test-assumption mismatches
  (accessible-name truncation and adjacent grid-cell bounds).
- Reviewed the captured desktop Chromium and mobile Fold 6 screenshots. The X
  action appears at the row end and the mobile list has no horizontal overflow;
  geometry assertions verify 48px targets and centered dialogs on both sizes.
- Final `npm run typecheck` passed. Focused Biome exited successfully with
  warnings; `git diff --check` passed. Markdown lint still reports 30
  pre-existing issues in unrelated files; no changed docs were listed.
- Last recorded action: reran `git diff --check` after checkpoint updates; it
  passed. Final Markdown lint still reports 30 issues in unrelated files.
