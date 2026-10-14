# Recipe Box Delivery Roadmap

> **Reference Note:** For the complete catalog of all requirements, edge cases,
> UI behaviors, and design discussions, see [comprehensive reference](comprehensive-reference.md).

## Purpose

This roadmap breaks Recipe Box into small, demonstrable delivery slices. It is
not an implementation specification. Each slice is intentionally incomplete
until the work about to begin expands and verifies its relevant details.

## Current implementation status

Slices 0 through 17, including 12.5 and 13.5, are implemented locally. Slice
13.5 is complete: recipe-form State, Enthusiasm, Verdict, and Food Type use the shared
portal picklist; Meal Type, Cuisine, and Equipment use the recipe-specific
`MultiPicklist`. `RecipeForm` coordinates exclusive visibility and preserves
single values and multi-value ID serialization. Slice 12's private media
pipeline accepts JPEG, PNG, WebP, and
HEIC/HEIF; its CC0 HEIC fixture passes both image normalization and browser
upload/finalization tests, and a failed-storage deletion is verified to retry
successfully. Media workflows and accessibility checks pass in Chromium and
Fold 6. Earlier slices provide owner-scoped recipe
Trash and restore (Slice 8), publications and assignment (Slice 9), the compact
Library Explorer (Slice 10A), publication deletion and restore (Slice 10B), and
title-level Magazine records and source relationships (Slice 11). Slice 11
preserves legacy Publication references as static text and supports recipe-only
in-app references. The roadmap below remains ordered delivery direction for
work not yet implemented; consult the slice briefs and comprehensive reference
for current requirements.

## Mandatory Slice Preparation

Before implementing any roadmap slice:

1. Create a focused slice brief under `docs/plans/slices/`.
2. Read `first-draft-spec.md` first, then the relevant sections of
   [comprehensive-reference.md](comprehensive-reference.md) (the master
  document), `data-model.md`, `design-philosophy.md`, `visual-design.md`, and
  `decision-log.md`.
3. Look up and verify current framework, Supabase, Vercel, library, and browser
   specifics that affect the slice. Do not assume this roadmap contains current
   APIs, configuration syntax, security defaults, or implementation details.
4. Resolve slice-specific product questions, error states, empty states,
   accessibility behavior, data migrations, and acceptance criteria.
5. Design the slice's interfaces, state, time-dependent behavior, and external
  boundaries so every acceptance criterion is deterministically testable
  locally.
6. Identify the smallest end-to-end demonstration and write its focused
  automated tests before writing production code. Begin with failing tests,
  then implement only enough to make them pass.

The slice brief is the authority for that slice's immediate implementation work.
It must link back to the relevant reference sections and record any new decision in
`decision-log.md`.

## Standing Rules For Every Slice

These apply to every slice, so slice briefs do not repeat them.

- **History:** Every new write path records its forensic history events. The
  mechanism (database triggers or application code) is chosen in slice 4.
- **Edit conflicts:** Every save checks the record's version, so an edit from
  another device is detected instead of silently overwritten.
- **Deletion:** Delete means trash, with permanent purge after 30 days.
- **Security:** Every new table has row-level security and tests proving one
  account cannot read another's data. No field becomes public unless it is on
  the public allow-list defined in slice 20.
- **Accessibility:** Keyboard operation, visible focus, contrast, and labels are
  checked by automated tests for each new screen.
- **Test first:** Every behavior, rule, error state, permission boundary, and
  user workflow has deterministic automated coverage written before its
  production code. Manual testing demonstrates the slice; it does not replace
  unit, integration, end-to-end, or accessibility coverage.
- **Local first:** Slices 0 through 24 are built and tested entirely on a local
  machine. Nothing requires a hosted account until slice 25.
- **Slice size:** If a slice brief needs more than one demonstration, split it.

A **proof slice** is a short, throwaway experiment that answers one technical
question. Its output is a decision-log entry, not shipped code.

## Slices

