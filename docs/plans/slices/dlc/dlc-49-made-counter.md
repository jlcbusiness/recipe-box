# DLC 49: Made Counter and Last-Made Stamp

**Status:** Implemented; app version 1.21.0.

## Outcome

An owner can record that a recipe was made, at most once per calendar day in
the current device's timezone. Private recipe detail shows the total count and
when it was most recently made except while State is Will not try, when both
are hidden. While State is Want to try, show Made as zero and Last Made as
empty while keeping previous values stored until the first successful Made
tap. Find Search and Query can filter by Made count and Last Made date.
Both are optional, filterable columns hidden by default in Find and
publication-specific recipe lists. The Last Made column shows the local date
only; private detail otherwise retains the local date and time.

## Scope and dependencies

- Add a private Made action and visible count/date-time information to private
  recipe detail, suppressing both while State is Will not try and showing zero
  with no Last Made date while State is Want to try. Retain prior values in
  storage until the first successful Made tap commits the reset. Revisit the
  responsive composition established by DLC 44 without changing its other
  metadata-visibility rules.
- Store an integer count and nullable last-made timestamp on the recipe.
- Add Made count and Last Made date as structured fields in Find Search and
  Query, plus optional filterable columns in Find and publication-specific
  recipe lists, hidden by default. Made count uses numeric operators; Last Made
  uses explicit-date operators and empty/not-empty checks, interpreted in the
  current device's timezone to match the displayed local date. Rolling
  relative-date operators are not in scope.
- Changing State to Tried initializes Made to one if the recipe has no Made
  count yet. The Made action remains unavailable while State is Will not try.
- A duplicate of a Tried recipe starts as Want to try with Made zero and no
  timestamp, applying the existing conditional-State clearing rules.
- Keep both fields out of public projections and every shared public output.
- Include the fields in all three owner backup/import scopes.
- New duplicates and newly saved public copies start with zero Made count and
  no last-made timestamp. A duplicate of a Tried recipe resets State to Want
  to try and clears Tried-only conditional values; other duplicate State
  behavior remains unchanged. Importing/restoring the same bundled recipe
  restores Made values included in the bundle. If an older bundle lacks those
  fields, a same-recipe restore preserves the destination's current Made
  values.
- Do not add a date-by-date cooking journal, per-attempt notes, free-text
  search matching, or rolling relative-date filters.

## Existing patterns to preserve

The closest working reference is the private detail toolbar's Star, Heart, and
Rating actions. They are immediate owner-scoped writes with optimistic-version
checks, accessible names, recoverable error handling, and compact responsive
controls. This pattern fits the ownership and action flow, but does not solve
the new count, daily availability, or visible last-made timestamp.

The user-selected layout is a stew-pot glyph with the count centered in it,
after Rating and before Share. Keep the visible frame the same size as the
other action buttons and widen it as needed to fit the entire count. Keep the
count centered and readable; never shrink, clip, or abbreviate it. On desktop,
keep the visible gaps even across Star, Heart, optional Rating, Made, and Share
while preserving the existing control frames. Show the
latest local date and time as visible text near the control, not only in a
tooltip, except while State is Will not try. In that state, cross the pot out
with the red `✘` glyph and show no count or latest date/time; the control
remains disabled. Keep the stored Made values unchanged so they can be shown
again if State returns to Tried.

The current toolbar code and tests cover desktop/mobile geometry and stale
action feedback. The integrated browser could not render the signed-in recipe
detail during preparation (`localhost:3000` refused the connection and
`localhost:3001` showed only the offline recipe list). Recheck the live detail
screen before implementing the UI.

## Agreed behavior

- Store `made_count` as a nonnegative integer (default zero) and
  `last_made_at` as a nullable absolute timestamp. Zero count requires a null
  timestamp. State Tried requires a count of at least one. A positive count
  may have a null timestamp only for legacy records whose last-made date cannot
  be recovered; new Made marks always record a timestamp.
- The invoking device's IANA timezone defines the local calendar day for that
  request. The client supplies its current timezone; the server validates it,
  uses its own clock for the timestamp, and atomically enforces the daily rule.
  No timezone preference is added. A timezone change or another device can
  therefore change which local date applies.
