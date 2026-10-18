# Slice 25: Go online

## References

- [Delivery roadmap](../delivery-roadmap.md), slice 25, Mandatory Slice Preparation, Standing Rules, and Completion Rule
- [First-draft specification](../first-draft-spec.md), Sharing and Authentication and Import, Export, Lifecycle, and History
- [Comprehensive reference](../comprehensive-reference.md), §§ 9, 10, 11, 13, 14, and 16
- [Data model](../data-model.md), Ownership and Configuration Boundaries
- [Design philosophy](../design-philosophy.md), Security, user agency, and device capabilities
- [Visual design guide](../visual-design.md), Accessibility and Interaction and Install and Offline
- [Decision log](../decision-log.md), production sign-up, account methods, and Slice 24 offline data
- [Slice 2: Invites and admin](2-invites-and-admin.md)
- [Slice 20: Export](20-export.md)
- [Slice 21A: Database import](21-import.md)
- [Slice 24: Install and offline](24-install-and-offline.md)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase Auth with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)
- [Supabase Auth redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase local development and migrations](https://supabase.com/docs/guides/local-development/cli-workflows)
- [GitHub account setup](https://docs.github.com/en/get-started/start-your-journey/creating-an-account-on-github)
- [GitHub repository setup](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
- [Vercel Git deployment](https://vercel.com/docs/deployments/git)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel domains](https://vercel.com/docs/domains)
- [Google OAuth web credentials](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred)
- [GitHub Desktop getting started](https://docs.github.com/en/desktop/overview/getting-started-with-github-desktop)

## Outcome

A person who can follow copyable steps can put a personal Recipe Box instance
online from the source, with a production Supabase project, Vercel deployment,
custom email delivery, invite-only access, Google as an optional single sign-in
method, an initial owner-admin account, and a verified import of their local
account data. The README is the end-user runbook and explains the first admin
and how that admin adds later accounts. No production secret is committed.

## Scope

- Document how to download the source ZIP, create a fresh private GitHub
  repository with GitHub Desktop, connect it to Vercel, and deploy the Next.js
  application. Do not use a fork, clone, or import workflow as the primary
  setup path; the new repository must not inherit upstream Git history.
- Create a production Supabase project, apply the repository migrations, set
  Auth redirect URLs and a custom SMTP provider, and connect Google OAuth.
- Set production environment variables, close self-sign-up in both Recipe Box
  and Supabase, and apply a Vercel Firewall rate-limit rule to `/r/*`.
- Provide a safe one-time bootstrap for the owner's first admin invitation;
  preserve Slice 2's admin-only invitations for all subsequent users.
- Let an administrator choose one sign-in method for each invitation. Support
  both the existing email/password completion and Google invitation acceptance.
  Prevent direct self-registration and mixed-provider identities at the Auth
  boundary, including Supabase's automatic same-email linking behavior.
- Export locally and import the ZIP into the production account. Explain that
  Auth users, passwords, and history are not in the archive and that import
  does not replace the owner invitation step.
- Verify production security configuration, hosted email delivery, Google
  sign-in, admin invitations, public-link rate limiting, and the slice 24
  HTTPS-only install/offline capabilities.

### Exclusions

- Automated CI or migration deployment on each Git push; provide a safe,
  repeatable manual migration command for this single-owner setup.
- Multiple environments, a required custom domain, household collaboration,
  or any change to the app's private-storage and public recipe allow-list.
- Claiming local automated tests prove a third-party provider, live email
  delivery, Vercel production deployment, or physical-device behavior.

### Dependencies

Slices 0 through 24, including the current Supabase migration history, Auth
account isolation, invitation flow, export/import format, public recipe routes,
and offline service worker.

## Boundaries and state

- Database migrations remain the source of truth. Apply every migration to a
  new hosted project with the Supabase CLI; do not create application tables
  by hand in Studio.
- Browser configuration is limited to `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The app retains the legacy variable names:
  a current Supabase Publishable key may be used for `ANON_KEY`, and a current
  Secret key may be used for `SERVICE_ROLE_KEY`. The latter and `CRON_SECRET`
  are server-only Vercel secrets. `SIGNUP_MODE=invite_only` and
  `NEXT_PUBLIC_SITE_URL` are production configuration values. SMTP and Google
  client secrets belong in the Supabase Auth dashboard, not GitHub or browser
  environment variables.
- The public `/r/*` route remains an allow-listed, no-store projection. Apply
  rate limiting at Vercel's edge without changing recipe visibility or exposing
  private storage.
- The first admin is invited only to the owner email chosen during setup; no
  period of open production sign-up is permitted. Later accounts are created
  only by an existing admin through the in-app invitation flow.
- Supabase Auth owns invitation tokens, verification, and expiry. Account
  `is_admin` and `sign_in_method` remain server-managed. Each accepted invite
  has exactly one method: `email_password` or `google`.
- A provider mismatch must be rejected before the new Auth identity can be
  linked to or used to sign into an existing account. App callback checks alone
  are insufficient because Supabase automatically links matching email
  identities.
- Vercel deployment environment variables do not update already-created
  deployments; redeploy after setting or changing them. Preview environments
  must not accidentally use production credentials.
- Free-plan pausing, storage quotas, backup limitations, and service billing
  may change. The README links to current plan pages and labels plan-specific
  behavior as something to verify before selecting a tier.

## User flow

1. Download and extract the source ZIP. In GitHub Desktop, create a new local
  repository, copy the source files into it, commit them, and publish the new
  repository privately. Do not fork or clone the upstream repository; the
  fresh repository has its own history and no automatic upstream updates.
2. Create a Vercel account, connect GitHub, import the repository, and record
   the production URL. Configure production environment variables as secrets
   where appropriate; deploy only after the database and Auth settings exist.
3. Create a Supabase production project. Install/use the repository's pinned
   Supabase CLI, authenticate, link the project reference, and apply migrations
   with `npx supabase db push`. Do not run `db reset` against the hosted project.
4. Configure the production Auth Site URL and exact app callback/confirmation
  redirect allow-list. Configure email confirmations, disable email self-signup,
  set the one-hour invite expiry, and configure custom SMTP. Google is optional;
  if enabled, add only the required Google OpenID/profile/email scopes and the
  exact Supabase callback URI in Google Cloud.
5. Add the Vercel environment variables, deploy, and verify that sign-up is
   closed before sending the first invitation. Use a one-time owner bootstrap
   operation that sends a normal Auth invitation and marks only that invited
   account as admin. The owner accepts by the chosen email/password method.
6. The owner-admin signs in, invites each later person by email, and selects
   email/password or Google. Invitees accept the email-bound invitation using
   that one method. Existing accounts cannot be switched or linked to another
   method by invitation or direct Auth requests.
7. In the local app, create and download a full database export. In the
   production app, the owner signs in and imports that ZIP from Settings.
   Create a new production Auth account; do not expect the ZIP to transfer
   credentials or change history.
8. Verify recovery email, invitation delivery, Google sign-in, private/public
   boundaries, and `/r/*` rate limiting. On Android and iOS, check install and
   offline behavior, camera upload, wake lock, and instruction ingredient
   autocomplete with the on-screen keyboard and touch selection.

## User experience and accessibility

No new general-purpose screen is introduced except sign-in method choice during
admin invitation and invitation completion. Keep invitation controls within the
existing semantic form and admin table patterns. The method selector has a
visible label, is keyboard-operable with visible focus, and retains its selected
value when validation or email delivery fails. A failed invitation leaves the
account unchanged and reports a recoverable error. Google failures return to a
clear sign-in or invitation state without a partial login. Do not expose a
second provider or imply that an existing account can be converted.

The owner bootstrap is an operational one-time command, not a public route or
open-signup window. Its output may confirm success and show the destination
email, but must never print Auth tokens, SMTP credentials, or service keys.

## Acceptance criteria and automated evidence

| Acceptance criterion | Automated evidence |
| -------------------- | ------------------ |
| Production-default signup is closed in the UI and the server action; direct Auth signup cannot create a new user in production configuration. | Unit tests for mode defaults and server action; local Supabase Auth integration with production flags. |
| The first-admin bootstrap sends one email-bound invite only when no admin exists, sets admin status and the selected sign-in method server-side, and refuses repeat/incorrect bootstrap attempts. | Focused script tests with a fake Supabase client or injectable admin boundary; isolated local Auth acceptance for invite, metadata, and account row. |
| Only an admin can invite; the invitation form offers exactly email/password or Google; successful acceptance sets one immutable method and no privilege. | Focused server-action tests and Chromium/Fold 6 admin/invite browser tests, including keyboard use and Axe. |
| A Google invitation can be accepted without creating a password identity; an email/password invitation uses the existing password completion flow. | Local controlled Auth integration/browser tests; provider OAuth exchange itself is a documented hosted manual check. |
| Automatic same-email Google/email identity linking cannot combine providers on an existing account; an explicitly invited matching provider can be completed. | Database migration acceptance inserts representative Auth identities and asserts matching method/pending-invite behavior and mismatch rejection. |
| A fresh hosted project can apply all migrations from the repository without an interactive schema edit; local `db reset` and existing migration tests remain passing. | Reset an isolated local project, run all focused migration suites, and validate `supabase db push --dry-run` where supported. Never reset hosted data. |
| README gives novice-oriented, ordered setup instructions from a source-only ZIP through a fresh private repository, deployment, first admin, later invitations, and local-to-production import; each service setup step links to official documentation. | Markdown lint, link-target review, command review against current official docs, and a manual checklist walkthrough. |
| Vercel production receives only the documented app variables; secrets are not committed or included in client bundles. | Build/static secret scan, environment-variable review, and deployment configuration inspection. |
| SMTP invitation and recovery mail, Google login, admin invitation, and production ZIP import work on the hosted URL. | Manual production acceptance with disposable test accounts and data; no hosted credentials are required by local automated tests. |
| Public recipe routes receive the configured `/r/*` rate-limit rule without breaking private app routes. | Focused Vercel Firewall rule review plus hosted HTTP smoke test at and above the configured threshold. |
| Install/offline, wake lock, camera upload, and touch autocomplete work over production HTTPS on a real phone. | Manual Android and iOS checks; record browser/device and outcome. |

## Manual verification and recovery

- Use a newly created, isolated production project with no existing user data.
  Never reset a live/shared database for acceptance.
- Keep a completed full ZIP export outside the app before any deliberate import
  replacement or destructive test. The bundle excludes Auth identities and
  history.
- Do not enable public access until the production invite policy, SMTP, owner
  admin, row-level security, storage privacy, and `/r/*` rate limit are checked.
- Test an invitation to a mailbox the operator controls, then test a separate
  Google-only invite. Re-test the blocked cross-provider attempt against an
  already accepted account.
- Physical-device checks are manual; do not infer them from desktop browser
  coverage.

## Implementation status and remaining acceptance

- Local implementation includes the first-admin bootstrap command, a
  single-method database guard, production invite-only configuration, and
  email/password and Google invitation paths. Migration and controlled local
  Auth/browser tests cover the provider boundary and invitation workflows.
- The README now documents a fresh private repository populated from the
  downloaded source ZIP, then the hosted setup through account invitations and
  local ZIP import.
- Hosted Supabase migrations, live SMTP delivery, Google OAuth credentials,
  Vercel deployment and Firewall behavior, production import, and real-phone
  checks have not been performed. Slice 25 remains incomplete until those
  manual acceptance checks are recorded against an isolated hosted project.

## Resolved setup decisions

- Source acquisition uses GitHub's source ZIP, extracted locally. GitHub
  Desktop creates a separate new local repository; the source files are copied
  into it and published privately. The upstream history and remote are not
  copied, and future upstream changes are not automatic.
- The first production owner uses email/password so bootstrap does not depend
  on Google being configured. A custom domain remains optional; start with the
  assigned Vercel HTTPS origin and use exact redirect URLs.
- Supabase Auth identity triggers and callback checks are implemented and
  locally tested for the installed Auth stack. Hosted OAuth exchange and
  provider settings still require manual acceptance; callback checks alone are
  not the provider boundary.
- Service plan limits, inactivity pausing, and rate-limit pricing are described
  without fixed promises; readers should check the providers' current terms.
