# Execute a Product Slice

Use this prompt to prepare and implement the product slice identified by the user. Complete the brief and
implementation unless the user explicitly asks for planning only.

## 1. Establish Scope

- Identify the target slice from the user's request. If it is not clear which slice to work on, ask before
proceeding.
- Read the repository's agent instructions and the relevant plan documents. At minimum, review the delivery
roadmap, first-draft specification, comprehensive reference, data model, decision log, and the target
slice's neighboring briefs where relevant.
- Read the target slice requirements from their source of truth. Record the intended outcome, dependencies,
constraints, and explicit non-goals. Do not turn an implementation detail or an assumption into a product
requirement.
- Inspect only the code, tests, and data model needed to understand the owning behavior and nearby
precedents. Note existing behavior that must remain unchanged.
- Follow framework-specific instructions in the repository. For Next.js work, read the applicable
documentation bundled with the installed Next.js version before writing code.

## 2. Research Before Writing the Brief

- Read `docs/plans/visual-design.md` before making design decisions. Identify which parts directly guide the
slice and where the design guide is silent.
- Inspect similar controls and flows already implemented in the app. Record how they look and behave,
including concrete values and interaction details such as dimensions, spacing, breakpoints, menu
dismissal, focus handling, and responsive behavior when those details are relevant.
- Research how the slice's requirements are commonly designed and implemented online, prioritizing
authoritative technical sources and relevant real-world products. Investigate key elements, controls,
interactions, accessibility, common user difficulties, and likely mistakes or misconceptions.
- Verify technical advice against authoritative sources when implementation behavior is unfamiliar or
uncertain. Link sources in the brief; distinguish observed behavior from documented guidance and from your
own recommendation.
- Capture concise research notes and reference screenshots where the browser tools allow. Keep third-party
screenshots as research references; do not add or redistribute them as product assets.
- Do not copy a reference product wholesale. Use research to inform decisions within this app's
visual language and requirements.

## 3. Resolve Decisions and Define Acceptance

Before implementation, compare the requirements, visual guide, research, and existing app patterns.

- Reuse established app behavior and concrete design values where they fit. If the slice needs to diverge,
explain why in the brief rather than silently introducing a second convention.
- Enumerate the meaningful states and transitions for the feature: loading, success, empty, error, narrow and
wide layouts, intermediate widths, overflow, and dynamic changes such as filtering, sorting, wrapping, or
reflow, as applicable.
- Identify ambiguous decisions. Resolve them from the requirements, established app patterns, and verified
research when possible; label any remaining assumption in the brief. Ask the user before proceeding when
an unresolved choice could materially change product behavior, data compatibility, accessibility, or
scope. Do not block on minor reversible implementation details.
- Write acceptance criteria that are observable and measurable. Name relevant breakpoints or viewport
widths, expected counts or layout behavior, and interaction outcomes. Derive thresholds from the actual
content area and component dimensions rather than guessing.
- Map each behavioral criterion to an appropriate test or a documented manual verification. Include
responsive transitions and dynamic states in the criteria when they can expose layout or state bugs.

## 4. Write the Slice Brief

- Create or update the brief in the existing `docs/plans/slices/` naming and structure. Check whether the
target brief already exists before creating a file.
- Include the outcome and scope, source requirements, relevant app precedents, design decisions,
assumptions or open questions, implementation constraints, and measurable acceptance criteria.
- Link the relevant plan documents, app references, research sources, and technical documentation.
- Keep the brief actionable and concise. Separate required behavior from implementation suggestions and
research observations. Do not duplicate the full product specification.
- Run the repository's Markdown validation after editing the brief.

## 5. Implement the Slice

- Re-read `docs/plans/visual-design.md` immediately before each set of UI changes. Preserve its visual
language and any slice-specific decisions in the brief.
- Implement the smallest coherent change that satisfies the brief. Reuse the owning abstractions and
established components; avoid unrelated cleanup or parallel control patterns.
- Add or update focused tests for the acceptance criteria, including regression coverage for existing
behavior that the change could affect.
- If implementation reveals a conflict with the brief or a requirement that cannot be met as written, stop
and resolve it. Update the brief when an agreed decision changes; do not let code and brief silently
diverge.
- Preserve user changes in the worktree. Do not overwrite or revert unrelated work.

## 6. Verify the Result

- Run focused tests first, then the relevant typecheck, lint, and build checks required by the repository
and the change.
- Verify the running application in a browser for UI work. Reuse an already-running development server when
available; do not start a competing server or stop the user's server without permission.
- Inspect the actual rendered result at the widths and states named in the acceptance criteria. Include
widths immediately around important responsive thresholds and at least one intermediate width when
reflow is involved. Exercise the key interactions with realistic data.
- Compare the live result with both the brief and the visual guide. A passing unit test, a plausible diff, or
a single desktop screenshot does not by itself verify responsive behavior. Fix discrepancies and repeat
the focused checks.
- If browser or runtime verification is unavailable, state exactly what could not be verified and why. Do
not claim a visual or behavioral result that was not observed.

## 7. Report Completion

Summarize the delivered behavior and link the changed brief and implementation files. Report the focused
tests and other checks that passed, note any existing warnings or unverified criteria, and call out any
assumptions or scope decisions that still need the user's attention.
