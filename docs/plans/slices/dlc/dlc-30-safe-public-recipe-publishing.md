# DLC 30: Safe Public Recipe Publishing

**Status:** Implemented and validated locally; production HTTP 500 resolution
remains pending deployment evidence.

## References

- [DLC roadmap](README.md), Phase 7
- [First-draft specification](../../first-draft-spec.md), Sharing and Authentication
- [Comprehensive reference, § 9](../../comprehensive-reference.md#9-sharing-privacy-urls-and-image-delivery)
- [Data model](../../data-model.md), Ownership, Core Entities, and Required Future Detail
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md), Recipe Detail and Public Recipe View
- [Decision log](../../decision-log.md)
- [Slice 22: Public Links and Privacy](../22-public-links-and-privacy.md), current implementation contract

## Outcome

Recipes are private unless the User whose account contains the recipe
deliberately publishes it. When a User tries to copy a private recipe's share
link, they confirm that
publishing lets viewers save private copies, including the public recipe
photos. The privacy toggle itself is an explicit publish action and does not
show that confirmation. The public recipe identifies its author by the
account's chosen public username. A saved copy's attribution behavior is
defined in [DLC 31](dlc-31-save-public-recipe-copies.md).

## Accepted product contract

- Publishing a recipe is the User's permission for viewers to save a copy of
  the data and photos exposed by the public recipe page. A copy does not become
  public automatically.
- Every saved copy must retain a non-removable source URL reference labeled
  with the source username and recipe title. The reference cannot be edited or
  deleted while the copied recipe exists.
- The public page may show the chosen username as author attribution. It must
  not expose the User's login email, account ID, or other account data.
- The public projection remains allow-listed. Its current recipe content,
  nutrition per serving, photos, and approved relationships may be viewed and
  copied. User-only evaluation fields, notes and gotchas, tags, history,
  account preferences, ingredient profiles/equivalents, and private storage
  paths remain excluded.

## Scope and dependencies

- Change the recipe privacy default to private and use a forward migration to
  make every existing recipe private. Keep each stable public ID, recipe
  content, and ownership intact. Those links remain unavailable until the
  User republishes the recipe.
- Deliver public recipe photos through an application-controlled request path
  that checks the recipe's current visibility on every request. Do not return or
  redirect to a Supabase signed URL: a signed URL can be used until it expires,
  even after the recipe becomes private. Disable caching for photo responses.
  Privatizing a recipe blocks future requests but cannot retract bytes already
  delivered or saved by a Guest.
- Add one account-level public username, require it before publication, and
  show it as plain-text author attribution on public recipe pages. Allow the
  User to update it in Settings. It is not a public profile,
  account-discovery feature, or URL component.
- When **Copy share link** is activated for a private recipe, ask the User to
  confirm publication and its copy-permission consequences before making it
  linkable. If the recipe is already linkable, copy its stable URL directly
  without another confirmation.
- Treat changing the privacy switch from Private to Linkable as informed
  intent. Publish without the copy-permission confirmation; changing back to
  Private remains immediate.
- Ask for a public username only when the account has never saved one. If one
  is already saved, use it without prompting; Users can change it in Settings.
  If a first-time User uses the privacy switch, collect the required username
  without showing the copy-permission confirmation.
- Keep existing backup-import privacy restoration semantics unchanged. Public
  recipe copies created by DLC 31 are private and receive a new public ID;
  they never inherit the source ID.
- Diagnose and fix the reported production public-link HTTP 500. Do not turn a
  real data/service failure into a successful-looking 404. Keep guest-facing
  error output generic and add sanitized, operation-specific server diagnostics
  without logging recipe content, credentials, or signed URLs.
- Do not add a public user directory, profile page, or public recipe search.

## Existing patterns and interaction

The private recipe toolbar in `RecipeShareActions` is the closest working
reference for link copying and the privacy switch. Its compact actions and
live feedback fit the workflow, but the current copy button copies a private
recipe's unusable URL. Preserve the toolbar and feedback placement while
giving private-link copying a confirmation flow and keeping the privacy switch
an immediate, explicit publish action. The public recipe page already uses a
separate guest layout and remains free of private navigation.

When a User copies a private recipe's share link:

1. Open a confirmation dialog that identifies the recipe and explains that
   viewers can read and save a private copy of its public data and photos.
   Summarize what remains private, including User-only ratings/markers,
   private notes, and history. Clearly state that saved copies retain
   unremovable source attribution.
2. If the account has no saved public username, collect one in the same flow.
   Show
   validation and uniqueness errors as explanatory red text directly below
   the field, associate the message with the input, and retain the entered
   value. Do not change recipe privacy.
3. On confirmation, persist the username and linkable state through an
   User-authorized, version-checked path. Cancel leaves both unchanged.
4. Copy only after publication succeeds. A clipboard failure reports that
   publication succeeded but copying did not; the recipe remains linkable and
   the User can retry.

