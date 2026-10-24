# DLC 05: Instruction authoring and references

**Status:** Implemented locally. Automated acceptance evidence is mapped below.

This slice extends recipe instructions with deliberate time and temperature
annotations and references to existing recipe photos. Ingredient sets and
portion-aware ingredient references are defined in [DLC 03](dlc-03-ingredient-sets.md)
and [DLC 04](dlc-04-ingredient-amounts-and-references.md).

## Outcome

Authors can identify exact instruction text as a duration or temperature,
choose distinct visual colors for those annotations and referenced ingredients
in Settings, and place an existing recipe photo in an instruction step. Readers
retain readable text and see the image in its recipe context.

## Current patterns and research

- The current editor is a Markdown textarea with explicit `#` mention
  suggestions. The parser preserves structured ingredient markers, while
  private recipe photos remain separate assets served through short-lived
  signed URLs. See [instruction rules](../../../../src/lib/recipes/instruction-rules.ts),
  [instruction Markdown](../../../../src/lib/recipes/instruction-markdown.ts), and
  [media display](../../../../src/app/media/media-display.tsx).
- The recipe reader currently places Ingredients beside Instructions on wider
  screens and stacks them at the existing responsive breakpoint. Preserve this
  layout in this slice unless the separate DLC brainstorm item about wrapping
  instructions around ingredients is explicitly brought into scope.
- Tiptap's Image extension renders images as block nodes by default and
  supports inline mode, but does not provide upload handling. This slice uses a
  floated reader reference and the existing gallery picker instead; it stores
  an asset identity, never an image `src` URL, and keeps the current private
  media boundary.
- W3C guidance distinguishes decorative images from informative images: an
  informative image needs text that conveys its essential information; an
  image used only decoratively should be ignored by assistive technology. A
  gallery photo's current empty alt text therefore cannot automatically decide
  the alternative for every instruction placement.

## Scope

- Mark a duration by typing one equals sign on either side of the exact text,
  for example `=10 minutes=`. Keep the delimiters visible while editing and
  omit them from the readable and searchable projection. Continue parsing
  existing `[[duration:...]]` markers for compatibility. Do not guess from
  unmarked numbers, units, or prose.
- Use no additional reader icons. Numeric temperature tokens and unitless stove
  heat labels remain the meaningful cues (`400°F`, `medium low`); color is
  optional emphasis, not a substitute for readable wording.
- Accept the explicit temperature shorthand `F!400` and `C!200` as structured
  authoring tokens. Preserve the authored token in the editor; searchable
  plain text uses its readable, authored-unit form. Convert private reader and
  print output to the account's preferred Fahrenheit or Celsius unit and round
  to the nearest 5 degrees. Fahrenheit is the default. Public reader and print
  output retain the authored unit and round to the nearest 5 degrees in that
  unit; they never use the account preference. Also accept a unitless stove
  heat label bracketed with exclamation marks, such as `!medium low!`; readers
  show `medium low` without delimiters and without unit conversion. A
  punctuation exclamation mark may directly follow the closing delimiter and
  remains visible, so `!medium high!!` displays as `medium high!`. Durations
  use the typed equals-sign delimiters; do not infer meaning from unmarked
  prose.
- Add separate Settings color controls for ingredient mentions, durations, and
  temperatures, initially blue, red, and orange respectively. Each offers
  named accessible swatches and **None**, where None means ordinary readable
  body text, not hidden content. Use similarly muted color strength across
  distinct hues, with contrast checked against the app surface. Keep existing
  ingredient-mention weight/decoration behavior.
- Let an author type `+p` to open a four-column thumbnail pane for ready photos
  from that recipe's gallery. The pane is anchored at the caret, overlays the
  editor, and opens above or below the step based on available viewport space;
  do not add a separate picker button. Each photo has a unique, persisted
  two-digit code within its recipe; show the code at the thumbnail's lower
  right and keep it stable when gallery order changes. Selecting a photo
  replaces `+p` at the caret with `+photoNN`; typing a valid code directly
  also references that photo. An optional `-<width>` suffix sets display width
  in pixels, such as `+photo37-200`; the default width is
  200px. This inserts a reference to the existing asset; it does not upload,
  duplicate, or crop an image.
