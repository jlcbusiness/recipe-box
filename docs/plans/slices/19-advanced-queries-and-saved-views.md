# Slice 19: Explorer columns and widths

**Status:** Complete and verified.

This brief records the delivered List-column visibility and desktop-width
preferences across the three explorers. The comprehensive reference remains
the product authority.

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 19
- [First-draft specification](../first-draft-spec.md), Queries and Settings
- [Comprehensive reference](../comprehensive-reference.md), § 7
- [Data model](../data-model.md), Ownership, Core Entities, and Required Future Detail
- [Design philosophy](../design-philosophy.md), Information hierarchy and interaction
- [Visual design guide](../visual-design.md), Find Recipes and Explorer Columns And Widths
- [Decision log](../decision-log.md), Slice 19 explorer preferences
- [Slice 17: Find recipes](17-find-recipes.md)
- [Slice 18: Explorer state](18-explorer-state.md)

## Outcome

A signed-in person can choose which List columns appear and resize their widths
in Find, Library, and a publication's recipe list. These display preferences
persist independently for each account and exact explorer context. Search,
filters, sorting, publication scope, and Grid behavior remain unchanged.

## Initial baseline (before Slice 19)

Preparation found the following starting state:

- Find had full-text search and typed filter rows with field-specific
  operators, but rules were flat and changes applied immediately. Its four
  recipe List columns were fixed. Header controls filtered values; they did
  not show or hide columns.
- The Library had a `Choose List columns` control for optional publication
  columns, but its selections were component-local and did not survive reload.
- Publication recipe Lists had fixed columns. Their header controls filtered
  values rather than controlling visibility.
- Slice 18 persisted last-used filters, sorting, direction, and view per
  explorer context, with URL state taking precedence and publication scope
  remaining route-owned. Its initial preference payload did not include List
  visibility or widths.
- Column resizing was absent. The earlier roadmap entry described an aborted
  attempt and did not reflect the checkout at preparation time.

## Research and recommendation

The local Library chooser is the closest precedent: reuse its small settings
icon in Find and publication recipe results rather than adding another query
workspace. Apply visibility immediately and persist it by account and exact
explorer context.

The user explicitly chose direct manipulation for widths. Show a resize cursor
on the divider and support mouse, pen, and touch dragging. The resize itself has
no keyboard equivalent. Keep the column chooser and all other explorer controls
keyboard-operable; make this one exception explicit in tests and product docs.
On narrow responsive layouts, preserve the existing compact rows without table
headers or resize handles. Do not add page-level horizontal scrolling.

## Scope

### Included

- A small settings icon button named “Choose List columns” in Find, the Library,
  and each publication's recipe explorer.
- Current columns as defaults, with Name always visible. Other columns may be
  independently shown or hidden:
  - Find: Publication, State, and Total Time.
  - Library: Author, Edition / Issue, Recipes, Tags, Date Added, and Date Changed.
  - Publication recipes: State, Opinion, Meal Type, Food Type, Time, and Page or URL.
- Per-account visibility and desktop widths stored per exact explorer context:
  `recipes-find`, `publications`, or `publication-recipes:<publication-id>`.
- Immediate visibility updates. Width changes apply during pointer movement and
  persist at release. A reset action restores that context's default visibility
  and widths.
- Mouse, pen, and touch dragging where the table and its column dividers are
  shown. The touch hit area is centered on the visible divider.
- Existing responsive mobile rows, without resize handles or page-level
  horizontal overflow.
- Existing Slice 18 URL precedence, last-used search state, and route-owned
  publication scope, unchanged.

### Excluded

- Nested AND/OR groups, a new query builder, named or pinned saved views, and
  query lifecycle management. Existing full-text search and straightforward
  filters remain the on-the-fly discovery tools.
- Star ratings, a separate favorite flag, or a persistent favorites list.
  “Favorite” in the configurable Verdict vocabulary is not a rating or bookmark.
- Changes to recipe or publication records, public links, shared/team queries,
  public views, or public search.
- Changes to Slice 18's search URL precedence or last-used filters, sort, and
  presentation state.
- Grid-column customization, mobile resizing, frozen columns, and page-level
  horizontal scrolling.

## Data, security, and failure boundaries

Extend the existing account-owned `explorer_state` preference; do not add a
table or separate Saved View entity. Store an allowlisted column-visibility and
width payload keyed by the exact explorer context. Keep the existing RLS and
derive the owner from the authenticated identity. Publication context must be
validated against that owner; never accept a caller-supplied account ID as
authority.

Validate column keys, required columns, width bounds, and payload version on
write. Treat existing version-1 state as valid with current defaults for new
display settings; write version 2 after the next preference update. Malformed
display settings fall back to defaults without discarding valid filters, sort,
or view. URL query state does not override or rewrite these personal display
preferences. No recipe/publication history, trash lifecycle, or record-version
conflict behavior is added.

Visibility changes apply immediately. If a preference write fails, keep the
current page usable and report that the display setting was not saved; do not
claim it persisted. A pointer cancellation returns the column to its width at
the start of that drag.

## Flow and state ownership

