# Recipe Box

Recipe Box is a private recipe library built with Next.js and Supabase. The
first development slice provides a reproducible local app, database, and test
environment; product features are delivered in the order described by the
[delivery roadmap](plans/delivery-roadmap.md).

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

Start the application and local Supabase services together:

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

The baseline has no product tables yet, so its seed script intentionally adds
no sample recipe records. Domain migrations and realistic seed fixtures belong
with the slices that define those entities.

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
checks. Playwright starts and stops the Next.js test server automatically.
Source and type checks are available separately:

```bash
npm run lint
npm run typecheck
```

## Environment and secrets

This slice requires no hosted account, production environment file, or secret.
Keep local environment files out of version control. Never commit Supabase
service-role/secret keys; only use a publishable/anonymous key in browser code.