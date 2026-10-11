# Slice 0: Local Engineering Baseline

This brief defines the first implementation slice. It establishes a repeatable
local Next.js and Supabase workflow and automated test commands before any
recipe features are built.

## References

- [Delivery roadmap](../delivery-roadmap.md), slice 0
- [First-draft specification](../first-draft-spec.md)
- [Comprehensive reference, § 14: Technology stack](../comprehensive-reference.md#14-technology-stack-and-hosting-architecture)
- [Comprehensive reference, § 16: Testability](../comprehensive-reference.md#16-testability-and-test-first-delivery)
- [Data model boundary](../data-model.md)
- [Visual design guide](../visual-design.md)
- [Decision log](../decision-log.md)

## Outcome

From a clean checkout, a developer can install dependencies, start the
Next.js app with the local Supabase stack, inspect local authentication email,
and run unit, end-to-end, and accessibility tests without a hosted account or
production secrets.

## Scope

- Create the Next.js App Router application and its minimal accessible local
  workspace screen.
- Configure local Supabase CLI use, database migration and seed entry points,
  and the local Mailpit email inbox.
- Provide one command to start the app and local Supabase services, and one
  command to run unit, end-to-end, and accessibility tests.
- Decide the accessible component foundation and spreadsheet-style grid
  approach before feature slices begin.
- Document prerequisites, setup, commands, local service URLs, and safe
  environment-variable handling in the README.

Authentication flows, recipe/publication schema, product sample records,
production deployment, and recipe UI are out of scope. Keep migration and seed
directories ready for later slices; do not invent a temporary product schema
just to manufacture seed records before the data model exists.

## Test-first acceptance

Write these automated tests before the screen or other production application
code:

- A unit test renders the synchronous home page and verifies its primary
  heading and local empty-workspace state.
- An end-to-end test opens `/` in Chromium and verifies the page responds and
  exposes the expected heading and main landmark.
- An accessibility test scans `/` with axe and reports no WCAG 2 A/AA
  violations.
- The aggregate test command runs unit, end-to-end, and accessibility suites
  and returns a failing exit code if any suite fails.
- The local start command starts Next.js and Supabase; Supabase reset applies
  migrations and the seed script. No remote project or credential is required.

Start with the failing page tests, implement the minimal screen, and then
complete the test and service wiring. The page remains intentionally small;
sign-in and the actual application shell belong to slice 1.

## UI foundation decision

Use native semantic HTML for ordinary structures and controls. Add React Aria
Components only when a custom interaction benefits from managed keyboard and
assistive-technology behavior.

Slice 5 uses a semantic, text-first ingredient table with a persistent trailing
blank row. Main checkboxes and compact drag handles sit in an outside rail;
`Ctrl+ArrowUp` and `Ctrl+ArrowDown` reorder rows. Mobile uses a one-column list
with a compact row editor popover. Slice 5 tests cell editing, pointer and
keyboard reordering, mobile behavior, screen-reader semantics, and axe
accessibility. Read-only lists remain semantic HTML.

## Local commands

- `npm install` installs pinned project dependencies.
- `npm run dev:local` starts the local Supabase stack, resets its database, and
  starts Next.js.
- `npm test` runs all three automated test suites.
- `npm run lint` and `npm run typecheck` validate source and types.
- `npx playwright install chromium` installs the browser used by end-to-end
  and accessibility tests.
- `npx supabase stop` stops local Supabase services after development.

## Completion criteria

- Setup succeeds from the documented prerequisites on a clean local checkout.
- The app is available at `http://localhost:3000` and the local Supabase stack
  starts without hosted credentials. Supabase uses the `55420–55429` port
  range to coexist with other local stacks.
- The local Supabase reset command successfully applies the migration set and
  seed script; no domain tables or sample recipe records are introduced in this
  slice.
- Unit, end-to-end, and axe accessibility tests pass through `npm test`.
- Lint and TypeScript checks pass, and no production secret is committed.
- The accessible controls and ingredient-grid approach is recorded in this
  brief, the comprehensive reference, and the decision log.