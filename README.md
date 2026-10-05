# Recipe Box

Recipe Box is a private recipe library built with Next.js and Supabase. The
current local app includes authentication, account isolation, recipe metadata,
ordered ingredient rows, and validated measurements. Product features are
delivered in the order described by the
[delivery roadmap](plans/delivery-roadmap.md).

### Current product state

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

See the [comprehensive reference](plans/comprehensive-reference.md) for
implemented behavior and later-slice direction, and the
[visual design guide](plans/visual-design.md) for the interface principles.
See the [keyboard guide](docs/keyboard-guide.md) for keyboard controls and
shortcuts.

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