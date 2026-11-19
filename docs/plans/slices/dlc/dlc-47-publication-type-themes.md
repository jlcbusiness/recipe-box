# DLC 47: Publication Type Themes

**Status:** Draft candidate. Confirm the full theme surface and illustration
asset before implementation.

## Outcome

Each publication type has a recognizable visual theme across the application:
Recipe Tin is green, Book is white, Magazine is yellow, and Website is plum.
The application's overall green identity remains unchanged.

## Scope

- Apply publication-type colors to the shared cover, detail, and
  type-specific surfaces throughout the application, not only to cover
  fallbacks.
- Replace the Recipe Tin's current photographic artwork with an approved
  illustration/clipart treatment.
- Preserve user-uploaded covers for Books, Magazines, and Websites.
- Keep type labels and accessible names; color is never the sole type cue.

## Proposed behavior

- Establish one set of type tokens for backgrounds, borders, text, and
  interactive states, then reuse them in Library, publication detail, and
  recipe-origin contexts.
- Recipe Tin uses green while the application shell remains green. Book uses
  white, Magazine yellow, and Website publication plum.
- The Tin illustration must remain legible at compact cover sizes and have a
  suitable fallback. Treat it as decorative when adjacent text already names
  the Tin.
- Keep user-uploaded publication images and their saved framing behavior
  unchanged.
- Check text, focus, and control contrast in each theme; retain existing
  accessible labels and control states.

## Acceptance criteria

1. All four publication types use the approved palette consistently in
   representative List, Grid, detail, and recipe-origin views.
2. The overall app shell retains its existing green appearance.
3. The Recipe Tin uses the approved illustration instead of its current
   photographic artwork; it remains recognizable at desktop and mobile cover
   sizes.
4. User-uploaded covers and reversible crop behavior are unchanged.
5. Text and controls meet the project's contrast requirements, and visual
   checks cover desktop and mobile surfaces.

## Open decisions

- Define exact color tokens and required contrast states; “white,” “yellow,”
  “green,” and “plum” are palette directions, not production color values.
- Select or create an approved Tin illustration and confirm its licensing and
  source.
- Inventory all type-tinted surfaces before implementation; this draft assumes
  every publication-type surface, not the app shell, receives the theme.

## Initial sizing

Medium difficulty; about **2–4 days**; medium churn. The work is visual and
cross-screen, with no expected database change.

## References

- [Visual design: Publication Cover Fallbacks](../../visual-design.md#publication-cover-fallbacks)
- [Publications and search reference](../../comprehensive-reference/04-publications-and-search.md)
- [Shared publication cover](../../../../src/app/publications/publication-cover.tsx)
- [Publication detail styles](../../../../src/app/styles/publication-detail.css)
