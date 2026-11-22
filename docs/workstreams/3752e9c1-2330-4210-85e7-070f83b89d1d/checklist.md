# Purpose: Implement and verify DLC 49 Made Counter and Last-Made Stamp

- [x] Read the slice preparation rules, product contracts, current DLC 49
  brief, and related implementation and test patterns.
- [x] Resolve the calendar-day, history, display, backup, privacy, and failure
  behavior that affects the contract, including the private-output boundary,
  the Made glyph's outlined/filled daily state, Will not try suppression with
  stored-value retention and absent sorting, and Last Made filter timezone
  semantics.
- [x] Update the slice brief and canonical product/decision documents for the
  original Made action, privacy, backup, and output decisions.
- [x] Resolve the expanded Find Search/Query and publication-list column scope,
  explicit-date filtering, Tried-state count invariant, duplicate behavior,
  legacy unknown dates, and local-date-only column display.
- [x] Review the expanded contract with the user and obtain approval before
  production code.
- [x] Define a deterministic daily-limit test seam that does not expose a
  caller-controlled timestamp.
- [x] Add focused failing tests for the database, export/import rules, and Made
  detail action behavior before implementing those paths.
- [x] Add focused tests for Find/publication filters, sorting, columns, and
  duplicate/public-copy behavior.
- [x] Implement the complete database and application flow.
- [x] Run focused tests, typecheck, build, and visual checks; reconcile the
  brief and roadmap with verified behavior and update the version. The
  task-scoped lint passes; full-repository linters still report findings
  outside the task-scoped checks.
- [x] Apply and verify the requested pot glyph refinements in marked and
  unmarked states at desktop and mobile widths; confirm the 390px mobile view
  has no horizontal overflow and retains a 48px hit area.
- [x] Verify a pot-sized red `✘` centered on the full pot glyph with a 3px
  downward offset in a temporary Will not try browser state without changing
  recipe data; a real Will not try sample remains unavailable.
- [x] Decide how Want to try should present Made and Last Made, and whether
  prior values are preserved until the first Made mark or cleared immediately.
- [x] Implement and verify the approved Want to try transition across detail,
  search/query, filters/sorting, and persistence.
- [x] Verify italic Last Made is right-aligned above the action controls and
  status feedback has the same gap below as Last Made has above, without
  changing toolbar bounds.
- [x] Shift the negative Rating hand and signed score down 12px together while
  keeping the 36px action frame and neighboring controls fixed.
- [x] Shift the positive Rating hand and signed score down 1px together while
  keeping the 36px action frame fixed.
- [x] Center the positive in-palm score 2px farther right without moving the
  thumbs-up artwork or action frame.
- [x] Shift the clear-state Rating hand and `?` down 1px while preserving the
  36px action frame; verify at desktop and 320px widths.
- [x] On desktop when Rating is shown, center the Star and Heart icons on the
  thumbs-up palm midpoint without moving their 36px buttons; retain mobile and
  no-Rating alignment.
- [x] Set desktop visible gaps to 16px edge-to-edge between Star, Heart,
  optional Rating, and Made glyphs, then from the Made pot outline to the
  Share button's outer border; retain non-overlapping action frames and mobile
  spacing; verify both Rating-present and no-Rating layouts.
- [x] On mobile, place Made after Heart and before Rating, and right-align its
  status in the toolbar-to-photo gap; verify no overlap and desktop ordering.
- [x] Reorder the mobile controls to Star → Made → Heart → optional Rating,
  keep Duplicate after the last control and preserve the semantic marker group
  and 48px Made hit area; verify at 320px.
- [x] Match the mobile layout to Pasted Image 2: Star → Heart → Made → optional
  Rating, with 4px visible gaps and Duplicate in the far-right column aligned
  with Edit.
- [x] Equalize the visible gap from the Heart control's outer edge to the Made
  pot with the pot-to-Rating gap within 1px, shifting only the glyph while
  keeping the 48px hit area fixed; verify at 320px in Chromium and Fold 6.
- [x] Align the visible bottom of the Made pot with the Heart control's outer
  bottom border without moving the trigger; verify with rendered-pixel bounds.
- [x] Shift the mobile Rating hand and in-palm mark down an additional 1px
  without moving its trigger; verify at 320px in Chromium and Fold 6.
- [x] Verify mobile Rating and Made feedback stays right-aligned between
  controls and photos; run focused Chromium and Fold 6 E2E checks.
- [ ] Re-run the production build after the refinements when the active
  development server can be stopped safely.
