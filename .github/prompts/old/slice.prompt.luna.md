# Implement A Slice

Work on the slice explicitly named in the user's request. Do not assume the
slice is 17 or automatically choose the next roadmap item. If the requested
slice is missing or ambiguous, ask which slice before proceeding. Unless the
user asks only for a brief or plan, prepare the slice brief and carry the work
through implementation and verification. Pause for clarification only when an
unresolved product, security, or data decision blocks a sound implementation.

## Prepare

1. Read the repository instructions and `AGENTS.md`. Follow the roadmap's
  **Mandatory Slice Preparation** and **Completion Rule**.
2. Read `first-draft-spec.md`, then the selected roadmap row and its relevant
  sections of `comprehensive-reference.md`, `data-model.md`,
  `visual-design.md`, and `decision-log.md`.
3. Inspect the closest implemented slice, its tests, and the actual owning
  components or data path. Verify current behavior in the app when it affects
  the design. Treat existing code as evidence, not as proof that it meets the
  new slice's requirements. Before changing Next.js code, read the relevant
  guide under `node_modules/next/dist/docs/` for the installed version.
4. Reconcile the sources before writing the brief. Keep product requirements,
  existing conventions, assumptions, and proposed decisions distinct. Do not
  infer product requirements from competitor behavior. Resolve conflicts
  against the source hierarchy or ask about decisions that materially change
  user-visible behavior, data, security, or compatibility.

## Research And Brief

Research only what is needed to resolve a real design or technical question.
For UI patterns, check `visual-design.md` and the nearest local precedent first;
use a small number of relevant product references only when those leave a gap.
For unfamiliar or version-sensitive implementation details, verify current
official documentation. Record the finding, source, and resulting decision in
the brief; do not turn it into an exhaustive site survey. Capture reference
screenshots only when they clarify a design decision, and do not add
third-party images to the repository.

Create or update the selected slice brief under `docs/plans/slices/`. Make it
focused and ready to implement, not a duplicate of the comprehensive
reference. Link to source requirements instead of restating them. Record only
research findings that change a decision, and keep the brief proportional to
the slice. It should state:

- The demonstrable user outcome, scope, exclusions, and linked source
  requirements.
- Existing behavior and local patterns to preserve or extend.
- User flows, state transitions, validation, empty/loading/error states, and
  relevant data, ownership, migration, and failure boundaries.
- For UI, information hierarchy, control behavior, component anatomy,
  responsive composition, keyboard/touch/accessibility behavior, and useful
  acceptance screenshots.
- Deterministic acceptance criteria and the smallest end-to-end demonstration.
  Describe observable outcomes, not implementation guesses.

If the slice requires more than one demonstrable outcome, follow the roadmap's
slice-size rule and propose a split before implementing. Record accepted new
decisions and material deferrals in `decision-log.md`.

Avoid vague criteria such as “responsive” or “works on mobile.” Specify the
relevant viewport or container sizes, breakpoints, expected layout, and boundary
behavior. For grids, account for usable content width, track minimums, gaps,
shell padding, and max-width constraints; test where the column count changes.
When styling depends on visual rows or columns, define it by rendered position
and verify it after reflow. Do not lock unrelated dimensions or visual details
that the design guide and requirements leave open.

## Implement And Verify

1. Before production code, write focused failing automated tests for the brief's
  observable acceptance criteria. Reuse project fixtures and helpers. Include
  relevant failure, empty, permission, keyboard, and responsive cases; keep
  coverage proportional to the slice.
2. Implement the smallest end-to-end path that satisfies the brief. Preserve
  established APIs and patterns unless the requirements justify changing them.
  Consult `visual-design.md` again before each UI change.
3. For UI work, run or use the existing local app and inspect the implemented
  flow at representative desktop and mobile sizes, including layout
  breakpoints or boundary widths identified in the brief. Use realistic
  content. Compare the rendered result with the brief and acceptance tests;
  fix mismatches before calling the slice complete. Automated tests and
  screenshots complement each other. Do not reset local data or stop an
  existing development server as a validation shortcut. For an authorized
  reset, follow the [README recovery procedure](../../README.md#resetting-and-recovering-local-data)
  to export before reset, reapply migrations, recreate the local Auth account,
  and import. The ZIP restores account data and ready images, not Auth users or
  history. Prefer an isolated Supabase project for acceptance tests.
4. Run the focused tests first, then the required type, lint, accessibility,
  build, and broader checks appropriate to the changed surface. Update the
  visual guide's current-implementation section only to describe behavior
  that is implemented and verified; keep future direction distinct.
5. Check the final diff for scope, generated-file churn, and whitespace. Report
  the brief, user-visible result, checks that passed or failed, and any
  material limitation or deferred decision. Never claim a check passed unless
  it ran successfully.
