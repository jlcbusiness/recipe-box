# DLC 10: Recipe score, stars, and hearts

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

An owner can record a tried-only signed Score, independently mark a private
recipe with a Star (“note this”) or Heart (“love this and repeat it”) stamp,
and find recipes with either marker without conflating those meanings with the
existing Verdict or State.

## Product contract

- Keep the configurable Verdict field and all its existing values, including
  “Favorite.” Do not map or rewrite existing Verdict values into Score, Star,
  or Heart.
- Score is optional and available only when State is Tried. Its exact allowed
  values are `-5`, `-3`, `-1`, `0`, `1`, `2`, `3`, `4`, and `5`. The selected
  score is cleared when State changes away from Tried, matching the existing
  conditional-response behavior.
- The negative meanings are `-1` “Needs work,” `-3` “No,” and `-5`
  “DO NOT TRY.” Zero is neutral. These descriptions explain intended meaning
  only; the UI presents numeric Score values and does not include them in
  option labels, tooltips, Help, or accessible names. Positive values remain
  numeric; do not invent positive labels.
- Star means “note this recipe.” Heart means “I love this and want to repeat
  it.” Both are independent boolean markers, may be on together, are available
  in every State, and default off.
- In private detail, Star and Heart appear as custom stamp artwork rather
  than raised buttons. Each stamp remains an immediate, keyboard-operable
  toggle. The off state is a clearly discernible outline impression; the on
  state is a muted ink stamp with a pale fill. Accessible names and pressed
  states describe the action without adding visible word labels.
- In private List and Grid views, show custom stamp indicators only for active
  markers. Right-align them in List and stack them at the top-right in Grid.
  The marker columns are visible by default in each recipe-list explorer, but
  owners can independently hide or show them; saved per-explorer visibility
  overrides the defaults.
- Find and each publication's recipe list provide immediate marker-only filter
  buttons visually labeled only `⭐` and `❤️`. Their accessible names describe
  the filter. Both enabled means recipes must have both markers; clearing a
  filter removes only its criterion.
- Score, Star, and Heart are private owner data. Public recipe projections and
  public output do not include them.
- Place the stamp toggles beside the existing Linkable control in the private
  recipe-detail toolbar. Each write is owner-scoped, version-checked, and
  included in recipe history. Score is staged in the recipe editor and saved
  with the existing explicit Save action.
- Marker filters use the existing URL-backed explorer state in Find and
  publication recipe lists. They compose with the current query, filters, and
  publication scope.
- Score participates in the existing filter, sort, display, and list-column
  preference surfaces. Do not add a separate Favorites collection.

## Research and design recommendation

The closest existing detail-page pattern is `RecipeShareActions`: its
Linkable switch sits in the owner toolbar, writes immediately with an expected
recipe version, and records the change. Reuse its placement and error/conflict
handling model, but render Star and Heart as custom stamp artwork rather than
raised buttons. The stamp itself remains an immediate, keyboard-operable
toggle with a descriptive accessible name and pressed state. The current
toolbar has compact 36px icons and 48px mobile hit areas; the added controls
must preserve its action order and avoid overflow.

The closest search pattern is Find's URL-backed explorer state. The two
quick-filter buttons are available in Find and each publication's recipe list.
They use emoji-only visible labels (`⭐` and `❤️`), apply immediately, expose
their pressed state and descriptive accessible names, and compose with
existing filters without introducing another search mode or saved-view
lifecycle.

The signed score is not a star rating. The WAI-ARIA APG rating radio example
uses radio buttons for a small fixed scale; its rating slider example notes
that larger scales may need other patterns and warns about touch
assistive-technology support. This score has nine uneven, discrete choices, so
use the app's labeled single-choice dropdown pattern rather than a star widget
or continuous slider. Show the selected signed number; the options and
accessible names remain numeric because the descriptions are intent-only.
Use red only as a supplementary negative cue: the existing tomato token has
5.39:1 and 5.43:1 contrast on the two app paper surfaces, while the existing
gold token has only 2.76:1 and 2.78:1 contrast and must not be used as the
Star's outline. Use gold as an accent fill with a darker outline, and use
paper-mixed pale rose or warm-gold fills for the active stamps. The inactive
outline must remain clearly distinguishable from either paper surface. Keep
the score legible in forced-color mode and do not rely on hue alone.

