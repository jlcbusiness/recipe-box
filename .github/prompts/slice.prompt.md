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
  repository safety rules; do not reset local data or stop a running service
  without authorization.
- Follow the roadmap's Mandatory Slice Preparation, Standing Rules, and
  Completion Rule. Read `first-draft-spec.md` first, then the selected roadmap
  entry and relevant sections of the comprehensive reference, data model,
  visual guide, decision log, and prerequisite or neighboring briefs.
- Treat the comprehensive reference as product authority and the selected
  brief as the immediate implementation contract. Separate requirements from
  current behavior, research observations, recommendations, and assumptions.
- Inspect the closest implementation, data path or schema, and tests. Preserve
  adjacent behavior. For Next.js changes, read the installed version's
  relevant guide in `node_modules/next/dist/docs/`.
- Ask about unresolved decisions that materially affect behavior, data,
  security, accessibility, or scope. Proceed independently on routine details.

## Research and brief

Research established interaction patterns for every user-facing feature. Look
at relevant products and cross-domain examples where useful; compare multiple
independent examples when practical. Study the core task, controls, state
changes, mobile and accessibility behavior, and common friction or failure
cases. Consult authoritative guidance for relevant design or technical details.

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
- For UI changes: hierarchy, control behavior, responsive layout, and
  keyboard, focus, screen-reader, pointer, and touch behavior.
- Observable acceptance criteria mapped to automated tests. Document manual
  checks only where automation is not practical. Derive responsive thresholds
  from actual content and layout constraints.
- Assumptions and unresolved decisions, separate from requirements.

Keep each slice to one demonstrable outcome; propose a split if the brief needs
more than one. Record accepted decisions and material deferrals in
`decision-log.md`.

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
  persistence, accessibility, and responsive boundaries in the brief.
- Reuse the existing dev server. Do not start a competing server, stop a
  running service, or reset local data without authorization. Run focused tests
  first, then relevant type, lint, accessibility, and build checks. Screenshots
  supplement behavioral and geometry checks; they do not replace them.
- Reconcile the brief and update the roadmap, visual guide, or decision log to
  reflect verified behavior. Follow the roadmap's Completion Rule. Never claim
  an unrun check passed.

Report the outcome, changed files, check results, warnings, and any unverified
criteria or deferred decisions.
