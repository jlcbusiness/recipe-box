# DLC 13: Advanced Rules expressions

**Status:** Implemented and locally verified; hosted migration is not applied.

Replace the nested-group builder with a numbered rule list and an optional
Boolean expression. Keep the existing field/operator/value rule editor.

## Outcome

A person can combine existing Query rules with parentheses, AND, OR, and NOT
without constructing nested groups in the UI. Ordinary Query remains an
all-rules-AND workflow when no advanced expression is supplied.

## Scope

- Number Query rules by default, including the ordinary rule editor.
- On mobile, show each number beside a right-pointing caret that expands its
  row to content-sized fields which wrap. Rotate the caret downward while
  expanded; tapping it restores the compact row, where long Value
  labels truncate to one line. Hide the Value trigger's checkmark while closed
  but retain checks in the open menu. Give the expanded Operator at least 1mm of
  internal horizontal padding on both sides. Keep a 1mm gap between the number
  control and Field.
- Add an **Advanced Rules** link on the row below Query actions. On mobile,
  right-align it beside the expression above the rule rows; if the expression
  does not fit beside the link, place it below and wrap it as needed. When
  sharing a row, vertically center the link text with the expression and its
  remove X while preserving their mobile touch targets.
  In Details only, place the **Don't auto-select columns** checkbox opposite
  it. Keep the shortened mobile checkbox opposite Advanced Rules on that row.
  List and Grid do not auto-select columns and do not show the checkbox. On
  mobile, shorten the Details checkbox label to **Don't add cols.**
- Open a viewport-bounded pane with a numbered, read-only list of the current
  draft rules and a labeled expression text field.
- Accept case-insensitive `AND`, `OR`, and `NOT`, plus `&&`, `&`, `||`, `|`,
  `!`, `-and`, `-or`, and `-not`. These are Boolean aliases, not bitwise
  operations. Parentheses explicitly group operations.
- Provide Add, Cancel, Clear, and a close `X`, with keyboard, pointer,
  outside-click, focus containment, and focus-return behavior.
- Display the accepted expression verbatim in italics to the right of the link
  on desktop with matching font size and bottom-aligned text; align both text
  bottoms with the **Don't auto-select columns** label. Vertically center the
  expression's remove `X` and checkbox with their respective text. On mobile,
  show the link on the same row as the expression when space allows. Do not
  expand the expression into rule prose.
- Place a floating remove `X` immediately to the expression's right, with a
  2mm gap, a descriptive accessible name, and keyboard/touch operation.
  When the expression wraps below the link on mobile, use the full row width,
  right-align the text against the `X`, and align the `X` with ordinary rule
  remove controls.
  Removing it clears staged advanced logic, not the rule rows or current
  results.
- Preserve exact expression spelling, operator aliases, case, and spacing in
  URLs and remembered state, except for rule-number references compacted on
  Apply by stable ID. Bind execution references to unique rule IDs, not
  display positions. Keep legacy flat URLs and state compatible.
- Carry the effective expression through sorting, view changes, pagination,
  Details facets, and last-used state. Applying a changed query resets page one.
- Retain field/operator validation and authenticated owner scoping.

Named views, a visual group builder, new field operators, and Library Query
are excluded. DLC 14 remains responsible for named-view lifecycle.

## Closest working patterns and requested delta

- [RecipeFilterBuilder](../../../../src/app/recipes/find/recipe-filter-builder.tsx)
  owns staged field/operator/value rows, Clear all, and query submission.
  Preserve those controls and their compact responsive layout; add numbering
  and the optional expression rather than replace the editor.
- [NutritionPane](../../../../src/app/nutrition/nutrition-pane.tsx) provides
  a portal modal with initial focus and viewport-aware behavior. Reuse suitable
  pane styling and dismissal mechanics, not its nutrition-specific data flow.
- [RecipeSearchToolbar](../../../../src/app/recipes/find/recipe-search-toolbar.tsx)
  owns View, Sort, and direction; the adjacent
  [column chooser](../../../../src/app/explorer-list-preferences.tsx) belongs
  to the same control group.
- [Recipe search browser tests](../../../../tests/e2e/recipe-search.spec.ts)
  already cover staged Query controls, compact mobile geometry, and automatic
  column selection. Extend their observable contracts.

These patterns fit the workflow. The current ten-rule limit and flat search
RPC are implementation evidence, not proof that expression execution exists.
The existing local Supabase stack was reused without resetting it. Verification
ran against the local test server on port 3001 with isolated synthetic owners.

## Reviewed behavior

- Use conventional precedence: parentheses, then NOT, then AND, then OR.
  Include one short example, such as `(1 AND 2) OR NOT 3`, and precedence help.
  No implicit operators, code evaluation, field names, or arbitrary functions.
