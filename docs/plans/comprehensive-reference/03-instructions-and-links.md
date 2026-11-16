# Recipe Box Comprehensive Reference: Instructions and Links

[Back to the comprehensive reference index](../comprehensive-reference.md)

> Canonical product requirements: Instruction authoring, mentions, recipe pairings, and recipe references.

## 5. Instructions, Autocomplete, and Recipe Linking

### 5.1 Instructions Editor and `#` Mentions

- Instructions are stored as ordered step blocks written in Markdown. Confirmed
  whole-row mentions serialize as `[[ingredient:<stable-id>|<slug>]]`; divided
  portions add a stable ordinal as
  `[[ingredient:<stable-id>:<1-or-2>|<slug>]]`. Both render in the editor as
  `#<slug>`.
  Literal unconfirmed `#` text remains plain text and is not indexed as a
  structured mention. The editor's plain-text projection uses the readable
  `#<slug>` form and omits the stored marker.
- Instruction steps support unordered (`-`, `*`, `+`) and ordered (`1.`, `1)`)
  Markdown list markers, whether the list starts after a blank line or a single
  newline. Enter continues a list within the current step; Enter on an empty
  list marker exits the list line. Shift+Enter inserts a newline within the
  current step, while Enter on a non-list line creates the next step. Rendered
  unordered and ordered lists retain visible bullets/numbers and indentation in
  private, public, and print views.
