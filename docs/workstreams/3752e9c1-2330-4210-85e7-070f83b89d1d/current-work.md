# Purpose: Implement and verify DLC 49 Made Counter and Last-Made Stamp

## Progress History

- 2026-11-20: Started DLC 49 preparation in session
  `3752e9c1-2330-4210-85e7-070f83b89d1d`. The worktree is clean. The DLC 49
  brief is a draft candidate with open decisions about day boundaries,
  history, display, and backup scope; production changes have not started.
- 2026-11-20: Reviewed the roadmap rules, canonical recipe/data/history/design
  contracts, DLC 10/44/48 patterns, and the current detail action, export, RPC,
  and test paths. The standing history rule resolves successful marks to normal
  recipe history events; no account timezone preference exists in the current
  code. Updated the DLC 49 brief with a proposed contract and explicit review
  decisions. The signed-in detail screen could not be rendered in the browser,
  so desktop/mobile visual review remains open.
- 2026-11-20: The user selected the invoking device's timezone, a transition to
  Tried, all owner backup scopes, zeroed values for new copies, and a centered
  stew-pot count after Rating/before Share. Updated the brief and canonical
  planning contracts, including bundle schema v16 and public-data boundaries.
  `git diff --check` passes. The brief proposes leaving private print and
  standalone/download output unchanged; that boundary and final contract review
  still await confirmation. No production code has changed.
- 2026-11-20: The user confirmed Made remains out of private Print and
  standalone/download output, and specified that the Made action be disabled
  while State is Will not try so it cannot clear Reason. Updated the brief,
  canonical contracts, decision log, and roadmap to reflect the final choices.
- 2026-11-20: Resumed planning in session `8ba5d6e4-739c-4867-9bd8-6d5ddd9d9c36`.
  The user expanded DLC 49 to include Made count and Last Made in Find Search
  and Query, plus hidden-by-default filterable columns in Find and
  publication-specific recipe lists. Last Made uses explicit date operators,
  not rolling relative windows; its column filter uses date operators rather
  than timestamp facets. The user also specified that changing State to Tried
  initializes Made to one, Tried duplicates reset to Want to try, and legacy
  Tried records may have an unknown date if history cannot recover it. Updated
  the brief and canonical planning docs. Final contract approval is still
  pending; production work has not started.
- 2026-11-20: The user confirmed that publication-specific recipe lists are
  also in scope for the two columns. Updated the comprehensive search reference
  and visual guide. `git diff --check` passes, and a targeted scan found no
  stale DLC 49 status or contradicted Made invariant text. Final contract
  review remains open.
- 2026-11-20: The user chose date-only display for the Last Made list column
  and approved the private-helper approach for deterministic daily-limit
  tests. SQL tests will supply fixed instants to a private helper; the owner
  RPC will take no timestamp and pass database time. Updated the brief and
  visual/acceptance contracts. Final contract review remains open.
- 2026-11-20: The user clarified the count overflow behavior: widen the pot
  action as needed to display the full count instead of shrinking, clipping,
  or abbreviating it. Updated the brief, visual guide, and decision log.
- 2026-11-20: `git diff --check` passes after the width update, and a targeted
  search found no remaining fixed-width or two-digit-only count guidance.
- 2026-11-20: The user specified that the Made pot is outlined with its count
  before today's mark, then filled and disabled after the first successful
  mark; same-day retries preserve the timestamp and count. The user confirmed
  that it returns to outlined/enabled automatically at the next local day
  boundary, including when detail stays open. Updated the slice brief, visual
  guide, and decision log; `git diff --check` passes.
- 2026-11-20: The user added a red X across the Made pot for State Will not try.
  Updated the slice brief, visual guide, decision log, and checklist to keep
  the count legible and the disabled state and Reason accessible.
  `git diff --check` passes.
- 2026-11-20: During final brief review, found and corrected an acceptance
  criterion that contradicted the agreed visible count for Will not try. Also
  found that Last Made date-filter timezone semantics are unspecified; resolve
  before final approval. `git diff --check` passes after the correction.
