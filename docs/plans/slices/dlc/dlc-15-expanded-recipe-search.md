# DLC 15: Expanded recipe search

This brief extends recipe discovery beyond current full-text and structured
filters. Search behavior must remain private and owner-scoped by default.

## Outcome

People can find recipes by supported ingredient aliases, references, and
misspellings; public search is added only if its privacy and indexing policy is
explicitly approved.

## Scope

- Support canonical ingredient aliases and match them in recipe search.
- Evaluate typo-tolerant and infix matching with bounded query cost.
- Add recipe Reference search with type-aware behavior.
- Decide whether OCR is feasible for uploaded images and what user controls
  govern indexing and corrections.
- Evaluate a public-search index separately from private authenticated search.
- Reuse the advanced query contract from DLC 13 where appropriate.

## Decisions before implementation

- Define alias ownership, uniqueness, conflict resolution, and migration.
- Benchmark fuzzy matching against expected data volume and available indexes.
- Confirm OCR privacy, retention, language support, correction, and deletion
  behavior before processing private images.
- Approve whether public recipes are indexed by this app or external search.

## Acceptance

- Search results are deterministic, paginated, and owner-isolated.
- Alias changes update search results without rewriting recipe text.
- OCR content is never exposed or retained outside the approved lifecycle.
- Query plans and latency are tested at representative scale.
- Unit, database/RLS, search, privacy, browser, and accessibility tests pass.

## References

- [Find recipes](../17-find-recipes.md)
- [Images](../12-images.md)
- [Public links](../22-public-links-and-privacy.md)
