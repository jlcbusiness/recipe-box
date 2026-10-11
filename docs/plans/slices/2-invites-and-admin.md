# Slice 2: Open sign-up, invites, and admin

This brief adds the local self-sign-up flow and the first trusted administrative
operations. Supabase Auth remains the source of truth for user and invitation
lifecycle; no parallel invitation-token table is introduced.

## References

- [Delivery roadmap](../delivery-roadmap.md), slice 2
- [First-draft specification](../first-draft-spec.md), Sharing and Authentication
- [Comprehensive reference, § 10: Authentication](../comprehensive-reference.md#10-authentication-and-account-setup)
- [Comprehensive reference, § 13: Accessibility](../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)
- [Comprehensive reference, § 16: Testability](../comprehensive-reference.md#16-testability-and-test-first-delivery)
- [Data model boundary](../data-model.md)
- [Visual design guide](../visual-design.md)
- [Decision log](../decision-log.md)
- [Slice 1 brief](1-sign-in-and-shell.md)
- [Supabase invite users](https://supabase.com/docs/guides/auth/users#inviting-users)
- [Supabase Auth Admin inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
- [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)

## Outcome

In the local open-sign-up mode, a person can create an email/password account
without email verification and enter the private shell. An existing admin can
send a bound invitation, see it arrive in Mailpit, and grant admin status to an
existing account. The invitee confirms the invitation, chooses a password, and
can then sign in. Non-admin users cannot send invitations or alter admin status.

## Scope

- Add an environment-controlled sign-up mode. Local development uses `open`;
  `invite_only` hides public registration and rejects direct sign-up actions.
- Add an accessible sign-up screen and server action using Supabase
  `signUp`. A local sign-up creates an Account record through the existing Auth
  trigger and starts a session without verification mail.
- Add `is_admin` and immutable `sign_in_method` account attributes. New local
  accounts and email invitations use `email_password`; `is_admin` defaults to
  false. Authenticated users cannot update either attribute through PostgREST.
- Add an admin-only page to send an invitation and grant admin status to an
  existing account. The admin page and every server action must independently
  verify the current user and read their Account role before privileged work.
- Use `auth.admin.inviteUserByEmail` through a server-only Supabase client. The
  local runner may pass the CLI's secret key to the Next.js server as
  `SUPABASE_SERVICE_ROLE_KEY`; it must never be prefixed `NEXT_PUBLIC_`, sent to
  the browser, logged, or committed. Production gets the equivalent secret
  from server-side deployment configuration in Slice 25.
- Customize the Supabase invite email to link to a server confirmation route
  that calls `verifyOtp` with `type: invite` and the email token hash. After
  verification, require the invitee to set a password before entering `/app`.
- Keep Supabase Auth responsible for invitation email binding, expiry, and
  single use. Local `auth.email.otp_expiry = 3600` sets the verified one-hour
  validity window. Tests cover successful use and replay rejection; they do not
  wait an hour to test provider-managed expiry.
- Keep Supabase's configured authentication rate limits. No custom rate-limit
  system or hosted provider is added in this slice.

## Explicitly deferred

- Google OAuth and Google invitation acceptance remain part of Slice 25. Slice
  2 stores the account's chosen method as `email_password` and exposes no
  identity-linking action. Before Google is enabled, Slice 25 must test and
  enforce the one-provider rule against Supabase's same-email identity linking.
- The configured first production admin invite, hosted SMTP, and production
  Supabase/Vercel configuration belong to Slice 25.
- Household collaboration, additional roles, account deletion, and invite
  revocation UI are out of scope.

## Security boundaries

- Account owners may read their own Account row, but authenticated PostgREST
  clients receive no update privilege for `is_admin` or `sign_in_method`. Keep
  only the minimal update privilege needed by Slice 1's owner-isolation test.
- The admin server client is created in a `server-only` module. No client
  component imports it. Admin actions first validate the session with the
  request-scoped SSR client, then authorize against `accounts.is_admin`, and
  only then use the secret-key client.
- A registration request cannot set or overwrite `is_admin`, `sign_in_method`,
  `app_metadata`, or user IDs. Treat all submitted form data as untrusted.
- Invitation acceptance verifies the provider-issued token hash and exact
  `invite` type. The target user email comes from the verified Auth user, never
  from a query parameter or user-editable metadata.
- An invitation cannot promote its recipient. Only a separately authenticated
  existing admin may grant the admin flag.

## Test fixtures

- Create ordinary test users through the local Auth API with unique generated
  emails, as in Slice 1.
- Create an admin fixture using the local CLI secret key in the test process,
  then promote only that fixture account through the trusted test setup. Never
  print the secret key or pass it to the browser.
- Read invitation messages from the local Mailpit API by recipient. Follow the
  exact link generated for that fixture; do not construct a token hash or use a
  hosted Supabase project.
- Delete fixture users in teardown and verify cleanup errors instead of
  silently retaining accounts.

## Verified implementation

- The local runner defaults `SIGNUP_MODE` to `open`; setting it to
  `invite_only` hides self-registration and makes the server action reject
  sign-up. Playwright's test server explicitly uses open mode.
- Migration `20261003000000_add_account_admin_and_signin_method.sql` adds the
  server-managed fields and narrows authenticated update grants so ordinary
  users cannot change either field.
- `/admin` checks the signed-in user and their RLS-scoped Account row before
  using the service-role client. It lists accounts, sends email invitations,
  and grants admin status to existing accounts.
- Supabase's local invite template is
  `supabase/templates/invite.html`; it links to `/auth/confirm` with the invite
  token hash. Successful confirmation leads to `/complete-invite`, where the
  invitee chooses a password. The pending-invitation marker is stored in
  server-managed Auth app metadata.
- The runner supplies `SUPABASE_SERVICE_ROLE_KEY` only to the Next.js server.
  Browser code receives only the public API URL and anon key. Tests use the
  local secret for fixture setup and cleanup without printing it.
- Mailpit runs at `http://127.0.0.1:55425`. The local invite and recovery email
  links expire after the configured 3,600-second Auth OTP lifetime.
- The account table remains a semantic table inside a keyboard-scrollable
  region on narrow screens. The administration screen provides direct sign-out.

## Test-first acceptance

Write these automated tests before the implementation:

- A unit test proves only the `open` mode permits self-sign-up and the
  `invite_only` mode rejects direct sign-up attempts as well as hiding the
  public registration link.
- A browser test signs up with a new local email/password, reaches `/app`, and
  verifies the associated Account has `is_admin = false` and
  `sign_in_method = email_password`.
- An integration test proves an ordinary user cannot set `is_admin` or
  `sign_in_method` through PostgREST, even on their own row.
- A browser test proves an unauthenticated user and a non-admin cannot open the
  admin page, send an invite, or grant admin status.
- An admin browser test sends an invitation; the test finds the matching local
  Mailpit message, follows its token-hash link, sets a password, signs in, and
  verifies the new account is not an admin.
- An integration or browser test replays the consumed invite token and verifies
  it cannot create another session. A test verifies the confirmed Auth email
  exactly matches the invitation recipient.
- An admin can grant admin status to an existing non-admin account; the target
  can then enter the admin page. A non-admin cannot promote themselves or
  another user. A user cannot change their sign-in method.
- Axe scans sign-up, invite acceptance, and admin screens. Desktop and mobile
  tests verify labels, keyboard focus, touch targets, and no horizontal
  overflow.
- `npm test`, `npm run lint`, and `npm run typecheck` pass against the local
  Supabase stack and Mailpit. The production build remains successful without
  hosted credentials.

## Local commands

- `npm run dev:local` starts local Supabase, resets migrations and seed data,
  and starts the app. Resetting deletes local Auth users; do not use it when
  preserving a manually-created account.
- `npm test` runs unit, end-to-end, RLS, Mailpit, and accessibility suites. Test
  users are generated and removed automatically.
- `npm run lint` and `npm run typecheck` validate code and types.
- `NEXT_DIST_DIR=.next-build npm run build` verifies the production build
  without sharing the running development server's Next.js output directory.

## Completion criteria

- Open local sign-up and the email/password invite-to-password-to-login flow
  are demonstrated and automated.
- Only an authenticated admin can send invitations or grant the admin flag.
- Account RLS and column privileges prevent self-promotion and sign-in-method
  changes; service-role operations stay server-only.
- Invitation acceptance is email-bound, single-use, and uses the configured
  Auth expiry. Local invite delivery and recovery remain inspectable in
  Mailpit.
- Unit, integration, end-to-end, mobile, and automated accessibility checks
  pass locally, with no hosted credentials or production SMTP dependency.
