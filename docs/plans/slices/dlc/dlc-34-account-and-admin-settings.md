# DLC 34: Account Destinations and Admin Settings

**Status:** Approved; implementation in progress.
**Release version:** Proposed 1.8.0 after implementation and verification.

## Outcome

Make the account menu the entry point for each User's Username and App data
pages, and consolidate administrator workflows under admin-only tabs on
Settings. Preserve the existing account, export/import, reset, invitation,
account-management, and Updates behavior.

## References

- [DLC roadmap](README.md), Phases 6–10
- [First-draft specification](../../first-draft-spec.md), Queries and Settings,
  Sharing and Authentication, and Import, Export, Lifecycle, and History
- [Comprehensive reference](../../comprehensive-reference.md), §§ 8.5, 10.0,
  10.6, and 11
- [Data model](../../data-model.md), Ownership and Core Entities
- [Design philosophy](../../design-philosophy.md), Information hierarchy and
  interaction; Responsive composition
- [Visual design guide](../../visual-design.md), Account menu, Settings,
  Administration, and Data Management
- [Decision log](../../decision-log.md), Settings tabs and account roles
- [DLC 24](dlc-24-account-content-reset.md), account content reset
- [DLC 28](dlc-28-admin-updates.md), administrator-managed Updates
- [DLC 32](dlc-32-settings-tabs.md), Settings tab interaction
- Closest implementations: [Account menu](../../../../src/app/account-menu.tsx),
  [Settings tabs](../../../../src/app/settings/settings-tabs.tsx),
  [Settings page](../../../../src/app/settings/page.tsx),
  [Administration page](../../../../src/app/admin/page.tsx), and the focused
  [Settings](../../../../tests/e2e/settings.spec.ts) and
  [admin Updates](../../../../tests/e2e/admin-updates.spec.ts) browser tests

## Existing patterns and requested change

The Account menu is currently a native `details` popover with the account
email, an admin-only Administration link, and Sign out. It is not officially
labelled “User Settings”; its accessible name is “Account options for
[email]”. Keep that compact menu pattern and add **Username** and **App data**
as destinations, not embedded forms.

Settings already uses accessible, query-synchronized tabs and full-width,
unframed sections. Administration has a separate accessible Accounts/Updates
tab workspace. Reuse those patterns: move the existing account-management
content into an admin-only **App admin** Settings tab and give the existing
Updates interface its own admin-only **Updates** Settings tab. Do not retain
the old Administration menu or private-navigation destination.

The current app could not be opened at `localhost:3000` or `localhost:3001`
during preparation. Review the rendered Account menu, Settings, and admin
surfaces at desktop and mobile before implementation; use `npm run dev` to
start the app if necessary.

## Scope

- Keep the existing **Preferences** and **Recipe data** Settings tabs for all
  signed-in users. Remove only the **Account & data** tab. Add **App admin**
  and **Updates** as additional tabs visible only to admins.
- Move public-username management to a dedicated authenticated
  `/account/username` page, linked from the Account menu as **Username**.
  Rename its page/section and field label to **Username**. Preserve its
  attribution explanation, validation, uniqueness handling, save status, and
  `set_public_username` behavior.
- Move the current Data management workflow to a dedicated authenticated
  `/account/app-data` page, linked from the Account menu as **App data**.
  Retain the export date/reminder, account reset, database export, and database
  import behavior.
- Keep the Account menu's email display and Sign out behavior. Remove its
  Administration link. Add the two user destinations for all signed-in users.
- Put the invitation form and account administration table/actions in the
  **App admin** tab. Put the existing update tracker in **Updates**.
  Remove the old nested Accounts/Updates tab strip; the Settings tabs provide
  that navigation.
- Remove the old Administration private-navigation links. Keep `/admin`
  compatible by redirecting admins to `/settings?tab=app-admin`; preserve the
  current non-admin redirect to `/recipes`.
- Update action return URLs and cache revalidation for the new routes.
  Content-reset reauthentication and error returns must return to App data and
  reopen its dialog/status as they do now.
- Add no tables, migrations, or new authorization paths. Do not alter the
  behavior or data contracts of the existing workflows.

## Interaction and state

- Keep the Settings `tab` query parameter. Support `preferences`,
  `recipe-data`, `app-admin`, and `updates`; valid admin values open the
  corresponding panel after reload or direct navigation. Missing or invalid
  values select Preferences. A non-admin request for an admin tab must never
  render admin data and falls back to Preferences.
