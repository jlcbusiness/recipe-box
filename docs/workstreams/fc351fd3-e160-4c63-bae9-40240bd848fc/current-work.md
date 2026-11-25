# Purpose: Implement text-only recipe JSON import into an active publication

## Progress History

- 2026-11-24: Confirmed JSON recipes are added to the open publication. The
  file contains text-only recipe data, optional URL and print references, and
  excludes IDs, images, and account data.
- 2026-11-24: Confirmed the JSON covers every alphanumeric or picklist field
  users can enter on recipe edit. Existing-name conflicts are add-only: keep
  the current recipe or create a duplicate, never replace it.
- 2026-11-24: Review feedback requested a separate downloadable JSON Schema
  for linting from the publication transfer menu. The candidate brief now
  includes it.
- 2026-11-24: To catch picklist typos without duplicating allowed-value lists,
  proposed preview warnings against the destination's live catalogs, with
  optional close-match suggestions and no automatic correction.
- 2026-11-24: The user chose a standard schema plus a strict schema generated
  from the signed-in account's live catalogs, rather than preview warnings or
  a CLI authentication flow. They also chose an `Import JSON` submenu for the
  JSON import, template, and both schema downloads; ZIP import remains separate.
- 2026-11-24: Updated the DLC 50 candidate and decision log to reflect those
  choices. The existing publication transfer menu is the closest reference:
  its flat two-action menu is a good starting point, but it has no submenu
  pattern to reuse.
- 2026-11-24: The user approved a commented JSONC template with `<FILLER>`
  placeholders and current picklist values in comments except ingredient
  names. The import will accept JSONC, ignore comments, and reject unresolved
  filler tokens.
- 2026-11-24: The user requested minute-precision timestamps in template and
  schema filenames. The candidate initially used UTC, then was revised to the
  user's more readable local `YYYY-MM-DD-HH.mm` format.
- 2026-11-24: Updated the DLC 50 candidate and decision log for JSONC,
  account-specific template comments, filler validation, and timestamped
  download names.
- 2026-11-24: Focused Markdown lint reported no issues in the candidate or
  continuity records; the known long decision-log line remains. The whitespace
  check passed.
- 2026-11-24: The user approved the DLC 50 candidate and asked to execute it.
  Implementation is now in progress; production changes are authorized within
  the approved brief.
- 2026-11-24: Replaced the UTC filename suffix with the user's preferred local
  `YYYY-MM-DD-HH.mm` format in the candidate and decision log; validation is
  pending.
- 2026-11-24: Focused Markdown lint and whitespace validation passed for the
  readable filename revision, except for the known decision-log line-length
  issue.
- 2026-11-24: The user chose to include cross-platform local linting in the
  slice. The candidate specifies one Node validator with Bash and PowerShell 7
  launchers, a bundled standard schema by default, and an optional downloaded
  strict schema; the CLI needs no network or sign-in.
- 2026-11-24: Updated the DLC 50 candidate and decision log with the CLI and
  wrapper deliverable. This remains part of the unapproved slice, not a
  production implementation request.
- 2026-11-24: Focused Markdown lint reported no issues in the candidate or
  continuity records; the known long decision-log line remains. The whitespace
  check passed.
- 2026-11-24: Implemented the approved JSON/JSONC import flow, standard and
  account-specific strict schemas, commented filler template, local Node
  linter with Bash and PowerShell launchers, publication submenu, and
  add-only preview/commit flow. The slice brief, roadmap, index, and visual
  design guide now describe the implemented behavior.
- 2026-11-24: Verified with the full unit suite (77 files, 761 tests), bootstrap
  tests (8), focused JSON tests (15), typecheck, CLI valid/invalid smoke tests
  in both shells, and four browser tests across Chromium and Fold 6. The final
  browser rerun passed after the submenu accessibility adjustment.
- 2026-11-24: Changed-file Biome error checks and `git diff --check` passed.
  Repository-wide lint still reports six formatter errors and 145 warnings in
  unrelated code; focused Markdown lint reports the known decision-log
  line-length issue and a pre-existing visual-design code-span issue.
- 2026-11-25: The production Postgres log identified the tagged-import failure:
  the database import RPC inserts `tags.sort_order`, but the tags table lacked
  that column. Added the column with a deterministic existing-tag backfill and
  a pgTAP regression test. The local migration and focused test passed; no
  hosted database migration was run.
- 2026-11-25: Created [chicken.jsonc](../../../uploads/chicken.jsonc) with the
  12 requested recipe names and current schema labels. Mapped `Try` state to
  `want_to_try`, `No Try` to `will_not_try`, and `On Occasion` to `Specific
  occasion`; strict-schema validation passed.
- 2026-11-25: Added the supplied ingredient lists to nine chicken recipes and
  left the other three without invented ingredients. The current Recipe JSON
  schema accepts all 12 recipes. The dated strict example still expects legacy
  `amount_min` fields, so it is not valid for current measurement payloads.
- 2026-11-25: Clarified ingredient uniqueness to compare ingredient identity
  and normalized detail, allowing distinct mustard varieties in one section.
  Updated editor and bundle-import validation, added a database migration and
  regression tests. Focused unit tests, typecheck, and Biome pass; the pgTAP
  test has not been run against the new migration. The chicken JSONC linter
  also accepts all 12 recipes.

## Save Point

- **Goal/status:** Recipe JSON import is implemented; ingredient identity now
  includes detail in editor and bundle validation, with a database migration
  and regression tests added.
- **Repository/branch:** `/home/joshlamont/Code/recipe-box`, `main`.
- **Current step:** The distinct-detail constraint migration and pgTAP test are
  added but have not been applied or run against a database.
- **Last verified result:** 74 focused unit tests passed; typecheck, Biome, and
  the chicken JSONC linter passed. The focused pgTAP test is present but unrun.
- **Next action:** Run the pgTAP test against a database with the new migration
  applied. Before any hosted change, inspect remote migration history and
  preview the push; no remote database was checked or changed.
- **Checklist:** [checklist.md](./checklist.md)
- **Trace:** [trace.md](./trace.md); latest focused checkpoint is the
  2026-11-25 tagged-import failure investigation.