- 2026-11-20: The user chose the current device timezone for explicit Last Made
  date filters so they match the displayed local date. Updated the DLC brief,
  search reference, decision log, and checklist; `git diff --check` passes.
- 2026-11-20: The user clarified that no count on the crossed-out pot was
  intentional: Will not try means the recipe was not tried. They chose to hide
  count and timestamp in all owner-facing recipe views, keep the stored values,
  treat Made as absent for numeric filters and Last Made as empty, and restore
  values if State returns to Tried. Updated the brief and canonical references.
  `git diff --check` passes, and a targeted scan found no conflicting count-
  visible guidance.
- 2026-11-20: The user confirmed that Made and Last Made sorting must also treat
  Will not try values as absent, so hidden stored values cannot influence row
  order. Updated the brief and canonical references. `git diff --check` passes,
  and targeted searches found the absent-value rules in the affected contracts.
- 2026-11-20: The user approved the expanded DLC 49 contract and asked to begin
  implementation. Marked contract review complete; production implementation
  was ready to start.
- 2026-11-20: Resumed implementation in session
  `8ba5d6e4-739c-4867-9bd8-6d5ddd9d9c36`. The Made action unit tests pass
  (5 tests). Added regression coverage for marking a Want to try recipe that
  has conditional Enthusiasm/Occasion data; it exposed that the local database
  still had the earlier RPC definition. Replaced only that local function from
  the migration source without resetting the database or contacting a remote
  database. The focused database suite now passes all 34 assertions.
- 2026-11-20: Completed DLC 49 implementation and bumped the app to 1.21.0.
  The focused database suite passes all 50 assertions, the focused unit suite
  passes 183 tests across 12 files, and typecheck/build pass. Desktop behavior
  was verified earlier; the 390 CSS-pixel Find view now has no horizontal
  overflow or console warnings with an active Made filter. Updated the brief,
  roadmap, DLC README, and decision log to say implemented. Task-scoped Biome
  passes; repository-wide Biome and Markdown checks still report findings
  outside the task-scoped checks.
- 2026-11-21: Applied the requested Made-pot visual refinements: count over
  the pot body, closed lid and brown/white marked state, and a larger red X.
  Focused Made-action tests, typecheck, targeted Biome, and `git diff --check`
  passed. Browser checks confirmed open and marked states at desktop/mobile
  widths, no horizontal overflow at 390 CSS pixels, and a 48px mobile hit
  area. No current sample recipe is in Will not try, so visual verification of
  the enlarged X remains open. A Next dev server was already running and was
  reused without stopping it; the production build has not been rerun.
- 2026-11-21: The user raised Tried-to-Want-to-try semantics. Recommended
  showing Made as 0 and Last Made as empty while preserving prior values
  internally for mistake recovery; the first Made tap would replace them with
  count 1 and the current timestamp while transitioning to Tried. This policy
  is awaiting user confirmation, and no transition behavior has changed.
- 2026-11-21: The user selected the reversible-until-first-Made-tap policy.
  Implementation is now in progress; the application must show zero/empty
  values in Want to try while retaining stored values until the successful
  Made action commits the reset.
- 2026-11-21: Implemented the selected policy in the detail action, explorer
  column projection, and a new local migration. The Made RPC now ignores a
  preserved same-day timestamp while State is Want to try and commits count
  one with the new timestamp. Search filters and sorting use zero/empty values
  for that state. The local database migration applied without a reset or
  remote target; 61 pgTAP assertions, 6 Made-action unit tests, typecheck,
  targeted Biome, and `git diff --check` passed. Browser checks at mobile and
  desktop widths showed Made zero and no Last Made date in detail; Find also
  showed Made 0 and an empty Last Made cell. No recipe data was changed.
- 2026-11-21: Reproduced the pot shift with a temporary browser state: the
  56px `×` grid item expanded the row and pushed the pot down 10px. Replaced it
  with the requested `✘` as an absolute overlay and reserved the Last Made row
  so adding its text does not reflow the heading. Browser geometry at 1504px
  and 390px CSS widths showed unchanged toolbar and heading bounds when the
  text is inserted, and a centered pot with no grid expansion. The temporary
  state was restored without changing recipe data. The focused Made-action
  tests (6), typecheck, targeted Biome, and `git diff --check` passed; the
  production build remains unverified while the dev server is active.
