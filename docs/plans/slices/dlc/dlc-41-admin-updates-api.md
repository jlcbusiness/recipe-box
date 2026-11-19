# DLC 41: Programmatic Access to Admin Updates

**Status: Implemented. Automated verification and production API access passed.**

## Outcome

A person, script, or Copilot can retrieve the structured entries shown on the
Updates page with a read-only REST `GET` request and an API key. The endpoint
does not make the internal tracker public or require a person to open the page
and copy its text.

## Scope and exclusions

In scope:

- Add `GET /api/admin/updates`, returning a JSON object with all update entries
  in the same deterministic order as the Updates page. Include completed and
  archived entries.
- Require a dedicated bearer API key before accessing data. Return only
  allow-listed update-entry fields; do not expose audit events, accounts, or
  recipe data.
- Support command-line and script clients with ordinary HTTPS requests. Keep
  the endpoint protocol-agnostic: no MCP server, Copilot-specific adapter, or
  custom client is required.
- Set `Cache-Control: no-store`. Fail closed when server configuration is
  missing or a request is unauthorized. Never log credentials, request
  headers, or returned update text.

Out of scope:

- Anonymous or public access, write operations, audit-history retrieval,
  account or recipe data, pagination/filtering unless list size requires it,
  and changes to the Updates page UI.
- A database-backed, per-user API-key manager. The approved first version uses
  one high-entropy read-only integration key configured in the app host's
  secret store and in the caller's environment. Rotation or removal revokes
  access. This is a shared credential, not an individual administrator's
  session; this tradeoff is accepted for the initial version.

## Existing behavior and closest pattern

DLC 28 makes Updates an internal, globally shared tracker. Admins read rows
through Supabase RLS, which requires an authenticated administrator; the
Settings page uses its session client. The component receives the rows as
server-loaded props. Existing server actions independently verify Admin status
and call authorization-checking RPCs. The cron route demonstrates a
server-side `Authorization: Bearer` secret check, but its service-role work is
unrelated to this endpoint and must not be reused without narrowing the read
path.

The closest integration pattern is a new server-only route that authenticates
before accessing data, not a change to the client component or its mutation
actions. The endpoint must query only `app_updates` and return an explicit
allow-list; it must not return `admin_update_events`.

## Proposed access and data contract

- Configure one random `ADMIN_UPDATES_API_KEY` as a Vercel Secret. Callers
  provide it as `Authorization: Bearer <key>` over HTTPS, typically from a
  caller-side environment variable. Do not commit the key or a populated
  Authorization header.
- Authenticate every request before creating or using a privileged database
  client. Compare the bearer value without leaking it through logs or errors.
  Keep the Supabase service-role credential server-only; it is never provided
  to the caller.
- Return `application/json` with an `updates` array. Each row contains only
  `id`, `body_markdown`, `kind`, `completed_version`, `completed_at`,
  `is_archived`, `sort_order`, `created_at`, and `updated_at`. Omit revision,
  actor IDs, and all audit data.
- Return completed and archived entries even though the page hides completed
  entries by default and renders archived entries as ordinary rows. Use the
  existing update sorting rules so incomplete entries retain manual order and
  completed entries sort newest-completed first.
- Do not add any create, edit, complete, reorder, archive, restore, or delete
  operation. Do not enable cross-origin browser access.
- Example caller flow, with the key already set in the caller's environment:

  ```sh
  curl --fail-with-body --silent --show-error \
    --header "Authorization: Bearer $ADMIN_UPDATES_API_KEY" \
    --header "Accept: application/json" \
    "$RECIPE_BOX_URL/api/admin/updates"
  ```

## Key setup and rotation

The REST API key belongs to this application endpoint. Vercel should store it;
Supabase should not issue or store it. Generate a fresh 32-byte value on a
trusted machine using the project's Node runtime:

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

Treat the output as a password: save it in a password manager before adding it
to Vercel. Do not paste it into source code, a committed environment file, chat,
or a populated command string.

1. In the Vercel dashboard, open the Recipe Box project and go to **Settings >
   Environment Variables**. Add `ADMIN_UPDATES_API_KEY`, paste the generated
   value, choose **Secret**, and select **Production**. Use separate random
   values for Preview and Development rather than reusing the Production key.