The shared browser can open the public recipe page, but its private route
redirects to Sign in. Owner-toolbar geometry is therefore grounded in the
existing implementation, automated layout assertions, and visual guide; the
new toolbar still requires browser checks at representative desktop and mobile
widths before completion.

## Scope

- Add the optional signed Score and independent Star and Heart fields to the
  recipe data model, owner save flows, history, import/export, and UI.
- Add owner-only, immediate, version-checked Star and Heart stamp toggles on
  recipe detail, including visible pending, success, and recoverable error or
  conflict feedback.
- Show the Score with Verdict on Tried recipes; retain State-driven display and
  clear Score when leaving Tried.
- Add emoji-labeled Star and Heart quick filters to Find and each publication's
  recipe list, composing them with each other and existing filters using AND.
- Expose Score and marker information in private recipe detail, List, and Grid
  views. Show active marker stamps only; right-align them in List and stack
  them at the top-right in Grid. Show the marker columns by default in each
  recipe-list explorer, while allowing owners to hide or show either column
  independently and persist that choice in its existing explorer preference.
  Add Score to the existing filter and sort catalog.
- Add the fields to history snapshots and portable bundles. Older bundles that
  lack these fields import with Score unset and both markers off.
- Preserve the public-data allow-list: none of the three new fields is
  projected to guests or included in public output.

## Data, security, and failure boundaries

- Use nullable integer storage for Score with a database constraint limited to
  the nine allowed values. Enforce that Score is null unless State is Tried.
  Star and Heart default false and do not depend on State.
- Add fields without rewriting existing Verdict data. Existing recipes start
  with no Score, Star, or Heart; in particular, Verdict = “Favorite” does not
  infer Heart.
- Reuse recipe ownership and RLS. A non-owner, unauthenticated user, or
  trashed recipe cannot change Star or Heart. Public reads remain allow-listed.
- Every changed marker increments the recipe version and creates a history
  event. A stale expected version returns the established conflict experience;
  use the project's PostgREST conflict status convention for new RPC writes.
- Reject invalid Score values explicitly. A marker or Score write failure must
  not appear successful; preserve the prior persisted state and allow recovery.
- Verify bundle compatibility and a backup/rollback path before applying a
  destructive downgrade after new values have been written.

## Acceptance criteria and tests

- Database tests verify allowed Score values, Tried-only storage, marker
  defaults, owner RLS, trashed-recipe rejection, version conflicts, history,
  and that existing Verdict data is unchanged.
- Recipe-editor tests verify all nine numeric Score choices, clearing on State
  change, validation, numeric accessible names, and explicit Save behavior.
- Browser tests verify immediate Star and Heart stamp updates, independent and
  simultaneous pressed states, owner-only access, conflict/error recovery,
  visible off/on distinction, descriptive accessible names, visible focus, and
  mobile/desktop toolbar geometry.
- Recipe-list tests verify ⭐ and ❤️ columns are initially visible in every
  recipe-list explorer, can be independently hidden and restored, and retain
  the owner's saved visibility choice. They also verify active-only custom
  stamp indicators, right alignment in List, and top-right stacking in Grid.
- Search tests verify emoji-only visible quick-filter labels in Find and
  publication recipe lists, each filter, both filters combined with AND,
  interaction with existing filters and publication scope, URL/reload behavior,
  and reset/clear behavior.
- History and import/export tests verify all three fields round-trip and that
  older bundles default to unset Score and off markers.
- Public projection and output tests prove Score, Star, and Heart never appear
  in guest payloads or public HTML, print, PNG, or PDF output.
- Test responsive geometry around every toolbar reflow boundary and at an
  intermediate mobile width. Run focused browser, database, accessibility,
  unit, type, lint, and build checks before completion.

## Confirmed interaction details

- Score changes are staged with recipe edits and saved through the existing
  explicit Save action. Its choices and accessible names remain numeric.
- Star and Heart detail controls use custom stamp artwork as immediate,
  accessible toggles; Find and publication recipe filters remain emoji-labeled.
- Active stamps are visible in every private recipe List and Grid view. List
  indicators align right; Grid indicators stack at the top-right. Inactive
  markers are not drawn in those views.
- The ⭐ and ❤️ List columns are visible by default but independently
  optional; saved per-explorer visibility overrides that default.
