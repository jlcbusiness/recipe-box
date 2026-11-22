# Purpose: Prepare, review, implement, and verify DLC 48 pre-recipe preparation instructions

## Progress History

- 2026-11-20: Started DLC 48 after confirming there was no matching continuity stream. The user approved creating this stream. The existing DLC 48 notes are a draft with open decisions; production changes wait for review of a resolved brief.
- 2026-11-20: Read the slice contracts and traced the current recipe Notes, save, public projection/copy, history, bundle, output, and offline paths. The user confirmed that Prep ahead is public only when its recipe is linkable. Replaced the draft notes with a review brief; production work remains paused pending review.
- 2026-11-20: The user clarified that Prep ahead is pre-work instruction, not a note. Renamed the brief/index accordingly. Inspection of the paginator found it repeats the instruction section per page and measures only the heading/list; the brief now requires a first-page-only preface, height accounting, and explicit handling when it cannot fit.
- 2026-11-20: The user selected a dedicated recipe-level field rather than a special `recipe_steps` row. The brief records that it is instructional content but has no step position, number, or reorder behavior.
- 2026-11-20: The user approved the revised brief. Read the installed Next.js Server Function and forms guides, confirmed the local app is available but signed out, and identified the relevant private/public and bundle tests. Implementation is proceeding test-first.
- 2026-11-20: Implemented Prep ahead across persistence, private/public readers, history, import/export,
  offline snapshots, and paginated output. Updated the portable format to schema version 15 and the app
  version to 1.20.0; focused unit, database, and E2E checks passed.
- 2026-11-20: Controlled the editor field after a stale-save E2E exposed lost draft text; the focused
  conflict test passed after the change. Updated the decision log, DLC brief/index, roadmap, and data model.
- 2026-11-20: Final checks confirmed TypeScript and targeted Biome pass. The full database suite still
  fails only in admin-update reorder assertions, reproduced by running that test file alone. Full lint
  and Markdown lint also report unrelated repository diagnostics; details are in the execution trace.
- 2026-11-20: The user reviewed the rendered editor and requested Prep ahead as its own section above
  Instructions, using the standard instruction-entry row instead of a Notes-style multiline box.
- 2026-11-20: Reworked Prep ahead as a distinct unnumbered pre-instruction row with ingredient
  autocomplete and duration emphasis. Focused browser tests verified persistence, ingredient deletion
  unlinking, duplicate ID remapping, section order, and responsive geometry; duration markers do not add
  recipe time. Desktop, Fold 6, and mobile screenshots were captured and reviewed during E2E validation.
- 2026-11-20: The user requested the display label **Pre-recipe Prep**, a red treatment for its text
  and icon, and investigation of a possibly missing Rating glyph. The detail page still conditionally
  renders `RecipeRatingAction` for Tried recipes, which includes the vector-hand artwork; rendered
  verification is pending.
- 2026-11-20: Renamed the dedicated pre-instruction to **Pre-recipe Prep** and applied the tomato-red
  accent to its editor label, callout heading/icon, and title indicator; updated user-facing copy,
  tests, and product documentation. Typecheck, 33 focused unit tests, and the label/save, duplication,
  history, and offline E2E cases passed. The Rating E2E confirmed the unrated glyph and tone colors
  before a later mobile menu-position assertion failed; Chromium timed out after a dev-server stream
  error. See the latest trace entry for details.
- 2026-11-20: The user clarified that unrated recipes should not reserve toolbar space for Rating.
  Removed the desktop Rating track, shifted the mobile Star/Heart group into the freed slot, and
  added narrow-container stacking for photo and no-photo recipe headings. Updated the visual-design
  contract and E2E assertions. The responsive assertions passed before later failures in the same
  runs: mobile action-treatment equality and compact-gallery geometry.
- 2026-11-20: Opened the synthetic-admin recipe detail in the integrated browser at 862px and 390px.
  Screenshots confirmed the title/toolbar stack, no horizontal overflow, no empty Rating gap, and
  Star/Heart shifted right on mobile with Duplicate adjacent. The 1280px geometry also had no
  overflow. Stopped the local test server after checking.
- 2026-11-20: Resolved the two later E2E failures. The action-treatment comparison now blurs the
  Duplicate control first so it compares default styles rather than a focused button; the compact
  gallery test waits for the gallery, feature image, and thumbnails to be visible before measuring.
  The focused media and recipe-marker tests passed on Chromium and Fold 6.
- 2026-11-22: Resumed in session `8ba5d6e4-739c-4867-9bd8-6d5ddd9d9c36` for a follow-up bug report.
  The shared public projection remapped ingredient mentions in cooking steps but not in
  `prep_ahead_markdown`; the hashtag parser also rejected a mention followed by a terminal hyphen.
  Fixed both and added focused unit and browser regression coverage. The public page now resolves
  the shared prep mention and shows its amount tooltip on Chromium and Fold 6. The existing
  visual-design contract already requires public prep references to resolve against public
  ingredient rows.

## Save Point

- **Goal/status:** DLC 48 and follow-up fixes are complete; shared Pre-recipe Prep ingredient mentions resolve, and terminal hyphen punctuation no longer blocks typed mention parsing.
- **Repository/branch:** `/home/joshlamont/Code/recipe-box`, `main`.
- **Current step:** Shared prep-reference projection and terminal-hyphen parsing fixes are complete.
- **Last verified result:** Focused unit tests passed (41/41); the shared public recipe E2E passed on Chromium and Fold 6 (2/2); typecheck, targeted Biome checks, and `git diff --check` passed.
- **Next action:** No further changes requested.
- **Checklist:** [checklist.md](./checklist.md)
- **Execution trace:** [trace.md](./trace.md); latest section is `2026-11-22 — Shared Prep reference follow-up`, session `8ba5d6e4-739c-4867-9bd8-6d5ddd9d9c36`; last recorded action is recording focused unit, browser, typecheck, and lint results.