- Store structured annotation and media references in the instruction content
  using stable identities and readable source text. Never store signed URLs,
  Storage paths, or binary data in recipe content. The plain-text projection
  contains authored duration and temperature text, but not internal marker
  syntax or image references.
- Render referenced media only after the same owner or public-recipe
  authorization checks used for the corresponding recipe. Preserve the recipe
  photo gallery's order and primary-photo behavior.
- Preserve explicit recipe Save, optimistic concurrency, history, export/import,
  print, and offline contracts. Do not add instruction sorting beyond the
  existing manual reorder workflow.

## Exclusions

- Automatic time/temperature recognition.
- New image uploads from the instruction editor, external image URLs, video,
  animation, cropping, resizing, or a navigable multi-image lightbox. The shared
  single-image modal viewer is supported; it does not navigate between photos.
- Changing the existing Ingredients/Instructions reader layout. The separate
  brainstorm item “wrap the instructions around the ingredients” remains out
  of scope pending review.

## Interaction and state contract

- Typing `=duration text=` marks that exact text. The delimiters remain visible
  in the editor so they can be removed without replacing the duration. An
  unmatched or backslash-escaped equals sign is literal text, and unmarked
  times are never inferred. Typing, selecting autocomplete results, and step
  reordering retain their existing keyboard behavior.
- Typing `+p` at the caret opens the photo pane as an overlay, positioned above
  or below the step to fit the available viewport. No separate picker button is
  shown. Selecting an image replaces the trigger with its stable `+photoNN`
  code at that exact location. Typing a valid `+photoNN` code directly also
  resolves to the same UUID-backed reference. A `-<width>` suffix sets its
  width in pixels. Cancel leaves the step and recipe
  draft unchanged. Without a suffix, use 200px as the preferred width. The
  UUID-backed reference is staged with the recipe and commits only on explicit
  Save. A failed save preserves the draft; reload shows only committed
  references.
- Embedded photos are decorative and strictly supplemental: use empty
  alternative text, collect no caption or description, and ensure adjacent
  written instructions remain complete without the image.
- Clicking a referenced photo opens the shared single-image modal viewer.
  Closing it with the close action, Escape, or an outside click leaves the
  recipe unchanged; it does not provide gallery navigation.
- Settings changes save immediately, independently per category, and announce
  saving, success, or failure. A failed save restores the last saved color.
  Settings remain account-scoped and do not change recipe versions or history.
- Private print uses the account's selected colors by default. A Settings
  checkbox opts out of color styling for private print and is disabled by
  default.
  Public pages and public print use fixed application defaults, never account
  preferences.
- Referenced images float right at the exact inline reference, aligned with
  that line. Text before the reference uses the full line where it fits; text
  after it and later photo-free instruction steps wrap beside the float. A
  later instruction step containing another photo clears below the existing
  float before placing its own image. Floats end with the instruction list.
  Image dimensions remain responsive, preserve aspect ratio, and never crop
  meaningful content; the default width is 200px, and custom pixel widths are
  capped by the available text area.
- When a referenced photo is removed, one confirmation removes the photo and
  all its instruction references together. The confirmation identifies the
  affected steps; cancellation changes nothing. The operation must handle
  recipe version conflicts without partial removal.

## Data, security, and failure boundaries

- Extend the account preference contract with independent values for the three
  color categories. Validate allowed values server-side and preserve all other
  account preferences on each update. Include defaults and new values in the
  recovery bundle import/export contract.
- Validate every media reference against a ready photo owned by the same
  recipe/account. A forged, foreign-recipe, publication-cover, missing, or
  non-ready asset must not resolve or disclose a URL.
- Public rendering resolves only photos for a recipe that passed the existing
  public-link, privacy, and active-lifecycle checks. Public payloads must not
  include account preference values or storage identifiers.
- Keep image references consistent with media removal, recipe trash/restore,
  permanent purge, history snapshots, and bundle ID remapping. A version
  conflict or validation failure must not partially save steps, preferences,
  or media changes.
- No new public bucket, upload endpoint, or third-party image service is
  introduced.