- Keep each rule's number stable while edits are staged. Deleting a rule leaves
  a **Rule deleted** placeholder in its numbered position; later rules and the
  expression text do not shift. New rules append after the highest existing
  number. On mobile, preserve the ordinary rule number column and row height;
  center the placeholder label vertically in the reserved slot. Bind
  expression references to unique rule IDs and validate numbers against active
  and deleted slots so a deleted reference cannot retarget a different rule.
  On Apply, compact the active rules and update expression numbers by stable
  rule ID while preserving surrounding text and aliases. Editing ordinary
  rule values retains identity.
- Require every existing rule to appear at least once in a nonblank expression.
  Repeated references are allowed. Missing/deleted references and omitted
  rules produce explicit validation messages rather than silently ignoring
  rules or inserting an unrequested AND. List every unused rule number
  explicitly in the error text. When a deleted slot is referenced, show
  “Remove or replace the deleted rule.” beneath Advanced Rules and immediately
  in the pane; center the message on mobile with next-line spacing, and do not
  repeat the number because its deleted slot is labeled.
  Highlight each deleted number red in both the builder summary and editable
  expression until corrected.
- Pane Add validates and stages the expression in the Query form. The main
  query apply runs all staged rules and logic together. After the first Query
  submission, highlight changed field controls and changed expression text in
  pale yellow, and provide visually hidden “changed, not yet applied”
  descriptions to screen readers. Keep the entered expression spelling intact
  while edits are staged. Show each deleted rule as **Rule deleted** in its
  original numbered position in the builder and pane, with a hidden description
  that says the deletion is pending and references may need repair. Keep these
  indicators until the main query is applied, then clear them. Preserve the
  submitted-once state even when the applied query is empty.
- Pane Clear empties only its draft expression; Add commits that change
  back to ordinary all-rules-AND behavior. Cancel, X, Escape, and outside-click
  discard pane edits. Closing returns focus to Advanced Rules.
- Query Clear all clears both staged rules and staged advanced logic without
  changing results until main apply. Result Clear all clears applied refinements
  as it does today. Leaving Query clears its rules and advanced logic.
- Invalid drafts keep their text and show a specific inline error, including
  the offending token or missing rule number. Do not submit or silently fall
  back to AND. An empty expression is valid; a nonempty expression without
  rules is invalid.
- Auto-select matching List columns only when applying Query in Details, with a
  Details-only opt-out checkbox. List and Grid neither auto-select columns nor
  show the checkbox. Keep each Query field eligible for auto-selection when it
  has a matching List column.

### Separate mobile toolbar correction

Apply the account Hand preference to Find's Search and Query result controls.
Left order is View, Sort, direction, Choose columns; Right mirrors
it to Choose columns, direction, Sort, View and aligns the group right.
Details continues to omit Sort and direction. Preserve attached borders,
chooser adjacency, readable icons, viewport-bounded menus, and matching
keyboard order. Mirror control placement, not text or directional icon meaning.
Desktop and publication/Library toolbars are outside this correction.

## Data and failure boundaries

- Parse a small expression grammar into validated Boolean nodes referencing
  stable rule identities. Never execute the text as JavaScript or interpolate
  it as SQL. Validate again at the public database/RPC boundary.
- Evaluate the expression in the database before count, sort, and pagination;
  client-side filtering of a fetched page is not acceptable.
- Make each leaf a definite Boolean using the existing filter's matching
  semantics. NOT complements that match, including nonmatches caused by
  unavailable values; verify this explicitly against database NULL behavior.
- Owner, active-record, and fixed publication-scope constraints are outside
  the expression and cannot be negated. Independent column filters still
  combine with the complete expression using AND.
- Version query serialization and remembered-state validation. Old flat input
  means AND; malformed advanced input produces an explicit recoverable error.
  Do not alter stored column preferences or create named-view tables.
- Bounds: ten rules, at most 1,024 expression characters, 256 tokens,
  16 parenthesis levels, and 65,536 UTF-8 bytes per serialized envelope.
  Enforce equivalent limits at every input boundary and test exact boundaries.
- Verify query plans for representative OR/NOT and nutrition predicates.
  Preserve facet meaning under advanced expressions instead of dropping
  arbitrary leaves to compute counts.

## Acceptance and automated verification

