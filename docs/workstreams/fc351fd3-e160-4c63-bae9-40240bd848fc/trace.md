# Purpose: Implement text-only recipe JSON import into an active publication

## 2026-11-24 — Session fc351fd3-e160-4c63-bae9-40240bd848fc

Initial inspection established the user's clarified scope and the existing
scoped-import and publication-transfer patterns. The initial checkpoint added
only these workstream records.

The user clarified that every text, numeric, and picklist field on recipe edit
is in scope, with no IDs, images, or account-level data. They chose add-only
conflict handling (keep existing or duplicate; no replacement) to protect
existing content when incoming entries are sparse.

The user requested a separate menu action to download a JSON Schema for
linting. The candidate brief now requires a version-aligned Draft 2020-12
schema and distinguishes structural linting from server-side semantic checks.

Created the DLC 50 candidate brief and updated the roadmap, DLC index, and
decision log.

- `npm run lint:md` checked 197 Markdown files and reported 104 errors across
  existing repository documentation, including the slice prompt and older
  workstream records.
- Targeted Markdown lint on the changed planning/workstream files reported
  only one line-length warning in `decision-log.md`. Running the same check
  against `HEAD` showed the same 716-character warning on the preceding line,
  so it predates this change. The new brief and remaining changed files lint
  clean.
- Verified the new brief and roadmap link targets exist. `git diff --check`
  passed, and status lists only the DLC 50 planning and workstream files.

After review feedback, added `Download JSON schema` as a separate transfer-menu
action, specified a version-aligned Draft 2020-12 schema for structural
linting, and clarified that server validation remains authoritative.

- Re-ran focused Markdown lint: only the same baseline `decision-log.md`
  line-length issue remains; other changed files are clean.
- Rechecked new link targets and `git diff --check`; both pass.

The user asked how to catch accidental picklist misspellings without adding
duplicate allowed-value lists. The current brief proposes checking live
destination catalogs during preview, warning on unmatched values, suggesting
close matches without autocorrection, and leaving catalog strings open in the
downloaded schema. This proposal is awaiting review.

## 2026-11-24 — Dual schemas and JSON submenu — session fc351fd3-e160-4c63-bae9-40240bd848fc

The user chose a standard schema and a strict schema generated from the
signed-in account's current catalogs, plus an `Import JSON` submenu containing
JSON import, template, and both schema downloads. ZIP import remains separate.
Updated the DLC 50 candidate and decision log; checked the existing transfer
menu component, styles, tests, and visual-design guidance to establish the
closest UI pattern.

- `npm run lint:md` — repository-wide lint reported 99 errors.
- Focused Markdown lint of the candidate, decision log, and continuity
  checklist/current-work — no candidate or continuity issues; one known
  716-character decision-log line-length issue remains.
- `git diff --check` — passed.

## 2026-11-24 — Implementation and acceptance checkpoint — session fc351fd3-e160-4c63-bae9-40240bd848fc

- Implemented the approved JSON/JSONC parser, standard and strict schema
  generation, commented template, portable-data mapping, shared linter, Bash
  and PowerShell launchers, upload/preview/commit routes, publication submenu,
  and import dialog.
- Added parser, mapping, upload, E2E, and transfer-menu coverage. No database
  schema migration was needed; commit uses the existing transactional import
  function.
- `npm run typecheck` — passed under Node 24.21.0; the repository declares
  Node 26.x.
- `npm run test:unit` — passed: 77 files and 761 tests; bootstrap tests passed
  separately (8). Focused JSON parser, mapping, and upload tests passed (15).
- Playwright ran the transfer-menu and JSONC-import cases from
  `tests/e2e/publications.spec.ts` and `tests/e2e/import-scoped.spec.ts` with
  one worker — four tests passed across Chromium and Fold 6.
- Bash and PowerShell launchers accepted valid commented JSONC and rejected an
  unresolved `<FILLER>` value with paths containing spaces.
- Changed-file Biome error checks and `git diff --check` — passed. The
  repository-wide lint command still reports six formatter errors and 145
  warnings in unrelated files.
- Repository-wide Markdown lint previously reported 99 issues. Focused lint of
  the slice and workstream docs reports only the known decision-log line-length
  issue and a pre-existing visual-design code-span issue.
- Updated the DLC brief, roadmap, DLC index, and visual-design guide from
  candidate to implemented-local status and documented the JSON submenu.

## 2026-11-24 — JSONC template and timestamped downloads — session fc351fd3-e160-4c63-bae9-40240bd848fc

The user approved a commented JSONC template with `<FILLER>` placeholders,
current account picklist values in comments except ingredients, JSONC import,
and rejection of unresolved placeholders. They requested minute-precision
timestamps on template and schema downloads. Updated the DLC 50 candidate,
decision log, and continuity records. The initial filename convention was UTC
`YYYY-MM-DDTHHmmZ`; the user later requested a more readable local-time format.

- Focused Markdown lint of the candidate, decision log, and continuity
  checklist/current-work — no issues in the candidate or continuity records;
  the known long decision-log line remains.
- `git diff --check` — passed.

## 2026-11-24 — Readable timestamp naming — session fc351fd3-e160-4c63-bae9-40240bd848fc

The user replaced the UTC filename convention with local
`YYYY-MM-DD-HH.mm` suffixes, omitting seconds and timezone. Updated the
candidate brief, decision log, and continuity records.

- Focused Markdown lint of five planning/workstream files — no issues in the
  candidate or workstream records; the known long decision-log line remains.
- `git diff --check` — passed.

## 2026-11-24 — Cross-platform JSONC linter scope — session fc351fd3-e160-4c63-bae9-40240bd848fc

The user chose to include Bash and PowerShell lint entry points in the source.
Repository inspection found Node 26 is the required runtime and found no
existing JSONC parser or JSON Schema validator dependency. Updated the
candidate and decision log to specify one shared Node CLI, thin shell
launchers, a bundled standard schema, and an optional downloaded strict schema.

- Focused Markdown lint of the candidate, decision log, and continuity
  records — no issues in the candidate or workstream records; the known long
  decision-log line remains.
- `git diff --check` — passed.
## 2026-11-25 — Session fc351fd3-e160-4c63-bae9-40240bd848fc (focused checkpoint)

- Read the user-provided production Postgres log; it identifies `tags.sort_order`
  as the undefined column in the database import RPC.
- Compared the tag table migration, import RPC, and portable export/import
  contract; the RPC and portable contract both use `sort_order`, but no schema
  migration had added it.
- Added `20270104000000_add_tag_sort_order.sql` with an alphabetical backfill
  and `supabase/tests/database_import_tags.test.sql` to exercise a tagged
  database import.
- Applied the migration to the local stack with `npx supabase migration up`;
  the focused pgTAP test passed (2 assertions).
- No hosted migration list, dry-run, or database write was performed.