1. The server resolves the account and exact explorer context, then loads the
  existing URL or Slice 18 remembered search state using current precedence.
  It loads that context's display preferences independently.
2. Opening the settings icon shows the current List-column choices. Toggling a
  column updates the table and persists the preference immediately; Name
  cannot be hidden. Reset restores the context defaults.
3. Dragging a visible divider updates width live. Release persists the width;
  pointer cancellation restores the starting width. Grid mode is unchanged.
4. Existing search, filter, sort, and view interactions continue to update the
  URL immediately and update Slice 18 last-used search state. They do not
  rewrite display preferences.
5. A failed preference write leaves the current layout usable and announces a
  recoverable failure. A later deliberate change can retry persistence.

## UI and accessibility contract

Keep the existing compact toolbar and table hierarchy in the paper-and-ink
visual language. Place a small settings icon with the existing explorer
controls; give it the accessible name and tooltip “Choose List columns.” Its
popover remains labeled, keyboard-operable, Escape-dismissable, and
viewport-bounded.

Show the resize cursor over table dividers. A drag must not select text or
activate the adjacent column filter. Support pointer capture for mouse, pen,
and touch; the touch hit area is centered on the divider while the visible
boundary remains narrow. Resizing is intentionally not keyboard-operable, and
the divider is not a keyboard focus stop. The column chooser and all other
explorer controls remain keyboard-operable. On mobile, retain Name-first rows
and prevent overlap or page-level horizontal overflow. Test widths around each
existing reflow boundary and at an intermediate width.

When an optional column is hidden, hide its header and cells from layout as well
as from the visible track list. A hidden cell must not create an implicit grid
track or wrap onto a second row, including when preferences were saved before a
column was added.

## Acceptance criteria and tests

| Criterion | Automated coverage |
| --------- | ------------------ |
| The settings icon opens a labeled column chooser in Find, Library, and publication recipe lists. | Browser tests for each route, the accessible name, keyboard menu operation, Escape dismissal, and focus return. |
| Each context offers its documented fields, preserves current defaults, and keeps Name visible. | Unit validation plus browser tests for visibility toggles and reset-to-default. |
| Hidden optional columns do not create implicit tracks or extra rows. | Browser test that hides Visibility and verifies its header and cells are hidden while visible row cells remain aligned. |
| Visibility persists per account and exact explorer context across reloads without changing URL search state. | API/RLS and browser tests for reload, context isolation, URL precedence, and owner isolation. |
| Mouse, pen, and touch drags resize columns within bounds; release persists and pointer cancellation restores the starting width. | Playwright pointer/touch tests with geometry assertions, reload, and page-overflow checks around responsive boundaries. |
| Narrow responsive rows have no resize handles or horizontal page overflow; Grid results are unaffected. | Chromium and Fold 6 browser checks at breakpoints and an intermediate width. |
| Resizing has no keyboard path, while surrounding explorer controls remain keyboard-operable and labeled. | Browser checks for chooser, filter, sort, and view keyboard paths; document the deliberate resize limitation. |
| A failed preference write keeps the page usable and reports that the setting was not saved. | Browser server-action failure injection and status/recovery assertions. |

Write the focused failing tests before production code. Run focused unit/API and
browser/accessibility checks first, then typecheck, Biome, Markdown lint, and a
production build. Reuse the existing development server and local database; do
not reset local data or stop a running service.

## Accepted direction and deferrals

- Column visibility and widths are the complete Slice 19 outcome. No query
  builder, nested groups, named or pinned saved views, or new recipe fields are
  included.
- Visibility applies immediately. Width changes are live while dragging and
  persist on release. Both preferences belong to the account and exact explorer
  context, independent of URL search state.
- Divider resizing supports mouse, pen, and touch, with bounds and pointer
  cancellation recovery. It has no keyboard equivalent by explicit direction;
  the rest of the explorer remains keyboard-operable.
- Keep any star rating or separate favorites system deferred. The current
  configurable Verdict value “Favorite” does not imply either data model.
- Preserve current default columns. Name is always shown; all other supported
  columns may be hidden. Derive width bounds from realistic headers and values
  during implementation tests.

## Delivery and verification

- Explorer preferences use account-owned `explorer_state` version 2 and the
  exact contexts `recipes-find`, `publications`, and
  `publication-recipes:<publication-id>`. URL search state remains separate.
- The column chooser, visibility persistence, bounded pointer resizing,
  cancellation recovery, responsive rows, and Grid independence are covered by
  unit and browser tests. The v2 write path is covered by owner-isolation and
  foreign-publication-context API tests.
- Focused verification passed: 25 explorer-state unit tests; 24 explorer-state
  browser tests across Chromium and Fold 6, with two expected mobile-only
  skips; two RLS browser tests; and the seeded Find Grid-independence test in
  both profiles. The full unit suite passed all 181 tests.
- `npm run typecheck` and an isolated production build passed. The build used
  `.next-slice19-build` so it did not replace the active development server's
  output; its generated configuration edits were restored afterward.
- Repository-wide Biome and Markdown lint pass. Biome reports 47 non-blocking
  CSS specificity warnings in the existing global and multi-picklist styles.
  The Slice 19 Playwright files pass their focused Biome check.
