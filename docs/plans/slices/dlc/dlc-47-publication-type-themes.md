# DLC 47: Publication Type Themes

**Status:** Implemented and verified for app version 1.19.0; approved on 2026-11-20.

## Outcome

Give Book, Magazine, and Site publication workflows a quiet type tint without
changing the Recipe Tin's existing app palette. Carry each non-Tin tint across
its publication and associated private recipe pages, forms, and shared
navigation. Keep the mixed-type Library and unrelated routes on their existing
palette. Treat the color themes as decorative; do not add visible type-name
badges where the publication name is already present.

## Scope

- Theme Book, Magazine, and Site publication detail, associated private recipe
  detail/edit/history pages, and the recipe form when one of those types is
  selected. Include shared navigation on those pages; leave Recipe Tin and
  unrelated routes on their existing palette.
- Keep existing type-specific icons and accessible names in the mixed-type
  Library, but do not add visible Book, Magazine, or Site badges to Grid cards.
  The Recipe Tin name remains its type cue.
- Replace only the Recipe Tin's current photographic cover artwork with an
  approved illustration.
- Leave all normal Book, Magazine, and Website covers unchanged, including
  their current no-image fallbacks, uploaded images, and saved framing.
- Keep the general application shell's green identity on routes without a
  non-Tin publication. On themed routes, the menu uses a pale version of the
  active tint and remains lighter than the page background.
- No database, media schema, or publication-data changes are expected.

## Approved implementation contract

- Apply a restrained tint to Book, Magazine, and Site publication detail and
  associated private recipe detail/edit/history pages. The new/edit recipe
  form follows its selected non-Tin publication and updates when that
  selection changes. Recipe Tin pages, the mixed-type Library, and unrelated
  routes keep their existing palette.
- Keep the publication name in private recipe breadcrumbs without a redundant
  Book, Magazine, or Site badge. Preserve the Recipe Tin's distinctive recipe
  content treatment.
- Map the existing green color roles rather than replacing them with vivid
  page colors:

  Map each existing green role to the hue of its publication type while
  preserving that role's original HSL saturation and lightness. Use the
  existing Book `#58636C`, Magazine `#735700`, and Site `#684575` accent hues.
  The resulting page and left-menu surfaces are:

  | Role | Existing | Book | Magazine | Site |
  | ---- | -------- | ---- | -------- | ---- |
  | Page surface | `#F7F9F4` | `#F4F7F9` | `#F9F8F4` | `#F8F4F9` |
  | Left menu | `#FFFFFF` | `#FAFBFC` | `#FCFCFA` | `#FCFAFC` |
  | Wash surface | `#EDF4E9` | `#E9EFF4` | `#F4F1E9` | `#F1E9F4` |
  | Line | `#D9DFD3` | `#D3DADF` | `#DFDCD3` | `#DCD3DF` |
  | Strong line | `#AEB8A7` | `#A7B0B8` | `#B8B4A7` | `#B3A7B8` |
  | Interactive line | `#83917D` | `#7D8891` | `#918C7D` | `#8C7D91` |
  | Control border | `#9BA596` | `#969EA5` | `#A5A196` | `#A196A5` |
  | Muted text | `#62695D` | `#5D6469` | `#69665D` | `#665D69` |
  | Leaf, hover, and rule accent | `#386044` | `#384E60` | `#605638` | `#553860` |

  Keep the existing type-accent colors on Library icons and preserve type
  names for their accessible names.
  Keep body text at `#242820`, the Recipe Tin on its unchanged green palette,
  and the existing focus treatment. Verify contrast for themed navigation,
  controls, and labels.
- Reuse the existing sign-in illustration at
  [`src/app/images/logo_detail.png`](../../../../src/app/images/logo_detail.png)
  as the Tin cover artwork. It is decorative when the adjacent publication
  name already identifies the Tin. Confirm that the illustration remains
  recognizable at the compact mobile cover size.
- Do not change any Book, Magazine, or Website cover, fallback, uploaded image,
  crop geometry, or media-management behavior.