When a User changes a private recipe's privacy switch to Linkable, publish
directly without the copy-permission confirmation. If the account has never
saved a public username, ask for it before completing the first publication;
subsequent publishes use the saved username without asking again. The User
can change the username in Settings.

When the recipe is already linkable, **Copy share link** copies its stable URL
without another confirmation. Making a recipe private immediately disables the
public page and photo delivery on the next request.

Keep the dialog keyboard-operable with initial focus on its heading or first
control, visible focus, labeled inputs, Escape/cancel with no write, and focus
restoration to the initiating toolbar control. On narrow screens the dialog
must remain viewport-bounded and scroll internally without page-level
horizontal overflow.

## Data, security, and failure boundaries

- Store the username on the Account record with User-scoped access and
  database-enforced uniqueness after normalization. The public loader selects
  only that username for an active, linkable recipe.
- The privacy migration sets the column default and existing rows to private.
  Verify it does not rotate public IDs or alter unrelated recipe data, and
  preserves the project's version/history invariants for system migrations.
- All recipe visibility writes remain User-authorized and version-checked.
  A stale version, duplicate username, failed migration-dependent write, or
  database error must not leave the recipe linkable without a valid username.
- Normalize handles to lowercase and require 3–30 ASCII letters, numbers, or
  hyphens, with no leading or trailing hyphen. Enforce case-insensitive global
  uniqueness. Invalid or unavailable handles receive a field-level message
  below the input; the message is exposed to assistive technology and does not
  rely on red color alone.
- A private or trashed recipe must not return public photo bytes. Keep the
  media bucket private and the existing public allow-list boundary. The
  application-controlled photo endpoint checks that the recipe is active and
  linkable before every response, streams the bytes rather than exposing a
  signed Storage URL, and prevents response caching. Account for the added
  application-server bandwidth and latency.
- The current public loader replaces query errors with a generic exception.
  Identify the failing production operation from safe server-side diagnostics
  and fix its root cause. If the production-only failure cannot be reproduced
  locally, record the remaining deployment verification instead of claiming
  the issue is resolved.

## Acceptance criteria and automated coverage

Write focused failing tests before production changes:

- An isolated migration test proves existing recipes become private, new
  recipes default private, public IDs and recipe content remain unchanged,
  and the default applies to recipes created after migration.
- Database and action tests prove only the signed-in User can set or change their
  username and recipe privacy; case-insensitive duplicate usernames fail
  without partial publication; stale recipe versions cannot publish; and the
  existing backup-import privacy behavior remains intact.
- Browser tests prove copying a private recipe's link requires confirmation;
  cancel leaves privacy unchanged; confirming publishes only after valid
  first-time username handling; changing the privacy switch from Private to
  Linkable does not show the copy-permission confirmation; and changing it
  back to Private remains immediate.
- Tests prove a first-time username is collected when needed by either publish
  path, while an existing username is reused without prompting and remains
  editable in Settings. Copying an already-linkable recipe never asks for
  publication confirmation.
- Clipboard errors accurately distinguish a successfully published recipe
  from a link that was not copied.
- Handle tests cover minimum and maximum lengths, allowed and rejected
  characters, leading/trailing hyphens, case-insensitive collisions, and
  editable Settings values. Invalid or unavailable handles show the
  explanatory error directly below the field, preserve the entered value,
  announce the error accessibly, and leave the recipe private.
- Public projection and HTTP tests prove the intended username appears only
  for an active public recipe; login email, account ID, private fields, and
  private media paths remain absent; private/unknown/trashed behavior and
  no-store headers remain correct; and a valid public link loads without the
  reported HTTP 500.
- Photo-delivery tests obtain a public photo URL, make its recipe private or
  trashed, then request the same URL again and prove that no image bytes are
  returned and the response is not cacheable. Verify that the application
  never returns or redirects to a signed Storage URL.
- Chromium and Fold 6 checks cover the private-link confirmation/cancel/error
  states and first-time username collection, the direct privacy-toggle flow,
  keyboard and focus behavior, visible labels, axe checks, and responsive
  bounds. Verify the public page byline does not introduce navigation or
  horizontal overflow.
- Confirm production resolution of the reported 500 from deployment evidence
  after rollout; local tests alone cannot prove a production-only failure is
  fixed.

## Accepted decisions and remaining assumption

- Accepted username rule: 3–30 lowercase ASCII letters, numbers, or hyphens;
  no leading/trailing hyphen; case-insensitive global uniqueness. Users can
  update the handle in Settings. Public recipe pages show the current handle;
  copies retain the handle captured in their protected source reference.
- Invalid or unavailable handles show explanatory red text directly beneath
  the username field, associated with the input and announced accessibly.
- No additional handles are reserved for launch. Case-insensitive uniqueness
  ensures only one account can claim an available handle; revisit reservations
  if system or service names need protection later.
- The migration makes every existing recipe private without changing its
  stable public ID. A User must explicitly republish a recipe to restore access
  through its existing link.
