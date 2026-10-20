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
| The first-admin bootstrap sends one email-bound invite only when no admin exists, sets admin status and the selected sign-in method server-side, and refuses repeat/incorrect bootstrap attempts. | `npm run test:bootstrap-admin` covers failure branches with a fake client. `npm run test:migration:public-links` runs the real command against isolated local Auth and checks pending invitation metadata, owner/admin status, and repeat refusal; it does not redeem that bootstrap email. The separate invite E2E covers email-link redemption and password setup. |
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
- On Android, use Chrome to open the production HTTPS URL, install Recipe Box
  from the browser menu, and launch it from the home-screen icon. While signed
  in and online, open a recipe; then enable airplane mode, launch the installed
  app, and confirm the offline index and that cached recipe work while an
  uncached route shows the generic offline message. Restore connectivity, sign
  out, go offline again, and confirm the cached recipe is no longer available.
- Open a recipe on Android and enable Cook mode. Wait longer than the device's
  screen timeout and confirm the screen stays awake; leave Cook mode and
  confirm the wake lock is released. Create a disposable recipe, add a photo
  using the Android camera or image picker, and confirm it finishes uploading.
- In a disposable recipe's instructions, type `#` and an ingredient query with
  the on-screen keyboard open. Tap a suggestion and confirm it inserts the
  ingredient mention without clipping or horizontal overflow.
- Physical-device checks are manual; do not infer them from desktop browser
  coverage.

## Implementation status and remaining acceptance

- Local implementation includes the first-admin bootstrap command, a
  single-method database guard, production invite-only configuration, and
  email/password and Google invitation paths. The bootstrap command has focused
  fake-client tests and is exercised against isolated local Auth by the
  public-links migration harness. That harness verifies the pending invite,
  owner/admin row, and one-time refusal; it does not redeem the bootstrap email.
  The separate invitation E2E covers email-link redemption and password setup.
- The README documents a fresh private repository populated from the
  downloaded source ZIP, uses the one-time bootstrap invitation for the first
  administrator, and continues through later invitations and local ZIP import.
- The existing Vercel production deployment is live and points to the original,
  populated Supabase project. The public recipe HTTP 500 was caused by missing
  `SELECT` grants for `service_role` on 11 public-recipe loader tables (SQLSTATE
  `42501`). Migration `20261110020000_grant_public_recipe_data_service_role.sql`
  is now applied to project `syjdaguodkwnnwssdfsw`; a direct privilege check
  returned true for all 11 tables. A clean deployment from production commit
  `0a149781d395e75e4ad828fdbc2c71f959fe68f4` replaced the temporary diagnostic
  build. The hosted public recipe smoke test now returns HTTP 200, and a
  well-formed unknown UUID returns 404. Supabase Auth self-signup remains
  disabled. On 2026-10-19, the operator confirmed invitation delivery and
  account creation with both email/password and Google sign-in. First-admin
  bootstrap and iOS device acceptance are deferred by the operator. Production
  password recovery succeeded after the operator retried the link in the same
  browser. Reusing the current password returned generic feedback; the action
  now maps Supabase's `same_password` error to a specific message, but that UI
  change has not been deployed. The optional same-email provider-conflict boundary passes
  local SQL guard tests but has not been exercised against hosted OAuth. The
  production export timestamp grant is applied; production export and ZIP
  import are operator-confirmed passes. The import fix remaps recipe-level
  picklist references to destination IDs and is deployed in
  `recipe-1tzff5d9e-jlcbusiness-projects.vercel.app`. Table-wide account updates
  and updates to `accounts.id` remain denied. Android install, wake lock, touch
  autocomplete, installed-PWA photo capture/upload, and offline reading are
  operator-confirmed. Production pgTAP was available as version 1.3.3 but not
  installed, which explained the missing `plan(integer)`. Migration
  `20261110040000_enable_pgtap_for_database_tests.sql` installs it in
  `extensions` and is applied locally and to production. The hosted and local
  pgTAP suites each pass all 5 files and 13 assertions. Hosted tests assume the
  granted `postgres` role only within their rollback-only transactions. The
  first-admin assertion now accounts for existing production administrators.
  The full unit gate passes 313 Vitest tests and 8 bootstrap tests. Slice 25
  remains incomplete until remaining
  required hosted acceptance checks are recorded; the requested deferrals and
  optional provider-conflict check are tracked separately.

## Verification record

Record dates, deployment or project identifiers, outcomes, and non-secret
evidence here. Never include passwords, tokens, private keys, or full
environment-variable values.

