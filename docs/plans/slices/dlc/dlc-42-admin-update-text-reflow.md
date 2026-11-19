# DLC 42: Admin Update Text Reflow

**Status:** Implemented and verified; app version **1.15.1**.

## Outcome

Admin Update text stays readable when a row's text column becomes narrow. When
less than 2 inches are available for the text, the body moves to a full-width
second row instead of wrapping into a very narrow column.

## Scope

- Base the threshold on the Update row's available text width, not the device
  or viewport category. A tablet can need the same reflow as a phone.
- Keep completion, reorder, classification, and row actions on the first row.
  Let the text use the available width on the following row.
- In reflowed rows, keep the reorder drag target within the controls row so it
  does not overlap the text field.
- Preserve the current editing, saving, ordering, and completion behavior.
- Do not change the Update data model or add a new responsive mode elsewhere.

## Proposed behavior

- At 192 CSS pixels or more of usable textarea text width, retain the current
  row layout. Measure after excluding the textarea's 4px horizontal padding on
  each side; 2 CSS inches equals 192 CSS pixels.
- Below 192 CSS pixels, move the text to a second row. Align the visible text
  start with the left edge of the completion checkbox, and extend it to the
  row's trailing edge. Keep the row's controls usable and associated with that
  text.
- Use a container-aware layout condition or an equivalent measurement of the
  text column. Do not use a phone-only media breakpoint as a substitute.
- Preserve wrapping, draft resizing, focus, keyboard, and touch behavior.

## Acceptance criteria

1. A row with at least 192 CSS pixels of usable textarea text width retains the
   current arrangement; a row below 192 CSS pixels moves its body to the second
   row.
2. Reflowed text starts at the completion checkbox's left edge and extends to
   the row's trailing edge, with no clipped text, vertical-letter wrapping, or
   page-level horizontal overflow.
3. Completion, reorder, classification, and edit controls remain reachable and
   operable at desktop, tablet, phone, and 320px viewport widths. The drag
   target does not overlap second-row text.
4. Browser coverage exercises both sides of the 192px threshold and confirms
   that resizing the list container without changing the viewport updates the
   layout.

## Confirmed decisions

- The user confirmed the 192 CSS-pixel threshold measures textarea text content
  width, excluding its horizontal padding. After reviewing the 320px layout,
  the user requested that reflowed text align with the checkbox's left edge,
  replacing the initial 64px-rail alignment.
- Classification and trailing action controls fit in the first row at a
  320px viewport width.

## Implementation and verification

- The Updates component measures the actual text grid track, subtracts the
  textarea's horizontal padding, and updates reflow when the list, row, or type
  control changes size. The body moves below its controls only when usable
  width is less than 192px.
- The focused browser test covers 192px, 191px, 193px after resizing the list
  without changing viewport size, checkbox-aligned text at 191px and 320px,
  control reachability, completion dialog, and Escape-cancel edit behavior. It
  passes in Chromium and Fold 6.
- The existing pointer, touch, and keyboard reorder test passes in Chromium and
  Fold 6. Reflowed rows limit the drag target to the first controls row to keep
  it clear of the second-row text.
- The existing Admin Updates lifecycle and accessibility test passes in
  Chromium. Its Fold 6 run timed out at 60 seconds; the focused responsive test
  passes in that project.
- `npm run typecheck`, `npm run build`, targeted Biome checks, and
  `git diff --check` pass. Biome reports five existing
  `noDescendingSpecificity` warnings in `account-admin.css`.
- Version **1.15.1** is a patch release for this responsive layout correction.

## Initial sizing

Low difficulty; about **0.5–1 day**; low churn. This is a layout change in the
existing Admin Updates row and its responsive tests.

## References

- [DLC 28: Admin Updates](./dlc-28-admin-updates.md)
- [DLC 40: Admin Update Change Classification](./dlc-40-admin-update-change-type.md)
- [Visual design: App admin and Updates](../../visual-design.md)
- [Admin Updates component](../../../../src/app/admin/admin-updates.tsx)
- [Admin styles](../../../../src/app/styles/account-admin.css)
