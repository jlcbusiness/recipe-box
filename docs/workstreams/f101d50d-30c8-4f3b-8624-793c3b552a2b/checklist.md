# Purpose: Move account tools and admin work into clear destinations

- [x] Review repository guidance, current Settings/Admin behavior, and relevant
  product contracts.
- [x] Resolve account-menu placement and dedicated-page behavior with the user.
- [x] Draft DLC 34 and record it as a roadmap candidate.
- [x] Review and approve the DLC 34 brief and proposed route paths.
- [x] Update canonical product and visual contracts after brief approval.
- [x] Add automated coverage for the new routes, tabs, and permission
  boundaries.
- [x] Move Username and App data to standalone authenticated pages and add
  Account menu links.
- [x] Move Accounts and Updates into admin-only Settings tabs and retire the
  old Administration navigation.
- [x] Verify legacy-route behavior, server authorization, and action return or
  cache-revalidation paths with focused E2E tests.
- [x] Verify responsive behavior, accessibility, focused tests, typecheck,
  lint, and diff.
- [x] Set the release version after verified completion.
- [x] Tighten Account menu spacing and center App data actions, with reset last
  in normal flow 12px above the footer and no-scroll viewport geometry.
- [x] Reduce Account menu Username and App data link rows to the agreed 32px
  spacing and update the visual contract and geometry assertion.
- [x] Add an 8px gap after App data before Sign out and verify menu geometry.
- [x] Fix the local recipe-column-order RPC validation for the current column
  set and replace the brittle footer style assertion with a geometry check.
- [x] Verify the footer geometry check on Chromium and Fold 6.
- [x] Fix recipe-column order normalization so saved orders with required legacy
  time-column keys survive reload without accepting unknown or duplicate keys.
- [x] Update scoped-import E2E archives to include required recipe totals and
  verify the focused DLC 34 workflows.
- [x] Reconcile the Fold 6 App data export-error geometry assertion with the
  intended layout before final acceptance sign-off.
