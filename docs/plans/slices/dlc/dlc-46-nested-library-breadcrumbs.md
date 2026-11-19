# DLC 46: Nested Library Breadcrumbs

**Status:** Draft candidate. Confirm the route coverage before implementation.

## Outcome

People can tell where a nested Library page sits and return to its parent
without relying on browser Back. A path appears when the page's parent is not
directly reachable from the main menu.

## Scope

- Add a shared, accessible breadcrumb treatment to authenticated Library pages
  more than one level below a main-menu destination.
- Use the actual navigation hierarchy, for example
  `Library → Recipe Tin → Recipe`.
- Do not add a redundant breadcrumb to a page that is itself a direct
  main-menu destination.
- Do not add routes or change the current menu destinations.

## Proposed behavior

- Show the path near the page heading, with ancestor entries as links and the
  current page identified as the current location.
- For a recipe assigned to a publication, use the publication as the parent
  when it is not a main-menu destination. For a Recipe Tin recipe, use
  `Library → Recipe Tin → Recipe`.
- Avoid showing the same navigation context twice. Where the recipe's source
  publication is already shown as attribution, incorporate it into the path
  rather than repeating it.
- Keep the path usable at narrow widths; allow it to wrap or truncate without
  horizontal page overflow.

## Acceptance criteria

1. Each covered page shows the correct parent chain and links to the expected
   destinations.
2. Direct main-menu destinations do not gain a redundant path.
3. The current page is announced as the current breadcrumb item and is not
   presented as a link to itself.
4. Keyboard, touch, and narrow-screen behavior is covered, including a Recipe
   Tin recipe and a recipe in another publication.
5. Existing page titles, menu state, and publication attribution remain
   understandable without duplication.

## Open decisions

- Confirm whether the scope is all nested private Library routes or only
  publication and recipe detail pages.
- This draft excludes public recipe pages and Help/Settings routes; confirm if
  they should participate.
- Update the current comprehensive-reference note that suppresses a duplicate
  Recipe Tin breadcrumb when this behavior is approved.

## Initial sizing

Medium difficulty; about **1.5–3 days**; medium churn. No data migration is
expected, but route ancestry and page-level navigation need consistent
presentation and coverage.

## References

- [Visual design guide](../../visual-design.md)
- [Recipe card and metadata reference](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Publication and search reference](../../comprehensive-reference/04-publications-and-search.md)
- [Private shell navigation](../../../../src/app/private-shell.tsx)
- [Recipe detail page](../../../../src/app/recipes/[id]/page.tsx)
