# DLC 50: Text-Only Recipe JSON Import

**Status:** Implemented locally; focused acceptance checks passed.

## References

- [DLC roadmap](../../delivery-roadmap.md), DLC 50
- [First-draft specification](../../first-draft-spec.md), Recipes and Import, Export, Lifecycle, and History
- [Comprehensive reference, § 2: Recipe Card and Metadata](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Comprehensive reference, § 11: Import, Export, and Backup Bundles](../../comprehensive-reference/07-import-export-and-history.md#11-import-export-and-backup-bundles)
- [Data model](../../data-model.md), Recipe relationships and ownership
- [Portable bundle format](../../import-export-format.md)
- [Slice 21: Scoped Import](../build/21b-scoped-import.md)
- [Visual design guide](../../visual-design.md), App data: Export and Import
- [Decision log](../../decision-log.md)

## Outcome

A signed-in User can import one `.json` or `.jsonc` file containing one or more
recipes into the publication currently open. A recipe entry can contain only
its required name or the complete set of text, numeric, and picklist data a
User can enter on the recipe edit page. The import is add-only: existing
recipes are never replaced.

The publication transfer menu adds an `Import JSON` submenu. It contains
`Import JSON file`, `Download JSON template`, `Download JSON schema`, and
`Download strict schema`. The template is commented JSONC with obvious
placeholders and current account picklist values in field comments (except
ingredients). The standard schema describes the format; the strict schema is
generated from the signed-in account's current catalogs to lint managed
picklist labels.

## Scope and dependencies

- Accept one UTF-8 `.json` or `.jsonc` file with a versioned top-level
  envelope and a non-empty `recipes` array. `.json` uses standard JSON;
  `.jsonc` additionally permits `//` and `/* ... */` comments but not trailing
  commas. Each recipe requires a non-empty `name`; omitted fields use
  new-recipe defaults. A name-only entry is valid.
- Define a user-facing nested recipe format rather than exposing the
  normalized relational `records` object in ZIP backups. Represent managed
  picklists by their displayed text values, never by IDs.
- Cover every text, numeric, and picklist value available for authoring on the
  recipe edit page, including conditional state responses, publication
  location, recipe URL, categories and tags, Serves and Makes, ordered time
  entries, nutrition values, ingredient sets and rows, measurements, notes,
  Pre-recipe Prep, and ordered instruction text.
- Support supplemental external URL and printed-citation references using
  display text and URL values only. Generate internal reference IDs during
  import.
- Exclude all IDs and account/owner fields, publication identity, private
  action markers, images and media metadata, Auth data, product preferences,
  explorer state, history, linked-recipe IDs, and protected public-copy
  identity. No URL is fetched; a recipe URL is stored as data only.
- Import new recipes into the active publication from which the transfer menu
  was opened. A JSON file cannot select another publication or create one.
- Reuse the existing owner-authenticated preview and transactional commit
  boundary. Add a JSON input adapter and multi-recipe planning support; do not
  treat the JSON file as a ZIP bundle or create a separate write path.
- Keep current ZIP database, publication, and recipe import behavior unchanged.
- Download the template as JSONC. Include a minimal name-only recipe and a
  complete example demonstrating every supported field. Comment every field
  with its expected type, format, constraints, and allowed values where
  applicable. Include the current signed-in account's values for fixed and
  account-managed picklists, except ingredient names, whose catalog is too
  large to list. These values are generated from live catalogs, not maintained
  separately, and the template comments may become stale after download.
- Put the reserved string `<FILLER>` in every example field value that the
  User should replace. Keep the example's object and array structure intact.
  Preset schema-constant and single-choice values in examples instead of using
  `<FILLER>` for values that cannot vary.
  Reject any imported file whose parsed data still contains `<FILLER>`, with
  errors identifying the field paths. Add comments, not values, for
  explanatory text. Do not add a separate Help page in this slice.
- Publish a versioned Draft 2020-12 standard schema that describes the recipe
  file structure and constrains fixed enums. Also offer a values-strict schema
  generated at download time from the signed-in account's live catalogs, with
  exact-value enums for account-managed picklist labels. Generate it from the
  same catalog source used by import; do not maintain a separate copy of those
  values.
- Treat both schemas as optional offline linting. The authenticated import
  remains authoritative for catalog resolution, normalized-name conflicts,
  authorization, and commit safety. The values-strict schema can become stale
  when catalogs change; download it again to refresh. It checks exact labels,
  while import continues to use its existing normalization rules.
- Append the local download time, to minute precision, to the template and
  both schema filenames, before the extension:
  `recipe-template-YYYY-MM-DD-HH.mm.jsonc`,
  `recipe-schema-YYYY-MM-DD-HH.mm.json`, and
  `recipe-schema-strict-YYYY-MM-DD-HH.mm.json`. Omit seconds and timezone.
  Repeated downloads of the same file type within one minute use the same name
  and rely on the browser's normal duplicate-download naming behavior.
- Include a local lint command in source: one Node CLI parses `.json`/`.jsonc`,
  rejects unresolved `<FILLER>` tokens, and validates against the checked-in
  standard schema by default. Allow `--schema <path>` to select a downloaded
  strict schema. It reads local files only, requires no sign-in or network
  access, reports actionable field paths, and exits nonzero on invalid input.
- Provide `scripts/lint-recipe-json.sh` and
  `scripts/lint-recipe-json.ps1` launchers that pass arguments and exit status
  through to `scripts/lint-recipe-json.mjs`; do not duplicate parsing or
  schema-validation logic in shell. Also expose the CLI as
  `npm run lint:recipe-json -- ...`. Support Linux and Windows wherever Bash
  or PowerShell 7 is available, using the repository's Node 26 toolchain.
- Include concise `--help` output and command examples for Bash, PowerShell,
  and npm, including an optional `--schema <path>` for the strict schema. The
  standard schema used by the CLI is the same versioned schema served by the
  publication menu.

## JSON and mapping rules

- Use a distinct format identifier and `schema_version: 1`. Require the
  version and format fields, reject unknown keys and unsupported versions, and
  validate the complete parsed data before preview or writes. Parse `.jsonc`
  with a JSONC-aware parser; do not remove comments with regular expressions.
- Represent each numeric ingredient measurement as one positive scalar
  `amount`. Do not expose the database's legacy `amount_min` and `amount_max`
  fields in this new-recipe import format; reject range-shaped input.
- Ignore comments when importing. Run schema and semantic validation on the
  parsed JSON data, not the commented source text. The schemas do not validate
  JSONC comments or comment syntax.
- Keep both schemas strict (`additionalProperties: false` where objects have
  a fixed contract) and aligned with the import parser. A filled template's
  parsed data must validate against the standard schema; the unfilled template
  is instructional and intentionally fails validation.
- Do not accept `id`, `account_id`, owner/auth fields, publication identity,
  storage paths, public-link identity, or other database-shaped fields anywhere
  in the input. The authenticated destination account and open publication
  supply ownership and placement. The server generates fresh recipe and graph
  IDs.
- Reserve the exact `<FILLER>` string for template placeholders and reject it
  anywhere in parsed import data before schema validation or writes. Comments
  containing `<FILLER>` are ignored.
- Resolve each picklist, ingredient, tag, and time-type label against the
  destination account using the existing normalized catalog rules. The live
  destination catalogs are the source of allowed account-managed values for
  both import and values-strict schema generation. Reuse a unique match and
  create unmatched values only where existing import and editor workflows
  permit it.
- The standard schema accepts account-managed labels as strings. The
  values-strict schema constrains them to the exact labels in the signed-in
  account's catalogs when downloaded, so an external validator can catch
  misspellings without maintaining duplicate lists. This is a lint result,
  not an import rule: users can still intentionally add a new value through
  the existing import flow.
- Use the same JSONC parser and schema-validation behavior for browser import
  and the local CLI so that comments, placeholders, and schema errors behave
  consistently.
- Keep true fixed enums, such as State and reference type, constrained by both
  schemas and reject unsupported values. Only the values-strict schema treats
  current account-managed picklists as closed enums.
- Preserve authored Markdown and field order. Structured ingredient mentions
  and recipe pairings are not imported as relationships; their plain text can
  be included in instruction content.
- Validate external references as HTTP(S) URLs and printed references as
  display text. Never make a network request to a supplied URL.
- Apply existing state normalization and conditional-field rules. New recipes
  default to private and `Want to try`; if JSON sets State to `Tried`, apply
  the existing new-import Made-count invariant without importing Made action
  history or timestamps.
- Bound the JSON file to the existing 64 MiB uncompressed data limit. Use the
  existing owner-scoped temporary upload and cleanup boundary rather than
  sending a large file through a serverless request body.

## Matching and conflict behavior

- Match incoming recipe names using the existing normalized recipe-name
  behavior across active destination publications. Show the matched
  destination names and publications in the preview.
- For each conflict, offer `Keep existing` (skip the incoming recipe) or
  `Create duplicate`. Do not offer `Replace` or merge fields. A duplicate
  follows the existing imported-duplicate naming and fresh-ID rules and is
  assigned to the publication where import began.
- If an input file contains repeated normalized recipe names, reject it with
  an actionable validation error rather than making an implicit ordering
  choice.
- New and duplicate recipes are planned together. One validation or commit
  failure leaves every destination recipe and history row unchanged.

## User flow and UI contract

- Keep `Export publication` and the existing ZIP-only `Import recipe` action
  at the top level of the publication transfer menu. Add an `Import JSON`
  submenu containing `Import JSON file`, `Download JSON template`,
  `Download JSON schema`, and `Download strict schema`. The strict schema
  contains only current account catalog labels needed for validation and does
  not identify a publication. The template comments contain the current
  account's picklist values except ingredient names; neither file contains
  unrelated account data or publication identity.
- Keep the existing ZIP import unchanged. The submenu's `Import JSON file` action
  opens a `.json` or `.jsonc` file selection and continues through the
  accessible preview and commit flow.
- Name each downloaded template/schema with its local generation time, to the
  minute, as specified above. The timestamp is part of the filename, not the
  recipe data or schema content.
- Show the recipe count, incoming names, existing-name matches, and the
  selected Keep/Duplicate choices before commit. Do not show media counts for
  JSON imports.
- Preserve the current publication menu's dimensions, keyboard navigation,
  visible focus, focus return, and mobile behavior. The JSON submenu supports
  keyboard open/close and focus movement between the parent menu and its
  actions. Added menu actions must not cause viewport overflow or obscure the
  menu trigger.
- Invalid JSON/JSONC, malformed comments, trailing commas, unsupported fields,
  unresolved `<FILLER>` values, invalid fixed-enum values, and invalid
  references receive actionable errors without partially creating recipes.
  Account-managed values continue through existing import resolution and
  creation rules. Cancellation and failed commits leave destination data
  unchanged and allow retry.
- After JSONC comments are parsed away and placeholders are replaced, the
  standard schema validates representative valid and invalid data with a Draft
  2020-12 validator. The values-strict schema accepts current account catalog
  labels and rejects unmatched labels during external linting. Neither schema
  replaces server-side semantic validation.

## Data, security, and failure boundaries

- Verify the signed-in user before issuing upload authorization, reading the
  file, generating a values-strict schema or account-specific template
  comments, or exposing destination candidates. Derive account ownership and
  target publication from the authenticated route context, not file data.
- Validate file size, UTF-8, JSON syntax, exact object keys, schema version,
  recipe field types, value limits, fixed enums, references, and cross-field
  invariants before creating records. Resolve account-managed labels against
  the destination's live catalogs using existing import behavior.
- Generate values-strict schemas and account-specific template comments only
  for the authenticated account, using current catalog labels and no other
  account data. Do not expose one account's catalog labels to another account.
- Never trust IDs or ownership data supplied by the file. Do not fetch
  external URLs or store client-supplied storage paths.
- Use the existing service-role-only transactional import boundary for all
  recipe and dependent-row changes. On any failure, roll back the complete
  batch and clean up or queue the temporary upload.
- Import appends ordinary creation history for created recipes; source
  history is not part of the JSON format.

## Acceptance criteria and automated tests

- Parser unit tests accept standard JSON and commented JSONC after replacing
  placeholders, and reject malformed JSON/JSONC, invalid UTF-8, trailing
  commas, empty lists, missing/blank names, unknown fields, unsupported
  versions, unresolved `<FILLER>` values, embedded IDs/account data, image or
  storage fields, oversized files, invalid numeric or fixed-enum values,
  invalid URLs, and duplicate normalized names.
- Mapping tests cover all edit-page text/numeric/picklist fields, conditional
  state data, numeric boundaries, ordered time entries, ingredient sets and
  rows, measurements, nutrition values, Markdown preservation, labels reused
  or created through existing catalog rules, and URL/printed references
  without source IDs.
- Schema/template tests prove comments are ignored by import and schema
  validation, every template field is documented, current account picklist
  values appear in comments except ingredient names, and no placeholder
  template can be imported. The standard schema accepts arbitrary
  account-managed labels, while the values-strict schema accepts current labels
  and rejects an unmatched or misspelled label. Generation is account-scoped
  and does not change import's normalized matching or creation rules.
- CLI tests prove Bash and PowerShell launchers invoke the shared Node
  validator, preserve file paths and arguments (including spaces), return
  nonzero for parse, placeholder, or schema failures, and work on Linux and
  Windows when the relevant shell is installed. The default uses the bundled
  standard schema; an explicit local schema path selects the downloaded strict
  schema. Linting performs no network access and modifies no input files.
- Planner tests cover multiple new recipes, account-wide name matches,
  Keep-existing skips, duplicate ID remapping and naming, target placement,
  state defaults and Tried invariants, and one atomic batch plan.
- API/database tests prove authenticated owner isolation, destination
  publication ownership, rejection of foreign publication IDs, no URL
  dereferencing, all-or-nothing rollback on a late failure, no partial history,
  and temporary-upload cleanup after success, cancellation, and failure.
- Browser tests cover opening and navigating the JSON submenu, the JSON import
  action, template download, and both schema downloads with local minute-level
  filenames. Test `.json` and `.jsonc` selection from Import JSON and unchanged
  ZIP selection from Import recipe, minimal and complete import, multiple recipes,
  conflicts and both choices, validation and retry, cancellation without
  writes, keyboard/focus behavior, Axe, desktop and mobile menu layout, and no
  horizontal overflow.
- Run focused parser, CLI, planner, route, and database tests before Chromium
  and Fold 6 acceptance, followed by TypeScript, Biome, Markdown lint, and
  `git diff --check`. Use the existing local-data safety and recovery
  procedure; never reset linked or hosted Supabase.

## Assumptions and deferred decisions

- The user confirmed that the JSON imports into the publication already open,
  and should not include a publication name or ID.
- The user confirmed the file excludes IDs, images, and account data, while
  including every text, numeric, and picklist value a User can author on the
  recipe edit page. URL and printed-citation references are permitted.
- The user chose add-only conflict handling: keep an existing recipe or
  create a duplicate; never replace or merge an existing recipe. This protects
  saved recipe content when an incoming object contains only a name.
- The template download, schema download, and JSON import share the existing
  publication transfer menu, grouped in an `Import JSON` submenu. The template
  is account-specific JSONC with field comments, current picklist values except
  ingredients, and reserved `<FILLER>` placeholders. A separate Settings
  download and explanatory Help page are deferred.
- The user chose a standard schema plus a values-strict schema instead of
  import-preview typo warnings or a CLI authentication flow. The strict schema
  is generated on download from the signed-in account's live catalogs; it is
  advisory and may be refreshed after catalog changes.
- The user approved a commented JSONC template with `<FILLER>` values and
  current picklist values in comments except for ingredients. Import accepts
  JSONC, ignores comments, and rejects any unresolved filler token.
- The user requested minute-precision date-time suffixes on downloaded
  template and schema filenames, using `YYYY-MM-DD-HH.mm` for readability.
  This brief uses local download time; repeated downloads of the same type
  within one minute may use the browser's usual duplicate-name handling.
- The user requested easy comment-aware linting in both Bash and PowerShell for
  Windows and Linux. The brief specifies one shared Node validator with thin
  shell launchers to avoid maintaining duplicate parser implementations.
- Recipe photos, media metadata, structured ingredient mentions, linked-recipe
  relationships, account-level settings, and export-to-JSON are out of scope.
- The final input field names and limits must be validated against the current
  recipe editor and save path before implementation; changes to the agreed
  field boundary require review.
