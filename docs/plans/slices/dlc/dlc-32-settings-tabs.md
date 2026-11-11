# DLC 32: Settings Tabs

**Status:** Implemented in app version 1.6.0.

## Outcome

Organize the existing Settings workspace into a small set of navigable tabs so
people can get to a settings area without scanning one long page. Keep the
current wide, unframed sections and preserve every existing setting's behavior.

## References

- [DLC roadmap](README.md), Phase 8
- [First-draft specification](../../first-draft-spec.md), Settings
- [Comprehensive reference](../../comprehensive-reference.md), § 8,
  especially §§ 8.1–8.4
- [Data model](../../data-model.md), Configuration Boundaries
- [Design philosophy](../../design-philosophy.md), information hierarchy and
  responsive composition
- [Visual design guide](../../visual-design.md), Account menu, Administration
  tabs, Settings, and Data Management
- [Decision log](../../decision-log.md), Settings workspace
- Closest implementations: [Settings page](../../../../src/app/settings/page.tsx),
  [Administration tabs](../../../../src/app/admin/admin-workspace.tsx), and
  [Settings browser tests](../../../../tests/e2e/settings.spec.ts)

## Existing pattern and requested change

The current Settings page is a single, wide workspace containing full-width,
unframed sections. Administration already has keyboard-operable tabs, which is
a useful interaction precedent. Its compact list styling is not the visual
target for Settings: retain Settings' current section layout inside each tab.

The requested change is navigation between groups of existing sections, not a
redesign of those sections. Tabs should not turn Settings into a compact menu,
card grid, or collection of empty placeholders.

## Scope

Keep `/settings` as the authenticated route and put each current section in
exactly one of these three tabs:

| Tab | Existing sections |
| ---- | ------------------ |
| **Preferences** | Personal preferences; Recipe column order |
| **Recipe data** | Recipe picklists; Ingredient catalog (including nutrition and measure equivalents); Trusted densities; Tags |
| **Account & data** | Public sharing; Data management (content reset, export, and import) |

Use **Preferences** as the default tab. Keep the private navigation unchanged.
Do not change any field, save timing, validation, status or error message,
authorization boundary, RPC, database query, import/export behavior, or reset
semantics.

## Interaction and state

- Follow the existing Administration tabs for semantic `tablist`, `tab`, and
  `tabpanel` roles, selected state, roving tab focus, visible focus, and
  Left/Right, Home, and End keyboard behavior. Tab activation is immediate.
- Keep each panel mounted and hide inactive panels so switching tabs does not
  discard an in-progress editor draft. Inactive content must not be reachable
  by keyboard or assistive technology.
- Reflect the selected tab in a `tab` query parameter using the values
  `preferences`, `recipe-data`, and `account-data`. A valid parameter opens its
  tab after reload or direct navigation; a missing or invalid value selects
  Preferences. Update the parameter without adding one history entry per tab
  switch, and preserve unrelated query parameters.
- When a content-reset reauthentication or error return has no valid `tab`
  value, select Account & data so the related status and action are visible.
  Existing `content_reset_*` parameters must continue to work alongside the
  selected tab.
- On the Fold 6's 307px CSS viewport, retain all three tabs in one row. The
  current 20px mobile gutters leave about 267px for the tablist, which is
  enough for content-sized tabs without stretching them to equal widths. Use
  13px labels, 4px horizontal padding, a 4px gap, and a 48px minimum tab
  width. Keep
  **Preferences** on one line; use two lines for **Recipe / data** and
  **Account / & data**. Keep each target at least 48px high, keep the full
  labels visible, and do not add horizontal scrolling or page-level overflow.
- Use a leaf top-edge accent for the active tab on desktop and mobile. The
  first section's top border is the single divider below the tabs; align it
  directly with the tab row without an additional tab-row border or first-
  section gap. Preserve subsequent section dividers and spacing.
- On desktop, use balanced 8px vertical padding above and below tab labels;
  retain the existing mobile tab padding.
- Preserve the existing Settings section width on desktop and mobile.
- Use the existing paper, ink, leaf, and gold-focus tokens. Add no new palette,
  card treatment, or decorative styling.

## Data, security, and failure boundaries

This is a presentation and navigation change only. It adds no tables,
migrations, client-held data, or permission paths. `/settings` retains its
existing signed-in-user check and account ownership boundaries. Existing save,
load, import, export, and reset failures remain visible through their current
flows; hiding a panel must not suppress or silently discard a result.

## Exclusions

- Changing the content, order, or interaction contract inside an existing
  section.
- Splitting sections into new routes or changing private navigation.
- Adding new Settings domains, empty tabs, or placeholder links.
- Changing Administration tabs or the Updates workflow.
- Changing database, preference, catalog, import/export, or reset behavior.

## Acceptance criteria and automated coverage

Write focused browser tests before production changes. Add or extend the
Settings E2E coverage to verify:

1. The three named tabs appear once, and each current section appears in its
   assigned panel exactly once. Preferences is selected by default; no current
   section is lost or duplicated.
2. Click, Left/Right, Home, and End select the expected tab, expose only the
   active panel to keyboard and assistive technology, retain visible focus,
   and pass the active-page accessibility check.
3. Valid `tab` values survive reload and open the correct panel. Missing and
   invalid values fall back to Preferences. Tab changes preserve unrelated
   query parameters without adding a Back-history entry for each switch.
4. Content-reset reauthentication and error returns open Account & data when
   no valid tab is specified; existing status and retry behavior remain
   available.
5. Representative existing preference, catalog, public-sharing, and data
   management workflows still save, report failures, and retain drafts when
   changing tabs.
6. At 1280px desktop and the configured Fold 6 viewport, tabs and panels have
   visible focus, controls have at least 48px hit areas, the Settings sections
   retain their established layout, the mobile tabs remain content-sized with
   complete labels visible and a subtle outline, and neither viewport has
   horizontal overflow.
   Capture and inspect representative screenshots at both sizes; geometry and
   behavior assertions remain the acceptance checks.
7. Signed-out visitors still follow the existing sign-in redirect, and
   navigation outside Settings is unchanged.

Run the focused Settings and import-settings browser tests on Chromium and Fold
6, plus the relevant unit, typecheck, lint, accessibility, and diff checks.
Record any pre-existing unrelated failures without changing their scope.

## Accepted decisions and follow-up

The user approved the three-tab grouping, `tab` query parameter, and mobile
content-sized layout. The “druthers” label was offered as a musing, not a
requested change; retain Preferences. The accepted decisions are recorded in
`decision-log.md`, `comprehensive-reference.md`, and `visual-design.md`. Keep
the app version unchanged until the implementation is verified and the release
version is determined.
