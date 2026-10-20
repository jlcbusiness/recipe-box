# DLC 01: Navigation and picklist typeahead

**Status:** Delivered

## Outcome

An authenticated visit to `/app` opens the Library. The current navigation
destination is visibly distinguishable without color alone. An open shared
picklist supports a short, multi-character type-ahead buffer while preserving
its existing selection and focus model.

## Requirements and scope

- Route the authenticated `/app` entry to `/publications`; keep `/` as the
  unauthenticated sign-in page and leave direct recipe routes unchanged.
- Keep the Library navigation link's icon on mobile and label on desktop in
  leaf green so it remains a distinct visual destination. Give its current-page
  state a pale green surface, reinforced by a desktop underline and a stronger
  mobile circle outline. Keep its accessible name, `aria-current`, existing
  order, breakpoint, dimensions, and gold focus outline.
- In an open shared picklist, printable characters build a case-insensitive
  option-label prefix query for 700 ms. Search starts after the active option
  and wraps. Repeating the same character cycles through options with that
  initial instead of building a repeated-letter query.
- Type-ahead changes the active option only. Enter, click, and the existing Tab
  behavior retain their current selection and commit semantics. A no-match key
  leaves the active option unchanged. Arrow keys, Home, End, Escape, focus
  return, Space selection, and screen-reader active-option announcements remain
  intact. Space is reserved for the existing selection behavior rather than
  extending the type-ahead query.
- No database, server action, recipe data, saved preference, or migration
  changes are in scope. Search-buffer state is local to the open menu and is
  discarded when it closes.

## Boundaries and existing patterns

All authentication success paths already converge on `/app`; changing its
server-component redirect updates email sign-in, Google callback, invitation
acceptance, and password reset without changing their boundaries. The root
route remains sign-in. Navigation continues to use semantic links and the
existing `aria-current` state.

The shared `Picklist` keeps DOM focus on its trigger and exposes active options
through `aria-activedescendant`. Type-ahead must not select an option or move
DOM focus. The menu portal targets the nearest dialog or `main` landmark, using
`body` only when neither exists; this keeps open options covered by page
landmarks. Picklist menus remain transient and anchored; no persistence or
additional catalog behavior is introduced.

No external service or persistent data is involved. A failed or unmatched
lookup has no side effect; the active option remains available for arrow-key
navigation or Escape dismissal.

## Interaction and responsive contract

Typing works only while the list is open and the trigger owns focus. Printable
single characters extend the buffer within 700 ms; repeated identical
characters cycle by initial. Matching is case-insensitive. A match updates
`aria-activedescendant` and the existing active-option styling. The selected
option remains distinct until the user selects through an existing action.
Escape closes the menu and returns focus to its trigger.

The Library link remains leaf green (`#386044`) on desktop and mobile, with a
pale green surface (`#edf4e9`) only while current. An underline on desktop and a
stronger circle outline on mobile reinforce its current semantic state. The
existing 640px mobile reflow and 44px navigation controls remain unchanged.
Verify the navigation at 641px and 640px as well as representative 1280px and
390px viewports; verify picklist keyboard behavior at desktop and mobile widths.

## Acceptance and automated checks

| Acceptance | Automated evidence |
| ---------- | ------------------ |
| Authenticated sign-in and direct `/app` visits, including reload, land in the Library; `/` remains sign-in. | Auth E2E assertions; verify the current Library link and page heading. |
| Type-ahead handles prefix refinement, repeated initials, wraparound, and no match without changing the selected value. | Focused `Picklist` component tests. |
| Arrow keys, Enter selection, Escape dismissal, focus return, and active-option announcement remain correct. | Focused `Picklist` component tests. |
| Library active treatment is visible and labeled at desktop/mobile sizes and across the 640px reflow boundary. | Auth E2E geometry/style assertions and axe checks at 1280px, 641px, 640px, and 390px. |
| No keyboard-only, label, landmark, or contrast regression is introduced. | Keyboard-visible-focus assertions and automated axe checks for the private navigation and open picklist. |

## Decisions, research, and assumptions

- **Accepted:** use a short multi-character prefix buffer; repeated identical
  characters cycle among duplicate initials. This follows the WAI-ARIA APG
  recommendation for rapid multi-character type-ahead while preserving the
  brainstorm's first-letter jump behavior.
- **Accepted:** `/` remains sign-in, and `/app` is the authenticated Library
  entry. The root sign-in page and shared `/app` redirect establish this
  boundary in the current implementation.
- **Design choice:** keep the Library link leaf green to make it stand out as a
  destination; its current state adds a pale green surface, desktop underline,
  and stronger mobile circle outline. Preserve the existing gold keyboard-focus
  outline and control dimensions.
- **Research:** WAI-ARIA APG recommends type-ahead for listboxes and supports
  rapid multi-character prefix matching. Adopt the search behavior; preserve
  Recipe Box's established trigger focus, active-descendant, and explicit
  selection model. [WAI-ARIA APG Listbox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)

## References

- [Comprehensive reference: metadata picklists](../../comprehensive-reference.md#24-recipe-metadata-entry-presentation)
- [Comprehensive reference: keyboard and accessibility](../../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)
- [Design philosophy](../../design-philosophy.md)
- [Visual design guide](../../visual-design.md)
- [Decision log](../../decision-log.md)
- [DLC brainstorm](../../discussion/dlc.md)
- [Private shell](../../../src/app/private-shell.tsx)
- [Authenticated app entry](../../../src/app/app/page.tsx)
- [Shared picklist](../../../src/app/picklist.tsx)
