# DLC 08: Recipe reading, public, and print layout

This brief establishes one recipe-reading contract for private, public, and
printed recipes. It follows relevant recipe-structure and media decisions.

## Outcome

Recipe content uses available width without an arbitrary narrow cap, presents
summary details compactly, and gives public and printed views a consistent
information hierarchy. Print uses a deliberate landscape page and omits recipe
photos unless product review changes that requirement.

## Scope

- Remove or revise the private recipe reader's width constraint without
  creating excessive line lengths or mobile overflow.
- Rework metadata into a compact horizontal summary that wraps accessibly.
- Align public and private reading hierarchy while retaining the public
  allow-list and guest-only interaction boundaries.
- Define print image omission, page breaks, margins, and landscape preference.
- Review how the reader begins: recipe summary first, ingredients first, or a
  direct path into instructions; do not hide recipe identity or controls.
- Keep public/print recipe details and instruction rendering in sync.

## Decisions before implementation

- Approve the target content measure at desktop sizes and responsive breakpoints.
- Confirm print landscape as a preference or default and define browser fallback.
- Confirm that print omits photos, including images referenced in instructions.
- Define which interactions remain in public and print presentations.

## Acceptance

- Private, public, and printed outputs share agreed field order and wording.
- Public output contains no private fields or private media URLs.
- Print has no clipped text, unintended photo output, or split ingredient rows;
  automated PDF text assertions verify content and orientation.
- Chromium and Fold 6 browser, public privacy, print, accessibility, and
  responsive-layout checks pass.

## References

- [Cooking views](../16-cooking-views.md)
- [Public links](../22-public-links-and-privacy.md)
- [Visual design guide](../../visual-design.md)
