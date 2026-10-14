# Next Slice

Hello!

1. Familiarize yourself with the repo and target slice

- Read the planning docs in `#plans`:
  - `#file:delivery-roadmap.md` to identify the target slice and its demonstrable outcome
  - `#file:first-draft-spec.md`, `#file:comprehensive-reference.md`, `#file:data-model.md`,
    `#file:visual-design.md`, and `#file:decision-log.md`
  - recent slice briefs in `docs/plans/slices/` that touch adjacent data or UI surfaces
- Verify every field, operator, and rule against `#file:comprehensive-reference.md` and the current database
  schema/code.
  - Do not infer unmentioned fields or behaviors.
  - If the docs and code disagree or leave a product choice ambiguous, stop and ask before locking it into the brief.

1. Research and prepare before writing the slice brief

- Read `#file:visual-design.md` and inspect existing app implementations before designing any UI:
  - What UI features and states does this slice require, and what does `#file:visual-design.md` specify for them?
  - Which existing components and CSS patterns already solve parts of this slice (for example `Picklist`,
    `MultiPicklist`, icon-only toolbar triggers, single-button mode toggles, inline italic action links like
    `add ingredient`, pill buttons like `Add pairing`, row-level `x` actions, and anchored popovers)?
  - How are those controls sized, aligned, keyboard-operated, and dismissed on desktop and mobile?
  - Which existing routes or shared views use the same explorer, table, or control pattern and must stay in parity?
- Research how the slice's specific interaction mechanics are designed and implemented online:
  - Look beyond recipe sites to best-in-class analogs for the actual mechanic (for example spreadsheets, issue
    trackers, e-commerce facet rails, archive search forms, or document tools).
  - What are the key controls, user flows, pain points, and common misconceptions?
  - How do they separate simple everyday actions from advanced refinement?
  - Take notes and reference screenshots in the browser during preparation (keep third-party screenshots out of the
    repo).

1. Write the slice brief in `docs/plans/slices/` with concrete contracts

- Lock down the exact UI and state mechanics rather than abstract descriptions:
  - **Component reuse inventory:** Name the exact existing components and class patterns to reuse. Require explicit
    justification before introducing any new control primitive or native form element.
  - **Interaction and commit model:** Specify whether controls apply immediately (on select, blur, Enter, or clear)
    or require an explicit Save/Submit button, and how active state is cleared.
  - **Mode and scope isolation:** When controls share a page (tabs, view toggles, scoped explorers), specify which
    state is shared, which state clears on mode switch, and which controls are omitted in scoped views.
  - **Desktop vs. mobile anatomy:** Treat mobile as a distinct layout, not a shrunken desktop view. Specify which
    headers or labels are hidden on mobile, how multi-field metadata condenses (such as `~`-separated strings that
    omit empty values), whether heights are fixed or content-sized, and how empty media slots collapse.
  - **Layout and visual math:** Specify container widths, minimum column track widths, gap math (verifying target
    column counts actually fit inside the shell track), first-row contrast against headers, and visual row/column
    striping or checkerboard behavior across responsive column counts.
- Pause and present any open product/UX trade-offs or brief assumptions for confirmation before writing production
  code.

1. Implement and verify

- Consult `#file:visual-design.md` every time before touching UI code or styles.
- Look up current official docs for any Next.js, React, Supabase, or web API details before implementing.
- Write focused failing unit, API/database, browser, and accessibility tests first, including responsive viewport
  geometry and visual-state assertions on both desktop (`chromium`) and mobile (`Fold 6`).
- After implementation, inspect the live rendered UI in the browser at desktop and mobile widths to verify alignment,
  spacing, control reuse, and responsive reflow before declaring the slice complete.
