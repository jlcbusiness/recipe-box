# DLC 08: Recipe reading, public, and print layout

This brief aligns private and public recipe reading with their print output
while preserving their different data and preference boundaries. The
comprehensive reference remains the product authority.

## References

- [First-draft specification](../../first-draft-spec.md), Views and Sorting,
  Sharing and Authentication
- [Comprehensive reference](../../comprehensive-reference.md), §§ 4, 5, 9,
  13, and 16
- [Data model](../../data-model.md), Ownership and Configuration Boundaries
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md), Ingredient Presentation,
  Public Recipe View, and baseline print
- [Decision log](../../decision-log.md)
- [Slice 12: Images](../12-images.md)
- [Slice 16: Cooking views](../16-cooking-views.md)
- [Slice 22: Public links and privacy](../22-public-links-and-privacy.md)
- [DLC 05: Instruction authoring and references](dlc-05-instruction-authoring-and-references.md)
- [DLC 06: Image framing and gallery](dlc-06-image-framing-and-gallery.md)

## Outcome

Private and public recipe pages use available content width and retain their
agreed on-screen reading hierarchy. Print presents metadata as a compact
horizontal summary that wraps naturally. A public printout reproduces the
guest page's visible recipe content and field order, excluding its controls.
Private print
retains owner-only content and uses account-wide print preferences. Gallery
photos never print; inline instruction photos print according to the relevant
private preference or public-page toggle. Print requests landscape while
leaving browser print-dialog overrides available.

## Scope

- Reduce the desktop private navigation rail to the intrinsic width needed by
  its widest navigation row (currently Settings) plus the existing left inset,
  while ensuring account and utility controls still fit. Recheck the recipe
  reader's available width after narrowing the rail.
- Keep the private summary/photo/details group and reading sections aligned to
  the full private main-content width, sharing its existing outer page gutters
  instead of adding a second centered reader gutter. On desktop, place the title,
  attribution, and actions above the metadata in the column beside the gallery.
  On mobile, preserve the order title group, gallery, details, then reading
  content.
  Preserve the public reader's existing centered 1-inch gutters above its
  1012px measure. Prevent excessive prose line lengths, overlap, and mobile
  horizontal overflow. On desktop, keep the first summary divider 8px below
  the title/action/tag group, with desktop actions beside the title rather than
  in a separate row beneath it.
- In print only, present recipe metadata as a compact horizontal summary that
  wraps at its natural content width. Keep recipe identity and source
  attribution first, the summary next, and the existing Ingredients/Instructions
  reading area after it. On screen, keep the photo beside its metadata and
  align the summary and reading areas with the private title's outer gutters.
- Preserve the current wide Ingredients/Instructions composition and its
  760px-and-below stacked flow unless geometry tests show that the available
  content requires a different reflow boundary.
- Keep each surface's permitted fields: private detail and private print may
  show owner-only information; public detail and public print use only the
  Slice 22 allow-list. Public print matches the current public page's field
  order, scale, units, emphasis state, and inline-photo state, with controls
  hidden.
- Preserve the existing site-wide private print preference for instruction
  emphasis, and add a Settings preference for inline instruction photos. Both
  affect printing, not the private on-screen reader.
- Replace the icon-only public No emphasis control with a text-labeled
  **No emphasis** toggle, and add a matching **No instruction photos** toggle.
  Both affect the current public page and its print output; neither persists
  or reads the owner's preferences. Keep the icon-only Print action at the
  far-right edge of the title actions at every width, with a 48px touch target,
  accessible name, and tooltip. On narrow screens, put the text toggles below
  the title so they do not crowd it or cause horizontal overflow.
- Keep gallery photos visible on private and public screens but omit the
  gallery from every print output. Inline instruction photos remain visible
  on screen and default to printing in both contexts.
- On public screens, reuse the private featured-image gallery: show one
  selected, framed photo with compact selectable thumbnails for additional
  photos. Select the primary photo by default, fall back to display order, and
  keep the feature image within the public 420px-by-`min(280px, 60vh)` limit.
