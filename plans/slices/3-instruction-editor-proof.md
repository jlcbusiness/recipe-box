# Slice 3: Instruction editor proof

This is a throwaway technical proof, not a product editor or a recipe-data
migration. Its output is a recorded library and markup decision; the proof route
and fixture editor are removed before Slice 4 begins.

## References

- [Delivery roadmap](../delivery-roadmap.md), slice 3
- [First-draft specification](../first-draft-spec.md), Instructions and Relationships
- [Comprehensive reference, § 5: Instructions and recipe linking](../comprehensive-reference.md#5-instructions-autocomplete-and-recipe-linking)
- [Comprehensive reference, § 13: Interaction and accessibility](../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)
- [Comprehensive reference, § 16: Testability](../comprehensive-reference.md#16-testability-and-test-first-delivery)
- [Visual design guide](../visual-design.md)
- [Decision log](../decision-log.md)
- [Tiptap React](https://tiptap.dev/docs/editor/getting-started/install/react)
- [Tiptap Markdown](https://tiptap.dev/docs/editor/markdown)
- [Tiptap custom Markdown tokenizers](https://tiptap.dev/docs/editor/markdown/advanced-usage/custom-tokenizer)
- [Tiptap Mention](https://tiptap.dev/docs/editor/extensions/nodes/mention)
- [Tiptap Suggestion](https://tiptap.dev/docs/editor/api/utilities/suggestion)

## Outcome

A temporary local page accepts Markdown, suggests ingredient mentions on `#`,
stores confirmed choices as structured ingredient IDs, and round-trips both the
stored Markdown and readable plain-text projection. This proof selects or
rejects Tiptap as the editor foundation and records the structured mention
syntax before recipe schema or recipe UI is introduced.

## Candidate under test

Prototype against the verified MIT-licensed Tiptap React, StarterKit, Markdown,
Mention, and Suggestion packages at version `3.31.4`. The current Tiptap docs
label its Markdown extension an early release, so the proof must specifically
exercise import, serialization, custom tokenization, and structured mention
round-tripping. Do not adopt the candidate merely because the editor renders.

## Proposed stored marker

A confirmed ingredient mention is serialized as:

```text
[[ingredient:<stable-id>|<slug>]]
```

For example, a selected `all-purpose flour` fixture should render to the reader
as `#all-purpose-flour`, while the persisted Markdown contains its stable
fixture ID. A literal unselected `#all-purpose-flour` remains ordinary text and
must not become a structured mention on import. If the proposed token cannot
round-trip robustly through the editor's Markdown parser, test another
unambiguous syntax and record the selected form in `decision-log.md`.

## Scope

- Add a disposable route at `/proof/instruction-editor`, available only in
  local development and test mode; it is not a production feature or a
  persisted recipe workflow.
- Use fixture ingredient rows with stable IDs for `all-purpose flour` and
  `eggs`. The proof's **Create new ingredient** option creates an in-memory
  fixture row only; it does not create schema or call Auth, Postgres, or
  Storage.
- The editor accepts Markdown with paragraphs, headings, lists, and emphasis;
  exposes the structured document's stored Markdown and plain-text projection
  in labelled output regions; and can reload the Markdown into the editor.
- Typing `#` opens a filtered, keyboard-operable listbox. Arrow keys move its
  active option; Enter confirms; Escape closes it while leaving the typed token
  as plain text. Selecting an existing row or the fixture-only create option
  inserts a structured mention that carries that row's ID.
- A selected mention displays as readable `#slug` text. Plain-text output must
  contain the display text and not the stored marker syntax.

## Test-first acceptance

Write these automated checks before the proof page, editor component, extension,
or candidate package installation:

- A browser test opens `/proof/instruction-editor` and verifies the labelled
  editor, Markdown output, plain-text output, and `Reload Markdown` control.
- A keyboard-only browser test types `#all-purpose`, verifies filtered
  suggestions, confirms the ingredient with ArrowDown/Enter, and checks the
  visible label, persisted stable ID marker, and plain-text projection.
- A browser test types a plain `#` token and presses Escape; the suggestion
  list closes, literal text remains, and the Markdown output has no structured
  marker for that text.
- A browser test selects **Create new ingredient**, verifies an in-memory
  fixture row appears, and confirms the structured marker points to its stable
  ID.
- A browser test reloads exported Markdown into a fresh editor state and
  verifies the mention retains its ID and readable label. Ordinary Markdown
  formatting also survives export and reload.
- At a 390 px viewport, the editor and suggestion list do not cause horizontal
  overflow. Axe reports no WCAG 2 A/AA violations, and keyboard focus remains
  visible while moving through the editor and suggestion options.
- The proof route returns not found in production mode. No recipe tables,
  migrations, authenticated records, or public routes are introduced.

The first run should fail because the route does not exist. After the proof
passes, record the library, package versions, limitations, selected marker
syntax, and whether the editor passes all acceptance cases in `decision-log.md`.
Then remove the throwaway route and its UI-specific tests before proceeding to
Slice 4; retain only any decision-level unit tests needed to protect chosen
serialization rules.

## Verified result

- Tiptap `3.31.4` with `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`,
  `@tiptap/markdown`, `@tiptap/extension-mention`, and `@tiptap/suggestion`
  passes the proof. All packages are MIT-licensed and pinned exactly.
- Confirmed mentions use `[[ingredient:<stable-id>|<slug>]]` in Markdown and
  display as `#<slug>`. The plain-text projection preserves readable labels
  without exposing the marker. Literal unconfirmed `#` text remains ordinary
  text after Escape.
- Seven Chromium checks pass for route structure, desktop and mobile keyboard
  selection, Escape, fixture creation, Markdown formatting/mention round-trip,
  viewport fit, and axe WCAG 2 A/AA.
- The production build returns HTTP 404 for `/proof/instruction-editor`.
- Tiptap's Markdown extension documentation labels the extension early release.
  Keep import/export, structured marker, and plain-text projection regression
  tests when the product editor is built.

## Explicitly deferred

- Database-backed ingredient lookup, ingredient-row creation, mention foreign
  keys, rename behavior, and deletion warnings belong to Slices 5 and 7.
- Recipe-step persistence, search projection storage, save/history behavior,
  Pairs With links, and production editor styling are not built by this proof.

## Completion criteria

- The proof demonstrates the complete `#` selection, Escape, fixture creation,
  stable-ID serialization, and Markdown/plain-text round-trip in Chromium.
- Desktop and mobile accessibility checks pass.
- A decision-log entry records the candidate result and any rejected behavior.
- Throwaway proof code is removed before the next product slice; no persistent
  product data schema is introduced here.
