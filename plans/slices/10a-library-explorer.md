# Slice 10A: Library Explorer

**Status:** Implemented and verified. Slice 10B remains pending.

This brief delivers a compact Library explorer: owners can switch between List
and Grid, filter by publication type, and sort by publication metadata. The
desktop title tooltip replaces the former preview pane; mobile List is reduced
to a type icon and truncated title, while mobile Grid uses compact covers and
single-line truncated titles and authors. Publication deletion, Trash, and
restore remain a separate Slice 10B lifecycle demonstration.

The product authority is
[plans/comprehensive-reference.md](../comprehensive-reference.md), especially
[§ 6, Publications and the Recipe Tin](../comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin)
and [§ 7.3, Source Library Explorer](../comprehensive-reference.md#73-source-library-explorer).
Also consult the [data model](../data-model.md),
[visual design guide](../visual-design.md),
[decision log](../decision-log.md),
and [delivery roadmap](../delivery-roadmap.md).

## Outcome

An authenticated owner can browse only their active publications in a compact
Library, switch between List and Grid with a direct icon toggle, filter by
publication type, and sort the same result set. Selecting a publication title
opens its existing detail route. The experience works with keyboard and touch,
preserves the current paper-and-ink visual language, and does not overflow at
supported mobile widths.

## Verified implementation constraints

- The current Library route is a Next.js Server Component that fetches
  owner-scoped publications through the authenticated Supabase client and
  passes serializable publication data to its interactive Client Component.
- `publications` has `created_at` and `updated_at` timestamps and a recipe
  relationship through `recipes.publication_id`. Recipe counts exclude
  trashed recipes; a publication update trigger advances `updated_at` for
  Date Changed sorting.
- Fallback publication covers already exist for Book, Magazine Issue, and Site.
  Uploaded covers and signed media URLs are Slice 12, not this explorer work.
- Saved views and persisted view preferences belong to later query/settings
  work. List/Grid, filter, and sort are transient UI state for this slice.
- Publication deletion and restore require a soft-delete lifecycle and
  transactional recipe disposition. They are explicitly out of scope for 10A
  and will be designed and verified in 10B.

## Scope

### Included

- A two-mode view control: **List** and **Grid**. On initial load, default to
  Grid above 720px and List at 720px or narrower. An icon-only trigger shows
  the current view and directly toggles to the other view; its accessible name
  identifies the destination view.
- A compact Type trigger opens **All**, **Books**, **Magazines**, and **Sites**
  options. Its icon reflects the active filter; Magazine Issue records map to
  the Magazines filter.
- Separate icon-only Sort by and Sort direction buttons. Sort by opens the
  sort-key options; Sort direction toggles ascending/descending. The Type
  trigger stays a fixed width sized for Magazines. Type and Sort by popovers
  close with Escape, focus leaving the toolbar, or a pointer interaction
  outside the toolbar.
- A sort control shared by both modes. Sort by Name, Type, Author,
-  Issue/Edition, Recipe count, Date Added, or Date Changed, in ascending or
  descending order. Default to Name ascending; use Name ascending as a
  deterministic tie-breaker. Null text values sort after populated values.
- Desktop List columns for Name, Type, Author, Issue/Edition, and Recipes, with
  recipe counts centered. Names link to the existing publication detail route.
  Neither date is a visible column.
- A mobile one-line List row showing only the type icon and publication title.
  Titles do not wrap and truncate with an ellipsis; no horizontal scrolling is
  introduced.
- Grid items show the existing type-specific fallback cover, publication name,
  author when present, and active recipe count, without a type prefix. Desktop
  covers are 72px wide, and multiple authors appear on separate lines. Mobile
  cards use 48px covers and truncate long titles and authors to one line.
- A desktop-only publication-title tooltip shows one line per metadata field,
  including Date Added and Date Changed. There is no preview pane or mobile
  tooltip.
- Empty states for an account with no publications and for a filter with no
  matching results. No publication preview is maintained in the Explorer.
- Server-side data loading with the existing authenticated Supabase client;
  client-side state only for view, filter, and sort interactions. No client-side
  privileged data access.
- A forward migration adds a `before update` trigger that maintains
  `publications.updated_at`; already-applied migrations are not rewritten.
- Focused browser, keyboard, responsive, and axe tests before production UI.

### Excluded

- Publication edit or delete actions, publication Trash, restore, purge, and
  the three recipe-disposition choices; these belong to Slice 10B.
- Persistent layout, filters, sort, saved searches, configurable columns, or
  query construction; these belong to later settings/query slices.
- Search by publication text; the Library Explorer requirements specify type
  filtering, while full-text search belongs to Slice 17.
- Uploaded covers, logos, signed URLs, and image processing; Slice 12 owns
  media. Existing fallback visuals remain in use.
- Recipe detail changes, publication creation changes, tags, and secondary
  Magazine-to-Site relationships.

## Data and behavior contract

- Return only the signed-in owner's publications, using RLS and the existing
  authenticated server client. Do not add a public or cross-account route.
- Count only active recipes assigned to each publication. A publication with
  no active recipes displays a count of zero.
- Apply filters and sorting to the same owner-scoped data in both view modes.
  Filtering does not change publication records or recipe assignments.
- Publication titles remain ordinary links to their detail routes.
- Sort and mode changes do not change the URL or persist across reloads. This
  avoids introducing a preference/schema contract ahead of saved views.

## Responsive and accessibility contract

- Use semantic buttons for view, filter, sort key, and sort direction; expose
  current state with accessible names and `aria-pressed` where appropriate.
- Desktop List uses a semantic table with labeled headers. Grid uses a list of
  linked items. Mobile List rows expose the publication type icon and linked
  title without extra metadata.
- Maintain visible focus, logical tab order, and readable selected states that
  do not rely on color alone. External links have descriptive text and safe
  new-tab behavior only if opened in a new tab.
- At 352px and 390px, controls and single-line titles fit without horizontal
  overflow. The desktop metadata tooltip is not shown in mobile List.
- Run axe on populated and empty Library states in List and Grid. Verify
  keyboard mode/filter/sort behavior, Escape dismissal, and outside-pointer
  dismissal.

## Automated acceptance

- Verify the initial view is Grid above 720px and List at 720px or narrower.
- Verify List preserves name ordering and shows the five desktop data columns
  without Date Added or Date Changed; center recipe counts.
- Verify List/Grid switching and publication navigation in both modes.
- Verify each type filter, its active icon, All, and zero-result feedback.
- Verify every sort key, including Date Added and Date Changed, in both
  directions, with deterministic tie ordering.
- Verify Grid author lines and mobile ellipsis, cover sizing, and the desktop
  title tooltip, including one line per field and both timestamps.
- Verify mobile rows show only a type icon and truncated title at 352px and
  390px, without horizontal overflow.
- Verify owner isolation, populated and empty states, keyboard operation, axe
  scans, and no horizontal overflow at 352px and 390px in Chromium and Fold 6.

## Verification

Run the focused unit tests if sorting/count projection has isolated logic, then
`npx playwright test tests/e2e/publications.spec.ts --grep 'Library Explorer'`
in Chromium and Fold 6. Finish with `npm run typecheck`, `npm run lint`, and
`git diff --check`. Do not run `npm run dev:local`, reset local Supabase, or
stop the existing development servers.

## Completion criteria

- The Library supports List/Grid, the four type filters, shared sorting, the
  desktop metadata tooltip, and the compact mobile List.
- Data remains private, recipe counts exclude trashed recipes, and navigation
  continues to use the existing publication detail route.
- Keyboard, accessibility, empty-state, and supported viewport acceptance tests
  pass. Publication deletion and restore remain pending in Slice 10B.