- The database write locks/checks the owner-scoped active recipe. Concurrent
  calls and retries for the same recipe and local day never increment twice
  or replace the first timestamp. A same-day repeat returns persisted state;
  an unmarked stale recipe version uses the established conflict response.
- A successful first mark changes State to Tried in the same transaction and
  applies existing conditional-value clearing rules when the starting State is
  Want to try. From Want to try, the first successful mark resets Made to one
  and records that mark's timestamp, regardless of preserved values; a
  same-day timestamp from before the state change does not suppress the mark.
  Returning to Tried before the Made action restores prior values. Saving a
  State change to Tried initializes a zero Made count to one and records the
  server timestamp; it does not increment a positive count. The control is
  disabled for Will not try recipes, so the Made action never clears their
  Reason; the owner must change State manually first. A same-day no-op makes
  no further recipe changes.
- A new eligible local calendar day permits one new mark. The client makes
  availability and the "marked today" state visible, including after reload
  and when a detail page remains open across the day boundary.
- To test daily limits without waiting, keep the time parameter on a private
  database helper. The owner-facing RPC accepts no timestamp and always passes
  the database clock. Revoke helper execution from `PUBLIC`, `anon`, and
  `authenticated`; SQL tests run as `postgres` and call the helper with fixed
  instants. Do not add a client-controlled timestamp or test-clock override.
- Center the exact count over the pot body, not the full glyph; widen the frame
  as needed. Keep the 36px desktop frame and at least 48px mobile hit area. On
  mobile, place Made after Heart, with Rating after Made when present. When
  Rating is present, keep the visible gaps from the Heart control's outer edge
  to the Made pot and from the pot to Rating artwork equal within 1px by
  shifting only the glyph, not its trigger or 48px hit area.
  At mobile widths, align the pot's visible bottom edge with the bottom edge
  of the Heart control's outer border without moving the trigger or reducing
  its 48px hit area.
  At mobile widths, shift the complete Rating hand and in-palm mark 1px farther
  down together while keeping its 36px trigger fixed.
  Show the latest local date and time in italic text, right-aligned immediately
  above the action toolbar except while State is Will not try. Reserve its space
  so the toolbar does not shift when the first mark adds the date. Place action
  Made status messages below the toolbar with the same gap as the Last Made line
  above; on mobile, right-align the status across the toolbar width and leave
  enough space before the recipe photos to prevent overlap. The time display follows the
  current device timezone, so it may differ across devices. The Last Made
  column shows the local date only, without the time. Explicit Last Made date
  filters use that same current device timezone.
  On desktop, keep visible gaps 16px edge-to-edge between adjacent Star,
  Heart, optional Rating, and Made glyphs. From the Made pot outline to Share,
  measure 16px to the Share button's outer border without resizing the action
  frames; retain the existing mobile spacing.
- On a local day without a mark, show the pot as an outline with the jaunty lid
  open and the count centered over the pot body. After the first successful
  mark that day, increment the displayed count, preserve that mark's timestamp,
  close the lid, fill the pot brown with a high-contrast white count, and
  disable the action for the rest of the local day. Same-day retries do not
  increment the count or replace the timestamp. At the next local day
  boundary, automatically return the glyph to its outlined, open-lid, enabled
  state, even if the recipe detail remains open; Will not try remains disabled.
- For State Will not try, show a red `✘` glyph no larger than the pot,
  aligned to the full pot icon bounds with a 3px downward offset as a state
  cue, not as an action, and show neither
  count nor latest date/time. Keep the Made
  values stored unchanged; if State returns to Tried, show them again. Treat
  Made and Last Made as absent in private detail, Find Search/Query, and list
  columns: Made columns are blank and match no numeric comparison, while Last
  Made is empty. Both fields also sort as absent, never by their preserved
  values. Expose the disabled state and Reason accessibly; do not rely on the
  red color alone.
