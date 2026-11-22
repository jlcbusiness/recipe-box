# DLC 46: Nested Library Breadcrumbs

**Status:** Implemented in app version 1.18.0. Focused breadcrumb, history, and
direct-destination checks pass on Chromium and Fold 6. See the DLC 46 workstream
record for the verification details.

## Outcome

People can orient themselves and return to a parent page without relying on
browser Back. Apply one breadcrumb rule consistently across private pages:
show a path only when the page's parent is not directly reachable from
navigation.

## Scope

- Apply the rule to all current authenticated pages, not only Library detail
  pages.
- Do not show a breadcrumb when the page's parent is a direct navigation
  destination, including Library, Find Recipes, Trash, Help, and Settings.
  Account-menu destinations are also directly reachable and do not need a path.
- Settings tabs are states of the Settings page, not additional route levels.
- Exclude public pages. Do not add routes or change menu destinations.
- Use actual page ancestry and launch context, not URL depth alone.

## Proposed behavior

- Place a shared, accessible breadcrumb near and left-aligned with the page
  title when needed, with roughly one line of visual spacing between them.
  Link ancestors to their actual destinations. Omit the final path item if it
  duplicates the page title; otherwise identify the current page as the
  current location, not as a link to itself. Separate each leg with `>`.
- Start the path at the nearest direct navigation destination. For a recipe,
  use its assigned publication as the parent; a Recipe Tin recipe has the path
  `Library → Recipe Tin` followed by the recipe title.
- Do not repeat a publication name already present in the breadcrumb in the
  recipe attribution. Keep publication location details such as issue, page,
  and URL understandable.
- A page one level below a direct navigation destination does not need a
  breadcrumb. For example, a publication detail page is reached from Library;
  its history page has a publication parent that is not a direct destination
  and can show `Library → Publication → History`.
- Preserve the launch context for nested actions. For example, Add Recipe
  opened from a publication shows `Library → Publication`; recipe edit and
  history pages retain their publication and recipe ancestry.
- On Add Recipe, use the breadcrumb in place of the generic collection eyebrow
  and keep it slightly closer to the heading.
- Give each `>` separator the same color as the ancestor links.
- On recipe detail, align the action toolbar vertically with the breadcrumb,
  reducing the gap before the section divider.
- Let breadcrumbs wrap at narrow widths without causing page-level horizontal
  overflow.

## Staged implementation and verification

1. Implement and verify the shared treatment on recipe detail, using both a
   Recipe Tin recipe and a recipe in another publication. Verify the
   publication-detail route remains free of a redundant breadcrumb.
2. Extend the same rule to the remaining private nested routes, including
   publication history and recipe creation, edit, and history contexts.
   Verify direct destinations, Account-menu destinations, and Settings tab
   changes remain breadcrumb-free.

## Acceptance criteria

1. Recipe detail shows the correct chain for both Recipe Tin and another
   publication, with ancestor links to the expected destinations.
2. Breadcrumbs appear only when the page's parent is not directly reachable
   from navigation; top-level destinations and their direct children do not
   gain redundant paths.
3. Each breadcrumb uses a navigation landmark and list semantics; when the
   final path item differs from the title, the current page is announced as
   current and is not linked to itself. Duplicate titles are omitted.
   Every breadcrumb is left-aligned with its page title.
4. Every covered private nested route uses its actual parent chain, including
   recipe edit/history and publication history; contextual recipe creation
   returns to the publication it was opened from.
5. Publication attribution does not repeat the publication context in the
   breadcrumb, while issue, page, and URL details remain understandable.
6. Keyboard focus and activation work for ancestor links. Mobile touch targets
   remain usable, the path wraps at narrow widths, and no page-level horizontal
   overflow is introduced.
7. Public pages remain unchanged; Settings tabs do not add breadcrumb levels.

## Data and failure boundaries

- No schema or migration change is expected. Reuse page data and navigation
  context already available to each route.
- If an expected parent cannot be resolved, surface the route's existing
  loading/not-found failure rather than rendering an invented or success-shaped
  path.
- Recipe and publication loading boundaries can stream before page-level
  `notFound()` checks. With Next.js 16.4.6, a streamed not-found page may retain
  HTTP 200; tests verify its `noindex` marker and the absence of private content
  rather than requiring a 404 status.
- When a private recipe navigation returns a successful HTML not-found page
  with `noindex`, the service worker removes that recipe's cached offline
  snapshot so a streamed HTTP 200 cannot leave stale private content available
  offline.

## Open decisions

- None. Public pages are excluded; the standard applies across current private
  pages, with direct navigation destinations remaining breadcrumb-free.

## Initial sizing

Medium difficulty; about **2–4 days**; medium churn. The shared UI is small,
but route ancestry and no-duplication behavior need coverage across private
page families. No data migration is expected.

## References

- [Visual design guide](../../visual-design.md)
- [Recipe card and metadata reference](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Publication and search reference](../../comprehensive-reference/04-publications-and-search.md)
- [Private shell navigation](../../../../src/app/private-shell.tsx)
- [Recipe detail page](../../../../src/app/recipes/[id]/page.tsx)
