<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Supabase database guidance

- Before pushing migrations, inspect `supabase migration list --linked` and
  preview with `supabase db push --linked --dry-run`. If a migration appears
  pending but its effects may already exist remotely, verify the schema before
  applying or repairing migration history; do not blindly rerun it.
- For expected optimistic-concurrency conflicts in public RPCs, do not raise
  SQLSTATE `40001` while the project uses PostgREST 14. PostgREST treats it as a
  transient serialization failure and retries the transaction, which can
  amplify log volume and CPU. Use a PostgREST status code such as `PT409` when
  the conflict should be returned as HTTP 409, and map that code to the app's
  conflict UX. Verify the deployed PostgREST version before relying on this
  version-specific behavior.
- See the [decision log](docs/plans/decision-log.md) and Supabase's guidance on
  [high CPU and retries from custom error codes](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