- **`#` Autocomplete Behavior:**
  - Typing `#` triggers an inline autocomplete menu. A bare `#` shows existing
    ingredients on the current recipe.
  - Once a query is typed, suggestions search the account-wide ingredient
    catalog in real time. This includes typing `#` directly before an existing
    word. Multi-word ingredients use hyphens in the token (e.g.,
    `#all-purpose-flour`).
  - Selecting a catalog ingredient adds it to the current recipe if needed,
    then creates a structured mention to that recipe's ingredient row.
  - **Menu Options:**
    1. Select an existing ingredient row.
    2. Select **Create new ingredient** (adds row to ingredients table and links it).
    3. Press `Escape` to cancel autocomplete and leave `#` as plain text.
  - **Rendered Output:** Renders cleanly as normal readable text (e.g., "Add the all-purpose flour and mix"). In recipe
    detail, each structured mention is a focusable inline button. Hover or keyboard focus reveals its current scaled and
    converted amount in one compact popup above the mention; click or tap pins/toggles the popup. Escape, an outside
    pointer action, or loss of hover/focus when unpinned dismisses it. Escape returns focus to the mention. The
    viewport-bounded square bubble has a strong background and a small pointer tail, contains no nested tooltip, and
    shows an unmeasured phrase or `No amount listed` when there is no numeric amount. The trigger retains sentence-aware
    readable text. Popups and their controls are not printed; the readable mention and active amount in the ingredient
    list remain printable.
  - **Trigger Symbol:** `#` on every platform. Phone keyboards have no convenient non-alphanumeric key, and `#` is a
    familiar mention convention.
  - **Degree Symbol Shortcut:** `Ctrl+.` inserts `°` at the caret and replaces any selected text.
  - **Temperature shorthand:** Authors use explicit `F!400` and `C!200` tokens;
    ordinary prose is not automatically classified. Editing retains the
    authored token; searchable plain text uses its readable, authored-unit
    form. Private readers and print convert numeric temperatures to the
    account's preferred Fahrenheit or Celsius unit, rounding to the nearest
    5°. Fahrenheit is the default. Public readers and print retain the authored
    unit and round numeric temperatures to the nearest 5° in that unit. Authors
    mark unitless stove heat such as `!medium low!`; readers show the label
    without delimiters and do not convert it. Punctuation immediately after the
    closing delimiter remains ordinary text, so `!medium high!!` displays as
    `medium high!`.
    Authors mark durations by wrapping their text in equals signs, for example
    `=10 minutes=`; unmarked times remain ordinary prose.
  - **Instruction photos:** Typing `+p` opens a four-column thumbnail pane
    anchored to the instruction caret. It overlays the editor and opens above
    or below the step according to available viewport space; there is no
    separate picker button. Each photo has a unique, persisted two-digit code
    for that recipe, displayed at the thumbnail's lower-right corner; the code
    does not change when photos are reordered. Selecting a thumbnail replaces
    `+p` at the caret with `+photoNN`, where `NN` is the photo's code. Typing a
    valid `+photoNN` directly also references that photo. `-w<width>` sets its
    display width in pixels, such as `+photo37-w200`; `-left` aligns it left,
    `-center` centers it, `-steponly` limits text wrapping to that instruction
    step, and `-nowrap` places it on its own line so prose does not flow beside
    it. `-left` and `-center` are mutually exclusive; `-steponly` and `-nowrap`
    cannot be combined. Authors may enter modifiers in any order. The editor
    serializes them in alignment, width, step-only, no-wrap order. Without a
    width suffix, use 200px. Existing saved numeric width suffixes remain
    readable; new editor input uses the `-w<width>` form. Store the stable asset
    UUID and optional layout modifiers in instruction content, never a URL,
    storage path, or image bytes. In readers, the photo is aligned with its exact
    inline reference. Text before the reference uses the full line where it
    fits. A photo marker at the beginning of a new authored line starts on the
    following rendered line; inline markers retain the existing wrapping
    behavior. By default, text after an inline photo and later photo-free
    instruction steps wrap beside the float. `-steponly` contains the float
    within its own step, so following steps begin below it. `-center` and
    `-nowrap` render standalone images. On narrow screens, floated photos become
    left-aligned blocks while explicit centered and no-wrap alignment remains
    respected. Keep at least 1mm vertical separation below every instruction
    photo. A later instruction step containing another photo clears below the
    existing float before placing its own image. Floats end with the instruction
    list. The photo is supplemental and decorative, with empty alternative text
    and no caption or description. Removing a referenced photo requires one
    confirmation and atomically removes every reference to it; cancellation
    leaves the recipe unchanged. Print treatment remains governed by the
    print-layout slice.
  - **Instruction emphasis:** Private reader text uses separate account
    preferences for ingredient mentions, temperatures, and durations. Initial
    colors are blue, red, and orange respectively. Settings aligns the three
    color controls in rows, with their 44px squares sharing a column after the
    longest label. Any square opens the same in-page 4-by-4 palette, centered
    beside the rows on desktop and below them on narrow screens. The palette
    order pairs each standard color beside its dark counterpart, beginning
    with **None** represented by a black swatch, followed by Navy. Each
    standard color sits beside its dark counterpart, including Pink and Dark
    Pink.
    Every colored swatch maintains
    at least 4.5:1 text contrast against
    the light green, light yellow, and white print backgrounds, following
    [WCAG 2.2 SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
    Each category can use any preset or **None**, which removes app-applied
    color and emphasis styling while keeping readable body text. Settings has
    a **Turn off all emphasis** checkbox below the private-print checkbox.
    Checking it sets all three categories to None; unchecking it restores the
    default blue, red, and orange emphasis colors.
    Ingredient mentions retain independent bold, italic, and underline
    controls. Color is optional emphasis; the readable text and units carry the
    meaning.
  - Private print follows the account's emphasis and includes inline
    instruction photos by default. Settings has separate print-only controls
    to omit emphasis or inline photos; both omission choices are off by default
    and do not change the private on-screen reader.
    Public readers and public print use fixed application defaults rather than
    account preferences. Transient, text-labeled **No emphasis** and **No
    instruction photos** toggles affect the current public view and its print
    output, reset on reload, and preserve authored Markdown formatting. On
    narrow screens, Print sits at the title area's top-right with a 48px touch
    target, accessible name, tooltip, and visible focus; the toggles appear
    below the title.
  - **Structured Tracking:** Only confirmed selections create a structured foreign-key link to the ingredient row. Plain
    text does not trigger instruction-appearance sorting.
  - Divided rows offer one autocomplete option for each portion and one
    **whole** option labeled `<ingredient> (whole)`. Portion options show their
    amount; equal amounts also show `1st` or `2nd`. A whole mention has a null
    portion ordinal and its popup shows the full scaled and converted amount
    with its unit. Non-divided rows keep one whole-row option. The set label
    appears only when that canonical ingredient occurs in multiple sets;
    readable slugs always include set identity even when the visible label
    omits it. A divided whole-row token ends in `-whole`, such as
    `#carrot-main-whole`.

### 5.2 Recipe-to-Recipe Links ("Pairs With")

- Bottom row of the recipe card features a **Pairs With** section.
- It accepts ordinary text entries (for example, `Duck Sauce`) and optional
  recipe links. Text becomes a link only when the user selects an existing
  recipe through `#` autocomplete.
- A tooltip in edit mode explains that typing `#` searches existing recipes and
  creates a card link.
- Supports directional recipe links (e.g., linking a chimichurri sauce to a
  flank steak) while displaying both outgoing and incoming links.
- The card displays both:
  - Outgoing links: Recipes explicitly linked from this card.
  - Incoming links: Other recipes that have linked to this card.
- In edit mode, typing `#` in the Pairs With field triggers an autocomplete search across all existing recipes in the
  user's library.
- After selecting a recipe, edit mode displays its normalized token, such as
  `#roast-chicken`. The saved pairing keeps the readable recipe name and linked
  recipe ID; detail mode renders that name as the link text. Editing the token
  clears the link until another recipe is selected.
- On desktop, the Pairs With input has a 3-inch minimum and a 50% row maximum.
- Autocomplete returns only active recipes owned by the signed-in account. A
  trashed target remains as display text without a link; restoring it makes the
  link active again. Purging a target detaches the link but preserves its last
  display text. Purging the source recipe removes its own pairings.

### 5.3 References Section

In recipe detail and edit, References follows Notes, which follows Pairs With. The editor uses one shared **Type** and
**Reference** header and offers three reference types:

1. **Recipe:** Clickable link to another active recipe in the same account.
2. **External URL:** Clickable link pointing to a website or blog not formally imported into the library.
3. **Print:** Non-clickable bibliographic reference (e.g., _The Joy of Cooking, 75th Anniv. Ed., p. 412_).

- **Rule on Origins:** A recipe adapted from multiple disparate sources is considered an original recipe and belongs in
  the **Recipe Tin** with these references cited in References.
- In-app recipe references are account-scoped. A trashed target is displayed
  as text without a link; restoring it makes the link active again. Purging a
  target clears the recipe association but preserves its resolved display
  text. Purging the recipe that owns a reference removes that reference.
- Existing Publication references remain as static legacy text. They cannot
  be created or selected in the current editor.
- External URL values accept a host without a scheme, such as `google.com`,
  and normalize it to HTTPS. Only HTTP and HTTPS URLs are accepted.
- Detail mode renders Pairs With and References as unordered lists. The
  Magazine recipe URL is labeled `Url`; on mobile edit it appears below the
  free-text Citation field.
- On desktop, the Reference text field is at least 3 inches wide and no wider
  than half its row; the Type column fits its control. On mobile, the Type
  column also fits its control, leaving only the intended column gap before the
  Reference field.

---
