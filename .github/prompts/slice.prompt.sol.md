# Execute a Delivery Slice

Implement the requested delivery slice from preparation through verified
completion. If the user has not identified a slice, ask which roadmap slice to
execute before making changes.

## Establish scope

1. Read the repository instructions and inspect the worktree. Preserve existing
   user changes and follow any project-specific safety constraints.
2. Read the first-draft specification and the selected delivery-roadmap entry.
   Then read the relevant sections of the comprehensive reference, visual
   design guide, decision log, data model, and prerequisite slice briefs.
3. Treat the comprehensive reference as the product authority. Identify the
   slice's explicit requirements, exclusions, dependencies, and affected user
   journeys. Distinguish required behavior from current implementation,
   planned direction, recommendations, and assumptions.
4. Inspect the nearest existing implementation and tests. Run or inspect the
   relevant experience when available. Note which patterns should be reused,
   which do not fit, and what must remain unchanged in adjacent workflows.

## Research unresolved decisions

Research only where it can resolve a real uncertainty in the interaction,
visual design, or technical implementation. Prefer current official
documentation for technical APIs and representative live products for user
interaction patterns.

For each source, record the specific observation, whether it applies to this
product, and why. Do not treat popularity or precedent as a requirement.
Capture reference screenshots when useful and available; record their source
and location, and do not copy third-party imagery into the repository.

Avoid broad research when existing product guidance and working controls
already settle the decision. Surface unresolved choices that would materially
change the workflow, data model, or architecture; recommend a direction and ask
focused questions when user intent cannot be inferred safely.

## Write the slice brief

Before implementation, create or update the slice brief. Make each requirement
traceable to its source and describe the affected screen or workflow and an
observable acceptance check.

Define more than the feature list. For every new or changed screen, describe:

- Information hierarchy and the placement and grouping of primary content and
  controls.
- The interaction model, including modes or tabs, shared versus independent
  state, scope, defaults, transitions, and result behavior.
- Whether changes apply immediately or are staged, and what submit, clear,
  cancel, reset, reload, and error actions do.
- Empty, loading, success, validation, and recoverable-error states that apply.
- Desktop and mobile anatomy, including control reflow, content density,
  touch targets, overflow behavior, and meaningful responsive boundaries.
- Keyboard, focus, screen-reader, and pointer/touch behavior for interactive
  controls.
- Visual treatment of records, imagery, selection, and state, following the
  visual design guide.

Resolve ambiguous terms such as “compact,” “responsive,” “striped,” or
“intuitive” into observable behavior. Use realistic content and measurable
geometry where fit or reflow is important; explain the constraint behind a
measurement. State assumptions explicitly and keep recommendations separate
from product requirements.

## Implement and review

Consult the visual design guide before each UI change. For unfamiliar
technical behavior, verify the current framework and dependency guidance
before coding.

Start with focused failing tests for the acceptance behavior, then implement a
small end-to-end path through the real workflow. Before extending a new or
substantially changed interaction pattern across related screens, inspect that
first pass in the running app at representative desktop and mobile sizes.
Compare it with the brief and the guide. If a consequential design choice is
still uncertain, present the working first pass and get user direction before
propagating the pattern. Continue routine, well-specified work independently.

Keep implementation within the slice boundary. Reuse established components
and behavior where they fit; do not preserve a precedent that conflicts with
an explicit requirement. Update tests as behavior is refined, not only after
the interface is complete.

## Verify and close out

Verify complete user journeys and state transitions, not only isolated
controls. Include relevant combined states, error recovery, keyboard and touch
operation, permissions or data isolation, and persistence behavior.

Check narrow, intermediate, and wide layouts where responsiveness matters.
Inspect automated screenshots and supplement them with behavioral,
accessibility, and geometry assertions. Run the focused tests first, then the
required repository checks. Do not reset local data or stop a running service
unless repository instructions and the user explicitly permit it.

After implementation passes validation, reconcile the brief, visual guide,
roadmap, and decision log with the behavior that actually shipped. Report what
changed, what was verified, and any remaining gaps or deviations. Never claim a
check passed unless it was run and its result confirmed.