---
description: "Prepare, implement, and verify a named Recipe Box delivery slice"
argument-hint: "Slice number or name"
---

# Execute a Delivery Slice

Carry the slice named by the user from preparation through verified completion.
If the slice is missing or ambiguous, ask which one; do not assume the next
roadmap item. If the user requests planning only, stop after preparing the
brief.

## Prepare

- Read `AGENTS.md` and inspect the worktree. Preserve user changes and follow
  repository safety rules. Reuse local data when it is useful; a local reset
  is permitted when a clean baseline is worth the reset and reload effort.
- Follow the [README reset and recovery procedure](../../README.md#resetting-and-recovering-local-data).
  Reapply migrations, then reload the synthetic baseline with
  `npm run seed:synthetic -- --local`. A reset removes all local database
  records and Auth users, including data outside the fixture. Preserve any
  such data separately if needed. Never reset a linked or hosted project as
  part of local work.
- Follow the roadmap's Mandatory Slice Preparation, Standing Rules, and
  Completion Rule. Read `first-draft-spec.md` first, then the selected roadmap
  entry and relevant sections of the comprehensive reference, data model,
  design philosophy, visual guide, decision log, and prerequisite or
  neighboring briefs.
- Treat the comprehensive reference as product authority and the selected
  brief as the immediate implementation contract. Separate requirements from
  current behavior, research observations, recommendations, and assumptions.
- Inspect the closest implementation, data path or schema, and tests. Treat
  existing code as evidence, not proof that it meets the new slice contract;
  preserve adjacent behavior. For Next.js changes, read the installed version's
  relevant guide in `node_modules/next/dist/docs/`.
- Ask about unresolved decisions that materially affect behavior, data,
  security, accessibility, or scope. Proceed independently on routine details.

## Research and brief

Research interaction patterns when product requirements, the design philosophy,
the visual guide, and local precedents leave a real design uncertainty. Study
the core task, controls, state changes, mobile and accessibility behavior, and
common friction or failure cases. Consult authoritative guidance for unfamiliar
or version-sensitive technical details.

Use research to inform behavior, not dictate it. The visual guide governs
Recipe Box's style; product requirements remain authoritative. Distinguish
observed behavior, documented guidance, and recommendations. Cite useful
sources in the brief and explain which patterns are adopted, adapted, or
rejected. Keep research focused and never add third-party imagery to the app.

Before production code, create or update a concise brief in
`docs/plans/slices/`. Link source requirements and state:

- The outcome, scope, exclusions, dependencies, and existing patterns to
  preserve.
- Relevant data, security, migration, and failure boundaries.
- User flow, state ownership, transitions, commit or reset behavior, and
  applicable empty, loading, validation, and recovery states.
- Whether each changed interaction applies immediately or is staged, and what
  submit, clear, cancel, reset, reload, and failure actions do.
- For UI changes: hierarchy, control behavior, responsive layout, and
  keyboard, focus, screen-reader, pointer, and touch behavior.
- Observable acceptance criteria mapped to automated tests. Document manual
  checks only where automation is not practical. Derive responsive thresholds
  from actual content and layout constraints.
- Assumptions and unresolved decisions, separate from requirements.

Keep each slice to one demonstrable outcome; propose a split if the brief needs
more than one. Record accepted decisions and material deferrals in
`decision-log.md`.

## Pause for Review

- Before implementing changes, review the brief, visual guide, and relevant documentation.
- Ensure all assumptions, dependencies, and unresolved decisions are clearly noted.
- Confirm that the proposed changes align with the product requirements and design principles.
- Seek feedback from the user to verify the plan is correct.

## Implement and verify

- Consult the visual guide before each set of UI changes. Write failing
  automated tests before production code for every behavior, rule, error,
  permission boundary, and workflow. For each new screen, automate keyboard,
  visible-focus, contrast, and label checks.
- Implement the smallest end-to-end path. Preserve existing APIs unless
  requirements call for change, and verify unfamiliar technical behavior
  against current authoritative documentation.
- Before extending a substantially new UI pattern to other screens, inspect
  it in the running app at representative desktop and mobile sizes. Verify the
  complete journey, relevant state transitions, recovery, permissions,
  persistence, accessibility, and responsive boundaries in the brief. Inspect
  the widths immediately around each relevant reflow boundary and at least one
  intermediate width where wrapping changes.
- Reuse the existing dev server. Do not start a competing server or stop a
  running service as a validation shortcut. Reset local Supabase when a clean
  baseline is worth its reload cost, then restore the fixture as described in
  the README; never reset linked or hosted data. Run focused tests first, then
  relevant type, lint, accessibility, and build checks. Screenshots supplement
  behavioral and geometry checks; they do not replace them.
- When a product contract changes, update its focused tests to match the new
  observable behavior. Do not weaken an assertion merely to make a failing test
  pass.
- Reconcile the brief and update the roadmap, visual guide, or decision log to
  reflect verified behavior. Review the final diff for scope, generated-file
  churn, and whitespace. Follow the roadmap's Completion Rule. Never claim an
  unrun check passed.

Report the outcome, changed files, check results, warnings, and any unverified
criteria or deferred decisions.
