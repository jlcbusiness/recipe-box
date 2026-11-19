# DLC 49: Made Counter and Last-Made Stamp

**Status:** Draft candidate. Resolve day-boundary, history, and display details
before implementation.

## Outcome

An owner can mark a recipe as made once per calendar day. The control displays
the total count, and the recipe retains the most recent make date/time.

## Scope

- Add a private Made control to the private recipe detail view.
- Show the integer count in the center of the control.
- Record the latest successful make timestamp and increment the count no more
  than once in a calendar day.
- Keep this information out of public recipe projections and shared public
  output.
- Do not add a full cooking journal, per-attempt notes, search filters, or
  publication-list columns in this slice.

## Proposed behavior

- The owner can activate the control once per calendar day. After a successful
  mark, it indicates that today's mark has been used and becomes available
  again on the next calendar day.
- Store the count and last-make timestamp in an owner-scoped write. Enforce
  the once-per-day rule atomically on the server so double taps, retries, or
  concurrent requests cannot increment twice.
- Show the latest date/time near the control in quiet text. A tooltip may
  supplement that text but should not be the only way to discover the date.
- Keep existing recipe controls and save flows unchanged; a Made mark is a
  dedicated immediate action.

## Data, privacy, and history

- Add an integer count and nullable timestamp, with validation that prevents a
  negative count and inconsistent first-use state.
- Do not include these fields in public recipe copies, public readers, or
  anonymous projections. Verify they remain owner-isolated in database access.
- The proposed default is to include the fields in the owner's database,
  publication, and recipe backups so a restore does not erase the count.
- Decide whether each successful daily mark creates a recipe history entry.
  The feature stores only the total and latest timestamp; a complete
  date-by-date cooking log is out of scope.

## Acceptance criteria

1. A first successful mark increments the count and records a timestamp.
2. A second activation on the same calendar day does not increment the count
   or replace the timestamp.
3. A new calendar day permits one new increment; the count and timestamp
   survive reload and remain correct after concurrent/retried requests.
4. The count is centered in the control, and the last-make date is available
   as visible, unobtrusive text.
5. Public projections and outputs never contain the private fields; owner
   backup/import behavior matches the approved contract.
6. Tests cover owner isolation, idempotency, calendar boundaries, database
   failures, and inaccessible or stale client state.

## Open decisions

- Define a “day”: the owner's local calendar day, a fixed account timezone, or
  UTC. The proposed interaction is once per local calendar day, but the
  implementation needs a reliable timezone rule.
- Decide whether the successful mark belongs in recipe history.
- Confirm whether the latest date/time should use visible nearby text, a
  tooltip, or both, and what precision to show.
- Confirm whether the count and latest timestamp are included in every owner
  backup/export scope.

## Initial sizing

High difficulty; about **4–7 days**; high churn. The UI is small, but the
date-aware idempotent write, privacy boundary, history, and backup contract
need coordinated database and application changes.

## References

- [DLC 10: Recipe ratings, stars, and hearts](./dlc-10-ratings-and-favorites.md)
- [Recipe card and metadata reference](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Data model](../../data-model.md)
- [Import/export and history reference](../../comprehensive-reference/07-import-export-and-history.md)
- [Recipe detail page](../../../../src/app/recipes/[id]/page.tsx)
- [Recipe actions](../../../../src/app/recipes/actions.ts)
