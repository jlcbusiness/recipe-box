# DLC 40: Admin Update Change Classification

**Status:** Implemented in app version 1.14.0.

## Outcome

Admins can classify an Updates entry as **Fix**, **Change**, or **Feature**.
The existing Updates row, inline editor, required classification, completion,
ordering, and audit behavior remain intact.

## References and closest precedent

- [DLC roadmap](./README.md), Phase 16
- [Delivery roadmap](../../delivery-roadmap.md), Mandatory Slice Preparation
- [Comprehensive reference](../../comprehensive-reference/06-sharing-and-accounts.md), § 10.6
- [Settings tabs](../../comprehensive-reference/05-settings-and-taxonomies.md#85-settings-tabs), § 8.5
- [Data model](../../data-model.md), Application update and Admin update event
- [Visual design guide](../../visual-design.md), App admin and Updates
- [Decision log](../../decision-log.md)
- Existing implementation: [Admin Updates](../../../../src/app/admin/admin-updates.tsx),
  [validation rules](../../../../src/lib/admin-updates/rules.ts),
  [server actions](../../../../src/app/admin/actions.ts),
  [database migration](../../../../supabase/migrations/20261216000000_dlc28_admin_updates.sql),
  [unit tests](../../../../tests/unit/admin-update-rules.test.tsx),
  [database tests](../../../../supabase/tests/admin_updates.test.sql), and
  [browser tests](../../../../tests/e2e/admin-updates.spec.ts).

The existing Updates screen is the closest working reference and serves this
workflow well. It already keeps the type picker at the right edge, supports
staged creation and inline changes, and preserves text labels independently
of color. This slice adds one picker option and one matching pill treatment;
the row geometry, keyboard/touch interaction, and persistence flow stay the
same.

## Scope and exclusions

- Add the fixed classification value `change` alongside `fix` and `feature` in
  the Admin Updates workflow.
- Preserve existing Fix and Feature entries and their stored values.
- Keep classifications required and non-clearable. Do not make them
  account-managed or user-configurable.
- Do not add a public changelog, notifications, new completion behavior,
  database-bundle fields, or additional classifications.

## Behavior and presentation

- The type picker offers **Fix**, **Change**, and **Feature**.
- Choosing Change on a populated top draft creates the entry immediately;
  choosing it on a blank top draft stages it. Changing a saved entry's type
  follows the existing inline-edit/save behavior.
- A saved Change entry displays the text label **Change**. Existing entries
  keep their current labels and treatments.
- Retain the current compact pill and row layout. Give Change a distinct,
  high-contrast plum treatment (`#eee7f4` fill, `#41325f` text); the proposed
  pair has 9.41:1 contrast. Keep visible text so color is never the only
  classification cue.
- Validation feedback names all supported choices: “Choose Fix, Change, or
  Feature before submitting.”
- Existing edit, Escape-cancel, revision-conflict, focus, and error-retention
  behavior is unchanged.

## Data, security, and failure boundaries

- Keep the existing `app_updates.kind` text field and its lowercase values.
  Add `change` to the database constraint and to the create/update RPC
  validation in a forward-only migration; do not rewrite the original DLC 28
  migration or existing records.
- Keep the existing admin-only RLS, independently authorized server actions,
  and revision checks. No table, role, or public-access change is needed.
- A Change-to-other-type edit remains a `classification_changed` audit event
  with its existing before/after state. No history schema change is needed.
- Invalid values remain rejected by both application and database validation;
  failed writes preserve the inline draft and show the current error treatment.

## Acceptance criteria and automated coverage

1. Unit validation accepts exactly `fix`, `change`, and `feature`; it rejects
   unsupported, blank, and non-string values.
2. Database tests prove an Admin can create a Change entry and change an
   existing entry to Change, with revision and classification audit behavior
   preserved. Unsupported values remain rejected.
3. Browser tests select Change from the top draft, verify the saved label and
   persistence after reload, and change a saved entry's classification using
   the inline editor. Existing Fix/Feature creation and editing remain
   covered.
4. Browser assertions verify keyboard-operable selection, an accessible
   Change label, at least 4.5:1 text contrast for its pill, and no horizontal
   overflow at representative desktop and mobile widths. Inspect the Updates
   screen at desktop and Fold 6 widths.
5. Run the focused unit, database, and Admin Updates browser tests, plus
   typecheck, targeted lint, and `git diff --check`.

## Assumptions and open decisions

- Change means a deliberate modification to existing application behavior,
  distinct from a Fix (correcting unintended behavior) and a Feature (adding
  new capability). This is a label, not a workflow or completion state.
- The plum treatment is a proposed visual distinction for review; labels and
  all existing row interactions remain unchanged.
- App version **1.14.0** is selected for this additive feature.
