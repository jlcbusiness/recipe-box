# DLC 09: Standalone recipe exports

This brief adds portable, human-readable outputs beyond the ZIP bundles in
[Slice 20](../20-export.md). It also extends the print layout from
[DLC 08](dlc-08-recipe-public-and-print-layout.md) with readable pagination.
The comprehensive reference remains the product authority.

## References

- [First-draft specification](../../first-draft-spec.md), Views and Sorting,
  Sharing and Authentication, and Import, Export, Lifecycle, and History
- [Comprehensive reference](../../comprehensive-reference.md), §§ 4, 9.3,
  9.4, 11, 13, and 16
- [Data model](../../data-model.md), Ownership and Configuration Boundaries
- [Design philosophy](../../design-philosophy.md), Information Hierarchy and
  Interaction
- [Visual design guide](../../visual-design.md), recipe detail actions,
  public recipe controls, and baseline print
- [Decision log](../../decision-log.md)
- [Slice 20: Export](../20-export.md), recipe ZIP authorization and delivery
- [DLC 08: Recipe reading, public, and print layout](dlc-08-recipe-public-and-print-layout.md)

## Outcome

A person can use **Print & Download** to print a recipe or download it as a
self-contained HTML document, one or more PNG page images, or an
application-generated PDF. All four outputs use the same **Page Settings**.
The existing **Export** action remains for owner-authorized ZIP bundles.

## Scope and decisions

- Generate HTML, PNG, and PDF in the browser. The existing ZIP bundle remains
  available to owners and keeps its server-side delivery path.
- Add an accessible **Print & Download** menu to private and public recipe
  pages. It offers Print, HTML, PNG, and PDF. Keep the existing private
  **Export** action separate for owner-authorized ZIP bundles; do not expose
  that action or ZIP bundle export to anonymous visitors.
- Capture the active reader state, including scale, units and per-ingredient
  overrides, ingredient presentation, and visible order. Files are static
  snapshots and do not change the recipe or reader state.
- Match DLC 08 print media rules. Omit gallery photos. Private standalone
  exports respect the account's inline-photo print preference; public exports
  respect the current public-page inline-photo toggle. Embed any included
  instruction photos in the HTML document for offline use.
- Put **Repeat ingredients on each page**, **Include instruction photos**, and
  **Use emphasis colors** in a separate **Page Settings** menu after Export in
  the private recipe action toolbar. Order the actions **Print & Download**,
  Export, **Page Settings**, then Edit. These options apply consistently to
  Print, HTML, PNG, and PDF. Private values start from saved Settings
  preferences; changes in Page Settings are transient for the loaded page and reset to those defaults
  on reload. Public values are transient, update the visible public recipe and
  its outputs, and reset on reload without reading or writing account
  preferences or browser storage.
- On mobile private recipe detail, keep the Page Settings and Print & Download
  menus centered beneath the action toolbar and within the viewport.
- At 640px and below, show a Download icon and use the accessible name and
  tooltip `Download` for the output trigger on private and public recipes.
  Keep the same Print, HTML, PNG, and PDF menu; wider layouts retain the
  printer icon and `Print & Download` name.
- Keep public Download and Page Settings controls 36px square with 48px mobile
  hit areas, matching the private recipe controls.
- On mobile public recipe detail, center the output menu beneath the title
  actions and keep it within the viewport.
- Add **Include private-only details** to Page Settings on private recipe pages
  only. It applies to Print, HTML, PNG, and PDF and resets to the saved Settings
  default on reload. The account default is off.
- With **Include private-only details** off, omit owner-only metadata (State,
  Verdict/Enthusiasm/Reason, Occasion Details, Food Type, Meal Type, and
  Cuisine), notes, pairings, and references. Keep the recipe title, servings,
  public-safe timings and equipment, ingredients, instructions, and the
  independent instruction-photo choice. Turning the option on includes those
  owner-only details in the generated output. Recipe tags remain excluded from
  standalone output regardless of this option.
- Generate private output only from the authenticated owner's recipe view.
  Public exports use only the existing public recipe allow-list and public
  media authorization; they never show this option or read/write its account
  preference. Public output must not contain account preferences, private
  fields, private Storage paths, signed URLs, or owner-only relationships.
- HTML is an unpaginated, self-contained snapshot of the recipe reader's
  responsive screen layout, with semantic headings, ingredient lists, and
  ordered instructions. Remove interactive controls, gallery photos, tags,
  and private-only details when disabled; retain instruction-photo sizing and
  the screen's natural reading order. Interactive ingredient units must not
  retain inert click affordances. Opening the saved file must not require an
  app session, application route, or remote stylesheet.
- PNG output uses landscape US Letter page images at 300 DPI. First try to fit
  the full recipe on one page. If fitting it would reduce recipe text below
  3 mm in height, paginate at instruction boundaries as needed, repeat the
  complete ingredients column on every page, and continue the instructions
  in the adjacent column. Keep page margins at 1/4 inch, show a page number on
  each image, continue instruction numbering across pages, and do not silently
  shrink text below 3 mm or clip content. Download a single PNG directly; when
  there are multiple PNG pages, download one ZIP containing numbered PNG files.
- PDF is generated by the application, not by opening the browser print
  dialog. Use the same landscape US Letter pages, 300 DPI rendering,
  1/4-inch margins, minimum 3 mm recipe text, instruction pagination,
  repeated ingredients column, and photo rules as the new Print behavior.