| Observable outcome | Verification |
| ------------------ | ------------ |
| All aliases and precedence execute correctly, including `(1 AND 2) OR (3 OR 4)` and NOT | Parser unit cases and database truth-table fixtures |
| Unsupported tokens, incomplete syntax, missing references, omitted rules, and bounds fail explicitly; deleted expression numbers are visibly red with an actionable error | Unit and direct RPC boundary cases; assert limits and limit-plus-one plus browser error/highlight behavior |
| Rule slots and expression references remain stable while staged; Apply compacts active rules and updates ID-bound references | Component and browser edit/remove/add/apply journeys |
| Add/Clear/Cancel, expression removal, and every dismissal preserve staged versus applied state | Component and browser tests, including unchanged results before main apply |
| First submission gates yellow staged-change highlights; field/expression edits and deleted rules have accessible pending descriptions, and applying clears them | Browser tests for initial, changed, deleted, empty-query, and applied states; assert `aria-describedby` and hidden descriptions |
| Flat queries and old URLs keep their existing results | Search regression and remembered-state compatibility tests |
| Expression spelling and meaning survive URL/state round trips and navigation | Serialization unit tests and sort/view/page/reload browser journeys |
| OR/NOT preserve owner, active-record, pagination, counts, and facet correctness | Isolated multi-owner database fixtures with more than one page |
| Rule numbering, italic expression placement, and abbreviated label meet the contract | Desktop/mobile screenshots plus wrapping/overlap/overflow geometry assertions |
| Pane remains operable with keyboard and touch, including a mobile keyboard | Browser focus, Escape, outside-click, accessible-label, visible-focus, and contrast checks |
| Both mobile hand settings mirror the complete attached control group | Search/Query tests in Details/List/Grid; assert geometry, tab order, menu bounds, and unchanged desktop |

Inspect narrow mobile, an intermediate wrapping width, desktop, and widths
immediately around reflow boundaries using representative long rule values
and expressions. Run focused tests, typecheck, lint, build, and measured query
checks before recording delivery as complete.

## Verification and implementation notes

- [Parser tests](../../../../tests/unit/query-logic.test.tsx) verify aliases,
  precedence, exact limits, text retention, sparse/deleted slots, ID-bound
  apply-time renumbering, broken references, serialization, state validation,
  and auto-column selection.
- [Browser acceptance](../../../../tests/e2e/advanced-rules.spec.ts) verifies
  Add versus apply, all dismissal controls, cyclic keyboard focus, Clear and
  expression removal, unused-rule errors, actual recipe matches, sort/view
  navigation, remembered state, deletion recovery, malformed URL repair,
  and both mobile hand settings including keyboard order and menu bounds.
- Screenshots and geometry checks cover 320, 640, 719, 720, 721, 900, and
  1,280px widths. A simulated keyboard visual viewport verifies pane bounds.
  Numbering required updating the old mobile Field-at-row-left assertion;
  it now asserts the number rail and its 1mm separation from Field.
- [Database acceptance](../../../../scripts/test-dlc13-advanced-rules.mjs)
  covers aliases, precedence, unknown-value NOT, leaf validation, owner and
  publication isolation, exact token/text/nesting/UTF-8 boundaries, facets,
  external filters, remembered state, and pagination. Local migration
  `20261212000000` was applied without a database reset.
- A 110-recipe query-plan fixture returned 100 rows and verified the second
  page of ten. Parent verification measured OR/NOT at 27.207ms and nutrition
  at 58.875ms execution, with no shared-buffer reads. The search RPC's
  Function Scan hides internal nodes; these are local end-to-end measurements,
  not a production-scale guarantee. Existing owner/publication, search-vector,
  ingredient, and nutrition indexes were reviewed; no new indexes were needed.
- Test owners and their records are deleted after verification. No hosted
  migration, account reset, or fixture-baseline reset was performed.

Physical mobile-keyboard behavior and hosted deployment remain unverified.
The automated visual-viewport simulation is not a physical-device test.
The stylesheet retains 33 baseline Biome specificity/important warnings;
this slice adds none.
Named views remain DLC 14; the visual group builder is intentionally excluded.

Final local checks passed: 519 unit tests plus eight bootstrap tests,
24 focused browser cases (two intentional project-specific skips), database
acceptance, typecheck, production build, implementation lint, and lint for
all nine updated product documents. The final six slice browser cases were
rerun after oversized-envelope error handling and stylesheet fixes.
Mixed envelope/flat Query URLs preserve all rules for explicit logic repair;
multiple envelopes require clearing the invalid query instead of silently
dropping criteria.

## References

- [Find recipes](../17-find-recipes.md)
- [Explorer state](../18-explorer-state.md)
- [Explorer preferences](../19-advanced-queries-and-saved-views.md)
- [Comprehensive reference: Queries](../../comprehensive-reference.md#7-queries-search-and-library-explorer)
- [Visual design: Find Recipes](../../visual-design.md)
- [Design philosophy](../../design-philosophy.md)
- [Data model](../../data-model.md)
- [Decision log](../../decision-log.md)
- [Saved views](dlc-14-saved-views.md)
