# Slice 9: Publications and the Recipe Tin

**Status:** Delivered with the original issue-per-publication model. The
Magazine model was revised during Slice 11; implementation follow-up is
required to consolidate issue records into Magazine titles and move issue
details onto recipes. The current product contract is in the
[comprehensive reference](../comprehensive-reference.md#62-magazine-titles-recipe-locations-and-online-urls).
The scope, verified constraints, and acceptance details below document what
Slice 9 originally shipped; they are not the target requirements for revised
Magazine behavior.

This brief introduces owner-scoped publications and connects recipes to one
optional primary publication. A recipe with no primary publication remains in
the permanent Recipe Tin. The slice provides a minimal Library, publication
creation, inline creation from the recipe editor, and publication pages with
active recipes. It does not introduce publication deletion, secondary Site
listings, uploaded covers, or the full Library explorer.

The product authority is
[plans/comprehensive-reference.md](../comprehensive-reference.md), especially
[§ 2, Recipe Card and Metadata](../comprehensive-reference.md#2-recipe-card-and-metadata),
[§ 6, Publications, Magazine Handling, and The Recipe Tin](../comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin),
[§ 12, Change History and Forensic Audit](../comprehensive-reference.md#12-change-history-and-forensic-audit),
and [§ 13, Interaction, Keyboard-First Design, and Accessibility](../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility).
Related boundaries are in the
[first-draft specification](../first-draft-spec.md),
[data model](../data-model.md),
[visual design guide](../visual-design.md),
[delivery roadmap](../delivery-roadmap.md),
and [decision log](../decision-log.md).

## Outcome

An authenticated owner can create a Book, Magazine, or Site; assign an
active recipe to one primary publication or return it to the Recipe Tin; and
open a publication page showing its active recipes. Publication creation is
available from a minimal Library and inline from the recipe Publication picker.
Recipe saves remain explicit, owner-scoped, version-checked, and recorded in
history. The Recipe Tin keeps its compact working-table layout while receiving
a bounded tin-and-paper identity treatment.

## Verified implementation constraints

- The local application uses Next.js `16.3.8`, React `19.3.0`, Supabase
  `2.117.2`, Playwright `1.63.0`, and axe Playwright `4.13.0`.
- Migration `20261019000000_publications_and_recipe_assignment.sql` adds the
  owner-scoped `publications` table, the composite `(account_id,
  publication_id)` recipe foreign key, and nullable `publication_page` and
  `recipe_url` fields. Recipe Tin is represented by a null publication ID.
- `create_publication` derives ownership from `auth.uid()` and appends a
  `publication.created` snapshot. `save_recipe_with_publication` passes the
  association and location into the version-checked `save_recipe` boundary;
  recipe history continues to use the existing append-only event mechanism.
- A database trigger rejects cross-owner assignment, locations incompatible
  with the publication type, simultaneous page and URL values, and locations
  on Recipe Tin recipes. Publication and recipe URLs must be absolute HTTP(S).
- Recipe list, detail, and edit reads already exclude trashed recipes. Slice 9
  must preserve those active-only boundaries.
- Next.js Server Actions are reachable through direct POST requests. Every
  publication mutation must authenticate, validate untrusted form values, and
  verify ownership server-side; page-level authentication alone is not an
  authorization boundary.
- Publications and Recipe Tin assignment are private in this slice. Do not add
  public routes, public identifiers, or public caching behavior; Slice 20 owns
  public recipe access.

## Scope

### Included

- An owner-scoped `publications` table for Book, Magazine Issue, and Site.
- Type-specific publication fields and validation:
  - Book: required name; optional author, edition, ISBN, and retailer/reference
    URL.
  - Magazine Issue: required magazine name and required free-text issue,
    edition, or date.
  - Site: required display name and required root URL.
- A recipe's optional primary-publication association and optional location:
  a page number or range for a Book, a full recipe URL for a Site, and no
  location field for a Magazine Issue.
- The recipe editor's searchable single-select Publication control. It offers
  Recipe Tin as the unparented choice and, after typing, an `Add "{name}"`
  command that opens a compact, keyboard-operable creation dialog and selects
  the created publication without submitting or discarding the recipe draft.
- Explicit saving of the primary publication and applicable recipe location
  through `save_recipe_with_publication`, which delegates to the existing
  version-checked recipe save boundary.
- A minimal Library route with a compact publication list and New Publication
  action. Full grid/details modes, sorting, type filters, preview pane, and
  publication deletion remain in Slice 10.
- A publication detail route listing that publication's active recipes with
  recipe name, state, meal type, food type, applicable opinion, and total time.
  Selecting a recipe opens its detail page.
- A clickable primary-publication attribution on recipe detail. Show only the
  applicable location; do not show a page number and recipe URL together.
- A compact, bounded Recipe Tin visual treatment and type-specific fallback
  cover visuals. Keep the Recipe Tin list dense and tabular; do not turn it into
  a card gallery or apply the Tin motif to publication pages, recipe detail, or
  the editor. Book fallback: light-blue book shape, dark-blue border, fitted
  italic title. Magazine fallback: white magazine shape, black border, fitted
  normal title. Site fallback: a restrained site badge. Uploaded cover images
  remain in Slice 11.
- Append-only publication creation history, plus recipe history snapshots that
  capture primary-publication and location changes through ordinary explicit
  recipe saves.
- Database, server-action, browser, responsive, and accessibility tests written
  before production code.

### Excluded

- Publication edit and deletion workflows, publication Trash, restore, purge,
  and the three publication-deletion choices; Slice 10 owns those.
- The magazine `+ Site` secondary listing and its recipe URL; Slice 11 owns
  cross-publication relationships and references.
- Uploaded covers, logos, signed URLs, and image processing; Slice 11 owns
  publication and recipe images.
- Library grid/details views, sorting, type filtering, and the preview pane;
  Slice 10 owns the explorer.
- Tags on publications or recipes; the taxonomy slice owns tag management.
- Public recipe routes, scaling, alternate ingredient presentations, and
  print changes.

## Data and authorization contract

### Publications

- Store `id`, `account_id`, `name`, `publication_type`, applicable type-specific
  fields, `version`, `created_at`, and `updated_at`. Use a composite unique key
  on `(account_id, id)` for owner-preserving references.
- Use the stable types `book`, `magazine`, and `site`; render `Magazine Issue`
  as the user-facing type label.
- Keep type-specific data normalized in explicit nullable fields. Enforce that
  only the selected type's fields are populated and that Magazine Issue's
  issue and Site's root URL are non-empty. Normalize and validate URLs as
  absolute HTTP(S) URLs before persistence.
- Enable RLS. Authenticated owners may read their publications. The creation
  Server Action and database write boundary must derive `account_id` from the
  authenticated user; clients cannot choose another owner. Do not grant broad
  direct publication writes that bypass validation or history.
- Record one append-only `publication.created` history event with the created
  record snapshot. No publication edit event is needed in this slice because
  publication editing is out of scope.

### Recipe association and location

- Add nullable `publication_id` to `recipes` with a composite foreign key to
  `(publications.account_id, publications.id)`. Null means Recipe Tin. Changing
  the association never changes the recipe ID or recipe-owned graph.
- Add nullable `publication_page` and `recipe_url` fields. A Book may have a
  page number/range but no recipe URL; a Site may have a recipe URL but no page
  reference; a Magazine Issue has neither. These location values are optional
  so an incomplete clipping or site entry can still be saved. If provided, a
  recipe URL must be absolute HTTP(S).
- Validate publication ownership, publication type, applicable location, and
  expected recipe version atomically in the `save_recipe` boundary. A stale
  edit, invalid type/location combination, or foreign-account publication
  assignment must not partially mutate recipe data or history.
- Preserve recipe locations and associations through unrelated edits. When the
  selected publication changes, clear any location that is no longer valid for
  the new type; selecting Recipe Tin clears both location fields.
- Existing recipe history snapshots must include the publication association
  and location fields. Assignment, unparenting, and location changes use the
  existing `recipe.updated` event mechanism, not client-supplied history text.
- Keep publication assignment when a recipe is trashed or restored. Publication
  deletion does not exist in this slice, so it cannot orphan a recipe.

## Screen and interaction contract

### Library and publication pages

- Add Library to the authenticated navigation without removing Recipe Tin.
  The Library is a compact, scan-friendly list, not a dashboard or card wall.
  Each entry shows its title, type, and available identifying detail, with the
  type-specific fallback visual kept postage-stamp sized.
- The New Publication action opens a focused form. Type selection uses a
  segmented control or equivalent labeled choice; only fields relevant to the
  selected type are shown. Labels remain visible, errors are associated with
  their fields, and Save has visible text.
- A publication page has a modest title/header and a dense recipe list. Do not
  add a persistent pane, nested cards, promotional copy, or a large cover hero.
  When the list is empty, show a compact message and a link back to Library.
- The Recipe Tin retains the existing table's information density and
  responsive columns. Add only the bounded Tin/paper treatment needed to
  distinguish its permanent unparented collection; the illustration and paper
  texture must not reduce contrast or compete with recipe names.

### Delivered visual refinements

- The Library action reads `Add publication`. In a filtered recipe picker, the
  creation command reads `Add "{typed name}"` and uses the same compact option
  treatment as existing publications rather than looking like a separate link.
- Publication creation uses a responsive wrapping form: Name and URL fields
  take full rows, while Author, Edition, ISBN, and Magazine Issue use
  content-appropriate widths. The fields wrap instead of stretching every
  value to the same size.
- ISBN input accepts ISBN-10 and ISBN-13 values, including pasted separators.
  It formats registered ISBN ranges as the value is entered; ISBN-13 values
  need a `978` or `979` prefix before range-aware formatting is available.
- On recipe detail, an assigned publication is a compact attribution subtitle
  beneath the title. The publication name is the only italicized fragment;
  issue, page, and source URL remain upright.

### Recipe assignment

- Place a visibly labeled Publication picker in recipe metadata. Recipe Tin is
  the initial selection for new recipes. Existing recipes show their current
  publication or Recipe Tin.
- The picker supports keyboard search and selection, visible focus, Escape to
  close, and an explicit Recipe Tin option. Inline Add new publication opens a
  compact semantic dialog. Escape and Cancel close it without losing the
  current recipe draft. On successful creation, select the new publication
  and expose any creation error accessibly.
- Show a compact Page field only for a Book and a Recipe URL field only for a
  Site. Magazine Issue has neither. Changing publication type clears a now-
  incompatible location value. Save remains explicit and preserves the
  existing recipe version-conflict behavior.
- Recipe detail shows the primary publication as a link. Use “Recipe Tin” only
  when it adds useful context; do not repeat it when the navigation already
  identifies the selected Recipe Tin. Place the attribution directly beneath
  the recipe title, italicize only the linked publication title, and show only
  the applicable location: a Book page, Site recipe URL, or Magazine Issue
  issue.

### Responsive and accessibility behavior

- Preserve the app's quiet paper-and-ink palette, DM Sans typography, restrained
  borders, compact spacing, and direct working-tool hierarchy in
  [visual-design.md](../visual-design.md). The Tin identity is bounded to the
  Recipe Tin view; ordinary publication and recipe screens remain crisp.
- On mobile, adapt publication lists to a readable stacked layout instead of
  shrinking a multi-column table. Keep visible controls and dialog actions
  touch-safe, avoid horizontal page overflow at 352px and 390px, and keep the
  inline creation dialog inside the viewport.
- Use semantic navigation, headings, tables/lists, form labels, combobox/listbox
  semantics, dialog semantics, visible focus, and status/error announcements.
  Every icon has a tooltip and accessible name; Save and other submission
  actions retain visible text.
- Test keyboard operation, desktop and Fold 6 layouts, touch targets, empty and
  populated states, and axe scans for Library, publication form, publication
  page, recipe editor picker, and inline creation dialog.

## Verification coverage

The implementation is covered by the following focused suites:

- `tests/e2e/publications.spec.ts` covers Book creation, assignment, saved
  attribution and page display, unparenting, publication detail navigation,
  Magazine Issue and Site forms and fallbacks, owner isolation, creation
  history, rejected foreign assignment, inline creation, draft preservation,
  Cancel/Escape behavior, responsive overflow, and axe scans of key forms and
  dialog states. The suite runs in Chromium and Fold 6 projects.
- `tests/unit/publication-validation.test.tsx` covers ISBN-10/ISBN-13
  validation and formatting, registered hyphen ranges, pasted separators, and
  the ISBN-10 X check character.
- `tests/e2e/recipes.spec.ts` covers shared recipe save/version-conflict
  behavior, Recipe Tin flows, and recipe detail accessibility.

The migration also enforces publication type/location rules and recipe
ownership. The current automated suite does not directly exercise every
rejected publication/location combination or assert publication assignment
fields inside recipe-history snapshots. Treat those as remaining targeted
database-test opportunities, not as missing runtime constraints.

## Verification

Run `npm run test:unit -- tests/unit/publication-validation.test.tsx`, then
`npx playwright test tests/e2e/publications.spec.ts --workers=1` for the focused
Slice 9 acceptance flows in Chromium and Fold 6. Use only local Supabase and
unique test accounts. Do not run `npm run dev:local`, `npm run supabase:reset`,
or any other command that resets local data. The broader release gate remains
`npm run typecheck`, `npm run lint`, an isolated production build, and the
relevant recipe and publication suites.

## Completion criteria

- An owner can create all three publication types, assign and unparent recipes,
  and open a publication page with its active recipes.
- Publication and recipe mutations enforce account ownership, type/location
  rules, explicit-save semantics, version conflicts, and history.
- Recipe Tin remains the home of unparented recipes and receives a bounded,
  readable Tin/paper identity treatment without sacrificing its dense working
  list.
- Publication fallbacks and all new screens follow the current visual guide,
  work at desktop and mobile widths, and pass keyboard, accessibility, and
  automated behavior coverage. The implementation meets the slice outcome;
  the location-matrix and recipe-history assertions noted above remain explicit
  verification follow-ups.