- 2026-11-21: Refined the red `✘` per the user's feedback: set it to 36px and
  shifted it 7px down to align with the pot body, matching the count's
  positioning. Updated the visual contract. A temporary browser state at
  390px showed the smaller cross centered over the body; geometry at 390px and
  1504px matched the count's body-center offset. The page was restored without
  changing recipe data.
- 2026-11-21: Verified the requested Last Made placement and status position.
  At 1504px and 390px CSS widths, browser geometry showed Last Made right-
  aligned above the first action row and feedback starting at the toolbar's
  bottom; toolbar bounds remained stable with both elements present. The
  temporary DOM was removed and the browser returned to its original mobile
  width without changing recipe data.
- 2026-11-21: Moved the Will not try `✘` from the pot-body offset to the center
  of the full 36px pot glyph, leaving the Made count's body alignment intact.
  Updated the visual guide, decision log, and DLC 49 brief. Temporary browser
  simulations at 1504px and 390px showed the cross and pot centers match
  exactly; the page was restored without changing recipe data.
- 2026-11-21: Shifted the X 3px below the full-glyph center, italicized Last
  Made, and matched the status-to-toolbar gap to the Last-Made-to-toolbar gap.
  At 1504px and 390px, temporary browser geometry showed the X offset is 3px,
  Last Made is italic, and the respective gaps are 8.4px/8px and 4.4px/4px.
  Toolbar bounds stayed stable; no recipe data changed.
- 2026-11-21: Shifted the negative Rating hand and signed score down 10px
  together, preserving the 36px trigger and neighboring controls. The desktop
  Made-feedback spacing is scoped only to Made after the existing Rating check
  caught the broader offset. A temporary browser fixture at 1504px and 390px
  showed the frame and neighbor stay fixed and the score remains centered in
  the moved palm. The focused Chromium E2E reached and passed the new glyph
  assertions, then failed at its 320px status-gap check (10px measured versus
  4px expected). The initial two-project run also reported a Fold 6 menu
  x-position assertion failure; that variant was not rerun after scoping.
- 2026-11-21: Moved the negative Rating hand and score 2px farther down, to
  12px, and updated the geometry assertion and Rating contracts. The focused
  Chromium E2E passed the new glyph checks at desktop and 320px, then failed at
  the existing 320px feedback-gap check (10px measured versus 4px expected).
  Biome completed with 44 warnings and no findings on the changed lines;
  `git diff --check` passed.
- 2026-11-21: Shifted the positive-score thumbs-up hand and in-palm value down
  1px together, and updated the Rating contracts and geometry test. The first
  E2E attempt applied the numeric helper to the unrated `clear` gesture and
  timed out; the test now selects a positive score before checking geometry.
  The focused Chromium run passed that check, then failed at the existing
  320px feedback-gap assertion (10px measured versus 4px expected).
- 2026-11-21: Shifted the positive in-palm score 3px right, leaving the
  thumbs-up artwork and its 1px vertical offset unchanged. Updated the
  expected palm center and visual contracts. The focused Chromium test passed
  the positive geometry check, then failed at the existing 320px feedback-gap
  assertion (10px measured versus 4px expected). `git diff --check` passed.
- 2026-11-21: Adjusted the positive in-palm score from 3px to 2px right at the
  user's correction. Updated the expected center to 20px from the hand's left
  edge and synchronized the visual contracts. The focused Chromium run passed
  the geometry check, then failed at the existing 320px feedback-gap assertion
  (10px measured versus 4px expected).
- 2026-11-21: Shifted the clear-state thumbs-up hand and in-palm `?` down 1px
  together, preserving the 36px action frame. The geometry test passed at
  desktop and 320px, then failed at the existing 320px feedback-gap assertion
  (10px measured versus 4px expected). Biome completed with 44 warnings and no
  findings on the changed source lines; `git diff --check` passed.
