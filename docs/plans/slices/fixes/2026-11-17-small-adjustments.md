# November 2026 Small Adjustments

**Status:** Implementation complete in app version 1.14.2; focused unit and
browser checks pass.

This umbrella groups the requested small changes into three independently
demonstrable work packages. It follows the dated maintenance-plan approach in
[November 2026 Reported Fixes](2026-11-04-reported-fixes.md) and does not assign
a DLC number. Each package has its own outcome and acceptance criteria.

## Outcome

Make recipe reading clearer, give browser tabs and external recipe references
useful titles, and make keyboard entry of time rows flow naturally.

## Scope and boundaries

- **A. Recipe reading polish:** Change customary Size output from `in` to `"`,
  display Equipment labels in lowercase in recipe outputs, and remove mobile
  horizontal scrolling from Ingredient-first reading by wrapping cell content.
  Center mobile Preparation text to match the divided note.
- **B. Descriptive titles:** Give every app route a useful browser document
  title without implying a Recipe Tin context on pages outside that
  collection. For a newly added or changed external URL reference, capture the
  linked page's title and use it as the reference text when the destination
  permits lookup.
- **C. Time Type keyboard flow:** After a valid Time Type is selected, the
  committing Enter appends a blank time row and focuses its Minutes field.

Do not change ingredient values, shared Equipment catalog values, Time Type
catalog behavior, recipe visibility, or explicit recipe Save behavior.
Unchanged URL references are not re-fetched or backfilled. The captured page
title is display text only; the normalized URL remains the link destination.
Implementation began after the user approved this brief.

## A. Recipe reading polish

### Behavior

- Format a US customary Size with an attached double quote, for example
  `1 ¼"`; keep metric Size formatted with `cm`. Do not change the stored unit
  or the Size editor's `in`/`cm` labels.
- Lowercase Equipment labels in private and public recipe reading, print, and
  standalone recipe output. This is presentation-only: preserve the shared
  picklist values, Settings labels, search labels, and saved assignment IDs.
- At mobile widths, keep the Ingredient-first table's Ingredient, Amount, and
  Prep columns, but wrap long names, specifics, measurements, and Preparation
  text to the available width. Do not retain a min-content-width table or an
  inner horizontal-scroll region. Page and table content must not scroll
  horizontally; vertical growth should come only from visible content, not
  collapsed desktop-only cells.
- Center the mobile Preparation text in the Prep cell, matching the existing
  centered divided note. Put the mobile `divide` label on its own line, with
  the portion pair directly below it. Keep the Prep header and desktop layout
  unchanged.
- Preserve ingredient/measurement meaning, scaling, division, sort behavior,
  ingredient sets, and the active reader presentation.

### Acceptance

- Unit tests verify customary Size uses the attached quote and metric Size
  remains unchanged.
- Browser tests verify Equipment casing in private/public recipe reading and
  print/standalone output, while Settings and editor picklist labels retain
  their catalog casing.
- Browser geometry tests use long ingredient names, specifics, measurements,
  Preparation, and divided values at 320px, 390px, an intermediate mobile
  width, 760px, and 761px. Through 760px, assert that both the document and
  Ingredient-first table fit their containers without horizontal scrolling,
  that text wraps, that collapsed tracks do not inflate row heights, and that
  the mobile Preparation text and divided label/value layout are correct. At 761px,
  verify the desktop presentation and layout remain unchanged; the
  no-horizontal-scroll assertion does not apply to Standard view at that width.
- Reuse the reader and Size test patterns in
  [ingredient-rules tests](../../../../tests/unit/ingredient-rules.test.tsx),
  [measurement browser tests](../../../../tests/e2e/measurements.spec.ts), and
  [recipe browser tests](../../../../tests/e2e/recipes.spec.ts).

## B. Descriptive page and reference titles

### Behavior

- Set a useful document title on every app route, including signed-in,
  authentication, and public routes. Use the `Recipe Box` brand followed by
  human-readable section and page or record names. For example:
  `Recipe Box - Settings - Updates`, `Recipe Box - Awesome Sauce`, and
  `Recipe Box - Library`. Include `Recipe Tin` only when the page itself is
  specifically about that collection, not as a blanket prefix for recipes or
  library pages.
- Do not change visible headings or route behavior solely to create a browser
  title.
- When a new external URL reference is added, or an existing reference's URL
  changes, fetch the destination page title during recipe Save. Store that
  title in the existing reference display-text field and keep the normalized
  URL separately as the `href`. Show the captured title as link text wherever
  that recipe reference is rendered.