- For State Want to try, show Made as zero and Last Made as empty in private
  detail, Find Search/Query, and list columns. Treat Made as zero for numeric
  filters and sorting, and Last Made as empty for filters and sorting, while
  retaining the stored values. The first successful Made tap resets count and
  timestamp to one and now; returning to Tried before that restores prior
  values.
- Every successful mark creates the normal recipe history event required by
  the roadmap's standing rule. The State transition and Made-field changes
  appear in that event together; a same-day no-op creates no event. This does
  not add a separate per-attempt journal.
- Made data is included in database, publication, and recipe ZIP exports and
  restored on import. History remains excluded from ZIPs under the existing
  contract. Existing Tried recipes are initialized to a count of one. Use the
  latest timestamped history transition into Tried when available; otherwise
  keep the timestamp unknown. Versions 1 through 15 default a new imported
  Tried recipe to count one with an unknown timestamp, and other states to
  zero/null. Duplicates reset Made values to zero/null; a duplicate of a Tried
  recipe also resets State to Want to try and clears Tried-only conditional
  values. A same-recipe restore restores values present in the bundle; if an
  older bundle omits Made fields, preserve the destination's current values.
- The Made action and latest local date/time are shown on private detail except
  while State is Will not try. While State is Want to try, show a zero count
  and no date but retain stored values until the first successful Made tap.
  The count and timestamp are also available as owner-only Find filters and
  optional columns: Want to try has Made zero and Last Made empty, while Will
  not try has both fields absent. They are never added to the public recipe
  allow-list, guest views, or public output. Private Print and
  standalone/download output remain unchanged.
- Find Search and Query expose Made count with numeric comparisons and Last
  Made with explicit calendar-date comparisons plus empty/not-empty operators.
  These are structured fields, not free-text search terms. “Not made since”
  can be expressed with a chosen cutoff date; date comparisons use the current
  device timezone so they match the displayed local date. Saved rolling
  windows are deferred. While State is Will not try, Made has no value and
  matches no numeric comparison; Last Made is empty, regardless of preserved
  stored values. While State is Want to try, Made filters and sorting use zero
  and Last Made filters and sorting use empty, regardless of preserved stored
  values. Sorting treats Will not try fields as absent. The
  optional Made and Last Made columns are hidden by default
  in Find and publication-specific recipe lists. Made uses the numeric column
  filter; Last Made uses date operators rather than a facet list of distinct
  timestamps. Applying Query in Find Details auto-selects matching columns
  under the existing behavior unless the user opts out; the columns remain
  hidden by default before that application. Publication-list filters remain
  scoped to their publication.

## Confirmed decisions

- The user confirmed the current-device timezone rule, the State transition
  from Want to try to Tried, all owner backup scopes, zeroed values for new
  copies, and the stew-pot count control after Rating and before Share.
- After considering the Reason-clearing consequence, the user specified that
  the Made action is disabled for Will not try recipes until State is changed
  manually.
- The user confirmed that private Print and standalone/download output do not
  include Made, and public outputs remain unchanged.
- The user added both Made fields to Find Search, Query, and filterable columns,
  with columns hidden by default in Find and publication-specific recipe lists.
  They selected explicit dates rather than rolling relative windows, and date
  operators rather than timestamp facets for the Last Made column.
- The user specified that changing State to Tried means Made is at least one.
  Duplicates of Tried recipes reset to Want to try. Existing/legacy Tried
  records may have an unknown last-made date when history cannot recover it.
- The user confirmed that explicit Last Made date filters use the current
  device's timezone, matching the local date shown in the column.
- The user specified that Will not try hides the Made count and timestamp in
  all owner-facing recipe views without clearing stored values. Made has no
  value for numeric filters and Last Made is empty in that state; returning to
  Tried restores the preserved values. Both fields sort as absent while hidden.

## Acceptance criteria and tests

1. A first mark increments once, sets the absolute timestamp, and changes State
   from Want to try to Tried while applying the existing conditional-value
   clearing rules. Any other transition to Tried initializes a zero count to
   one without incrementing an existing count. A Will not try recipe cannot be
   marked and retains its Reason until State is changed manually. Changing to
   Will not try hides Made values from owner views but does not clear them;
   changing back to Tried reveals the preserved values. Tried state requires
   count >= 1; zero count requires a null timestamp, while legacy positive
   counts may have an unknown null timestamp.
