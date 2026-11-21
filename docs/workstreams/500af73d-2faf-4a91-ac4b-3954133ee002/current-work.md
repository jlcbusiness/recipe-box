# Purpose: Preparing and delivering DLC 47 publication-type themes

## Progress History

### 2026-11-20

- Confirmed DLC 47 is a draft candidate, not an approved or scheduled slice.
- Reviewed the product/design sources and current publication cover, type-icon,
  detail, and recipe-origin patterns. The app is not running locally, so the
  rendered baseline could not be inspected.
- Updated the slice brief with a proposed palette, asset approach, surface
  boundaries, test criteria, and decisions awaiting approval. No production
  code has been changed.
- User clarified that normal Book, Magazine, and Website covers must not
  change; revised the brief so only the Recipe Tin cover artwork changes.
- User specified that the Tin should reuse the sign-in illustration; confirmed
  the sign-in page uses `src/app/images/logo_detail.png` and updated the brief.
- User questioned preserving the global Tin theme. Revised the proposal to
  replace it with publication-scoped themes and compact recipe-origin cues,
  preserving the documented Tin recipe content treatment.
- User approved the complete design contract. Updated the brief, roadmap,
  DLC index, and decision log; implementation and focused tests are next.

### 2026-11-20 — Implementation and verification

- Implemented the themes, Recipe Tin artwork, accessible type labels, and
  focused responsive/accessibility coverage. Desktop and mobile visuals were
  inspected, and normal cover behavior was preserved.
- Marked DLC 47 implemented in app version 1.19.0 in the brief, roadmap, and
  DLC index. Typecheck, production build, focused browser tests on Chromium and
  Fold 6, changed-file lint, changed-document lint, and whitespace checks pass.
- Repository-wide lint still fails on two unused imports in an unchanged
  ingredient editor file. Earlier broader E2E failures were not rerun after the
  focused assertions were updated. The earlier local synthetic seed attempt
  stopped on an ambiguous URL; any partial local writes remain unreconciled,
  and no reset or retry was performed.

### 2026-11-20 — Expanded theme scope

- User clarified that the type palette must carry across publication-owned
  pages and shared navigation, not stop at labels. Non-publication routes
  should retain the default palette. The first implementation did not meet
  this intent; extending the route-scoped palette and revising its tests/docs.
- Applied the full palette to publication detail, associated private recipe
  detail/edit/history pages, the selected-publication recipe form, and shared
  navigation. The mixed-type Library and unrelated routes retain their
  defaults.
- Preserved the normal Site cover colors independently of the active route
  palette and added a detail-page color assertion. Desktop and mobile Site
  screenshots confirm the plum page/navigation with the original green cover.
- Updated the slice brief, visual guide, comprehensive reference, decision
  log, roadmap, and DLC index to match the clarified scope.
- The focused theme, Site-cover, recipe-link, and export tests pass on
  Chromium and Fold 6. Typecheck and production build pass; changed-file
  Biome reports warnings but no errors, and `git diff --check` passes.
- Repository-wide Markdown lint still reports pre-existing errors. The
  publication-creation E2E test also reaches an unchanged stale `cite`
  selector that has no matching element in the current recipe attribution;
  that unrelated assertion was left unchanged.

### 2026-11-20 — Palette refinement

- Replaced the nearly indistinguishable 97/3 sRGB mixes with publication-hue
  mappings that preserve each green role's HSL saturation and lightness. Book
  is blue-gray, Magazine gold, and Site plum; page and menu remain very light,
  with the menu lighter than the page.
- Kept Recipe Tin and the mixed-type Library canvas on the default palette.
  Existing Library icon and label accent colors remain intact; a previous
  checklist idea to tint individual Grid cards was removed because it conflicts
  with the approved mixed-Library contract.
- Updated the DLC brief, visual guide, comprehensive reference, and decision
  log to match the refined mapping.
- Focused theme E2E checks pass on Chromium and Fold 6. Desktop/mobile
  screenshots were inspected: the Site tint is distinct but pale, and Tin
  remains on the default palette. Typecheck, production build, and
  `git diff --check` pass. Targeted Biome reports warnings but no errors;
  repository Markdown lint still reports existing errors.

### 2026-11-20 — Removing redundant publication badges

- Removed visible Book, Magazine, and Site badges from Grid cards, publication
  detail headings, and private recipe breadcrumbs. Kept publication names,
  themed colors, type-icon accessible names, and the Recipe Tin label.
- Updated the DLC brief, visual guide, comprehensive reference, decision log,
  and focused browser assertions to match the decorative-theme intent.
- Desktop/mobile screenshots show the names and publication content remain
  clear without the extra badges. One Fold 6 E2E run passed; later runs stopped
  at the previously observed Library `page-has-heading-one` axe violation.
- Typecheck and production build pass; targeted Biome reports warnings but no
  errors. The targeted Markdown check still finds only the existing long line
  at `decision-log.md:190`.

### 2026-11-20 — Stabilizing the Library heading accessibility check

- The mobile Grid axe check reported `page-has-heading-one`, although the
  captured accessibility snapshot contained the visible Library H1 and the
  responsive styles did not hide it. Adding an explicit visible-H1 wait before
  the axe scan made the focused test pass on both Chromium and Fold 6.
- Documented that the Library H1 remains visible above the explorer at desktop
  and mobile widths and across view modes; added assertions for desktop and
  mobile Grid.
- `npm run typecheck` passed again after restoring `next-env.d.ts` to its
  `.next/dev` references; targeted Markdown lint and `git diff --check` pass.
  Targeted Biome reports one existing `useOptionalChain` warning in the test.
- Both passing E2E runs still log a React/Next stream-write error. The installed
  renderer routes destination errors to its stream-cancel handler; the exact
  trigger is unresolved, and no user-facing or test failure was observed.

## Save Point

- **Goal/status:** DLC 47's decorative publication themes and no-badge
  presentation are implemented in app version 1.19.0; the Library heading
  accessibility check is stabilized.
- **Repository/branch:** `/home/joshlamont/Code/recipe-box`, `main`.
- **Current step:** Badge removal, heading-wait assertions, product references,
  and focused verification are complete.
- **Last verified:** The focused theme E2E test passes on Chromium and Fold 6;
  typecheck, targeted Markdown lint, and `git diff --check` pass. Targeted
  Biome reports one warning in the test. The passing runs still log an
  unresolved React/Next stream-write error.
- **Next action:** None for DLC 47. The unrelated earlier synthetic-seed
  attempt remains unreconciled; do not reset or retry that local database
  without first checking its state.
- **Checklist:** [checklist.md](./checklist.md)
- **Execution trace:** [trace.md](./trace.md), session
  `500af73d-2faf-4a91-ac4b-3954133ee002`, last recorded action: recorded the
  Library heading accessibility follow-up and verification results.
