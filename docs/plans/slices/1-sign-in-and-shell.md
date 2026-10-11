# Slice 1: Sign-in and shell

This brief defines the first authentication and ownership boundary. It adds a
sign-in experience and empty private application shell without introducing
recipe, publication, picklist, or other product domain tables.

## References

- [Delivery roadmap](../delivery-roadmap.md), slice 1
- [First-draft specification](../first-draft-spec.md)
- [Comprehensive reference, § 10: Authentication](../comprehensive-reference.md#10-authentication-and-account-setup)
- [Comprehensive reference, § 13: Accessibility](../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)
- [Comprehensive reference, § 16: Testability](../comprehensive-reference.md#16-testability-and-test-first-delivery)
- [Data model boundary](../data-model.md)
- [Visual design guide](../visual-design.md)
- [Decision log](../decision-log.md)

## Outcome

A person with a local account can sign in, sign out, request and complete a
password recovery, and reach an empty private shell that works on desktop and
mobile. The shell is not a recipe or library experience.

## Scope

- Add Next.js session handling for email and password sign-in, sign-out, and
  password recovery using the local Supabase stack and Mailpit.
- Create the minimal Account record linked one-to-one with the authenticated
  user's identity. Do not add recipes, publications, picklists, media assets,
  or other domain tables.
- Add row-level security proving an account can read and update only its own
  Account record.
- Create the required private storage bucket and account-owned storage-path
  policy. Prove one authenticated account cannot access another account's path
  and that anonymous access is denied.
- Build a responsive empty private shell with accessible navigation and a
  reliable sign-out action.

## Explicitly deferred

- Invites, administrators, production invite-only sign-up, and enforcement of
  one sign-in method belong to slice 2.
- Recipe schema and all other product domain records begin with their owning
  slices, starting with recipe basics in slice 4.
- Hosted authentication, OAuth, custom SMTP, and production deployment remain
  later work.

## Test fixtures

Tests provision named local Auth users directly through a test-only setup path.
This is fixture arrangement, not a user-facing registration flow. Each test
uses deterministic identities and separate account-owned records and storage
paths, then cleans them up through the local reset or the fixture teardown.

Do not use an invite, external mail delivery, a hosted Supabase project, or the
production sign-up policy to create test users. Browser tests may use Mailpit
to inspect the local password-recovery email after the fixture user exists.

## Verified implementation boundary

- Server-rendered Supabase access uses a request-scoped SSR cookie client.
  `src/proxy.ts` refreshes the session and verifies claims; protected pages call
  Supabase Auth to verify the user before rendering private content.
- Local public Supabase settings are read from `supabase status --output env`
  by the local runner and passed to Next.js at runtime. Slice 1 does not need
  the service-role key; Slice 2 passes it only to trusted server-side admin
  code, never to browser code.
- The Auth-user trigger creates the corresponding Account record. RLS permits
  only the owning authenticated identity to access it. The private
  `recipe-media` bucket requires the authenticated user's UUID as the first
  object-path segment.
- `npm run dev:local` starts Supabase, resets migrations and seed data, then
  starts the app on port `3000`. `npm test` starts a separate Playwright app on
  port `3001` with `.next-e2e`, and runs against the same local Supabase stack.
- `npm run lint`, `npm run typecheck`, and `npm run build` are the source,
  type, and production-build checks. When building alongside the existing dev
  server, use `NEXT_DIST_DIR=.next-build npm run build` to avoid sharing its
  `.next` directory.

## Test-first acceptance

Write these automated tests before the production implementation:

- An integration test creates two local Auth users and their Account records,
  then verifies each authenticated identity can read and update only its own
  record. Anonymous reads and updates are denied.
- An integration test verifies the private storage bucket rejects anonymous
  access and cross-account reads or writes outside the caller's owned path.
- A browser test signs in with a fixture account, reaches the private shell,
  signs out, and verifies the private route redirects or denies access after
  the session ends.
- A browser test requests password recovery for a fixture account, reads the
  local Mailpit message, follows the recovery flow, sets a new password, and
  signs in with it.
- Browser tests verify the desktop and mobile shell expose labelled navigation,
  visible keyboard focus, an accessible sign-out control, and no horizontal
  overflow. Axe reports no WCAG 2 A/AA violations on the sign-in, recovery,
  and private-shell screens.
- The focused database and browser tests run against the local Supabase stack;
  the aggregate `npm test`, `npm run lint`, and `npm run typecheck` commands
  remain green.

Start with the failing ownership-isolation, sign-in, recovery, and shell tests.
Implement only the minimal database, storage, session, and UI behavior needed
to satisfy them.

## Completion criteria

- The stated sign-in, sign-out, password-recovery, and empty-shell workflow is
  demonstrable entirely on the local stack.
- The minimal Account record is the only new product data model. Recipe and
  other domain tables have not been added.
- RLS and private-storage policies are verified with two authenticated accounts
  and an anonymous client, rather than by source inspection alone.
- Unit, integration, end-to-end, mobile, and automated accessibility checks
  pass locally before this slice is considered complete.
- Any implementation detail that changes this scope is recorded in the
  decision log and the comprehensive reference.