| Slice | Demonstrable Outcome | Must Expand And Verify Before Building |
| ----- | ------------------- | -------------------------------------- |
| 0. Local engineering baseline | On a local machine, one command starts the app and a local Supabase stack, applies the current migrations, and runs the seed script; one command runs unit, end-to-end, and accessibility tests; the README documents local setup. No hosted account is required. Domain tables and sample records are added alongside the slices that define their schemas. | Docker and Supabase CLI availability on the development machine; current Next.js and local Supabase setup; migration and seed workflow; local email catcher for recovery and verification mail; email/password sign-in with verification off; test and accessibility tooling; accessible component foundation and grid approach; environment variable handling that keeps production secrets out of the repository. |
| 1. Sign-in and shell | A person with an account can sign in, sign out, recover a password, and see an empty private shell on desktop and mobile. A minimal Account record establishes the first owner-scoped RLS and private-storage boundary; recipe and other domain tables are not introduced. | Session handling in Next.js; minimal Account record and RLS policies; direct local Auth-user setup for deterministic test fixtures; private storage buckets and ownership paths; password-recovery flow; and accessible navigation. Invitations, admin behavior, production sign-up restrictions, and one-provider enforcement remain slice 2. |
| 2. Invites and admin | With sign-up open locally, anyone can create an email/password account without verification. An existing admin can send an email-bound invite; the invitee confirms it, chooses a password, and can sign in. Admins can grant admin status to existing accounts. | Environment-controlled sign-up mode; Supabase Auth invite API, confirmation route, email template and configured expiry; server-only admin client; account columns and privileges that prevent self-promotion or sign-in-method changes; admin authorization on every action and route; Mailpit tests; no custom invitation table. Production disables provider self-sign-up and configures the first admin invite in Slice 25. Google OAuth and same-email identity-link enforcement are verified before enabling Google in Slice 25. |
| 3. Instruction editor proof | A throwaway page shows the chosen editor accepting markdown, offering `#` autocomplete on desktop and mobile, storing a confirmed ingredient mention, and round-tripping to markdown and plain text. | Candidate editor libraries; markdown syntax for a structured mention; Escape behavior; mobile keyboard behavior; autocomplete accessibility; plain-text projection for search. Record the choice in `decision-log.md`. |
| 4. Recipe card basics | A person can create, edit, and view a Recipe Tin recipe with Name, State (default Want to try), optional integer Serves, compact metadata picklists, times, equipment, and Markdown notes. Opinion shows the active response in the list; mobile shows only Name and Opinion. Picklists wrap naturally, State-dependent fields clear stale values, explicit save commits changes, and history is recorded; no autosave. | Identifiers and schema (including `is_private` default false); per-account picklist seeds and Verdict order; history and edit-conflict versioning; content-sized anchored single-picklists, stable-width checkmark dropdowns, no-grid flex wrapping, compact headings and spinner-free time inputs, centered 36px Serves, view-specific detail order with a dedicated desktop classification row, 36px icon-only Edit controls (accessible name “Edit”, tooltip “Edit recipe”) in both layouts with a 48px mobile hit area, wider desktop list/detail content, and the `Σ` calculate action; desktop/mobile touch behavior. |
| 5. Ingredient rows — complete | A person can add canonical ingredients in a text-first table with one trailing blank row, edit Main/Specifics/Preparation, and reorder by a 12px drag handle or Ctrl+ArrowUp/Ctrl+ArrowDown. Mobile uses a one-column list with a compact row pane. | Delivered with Slice 6 as the unified ingredient-entry workflow; later slices add instructions, settings management, and alternate views. |
| 6. Measurements — complete | A person selects Unit, Count, Things, or Feel. Unit accepts a volume amount, a weight amount, or both; saved values display with the applicable recipe-formatting rules. | Delivered: fixed category picker, viewport-aware custom unit menus, US/metric catalog, parsing and validation, range storage, account picklists, history snapshots, desktop/mobile layouts, and deterministic tests. |
| 7. Instructions and mentions | A person can write ordered markdown steps, type `#` to link or create an ingredient, and see mentions render as styled readable text. | Step schema; mention storage and rename behavior; warning when deleting a mentioned ingredient row; mention default style; plain-text projection for search. |
| 7.5. Reorder interaction polish — complete | A person can smoothly drag ingredient and instruction rows while neighboring rows animate into place, with equivalent keyboard reorder behavior and reduced-motion support. | Reusable animated-sortable approach verified against the local examples; pointer, touch, scroll, cancellation, focus, live-announcement, and reduced-motion behavior; no changes to row data, save contracts, or ordering semantics. |
| 8. Trash, restore, and print — complete | A person can delete a recipe to Trash, restore it with its recipe graph intact, have it purged after 30 days, and print an unscaled recipe matching the current Standard view. | Delivered with owner-scoped, version-checked lifecycle RPCs; active-only read/save boundaries; lifecycle history; idempotent daily local `pg_cron` purge; responsive Trash and restore UI; and Standard-view print styling. Slice 16 adds alternate reader views; printing follows the active view. Verified by local API, Chromium/Fold 6, accessibility, unit, typecheck, lint, and production-build checks. |
| 9. Publications and the Recipe Tin — delivered | A person can create a book, Magazine title, or site; assign or unparent a recipe; and open a publication page listing its recipes. | Delivered with owner-scoped publication records and assignment. Slice 11 consolidated Magazine issues into titles and moved issue details to recipe locations. |
| 10A. Library Explorer — complete | A person can browse publications in List or Grid, filter by type, and sort results using compact controls; List and Grid truncate long mobile titles, and Grid also truncates long authors. | Delivered with a direct icon toggle, server-side active recipe counts, Date Added and Date Changed sorting, a desktop metadata tooltip, centered Recipes header/counts, subtle alternating desktop List rows, keyboard support, and empty states. Slice 18 later added remembered explorer state. Publication `updated_at` is maintained by a forward migration. |
| 10B. Publication deletion and restore — complete | A person can delete a publication using one of the three recipe-disposition choices, then restore the trashed publication and its retained relationships before purge. | Delivered with owner-scoped, version-checked lifecycle RPCs; atomic recipe disposition; independent publication and recipe restore; shared Trash UI; lifecycle history; inclusive 30-day purge boundary; daily `pg_cron` job; and Chromium/Fold 6 accessibility coverage. |
| 11. Source links and relationships — complete | A person can keep one Magazine title as the primary source, record issue/volume/page details and an optional online recipe URL on each recipe, add recipe, external URL, or printed-citation References, and add plain-text or linked Pairs With entries with incoming links shown. | Delivered with title-level Magazine records, recipe-level locations and URLs, recipe-only in-app References, preserved static legacy Publication references, and verified Chromium/Fold 6 behavior. Selected Pairs With links show an edit-only `#slug` while retaining readable names in saved and view modes. See [Slice 11 brief](slices/11-source-links-and-relationships.md). |
| 12. Images — complete | A person can add covers and recipe photos from phone and desktop, see them through signed URLs, and see cover fallbacks. Recipe edit mode uses the primary photo as its contained thumbnail/pencil action (camera fallback); detail centers the primary photo at a maximum 1.5-inch height. | Verified private direct-to-Storage uploads, normalization, signed display, ordering/primary/removal, 20 MiB source limit, 1 GiB account quota, 12-photo limit, cleanup scheduling, and Chromium/Fold 6 workflows. A real CC0 HEIC fixture verifies normalization and upload finalization; a deterministic failed-Storage retry test verifies later cleanup success. See [Slice 12 brief](slices/12-images.md). |
| 12.5. Edit publications — implemented | A person can update an existing Book, Magazine title, or Site's name and type-specific details without deleting and recreating it; its recipes and cover remain associated. | Delivered with an authenticated owner-scoped, version-checked update function; immutable publication type; type-specific validation and URL normalization; append-only update history; and a responsive native editor. Detail shows a static cover, with Edit left and compact Add Recipe right; the editor places the cover manager beside a standard Name field, with Delete left and equal-width Save right. Closing with X or Escape discards the draft. Focused unit, API, and browser acceptance tests pass on Chromium and Fold 6. |
| 13. Scaling and unit conversion — complete | A person can scale by servings, multiply, or divide; set account defaults for volume and weight systems; and override each dimension on one ingredient. Print retains the active scale and units. | Delivered with pure validated conversion/scaling rules, high-precision canonical factors, owner-derived preference updates, accessible navigation controls, local reader state, reset of scale and all overrides, and PDF text assertions. The isolated migration harness verifies defaults for accounts created before and after the migration. Focused unit, API, Chromium/Fold 6, accessibility, typecheck, lint, and production-build checks pass. The full E2E run has unrelated failures in storage, ingredient editing, measurement-editor locators, and recipe-form styling. |
| 13.5. Shared recipe picklists — complete | State, Enthusiasm, Verdict, and Food Type use the shared portal picklist; Meal Type, Cuisine, and Equipment use the recipe-specific multi-select module. Both preserve recipe-form exclusivity, submitted values, and responsive layout with 36px recipe-entry controls. | Delivered with controlled single-select visibility, `aria-pressed` multi-select options, repeated hidden ID serialization, keyboard focus/dismissal, and consistent 36px metadata sizing. Recipe create/edit, conditional fields, multi-select interaction, active-menu axe, and source-link sizing pass on Chromium and Fold 6. See [Slice 13.5 brief](slices/13.5-shared-single-picklists.md). |
| 14A. Settings and personal preferences — implemented | A person can change account Volume, Weight, and View defaults in a wide, unframed Personal preferences section in Settings; no Units shortcut remains in navigation. | Authenticated route; shared portal Picklists with 36px triggers and at least 48px mobile hit areas, backed by the owner-derived preference RPC; independent saves; a mobile-only Hand preference reverses the mobile navigation order; pinned desktop sidebar and accessible save/error state. Later Settings domains appear as working sections when their slices ship, not as empty placeholders. See [Slice 14A brief](slices/14a-settings-and-preferences.md). |
| 14B. Recipe picklist values — implemented | A person can add, rename, reorder, delete, and merge Food Type, Meal Type, Cuisine, Equipment, Verdict, Enthusiasm, Informal Unit, and Unmeasured Phrase values. | Delivered with owner-derived management, optimistic revisions, normalized uniqueness, stable occasion semantics, transactional reference rewrites, and append-only history. Merge is pairwise and requires an explicit keep choice after selecting the counterpart. Settings interactions and database behavior pass on Chromium and Fold 6, including order persistence, optional clearing, required measurement replacement, version/history updates, and owner isolation. See [Slice 14B brief](slices/14b-recipe-picklist-values.md). |
| 14C. Ingredient catalog management — implemented | A person can add, rename, search, merge, and delete canonical ingredients in Settings. Names are normalized and displayed alphabetically; a merge explicitly chooses which name survives. | Delivered with owner-derived revisions and catalog history, case-folded per-account uniqueness, case-insensitive live search with trailing-space whole-word matching, and responsive Settings controls. Merge preserves separate recipe rows, measurements, Main flags, details, preparation, and instruction mentions while updating affected recipe history. See [Slice 14C brief](slices/14c-ingredient-catalog-management.md). Slice 15's density registry depends on this catalog workflow. |
| 14D. Tags and assignment — complete | A person can create or reuse flat tags inline on recipes and publications, remove an assignment from one entity, and manage shared names and pastel colors in Settings. | Delivered with account-owned catalog revisions and history, a searchable inline picker, 16 shared translucent pastel colors, transactional pairwise merge/replacement and recoloring, version-checked entity assignment/history, owner isolation, and responsive accessible controls. Chromium and Fold 6 acceptance, API/history, and axe checks pass. See [Slice 14D brief](slices/14d-tags-and-assignment.md). |
| 15. Trusted densities — complete | A person can define an ingredient's density and see volume and weight auto-fill with a tinted amount field and calculator icon, override it, and have it re-fill when cleared. | Delivered with normalized density storage and history, a collapsed Trusted densities Settings section, bidirectional editor derivation, transient derived/manual state, and responsive accessible UI. Density browser/accessibility tests passed 6/6 on Chromium and Fold 6; density unit tests passed 8/8; the recipe E2E file passed 37 tests with 1 skipped. TypeScript and Biome passed; Biome reports 13 existing CSS specificity warnings. See [Slice 15 brief](slices/15-trusted-density.md). |
| 16. Cooking views — complete | A person can switch Standard and Ingredient-first, sort ingredients four ways, and use mobile cook mode with check-off and wake lock. | Delivered with the saved presentation preference, four transient sort modes, temporary check-off, best-effort wake lock, and active-view printing. Verified with 145 unit tests, 160 E2E passes and 2 skips, 61 accessibility passes and 1 skip on Chromium and Fold 6, TypeScript, Biome, and an isolated production build. Biome exits successfully with 22 non-blocking CSS specificity warnings. See [Slice 16 brief](slices/16-cooking-views.md). |
| 17. Find recipes — implemented | A person can search full text, filter, and sort recipes and publications. Recipes within a publication have the same recipe filters and List/Grid views, with default recipe photos shown in Grid when available. | Delivered with indexed search, typed filters, fixed recipe List fields, sorting and pagination, and a publication-scoped recipe explorer. Responsive List/Grid presentation, row striping, and image-backed card titles have browser regression coverage. See [Slice 17 brief](slices/17-find-recipes.md). |
| 18. Explorer state — complete | A person returns to each explorer with their last-used filters, sort, direction, and List/Grid choice restored; a publication recipe explorer retains its publication scope. | Delivered with per-account `explorer_state` records, validated owner-derived writes, URL precedence, stale or missing scope recovery, blank free-text search restoration, and Chromium/Fold 6, unit, and RLS coverage. See [Slice 18 brief](slices/18-explorer-state.md). |
| 19. Advanced queries and saved views | A person can build, name, save, and pin nested Azure DevOps-style queries and select their List columns. | Operator catalog, type validation, AND/OR precedence, grouping, query serialization, saved-view lifecycle and pinning, recipe-column visibility, explainable summaries, and performance limits. Create a dedicated query specification during this slice. |
| 20. Public links and privacy | A person can make a recipe private or linkable; a guest sees the public cooking view (stripping personal fields: verdict, enthusiasm, occasion detail, reason, notes, gotchas) with scaling, unit switch, and print; private and trashed recipes return 404 and purged ones 410. | Random-link generation; purged recipe tombstone record (`purged_recipe`); cache headers; signed public images; public field allow-list; rate-limit design (initial target 60 requests per minute per IP, applied in slice 25). |
| 21. History viewer | A person can inspect the change history of a recipe or publication. | Event structure review against what earlier slices captured; redaction; whether purge removes history; display design. |
| 22. Install and offline | A person can install the app, open recently viewed recipes offline, and have sign-out clear cached private data. | Service worker strategy; cache scope; shared-device security; Next.js PWA tooling. Real-device install is verified in slice 25. |
| 23. Export | A person can export a database, publication, or recipe as a ZIP. | ZIP manifest, schema versioning, asset checksums, function limits for large exports; last-export date and 30-day reminder in Settings. Create a dedicated import/export specification during this slice. |
| 24. Import | A person can import a ZIP into an account, resolving conflicts, without silent loss. | Import validation, conflict matching, transaction boundaries, publication matching, import IDs, failure recovery. |
| 25. Go online | The tested app runs in production: a production Supabase project, a Vercel deployment, Google sign-in, and email delivery work; the owner's admin invite works; a database exported locally is restored into production by import; and the README gives step-by-step setup instructions. | Current Supabase, Vercel, and Google Cloud setup steps; production sign-up closed and rate-limit rule applied; custom SMTP; environment variables and secrets; production migrations; admin invite for the owner's email; Google sign-in and enforcing one sign-in method per account, given that Supabase links same-email identities automatically; domain for public links; plan limits (project pausing, storage); real-phone checks that need HTTPS (install, wake lock, camera upload, and instruction ingredient autocomplete using the on-screen keyboard and touch selection); optional hosted CI. |

## Completion Rule

A slice is complete only when its stated demonstration works, the automated
tests written before its production code pass, its acceptance criteria are
checked, and any changed decision or deferred issue is recorded. Do not start
the next slice merely because code exists.
