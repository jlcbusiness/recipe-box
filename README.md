# Recipe Box

Recipe Box is a private recipe library built with Next.js and Supabase. The
current local app includes authentication, account isolation, recipe metadata,
ordered ingredient rows, and validated measurements. Product features are
delivered in the order described by the
[delivery roadmap](docs/plans/delivery-roadmap.md).

## Current product state

- Create, edit, and view recipes with state, metadata picklists, servings,
  component times, equipment, and Markdown notes.
- Add, reorder, and remove account-owned ingredient rows. Desktop uses a
  keyboard-operable table; mobile uses a focused row editor pane.
- Enter one ingredient amount category: **Unit**, **Count**, **Things**, or
  **Feel**. Unit accepts optional volume and weight pairs; the other categories
  expose only their applicable controls.
- Save ingredient amounts as positive numbers, decimals, fractions, mixed
  numbers, or ranges. Recipe detail uses conventional US-customary fractions,
  decimal metric quantities, natural Things plurals, and plural `cups` above
  one.

See the [comprehensive reference](docs/plans/comprehensive-reference.md) for
implemented behavior and later-slice direction, and the
[design philosophy](docs/plans/design-philosophy.md) for interface principles and
[visual design guide](docs/plans/visual-design.md) for verified screen contracts.
See the [keyboard guide](docs/keyboard-guide.md) for keyboard controls and
shortcuts.

## Create a hosted Recipe Box

These steps create a separate, private Recipe Box instance using GitHub,
Vercel, and Supabase. GitHub Desktop is used to publish a fresh copy of the
source files; it does not create a fork or copy the upstream commit history.
You will also need an email-sending provider for invitations and password
recovery. Vercel does not provide SMTP for Supabase Auth, but you do not need to
run your own mail server: choose a transactional email service that supports
SMTP. Check its current plan and pricing before signing up.

Docker is not needed to deploy the hosted app. It is needed only if you also
want to run the local Supabase development stack.

### 1. Copy the source into a new GitHub repository

