# Slice 18: Explorer State

**Status:** Implemented and verified.

Slice 18 restores an authenticated person's last-used configuration when they
return to a Recipe Box explorer. It deliberately does not create named, pinned
saved views. The comprehensive reference remains the product authority; this
brief defines the immediate delivery contract.

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 18
- [First-draft specification](../first-draft-spec.md), Queries and Settings
- [Comprehensive reference](../comprehensive-reference.md), § 7
- [Data model](../data-model.md), Ownership and Core Entities
- [Visual design guide](../visual-design.md), Find Recipes and Accessibility
- [Decision log](../decision-log.md)
- [Slice 17: Find recipes](17-find-recipes.md)
- [Azure Boards query guidance](https://learn.microsoft.com/en-us/azure/devops/boards/queries/using-queries?view=azure-devops)
- [Notion views, filters, and sorts](https://www.notion.com/help/views-filters-and-sorts)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Next.js Server Actions](../../../node_modules/next/dist/docs/01-app/02-guides/server-actions.md)

## Outcome

An authenticated person returns to each explorer with its last-used filters,
sort key, sort direction, and List/Grid choice restored. The global recipe
finder, Library, and each publication recipe explorer retain independent state.
A publication recipe explorer restores its fixed publication scope; it never
turns that scope into a removable filter.

Existing recipe `column_*` values are filter selections and restore with the
other filters. They are distinct from List-column visibility and widths,
delivered separately in Slice 19.

The restored configuration omits free-text search input. Opening an explorer
starts with a blank search so an old query cannot make the collection look
incomplete without an apparent criterion.

## Scope

### Included

- Per-account, server-persisted state for the global recipe finder, Library,
  and each publication recipe explorer.
- Explorer filters, sort key, sort direction, and List/Grid choice.
- Existing recipe column-filter selections, including their current supported
  fields for each recipe explorer context.
- Publication explorer state keyed by the active publication ID, with recovery
  to that publication's default state when it is unavailable.
- URL state remains shareable and takes precedence over remembered state.
- Owner-scoped database access, validation, responsive controls, keyboard
  operation, visible focus, labels, error recovery, and automated coverage.

### Excluded

- Naming, duplicating, pinning, navigation entries, or lifecycle management
  for saved views; these remain deferred.
- List-column visibility and width preferences are separate from remembered
  search state and were delivered in Slice 19.
- Nested AND/OR groups, query explanations, or a new filter/operator catalog;
  these remain deferred.
- Persisting free-text search, pagination position, temporary popover state,
  or mobile-only presentation details.
- Changes to recipe, publication, search-index, result-ordering, or sharing
  behavior.

## Research And Interaction Direction

Azure Boards separates saving a reusable query from favoriting it. Notion keeps
filters and sorts specific to each database view. Recipe Box adopts the useful
part of both: state belongs to the explorer context rather than the underlying
records. It rejects named and pinned view management for now because simple
last-used state serves the common personal workflow without a second query
lifecycle before nested queries exist.

The compact explorer toolbar remains the visual precedent. Keep the existing
fixed List fields and preserve the scan-first table on desktop. On mobile, hide
table headers and use existing compact rows without horizontal overflow.

## Data, Security, And Failure Boundaries

`explorer_state` is account-owned preference data, keyed by a non-null context
key: `recipes-find`, `publications`, or `publication-recipes:<publication-id>`.
It stores a schema-versioned, allowlisted JSONB payload. It does not store
free-text search or arbitrary query strings. A unique `(account_id, context_key)`
constraint keeps exactly one latest configuration per context.

The table enables RLS, revokes anonymous access, grants only authenticated owner
operations, and indexes `account_id`. The write API derives the account from
`auth.uid()`, validates context, publication ownership, field names, operators,
IDs, sort values, directions, and views, then replaces only that context's
state. It accepts no caller-supplied account ID. Cross-account reads or writes
must expose neither state nor publication identity.

Explorer state is a high-frequency personal preference, not a recipe or
publication record. It has no version conflict, forensic-history, Trash, or
purge lifecycle; this matches existing account preferences. A failed update
keeps the active URL state and reports a recoverable status without blocking
exploration. Invalid, malformed, stale, or unavailable saved state is ignored
and falls back to that explorer's documented defaults.

## Flow And State Ownership

1. The server resolves the authenticated account and explorer context.
2. A valid persisted-state URL parameter (`filter`, `column_*`, `type`, `sort`,
  `direction`, or `view`) makes the URL authoritative. Its omitted persisted
  fields use their documented defaults; it never merges with remembered state.
  Otherwise, the server reads and validates the context's remembered payload,
  then redirects once to its canonical URL. Search text and pagination do not
  suppress restoration.
3. The server builds results only from canonical URL state. Search text begins
   blank unless supplied explicitly in the URL.
4. A changed filter, sort, direction, or view updates the URL immediately and
  schedules an authenticated preference write for that context. Repeated
  changes coalesce so a stale response cannot replace a newer configuration.
5. On write failure, the result view remains usable and announces that the
   explorer preference was not saved. A later eligible change retries.

Publication scope is route-owned. Restoring state never redirects a global
finder into a publication or changes one publication's result set to another.

## Acceptance Criteria And Tests

| Criterion | Automated coverage |
| --------- | ------------------ |
| A global recipe finder restores filters, sort, direction, and view after fresh navigation. | Browser test on Chromium and Fold 6; URL and control assertions. |
| Recipe column-filter selections restore as filters without introducing List-column visibility. | Unit, database/API, and browser URL assertions. |
| Library state restores independently from global recipe state. | Browser test changes both contexts and reloads each. |
| Each publication restores only its own recipe-explorer state and retains fixed scope. | Browser test with two publications and API owner-scope assertions. |
| Free-text search and page position are not restored. | Browser test saves a query and later opens page one with blank input. |
| URL state overrides remembered state, and malformed or unavailable state falls back safely. | Unit and browser tests for serialization, validation, and recovery. |
| Another account cannot access the owner's state. | Database/API RLS select, insert, update, and delete allow/deny cases. |
| A failed preference write does not discard active explorer state. | Browser error-path test retaining URL and alert/status. |
| New controls remain usable at 352px and 390px. | Chromium and Fold 6 Axe, focus, overflow, and screenshot checks. |

Before production code, write the focused failing unit, database/API, browser,
and accessibility tests above. Run those first, then typecheck, Biome, Markdown
lint, and a production build. Reuse the existing development server; never run
`npm run dev:local`, reset local Supabase, or stop a running server.

## Assumptions And Deferred Decisions

- State synchronizes across a person's signed-in devices because it is stored
  per account, but the last successful change wins.
- Remembered search state does not include List-column visibility or widths.
  Slice 19 stores those display preferences separately in the same
  account-owned, exact-context explorer-state record.
- An unavailable publication scope falls back to that route's default view; it
  does not reveal whether another account owns the publication.
- Named and pinned saved views remain deferred; they are not part of Slice 19.