### Local verification

| Date | Command | Result | Evidence and limits |
| ---- | ------- | ------ | ------------------- |
| 2026-10-19 | `npm run test:migration:public-links` | Pass | Isolated local Supabase applied the migration set; provider-guard SQL tests passed 5/5 and export timestamp ACL tests passed 2/2. The real bootstrap created a pending email/password invite, set `is_admin` and `is_owner`, and refused a second claim. Production build passed. Public-link E2E/Axe passed 10/10 across Chromium and Fold 6. The harness did not redeem the bootstrap email. |
| 2026-10-19 | `npx supabase test db --local` | Pass, 13 tests | All five pgTAP files pass. Each test selects the `postgres` role only for its rollback-only transaction. |
| 2026-10-19 | `npm run test:bootstrap-admin` | Pass, 8 tests | Fake-client tests cover success, repeat/existing-account refusal, HTTPS validation, rollback, and unconfirmed cleanup. |
| 2026-10-19 | `npx playwright test tests/e2e/auth.spec.ts --project=chromium --workers=1 --timeout=60000 --grep="reset their password"` | Pass, 1 test | Local recovery email was received through the test mail server, reset link completed, and the replacement password signed in successfully. This verifies the local flow, not production SMTP delivery. |
| 2026-10-19 | Typecheck, focused Biome, Markdown lint, `git diff --check` | Pass | Focused checks for the touched bootstrap and documentation files. |
| 2026-10-19 | Media E2E, Chromium and Fold 6 (`--workers=1 --timeout=60000`); `npm run typecheck`; `npm run lint:md`; focused Biome | Pass, 7/7 tests per project | Mobile camera picker visibility and `capture="environment"` assertions pass in Fold 6; desktop visibility assertions pass in Chromium. TypeScript, Markdown lint, and Biome checks for the media component and E2E file pass. A two-worker run intermittently timed out during publication-cover setup; serial runs passed. The operator later confirmed Android photo capture/upload and offline reading. |
| 2026-10-19 | Auth E2E, Chromium (`--workers=1 --timeout=60000`) | Pass, 5/5 tests | Local recovery email/reset, sign-in, private shell, and accessibility checks pass. The shell assertions follow the current Recipe Tin redirect, Library/Search navigation, and hand-preference-aware account placement. This does not verify production SMTP delivery. |
| 2026-10-19 | Import planner/commit unit tests and Settings import E2E, Chromium and Fold 6; TypeScript and focused Biome | Pass, 38 unit tests and 6 browser tests | A synthetic database archive with a recipe verdict imports through the local RPC. The planner remaps recipe food-type, verdict, and enthusiasm IDs to destination picklist IDs. The fix was deployed in `recipe-1tzff5d9e-jlcbusiness-projects.vercel.app`, and the operator confirmed the previously failing production import succeeded after deployment. |
| 2026-10-19 | `npm run test:unit` | Pass, 313 Vitest tests and 8 bootstrap tests | The initial three failures were stale Find-column defaults that omitted the Slice 22 default-visible Visibility column. Expectations now match the product defaults; the new password-recovery regression test also passes. |
| 2026-10-19 | `npx supabase db push --linked --yes`; `npx supabase migration list --linked` | Applied to separate empty project; not production | Project ref `rqcjyszxxgwcqvqtpfrl` belongs to `delete-this`, not the deployed app. The 116 migrations were applied there by mistake during setup; do not use it for production acceptance. The original production project was not changed by this push. |
| 2026-10-19 | `npx supabase test db --linked` | Pass, 13 tests | All five hosted pgTAP files pass. The CLI's temporary `cli_login_postgres` role lacks schema `USAGE`; each test uses transaction-local `SET ROLE postgres`, and rolls back. The first-admin assertion supports both fresh and already-provisioned databases. |
| 2026-10-19 | Production pgTAP migration and catalog check | Applied and verified | Migration `20261110040000_enable_pgtap_for_database_tests.sql` installed pgTAP 1.3.3 in `extensions` on `recipe-box-db`. The hosted suite passes; no persistent role grant was needed. |

### Hosted and device acceptance