- Request landscape print orientation with a consistent one-inch page margin
  for the title, metadata, ingredients, and instructions. Remove screen-only
  reader gutters and the hidden gallery column from print layout, and allow
  the browser's print dialog to override orientation.
- Define page breaks so headings and ingredient rows remain readable and
  text is not clipped. Hide print controls and transient cook-mode check-off.

## State and boundaries

### Private preferences

- Store the private print choices on the owner's Account, applying them across
  all of that account's recipe printouts; do not attach them to individual
  recipes or change the on-screen reader.
- Preserve the existing account-wide private-print emphasis preference and its
  enabled default. Add an `include_instruction_photos_in_private_print`
  preference, enabled for existing and new accounts, so current printed
  instruction photos remain the default.
- Save each Settings preference immediately through the existing
  owner-derived preference boundary. A save failure restores the last saved
  value and announces an accessible error. These preferences do not create
  recipe history events.
- The print renderer omits gallery photos unconditionally. The inline-photo
  preference controls only images referenced from instruction steps.

### Public page

- Default to showing instruction emphasis and inline instruction photos,
  preserving the current guest-page appearance. Use visible text-labeled
  buttons, not icon-only controls, labeled **No emphasis** and **No instruction
  photos**. Each toggle changes the matching appearance in both the reader and
  print output.
- Public toggle state is transient to the loaded page and resets on reload.
  Buttons expose their on/off state with `aria-pressed`, have visible focus,
  and start unpressed. Keep the icon-only Print action at the far-right edge
  of the title actions on desktop and narrow screens, with an accessible name,
  tooltip, visible focus, and usable touch target. Place toggles before Print
  on desktop and below the title on narrow screens. All controls are omitted
  from print.
- Do not load or serialize Account print preferences in public data. A guest
  choice changes only client-side presentation and cannot alter the public
  payload, saved recipe, or another page.
- Keep the public projection, media authorization, and HTTP/cache behavior
  defined by Slice 22. Public print contains no owner-only fields, private
  media URLs, account preferences, or controls.

### Print behavior

- Print retains the active transient scaling, unit overrides, ingredient
  presentation, and sort. It never prints interactive controls or temporary
  cook-mode check-off.
- Private print applies the two Settings choices without changing the
  on-screen private recipe. Public print reflects the currently visible
  public-page emphasis and instruction-photo toggles.
- Use `@page` landscape as the requested default, not an in-app setting. The
  browser print dialog remains authoritative when the person chooses a
  different orientation. Use a one-inch page margin shared by all recipe
  content.
- Gallery images are excluded from print. Inline instruction images print
  when the private preference or public-page toggle is on; their existing
  responsive sizing and saved framing remain intact.

## Data, security, and failure boundaries

- Add the private inline-photo print preference through a forward migration
  with an enabled default for existing and new accounts. Restrict updates to
  the authenticated owner through the existing preference boundary; do not
  broaden direct Account update permissions.
- Public rendering must not select or serialize this Account preference or
  any other private preference. Public recipe fields remain explicitly
  allow-listed, and media remains private and authorized as defined in Slice
  22.
- The public toggles are local presentation state only. Do not write public
  choices to the database, recipe history, URL, or browser storage.
- Settings save errors must retain the last saved preference. A failed or
  unavailable public interaction must not alter recipe content or disable
  other guest controls.

## Acceptance mapped to automated tests

- Unit and database/API tests cover the new preference's existing/new-account
  default, owner-only update, invalid input, partial update behavior, and
  preservation of all unrelated Account values. Settings browser tests cover
  immediate save, accessible status, reload persistence, and failure rollback.
- Public projection tests prove print toggles do not add private fields,
  Account preferences, linked recipe IDs, or unauthorized media data.
- Chromium and Fold 6 browser tests cover public toggle defaults, visible
  labels, keyboard and focus behavior, pressed state, screen updates, print
  updates, reset on reload, and unchanged recipe/database state.
