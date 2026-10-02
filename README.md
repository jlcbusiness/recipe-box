# Recipe Box

Recipe Box is a private recipe library built with Next.js and Supabase. The
first slices provide a reproducible local app, authentication, account
isolation, and test environment; product features are delivered in the order
described by the [delivery roadmap](plans/delivery-roadmap.md).

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
- Local email inbox (Mailpit): <http://127.0.0.1:55424>
- Local Postgres: `postgresql://postgres:postgres@127.0.0.1:55422/postgres`

Slice 1 creates the minimal Auth-linked `accounts` table and private
`recipe-media` bucket with owner-scoped row-level security. The seed script
intentionally adds no sample recipe records; recipe and other domain schemas
and fixtures belong with their owning slices.

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

`npm test` runs unit tests, Chromium end-to-end tests, and axe accessibility
checks. Playwright starts its app server on port `3001` with a separate
`.next-e2e` build directory, so it can run alongside the development app on
port `3000`. The tests use local Auth users and Mailpit; no hosted service is
required. Source, type, and production build checks are available separately:

```bash
npm run lint
npm run typecheck
npm run build
```

## Environment and secrets

This slice requires no hosted account, production environment file, or secret.
Keep local environment files out of version control. Never commit Supabase
service-role/secret keys; only use a publishable/anonymous key in browser code.