# DLC 10: Ratings and favorites

This brief revisits the current holistic Verdict and adds a distinct bookmark
concept. It requires a product decision before any data migration.

## Outcome

A person can rate a recipe using an explicit, consistent scale and separately
mark it as a favorite. Filtering, sorting, and recipe displays use each concept
without conflating them.

## Scope

- Define rating shape, range, labels, and whether ratings are optional.
- Define a boolean or equivalent favorite state and its default.
- Plan migration from existing Verdict values without discarding user intent.
- Update recipe forms, detail pages, compact lists, search filters, history,
  import/export, public projection, and list preferences.
- Preserve custom Verdict data until migration and rollback behavior are agreed.

## Decisions before implementation

- Decide whether Verdict is replaced, retained alongside ratings, or mapped to
  an initial rating. Some existing verdicts do not map cleanly to stars.
- Choose rating granularity and labels; do not assume a five-star scale.
- Decide whether favorites are private and owner-scoped or ever public.

## Acceptance

- Migration preserves original values and is reversible or has a verified
  backup/rollback path.
- Rating and favorite can be independently set, cleared, filtered, and exported.
- History and imports preserve both fields; public output follows the explicit
  allow-list decision.
- Database, migration, RLS, browser, search, history, and accessibility tests
  pass.

## References

- [Advanced queries](../19-advanced-queries-and-saved-views.md)
- [Decision log](../../decision-log.md)