1. Create a [GitHub account](https://docs.github.com/en/account-and-profile/how-tos/account-management/creating-an-account-on-github),
  install [GitHub Desktop](https://desktop.github.com/), and sign in to it.
2. Open the [Recipe Box source repository](https://github.com/jlcbusiness/recipe-box),
  select **Code**, then **Download ZIP**. Extract the ZIP on your computer.
3. In GitHub Desktop, select **File > New repository**. Give the repository a
  name and choose a location. Leave the option to initialize it with a README
  unchecked; the downloaded source already contains one. Create the repository
  in a different folder from the extracted ZIP.
4. Copy the *contents* of the extracted folder into the new repository folder,
  including hidden files such as `.gitignore`. Do not copy generated folders
  such as `node_modules`, `.next`, or `.vercel`, or any `.env` files.
5. In GitHub Desktop, review the files, enter a summary such as
  `Add Recipe Box source`, and select **Commit to** the current branch. Select
  **Publish repository**, keep **Keep this code private** selected, then
  publish it to your personal account.

The new repository starts with your own initial commit. It is independent of the
upstream repository: future changes there will not automatically appear in your
copy. See GitHub's [GitHub Desktop getting-started guide](https://docs.github.com/en/desktop/overview/creating-your-first-repository-using-github-desktop)
for Desktop installation and publishing details.

### 2. Create the Vercel project

1. Create a [Vercel account](https://vercel.com/signup) and connect it to
  GitHub.
2. In Vercel, select **Create New > Project**, find the new private repository,
  and select **Import**.

On the project setup screen, use these settings:

| Setting | Choose |
| ------- | ------ |
| **Vercel Team** | Choose the team that should own the deployment. For a personal instance, use your personal team. |
| **Project Name** | Use `recipe-box` or another available name. |
| **Root Directory** | Leave as `./`; the Next.js app is at the repository root. |
| **Framework and Build Settings** | Keep **Next.js** as the detected framework and leave **Build and Output Settings** at their defaults. |
| **Environment Variables** | Leave empty for now. Add the Supabase URL and keys to the Vercel **Production** environment in step 5 below. |

Select **Create Project**. If Vercel then shows **Optional Integrations**, skip
the Supabase card: do not select **Add**. This guide creates Supabase
separately in step 3. The **Deploy** button on that integrations screen is not
needed to create the Vercel project or its separate Supabase project.

To find the project's domain, use any of these paths:

- On the project **Overview**, open the `...` menu and select **Manage Domains**.
- Select **Domains** in the project's sidebar.
- Find the project on **All Projects** and use the domain shown beneath its name.

On the project's **Domains** page, confirm the domain is assigned to
**Production**. The Production origin is that domain with `https://` in front,
for example `https://your-project.vercel.app`. Use the domain for Production,
not a Preview deployment URL. You can add a custom domain later; if you do, use
the domain assigned to Production instead.

Vercel may start an initial build automatically. If it fails before the
environment variables are set, add them in step 5 and redeploy. With the GitHub
integration enabled, pushes to the Production Branch deploy to the Production
domain.

### 3. Create Supabase and apply the database migrations

Create a [Supabase account](https://supabase.com/dashboard), select **New
project**, and use these settings:

| Setting | Choose |
| ------- | ------ |
| **Organization** | Choose the organization that should own the project. For a personal setup, choose your personal organization. |
| **GitHub (optional)** | Leave unselected. This guide applies migrations from your downloaded repository with the Supabase CLI; Vercel's GitHub connection is separate. |
| **Project name** | Enter a recognizable name, such as `Recipe Box`. This display name does not need to match the project reference ID. |
| **Database password** | Select **Generate a password** and save it in a password manager. The CLI asks for it when linking the project. Do not put it in this repository. |
| **Region** | Choose one close to you and your users, while following any data-location requirements that apply to you. |
| **Enable Data API** | Leave checked. Recipe Box uses the Data API through the Supabase client. |
| **Automatically expose new tables** | Turn off. Repository migrations grant API access to the roles that need it. |
| **Enable automatic RLS** | Turn on. Migrations also define row-level security (RLS) and policies for app tables; automatic RLS protects future public tables until access is configured. |

Select **Create new project** and wait for it to finish provisioning.

In the downloaded project folder, install dependencies and sign in to the
Supabase CLI included with the project. The repository pins Supabase CLI
`2.121.0` as a development dependency, so `npm install` installs it locally;
you do not need to install the CLI globally. `npx supabase` runs this
repository's pinned version.

```bash
npm install
npx supabase --version
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

To update the CLI in your copy of the repository, run
`npm install --save-dev --save-exact supabase@latest`. This updates the exact
version in `package.json` and `package-lock.json`; check the CLI release notes
before using a newly updated CLI to apply migrations. Updating is optional; the
version installed by `npm install` is sufficient for these steps.

Replace `YOUR_PROJECT_REF` with the project's **Reference ID**. Find it in
Supabase under **Project Settings > General**, or copy the segment after
`/project/` in the dashboard URL. For example, in
`https://supabase.com/dashboard/project/abcdefghijklmnop`, the reference is
`abcdefghijklmnop`. It is an identifier, not the project name or database
password. The CLI asks for the database password when it links the project.

Preview and apply the versioned migrations:

```bash
npx supabase db push --dry-run
npx supabase db push
```

These commands create the app schema, storage buckets, and database rules from
the repository. Review the dry-run output before applying it. Do not run
`supabase db reset` against a hosted project; reset is destructive.

### 4. Configure Supabase Auth and email

1. **Set the URLs.** In the Supabase Dashboard, open
   **Authentication > URL Configuration**. Set the **Site URL** to the Vercel
   Production origin from step 2: the HTTPS domain only, with no trailing slash
   or path (for example, `https://your-project.vercel.app`). Add these exact app
   URLs to the redirect allow list, replacing the example origin:

   ```text
   https://your-project.vercel.app/auth/confirm
   https://your-project.vercel.app/auth/callback
   ```

   The app uses `/auth/confirm` for email invitations and `/auth/callback` for
   Google sign-in and password recovery. Add the custom domain's matching URLs if
   you later change domains. Keep production URLs exact; do not allow arbitrary
   redirect destinations.

2. **Make sign-up invite-only.** In **Authentication > Sign In / Providers**,
   under **User Signups**, turn off **Allow new users to sign up** and leave
   **Confirm email** on. The first setting disables public registration; the
  second requires new users to verify their email. After creating the first
  administrator in step 7, admins can still invite other users. Separately, set
   `SIGNUP_MODE=invite_only` in the Vercel Production environment (step 5) so
   Recipe Box disables its own self-sign-up path. Under
   **Authentication > Sign In / Providers > Auth Providers**, open the **Email**
   provider and set **Email OTP expiration** to `3600` seconds (one hour) or
   less. This expiry also applies to invitation, confirmation, and
   password-recovery links.

3. **Configure email delivery.** In **Authentication > Emails > SMTP Settings**,
   configure a custom SMTP provider. This separate **Emails** page controls
  delivery, not OTP expiry. Supabase's built-in sender is for development and
  only delivers to authorized team addresses under low, changeable rate limits.
  Choose a transactional email service that supports SMTP; the service
  provides the server and credentials, so you do not need to operate your own
  mail server. Follow [Supabase's SMTP setup guide](https://supabase.com/docs/guides/auth/auth-smtp),
  verify your sender domain as the service requires, and enter the SMTP host,
  port, username, password, and sender address in Supabase. These SMTP
  credentials belong in Supabase, not GitHub or Vercel.

#### Optional: enable Google sign-in

1. In the [Google Auth Platform](https://console.cloud.google.com/auth/overview),
  select or create a Google Cloud project for this app. Under **Audience**,
  choose who can use the OAuth app: **Internal** restricts sign-in to your
  Google Workspace organization; **External** allows Google accounts outside
  that organization. While an External app is in **Testing**, only accounts
  listed as test users can sign in.
2. Under **Data Access**, ensure the app requests only the identity scopes it
  needs: `openid`, `.../auth/userinfo.email`, and
  `.../auth/userinfo.profile`. The email and profile scopes are usually added
  by default; add `openid` if it is missing. Avoid adding unrelated scopes.
3. In Supabase, open **Authentication > Sign In / Providers > Auth Providers**
  and select **Google**. Copy the callback URL shown in the provider settings.
  It is the Supabase Auth URL ending in `/auth/v1/callback`.
4. In the Google Auth Platform, open **Clients** and create an OAuth client
  with application type **Web application**. Add the Vercel Production origin
  from step 2 of this guide under **Authorized JavaScript origins**; enter only
  the scheme and host, with no path. Under **Authorized redirect URIs**, paste
  the Supabase callback URL copied in step 3. Create the client, then copy its
  client ID and client secret.
5. Return to the Supabase Google provider settings. Enable Google, enter the
  client ID and client secret, and save the settings. Keep the client secret
  in Supabase; never put it in GitHub, Vercel, or a browser environment
  variable.
6. The Google redirect URI above is **not** the app's `/auth/callback` URL.
  Supabase first receives Google's response at `/auth/v1/callback`, then
  redirects the browser back to the app's `/auth/callback` URL, which must be
  present in Supabase's redirect allow list from step 4. Test sign-in with an
  account allowed by the Google Audience settings; for an External app in
  Testing, add that account as a test user first.

See Supabase's [Google sign-in guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
for current Google Auth Platform screen details.

### 5. Add Production environment variables and deploy

In the Vercel project's **Environment Variables** page, add the entries below
to the **Production** environment. This is separate from the optional Vercel
Supabase integration skipped in step 2: the app reads these variables at
runtime, and each new deployment receives the saved values. Add each row below
under its listed type. In the dialog, select **Config** and add all Config
key/value entries with **Add new variable**; repeat with **Secret** for the
Secret entries. Select **Production** under **Environments** for each group
before saving.

| Variable | Vercel type | Value |
| -------- | ----------- | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | Config | In the Supabase project linked and migrated in step 3, open **Connect** and copy the **Project URL**. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Config | In that Supabase project, copy the **Publishable key** (`sb_publishable_...`) from **Connect** or **Project Settings > API Keys**. This app's variable name is older; a legacy `anon` key also works. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | In that Supabase project, copy the **Secret key** (`sb_secret_...`) from **Project Settings > API Keys**; create one there if needed. This app's variable name is older; a legacy `service_role` key also works. This key bypasses row-level security. |
| `NEXT_PUBLIC_SITE_URL` | Config | The exact HTTPS Production origin from step 2, for example `https://your-project.vercel.app`. |
| `SIGNUP_MODE` | Config | Set this app option to `invite_only`. |
| `CRON_SECRET` | Secret | Generate a unique value locally with Node.js using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. This produces 64 hexadecimal characters (32 random bytes, 256 bits); paste the output here. |

Save the value in a password manager before saving the Vercel variable; Vercel
does not reveal a Secret value again after it is saved. Do not commit it or
share it in chat.

The Publishable key may be exposed in browser code. The Secret key and
`CRON_SECRET` must remain server-side and must never be committed or prefixed
with `NEXT_PUBLIC_`. Do not reuse Production credentials in Vercel Preview
deployments.

**After saving the variables**, open **Deployments** in the Vercel project
sidebar. Find the latest **Production** deployment, open its `⋯` menu, and
select **Redeploy**. In the confirmation dialog, choose whether to use the
existing build cache, then select **Redeploy**. This rebuilds the deployment
with the saved variables. Repeat these steps after changing Production
variables; redeploying a Preview deployment will not update Production.

### 6. Limit requests to public recipe links

In the Vercel project, open **Firewall** in the sidebar and configure a new
rule. Set it up as follows:

1. Name it **Limit public recipe link requests**
2. Add an **If** condition for **Request Path** that **starts with** `/r/`;
  do not select **Raw Path**.
3. For the **Then** action, select **Rate Limit** and use **Fixed Window**.
4. Set the **Time Window** and **Request Limit** for your expected visitors.
  The current defaults are 60 seconds and 100 requests; tune them after
  reviewing real traffic. Keep the counting key set to **IP** and the exceeded
  limit action at the default **429** response.
5. Select **Add Rule** at the top of the page to save the configured rule.
  Then select **Review Changes** and **Publish** it to Production.

This rule protects public recipe links without limiting signed-in app routes.
Rate-limit counters are tracked per region, and plan limits and pricing can
change; see Vercel's current [rate-limiting documentation](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

### 7. Create the first administrator account

Because you own this instance, create your own account in Supabase rather than
sending yourself an invitation. Complete these steps in order:

1. In the Supabase Dashboard, open **Authentication > Users** and select
  **Add user**. Choose the option to create a user, not the invite option.
2. Enter your email and a strong password. Confirm the email address in the
  form, then create the user. The database trigger creates the matching Recipe
  Box account with email/password sign-in.
3. Open the new user's details and copy the **UID**.
4. Open the Supabase **SQL Editor**. Replace `OWNER_AUTH_USER_UUID` in this
  query with the UID you copied, then run it:

   ```sql
   select public.claim_first_admin('OWNER_AUTH_USER_UUID'::uuid);
   ```

5. Confirm the query returns `true`. This function atomically assigns the first
  admin and refuses later claims. Do not update `accounts.is_admin` directly.
  If the query returns `false`, stop and check whether an admin was already
  claimed and whether you used the UID of the account you just created.
6. Sign in to the Production app with the email and password you set in
  Supabase.

### 8. Invite other people

After signing in, open **Administration** and enter the person's email address.
Choose **Email and password** or **Google**, then send the invitation. The
invitee must use the selected method to accept the email-bound invitation. An
invitation does not make the new account an administrator. Existing accounts
cannot be invited again to switch methods; ask them to sign in to their current
account instead. If Google is not configured, only send email/password
invitations.

### 9. Move your local recipes into the hosted account

1. In your local Recipe Box, open **Settings** and download a full database
  export ZIP. Keep the ZIP somewhere safe; do not put it in the source
  repository.
2. Sign in to the hosted Recipe Box as its owner and open **Settings**.
3. Import the ZIP and review the import result.

The import restores application records, preferences, and ready image files to
the signed-in account. It does not transfer Auth users, passwords, or recipe
history. The hosted owner account must be created and accepted separately
before importing. See the [portable bundle format](docs/plans/import-export-format.md)
for the archive contract.

### 10. Check the hosted setup

Before sharing the site, test invitation and password-recovery email delivery,
owner sign-in, the chosen invitation methods, a small export/import, and a
public `/r/` link above and below the Firewall limit. Use HTTPS for all hosted
checks. Also check installation, offline reading, camera upload, and touch
controls on a real phone; desktop tests do not verify those device behaviors.

Supabase Free projects may be paused after a period of inactivity, and plan
limits and pricing can change. The app's ZIP export is for account-owned app
data; it is not a Supabase project backup and does not include Auth accounts or
history. Review the current [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
and [Supabase pricing](https://supabase.com/pricing) before choosing a plan.

## Prerequisites

- Node.js 20.9 or newer and npm.
- Docker Engine or another Docker-compatible runtime, running locally.
- Git.

## Set up locally

Install the pinned project dependencies and the Chromium browser used by
Playwright:

```bash
npm install
npx playwright install chromium
```

Start the application and local Supabase services together. The local command
resets the database before starting Next.js:

```bash
npm run dev:local
```

The first run downloads the Supabase container images and may take several
minutes. The command starts the local Supabase stack, resets its database from
the versioned migrations and seed script, then starts Next.js.

Use `npm run dev` for routine starts; it applies pending migrations without
resetting the local database. `npm run dev:local` is a destructive clean reset:
it removes local database state, including local Auth users. Do not use it as a
routine restart or against a shared local stack without explicit authorization.

### Resetting and recovering local data

Before an authorized reset, download a **full database export** from Settings
and confirm the export completed. Keep the ZIP outside the local Supabase
Storage bucket and any temporary project directory. `npm run dev:local`
reapplies the versioned migrations and seed script; the local project
configuration stays in the working copy. After it starts, create a fresh local
Auth account, sign in, and import the ZIP from Settings.

The ZIP restores account-owned records, preferences, and ready image variants;
it does not restore Auth users, passwords, or change history. Recreating the
local Auth account is a separate setup step, and import maps the restored data
to that account. For destructive acceptance tests, prefer a dedicated isolated
Supabase project to avoid disturbing the active local stack. See the
[Slice 21 import brief](docs/plans/slices/21-import.md) for the import contract.

- App: <http://localhost:3000>
- Supabase API: <http://127.0.0.1:55421>
- Supabase Studio: <http://127.0.0.1:55423>
- Local email inbox (Mailpit): <http://127.0.0.1:55425>
- Local Postgres: `postgresql://postgres:postgres@127.0.0.1:55422/postgres`

Slices 1 and 2 provide an Auth-linked `accounts` table with owner-scoped
row-level security, a private `recipe-media` bucket, local email/password
registration, and admin invitations. The seed script intentionally adds no
sample recipe records; recipe and other domain schemas and fixtures belong with
their owning slices.

Slice 12 implements private publication covers and recipe photos. Originals
upload directly to Supabase Storage through short-lived signed paths; the
server normalizes JPEG, PNG, WebP, and HEIC/HEIF uploads to metadata-free WebP
derivatives. Account storage is limited to 1 GiB of processed images, each
original is limited to 20 MiB, and recipes can have up to 12 photos. A real
CC0 HEIC fixture is covered by normalization and browser upload tests; see the
[Slice 12 brief](docs/plans/slices/12-images.md) and
[fixture provenance](tests/fixtures/media/README.md). Vercel runs the
queued-object cleanup endpoint daily.
Configure a non-empty `CRON_SECRET` in the Vercel Production environment; Vercel
sends it as a Bearer token to the cron route. Do not commit the secret.

Local self-sign-up is open by default. To run the app in invite-only mode for a
manual check, set `SIGNUP_MODE=invite_only` before starting `npm run dev`.
To bootstrap a local admin, create the account first, then use Supabase Studio's
SQL editor with the account email:

```sql
update public.accounts as account
set is_admin = true
from auth.users as auth_user
where auth_user.id = account.id
 and lower(auth_user.email) = lower('owner@example.com');
```

This direct role update is for local setup only. In the app, only an existing
admin can grant admin status. Production's first admin invite is configured in
Slice 25.

Stop Next.js with `Ctrl+C`, then stop Supabase:

```bash
npm run supabase:stop
```

## Verify changes

Run the focused unit suite or the complete automated test gate:

```bash
npm run test:unit
npm test
```

`npm test` runs unit tests, Chromium end-to-end tests, RLS/storage checks, and
axe accessibility checks. Playwright starts its app server on port `3001` with
a separate `.next-e2e` build directory, so it can run alongside the
development app on port `3000`. The tests use local Auth users and Mailpit; no
hosted service is required. Source, type, and production build checks are
available separately:

```bash
npm run lint
npm run typecheck
npm run build
```

## Environment and secrets

Local development requires no hosted account or production environment file.
The local runner reads Supabase's generated keys at runtime. The
publishable/anonymous key is used by browser-facing clients; the service-role
key is passed only to trusted Next.js server code for administrative actions and
is never sent to the browser. Keep it out of source control and logs. Production
secrets belong in server-side deployment configuration, not repository files.