## Acceptance mapped to automated tests

- **Annotation rules:** Unit tests prove typed duration delimiter parsing and
  removal, escaped delimiter handling, legacy marker compatibility,
  `F!400`/`C!200` temperature shorthand, nearest-five display rounding,
  bracketed stove-heat labels, readable plain-text/search output, and no
  accidental auto-detection.
- **Settings:** Browser and server tests cover temperature unit selection,
  conversion, default and persistence, plus each color independently,
  swatch names and selected state, the visible None state, reload persistence,
  print-color opt-out persistence, save failure rollback, keyboard operation,
  account isolation, contrast against supported app surfaces, and axe checks.
- **Media references:** Unit/database tests cover stable asset references and
  per-recipe photo codes, code stability after reordering, same-recipe
  ownership, rejection of invalid asset kinds/states, ID remapping,
  one-confirmation removal of the asset and all references, recipe save
  atomicity, history, and missing/deleted asset behavior.
- **Readers:** Browser tests cover private and authorized public rendering,
  signed URL refresh/expiry behavior, print policy, offline fallback, and the
  single-image modal viewer and its dismissal behavior, the absence of private
  media URLs in saved content or public payloads.
- **Editor workflow:** Desktop and mobile tests cover typing and removing
  duration delimiters, opening the gallery picker with `+p`, selecting and
  canceling a photo, insertion at the caret, optional width editing, repeated
  use, removal of a reference, save/reload, validation
  and version-conflict draft retention, keyboard focus, visible focus, labels,
  pointer/touch, and axe checks.
- **Responsive geometry:** Assert that each image aligns with its inline marker,
  later photo-free steps wrap beside an existing float when space remains, and
  a later photo-bearing step clears below it. Also assert no overflow or
  overlap around the existing reader reflow boundary and at an intermediate
  width where the step content wraps. Screenshots supplement these geometry
  and behavior assertions.

## Review decisions and assumptions

- Recipe photos receive unique random codes from `00` to `99` within their
  recipe. Codes are persisted and independent of display order; the asset UUID
  remains the stored reference. `+photoNN` is the readable editor projection,
  optionally followed by `-<width>` in pixels.
- Use explicit `F!400` and `C!200` authoring tokens, converted and rounded to
  the preferred unit in private display and rounded in authored units in public
  display. Use `!medium low!` for unitless stove heat labels. Type durations as
  `=10 minutes=`. No thermometer or clock icons are added; readable units and
  wording remain the cue, with color as optional emphasis.
- The private-print checkbox means “omit emphasis colors”; it is unchecked by
  default so private print follows Settings unless the reader opts out.
- Keep the existing Ingredients/Instructions reader layout. Wrapping
  instructions around ingredients and changing the details-first layout remain
  separate DLC brainstorm items.
- Existing ready gallery photos remain the only image source; selecting a
  reference never uploads or duplicates a photo. Embedded photos are empty-alt,
  decorative, strictly supplemental, and have no caption or description.

## References

- [DLC brainstorm](../../discussion/dlc.md)
- [Comprehensive reference, § 5: Instructions and mentions](../../comprehensive-reference.md#5-instructions-autocomplete-and-recipe-linking)
- [Comprehensive reference, § 8.3: Personal preferences](../../comprehensive-reference.md#83-personal-preferences)
- [Comprehensive reference, § 9.4: Secure image delivery](../../comprehensive-reference.md#94-secure-image-delivery)
- [Data model](../../data-model.md)
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md)
- [DLC 03: Ingredient sets](dlc-03-ingredient-sets.md)
- [DLC 04: Ingredient amounts and references](dlc-04-ingredient-amounts-and-references.md)
- [Slice 7: Instructions and mentions](../7-instructions-and-mentions.md)
- [Slice 12: Images](../12-images.md)
- [Slice 14A: Settings and personal preferences](../14a-settings-and-preferences.md)
- [W3C WAI Images Tutorial](https://www.w3.org/WAI/tutorials/images/)
- [WCAG 2.2, Understanding Success Criterion 1.1.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)
- [Tiptap Image extension](https://tiptap.dev/docs/editor/extensions/nodes/image)
