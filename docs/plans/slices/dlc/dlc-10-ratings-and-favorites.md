# DLC 10: Recipe ratings, stars, and hearts

This brief resolves the original ratings-and-favorites question as three
separate personal signals. It does not create a Favorites collection.

## References

- [Delivery roadmap](../../delivery-roadmap.md), DLC 10
- [First-draft specification](../../first-draft-spec.md), State and Opinion
- [Comprehensive reference](../../comprehensive-reference.md), §§ 2, 7, 9,
  11, and 12
- [Data model](../../data-model.md), Ownership, Recipe, Explorer state, and
  History event
- [Design philosophy](../../design-philosophy.md), Information hierarchy and
  interaction
- [Visual design guide](../../visual-design.md), Recipe metadata and detail
  toolbar
- [Decision log](../../decision-log.md), DLC 10
- [Explorer columns and widths](../../19-advanced-queries-and-saved-views.md)
- [WAI-ARIA APG rating radio group example](https://www.w3.org/WAI/ARIA/apg/patterns/radio/examples/radio-rating/)
- [WAI-ARIA APG rating slider example](https://www.w3.org/WAI/ARIA/apg/patterns/slider/examples/slider-rating/)
- [WAI-ARIA APG button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
- [WCAG 2.2: Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [WCAG 2.2: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

## Outcome

An owner can record a tried-only signed Rating (stored as `score`), independently mark a private
recipe with a Star (“note this”) or Heart (“love this and repeat it”) stamp,
and find recipes with either marker without conflating those meanings with the
existing Verdict or State.

The interface calls the signed value **Rating**; the compact details-column
header reads **Rtg**. The column chooser, filter controls, editor, and other
descriptive labels use **Rating**.

## Product contract

- Keep the configurable Verdict field and all its existing values, including
  “Favorite.” Do not map or rewrite existing Verdict values into Rating, Star,
  or Heart.
- Rating is optional and available only when State is Tried. Its exact allowed
  values are `-5`, `-3`, `-1`, `0`, `1`, `2`, `3`, `4`, and `5`. The selected
  value is cleared when State changes away from Tried, matching the existing
  conditional-response behavior.
- The negative meanings are `-1` “Needs work,” `-3` “No,” and `-5`
  “DO NOT TRY.” Zero is neutral. These descriptions explain intended meaning
  only; the UI presents numeric Rating values and does not include them in
  option labels, tooltips, Help, or accessible names. Positive values remain
  numeric; do not invent positive labels. Negative numeric values use tomato red
  as a supplementary cue wherever Rating appears in private detail and list
  views.
- Star means “note this recipe.” Heart means “I love this and want to repeat
  it.” Both are independent boolean markers, may be on together, are available
  in every State, and default off.
- In private detail, Star and Heart appear as custom stamp artwork rather
  than raised buttons. Each stamp remains an immediate, keyboard-operable
  toggle. The off state is a clearly discernible outline impression; the on
  state uses the warm-gold or rose accent with a stronger fill than hover.
  After activation, suppress hover until the pointer leaves so the resulting
  state remains visible.
  Accessible names and pressed states describe the action without adding
  visible word labels.
- In private List and Grid views, show custom stamp indicators only for active
  markers. Right-align them in List and stack them at the top-right in Grid.
  The marker columns are visible by default in each recipe-list explorer, but
  owners can independently hide or show them; saved per-explorer visibility
  overrides the defaults.
- Find's Search mode and each publication's recipe list provide immediate
  marker-only filter buttons at the right of the sort, view, and list-settings
  controls. Query has no quick marker filters; its Starred and Hearted fields
  remain staged query criteria. Reuse the shared custom Star and Heart artwork
  instead of emoji, with marker-colored active and hover states and
  toolbar-matched sizing and spacing. Their accessible names describe the
  filter. Both enabled means recipes must have both markers; clearing a filter
  removes only its criterion.
- Star and Heart column headers use the same custom artwork and retain
  screen-reader labels.
- Rating, Star, and Heart are private owner data. Public recipe projections and
  public output do not include them.
- Place the stamp toggles to the left of the share, privacy, and output actions
  in the private recipe-detail toolbar. Each write is owner-scoped,
  version-checked, and included in recipe history. Rating is staged in the
  recipe editor and saved with the existing explicit Save action.
- Marker filters use the existing URL-backed explorer state in Find and
  publication recipe lists. They compose with the current query, filters, and
  publication scope.
- Rating participates in the existing filter, sort, display, and list-column
  preference surfaces. Do not add a separate Favorites collection.

## Research and design recommendation

The closest existing detail-page pattern is `RecipeShareActions`: its
Linkable switch sits in the owner toolbar, writes immediately with an expected
recipe version, and records the change. Reuse its error/conflict handling
model, but render Star and Heart as custom stamp artwork rather than raised
buttons. The stamps remain immediate, keyboard-operable toggles with
descriptive accessible names and pressed states. Place them first in the
toolbar, retain its compact 36px desktop controls and 48px mobile hit areas,
and keep feedback below the action row so it cannot cover adjacent controls.

The closest search pattern is Find's URL-backed explorer state. The two
quick-filter buttons are available in Find's Search mode and each publication's
recipe list. Query has no quick-filter buttons; it uses staged Starred and
Hearted fields instead. Quick filters remain immediate, URL-backed criteria
that compose with existing filters without introducing another search mode or
saved-view lifecycle. They use shared custom Star and Heart artwork, expose
their pressed state, and have descriptive accessible names.

The signed Rating is not a star rating. The WAI-ARIA APG rating radio example
uses radio buttons for a small fixed scale; its rating slider example notes
that larger scales may need other patterns and warns about touch
assistive-technology support. This Rating has nine uneven, discrete choices, so
use the app's labeled single-choice dropdown pattern rather than a star widget
or continuous slider. Show the selected signed number; the options and
accessible names remain numeric because the descriptions are intent-only. In
the editor, use a short em-dash unset prompt so the control remains sized to
the longest numeric choice. Use red only as a supplementary cue on negative
numeric values in private detail and list views: the existing tomato token has
5.39:1 and 5.43:1 contrast on the two app paper surfaces, while the existing
gold token has only 2.76:1 and 2.78:1 contrast and must not be used as the
Star's outline. Use gold as an accent fill with a darker outline, and use
paper-mixed pale rose or warm-gold fills for the active stamps. The inactive
outline must remain clearly distinguishable from either paper surface. Keep
the Rating legible in forced-color mode and do not rely on hue alone.

The shared browser can open the public recipe page, but its private route
redirects to Sign in. Owner-toolbar geometry is therefore grounded in the
existing implementation, automated layout assertions, and visual guide; the
new toolbar still requires browser checks at representative desktop and mobile
widths before completion.

## Scope

- Add the optional signed Rating and independent Star and Heart fields to the
  recipe data model, owner save flows, history, import/export, and UI.
- Add owner-only, immediate, version-checked Star and Heart stamp toggles on
  recipe detail. The marker color shows state; show visible feedback only for
  recoverable errors or conflicts.
- Show the Rating with Verdict on Tried recipes; retain State-driven display and
  clear Rating when leaving Tried.
- Add custom-artwork Star and Heart quick filters to the right of the sort,
  view, and list-settings controls in Find and each publication's recipe list.
  They compose with each other and existing filters using AND.
- Expose Rating and marker information in private recipe detail, List, and Grid
  views. Show active marker stamps only; right-align them in List and stack
  them at the top-right in Grid. Show the marker columns by default in each
  recipe-list explorer, while allowing owners to hide or show either column
  independently and persist that choice in its existing explorer preference.
  Add Rating to the existing filter and sort catalog.
- Add the fields to history snapshots and portable bundles. Older bundles that
  lack these fields import with Rating unset and both markers off.
- Preserve the public-data allow-list: none of the three new fields is
  projected to guests or included in public output.

## Data, security, and failure boundaries

- Use nullable integer storage for Rating (the `score` field) with a database
  constraint limited to the nine allowed values. Enforce that Rating is null
  unless State is Tried.
  Star and Heart default false and do not depend on State.
- Add fields without rewriting existing Verdict data. Existing recipes start
  with no Rating, Star, or Heart; in particular, Verdict = “Favorite” does not
  infer Heart.
- Reuse recipe ownership and RLS. A non-owner, unauthenticated user, or
  trashed recipe cannot change Star or Heart. Public reads remain allow-listed.
- Every changed marker increments the recipe version and creates a history
  event. A stale expected version returns the established conflict experience;
  use the project's PostgREST conflict status convention for new RPC writes.
- Reject invalid Rating values explicitly. A marker or Rating write failure must
  not appear successful; preserve the prior persisted state and allow recovery.
- Verify bundle compatibility and a backup/rollback path before applying a
  destructive downgrade after new values have been written.

## Acceptance criteria and tests

- Database tests verify allowed Rating values, Tried-only storage, marker
  defaults, owner RLS, trashed-recipe rejection, version conflicts, history,
  and that existing Verdict data is unchanged.
- Recipe-editor tests verify all nine numeric Rating choices, clearing on State
  change, validation, numeric accessible names, and explicit Save behavior.
- Browser tests verify immediate Star and Heart stamp updates, independent and
  simultaneous pressed states, owner-only access, conflict/error recovery,
  visible off/on distinction, descriptive accessible names, visible focus, and
  mobile/desktop toolbar geometry.
- Recipe-list tests verify ⭐ and ❤️ columns are initially visible in every
  recipe-list explorer, can be independently hidden and restored, and retain
  the owner's saved visibility choice. They also verify active-only custom
  stamp indicators, right alignment in List, and top-right stacking in Grid.
- Search tests verify shared custom Star and Heart artwork in Find and
  publication recipe lists, each filter, both filters combined with AND,
  interaction with existing filters and publication scope, URL/reload behavior,
  and reset/clear behavior.
- History and import/export tests verify all three fields round-trip and that
  older bundles default to unset Rating and off markers.
- Public projection and output tests prove Rating (`score`), Star, and Heart never appear
  in guest payloads or public HTML, print, PNG, or PDF output.
- Test responsive geometry around every toolbar reflow boundary and at an
  intermediate mobile width. Run focused browser, database, accessibility,
  unit, type, lint, and build checks before completion.

## Confirmed interaction details

- Rating changes are staged with recipe edits and saved through the existing
  explicit Save action. Its choices and accessible names remain numeric, and
  its control width follows the longest numeric choice in desktop and mobile
  layouts.
- Star and Heart detail controls and filters use shared custom marker artwork.
  On desktop, the detail toolbar places the toggles to the left of its other
  action buttons; on mobile, it uses even 4px gaps between the six first-row
  actions, lets Can Link expand into the remaining row width with equal spacing
  around its label and switch, and places markers on a second row with Star
  aligned under Page Settings and Heart under Edit.
- Filter controls use the marker colors when active or hovered and match the
  toolbar's button size and spacing, with a faint background that contrasts
  with each icon's accent fill. Desktop detail toggles use a thinner outline
  and an accent fill inside the outline without a tinted button background.
  On mobile, outline each toggle in its marker color and use the same faint
  active background as the filters. Do not show pending or success notices;
  keep visible marker errors below the detail action row.
- Find's Query mode includes Starred and Hearted fields with single-value
  Is/Isn't operators and Yes/No choices. Submitted marker criteria remain
  visible and editable alongside the other Query rules.
- Rating Query filters accept signed numeric values from -5 through 5 and
  provide Exists/Doesn't Exist operators. Starred and Hearted retain their
  existing Is/Isn't and Yes/No controls.
- Query edits, rule removal, and Clear all remain staged until Apply; Enter in
  a complete rule applies the same criteria. Apply is disabled while any
  rule is incomplete and remains available to clear all submitted criteria.
- Rating, Star, and Heart details-column headers and values are centered
  horizontally and vertically relative to their visible column dividers,
  accounting for the grid gap. The compact Rating header says “Rtg” while menus
  say “Rating.” Keep the minimum column widths compact but sufficient for the
  resize hit area. Column resize handles show one centered visible line.
- In recipe detail, show optional Rating as its own metadata field beside
  Verdict rather than appending it to the Verdict value. Center the numeric
  Rating beneath its label on desktop and mobile. Display negative numeric
  Ratings in tomato red as a supplementary cue across private detail and list
  surfaces; keep the score numeric and private.
- Active stamps are visible in every private recipe List and Grid view. List
  indicators align right with at least 2mm of right-side padding; Grid
  indicators stack at the top-right, with an available numeric Rating below
  the Star and Heart icons. Inactive markers are not drawn in those views.
- Simple List rows show a Rating as its number only, retaining a visually
  hidden “Rating” label for assistive technology. Recipe titles shrink and
  truncate before the non-shrinking score and marker group without causing
  horizontal page overflow. Center Rating values in mobile Details cells as
  well as desktop columns.
- In mobile Details views, active Star and Heart stamps share the recipe-title
  row, right-aligned and vertically centered on the title, while the remaining
  metadata continues below. Search and Query also place the numeric Rating
  beside the stamps without a visible label, with equal visible spacing from
  Rating to Star and Star to Heart. Long titles truncate with an ellipsis
  before the stamps, with at least 8px of trailing space after the rightmost
  stamp. Search marker filters sit to the left of the view controls on the same
  row; Query has no quick marker filters. Publication marker filters sit on a
  left-aligned row below the view and column controls; keep publication actions
  beside those controls without overlap.
- Grid Ratings and active marker icons share an opaque pill matching each
  card's surface. Vertically center the complete stack in a pill sized to its
  contents: one Rating or marker forms a 32px circle, and additional signals
  extend the pill vertically with equal visual spacing. Negative values remain tomato red in
  Publication, Search, and Query Grid views on desktop and mobile.
- Center the numeric Rating choices in the recipe-edit picklist on desktop and
  mobile. In narrow desktop recipe details, let the featured image shrink only
  as needed to keep the action bar within the available heading width.
- The ⭐ and ❤️ List columns are visible by default but independently
  optional; saved per-explorer visibility overrides that default.
