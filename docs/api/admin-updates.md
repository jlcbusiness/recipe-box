# Admin Updates API

The read-only Admin Updates API lets a trusted person, script, or Copilot
integration retrieve the entries from a Recipe Box instance's Updates tracker.
It is optional; the application works without it.

The API is not public and does not use a signed-in administrator's session.
Anyone with the API key can read all tracker entries, including completed and
archived entries. Share the key only with trusted callers. The API cannot
create, edit, archive, or delete entries and does not return audit history.

## Enable the API

Generate a unique 32-byte key on a trusted machine with the project's Node.js
runtime:

```sh
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

Save the value in a password manager. Do not put it in source code, a committed
environment file, a URL, or a command containing the literal key.

For a Vercel deployment:

1. Open the Recipe Box project in Vercel and go to **Settings > Environment
   Variables**.
2. Add `ADMIN_UPDATES_API_KEY`, paste the generated value, select **Secret**,
   and choose the environment where the API should be available (usually
   **Production**). Use separate random keys for Preview and Development.
3. Save the original value in the password manager. Vercel does not reveal a
   Secret value after it has been saved.
4. Redeploy that environment so the new deployment receives the variable.

For another hosting provider, configure the same variable in its server-side
secret manager and redeploy or restart the app. Do not use a `NEXT_PUBLIC_`
variable. Never use a Supabase key for this API; the Supabase Secret key is a
separate, more powerful credential.

For local development, put a separate `ADMIN_UPDATES_API_KEY` value in the
ignored `.env.local` file. Do not reuse the Production key.

## Call the API

The endpoint is `GET /api/admin/updates`. Set the instance URL and key in your
shell environment where the caller runs, then call it over HTTPS:

```sh
export RECIPE_BOX_URL="https://your-project.vercel.app"
read -r -s -p "Admin Updates API key: " ADMIN_UPDATES_API_KEY
printf '\n'
export ADMIN_UPDATES_API_KEY

curl --fail-with-body --silent --show-error \
  --header "Authorization: Bearer ${ADMIN_UPDATES_API_KEY}" \
  --header "Accept: application/json" \
  "${RECIPE_BOX_URL}/api/admin/updates"

unset ADMIN_UPDATES_API_KEY
```

The response is JSON with an `updates` array. Each entry contains `id`,
`body_markdown`, `kind`, `completed_version`, `completed_at`, `is_archived`,
`sort_order`, `created_at`, and `updated_at`. Completed and archived entries
are included. The API applies the Updates page's ordering rules and sets
`Cache-Control` to prevent caching.

Missing or incorrect credentials return `401`. If the server key is missing
or the request cannot be served, the API returns `503`. Other HTTP methods
return `405`.

## Use it from Copilot

The Vercel Secret stays on the server; it is not automatically sent to
Copilot. To let a local VS Code Copilot session call this API through a
terminal command, make the caller's copy of `ADMIN_UPDATES_API_KEY` available
to the VS Code process:

1. Keep the key in your password manager. Fully quit VS Code.
2. From a terminal, enter it at a hidden prompt and start VS Code from that
   shell. On Linux or macOS with the `code` command installed:

   ```sh
   printf "Admin Updates API key: "
   read -r -s ADMIN_UPDATES_API_KEY
   printf '\n'
   export ADMIN_UPDATES_API_KEY
   code .
   ```

   The key is not part of the command or shell history. If Copilot runs on a
   remote machine or in a container, provide the variable on that execution
   host instead; a variable set only on your local computer will not reach it.
3. To keep the value from being exposed to sandboxed terminal tools, enable
   **Sandboxing for terminal** for the Copilot session. In VS Code User
   Settings JSON, add the variable name and the HTTPS host for your Recipe Box
   deployment. Do not put the key value in this setting:

   ```json
   "chat.agent.sandbox.credentials.envVars": {
     "ADMIN_UPDATES_API_KEY": {
       "injectHosts": ["your-project.vercel.app"]
     }
   }
   ```

   The sandbox gives tools a placeholder and injects the real value only into
   HTTPS requests to the configured host. This credential masking does not
   apply to local HTTP endpoints such as `http://localhost:3000`.
4. Ask Copilot to run the `curl` request above. It can use the environment
   variable without the key appearing in chat or source code.

The key is still available to processes running in the VS Code environment
unless sandbox credential masking is active. Use a trusted machine and limit
the configured `injectHosts` to the Recipe Box host.

This endpoint is ordinary REST, not an MCP server, so Copilot cannot connect
to it directly as an MCP server. Direct MCP tool access would require a
separate MCP adapter that calls this API. VS Code's Copilot MCP configuration
supports environment-variable references in HTTP headers for an MCP server,
but does not directly supply this REST endpoint with a key or read the key
from VS Code SecretStorage. See the [Copilot MCP configuration
reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)
and [Copilot agent sandboxing guide](https://code.visualstudio.com/docs/agents/run/agent-sandboxing)
for current authentication and credential-masking options.

## Rotate or revoke the key

Generate a new key and replace `ADMIN_UPDATES_API_KEY` in the host's secret
manager. Redeploy or restart the app, then update each caller's environment.
The old key stops working after the deployment with the new value is active.
To revoke access without replacement, remove the variable and redeploy.
