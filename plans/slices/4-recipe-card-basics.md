# Slice 4: Recipe card basics

This brief implements the first persistent product record: a Recipe Tin recipe
with core metadata. It does not implement publications, ingredient rows,
instructions, tags, public URLs, or recipe photos.

## References

- [Delivery roadmap](../delivery-roadmap.md), slice 4
- [First-draft specification](../first-draft-spec.md), Recipes
- [Comprehensive reference, § 2: Recipe metadata and time](../comprehensive-reference.md#2-recipe-card-and-metadata)
- [Comprehensive reference, § 6: Recipe Tin](../comprehensive-reference.md#6-publications-magazine-handling-and-the-recipe-tin)
- [Comprehensive reference, § 8: Picklists](../comprehensive-reference.md#8-settings-taxonomies-and-picklists)
- [Comprehensive reference, § 12: History](../comprehensive-reference.md#12-change-history-and-forensic-audit)
- [Comprehensive reference, § 13: Accessibility](../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)
- [Comprehensive reference, § 16: Testability](../comprehensive-reference.md#16-testability-and-test-first-delivery)
- [Data model boundary](../data-model.md)
- [Visual design guide](../visual-design.md)
- [Decision log](../decision-log.md)
- [Slice 3 editor proof](3-instruction-editor-proof.md)

## Outcome

An authenticated owner can create, view, edit, and explicitly save a Recipe Tin
recipe with its basic metadata. New recipes default to Want to try, with State
immediately below Name. Its active response and optional integer Serves field
share the State row; Equipment follows Serves. Food Type, Meal Type, and Cuisine
occupy the following wrapping row. The desktop list shows Name, Food Type, State,
and Opinion; mobile shows Name and Opinion. Detail metadata has a distinct view
order, with Total Time after Serves and classification values in their own desktop
row.
Picklists are seeded per account and isolated by RLS. Conditional State fields
clear stale values, time totals change only when the user invokes the calculate
control, and recipe creation/update history is recorded transactionally.

## Scope

- Recipe Tin recipes have no publication assignment in this slice. Publication
  and Location fields belong to Slice 9.
- Implement: Name, Food Type, Meal Type, Cuisine, State, Verdict, Enthusiasm,
  Occasion Details, Reason, Equipment, optional integer Serves, all nine
  component time fields plus manual Total Time, and Markdown Notes.
- Store time values as non-negative integer minutes; blank inputs are `NULL`.
  The calculate control sums the nine component durations only, excluding the
  Total Time field. Total Time is never changed as a side effect of editing a
  component duration.
- Store Serves as an optional positive integer. Slice 4 does not store separate
  numeric Servings or free-text Yield fields; scaling behavior belongs to Slice
  13.
- State is required and has the stable values `want_to_try`, `tried`, and
  `will_not_try`. New recipes default to `want_to_try`; the user can change it
  immediately below Name.
- State field visibility and validation:
  - `want_to_try`: show Enthusiasm; hide Verdict and Reason.
  - `tried`: show Verdict; hide Enthusiasm and Reason.
  - `will_not_try`: show Reason; hide Verdict, Enthusiasm, and Occasion Details.
  - Show Occasion Details only when the active Verdict or Enthusiasm is the
    protected `specific_occasion` picklist value.
  - When State changes, clear values from the previous State. Changing away
    from Specific occasion clears Occasion Details.
- Seed account-owned Food Type, Meal Type, Cuisine, Equipment, Verdict,
  Enthusiasm, Informal Unit, and Unmeasured Phrase picklist values from the
  comprehensive reference. No ingredient rows or fabricated ingredient sample
  data are introduced. Protect `Specific occasion` in both applicable lists
  from deletion/merge; Slice 14 owns picklist management UI. Verdict order is
  Favorite, Delicious, Staple, Practice, Try again, Occasionally, Specific
  occasion, Once-a-year-rich, So-so, No, Hell no, MISTAKE.
- Each recipe has `is_private` defaulting to false and a version starting at 1.
  The private flag is stored but sharing routes arrive in Slice 20.
- Explicit Save is the only persistence path. Form edits are drafts until Save;
  there is no autosave.
- A transactional database function performs create/update and multi-select
  association changes under the caller's RLS identity. Updates require the
  expected version and increment it; a stale version returns a distinct
  conflict outcome without writing partial associations.
- Database history triggers record one `recipe.created` event and one
  `recipe.updated` event per successful save, with account, actor, record ID,
  timestamp, and before/after snapshots. History is append-only and readable
  only by its owner. Keystrokes and failed/conflicting saves do not create
  events.
- Build the `/recipes` list, `/recipes/new` form, recipe detail view, and edit
  flow inside the authenticated shell. The empty state leads directly to New
  Recipe. The detail view shows only non-empty metadata without duplicating
  Recipe Tin navigation text or attribution.

## Data boundary

- `recipe_picklist_values` is account-owned with a category, stable UUID, value,
  display order, and protected flag. Composite foreign keys include account ID
  and category so a recipe cannot select another account's value or use a
  Cuisine value as a Food Type.
- `recipes` owns the metadata and references a same-account Food Type, Verdict,
  and Enthusiasm where selected.
- `recipe_picklist_assignments` stores Meal Type, Cuisine, and Equipment
  selections with same-account/category foreign keys.
- `recipe_history` stores append-only create/update events and snapshots.
- Every table has RLS. The transactional save function is `SECURITY INVOKER`,
  checks `auth.uid()`, and writes only the caller's account records. A server
  service-role key is not used for recipe CRUD.
- Trash timestamps, publications, recipe ingredients, instructions, Pairs
  With, References, Tags, photos, public IDs, and sharing fields beyond the
  default-private flag are deferred to their owning slices.

## Test fixtures

- Use local Auth users from `tests/support/local-supabase.ts`; Auth triggers
  create Account rows and the Slice 4 migration seeds that account's picklists.
- Exercise owner isolation with two users. Keep fixtures deterministic by
  selecting picklist values by category/value and time inputs by integer minute
  counts, not by database insertion order.
- Reset the local database only through the documented `npm run dev:local`
  workflow; browser tests create and clean their own Auth users and recipes.

## Test-first acceptance

Write these tests before adding the migration, transaction function, trigger,
recipe routes, or components:

- Unit tests cover State visibility/clearing rules, protected Specific occasion
  behavior, and component-time summation with manual Total Time excluded.
- Browser assertions cover the Want to try default, State-first field order,
  stable-width checkmark picklists, compact control bounds, no number spinners,
  integer-only Serves, wrap-based field layout, mobile single-picker anchoring,
  Opinion for all active response types, Verdict option order, compact headings,
  matching picker-label typography, regular-weight triggers, Reason/picklist
  height parity, centered Serves text, desktop/mobile Serves height rules,
  aligned label boxes,
  Equipment after Serves, and a compact mobile Sigma mark with a 48px hit
  target. Browser checks cover view-specific Total Time order, a dedicated
  desktop classification row, 32px desktop and mobile Edit controls, a 48px
  mobile Edit hit area, right alignment on mobile,
  and the wider desktop list/detail content.
- An integration test creates two Auth users and verifies each gets the exact
  per-account seed sets, cannot read or use the other's picklist values, and
  cannot read or mutate the other's recipes or history.
- An integration test proves recipe save is atomic: invalid picklist IDs and
  stale versions write neither recipe associations nor history events.
- Browser tests cover the empty state, create/save Recipe Tin workflow, detail
  display, edit/save, and reload persistence.
- Browser tests cover each State's conditional fields, Specific occasion
  detail visibility, and clearing when State/selection changes.
- Browser tests prove changing component durations does not alter Total Time
  until the explicit calculate control is activated; calculation sums only the
  nine component fields.
- Integration tests prove create/update history is written once per explicit
  save with the correct actor and before/after values, and no event is written
  for typing or a rejected stale update.
- Axe scans list, create, detail, and edit screens. Desktop/mobile checks cover
  labels, visible focus, keyboard save, touch targets, and no horizontal
  overflow.
- `npm test`, `npm run lint`, and `npm run typecheck` pass locally. The
  production build succeeds without hosted services or production secrets.

## Visual and interaction contract

- Keep the Recipe Tin list and detail layout restrained and consistent with the
  existing shell. Use semantic labels and wrapping flex rows, not a form grid or
  checklist. Single-choice selects are content-sized; multi-picklists use
  stable-width dropdown triggers with checkmark-only options and pale green,
  bold selected styling.
- Put State immediately below Name and default it to Want to try. Keep its
  active response and optional Serves field in the same wrapping row; Equipment
  follows Serves. Put Food Type, Meal Type, and Cuisine on the next wrapping row.
  Serves is a positive integer with no group heading; Reason is single-line.
- Separate the conditionally visible State response from general metadata.
  Switching State updates visibility immediately and clears incompatible draft
  values before Save.
- Component time inputs are compact, spinner-free numeric fields sized to their
  labels and five-character values, with 8px gaps. Total Time occupies its own
  row beside a square, keyboard-operable `Σ` Calculate control and remains
  editable after calculation.
- Desktop field controls target approximately 30–36px height with compact
  padding. Mobile controls remain visually compact while labeled hit rows and
  picklist options preserve 48px touch targets. Serves is 36px high on desktop,
  48px on mobile, with centered numeric text.
- Labeled action buttons use 48px for standalone actions and 32px for actions
  placed beside text. Compact inline actions keep a 48px mobile hit area.
- Use custom anchored single-choice menus with the same height as multi-select
  triggers on desktop and mobile. Keep single- and multi-picklist labels the same
  size and weight, and all trigger text regular-weight. Show Opinion (active
  Enthusiasm, Verdict, or Reason) alongside Name, Food Type, and State in the
  desktop list; mobile shows Name and Opinion. Detail view uses its own
  content-sized order: State and response, Occasion Details when present, Serves,
  Total Time, Equipment,
  classification, remaining times, then Notes. On desktop, classification is a
  dedicated Food Type, Meal Type, and Cuisine row. Recipe-page headings are
  about 16pt (about 21.33px), and Recipe Tin is not repeated as a breadcrumb or
  attribution.
- In detail view, show “Edit” at the right end of the title row on desktop and
  mobile. The inline Edit control is 32px high in both layouts; use normal text
  on desktop and 18px small caps on mobile, with a 48px mobile hit area. The
  desktop list can use up to 1172px and the detail section up to 1012px.
- Put Equipment directly after Serves in the State row. Give the mobile Sigma
  control a compact visible square inside its 48px hit area. Match Reason input
  height to its adjacent picklist.
- Notes use a labelled Markdown textarea in this slice. The structured
  instruction editor from the Slice 3 proof is not integrated until Slice 7.

## Completion criteria

- The specified recipe metadata saves, reloads, and displays correctly for its
  owner, with no cross-account access.
- Seeded picklists are isolated per account and protected Specific occasion
  values cannot be removed through recipe writes.
- Conditional state behavior, manual Total Time, version conflicts, and history
  are covered at their owning layers.
- All tests were written before production code and pass locally; no
  publication, ingredient, or instruction schema is introduced.