- Keep accessible names for type icons, keyboard focus, and interaction states.
  Do not recolor the global shell, routine controls, or focus state without a
  tested contrast-safe treatment.

## Acceptance criteria and automated coverage

1. Book, Magazine, and Site tints appear consistently on publication detail
   and associated private recipe detail/edit/history pages. The recipe form
   follows its selected non-Tin publication at representative desktop and
   mobile widths.
2. The page surface is only subtly tinted. The left menu uses a still lighter
   tint and is visibly distinct from the page background.
3. Recipe Tin publication, recipe, edit, history, and selected-form routes
   retain the default app palette; its documented recipe content treatment
   remains intact.
4. The mixed-type Library keeps its per-type icons and accessible names
   without visible type-name badges or adopting one page-wide theme. Unrelated
   routes retain their default palette.
5. Tin artwork is the approved original illustration, is recognizable at
   compact and detail sizes, and has an appropriate decorative alternative.
6. Book, Magazine, and Site covers remain visually and behaviorally
   unchanged, including their fallbacks, uploaded images, and reversible crop
   behavior.
7. Recipe pages identify the publication by name in breadcrumbs without a
   redundant Book, Magazine, or Site badge. The Recipe Tin breadcrumb name
   remains visible, and the documented Tin recipe content treatment remains
   intact.
8. Text meets 4.5:1 contrast and non-text boundaries/focus indicators meet
   3:1 against adjacent surfaces. Type remains identifiable without color.
9. Automated browser tests verify page and navigation theme mapping, default
   palette restoration on unrelated routes, accessible names, responsive
   behavior, contrast, and preservation of normal/uploaded cover behavior.
   Manual visual checks supplement these tests.

No schema migration was needed. Automated coverage is in
`tests/e2e/publications.spec.ts` and `tests/e2e/recipe-tin-library.spec.ts`.

## Exclusions

- No changes to public recipe pages or print/download output are in scope.
- The mixed-type Library remains at its default page palette and uses
  per-publication cues. Recipe Tin and unrelated private routes also retain
  their existing palette.
- No changes to publication fields, uploaded images, media framing, or
  persistence.

## Existing patterns and constraints

- `PublicationCover` is shared by the Library, publication detail, and media
  management. Its current no-image Book and Magazine treatments are blue and
  white/red; the Tin currently uses a photographic asset. Preserve the normal
  publication treatments.
- The Library also has separately colored type icons. Recipe detail places
  publication attribution near the recipe title.
- Route-scoped `data-publication-theme` markers apply only to Book, Magazine,
  and Site workflows. Do not mark Recipe Tin routes; keep their body and
  navigation on the existing app palette.
- The comprehensive reference specifies the blue Book fallback, white
  Magazine fallback, and Recipe Tin artwork. The approved visual guide and
  reference also preserve the normal covers while documenting the full
  publication-page themes.

## Open decisions

None. The restrained role mapping, no-theme Recipe Tin boundary, non-Tin
publication and associated recipe-page scope, menu tint, cover boundaries,
and public/print exclusions were approved on 2026-11-20.

## Initial sizing

Medium difficulty; about **2–4 days**; medium churn. The work is visual and
cross-screen, with no expected database change.

## References

- [First-draft specification: Publications and Recipe Tin](../../first-draft-spec.md#publications-and-recipe-tin)
- [Comprehensive reference: Publications and Recipe Tin](../../comprehensive-reference/04-publications-and-search.md#6-publications-magazine-handling-and-the-recipe-tin)
- [Design philosophy](../../design-philosophy.md)
- [Visual design: Publication Cover Fallbacks](../../visual-design.md#publication-cover-fallbacks)
- [Decision log](../../decision-log.md)
- [Data model](../../data-model.md)
- [Sign-in illustration](../../../../src/app/images/logo_detail.png)
- [Shared publication cover](../../../../src/app/publications/publication-cover.tsx)
- [Publication detail styles](../../../../src/app/styles/publication-detail.css)
