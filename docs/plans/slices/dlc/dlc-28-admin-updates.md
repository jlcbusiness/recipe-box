# DLC 28: Admin Updates

**Status:** The original DLC 28 implementation was verified locally and on the
linked Supabase project. Manual ordering and the global version footer are a
local follow-up and have not been pushed to the linked project.

## Outcome

An administrator can maintain a shared, internal list of application updates
from an **Updates** tab in Administration. Each saved entry has exactly one
required type, **Fix** or **Feature**, and can be marked complete with the
release version. The list is private to administrators and does not appear to
regular signed-in users or anonymous visitors.

## References

- [DLC roadmap](README.md), DLC 26 and 27 sequencing
- [Comprehensive reference](../../comprehensive-reference.md), §§ 10.3–10.6,
  12, 13, and 16
- [Data model](../../data-model.md), ownership and row-level security
- [Design philosophy](../../design-philosophy.md), hierarchy, state, and
  accessibility
- [Visual design guide](../../visual-design.md), account menu and admin shell
- [Decision log](../../decision-log.md)
- [Slice 2: Invites and admin](../2-invites-and-admin.md)
- [DLC 05: Instruction authoring and references](dlc-05-instruction-authoring-and-references.md)
- [DLC 26: Recipe-editor save shortcut](README.md#phase-5-recipe-and-document-output-follow-up)
- [DLC 27: Ingredient sets and instruction groups](dlc-27-ingredient-instruction-groups.md)
- Closest implementations:
  [Admin page](../../../../src/app/admin/page.tsx),
  [Admin actions and controls](../../../../src/app/admin/admin-controls.tsx),
  [Instruction editor](../../../../src/app/recipes/instruction-steps-editor.tsx),
  and [keyboard-operable tabs](../../../../src/app/recipes/find/recipe-search-tabs.tsx).

## Scope and accepted decisions

- Add accessible **Accounts** and **Updates** tabs to `/admin`. Accounts is
  selected by default and retains the current invitation and account table.
  Updates opens a focused management pane without changing the route or
  disturbing the Accounts workflow.
- The new content is globally shared application data, not owned by an
  account. Any administrator may read and manage it. It is not a user-facing
  changelog, email notification, package-version source, or account backup.
- Keep the Updates pane focused on the list; do not show Add, Edit, Archive,
  or Restore buttons. Preserve archive state and audit history in the database,
  but show previously archived entries as ordinary rows.
- Each entry contains Markdown text and exactly one required type: **Fix** or
  **Feature**. **Tweak** and other types are deferred and excluded from this slice.
- The type control is a compact **+ Add tag** pill while a new entry is being
  drafted. Selecting a type replaces it with a content-sized olive-green
  **Fix** or light-blue **Feature** pill. The saved type can be changed but
  cannot be cleared. A draft cannot be submitted without choosing one.
  Selecting a type on a non-empty top draft creates it immediately; choosing
  a type while the draft is empty stages it without creating an entry.
  Labels remain visible independently of color, and both fills/text meet the
  project's contrast target.
- **Done** is the leftmost control. An incomplete entry has a native checkbox;
  checking it opens a dialog with a required version field, **Cancel**, and
  **Submit**. Completion is staged until valid submission. Accept only the
  SemVer core `major.minor.patch` (for example `1.2.3`): no leading zeroes in
  numeric components (except `0`), `v` prefix, prerelease, or build suffix.
  Do not require the entered version to equal the running package version.
- A completed entry shows its version in the Done column at approximately
  8pt, centered horizontally without a border, with an accessible label such as
  `Done in 1.2.3`. Activating the version opens the same dialog to correct it
  or explicitly mark the entry incomplete.
- Sort incomplete entries first and preserve their manual order. New and
  reopened incomplete entries start at the top. Completed entries cannot be
  reordered and sort by completion timestamp descending, newest first,
  independent of version text. Correcting a completed version preserves its
  timestamp; reopening clears it. Archive state does not affect order or
  visibility. Keep the completion checkbox, small dotted grip, and text field
  in the existing 64px leading rail, with about 12 CSS pixels from list edge to
  checkbox, checkbox to grip, and grip to text. Make the blank lane from just
  beyond the checkbox through the grip-to-text gap draggable across the full
  row height without moving the text field or overlapping the checkbox itself.
  Use the same grip symbol as recipe instructions; keep the dragged row
  attached to the pointer while neighboring rows move into place. Successful
  pointer drops should not force a lingering focus outline. Nearby rows should
  follow drag previews with responsive motion that respects reduced-motion
  settings.
- Use a semantic list with **Done** and **Type** headings. A persistent blank
  Markdown field at the top creates entries; each saved row keeps its
  completion control on the left, text in the center, and type pill at the far
  right. Keep controls compact and prevent page-level horizontal scrolling.
  On mobile, use 14px text with 1.4 line height. Rows have a 56px minimum from
  48px controls plus vertical padding, then grow to fit all wrapped lines;
  recalculate textarea height when the list width changes and never clip
  partial lines.
- Hide completed entries by default. A compact eye/eye-off control toggles
  their visibility, and the icon indicates current state (crossed eye when
  hidden, open eye when visible); incomplete entries remain visible.

## Editor and content behavior

- The blank field at the top of the list is always available for a new entry.
  Clicking an existing text field edits it in place; its type pill stays
  alongside it. Moving focus outside the row saves the body and type together;
  selecting a type creates a non-empty top draft immediately. **Escape**
  discards the inline draft. Switching to another entry saves the current valid
  draft before opening the next one.
- Validate the inline draft before saving. Keep invalid text or server errors
  visible in the row with the draft intact. Announce successful saves to
  assistive technology without adding routine helper text to the pane.
- Reuse the instruction editor's plain-text Markdown authoring behavior:
  paragraphs, headings, emphasis, links, ordered and unordered lists, nested
  list continuation, and keyboard text editing. This is not a rich-text
  toolbar. Do not add recipe-specific autocomplete or interpretation for
  ingredients, temperatures, durations, photos, or other recipe tokens.
- Render only an explicit safe Markdown allow-list. Treat raw HTML as text;
  reject or render unsafe link schemes as inert text. Updates do not accept
  images or embedded media.
- A blank or whitespace-only body is invalid. The maximum stored body length
  is 5,000 Unicode code points after trimming; show an inline validation
  message and preserve the draft on error.
- Version validation errors appear next to the field in text and red styling,
  keep the dialog open, and preserve the typed value. Server errors are
  announced and preserve the editor draft. Disable duplicate submissions while
  a request is pending.
- Every dialog/pane has a visible title, moves focus to an appropriate control
  when opened, supports keyboard operation and Escape cancellation, and
  returns focus to its invoking control when closed. The type picker supports
  pointer, touch, and keyboard selection. The compact visible pill must still
  have a usable touch target.

## Data, security, and failure boundaries

- Model updates as a global shared entity with no `account_id`; the current
  administrator is recorded as actor metadata, not as the record owner.
- The `app_updates` record includes a UUID, Markdown body, required
  constrained `kind`, nullable validated `completed_version`, archive state,
  persistent `sort_order`, nullable `completed_at`, creation/update timestamps
  and actors, and a monotonically increasing revision for optimistic
  concurrency. `completed_at` is set once on completion and retained when the
  version is corrected.
- Enforce the Fix/Feature domain, body length/non-emptiness, and completion
  version format in the database as well as in the UI. A null completion
  version means incomplete; a non-null version means done, avoiding duplicate
  status fields that can disagree.
- Record create, edit, type change, completion/version change, reorder, archive,
  and restore in a separate append-only admin-update history table in the same
  transaction. Include actor ID, timestamp, event type, and allow-listed
  before/after values. History is not editable through application actions.
  Account deletion must not cascade-delete shared updates or their history;
  actor references may become null.
- Enable RLS for both tables. Anonymous and non-admin authenticated clients
  cannot read or write either table. Every server action independently
  validates the current Auth user and `accounts.is_admin` before calling an
  authorization-checking RPC through the authenticated session client. The
  RPC repeats the admin check. Never trust a hidden tab or client-supplied
  actor identity as authorization.
- Reject stale revisions without overwriting newer edits; preserve the
  submitted draft and report a recoverable conflict.
- Updates and audit history are excluded from database ZIP export/import and
  account content reset. They do not appear in public recipe payloads or
  recipe/publication history.
- Migration and RLS verification use the disposable local database or an
  isolated test harness. Do not reset the shared local database merely to test
  this slice, and never apply a migration to a linked project.

## Dependencies and exclusions

- Depends on Slice 2's `/admin` route, `accounts.is_admin` boundary, and
  admin authorization, plus the Markdown behaviors established by DLC 05.
- DLC 26's save shortcut and DLC 27's ingredient/instruction grouping are
  independent and are not dependencies.
- No public changelog, user notification, additional classification type,
  custom tag color, image upload, recipe autocomplete, package-version
  automation, or history browser is included.

## Acceptance criteria

### Navigation and permissions

- Admins can switch between Accounts and Updates using mouse, touch, and
  keyboard. Tabs expose selected state, controlled panels, visible focus, and
  arrow-key/Home/End navigation. Accounts remains the default and its invite
  and account-management behavior is unchanged.
- Non-admins are redirected as today and cannot read or mutate update rows or
  audit history through direct authenticated requests or forged server-action
  submissions. Anonymous requests have no access.
- One admin's changes appear for another admin; deleting or resetting an
  account does not remove shared updates.

### Entry lifecycle and classification

- Admins can add and edit individual entries from the list. The persistent
  blank field appears above saved rows; each row keeps completion, text, and
  type controls in the left-center-right order. Previously archived entries
  appear as ordinary rows; archive history remains append-only.
- The eye/eye-off control hides or reveals completed entries. Incomplete
  entries remain visible in either state.
- New and edited entries cannot be submitted without exactly one Fix or
  Feature classification. The in-progress **+ Add tag** control is discoverable
  with keyboard and touch, selecting a type changes its text and color, and
  an existing type can be changed but never cleared.
- Tests cover empty body, length boundary, unsafe Markdown/URLs, persistence
  after reload, actor attribution, and concurrent stale revisions.

### Completion and ordering

- Checking Done opens the version dialog without marking the row complete.
  Cancel leaves it incomplete. Valid `x.y.z` submission stores the version and
  replaces the checkbox with its accessible version label.
- Test valid boundaries (`0.1.0`, `1.2.3`) and invalid values (missing
  component, nonnumeric or negative component, leading zero, prefix,
  prerelease, build suffix, whitespace, and empty input). Invalid submission
  shows a textual error, keeps the pane open, and preserves input.
- A completed version can be corrected or explicitly cleared to reopen the
  entry. Completion time is retained through version corrections and cleared
  on reopen. Incomplete entries are manually reorderable and new or reopened
  entries start at the top; completed entries sort newest-completed first.
- Dragging uses a dedicated handle, supports pointer and touch previews, keeps
  order unchanged on Escape or pointer cancellation, and provides Ctrl+Arrow
  keyboard moves with polite announcements. Reordered state persists after
  reload and is recorded in the audit history.

### Presentation, reliability, and accessibility

- The centered text field is a plain Markdown editor without preview or
  recipe-specific interpretation.
- Empty, saving, conflict, and server-error states are understandable and
  recoverable. Escape never saves partial changes.
- Desktop and mobile browser checks cover representative content and widths
  around the existing 640px navigation breakpoint, with no page overflow.
  Fix/Feature pills meet text contrast requirements; the version label remains
  legible at its compact target size and appears at the document end on every
  route.
- Automated accessibility checks cover tabs, inline editing, type selection,
  completion dialog, focus return, list headings, and error announcements in
  Chromium and Fold 6.

## Implementation and verification

- Unit and bootstrap tests pass: 554 Vitest tests and 8 Node tests.
- Local pgTAP migration coverage passes all 46 assertions, including order
  initialization, completion timestamps, reorder authorization and stale-list
  conflicts, audit events, revision conflicts, RLS, and actor deletion.
- Focused Chromium and Fold 6 browser coverage passes all eight cases: the
  Admin Updates create/edit/complete flows, pointer/touch/keyboard reordering,
  role isolation, and the shared version-footer check. It covers immediate
  creation from a populated draft on type selection, nested-list keyboard
  continuation, inline editing and Escape cancellation, completion
  validation/correction/reopen, persisted order, drag cancellation, Axe,
  responsive widths, overflow, and mobile hit targets.
- `npm run typecheck`, `npm run build`, and `npm run lint:md` pass. Repository
  Biome lint exits successfully with warnings; focused checks for changed
  TypeScript pass. Browser geometry assertions verify no page overflow at
  641px, 640px, and 390px; desktop and mobile screenshots are captured by the
  E2E flow.
- The comprehensive reference, data model, DLC roadmap, and visual design
  guide now describe the implemented behavior. The migration and pgTAP tests
  were applied only to the local database; no reset or linked migration was
  performed.

## Assumptions accepted for implementation

- The 5,000-code-point body limit is a proposed input and storage guardrail; it
  was not a user-specified product requirement and is an implementation
  guardrail.
- Archiving preserves an entry's completion version, and restoring it returns
  it to the active list with its previous content and state.
- The two classifications are fixed labels, not configurable account
  picklists. Every admin has equal permission to manage all shared entries.