- Print uses the new paginated layout by default. **Repeat ingredients on
  each page** starts from the saved private Settings preference, enabled by
  default for public pages. Changing it in Page Settings affects the current
  page and its outputs only; unchecking restores the legacy print layout for
  those outputs. If the full ingredient column cannot fit at the minimum text
  size, Print instead continues ingredient groups across pages without
  repeating the full column; this print-only fallback prevents clipping.
  Standalone formats continue to report a clear error for that geometry. The
  setting does not change screen reading.
- Use the sanitized recipe title in filenames. A one-page PNG uses
  `<title> - Recipe.png`; multiple pages use
  `<title> - Recipe Pages.zip` with numbered PNG entries. HTML and PDF use the
  same base name with `.html` and `.pdf`. The owner-authorized recipe-data ZIP
  keeps its distinct `Recipe Export` filename.
- Do not add a recipe-to-instruction-set relationship in this slice. Linking
  ingredient sets to instruction groups is a separate future authoring and
  data-model feature.

## State and boundaries

- The private repeat-ingredients setting is a non-null Account preference,
  defaulting to `true` for existing and new accounts. Update it through the
  existing owner-derived preference boundary, include it in full database
  bundles, and keep it optional when importing older bundles.
- The private-details setting is a non-null Account preference, defaulting to
  `false` for existing and new accounts. Update it through the owner-derived
  preference boundary, include it in full database bundles, and keep it
  optional when importing older bundles.
- The public checkbox is transient to the loaded page and resets to checked on
  reload. It does not read or write Account preferences, recipe data, browser
  storage, or history.
- Selecting an export format starts generation immediately. Show progress and
  a Cancel action; cancellation or navigation prevents a pending download.
  Private recipe Print & Download shares its feedback area with recipe Export;
  public output uses the same area beneath its controls.
  Keep the recipe page and other actions usable, including when a status notice
  overlaps content. The notice can be dismissed by clicking outside while
  generation continues; keep its live announcement available to assistive
  technology. Announce success, cancellation, and recoverable errors
  accessibly; automatically dismiss success notices after five seconds and
  allow retry after failure.
  Public Print automatically invokes the browser print call when document
  preparation finishes, matching private Print without requiring a second
  action.
  Print must leave its working state when the browser's print call returns but
  retain its print document until `afterprint` or the bounded cleanup fallback.
  Do not rely on `afterprint` as the only completion path.
- Browser generation creates no server-side standalone artifact. Abort
  in-flight image fetches on cancellation where supported. Fail rather than
  silently omit a required inline image or report success for incomplete
  output.
- An ingredient column that cannot fit at the minimum text size must not be
  clipped or silently reduced. Report a clear failure for standalone formats;
  print must preserve all content and use the safest readable pagination
  available.

## Acceptance mapped to automated tests

- Unit tests verify safe filenames, page splitting at instruction boundaries,
  empty instruction pages, and invalid page geometry.
- Browser tests verify private owner-only and public allow-list access, and
  prove public output contains no owner-only fields or private media URLs.
- Browser tests verify keyboard operation, visible focus, labels, progress,
  cancellation, retry, and successful Print, HTML, PNG, multi-page PNG ZIP,
  and PDF outputs. They verify the 3 mm text floor, standalone output errors
  and retry, cancel and navigation aborts for in-flight instruction-photo
  fetches, and the print-only ingredient continuation fallback. They also
  verify that output notices do not block other
  controls and can be dismissed. **Print & Download** contains no ZIP action;
  the separate private **Export** action retains recipe-data ZIP access and is
  unavailable on public pages. Print, PNG, and PDF do not wait for stylesheet
  assets that are needed only by standalone HTML.
- Public browser tests verify that Print automatically requests the dialog when
  document preparation finishes, without requiring a second action.
- Browser tests verify **Page Settings** controls all three options for Print,
  HTML, PNG, and PDF; private changes reset to saved Settings defaults on
  reload, and public changes update the visible page and reset on reload.
- HTML contains semantic title, ingredient, and instruction structure in an
  unpaginated responsive layout, has no application-session dependency or
  remote stylesheet, and embeds each instruction photo allowed by the
  corresponding print state. Attribution links have visible spacing, and
  timing and equipment metadata share a compact wrapping summary without
  separate section dividers.
- PNG tests verify a single page when text remains at least 3 mm, multiple
  numbered pages when it would be smaller, full repeated ingredient columns,
  instruction order, 12px instruction-photo margins, and one-file versus ZIP
  delivery.
- PDF inspection verifies raster page content and landscape US Letter pages
  (792 by 612 points),
  1/4-inch margins, 3 mm minimum text, repeated ingredient columns on later
  pages, continuous instruction numbering, visible page numbers, instruction
  order, inline wrapping metadata with consistent label/value alignment,
  12px instruction-photo margins, separated ingredient specifics, media rules,
  and no clipped or missing content.
- Print browser tests verify the generated paginated layout is used by Print,
  private Page Settings changes are transient and restore saved Settings
  defaults on reload, and public changes are transient and restore public
  defaults on reload. They also verify continuous step numbering across page
  breaks, inline wrapping timing/equipment metadata, and balanced photo
  margins. Confirm landscape remains the requested browser-print default.
- Automated accessibility checks cover private and public **Print &
  Download** and **Page Settings** menus, the separate private **Export**
  action, progress, cancel, and error states. Verify the mobile Download name
  and icon retain the same menu, and run responsive geometry and keyboard
  checks at desktop and mobile widths.

## Deferred

Linking ingredient sets to instruction groups, such as printing a main dish
and sauce as separate sections, needs a separate product brief and data-model
decision. It is not required for this export and print pagination.