- Preserve the existing Settings tabs' semantic roles, roving focus, visible
  focus, Left/Right, Home/End navigation, mounted-panel draft state, and
  `history.replaceState` behavior. The Account & data tab is no longer
  rendered.
- Keep the Account menu keyboard-operable, dismissible, and viewport-bounded.
  Each new link opens its own page; the menu remains a navigation surface and
  does not contain the username form or data-management controls.
- Preserve the reset flow's Google reauthentication, exact-phrase confirmation,
  recovery, cleanup status, and retry behavior. App data's return URLs use
  `/account/app-data` with existing `content_reset_*` parameters.
- Username and App data are authenticated routes. Signed-out visitors retain
  the existing sign-in redirect behavior.

## Data, security, and failure boundaries

- This is a presentation and route reorganization only; no schema or
  persistence changes are expected.
- Load account-administration data only after the server verifies the
  authenticated account's `is_admin` flag. Keep the Supabase service-role
  client server-only. Preserve authorization checks in every account and
  Updates server action and the existing Updates RLS boundary.
- A non-admin must not receive admin-only tabs, account rows, Updates data, or
  privileged client behavior through direct navigation or cached output.
- Username continues to use the signed-in user's existing RPC. App data
  continues to use the signed-in account's export, import, and reset flows.
  Existing errors remain visible and retryable; no success-shaped fallback is
  introduced.

## Exclusions

- Changing Username validation, attribution visibility, or save behavior.
- Changing data reset, import/export format, confirmation, or recovery
  semantics.
- Changing invitations, account roles, Updates editing, completion, ordering,
  or audit history.
- Adding a new Settings tab for Username or App data, embedding those workflows
  in the Account menu, or changing recipe-data and preference sections.
- Adding database schema, migrations, new user roles, or new authorization
  mechanisms.

## Acceptance criteria and automated coverage

Write focused browser tests before production changes. Extend or add coverage
to verify:

1. The Account menu shows **Username** and **App data** for signed-in users,
   keeps email and Sign out, and no longer shows Administration. Both links
   open distinct authenticated pages. Keyboard focus, accessible names,
   dismissal, and representative desktop/mobile geometry remain valid. Keep
   the email and links compact, with consecutive 32px link rows and an 8px gap
   between App data and Sign out.
2. The Username page shows the renamed heading and field label and retains
   successful save, invalid input, duplicate-name, error, and status behavior.
3. The App data page retains export reminder/date, database export, database
   import, and reset workflows. Reset reauthentication/error return parameters
   reopen the correct dialog, and cancellation, retry, and status behavior
   remain available. Center Export and Import, then place the centered reset
   action last in normal page flow, 12px above the version footer. The page
   fills the available viewport without fixed controls and does not scroll when
   its content fits. Across routes, the shared normal-flow version footer sits
   at the viewport bottom when the page is short and follows page content when
   it is longer than the viewport.
4. A regular User sees only Preferences and Recipe data in Settings. An Admin
   also sees App admin and Updates. Each tab opens the correct content, the
   Settings query state survives reload, and keyboard and accessibility
   behavior pass.
5. Account administration and Updates continue to work from their new tabs,
   including invitations, role/Owner boundaries, editing, completion, and
   ordering. Existing server-action authorization remains effective.
6. A non-admin cannot see or load admin data from Settings or the legacy
   `/admin` route. Admin access to `/admin` redirects to App admin; a
   non-admin's legacy redirect remains `/recipes`.
7. The existing Preferences and Recipe data sections appear once and retain
   their current workflows. Account & data and Administration are absent as
   tabs or navigation destinations.
8. Chromium at 1280px and the configured Fold 6 viewport have no page-level
   horizontal overflow. The account menu stays within the viewport; settings
   tabs, admin controls, Username, App data, reset dialog, and transfer actions
   preserve visible focus, labels, and at least 48px touch targets where
   required. Capture and inspect representative screenshots at both sizes.
9. Run focused Settings, admin Updates/invitation, account reset, and
   import-settings browser tests, plus relevant unit tests, typecheck,
   accessibility, lint, and diff checks. No database reset is required; do not
   reset or change linked/hosted data.

## Assumptions and deferrals

- The dedicated page paths `/account/username` and `/account/app-data` are
  proposed names that satisfy the request for pages outside Settings; confirm
  them during brief review.
- **1.8.0** is the proposed app version, continuing the current 1.6.0/1.7.0
  minor-release sequence. Update package metadata only after the slice is
  implemented and verified.
- No other product decision is currently unresolved. Canonical reference and
  visual-guide contracts will be reconciled after this brief is approved and
  the behavior is verified.
