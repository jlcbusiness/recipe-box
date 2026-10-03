# Recipe Box Delivery Roadmap

> **Reference Note:** For the complete catalog of all requirements, edge cases,
> UI behaviors, and design discussions, see [plans/comprehensive-reference.md](comprehensive-reference.md).

## Purpose

This roadmap breaks Recipe Box into small, demonstrable delivery slices. It is
not an implementation specification. Each slice is intentionally incomplete
until the work about to begin expands and verifies its relevant details.

## Mandatory Slice Preparation

Before implementing any roadmap slice:

1. Create a focused slice brief under `plans/slices/`.
2. Read `first-draft-spec.md` first, then the relevant sections of
   [comprehensive-reference.md](comprehensive-reference.md) (the master
   document), `data-model.md`, `visual-design.md`, and `decision-log.md`.
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
| 4. Recipe card basics | A person can create, edit, and view a Recipe Tin recipe with Name, State (default Want to try), optional integer Serves, compact metadata picklists, times, equipment, and Markdown notes. Opinion shows the active response in the list; mobile shows only Name and Opinion. Picklists wrap naturally, State-dependent fields clear stale values, explicit save commits changes, and history is recorded; no autosave. | Identifiers and schema (including `is_private` default false); per-account picklist seeds and Verdict order; history and edit-conflict versioning; content-sized anchored single-picklists, stable-width checkmark dropdowns, no-grid flex wrapping, compact headings and spinner-free time inputs, centered 36/48px Serves, view-specific detail order with a dedicated desktop classification row, 32px inline Edit controls labeled “Edit” in both layouts with a 48px mobile hit area and mobile-only small caps, wider desktop list/detail content, and the `Σ` calculate action; desktop/mobile touch behavior. |
| 5. Ingredient rows | A person can add canonical ingredients and ordered rows (Main, Detail, Preparation) to a recipe by keyboard alone and reorder them by drag handle or move buttons. | Ingredient schema; on-the-fly ingredient creation; grid keyboard model; reorder accessibility; persistent manual order. |
| 6. Measurements | A person can enter quantities (integers, decimals, fractions, mixed numbers, ranges) as Volume, Weight, Count, Informal, or Unmeasured, add a second measurement, and see it displayed correctly. | Unit catalog and definitions (US customary and metric); parsing and validation; range storage; display formatting; dual display; seeded informal unit list. |
| 7. Instructions and mentions | A person can write ordered markdown steps, type `#` to link or create an ingredient, and see mentions render as styled readable text. | Step schema; mention storage and rename behavior; warning when deleting a mentioned ingredient row; mention default style; plain-text projection for search. |
| 8. Trash, restore, and print | A person can delete a recipe to the trash, restore it, see it purged after 30 days, and print a baseline unscaled recipe. | Trash schema; scheduled purge job (Supabase or Vercel scheduling); trash view; baseline print stylesheet (enhanced in slices 13, 16, and 20). |
| 9. Publications and the Recipe Tin | A person can create a book, magazine issue, or site; assign or unparent a recipe; and open a publication page listing its recipes. | Publication schema; picker with inline create; page-versus-URL rules; Recipe Tin visual treatment; publication page recipe list. |
| 10. Library and publication deletion | A person can browse publications in grid and details views (using fallback cover placeholders), filter by type, use the preview pane, and delete a publication with the three recipe choices. | Library view states; sorting; preview pane; deletion dialog; publication trash and restore; fallback cover graphics. |
| 11. Source links and relationships | A person can add a `+ Site` secondary listing to a magazine recipe, add References of all three kinds, and add Pairs with entries with incoming links shown. | Secondary listing schema; effect of deleting a Site; `#` recipe search in Pairs with; display of trashed targets (full private-link visibility tests finalize in slice 20); reference types. |
| 12. Images | A person can add covers and recipe photos from phone and desktop, see them through signed URLs, and see cover fallbacks. | Add-photo mechanism (camera or library, HEIC, size limits, resizing, EXIF removal, thumbnails); storage paths; signed-URL lifetime; storage quotas; photo order and primary photo; fallback covers. |
| 13. Scaling and unit conversion | A person can scale by servings, multiply, or divide; set default unit systems; and override one ingredient's unit; print reflects selected scale and units. | Conversion constants and math; rounding; preference storage; range scaling; unmeasured behavior; accessibility labels; print updates. |
| 14. Settings and picklists | A person can add, rename, delete, and merge picklist values, tags, and ingredients, choosing a replacement when a value is in use; add and manage tags on recipes and publications. | Transactional merge and delete; ingredient merge effects on mentions and Main flags; tag schema and handling; personal preferences page. |
| 15. Trusted density | A person can define an ingredient's density and see volume and weight auto-fill with tint and badge, override it, and have it re-fill when cleared. | Normalized density storage; derived-versus-manual state; override rules; accessible derived label. |
| 16. Cooking views | A person can switch Standard and Ingredient-first, sort ingredients four ways, and use mobile cook mode with check-off and wake lock. | Sort normalization and dual-measurement rule; saved default presentation; wake-lock browser support; touch-target sizes. |
| 17. Find recipes | A person can search full text, filter, and sort recipes and publications with chosen columns. | Search indexing across plain-text projections; filter semantics; empty states; performance. |
| 18. Saved views | A person can save and pin a view with filters, columns, and sort. | Serialization format that extends to nested queries; ownership; pinning. |
| 19. Advanced queries | A person can build and save nested Azure DevOps-style queries. | Operator catalog, type validation, AND/OR precedence, grouping, query serialization, explainable summaries, and performance limits. Create a dedicated query specification during this slice. |
| 20. Public links and privacy | A person can make a recipe private or linkable; a guest sees the public cooking view (stripping personal fields: verdict, enthusiasm, occasion detail, reason, notes, gotchas) with scaling, unit switch, and print; private and trashed recipes return 404 and purged ones 410. | Random-link generation; purged recipe tombstone record (`purged_recipe`); cache headers; signed public images; public field allow-list; rate-limit design (initial target 60 requests per minute per IP, applied in slice 25). |
| 21. History viewer | A person can inspect the change history of a recipe or publication. | Event structure review against what earlier slices captured; redaction; whether purge removes history; display design. |
| 22. Install and offline | A person can install the app, open recently viewed recipes offline, and have sign-out clear cached private data. | Service worker strategy; cache scope; shared-device security; Next.js PWA tooling. Real-device install is verified in slice 25. |
| 23. Export | A person can export a database, publication, or recipe as a ZIP. | ZIP manifest, schema versioning, asset checksums, function limits for large exports; last-export date and 30-day reminder in Settings. Create a dedicated import/export specification during this slice. |
| 24. Import | A person can import a ZIP into an account, resolving conflicts, without silent loss. | Import validation, conflict matching, transaction boundaries, publication matching, import IDs, failure recovery. |
| 25. Go online | The tested app runs in production: a production Supabase project, a Vercel deployment, Google sign-in, and email delivery work; the owner's admin invite works; a database exported locally is restored into production by import; and the README gives step-by-step setup instructions. | Current Supabase, Vercel, and Google Cloud setup steps; production sign-up closed and rate-limit rule applied; custom SMTP; environment variables and secrets; production migrations; admin invite for the owner's email; Google sign-in and enforcing one sign-in method per account, given that Supabase links same-email identities automatically; domain for public links; plan limits (project pausing, storage); real-phone checks that need HTTPS (install, wake lock, camera upload); optional hosted CI. |

## Completion Rule

A slice is complete only when its stated demonstration works, the automated
tests written before its production code pass, its acceptance criteria are
checked, and any changed decision or deferred issue is recorded. Do not start
the next slice merely because code exists.