- 2026-11-21: On desktop with Rating present, shifted only the Star and Heart
  SVGs down 7px to center them on the thumbs-up palm. Live geometry at 1024px
  showed both icon centers at the palm center while their 36px buttons stayed
  aligned with the Rating frame. At a 312px mobile viewport, icon transforms
  were absent and icon centers stayed on their button centers. The focused
  Chromium E2E passed the new assertion, then failed at the existing 320px
  feedback-gap check (10px measured versus 4px expected). CSS-only Biome
  passed with 10 specificity warnings; the combined CSS/test check also
  reports an unrelated non-null-assertion error in untouched test code and
  44 warnings.
- 2026-11-21: Equalized the desktop visible gaps across Star, Heart, optional
  Rating, Made, and Share while preserving the existing control frames. Live
  no-Rating geometry measured 24.3px, 23.7px, and 24px between glyphs; the
  Rating-present E2E spacing assertion also passed. Mobile spacing rules are
  unchanged. The focused E2E run then failed at the known 320px feedback gap
  (10px versus 4px) and at a separate mobile marker-column expectation
  (expected `4 / span 2`, received `1 / span 2`).
- 2026-11-21: The user clarified that the marked desktop glyph gaps should be
  16px edge-to-edge, not merely even. Updated the desktop grid and optical
  marker offsets, keeping 36px non-overlapping action frames and mobile
  spacing. Browser geometry measured 16.33px, 15.67px, and 16px without Rating;
  the focused E2E assertions passed at 16px ±1px with and without Rating, then
  the tests reached the known feedback-gap and mobile marker-column failures.
  A desktop screenshot was captured. CSS-only Biome passed with 10 existing
  specificity warnings; combined CSS/test Biome still fails on an existing
  non-null assertion elsewhere in the test file. This check measured SVG path
  boxes and was superseded by the rendered-pixel verification below.
- 2026-11-21: The user noted that the visible gaps still did not look right.
  Pixel checks against the annotated screenshot exposed that the prior SVG-box
  assertion did not match rendered edges; it reported 14px, 13px, 14px, and
  14px with Rating, and 14px, 13px, and 14px without. Updated the helper to
  measure screenshot pixels, including the Rating score and Made overlays, and
  adjusted desktop tracks/marker offsets. Pixel-based E2E assertions now pass
  within 1px of 16px in both Rating states. Typecheck, CSS-only Biome, and
  `git diff --check` passed. The focused tests then failed later at the known
  320px feedback-gap and mobile marker-column assertions.
- 2026-11-21: The user clarified that the final 16px spacing target is from
  the Made pot outline to the Share button's outer border, not to the Share
  icon. Added an 11px desktop grid track before the Share button, shifted
  following actions, and changed the pixel assertion to measure the button's
  border. Rating-present and no-Rating spacing assertions passed; the live
  desktop page measured 16px. Typecheck, CSS-only Biome, and `git diff
  --check` passed. The focused E2E tests still fail later at the existing
  feedback-gap and mobile marker-column checks.

- 2026-11-21: Put the mobile Made pot after Heart and before Rating. Made
  success feedback now spans the toolbar width, is fully right-aligned, and
  remains clear of the photo gallery. A focused 320px E2E test passed in
  Chromium and Fold 6; the rendered success-state screenshot confirmed the
  placement. Typecheck, targeted CSS Biome, E2E Biome lint, and
  `git diff --check` passed.
- 2026-11-21: The user clarified the mobile sequence as Star → Made → Heart →
  Rating. Expanded the semantic marker fieldset to three tracks and placed Made
  in its middle slot; Duplicate follows Rating when shown or Heart otherwise.
  Focused 320px E2E checks passed in Chromium and Fold 6 for both Rating states,
  retaining the 48px Made target and marker grouping.
- 2026-11-21: The user identified Pasted Image 2 as the intended layout:
  Star → Heart → Made → Rating, with Duplicate in the far-right column under
  Edit. Restored that mobile order, kept the 48px Made target, and fixed the
  Made-column track so first-row spacing remains even. Focused 320px E2E checks
  passed in Chromium and Fold 6 for both Rating states.
