# DLC 01: Navigation and picklist typeahead

This brief groups small keyboard and navigation improvements from the DLC
brainstorm. It is a candidate follow-up, not implementation authorization.

## Outcome

After sign-in, a person lands in the Library. The Library navigation entry is
visually discoverable without relying on color alone. In an open picklist, a
printable first character moves the active option to the first matching value;
continued typing may refine the match if that behavior is approved.

## Scope

- Change the post-authentication destination from the Recipe Tin to the Library.
- Review active, hover, and focus treatments for the Library navigation icon.
- Add accessible first-character navigation to the shared picklist behavior.
- Preserve current option selection, menu opening, Escape, and focus behavior.

## Decisions before implementation

- Decide whether typeahead is one-character cycling or a short multi-character
  search buffer, and how repeated characters cycle duplicate initials.
- Confirm the default route for unauthenticated users remains sign-in.
- Choose a discoverable Library treatment that retains contrast and is not
  encoded by color alone.

## Acceptance

- An authenticated visit to the app entry opens the Library, including after
  reload; direct recipe routes remain unchanged.
- Keyboard users can locate a picklist option by typing without losing its
  current arrow-key behavior or assistive-technology announcements.
- Unit and browser tests cover duplicate initials, no match, Escape, selection,
  focus return, and desktop/mobile layouts.
- Automated accessibility checks pass for the navigation and picklist.

## References

- [Recipe navigation](../../../src/app/recipes/layout.tsx)
- [Shared picklist](../../../src/app/picklist.tsx)
- [DLC brainstorm](../../discussion/dlc.md)
