# Slice 7: Instructions and Mentions

This brief defines ordered recipe instructions, Markdown editing, and structured
ingredient mentions. The product authority is [the comprehensive reference](../comprehensive-reference.md),
especially [§ 5, Instructions, Autocomplete, and Recipe Linking](../comprehensive-reference.md#5-instructions-autocomplete-and-recipe-linking).
Related boundaries are in the [first-draft specification](../first-draft-spec.md),
[data model](../data-model.md), [visual design guide](../visual-design.md),
[delivery roadmap](../delivery-roadmap.md), and [decision log](../decision-log.md).

## Outcome

A recipe owner can add and order Markdown instruction steps, type `#` to link a
step to an ingredient row or create a new ingredient row, and read the saved
instructions with linked ingredients rendered as natural readable text. A
confirmed mention remains linked to the same recipe ingredient row across saves
and ingredient reordering. Saves remain explicit, version-checked, owner-scoped,
atomic, and represented in recipe history.

## References and verified implementation constraints

- [Tiptap React integration](https://tiptap.dev/docs/editor/getting-started/install/react)
- [Tiptap custom Markdown tokenizers](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-tokenizer)
- [Tiptap Mention extension](https://tiptap.dev/docs/editor/extensions/nodes/mention)
- [Tiptap Suggestion utility](https://tiptap.dev/docs/editor/api/utilities/suggestion)
- The repository pins Tiptap packages at `3.31.4`; Slice 3 verified the stable
  marker syntax and round-trip behavior. Keep parser and serializer regression
  tests because Tiptap Markdown is an early-release extension.
- Next.js `16.3.8` ships the relevant App Router guidance under
  `node_modules/next/dist/docs/01-app/`. The editor is a Client Component;
  recipe reads and authenticated mutations remain server-side. Initialize
  Tiptap with `immediatelyRender: false` to avoid server-rendering mismatches.
- The roadmap keeps Slices 0–24 local-first. Vercel deployment behavior is not
  part of this slice.

## Scope

Included:

- An ordered set of Markdown instruction steps on a recipe, with add, edit,
  remove, and reorder controls.
- Markdown paragraphs, headings, lists, and emphasis, with readable formatted
  output in recipe detail.
- A bare `#` shows the current recipe's ingredient rows. Once a person types a
  query, autocomplete searches the account-wide ingredient catalog, including
  when `#` is inserted directly before an existing word. Selecting a catalog
  ingredient adds it to the recipe if needed, then inserts a structured mention;
  an unmatched query can create a new ingredient. Escape closes suggestions and
  leaves the typed token as plain text.
- Stable recipe-ingredient identifiers in the save payload and database. A
  recipe save must not change the identity of rows referenced by instructions.
- A readable plain-text projection per step for future search indexing. The
  projection contains readable `#<slug>` mention text and never the stored
  marker syntax.
- A warning before deleting a mentioned ingredient row. Cancel preserves both
  row and mentions; confirmation replaces its mentions with ordinary readable
  `#<slug>` text before removing the row.
- Owner-scoped step and mention storage, save-version conflict handling,
  transactional history snapshots, desktop/mobile editing, keyboard behavior,
  and accessibility coverage.

Excluded:

- Pairs With recipe links, References, public/print rendering, instruction sort
  controls, and cooking modes.
- Settings-managed mention colors and decoration toggles; mentions use the
  default bold dark-red in-app style from the reference. Public and print
  rendering use that same default when those views are implemented.
- Recipe search itself. The stored plain-text projection is the input for the
  later search slice.

## Data and save contract

- Add `recipe_steps`, owned by a recipe, with a stable step ID, non-negative
  position, Markdown content, and its readable plain-text projection. Empty
  steps are omitted from saves; persisted steps are contiguous and ordered.
- Add `recipe_step_mentions`, one row per confirmed mention occurrence, with
  step ID, occurrence position, recipe ID, account ID, and
  `recipe_ingredient_id`. Composite foreign keys must ensure the step and
  ingredient row belong to the same recipe and account. Duplicate mentions of
  one ingredient are distinct occurrences.
- Structured Markdown uses the verified marker
  `[[ingredient:<recipe-ingredient-id>|<slug>]]`. The ID is authoritative; the
  slug is readable fallback text. The save function derives mention rows from
  markers and rejects malformed markers, unknown fields, duplicate step IDs,
  and references to rows outside the submitted recipe.
- Preserve recipe-ingredient row IDs across edits. The current `save_recipe`
  routine rebuilds those rows, so add a versioned application save path that
  preserves the submitted row IDs, measurement ownership, and existing API
  compatibility. Row IDs are client-generated UUIDs for new rows and the
  persisted IDs for existing rows. Reject duplicate IDs and IDs owned by a
  different recipe or account.
- Keep recipe metadata, ingredient rows, measurements, steps, mention rows,
  version increment, and history in one database transaction. Omitted steps
  from the new save payload mean an empty instruction list. Stale or invalid
  saves leave every affected table and history unchanged.
- Direct writes to step and mention tables remain denied. Owner reads use RLS;
  writes are permitted only within the authenticated recipe-save transaction.
- Extend the existing deferred recipe-history snapshot with ordered before and
  after steps and their mention targets. History must retain the stable row IDs
  needed to interpret each snapshot.
- A mention resolves by stable row ID, not by its stored slug. On load, display
  the current ingredient-row name; regenerate the marker slug and search
  projection on the next save. The future ingredient-rename workflow must
  refresh projections while retaining mention IDs.

## Interaction and accessibility

- Instructions appear after Ingredients in recipe detail and in edit mode. Use
  a compact numbered list of step editors with explicit Add step, reorder, and
  remove actions; do not add explanatory feature copy.
- The editor supports the documented Markdown structures without requiring a
  toolbar. Each step has a visible accessible name and keyboard-visible focus.
- Pressing `Ctrl+.` in a step inserts `°` at the caret and replaces any selected
  text.
- Typing `#` opens a filtered listbox anchored to the caret. Existing rows are
  selectable when the query is empty; a typed query searches the account-wide
  catalog. Selecting a catalog item adds it to the recipe if needed. A typed
  unmatched name offers Create ingredient. Arrow keys move the active option,
  Enter confirms, and Escape closes without creating a mention. The popup stays
  within desktop and mobile viewports.
- In edit mode, a mention uses `#<slug>` notation. In recipe view, it displays
  the current ingredient name as ordinary text and receives bold dark-red
  styling. Screen readers receive the ingredient name, not marker syntax.
- Mention deletion confirmation names the affected ingredient and explains
  that instruction mentions will become plain text. Cancel is the non-default
  action; keyboard users can dismiss without losing text.
- At 352px and 390px viewport widths, editors and suggestion menus must not
  introduce horizontal page scrolling. Axe reports no WCAG 2 A/AA violations.

## Acceptance tests

Write these tests before production code:

- Unit tests parse and serialize the stable-ID marker, preserve ordinary
  Markdown and literal `#` text, produce the documented readable projection,
  resolve renamed labels through the current row name, and reject malformed or
  unknown targets.
- Database/API tests create and update ordered steps; create, read, and verify
  occurrence-ordered mention rows; prove cross-account and cross-recipe targets
  fail; and prove direct writes are denied.
- Database/API tests prove recipe-ingredient IDs survive edit and reorder,
  including their measurements and mention links. Deleting an unreferenced row
  succeeds; a mentioned-row deletion with remaining markers fails atomically.
- Database/API tests prove invalid Markdown references, invalid step payloads,
  and stale versions leave recipe metadata, ingredient rows, measurements,
  steps, mentions, and history unchanged. History includes before/after ordered
  steps and mention IDs.
- End-to-end tests create a recipe with formatted instructions and mentions to
  existing and newly created ingredient rows; save, view, edit, reorder, and
  reload; verify readable rendering and stable links; and verify Escape leaves
  an ordinary `#` token. They also verify `Ctrl+.` inserts a degree symbol in
  instruction text.
- End-to-end tests cancel and confirm deletion of a mentioned ingredient row,
  verify mentions become plain text only after confirmation, and prove other
  rows and step content are retained.
- Desktop and mobile tests cover keyboard selection, touch selection, visible
  focus, accessible labels, responsive popup placement, no horizontal
  overflow, and axe WCAG 2 A/AA.
- The Fold 6 Playwright project verifies mobile layout and touch selection in an
  emulated browser. Verify instruction autocomplete with the on-screen keyboard
  and touch on a physical phone during Slice 25, after HTTPS deployment.

## Verification

Run the focused instruction and mention unit tests first, followed by the
database/API and browser/accessibility tests against the existing local
Supabase stack. Do not run `npm run dev:local`, `npm run supabase:reset`, or
another command that resets local data. Then run TypeScript typecheck, Biome,
and the focused recipe suite.

## Completion criteria

- Owners can create, edit, reorder, and reload Markdown instruction steps.
- Only confirmed autocomplete selections create structured ingredient links;
  literal `#` text stays unlinked.
- Mention IDs remain valid across recipe saves and ingredient reordering, and
  referenced-row deletion is confirmed and leaves no broken links.
- Owner isolation, transaction rollback, version conflicts, and history
  snapshots are verified by deterministic tests.
- Focused unit, database/API, end-to-end, and accessibility tests pass, as do
  TypeScript typecheck, Biome, and the relevant recipe suite.