- 2026-11-21: The user reported the live screenshot still had a large gap
  between Heart and Made. No restart was needed; the page reflected the active
  CSS, but Made and Rating occupied slots one column too far right. Shifted
  both 36px left, preserved first-row spacing, and added exact 4px assertions.
  All four focused 320px Chromium and Fold 6 E2E runs passed.
- 2026-11-21: The user asked to average the visible gaps around Made. Shifted
  only the Made glyph until the pixel-bounds assertion measured the Heart→Made
  and Made→Rating gaps within 1px of each other; the 48px action area stayed
  fixed. The focused 320px test passed in Chromium and Fold 6.
- 2026-11-21: The user reported the visible gaps still looked uneven. The
  previous assertion measured only the Heart SVG and ignored its outlined
  button edge. The attached screenshot showed a narrow gap from that edge to
  the pot and a wider pot-to-Rating gap. Updated the assertion to measure the
  whole Heart control and shifted only the Made glyph right.
- 2026-11-21: The user requested vertical alignment between the visible pot
  bottom and the Heart control's outer bottom edge. Pixel bounds showed a
  1.95px difference; shifted the pot, lid, and count down 2px without moving
  the button or hit area. The Chromium and Fold 6 pixel checks passed.
- 2026-11-21: The user said the Made pot looked too low and asked to move the
  Rating hand down 1px. Added a mobile-only 1px translation to the hand and
  palm, leaving the 36px trigger fixed. Focused 320px toolbar tests now assert
  those bounds as well as the Made spacing and alignment; Chromium and Fold 6
  passed. The broader Rating E2E still fails later at feedback-gap and menu
  position assertions, which are outside the changed hand/palm transforms.
- Resumed on 2026-11-22 in session 3752e9c1-2330-4210-85e7-070f83b89d1d.
- 2026-11-22: Corrected the mobile feedback offset after focused E2E checks
  showed the earlier rule was overridden by the later base style. Rating and
  Made feedback checks now pass in Chromium and Fold 6; typecheck, targeted
  Biome lint, and `git diff --check` also pass.

## Save Point

- **Goal/status:** DLC 49 is implemented in app version 1.21.0; the pot-sized,
  full-glyph-centered `✘` with its 3px optical offset, italic Last Made, and
  matched Made-status spacing are applied and checked. The negative Rating
  hand and score are shifted 12px down, and the positive hand and score 1px
  down with the score centered 2px to the right in the palm, within the fixed
  action frame. The clear-state hand and question mark are shifted down 1px.
  On mobile, the Rating hand and in-palm mark receive an additional 1px
  downward shift while the 36px trigger stays fixed.
  On desktop with Rating present, the Star and Heart icons center on the
  thumbs-up palm while their buttons remain aligned to the toolbar row. The
  desktop visible gaps are 16px edge-to-edge between Star, Heart, optional
  Rating, and Made glyphs, and from the Made pot outline to the Share button's
  outer border. The existing action frames remain non-overlapping. On mobile,
  the controls are Star → Heart → Made → Rating when Rating is shown, or
  Star → Heart → Made when it is absent; Duplicate remains in the far-right
  column aligned with Edit. Keep 4px visible gaps between the mobile Star,
  Heart, Made, and optional Rating controls; the Made status spans the toolbar
  width and stays right-aligned between the controls and photos without
  overlap. When Rating is present, the visible gap from the Heart control's
  outer edge to the Made pot matches the pot-to-Rating gap within 1px; its
  48px hit area stays fixed. Align the visible pot bottom with the Heart
  control's outer bottom edge.
- **Repository/branch:** `/home/joshlamont/Code/recipe-box`, `main`.
- **Current step:** The 16px desktop spacing is verified. At 320px, focused
  Chromium and Fold 6 E2E checks verify the screenshot-two order and 4px
  visible gaps through Rating; without Rating, Star, Heart, and Made remain
  adjacent and Duplicate stays aligned with Edit at the far right. Made
  feedback remains right-aligned between the controls and photos. With Rating,
  the gap from the Heart control's outer edge to the pot matches the
  pot-to-Rating gap within 1px. The pot bottom aligns with the Heart control's
  outer bottom edge. The mobile Rating hand and palm are each shifted down an
  additional 1px without moving the 36px trigger.
