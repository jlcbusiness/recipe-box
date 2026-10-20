# DLC 17: Full-screen cooking mode

This brief revisits Slice 16's temporary cook mode and proposes a dedicated
cooking experience. Build only after interaction and device constraints are
verified.

## Outcome

A cook can focus on one recipe in a navigation-replacing interface, with
readable ingredients and steps, temporary completion state, and a reliable way
to return to the recipe.

## Scope

- Define entry, exit, browser back, refresh, and recipe-change behavior.
- Present ingredients and instructions in a usable step-by-step or synchronized
  layout without mutating recipe content.
- Preserve temporary check-off and best-effort wake-lock behavior.
- Support mobile safe areas, screen readers, keyboard controls, and reduced
  motion.
- Decide whether timers are included; do not imply background timer reliability
  without a technical proof.

## Decisions before implementation

- Choose a route, modal, or full-screen shell and define URL/history behavior.
- Decide how ingredient completion relates to steps and repeated mentions.
- Verify wake lock, orientation, and browser lifecycle behavior on supported
  mobile browsers.

## Acceptance

- Entering and leaving cooking mode preserves recipe state and browser
  navigation expectations.
- Recipe changes and reloads reset only the documented transient state.
- Wake-lock failure does not block cooking and is announced accessibly.
- Browser, lifecycle, mobile viewport, keyboard, and accessibility tests pass.

## References

- [Cooking views](../16-cooking-views.md)
- [DLC brainstorm](../../discussion/dlc.md)