2. Repeating or concurrently retrying a same-day mark does not change the
   count or timestamp twice. A next-day mark in the current request timezone
   increments once. SQL tests invoke the private helper at controlled instants
   on the same local day and just after the next local midnight, including
   relevant timezone boundaries; no test waits for a real day to pass.
3. Owner authorization, active-recipe checks, invalid timezone input,
   stale-version conflicts, database failures, and inaccessible client state
   are explicitly tested; failed writes never display success or alter the
   displayed persisted count. The private clock helper is not executable by
   `PUBLIC`, `anon`, or `authenticated`, and the owner-facing RPC accepts no
   caller-supplied timestamp.
4. Every successful daily mark creates the normal recipe history event;
   same-day no-ops do not. No separate per-attempt journal is created.
5. The private control shows a centered exact count (including multi-digit
   values), a visible italic latest local date/time right-aligned above the action
   toolbar, keyboard operation, visible focus, an accessible name/status, and
   the used-today state. Made status messages appear below the toolbar with the
   same gap as the Last Made line above.
   The reserved Last Made line prevents the toolbar from shifting when the
   first mark creates the date. The control is outlined
   and enabled before today's mark, filled and disabled after the first mark,
   then automatically returns to outlined and enabled at the next local day
   boundary without requiring a reload. Desktop/mobile geometry is checked
   around relevant reflow boundaries and at an intermediate mobile width. For
   Will not try, show a red `✘` glyph no larger than the pot, centered on the
   full pot icon bounds with a 3px downward offset, with no count or date/time;
   hide
   the count and timestamp in owner-facing Find/Search/Query and columns too.
   Keep the values stored, leave Made columns blank with no numeric matches,
   and treat Last Made as empty. The disabled state and Reason are accessible
   without relying on color alone.
6. Public projections and public HTML, print, download, PNG, and PDF output
   never contain either field.
7. Export/import tests cover each owner scope, same-recipe restore (including
   an older bundle missing Made fields), duplicate state reset and conditional
   values, history-based legacy date recovery, unknown legacy dates, and
   state-aware defaults for new imports from older bundles.
8. Find tests cover both fields in Search and Query, the numeric/date
   operators, empty timestamps, and hidden-by-default columns. While State is
   Will not try, tests verify that Made matches no numeric comparison, Last
   Made is empty, list columns suppress both values, and sorting does not use
   the preserved values. Column-filter tests cover Find and
   publication-specific recipe lists, including publication scoping. Last
   Made uses explicit dates, not rolling relative windows; its list columns
   show the local date only. While Want to try, Made filters and sorting use
   zero and Last Made filters and sorting are empty despite preserved values;
   the first Made tap resets them, and returning to Tried before that restores
   them.
9. The brief, canonical references, decision log, and roadmap reflect only
   user-confirmed decisions and behavior verified by tests.

## References

- [Delivery roadmap](../../delivery-roadmap.md), Mandatory Slice Preparation,
  Standing Rules, and Completion Rule
- [Comprehensive reference](../../comprehensive-reference.md), §§ 2, 7, 9, 11,
  and 12
- [Recipe card and metadata](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Sharing and authentication](../../comprehensive-reference/06-sharing-and-accounts.md)
- [Import, export, and history](../../comprehensive-reference/07-import-export-and-history.md)
- [Data model](../../data-model.md), Ownership, Recipe, and History event
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md), private recipe detail toolbar
- [Decision log](../../decision-log.md), DLC 44 private-detail posture
- [DLC 10](./dlc-10-ratings-and-favorites.md), owner markers and action patterns
- [Recipe detail page](../../../../src/app/recipes/[id]/page.tsx)
- [Recipe actions](../../../../src/app/recipes/actions.ts)
- [Rating action](../../../../src/app/recipes/recipe-rating-action.tsx)
- [Marker actions](../../../../src/app/recipes/recipe-marker-actions.tsx)
- [Portable bundle format](../../import-export-format.md)