| Check | Status | Record when complete |
| ----- | ------ | -------------------- |
| Vercel project configuration and deployment | Deployment Ready; backend signup verified closed; public route and manifest smoke tests pass | Project `recipe-box`, alias `https://recipe-box-gray-chi.vercel.app`; latest production deployment `recipe-1tzff5d9e-jlcbusiness-projects.vercel.app` (`dpl_6GrBpDm4TpcA3FvnrKks1VBv6nwi`) is Ready and aliased to the production domain. Authenticated `vercel curl` to `/manifest.webmanifest` returned the expected app metadata. The earlier clean production deployment `recipe-1vvrwsgd8-jlcbusiness-projects.vercel.app` from commit `0a149781d395e75e4ad828fdbc2c71f959fe68f4` removed temporary diagnostic logging. `SIGNUP_MODE=invite_only`; configured site URL host matches the deployment. Supabase Auth settings returned HTTP 200 and `disable_signup=true` after the operator's change. A public recipe returning 200 confirms the service-role configuration works for the loader. An unauthenticated cleanup-route request returned 401, confirming it rejected the request before cleanup; a valid scheduled invocation remains unverified. The cleanup cron runs at 04:00 UTC daily. A read-only production count found no stale pending uploads, queued media deletions, or due export deletions; the cron was not manually triggered. `/` and `/sign-up` returned 200; `/auth/callback`, `/settings`, and `/app` returned 307. |
| Supabase production migration acceptance | Public-recipe, export timestamp, and pgTAP migrations applied | Production points to project ref `syjdaguodkwnnwssdfsw` (`recipe-box-db`). Migrations `20261110020000_grant_public_recipe_data_service_role.sql`, `20261110030000_grant_export_timestamp_service_role.sql`, and `20261110040000_enable_pgtap_for_database_tests.sql` are recorded in the remote ledger. The 11 public-recipe table grants and export timestamp column privilege are verified; table-wide account updates and updates to `accounts.id` remain denied. pgTAP 1.3.3 is installed in `extensions`, and all five hosted test files pass. |
| Admin invitation delivery and account creation by email/password and Google | Operator-confirmed pass, 2026-10-19; first-admin bootstrap deferred | Invitations were received and accounts were created with both sign-in methods. First-admin bootstrap is deferred by the operator. Production password recovery succeeded after retrying the link in the same browser. The same-password feedback improvement is implemented locally and awaits deployment verification. |
| Google same-email provider-conflict boundary | Optional; local database guard passes | Local pgTAP tests accept a matching Google identity for a Google account and reject linking it to an email/password account. The hosted OAuth boundary has not been exercised. |
| Production database export and import | Export and import operator-confirmed pass, 2026-10-19 | Vercel recorded a POST to `/api/exports` with status 503 and no runtime log entry before the fix. Read-only production checks found the snapshot RPC, private `recipe-exports` bucket, and cleanup queue permissions present, but `service_role` could not update `accounts.last_database_export_at`. The narrow column grant is applied and verified in production; the operator confirms export works. The operator's import initially failed with SQLSTATE `23503` on `recipes_account_id_verdict_category_verdict_id_fkey`. The planner now remaps recipe-level food type, verdict, and enthusiasm references to newly allocated destination picklist IDs; unit and local database-backed import tests pass. The fix is deployed in `recipe-1tzff5d9e-jlcbusiness-projects.vercel.app` (`dpl_6GrBpDm4TpcA3FvnrKks1VBv6nwi`), Ready and aliased to production; the operator confirms the production retry succeeded. |
| Vercel `/r/*` rate limit and public routes | Rate rule active; post-fix route and threshold checks pass | Active rule matches `/r/` and applies a 100-request per-IP, 60-second fixed window. Before the database grant fix, a 101-request check returned 500 for the first 100 requests and 429 for the 101st; `/settings` and `/app` were not rate-limited (307 to sign-in), and `/sign-up` returned 200. After the fix and clean redeploy, an active public recipe returned 200 and a well-formed unknown UUID returned 404. A 101-request post-fix burst to a malformed `/r/*` path returned 100 404 responses and one 429 in about two seconds; malformed IDs return before database access. |
| Production ZIP import | Operator-confirmed pass, 2026-10-19 | The previously failing archive imported successfully after deployment of the picklist-ID remapping fix. No private archive or recipe data is recorded here. |
| Android HTTPS install/offline, wake lock, camera, and touch autocomplete | Operator-confirmed pass, 2026-10-19 | Install, wake lock, touch autocomplete, installed-PWA photo capture/upload, and offline reading work. Offline Google sign-in failed as expected. Device model and Android/Chrome versions were not recorded. |
| iOS HTTPS install/offline, wake lock, camera, and touch autocomplete | Deferred by operator | Not part of the current acceptance run. |

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
