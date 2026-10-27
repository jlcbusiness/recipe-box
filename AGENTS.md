## UI Pattern Reuse

Before implementing or changing UI:

- Find the closest working screen or component in this app that serves the
  same purpose. Inspect its implementation, styles, relevant tests, and its
  rendered behavior at the applicable viewport when the app is available.
- Read the relevant contract in `docs/plans/visual-design.md` and the owning
  slice brief. The comprehensive reference and slice contract define required
  behavior; the working app is a useful precedent, not an unquestionable design
  standard.
- Before editing, briefly identify the closest reference, the requested delta,
  and whether the reference serves this workflow well. Preserve established
  behavior and visual patterns that remain appropriate, but do not copy a weak
  layout, hierarchy, spacing, or interaction just for consistency.
- Reuse existing components, classes, and design tokens where they fit. If the
  existing pattern is a poor fit, choose the smallest design change that better
  serves the workflow while honoring the product contract. Avoid unrelated
  visual redesign.
- If the product contract conflicts with the current implementation, follow
  the contract. Ask only when the docs leave a material product or design choice
  unresolved; otherwise state the rationale and proceed without asking the user
  to re-specify clear requirements.
- Validate the changed screen with representative content at the relevant
  viewports. Use browser screenshots and behavior/geometry assertions to check
  that the design fulfills the contract, including desktop and mobile when
  responsive behavior is affected. Compare with the reference where useful, but
  do not treat resemblance as success by itself. If the app cannot be run, say
  which visual checks could not be performed.
  
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

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
