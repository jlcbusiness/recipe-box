# Slice 17: Find recipes

**Status:** Implemented; unit, API, browser, accessibility, visual regression,
TypeScript, Biome, and production-build checks are verified.

Slice 17 makes recipes and publications discoverable through full-text search,
typed filters, sorting, and configurable List columns. It also replaces the
basic publication recipe table with the same recipe explorer used for
publication-scoped results. The comprehensive reference remains the product
authority; this brief records the implementation boundary established during
preparation.

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 17
- [First-draft specification](../first-draft-spec.md), Queries and Settings
- [Comprehensive reference](../comprehensive-reference.md), § 7
- [Data model](../data-model.md), Core Entities and Required Future Detail
- [Design philosophy](../design-philosophy.md) and [visual design guide](../visual-design.md), Find Recipes,
  Desktop, Mobile, and Accessibility And Interaction
- [Decision log](../decision-log.md)
- [Slice 10A: Library Explorer](10a-library-explorer.md)
- [Slice 12: Images](12-images.md)
- [Slice 14D: Tags and assignment](14d-tags-and-assignment.md)
- [Slice 16: Cooking views](16-cooking-views.md)
- [Supabase: Full Text Search](https://supabase.com/docs/guides/database/full-text-search)
- [W3C WAI-ARIA APG: Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [Allrecipes search results for chicken](https://www.allrecipes.com/search?q=chicken)
- [Food Network search results for chicken](https://www.foodnetwork.com/search/chicken-)
- [Microsoft Support: Filter data in Excel](https://support.microsoft.com/en-us/excel/get-started/filter-data-in-a-range-or-table-in-excel)
- [Amazon search results for cast iron skillet](https://www.amazon.com/s?k=cast+iron+skillet)
- [AO3 Work Search](https://archiveofourown.org/works/search)
- [AO3 search and browse FAQ](https://archiveofourown.org/faq/search-and-browse?language_id=en)
- [AO3 search and filter update announcement](https://archiveofourown.org/admin_posts/10575?language_id=en)

## Outcome

An authenticated owner can find any active recipe in their account, including
recipes assigned to publications, and can search the Library for publications.
Both experiences combine full-text search with field-appropriate filters,
sorting, and selectable List columns. A publication detail page presents its
active recipes through the same recipe controls and supports List and Grid
views; Grid uses each recipe's default photo when available. The existing
Recipe Tin remains the collection of unparented recipes, not the all-recipes
search result.

## Preparation findings

### Existing application patterns

- `/recipes` currently loads only active recipes with no publication and
  renders a four-column table. It is the Recipe Tin and must retain that scope
  and identity.
- The Library has a separate publication explorer. Slice 10A established a
  desktop Grid/mobile List initial mode, compact Type and Sort menus, a separate
  direction toggle, semantic table/list output, result counts, empty states,
  transient state, and Escape/outside-pointer dismissal with focus restoration.
- Publication detail currently loads active recipes for one publication and
  renders a fixed table. It already carries state, opinion, meal type, food
  type, time, and source location, but has no recipe filters, view switch, or
  photo grid.
- Recipe images, account-scoped tags, recipe plain-text instruction
  projections, and owner-scoped authenticated reads already exist. No shared
  all-recipes explorer or full-text search index was found.

### Visual design application

The visual guide provides direct guidance for this slice: lead with the
collection or recipe record; make dense information scannable with aligned
tables; keep sections unframed; use DM Sans controls on the paper-and-ink
surface; use compact, labeled controls; keep menus anchored, bounded,
dismissible, and keyboard-operable; treat photos as useful content; and make
mobile a distinct, overflow-free layout. The existing Library Explorer is the
closest control precedent and should be extended rather than replaced with a
different visual language.

Use a labeled search form with an explicit submit and clear action. Do not add
autocomplete suggestions in this slice: neither the product requirements nor
the observed sites require them, and a plain search field avoids adding a
combobox interaction contract. Use compact field/operator/value controls for
structured filters, a visible summary of active filters, and a clear-all
action. Keep the Library's established List/Grid, sort, and direction control
behavior. In recipe Grid, show the real default photo without cropping away
meaningful content; omit the image area when there is no photo instead of
adding an empty decorative card. Keep publication scope visible on its detail
page. Do not add explanatory feature copy, nested cards, or a preview pane.

### Online research and screenshot notes

Reference screenshots were captured in the shared browser during preparation;
they remain in the conversation rather than being copied into the repository.
This avoids redistributing third-party page imagery.

- **Allrecipes:** The search-results first viewport keeps the query in a
  prominent search field with a clear control, then leads with large recipe
  images and titles. The cards expose recipe identity and ratings as the user
  scans. The first viewport captured here did not expose structured filter
  controls, so no assumption is made about filters below it.
- **Food Network:** The results page presents a visible “Refine by” row
  (Chef, Show, Ingredient, Course, Dish, Recipes Only), a count and query
  summary, and separate Best Match and Rating sort choices. Result summaries
  show recipe title, source/chef, total time, and rating. A privacy-consent
  dialog covered the lower part of the captured viewport; its controls were
  not accepted or explored.
- **Excel:** Microsoft Support documents filters attached to each table
  column. The filter menu combines sort commands, a searchable checklist of
  distinct values, and type-specific Text or Number comparisons such as
  Greater Than and Between. An active-filter icon signals and clears the
  column filter; users can also reapply or clear filters for the whole range.
  This is a useful pattern for explicit, inspectable criteria, but Recipe Box
  should keep its compact toolbar rather than reproduce a spreadsheet header
  on every result field.
- **Amazon:** The first results viewport keeps the query in the global search
  field, shows the result count and sort menu above results, and places
  checkbox facets in a persistent left rail. Visible examples include free
  shipping, delivery day, customer reviews, and pan size, with “See more” for
  long value lists. Product cards combine image, title, rating, and price.
  This separates broad narrowing from result scanning; the rail is desktop
  specific and some first-page content is sponsored, so neither its density
  nor ad placement should be copied.
- **AO3:** After the terms gate was cleared, the live Work Search form was
  inspected and submitted with “castles”; its results page reported 4,587
  matches, best-match descending, and an “Edit Your Search” link. The form
  separates Any Field, Title, Creator, and Date text from completion, crossover,
  single-chapter, word-count, and language controls. Tag criteria are divided
  into Fandoms, Rating, Warnings, Categories, Characters, Relationships, and
  Additional Tags; work statistics and sort key/direction have their own
  sections. This domain-specific vocabulary makes difficult-to-classify works
  findable through multiple independent metadata dimensions. AO3's FAQ marks
  its detailed search guidance as older-version information, so the notes here
  prioritize the live form and result page; the linked 2018 announcement is
  historical context, not a current interaction contract.
- **Recipe Box mobile recipe detail:** The captured local screen keeps the
  recipe and cooking controls visually primary, with metadata and compact
  icon actions using the existing paper surface. It is a style reference, not
  an explorer implementation.
- **Common patterns to reuse:** Keep full-text search distinct from
  field-specific filters; show result count and sort choice; make active scope
  and filters apparent; and keep result identity visible when changing views.
  Use categorical tags for open-ended recipe concepts, explicit typed fields
  for comparable values, and disclose whether multi-select values broaden or
  narrow matches. Search-result sites favor relevance initially and expose
  alternate sorting explicitly. Spreadsheet-style operators and advanced
  grouping can remain behind structured controls rather than crowding the
  initial search surface.
- **Risks to address:** Many results need bounded server-side retrieval and
  deterministic ordering. Hidden active filters can make results seem
  incorrect, and “no recipes exist” is different from “nothing matches this
  query.” Database full-text search is token-based and may stem words, but it
  is not typo correction or arbitrary substring matching. Users may also
  confuse a publication's recipe scope with the global result set. Preserve
  the query after an error, distinguish both empty states, show active scope,
  and provide a direct clear-filters action.

The Supabase guide documents PostgreSQL `tsvector`, GIN indexing, query
parsing, and ranking. Its web-search parser supports ordinary terms, quoted
phrases, `or`, and `-` exclusion without requiring users to build a structured
query. The WAI-ARIA combobox guidance distinguishes editable search inputs
from suggestion widgets; this slice uses a normal search field and does not
need combobox semantics.

## Scope

### Included

- A dedicated **Find recipes** route and navigation entry that searches all
  active recipes owned by the signed-in account, whether assigned to a
  publication or in the Recipe Tin. Preserve the existing Recipe Tin route.
- Full-text search over recipe title and notes, ingredient name and detail,
  instruction plain text, linked publication name and author, and assigned
  recipe tags. Keep the search projection synchronized with source changes.
- Full-text publication search in the Library over publication name, author,
  and assigned publication tags, alongside its existing type filter.
- Field-specific filters over the recipe and publication catalogs defined by
  comprehensive reference § 7.1. Supported operators must match field type:
  text, multi-select, number/time/date, and state/enum. Multiple simple
  filters combine with AND. Nested AND/OR groups and query serialization
  remain deferred.
- Recipe List and Grid modes with a compact toolbar, search/result summary,
  sort key, and direction. The global and publication-scoped recipe explorers
  use the same controls and semantics.
- A publication detail recipe explorer scoped to that active publication.
  The scope is fixed by the route and cannot be removed by its ordinary
  filters. Grid displays a recipe's default photo when one exists.
- Library publication search, filters, sorting, List/Grid views, and a column
  chooser. Preserve Slice 10A's publication type filter and stable responsive
  defaults.
- Search text remains transient. Slice 18 added remembered filters, sort,
  direction, view, and publication scope; Slice 19 added persistent List-column
  visibility and widths. Named or pinned saved views remain deferred.
- Owner isolation, active-record filtering, deterministic pagination, empty
  and error states, responsive behavior, keyboard support, and accessibility
  tests.

### Excluded

- Named or pinned saved views, their lifecycle, and restoring publication
  scope from a saved view remain deferred. Slice 18 provides last-used state.
- Recipe List-column visibility and its shared chooser were delivered in
  Slice 19, after this slice's fixed-field implementation.
- Nested AND/OR groups, arbitrary clause grouping, query explanation, and
  advanced query serialization remain deferred.
- Public recipe search or public search documents (Slice 22).
- Search by alias, typo-tolerant matching, OCR, recipe import, and fuzzy
  substring matching.
- Rewriting recipe data, history, or ingredient order as a result of search,
  filtering, sorting, or column selection.
- Search across recipe References: the authoritative § 7.2 full-text list
  does not name References, although an earlier discussion draft did.

## Search and result contract

- Results contain only active records owned by the current account. Search,
  filter, count, and pagination operations must not reveal a matching record
  or metadata belonging to another account.
- Use a plain, labeled search input with Enter/submit behavior and an explicit
  clear action. Apply the text query and structured filters together. A blank
  query returns the unfiltered active set.
- Use PostgreSQL full-text tokenization and a GIN-backed search vector for
  indexed text. Prefer title/name and linked publication name matches over
  body text in relevance ranking. When a text query is active, default to
  relevance; otherwise default to Name ascending. Every sort ends with a
  stable Name and record-ID tie-break. Null values remain after populated
  values in either direction.
- Ordinary terms use the configured language dictionary and stemming.
  Quoted phrases, `or`, and `-` exclusion follow PostgreSQL's
  `websearch_to_tsquery` behavior. Do not claim typo correction or infix
  matching. These search operators are independent of the deferred nested
  query-group capability.
- Simple filters use AND. Use the field operators in comprehensive reference
  § 7.1: text `Contains`, `Does Not Contain`, `Equals`, `Starts With`, `Is
  Empty`, `Is Not Empty`; multi-select `Contains Any`, `Contains All`, `Does
  Not Contain`; numeric/time/date comparisons and `Between`; and enum `In` and
  `Not In`. Validate filter field, operator, and value types against an
  allowlist on the server.
- Slice 17 initially rendered fixed recipe fields for each explorer context.
  Slice 19 subsequently added List-column visibility without changing filter
  or sort semantics.
- Default publication List columns remain Name (with its type icon), Author,
  Edition/Issue, and Recipes. The chooser can show/hide Tags, Date Added, and
  Date Changed; Name is required. Keep Type represented in Name rather than
  adding a duplicate Type column. Existing Date Added and Date Changed sort
  choices remain available without being default columns.
- Grid and List show the same filtered and sorted records. Recipe Grid uses
  responsive 220px minimum columns with 12px gaps; five columns fit at 1,148px
  of usable grid width. Keep desktop cards 234px high and mobile cards sized to
  their content. Use a checkerboard that alternates card colors across each
  visual row and flips the starting color on the next row, based on the
  rendered row and column positions. The publication recipe Grid uses the
  current default photo where available and preserves photo content rather
  than using a tight crop. On mobile, keep the existing 720px responsive
  convention: List at or below the breakpoint, Grid above it. Adapt controls
  to touch-sized targets and prevent horizontal page overflow.
- Show total matching count and distinguish an empty account/library from a
  non-empty collection with no matches. A no-match state offers to clear the
  query and filters. Query failures preserve the user's input and show a
  recoverable error, not a zero-result state.
- Use bounded server-side pages; do not load the entire account's recipe graph
  into the browser to filter locally. Apply the same stable sort to both
  views and across pages.

## Data and security boundary

- Keep the search index derived from canonical records. Do not make a second
  editable source of recipe or publication text.
- Recommended implementation: maintain owner-scoped `tsvector` projections
  for recipes and publications with GIN indexes. Since recipe search includes
  child tables and related publication/tag text, refresh the projection in
  the transaction boundary for recipe saves and relevant child/catalog
  changes. Publication renames and tag/ingredient renames must not leave
  stale matches. A dedicated projection table is an alternative only if its
  ownership, RLS, and transactional refresh are simpler to prove.
- Any database search function must use the authenticated owner context,
  respect RLS, reject unsupported field/operator combinations, constrain
  page size, and avoid dynamic SQL built from user-provided identifiers or
  values. Do not use the service-role key for ordinary searches.
- Add deterministic tests for index freshness after recipe, ingredient,
  instruction, publication, and tag changes; trashed records; cross-account
  access; query parsing; ordering; and page boundaries. A migration must not
  rewrite an applied migration or introduce public access to private search
  text.

## Test-first acceptance

- Unit tests cover full-text query parsing, field/operator validation,
  multi-select Any/All behavior, empty checks, ranking precedence, null sort
  behavior, stable tie-breaks, and pagination boundaries.
- Database/API tests prove owner isolation and active-only results for both
  entities; each searchable source refreshes its projection in the same
  transaction; publication scope cannot escape; and no role can query another
  account's private text.
- Browser tests cover global recipe search across Recipe Tin and publications,
  publication search, every supported simple filter type, filter composition,
  sorting in both directions, column show/hide, List/Grid parity, result count,
  no-data versus no-match states, recoverable errors, and publication-scoped
  behavior.
- Browser tests cover default photos and no-photo recipes in publication
  Grid, stable publication scope while changing filters, and transient state
  after reload.
- Accessibility tests cover visible labels, keyboard operation, focus
  restoration and dismissal for popovers, table headings, accessible state
  for icon controls, screen-reader result count/status, contrast, and no
  horizontal overflow at 352px and 390px on Chromium and Fold 6. Browser
  regression tests also cover distinct header and data-row surfaces, responsive
  zebra fills, and visible titles on image-backed publication cards.
- Capture automated desktop and mobile screenshots for populated/empty List
  and Grid states and for a publication-scoped explorer. These supplement
  behavioral and accessibility assertions.

## Verification and completion

Before implementation, verify the current Next.js 16 and Supabase/PostgREST
APIs against their installed docs and official references, then write focused
failing tests before production code. Search scope is recipe notes plus
publication name and author; do not add a Publication Notes field. Follow
`AGENTS.md` for the Next.js documentation location. Reuse local data when
useful; a reset is allowed when a clean baseline is worth the reset and reload
effort. Follow the README procedure and reload the synthetic fixture. Never
reset linked or hosted Supabase or stop the existing development server as a
shortcut.

Slice 17 is complete when all included workflows work for an authenticated
owner, search remains private and current after source changes, publication
detail shares the recipe explorer without losing scope, and focused unit,
database/API, browser, and accessibility tests pass on Chromium and Fold 6.
TypeScript, Biome, and a production build must also pass. Update the visual
guide and roadmap status only after implementation has been validated.