- Offer an optional manual label for each external URL. A non-empty label
  takes precedence over lookup and is saved as display text; a blank label
  keeps automatic lookup for new or changed URLs. Unchanged references keep
  their current text unless the user clears the label, which restores the URL
  fallback.
- If lookup fails, returns a non-HTML response, or yields no usable title, save
  the recipe with the normalized URL as visible text. Do not block or partially
  fail recipe Save because an external page is unavailable. Do not re-fetch
  unchanged references, backfill existing references, or alter protected
  source references. Some sites may reject server-side lookups; in that case
  the URL fallback is expected.
- Constrain the fetch to public HTTP(S) destinations. Enforce an overall
  budget of at most 2 seconds per recipe Save and no more than 5 title lookups
  per Save; excess new URLs use the URL fallback. Allow no more than 3
  redirects and 256 KiB per response, and only the standard HTTP/HTTPS ports.
  Validate
  resolved addresses and every redirect target against private, loopback,
  link-local, and other non-public ranges, including the actual connection
  target. Send no cookies, credentials, or application session headers.
  Extract plain title text only; collapse whitespace and never render fetched
  markup as HTML.
- The current reference record already has separate `url` and `display_text`
  fields. Reuse them rather than adding a schema field or migration; verify
  that history, import/export, public projections, and duplication preserve
  the title text wherever they preserve the reference.

### Acceptance

- Browser tests assert document titles for representative nested Settings,
  dynamic Recipe Tin, public recipe, sign-in, and recovery routes; all use the
  brand-first convention and human-readable names.
- Unit/integration tests cover title extraction, entity decoding, whitespace,
  unusable/missing titles, HTML and response-size limits, timeouts, redirect
  limits, and blocked local/private destinations. Use mocked responses; tests
  must not depend on third-party websites.
- Recipe-save tests verify the title is stored as display text, the
  normalized URL remains the link target, and readers display the title.
  Manual-label tests verify the entered label is saved and displayed while the
  normalized URL remains the link target and no external lookup is needed.
  Timeout, blocked destination, invalid response, and missing title all keep
  recipe Save successful with the URL fallback. Unchanged and protected
  references are not fetched or rewritten.
- Regression tests verify existing references, history, bundles, public
  projections, and duplicated recipes preserve their current behavior and
  stored display text.

## C. Time Type keyboard flow

### Behavior

- Keep the existing suggestion interaction: the first Enter selects the
  active Time Type suggestion; the next Enter commits a valid selection.
- On that successful Enter commit, append one blank time row using the same
  initial Time Type as the explicit Add time control, then focus its Minutes
  input. The new row is a draft and still requires explicit recipe Save.
- Do not append a row for an empty or invalid Time Type. Tab and blur continue
  to commit without appending. The explicit Add time control remains available.
  Enter must never submit the recipe form.

### Acceptance

- Browser tests cover selecting a suggestion with the first Enter, committing
  with the next Enter, exactly one new row, default Time Type, blank Minutes,
  and focus on its Minutes input.
- Tests verify invalid types do not add a row, Tab/blur do not add one, the
  explicit Add time control still works, and Enter never submits the recipe.
- Preserve the existing time-row layout, suggestion accessibility, ordering,
  expression validation, and explicit Save behavior.

## Existing patterns and references

- [Slice workflow](../../../../.github/prompts/slice.prompt.md)
- [Comprehensive reference: metadata and times](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Comprehensive reference: ingredients and presentation](../../comprehensive-reference/02-ingredients-and-presentation.md)
- [Comprehensive reference: references](../../comprehensive-reference/03-instructions-and-links.md)
- [Comprehensive reference: interaction and accessibility](../../comprehensive-reference/08-interaction-and-accessibility.md)
- [Visual design guide](../../visual-design.md)
- [Decision log](../../decision-log.md)
- [DLC 33: Configurable recipe times](../dlc/dlc-33-configurable-recipe-times.md)
- [DLC 38: Separate Divide from Preparation](../dlc/dlc-38-separate-divide-from-preparation.md)
- [DLC 04: Ingredient amounts and references](../dlc/dlc-04-ingredient-amounts-and-references.md)
- [Related reader and editor implementation](../../../../src/app/recipes/recipe-reader.tsx),
  [ingredient display rules](../../../../src/lib/recipes/ingredient-rules.ts),
  [reference editor](../../../../src/app/recipes/recipe-relationships-editor.tsx),
  and [Time Type editor](../../../../src/app/recipes/recipe-form.tsx)

The reader was visually inspected with authenticated content at 902px and
390px. Browser tests also verify its responsive geometry and wrapping for long
ingredient names, specifics, measurements, Preparation, and divided values.