- Responsive public-page tests cover long and short titles at narrow widths,
  verify that Print remains at the far-right edge of the title actions while
  toggles sit below without overlap, confirm usable touch targets and
  accessible naming, and assert no horizontal overflow. Settings tests verify
  the private print choices sit beside Instruction emphasis on desktop and
  stack below it on narrow screens.
- Browser tests cover private Settings choices affecting print only, public
  print matching the visible public page apart from controls, and gallery
  omission in all print outputs. Assert inline instruction images appear or
  disappear according to each surface's preference, including no-image and
  multiple-image recipes.
- Public gallery tests verify one feature image, primary-photo default,
  selectable thumbnails for a twelve-photo recipe, responsive placement, and
  full-size viewing without gallery navigation.
- Generate and inspect print PDFs for landscape page dimensions, one-inch
  margins around all printed text, matching left edges for the title,
  metadata, and Ingredients section, compact metadata layout and wrapping,
  expected text, no gallery images, image-toggle behavior, no clipped text,
  and no split ingredient rows. Confirm controls and cook-mode check-off
  are absent. Verify that browser-level orientation override remains possible
  manually because print-dialog interaction is not a deterministic app
  workflow.
- Responsive browser and geometry tests cover representative long and short
  titles, metadata wrapping, available-width use, desktop reading columns,
  the existing 760px reflow boundary, intermediate wrapping, and no horizontal
  overflow on Chromium and Fold 6. Desktop geometry checks verify the narrowed
  navigation rail fits Settings, account and utility controls without clipping;
  private summary and reading geometry checks verify both share the title's
  full main-content width, while public reader checks retain centered 1-inch
  gutters above the 1012px measure. Axe checks cover changed controls and
  semantics.
- Time-summary tests verify that Total Time precedes component times, fills its
  own row above them on mobile, and is separated from the first component time
  by a fixed vertical rule centered in the gap on desktop.
- Write all focused automated tests before production changes. Then run the
  affected unit, API, browser, accessibility, TypeScript, targeted Biome,
  Markdown lint, and production-build checks.

## Review decisions and assumptions

Confirmed decisions:

- Keep the current reading order: identity and attribution, compact summary,
  then the recipe-reading content. Preserve the Ingredients/Instructions
  composition and adapt its width responsively.
- Compact horizontal metadata is print-only; the on-screen metadata
  arrangement otherwise remains unchanged. Total Time is shown first in the
  private and public time breakdowns, above component times on mobile and
  separated by a fixed vertical rule on desktop.
- Private recipe title, summary, and reader share the full width inside the
  private page's outer gutters. Public recipe readers retain their separate
  centered 1-inch gutter behavior above the 1012px measure.
- Public print mirrors the guest page's current visible recipe content and
  transient choices, not private recipe content. Controls are not printed.
- Private print preferences are account-wide and print-only. Preserve the
  existing instruction-emphasis preference; only the inline-photo preference
  is new. Both are enabled by default.
- Public inline-photo and emphasis choices affect the visible guest page and
  its print output, default to the current appearance, and do not persist.
- Text-labeled public toggles supersede the icon-only emphasis control in the
  current visual-design guide; update that guide after implementation checks
  confirm the new behavior.
- Never print gallery photos. Do not change public authorization or expand the
  public data allow-list.
- Landscape is a CSS print default; the browser print dialog can override it.

Assumptions to verify during implementation:

- Retain the existing 760px reader reflow threshold unless tested content
  demonstrates that the widened layout needs a different boundary.
- Keep all printed recipe sections inside the same one-inch page margin; PDF
  inspection confirms the prior 18mm margin was narrower than required.
- Keep existing public photo display and private/public image authorization
  unchanged on screen; the new photo choices affect printing on private pages
  and both screen and print on public pages, as specified above.

## Completion criteria

The public screen and public print remain the same recipe presentation except
for hidden controls; private print follows the owner's site-wide preferences
without changing private screen presentation. Privacy, image handling,
responsive layout, and accessibility acceptance pass on Chromium and Fold 6.
Record verified behavior in the comprehensive reference, visual guide, and
roadmap only after the implementation checks pass.
