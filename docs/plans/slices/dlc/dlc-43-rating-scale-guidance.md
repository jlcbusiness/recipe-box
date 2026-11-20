# DLC 43: Rating Labels and Detail Control

**Status:** Implemented and verified; app version **1.16.0**.

## Outcome

An owner can set or clear a Tried recipe's Rating from recipe detail using a
compact hand-drawn control, and can understand the scale from its choice labels.
The stored signed score and its meaning remain unchanged.

## Product contract

- Keep the optional `score` values exactly `-5`, `-3`, `-1`, `0`, `1`, `2`,
  `3`, `4`, and `5`. The labels change the wording, not the intended sentiment
  or score intensity:

  | Score | Picker label |
  | ---: | --- |
  | `-5` | `NO` |
  | `-3` | `Bad` |
  | `-1` | `Needs work` |
  | `0` | `Eh` |
  | `1` | `Okay` |
  | `2` | `Decent` |
  | `3` | `Good` |
  | `4` | `Great` |
  | `5` | `Amazing` |

  The intended negative intensity remains `-1` mild dislike, `-3` definite
  dislike, and `-5` emphatic dislike; zero remains neutral.

- Keep Rating optional and available only for Tried recipes. Changing State
  away from Tried continues to clear the saved score and hides the control.
- The view-mode control is the only Rating edit path. Remove the staged Rating
  field from the recipe editor; do not allow an immediate detail change to
  conflict with an unsaved Rating draft.
- Keep score values numeric in storage, history, bundles, filters, sorting,
  and recipe-list displays. Do not change the database constraint or infer
  Rating from Verdict, Star, or Heart.
- Rating stays private owner data. Do not add it or the control to public
  recipe projections or public output.

## Interaction and presentation

- In private recipe detail, place the Rating button immediately after Heart
  and before Share. On mobile, keep Star, Heart, and Rating in that order on
  the marker row. It replaces the existing standalone Rating value in
  on-screen detail metadata so the score is not shown twice. Keep Rating in
  eligible private print output as a numeric value; the screen-only button is
  not printed.
- Use vector hand gestures, not platform-dependent emoji glyphs:
  - Unrated/cleared: an unfilled yellow thumbs-up with a question mark
    centered in the palm.
  - Positive: a thumbs-up with the selected score as unboxed text in the palm.
  - Zero: the filled Lucide `Hand` glyph turned palm-down, with `0` centered in
    the palm.
  - Negative: a thumbs-down with the selected signed score as unboxed text in
    the palm.
- Center the complete signed value, including its minus sign, in a palm-sized
  overlay; do not position the text from a fixed left edge. Positive text sits
  slightly above its previous position.
- Keep the number readable at desktop and mobile control sizes. Use a light,
  tone-matched fill across each complete hand silhouette except the
  unfilled cleared/unrated thumbs-up. The hand is a supplementary sign cue;
  the signed number remains explicit and color is not the sole indication of
  value. Use contrast-safe positive, negative, and neutral line colors against
  both paper surfaces, without tracing the hand contour twice.
- Activating the button opens the nine choices from `5` at the top to `-5` at
  the bottom, using the exact labels in the table above. Selecting a choice
  saves it immediately. A separate text-only `Clear` action appears at the
  bottom of the picker and returns the recipe to the unfilled yellow thumbs-up
  with a question mark. Size the picker to its contents, use 5px horizontal
  padding on each side of its entries, and keep each label on one line.
- The trigger and choices work by keyboard, pointer, and touch. Provide visible
  focus, return focus to the trigger when the picker closes, and expose the
  current score and label to assistive technology (for example, “Rating: -3,
  Bad”). The Clear action must be distinguishable from a score choice.
  In the picker, tint positive and negative numeric values and their labels
  with slightly darker shades of their associated green and red hand line
  colors. Right-align only the integer values; keep labels centered, and keep
  Clear centered with the other labels. Give the desktop picker 10px of left
  margin and keep it centered on narrow screens. Shift only the `Needs work`
  label slightly right so it balances the gaps to `-1` and its checkmark. Use
  stronger-yellow text for zero and Clear, and keep the picker fitted to
  compact content.
- Match the established detail toolbar's compact desktop controls and mobile
  touch targets. Route pending, success, and error messages through the shared
  action-feedback region below the action row, right-aligned beneath the
  controls with 4px of vertical spacing, so they do not shift page content.
  Dismiss successful feedback after five seconds; keep pending feedback while
  saving and error feedback until the next action.
  On mobile, keep the photo gallery just below the feedback text and leave the
  feedback background transparent.

## State and failure behavior

- Rating writes are immediate, owner-scoped, validated against the nine allowed
  values, version-checked, and included in recipe history. Clearing writes
  `null` under the same rules. Return the project's PostgREST conflict status
  for stale versions so the UI can show its established conflict treatment.
- Reuse the version-conflict and recoverable-error treatment of the existing
  detail marker actions. A pending write disables further Rating choices.
- On validation, authorization, network, or version-conflict failure, do not
  present the requested value as saved. Preserve the persisted value, show a
  recoverable message, and let the owner retry or reload as appropriate.
- State changes away from Tried continue to clear Rating through the existing
  recipe-save path. The detail action must reject writes for non-Tried recipes.

## Scope and coordination

- Replace the numeric Rating editor field and read-only detail value with the
  immediate detail control. Add an owner action and an atomic database RPC
  that validates the value, checks ownership and the expected version, writes
  the score or `null`, and records history. No score-column schema change is
  expected.
