# Purpose: Make Admin Updates entries programmatically available to Copilot

## Progress History

- 2026-11-19: Started feasibility and slice preparation for programmatic
  Copilot access to Admin Updates. The existing Updates controls use
  administrator-authenticated server actions; the retrieval path and best
  access method still need verification.
- 2026-11-19: Confirmed `app_updates` has RLS that limits reads to authenticated
  admins, and the Settings page queries it through the signed-in Supabase
  client. A JSON route can preserve that boundary, but Copilot still needs a
  supported way to authenticate and call it; that changes the slice scope.
- 2026-11-19: The user confirmed the API-key direction. Official VS Code docs
  support remote HTTP MCP servers with environment-variable-backed headers;
  they do not support prompting for a secret or reading it from SecretStorage
  in the Copilot harness. Drafted DLC 41 as one read-only MCP tool and marked
  the global, non-user-bound key lifecycle for review.
- 2026-11-19: Final `git diff --check` passed. The repository Markdown lint
  still reports 35 diagnostics, all on existing content; it reports none in
  DLC 41 or the new workstream files. Production implementation remains
  gated on review of the shared-key lifecycle.
- 2026-11-19: The user rejected the Copilot-specific MCP approach and clarified
  that the goal is a generic REST API callable by a person or script from the
  command line with API-key authentication. Revising the brief and planning
  references to make REST the primary outcome; MCP is out of scope.
- 2026-11-19: Replaced the MCP brief with a generic read-only REST contract at
  `GET /api/admin/updates`, updated planning references, and verified the new
  draft. The Markdown linter reports only the same 35 existing diagnostics;
  none are in the revised brief or updated workstream files.
- 2026-11-19: The user requested concrete key setup/acquisition instructions.
  Verified that Vercel stores Secret environment variables (encrypted and
  write-only after saving) and applies changes only to new deployments.
  Supabase's project Secret key is elevated and bypasses RLS, so the draft now
  recommends generating a separate app key and storing it in Vercel.
- 2026-11-19: Added key generation, Vercel setup, caller/local environment, and
  rotation steps to DLC 41. Revalidation found no new Markdown diagnostics;
  the same 35 existing repository diagnostics remain.
- 2026-11-19: The user approved the shared environment-managed API key model
  and asked to include Vercel setup/acquisition instructions. Proceeding to
  implementation after the required Next.js and test-pattern checks.
- 2026-11-19: Added and ran focused route tests. The configured Vitest filter
  only discovers `.test.tsx`, so the test file uses that extension; before
  implementation the suite then failed because the route did not exist, as
  expected. Implemented the bearer-authenticated, read-only route with an
  explicit response allow-list and the shared ordering helper. All six focused
  tests pass; `npm run typecheck` and targeted Biome checks pass. No local
  Supabase reset or hosted database access was performed.
- 2026-11-19: Final `git diff --check` passed. `npm run lint:md` checked 166
  files and reported 35 diagnostics on existing content; none are in DLC 41,
  the roadmap, or this workstream.
- 2026-11-19: Added a user-facing API setup and usage guide, linked it from
  the README's hosted deployment instructions, and added it to the DLC 41
  references. Markdown lint reported the same 35 existing diagnostics across
  167 files; it reported none in the new guide or modified docs.
- 2026-11-19: Clarified Copilot key delivery: the Vercel Secret does not reach
  Copilot automatically. Documented that Copilot's terminal execution
  environment needs its own key copy and that direct MCP access would require
  a separate adapter because this endpoint is plain REST.
- 2026-11-19: Added a concrete local VS Code setup: enter the key with shell
  echo disabled before launching VS Code, then use Copilot sandbox credential
  masking to inject it only into HTTPS requests to the Recipe Box host.

## Save Point

- Goal: make Admin Updates entries programmatically available through a
  read-only REST endpoint.
- Status: implementation complete; local CLI acceptance and deployment setup
  remain.
- Repository/branch: `/home/joshlamont/Code/recipe-box`, `main`.
- Current step: local CLI acceptance remains pending; do not reset Supabase or
  access hosted data.
- Last verified result: six focused route tests pass; `npm run typecheck` and
  targeted Biome checks pass; Markdown lint found no new diagnostics in the
  new API guide or modified docs. The guide now explains Copilot's required
  caller-side environment setup, sandbox credential masking, and the REST/MCP
  distinction.
- Next action: run the documented CLI flow against representative local data
  when the local environment is available. Configure the Vercel Secret and
  redeploy separately before using the hosted endpoint.
- Checklist: [checklist.md](./checklist.md)
- Trace: [trace.md](./trace.md) — session
  `97493a7a-27e5-4012-b212-41729b9b9f05`; latest entry:
  implementation verification for session
  `98831c0f-905b-430d-981c-39b7feeb148e`.
