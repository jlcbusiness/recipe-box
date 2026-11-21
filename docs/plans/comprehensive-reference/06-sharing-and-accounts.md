# Recipe Box Comprehensive Reference: Sharing and Accounts

[Back to the comprehensive reference index](../comprehensive-reference.md)

> Canonical product requirements: Privacy, URLs, public recipes, image
> delivery, abuse protection, authentication, invitations, roles, and
> administrator-managed updates.

## 9. Sharing, Privacy, URLs, and Image Delivery

### 9.1 URL Structure and Hash IDs

- Every recipe has a stable URL incorporating a long random hash ID (e.g., `/r/e7f8a9b2c3d4e5f6`).
- The URL remains identical whether the recipe is public or private.

### 9.2 Privacy Toggle and HTTP Status Behavior

- **Default State:** Recipes are private by default. Existing recipes are
  private unless the User explicitly republishes them; their stable public IDs
  and URLs are preserved.
- **Private Toggle:** Marking a recipe private restricts access to the signed-in User whose account contains the recipe.
- On mobile, the privacy toggle remains 72px wide in both Private and
  Linkable states. Show `Private` when private and the two-line `Can` / `Link`
  label when linkable; do not resize the control when its state changes.
- **HTTP Response Rules for Guest Requests:**
  - **Private Recipe:** Returns **HTTP 404 Not Found** with a generic, calm page ("This recipe is currently
    unavailable") and `Cache-Control: no-store` . Does not reveal that the recipe exists, nor its title, User, or
    publication. (Avoids misusing HTTP 503).
  - **Trashed Recipe:** Treated like a private recipe (404) until restored or purged.
  - **Permanently Purged Recipe:** Returns **HTTP 410 Gone**. This requires keeping a record of the purged public ID.

### 9.3 Public Recipe Experience

When a Guest accesses a valid public recipe link, whether signed in or not:

- **Allowed Actions:**
  - View full recipe card in Ingredient-First view.
  - Scale servings ($jx$, $1/j$, or custom servings).
  - Switch measurement display units. The page opens in the recipe's stored units because a guest has no unit preferences.
  - Print recipe.
  - A signed-in User can save another User's active public recipe to their
    Recipe Tin. The copy is private, uses only public recipe data and photos,
    and is independent of the source. A User cannot save their own public
    recipe as a duplicate; the Save action explains why without creating a
    copy. Visitors without a verified session can still read and print but do
    not see a save action.
- **Restricted / Hidden Elements:**
  - No application navigation, sidebar, or account links.
  - No edit, delete, or clone buttons.
  - No User-only evaluation metadata, including Verdict, Score, Star, or Heart.
  - Publication name is displayed as static text attribution, not a clickable link.
  - Safe external HTTP(S) references are clickable; in-app recipe references
    remain static text.
  - In-app pairs-with links are displayed as static text.

The public allow-list includes the optional `prep_ahead_markdown` field only
for an active linkable recipe. Render it as a **Pre-recipe Prep** callout before
ordered steps, including in public print and downloads. Personal Notes,
history, and other non-allow-listed fields remain excluded.

The public time summary is labeled “Time Breakdown,” places Total Time before
ordered time entries, and follows the shared duration format in 2.2. Public
ingredients use the same transient scalar
teaspoon `pinch` display rule; saved account unit preferences are never read or
exposed.

When available, public recipe detail and print show the italic
**Nutrition Per Serving** section after Steps (public recipes have no Notes). It contains only recipe-level
estimated values; the public payload never contains ingredient Settings
profiles, recipe-ingredient overrides, or measure equivalents.

The public title and action grid share a row. On desktop, Save to Recipe Tin,
Download, and Print appear across the top row in that order, with Page settings
beneath Print at the right edge. At 640px and below, keep Print & Download
combined to the right of Save, and put Page settings beneath that menu. When a
base serving count exists,
show `- serves n` inline after the title, separated by a space, in regular 16px
text; do not repeat Serves in the summary. Use 24px horizontal page gutters. Cap public
photos at 420px wide and `min(280px, 60vh)` high. Above 760px, show the photo
gallery beside the Time Breakdown and Equipment summary; at narrower widths, stack the
summary below the photos. The **No emphasis** and **No instruction photos**
buttons are text-labeled, start unpressed, and keep transient state only for
the loaded page. On narrow screens, place the combined Print & Download action
grid at the title area's top-right and the toggles below the title. Public print matches the visible guest
presentation and field order, omits controls and gallery photos, and honors the
active inline-photo and emphasis choices without loading Account preferences.
Print requests landscape while leaving the browser dialog authoritative.

Saving a public recipe creates at most one active copy per destination account
and source public ID. If an active copy already exists, the User chooses
whether to open it or stay on the public recipe. A copy in Trash remains
untouched; saving again creates a fresh active copy. The copy receives
destination-owned IDs and private photo objects, remains private, and does not
inherit source account data or private fields. Its read-only protected URL
reference is labeled `{source username}'s {recipe title}` and cannot be
changed while the copy exists. If the source publication is the Recipe Tin
collection, it is not copied as a source citation; the Tin is a container, not
a recipe source.

The Save action remains available when a signed-in User opens their own active
public recipe. Submitting it returns the distinct message
`You already have this recipe. Use "copy" if you wish a duplicate.` No private
copy link or owner identity is returned. The server checks the verified
session's account before staging public photos, and the database copy function
repeats the owner check before inserting any copy rows. Other viewers' saves
and their already-saved-copy flow remain unchanged.

### 9.4 Recipe duplication

A signed-in User can duplicate an active recipe in their own account from its
detail page. The dialog defaults the name to `{source name} (Copy)` and the
active source publication, falling back to Recipe Tin if that publication is
no longer active; both values can be changed. Confirming creates a separate
private copy and opens it in the editor. The original is unchanged.

Duplication copies the recipe graph and user-entered recipe data using fresh
recipe and child identities. Same-account catalogs and valid recipe links are
reused, self-links are remapped to the copy, and photos are staged at new
private Storage paths before the atomic database commit. Failed staging or
commit removes staged media and leaves no partial graph.

Protected public-source attribution is copied as provenance, but duplication
clears `saved_from_public_id`, which identifies only a recipe created by the
direct public Save action. Each account may have only one active recipe for a
non-null direct-save marker; a trashed marked recipe does not block a fresh
direct save, and a conflicting restore is rejected. Migration backfill sets
the marker only when a recipe has exactly one distinct protected source ID;
ambiguous attribution remains protected but unmarked.

### 9.5 Secure Image Delivery

- All covers and recipe images are stored in **private Supabase Storage buckets**.
- The public bucket setting is disabled.
- Original uploads use a one-use signed path so image bytes never pass through
  a Server Action or function request body. The authenticated server validates
  the staged object and writes metadata-free WebP full and thumbnail
  derivatives.
- Public recipe photos are delivered through an application-controlled
  endpoint that checks the recipe's current public and active state on every
  request, streams the image bytes from private Storage, and prevents response
  caching. Do not expose or redirect to a signed Storage URL for public recipe
  photos. Privatizing or trashing a recipe blocks future photo requests, but
  cannot retract image bytes already delivered or saved by a Guest.
  Publication covers are never public.
- Deletion queues every private object path. A Vercel daily cron invokes the
  protected cleanup endpoint; Storage failures remain queued and are retried.

### 9.6 Abuse Protection

- The application does not implement public-route rate limiting. Configure a
  Vercel Firewall rule for `/r/*` if deployment-level rate limiting is required.
- Authentication endpoints keep Supabase's default rate limits.
- Authentication emails (recovery, verification) require a custom SMTP provider; Supabase's built-in email sender is
  limited to 2 emails per hour.

---

## 10. Authentication and Account Setup

### 10.0 Role terminology and current implementation boundary

- **Guest:** Anyone accessing a recipe through its public link. Guest describes
  the access context, not account status; a signed-in User can be a Guest while
  viewing another User's public recipe.
- **User:** A person with an account on the app. A User's account contains that
  User's private recipes and other account data. Use **User** or **account**
  rather than calling a User an owner.
- **Admin:** A User with access to the App admin and Updates areas of Settings
  and authority to manage ordinary User accounts and the administrative
  functions provided there. Admins can grant Admin access, but cannot demote
  or delete an Admin account or transfer application ownership.
- **Owner:** The single application-owning Admin. The Owner can manage Admin
  accounts in App admin, including demotion and deletion, and can transfer Owner status to
  another account. On transfer, the new Owner becomes an Admin and the former
  Owner remains an Admin.

Use **Owner** only for the application role. Guest is contextual and can apply
to any account status. Existing account and recipe data-ownership relationships
may be described as account-owned; do not use "owner" as a synonym for User.
The Administration table labels an ordinary User as **Member**; Member is a
display label, not a separate role.

The account schema has `is_admin` and `is_owner` flags, constrains the Owner to
also be an Admin, and permits at most one Owner. The Owner role is assigned to
the first administrator and can be transferred through the protected
App admin workflow. The Owner account cannot be deleted before ownership
is transferred. Admins can grant Admin access; only the Owner can demote or
delete Admin accounts or transfer Owner status.

### 10.1 Email and Password Authentication

- Email + password login with standard "Forgot Password" reset link flow.
- **Email Verification:** Verification is the invite. The app emails the invite link to the address the Admin enters,
  and accepting it proves the person controls that mailbox, so there is no separate verification step and no skip
  option. Open development sign-up has no verification.

### 10.2 Social Authentication

- Google OAuth is an alternative to email/password, not an addition. Each account uses exactly one sign-in method,
  chosen when the invite is accepted. Methods are never combined or linked on one account.

### 10.3 Invite-Only Sign-Up

- In production, sign-up is invite-only. An Admin generates account-creation
  links for ordinary Users.
- In development, sign-up is open. A per-environment switch controls this; development runs locally and production is
  set up last (14).
- Production starts with the designated Owner account from the configured
  pre-created administrator invite. The first-Admin claim establishes the
  Owner role, and only one Owner can exist at a time. Admins manage ordinary
  User accounts and send invitations; any Admin can grant Admin access, while
  only the Owner can demote or delete Admin accounts or transfer Owner status.
- Invites are sent by email, not copied by hand.
- An invite is bound to the email address the admin enters. Slice 2 supports
  email/password accounts and stores the chosen method immutably. Before Google
  sign-in is enabled in Slice 25, tests must prove that Supabase's same-email
  identity linking cannot combine providers on one account.

### 10.4 Slice 1 account boundary and deterministic auth testing

- Slice 1 establishes the account-owned data boundary with a minimal Account
  record linked to the authenticated User's identity. It is the first concrete
  account-scoped resource and proves the row-level security pattern before any
  recipe, publication, picklist, or other product schema exists.
- Tests create their local Auth users directly through a test-only local setup
  path. They do not exercise or depend on invitations, Admin provisioning,
  production sign-up restrictions, or external email delivery to arrange their
  fixtures.
- The slice must prove that an authenticated account can access only its own
  Account record and private storage path; another authenticated account and an
  anonymous request cannot read or modify them. The storage bucket remains
  private.
- Next.js sessions use Supabase's SSR cookie client. The Next.js proxy refreshes
  and verifies session claims; protected server-rendered routes verify the
  current Auth user before rendering private content.
- This test-fixture convenience does not define the product sign-up policy.
  Slice 2 defines invitations, Admin behavior, production invite-only enforcement,
  and the one-sign-in-method rule. Recipe and other domain tables remain
  deferred to their owning slices, beginning with Slice 4.

### 10.5 Slice 2 sign-up and invitation boundary

- The application uses an environment-controlled sign-up mode. Local development
  is open and does not require email verification. Invite-only mode hides
  self-registration and rejects sign-up actions; production also disables
  Supabase Auth sign-up directly when production is configured in Slice 25.
- Supabase Auth is the source of truth for invitation creation, email binding,
  single use, and expiry. An existing Admin sends an invite from the trusted
  server, Supabase sends the email, and the invitee confirms it before choosing
  a password. Local invitation links use the configured email OTP expiry of
  3,600 seconds (one hour).
- `accounts.is_admin` defaults to false. Users cannot modify
  `is_admin` or `sign_in_method` through PostgREST. Authenticated update
  privileges are column-scoped; administrative changes use a server-only
  Supabase secret key only after the request's Auth User and Admin flag are
  verified.
- Slice 2 accepts email/password accounts only and records the method as
  `email_password`. Google sign-in and the same-email identity-linking conflict
  are verified before Google is enabled in Slice 25; accounts must not combine
  providers.

### 10.6 Administrator-managed Updates

> **Current implementation (DLC 28, extended by DLC 40 and DLC 42).** Local
> and linked migrations, database tests, administrator workflows, and
> responsive browser checks are recorded in the [DLC 28 brief](../slices/dlc/dlc-28-admin-updates.md),
> [DLC 40](../slices/dlc/dlc-40-admin-update-change-type.md), and
> [DLC 42](../slices/dlc/dlc-42-admin-update-text-reflow.md) briefs.

- The admin-only Settings tabs **App admin** and **Updates** contain account
  invitations/management and the global Updates tracker, respectively. Updates
  is an internal tracker, not a public changelog. The legacy `/admin` route
  redirects to App admin for Admins and retains its non-admin redirect.
- An administrator can add and edit individual update entries. Entries are
  shared among admins, remain independent of any one account, and are excluded
  from account reset and database ZIP import/export. The Updates interface has
  no archive or restore controls and displays previously archived entries as
  ordinary rows. Each saved entry has a trailing X control that asks for
  confirmation before permanently deleting the entry and its audit history.
- A person, script, or Copilot may read update entries through a dedicated
  read-only REST endpoint with bearer-key authentication. This does not make
  the tracker public or grant access to audit history or mutations. The
  endpoint and shared Vercel Secret lifecycle are defined in
  [DLC 41](../slices/dlc/dlc-41-admin-updates-api.md).
- The Updates list has a persistent blank Markdown field at the top. Each row
  has a completion control on the left, a directly editable text field in the
  center, and its required type pill on the right. Moving focus outside a row
  saves its valid draft; Escape discards it. Invalid or failed saves retain the
  draft in the row, and switching rows saves a valid draft before opening the
  next one.
- Choosing Fix, Change, or Feature while the top draft contains text creates
  the entry immediately. With no text, the type remains staged in the draft;
  saved-row type changes continue to save through the inline editor.
- Each saved entry has Markdown body text and exactly one required
  classification: **Fix**, **Change**, or **Feature**. Fix identifies a
  correction to unintended behavior, Change a deliberate modification to
  existing behavior, and Feature a new capability. No unclassified entry can
  be submitted, and an existing classification can be changed but not cleared.
  No additional classifications are included.
- Entry text supports safe common Markdown formatting and lists, but not raw
  HTML, images, recipe-specific tokens, or recipe autocomplete behavior.
- The **Done** column appears first. An incomplete entry is represented by a
  checkbox; activating it opens a version dialog. A valid SemVer
  `major.minor.patch` value marks the entry complete and replaces the checkbox.
  Reject leading zeroes, a `v` prefix, prerelease identifiers, and build
  metadata. Invalid input stays in the dialog with a textual error and
  preserved value. Activating a completed version permits correction or
  reopening the entry.
- Incomplete entries sort before completed entries and keep a persistent manual
  order. New and reopened incomplete entries start at the top. A dedicated
  handle supports pointer/touch dragging and Ctrl+ArrowUp/Down keyboard moves;
  Escape and pointer cancellation discard an active drag. Completed entries
  cannot be reordered and sort by completion timestamp descending, newest
  first, independent of version text. Correcting a version preserves its
  completion timestamp; reopening clears it. Completed entries are hidden by
  default and a compact eye/eye-off control toggles their visibility. Archive
  state does not affect whether an entry appears.
- Every operation independently checks the authenticated administrator on the
  server and uses the authenticated session client to call an admin RPC. The
  RPC repeats the admin check, and RLS denies anonymous and non-admin access.
  Revision conflicts do not overwrite newer edits. Create, edit, type,
  completion, archive, and restore changes append an immutable audit event;
  actor references may become null if an account is deleted, but shared
  updates and history remain.

---
