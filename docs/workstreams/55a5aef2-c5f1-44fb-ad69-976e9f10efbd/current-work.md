# Purpose: Implement the approved recipe duplication slice

## Progress History

- 2026-11-12: Started a candidate slice from the Updates request to duplicate a
  recipe for editing. Compared scoped imports with public-recipe saving. The
  user confirmed an editable `Name (Copy)` default and clarified that direct
  public saves need a separate marker from the protected source attribution
  copied with a duplicate.
- 2026-11-12: Drafted DLC 36 and added it to the delivery and DLC roadmaps.
  The brief proposes a dedicated server-owned copy workflow, protected
  attribution on duplicates, and `saved_from_public_id` only on direct public
  saves. `git diff --check` passed; targeted Markdown lint could not run because
  `node_modules/.bin/markdownlint` is absent. Implementation and canonical
  contract updates remain pending review.
- 2026-11-12: The user requested a square copy-icon action to the left of Edit
  on desktop, and Page Settings moved to the right of Heart on mobile. Updated
  the candidate brief accordingly after inspecting the current detail action
  row, mobile CSS, visual contract, and geometry tests. The local app opens to
  Sign in, so authenticated recipe-detail rendering was not inspected.
- 2026-11-12: The user approved the revised brief. Implementation remains
  paused because the request was to prepare and review the brief, not to begin
  coding.
- 2026-11-12: The user requested implementation and authorized use of local
  synthetic accounts. Resumed the approved DLC 36 workstream; implementation
  has not yet changed application files. The existing import planner remaps
  recipe-graph IDs, and the import commit path stages media before an atomic
  database commit. These are the leading reuse points for the dedicated copy
  workflow.
- 2026-11-12: Rendered the existing recipe toolbar with an E2E-created local
  account at desktop, 390px, and 314px widths. The test had assumed a
  linkable recipe without making one; updated its fixture to publish the
  temporary recipe and the baseline geometry test passed. The local Supabase
  stack was started without a reset.
- 2026-11-12: Resumed implementation in session
  `b21fd5aa-52f4-469a-a29f-a72f97daa263`. The focused local pgTAP run passed
  all 19 assertions across public-copy protection and DLC 36 duplicate
  permissions/lifecycle checks. Its first run exposed missing authenticated
  JWT claims in the new SQL test fixture; setting those claims fixed the
  fixture, and the rerun passed.
- 2026-11-12: Extended the toolbar E2E to submit a duplicate and verify the
  editor name and private database row; focused Chromium E2E passed. Also
  inspected the seeded synthetic owner's detail toolbar and duplicate dialog
  at desktop and mobile widths, then signed out without submitting or
  changing fixture data.
- 2026-11-12: Updated the canonical product, data, visual, import/export, and
  roadmap documents; marked DLC 36 implemented and bumped the app version to
  1.10.0. Added focused photo-staging route coverage and backfill tests for
  both unambiguous and ambiguous protected-source references.
- 2026-11-12: The local SQL suite passed 21 pgTAP tests; the unit suite passed
  653 tests plus 8 bootstrap-admin checks. Focused duplicate/import tests
  passed 95 tests, Chromium duplicate submission E2E passed, and typecheck,
  production build, and final `git diff --check` passed. Full repository
  Biome and Markdown lint remain nonzero on repository-wide findings; scoped
  TypeScript checks passed with warnings, and changed docs have no Markdown
  errors.
- 2026-11-12: The user requested shorter bold duplicate-dialog labels with
  visibly separated fields, Page Settings before Print on desktop, and
  swapped Copy/Page Settings positions and treatments on mobile. Updated the
  UI, visual contract, slice brief, and responsive E2E assertions. Desktop and
  mobile screenshots showed distinct field panels, the requested action order
  and colors, and no overlap; focused E2E, typecheck, and final diff check
  passed.
- 2026-11-12: The user reported that the mobile privacy toggle looked
  unexpectedly shortened. The private state had a 36px grid track and no
  compact state label, hiding “Private.” It now keeps the state label visible,
  uses a 128px column at standard mobile widths and 72px at narrow widths,
  while the Linkable “Can / Link” state remains 60px. Rendered checks and the
  focused responsive E2E passed without horizontal overflow.
- 2026-11-12: The user clarified that the toggle should not resize when
  switching states. Private and Linkable now share a 128px column above 380px
  and a 72px column at narrow widths. The responsive E2E verifies equal
  widths in both states at 390px and 314px and passes.
- 2026-11-12: The user preferred a compact, consistent toggle length. Set the
  mobile toggle to 72px in both states at all tested widths, updated the
  comprehensive reference, visual guide, and DLC 36 brief, and verified the
  private/linkable renders side by side at 390px. The focused responsive E2E
  passes at 390px and 314px with no horizontal overflow.

## Save Point

- Goal: implement the approved workflow for duplicating an owned recipe.
- Status: implemented, including the requested visual refinement; no commit or
  hosted database change made.
- Repository/branch: `/home/joshlamont/Code/recipe-box`, `main`.
- Current step: complete; await any requested follow-up.
- Last verified result: the responsive toolbar/dialog Chromium E2E passed
  with field geometry, toolbar ordering, privacy-state labels and widths,
  button-color, and Axe checks;
  typecheck, focused Biome error check, and `git diff --check` passed.
  Desktop and mobile screenshots confirmed equal 72px Private/Linkable toggle
  widths at 390px; responsive E2E verifies 390px and 314px.
- Remaining limitation: photo staging and cleanup are covered by route tests
  with mocked Storage; a live Storage photo-copy integration run was not done.
  Full repository Biome and Markdown lint remain nonzero on findings outside
  the changed UI/docs.
- Next action: none unless the user requests follow-up. No reset, hosted
  migration, commit, or push was performed.
- Checklist: [checklist.md](./checklist.md)
- Trace: [trace.md](./trace.md) — session
  `b21fd5aa-52f4-469a-a29f-a72f97daa263`; latest entry records the UI
  refinement and rendered checks.