- **Last verified result:** The focused database suite passes 61 assertions;
  6 Made-action unit tests and typecheck passed in the previous step. CSS-only
  Biome and `git diff --check` pass. Browser simulations at 1504px and 390px
  CSS widths show a right-aligned Last Made label above the first action row,
  feedback below it at a matching gap, stable toolbar bounds when both appear,
  and a pot-sized `✘` offset 3px below the full pot glyph center. The Want to
  try detail and Find projections remain verified. The Rating geometry checks
  passed at desktop and 320px with a 12px hand offset and unchanged 36px
  trigger. The focused Chromium E2E passed the positive thumbs-up geometry
  check with the score centered at x=20 relative to the hand. Clear-state
  geometry also passed at desktop and 320px. Live desktop geometry placed Star
  and Heart icon centers at the palm center with unchanged button frames;
  mobile geometry remained unchanged. Desktop spacing checks passed in both
  Rating-present and no-Rating states using rendered screenshot pixels,
  including the Rating score and Made overlays. After the user's clarification,
  the final gap measures from the pot outline to the Share button border; live
  desktop geometry measured 16px. The 320px mobile tests verify both
  Rating-present and no-Rating control orders, Duplicate placement, and the
  Made action's 48px target. The status test also confirms “Made recorded for
  today.” aligns with the toolbar edge, stays below the controls and above the
  photo, and does not overlap it; after reload it verifies desktop
  Rating → Made and mobile Star → Heart → Made → Rating, with Duplicate aligned
  under Edit with 4px visible gaps between the controls. Chromium and Fold 6
  passed. The focused mobile toolbar test also checks the clear Rating hand
  and palm offsets against the fixed 36px trigger; it passed in Chromium and
  Fold 6. Typecheck, targeted Biome lint, and `git diff --check` passed. The
  integrated browser screenshot showed the compact no-Rating
  sequence at 256px, though that viewport clips the far-right Duplicate
  control; 320px E2E checks verified the full row. The latest pixel-bounds
  assertion confirms the gap from the Heart control's outer edge to the pot
  matches the pot-to-Rating gap within 1px in Chromium and Fold 6, while the
  pot bottom aligns with the Heart control's bottom border within 1px. The
  48px Made target and existing 4px button gaps remain intact. Typecheck and
  targeted Biome lint passed. On 2026-11-22, the Rating and mobile Made
  feedback E2E cases passed in Chromium and Fold 6 after moving the mobile
  feedback offset below the base rule. Typecheck, targeted Biome lint, and
  `git diff --check` passed again. The integrated browser remained on the
  sign-in page, so a final authenticated screenshot was not available. See the latest
  [trace](./trace.md).
- **Known validation limits:** No real Will not try recipe was available, so
  the glyph was checked in a temporary browser state without changing data.
  The production build was not rerun while an already-running Next dev server
  was in use. The targeted CSS Biome check and E2E Biome lint pass; full
  Biome `check` still reports a pre-existing formatting difference in the
  palm-centering assertion near `recipes.spec.ts:1623`. The Markdown lint
  script scans all 200 files even when paths are supplied and reports 82
  repository-wide findings; the modified product docs, checklist, and
  current-work record had no diagnostics, while older DLC 49 trace entries do.
  The earlier Rating E2E feedback-gap and Fold 6 menu-position failures were
  not reproduced in the latest focused Rating run. The shared browser tool
  could not exceed a 256px viewport; full-row
  behavior at 320px was verified by Playwright E2E.
- **Next action:** Run the production build when the active dev server can be
  stopped safely; the local server was still responding on port 3000.
- **Checklist:** [checklist.md](./checklist.md)
- **Trace:** [trace.md](./trace.md); latest section is from session
  `3752e9c1-2330-4210-85e7-070f83b89d1d`, covering the mobile feedback
  adjustment, focused Chromium/Fold 6 checks, and remaining validation limits.
