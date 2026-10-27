# Slice 21B: Publication and Recipe Import

**Status:** Complete.

## References

- [Slice 21: Import](21-import.md)
- [First-draft specification](../first-draft-spec.md), Import, Export, Lifecycle, and History
- [Comprehensive reference, § 11](../comprehensive-reference.md#11-import-export-and-backup-bundles)
- [Portable bundle format](../import-export-format.md)
- [Slice 20: Export](20-export.md)
- [Data model](../data-model.md)
- [Visual design guide](../visual-design.md), Data Management and Export
- [Decision log](../decision-log.md), import conflict and scoped export decisions
- Installed Next.js 16 Route Handler guide:
  `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`

## Outcome

A signed-in owner can import publication- and recipe-scoped v1 and v2 ZIPs through
Library and recipe workflows. Selecting a ZIP starts upload and comparison
automatically. Recipe matches are found by normalized name across the
destination account, independent of the source publication. Replace retains the
matched recipe's destination publication; Duplicate and new recipes can use the
source publication or another active destination publication. Recipe Tin maps
to the destination owner's existing collection and is never imported as a
publication record.

## Scope

- Accept valid v1 and v2 `publication` and `recipe` bundles in addition to the
  existing `database` bundles. V1 recipes receive a synthesized `Main`
  ingredient set; v2 preserves included set records and row membership.
- Add `Import publication` beside `Add publication` in Library.
- Add `Import recipe` beside `Add Recipe` in publication detail, including the
  Recipe Tin view. Keep separate actions on desktop and expose both `Import
  recipe` and `Export publication` through one transfer menu on mobile.
- Keep database import in Settings. It continues to apply the bundled account
  preferences and explorer state and remains on Settings after success.
- Reuse owner-authenticated upload grants, archive validation, catalog reuse,
  optimistic root-version checks, media staging and cleanup, and the existing
  service-role-only transaction. Scoped imports pass empty account preferences
  and explorer state.
- Treat imports as source-agnostic. Validate only the supported bundle format,
  integrity, scope, and required graph data; derive ownership from the
  authenticated destination account and never require the source account or
  Auth identity to exist locally.
- Do not import history, Auth identities, source ownership, public-link IDs,
  pending media, or unsupported future bundle versions.

## Graph and relationship behavior

- A publication bundle contains its selected active publication and its active
  recipe graphs, tags, cover, and ready recipe images. The publication is a
  conflict root. Included recipes are independently matched and resolved, as in
  database import; keeping the publication does not suppress importing its
  recipe roots.
- A recipe bundle contains its selected active recipe graph and bundled
  publication metadata. The source publication resolves automatically: a
  unique active normalized type/name match is reused, a missing publication is
  created from the bundle, and a Recipe Tin source maps to the destination
  owner's existing collection. No collection publication is included in the
  commit records.
- Match recipe roots by normalized name across all active destination
  publications, without using source IDs or publication placement as identity.
  Recipe conflicts in database and publication imports offer Replace,
  Duplicate, or Ignore; recipe-scoped conflicts offer Replace or Duplicate
  only. Replace retains the matched root ID and its current destination
  publication while replacing its imported graph transactionally. Duplicate
  allocates fresh graph IDs and appends `(Imported)` to the recipe name. New and
  duplicate recipes default to
  the source publication; a destination selector lists that choice first,
  followed by active destination publications.
- Match publication roots by normalized type and name. A conflicting
  publication root offers Keep Existing, Create Duplicate, or Replace. Replace
  retains the selected publication ID. Recipe roots in a publication bundle
  remain separately resolvable.
- Reuse unique destination ingredients, picklist values, tags, and trusted
  densities using the existing database-import rules. Keep destination catalog
  definitions on normalized-name collisions and report catalog reuse in the
  preview.
- Rewrite all included foreign keys through the source-to-destination map.
  Internal recipe links point to the mapped included recipe. For a recipe link
  whose target is outside the bundle, reconnect only when exactly one active
  destination recipe has a normalized name matching the stored display text;
  otherwise clear the link and preserve the display text.
- A publication reference whose target is outside the bundle keeps its stored
  display text and imports without the optional `publication_id`. Do not infer
  identity from source IDs. Current schema permits these legacy references to
  remain static text.
- A v1 secondary Site listing preserves its recipe URL as an ordered external
  URL reference. The current schema no longer stores the secondary publication
  association, so import retains the usable URL without depending on the
  source publication ID.
- Preserve recipe privacy. Import never copies or reuses a public-link ID.

## Preview, commit, and navigation

- Selecting a valid archive uploads it and runs comparison automatically.
  The compact file row shows the archive name and record/media counts; the
  visible preview heading and private/public recipe counts are omitted.
- Preview reports bundle scope and root, record/media counts, root conflicts,
  candidate names and versions, catalog reuse, and any Replace effects.
- Every matched root requires a deliberate action. Recipe conflicts in
  database and publication imports offer Replace, Duplicate, and Ignore;
  recipe-scoped conflicts offer Replace or Duplicate only. Publication choices
  retain Keep Existing, Create Duplicate, and Replace. A multiple-candidate
  match also requires a deliberate target. Recipe publication placement is
  independent of root matching, and replacement never moves the destination
  recipe. Recipe-scoped conflicts always require Replace or Duplicate; bundled
  publication imports retain the per-recipe Ignore choice.
- Re-read and validate the archive before staging and commit. If archive bytes,
  selected roots, or root versions changed, retain the user's staged workflow,
  report a recoverable error, and require a refreshed preview.
- Commit the complete planned graph in one transaction after every required
  media variant has been staged and verified. On failure, leave account rows
  unchanged and remove or queue all staged media and temporary archive objects.
- Return the destination root ID from the plan. Successful publication import
  navigates to `/publications/{id}`; successful recipe import navigates to
  `/recipes/{id}`. Database import remains in Settings.
- Closing the compact dialog before commit removes the temporary archive and
  changes no records. The inline Settings workflow retains its cancel action.
  Failures preserve a retry path and do not silently discard user choices.

## UI and accessibility

- Use a styled ZIP picker that starts upload and comparison on selection. Show
  the filename and counts together, with a compact width on desktop and a
  responsive row on mobile. Do not show privacy counts or an `Import preview`
  heading. After selecting an archive, offer `Choose another ZIP`; selecting a
  replacement removes the previous temporary archive before uploading it.
- Keep `Import publication` beside the corresponding create action in Library.
  Keep separate import/export actions in publication detail on desktop; on
  mobile, use a 40px transfer-menu trigger for `Export publication` and `Import
  recipe`.
- Preserve existing action dimensions and layout stability. The Library import
  control retains its 48px mobile target; the publication-detail transfer
  trigger remains 40px and must not introduce horizontal overflow.
- Support keyboard selection, conflict resolution, cancel, refresh, and commit;
  retain visible focus, descriptive labels, live progress/status and errors,
  keyboard navigation and focus restoration for the transfer menu, and focus
  restoration on dialog cancel. Run Axe on the focused flows.

## Test-first acceptance

- Unit tests accept valid publication and recipe scopes and reject mismatched
  roots, malformed internal references, and invalid archives. Cover scoped
  graph planning, legacy Site URL normalization, conflict choices, ambiguous
  candidates, account-wide scoped recipe matching, Replace placement
  preservation, Duplicate/new destination selection, automatic source
  publication creation, Recipe Tin mapping, catalog reuse, ID mapping, privacy,
  and unresolved external-link fallback.
- Route/API tests prove owner isolation, active scoped roots, scope-aware
  conflicts, stale-version rejection, empty preference updates, atomic rollback,
  media staging/cleanup, and destination-root IDs in the result.
- Chromium and Fold 6 tests cover both entry points, scope-specific root conflict
  choices,
  automatic upload/preview, destination selection, cancel before commit,
  stale-preview recovery, Ignore with no commit, replacement ZIP cleanup,
  success navigation, keyboard/focus, labels/status, Axe, responsive action
  dimensions, and no horizontal overflow. Include a public Recipe Tin Replace
  case and preserve the existing 21A tests.
- Run focused unit and API tests first, then Chromium and Fold 6 acceptance,
  TypeScript, Biome, Markdown lint, and `git diff --check`. Prefer the isolated
  `/tmp/recipe-box-import-acceptance` Supabase project for destructive
  acceptance setup. Resetting active local Supabase is allowed when a clean
  baseline is worth the reset and reload effort; follow the README procedure
  and reload the synthetic fixture. Never reset linked or hosted Supabase or
  start a competing development server as a shortcut.

## Completion criteria

- Publication and recipe v1/v2 bundles validate, preview, and commit complete
  supported graphs without silent loss or partial account writes.
- External recipe links reconnect only to one unique active destination match;
  otherwise their display text remains with no link.
- Root conflicts require explicit choices, recipe replacements preserve root
  identity and destination placement, and success opens the imported or
  selected root.
- Existing database import behavior and all 21A acceptance checks remain
  unchanged.
- Update the comprehensive reference, visual guide, decision log, and roadmap
  only to describe behavior verified by the implementation.