2. Save the original value in the password manager. Vercel Secret values are
   write-only after saving; if the value is lost, generate a replacement rather
   than trying to retrieve it.
3. Redeploy after adding or changing the variable. Vercel applies environment
   variable changes to new deployments, not existing ones.
4. Put the matching value in the caller's environment as
   `ADMIN_UPDATES_API_KEY`. A local app uses a separate value in the ignored
   `.env.local`; never use a `NEXT_PUBLIC_` prefix. A person using `curl` can
   load the key from a password manager or secret manager into the shell
   environment, then run the example above. Do not commit a shell profile or
   script containing the value.
5. To rotate the key, generate a new value, update the Vercel Secret and
   redeploy, then update each caller's secret environment. The old value stops
   working after the deployment with the new key is active.

Do not use the Supabase project's Publishable or Secret key as this API
credential. Supabase Secret keys grant elevated access to the project and
bypass row-level security; they are a different credential and must never be
given to a CLI caller or Copilot.

## Failure behavior

- Missing server configuration returns an unavailable response without
  querying Supabase.
- Missing, malformed, or incorrect bearer credentials are rejected before any
  database access.
- Database failures return a non-success JSON error; they never return an
  empty success-shaped list.
- Responses are not cached. Errors and logs never include the key, request
  headers, or returned update text.

## Acceptance criteria and tests

1. A request without a key, with a wrong key, or when the server key is
   unconfigured cannot read entries; tests assert no data query occurs in
   these cases.
2. With the correct key, `GET /api/admin/updates` returns HTTP 200 and
   `application/json` with the documented top-level `updates` array.
3. The response includes all fixture updates, including completed and archived
   entries, ordered consistently with the Updates page. Each row contains only
   the allow-listed fields and no audit, account, or recipe data.
4. Unsupported methods and database failures are surfaced as errors; no
   mutation path is exposed.
5. Responses set `Cache-Control: no-store`. Focused automated tests cover
   authorization, output shape, ordering, and database failures.
6. Manual acceptance from a command line retrieves entries from a configured
   app instance as JSON. Copilot can use the same command/API as a client when
   its execution environment has the key. The setup guide explains key
   generation, Vercel Secret configuration, caller environment setup, and
   rotation.
   Confirm no key is present in the repository or committed
   shell/configuration files.

## Assumptions and unresolved details

- Assumption: the initial endpoint is a narrow read-only API for the Updates
  tracker, not a general application API. Add filtering or pagination only if
  the actual entry volume requires it.
- Approved credential lifecycle: one static, high-entropy bearer secret
  managed outside the database and not tied to an individual Admin. Revocation
  requires rotating or removing it in Vercel and updating caller environments.
- Use the server-only Supabase client only after verifying the API key, and
  restrict the query to `app_updates` and the response allow-list. The key
  grants no other database or application access.
- The comprehensive reference and data-model boundary record the API-key
  exception. Reconcile them with verified implementation behavior at
  completion. No UI change is expected, so the visual guide needs no update.

## References

- [Slice workflow](../../../../.github/prompts/slice.prompt.md)
- [First-draft specification](../../first-draft-spec.md)
- [Delivery roadmap](../../delivery-roadmap.md)
- [Comprehensive reference: administrator-managed Updates](../../comprehensive-reference/06-sharing-and-accounts.md#106-administrator-managed-updates)
- [Data model](../../data-model.md)
- [Design philosophy](../../design-philosophy.md)
- [Visual design: App admin and Updates](../../visual-design.md#app-admin-and-updates-dlc-28--dlc-34--dlc-40)
- [Decision log](../../decision-log.md)
- [DLC 28: Admin Updates](./dlc-28-admin-updates.md)
- [DLC 40: Admin Update Change Classification](./dlc-40-admin-update-change-type.md)
- [Admin Updates data loading](../../../../src/app/admin/admin-settings-panels.tsx)
- [Admin Updates server actions](../../../../src/app/admin/actions.ts)
- [Existing bearer-secret route](../../../../src/app/api/cron/media-cleanup/route.ts)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel Secret environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Node.js crypto API](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback)
- [Admin Updates API setup and usage guide](../../../api/admin-updates.md)