- Preserve existing numeric Rating behavior in Search, Query, filters, sorting,
  list/grid indicators, bundles, and private output.
- DLC 43 owns the Rating labels and detail control. DLC 44 may reduce recipe
  detail metadata, but must not define or add a second Rating editor or control;
  its implementation should reuse this contract.
- Before implementation, reconcile the Rating wording and detail presentation
  in the comprehensive reference, DLC 10, DLC 44, and visual design guide with
  this brief. Keep public-data exclusions intact.
- Star and Heart behavior, their artwork, Verdict, and all unrelated recipe
  metadata remain unchanged.

## Acceptance criteria

1. The picker offers exactly the nine score/label pairs in the table, in score
   order; the saved `score` remains the corresponding unchanged integer.
2. A Tried recipe owner can set, replace, and clear Rating from detail without
   opening Edit. The value survives reload and appears in existing numeric
   Rating surfaces.
3. The detail toolbar shows one Rating control after Heart and before Share; it
   does not also render a standalone on-screen Rating metadata value. Private
   print keeps its existing numeric Rating behavior.
4. The filled hand appears palm-down for zero; unrated/cleared uses an
   unfilled yellow thumbs-up with a question mark. Positive and negative states
   show the correct artwork and readable score centered in the palm, including
   the complete negative value.
   The glyph is vertically centered within its toolbar row.
   Positive linework is vivid light green, negative linework is red, and
   neutral and unrated linework is warm yellow, with contrast preserved.
5. Rating writes and clears create owner-scoped, version-checked history
   changes. Stale, invalid, unauthorized, or failed writes do not appear
   successful; conflict and recovery feedback is visible and accessible.
6. Rating is unavailable outside Tried, and leaving Tried clears it. Verdict,
   Star, and Heart are not changed by Rating updates.
7. Keyboard, visible focus, screen-reader, pointer, and touch interaction work.
   The picker and toolbar remain usable without overflow at representative
   desktop and mobile widths.
8. Existing numeric list, search, filter, sort, bundle, and private-output
   behavior remains intact, and public recipe payloads and output still omit
   Rating.

## Tests and verification

- Update the Rating coverage in `tests/e2e/recipes.spec.ts` for the label map,
  toolbar placement, metadata replacement, menu selection, clearing, and
  desktop/mobile geometry.
- Add focused action and history coverage for valid values, `null`, owner
  authorization, Tried-only validation, stale versions, and failed writes.
- Verify keyboard navigation, focus return, accessible value/label, visible
  focus, and touch targets. Verify that the menu's Clear action cannot be
  mistaken for a score.
- Retain or update existing checks for numeric search/list presentation,
  filters, sorting, bundles, and public projections; do not weaken their
  privacy assertions.
- Run the focused browser and action/database tests, then type, lint, and build
  checks. Visually inspect the hand artwork and toolbar at representative
  desktop and mobile sizes, including the narrowest supported layout.

## Implementation and verification

- Added the private detail Rating control and owner-scoped `set_recipe_rating`
  action/RPC. The RPC validates the allowed values, Tried state, owner, and
  expected version; score changes and clears use the existing recipe history.
- Removed the staged Rating editor while preserving the saved score during
  unrelated edits. Leaving Tried still clears it. Detail shows only the hand
  control on screen and retains numeric Rating in eligible private print.
- Updated the comprehensive reference, DLC 10, DLC 44 coordination, and visual
  design contract before implementing this behavior. Public projections remain
  unchanged.
- Refined the artwork after visual review: use Lucide `ThumbsUp` and
  `ThumbsDown` with the filled hand silhouette for zero and an unfilled yellow
  `ThumbsUp` with `?` in the palm when unrated. Center scores inside
  gesture-specific palm overlays, keep score text slightly darker than the
  icon, and vertically center the glyph in the toolbar row. The picker lists
  `5` first and `-5` last.
- The focused Chromium Rating UI and RPC/history tests pass. They cover labels,
  descending score order, gesture mapping, score-in-palm placement,
  set/replace/clear, numeric list data, owner and Tried validation, stale
  versions, history, keyboard focus, and desktop/mobile toolbar geometry.
- The focused Rating UI, RPC/history, and public-output tests passed (3 tests).
  `npm run typecheck`, the targeted Biome check, and `npm run build` passed.
- Screenshots were inspected at 1280px and 320px; the open menu shows `5` at
  the top, `-5` at the bottom, and Clear afterward.
- Repository-wide `npm run lint` still reports two formatter errors in
  untouched files: `src/app/styles/recipe-instruction-display.css` and
  `src/lib/recipes/measurement-rules.ts`. The updated Rating and workstream
  Markdown passes; repository-wide Markdown lint reports 35 errors, including
  the unrelated DLC 39 entry in `docs/plans/decision-log.md`.

## References

- [DLC 10: Recipe ratings, stars, and hearts](./dlc-10-ratings-and-favorites.md)
- [DLC 44: Recipe Detail Metadata and Rating](./dlc-44-recipe-detail-metadata-and-rating.md)
- [Recipe card and metadata reference](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Visual design guide](../../visual-design.md)
- [Decision log](../../decision-log.md)
- [Recipe detail page](../../../../src/app/recipes/[id]/page.tsx)
- [Recipe form](../../../../src/app/recipes/recipe-form.tsx)
- [Recipe actions](../../../../src/app/recipes/actions.ts)
- [Recipe marker actions](../../../../src/app/recipes/recipe-marker-actions.tsx)
- [Recipe browser tests](../../../../tests/e2e/recipes.spec.ts)
