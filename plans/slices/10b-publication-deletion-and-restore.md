# Slice 10B: Publication Deletion and Restore

**Status:** Implemented and verified locally.

This slice adds publication deletion with a required recipe disposition when
active recipes exist, owner-scoped publication Trash and restore, lifecycle
history, and a daily 30-day purge. It extends the existing recipe Trash
workflow and keeps publication lifecycle changes atomic and version-checked.

The product authority is
[plans/comprehensive-reference.md](../comprehensive-reference.md), especially
[§ 6, Publications and the Recipe Tin](../comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin).
Also consult the [data model](../data-model.md),
[visual design guide](../visual-design.md),
[decision log](../decision-log.md), and
[delivery roadmap](../delivery-roadmap.md).

## Outcome

An owner can move a publication to Trash after confirming the action. If it has
active recipes, they choose what happens to those recipes; an empty publication
still requires confirmation but presents no disposition choices. They can
restore the publication and, separately, any recipes moved to Trash with it
before the 30-day purge. The Library, publication detail, and shared Trash
remain owner-scoped and usable on desktop and Fold 6 mobile.

## Verified implementation constraints

- Publication lifecycle state is stored on `publications` with a deletion
  timestamp, actor, and version. Existing active-publication reads exclude
  trashed rows; a versioned RPC lists only the signed-in owner's Trash.
- A single `SECURITY DEFINER` RPC validates ownership, expected version, recipe
  disposition, and any destination, then changes recipe assignments and
  publication lifecycle state atomically.
- Moving recipes to another publication requires a different active publication
  owned by the same account. Location metadata is retained only when valid for
  the destination type.
- Publication restore clears only the publication's Trash state. It does not
  reverse recipe moves or restore recipes. Recipes trashed by the Delete choice
  retain their publication assignment and location until separately restored.
- The shared Trash page lists publications and recipes separately, with deleted
  and permanent-purge dates and version-checked Restore actions.
- A daily `pg_cron` job invokes a service-role-only purge RPC. Purging a
  publication removes its expired retained recipes and their private history,
  plus the publication and its history.
- A forward-only migration permits Auth deletion to clear the publication Trash
  actor reference while preserving the normal lifecycle guard.

## Scope

### Included

- A publication-detail confirmation dialog that requires one of three
  dispositions when active recipes exist: move all recipes to Trash, move them
  to the Recipe Tin, or move them to another active publication. Empty
  publications still require confirmation but omit the disposition choices.
- Owner-scoped, version-checked Trash, restore, and atomic recipe disposition.
- Publication lifecycle history and recipe history for changes caused by the
  selected disposition.
- Publication rows in the existing Trash page, including restore controls and
  the 30-day purge date.
- A daily purge and deterministic cutoff verification.
- Browser, API, accessibility, responsive, and owner-isolation coverage.

### Excluded

- Publication editing, history browsing, media upload, and public publication
  routes.
- Reversing recipe disposition when a publication is restored. A recipe moved
  to the Recipe Tin or another publication stays there; a trashed recipe needs
  its own Restore action.
- Version-history rollback. History remains forensic, consistent with the
  existing lifecycle design.

## Data and behavior contract

- Reject unauthenticated, cross-owner, stale-version, already-trashed, invalid
  disposition, self-destination, and inactive or foreign destination requests.
- When there are no active recipes, keep the confirmation but omit disposition
  choices and submit the valid `delete` disposition; no active recipe rows are
  changed.
- The Delete choice trashes active recipes in the same transaction and retains
  each recipe's publication link and location. Publication restore does not
  restore those recipes; restoring a recipe separately recovers its retained
  publication link and valid location.
- The Recipe Tin choice clears publication assignment and location fields.
  Moving to another publication assigns that destination and clears location
  fields that do not apply to its type.
- Restoring a publication increments its version and writes a restore event.
  It does not change the selected recipe disposition.
- The purge boundary is inclusive: an item is eligible when its Trash timestamp
  is at or before the supplied 30-day cutoff. Purging a retained recipe also
  removes its history; purging the publication removes its publication history.
- Revalidation refreshes the Library, publication detail, recipes, and shared
  Trash after lifecycle mutations.

## Responsive and accessibility contract

- The destructive action is visibly labeled and separated from routine detail
  actions. Its confirmation uses a named dialog; the disposition radio group is
  required only when active recipes exist.
- The destination selector appears only for the move-to-another-publication
  choice and offers active destinations other than the current publication.
- The shared Trash uses semantic tables, separate publication and recipe
  headings, and a named Restore action for each record.
- Keyboard operation, visible focus, accessible names, axe checks, and no
  horizontal overflow are verified in Chromium and the 352px Fold 6 profile.

## Automated acceptance

- Verify all three dispositions for publications with active recipes, their
  location-field behavior, atomicity, version increments, owner isolation, and
  rejection of foreign destinations.
- Verify that an empty publication still requires confirmation but offers no
  disposition choices and can be moved to Trash.
- Verify the required disposition for non-empty publications, conditional
  destination picker, publication restore, recipe restore, and retained
  relationship behavior.
- Verify owner-only publication Trash, publication history ordering, stale
  restore rejection, and recipe history for lifecycle changes.
- Verify the publication remains before the purge cutoff and is purged at the
  inclusive boundary together with retained recipe and history rows. The test
  rolls back the purge subtransaction so it cannot delete unrelated local Trash.
- Verify the daily purge schedule, accessible browser flow, Fold 6 behavior,
  existing recipe Trash/restore regression, typecheck, lint, SQL lint, and diff
  whitespace.

## Verification

Run the focused publication lifecycle suite with one Chromium worker, the
publication deletion and recipe Trash flows in the Fold 6 project, then
`npm run typecheck`, `npm run lint`, `supabase db lint --local`, and
`git diff --check`. Do not reset or stop the local Supabase stack or existing
application servers.

## Completion criteria

- Publication deletion always requires confirmation. When active recipes exist,
  it requires an explicit disposition and applies it atomically with the
  publication Trash transition.
- Owners can restore publications and retained trashed recipes independently
  before purge; moves to the Recipe Tin or another publication remain in place.
- Owner isolation, history, retention boundary, purge scheduling, accessibility,
  and supported mobile behavior pass their automated checks.
