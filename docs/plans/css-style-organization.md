# CSS Style Organization Blueprint

## Context and purpose

The application has four global stylesheets of roughly 3,700–4,600 lines each.
They are grouped broadly by application area, but several mix distinct
workflows: recipe detail, recipe editing, recipe search, publication browsing,
account/settings, and media. This makes it harder for Copilot to identify the
smallest relevant stylesheet and read related rules without pulling in
unrelated styles.

The goal is to make the global stylesheets smaller and more discoverable for
future code work. This is an organization-only change: it must not change the
visual design, selector behavior, responsive behavior, print behavior, or
which routes receive global CSS. Smaller files are not expected to reduce the
application's CSS payload by themselves because the global entry point still
loads these styles application-wide.

## Existing structure

`src/app/globals.css` imports Tailwind first, then the global styles in this
order:

1. `foundation.css`
2. `recipe-workspace.css`
3. `recipe-media.css`
4. `publications-explorer.css`

The global files contain overlapping selectors and feature-specific rules in
late media-query blocks. Next.js uses CSS import order when determining
stylesheet order. Preserve the existing order exactly, including the order of
all rules within each original stylesheet.

The component-scoped `.module.css` files are already small enough and tied to
their owning components. Leave them unchanged:

- `nutrition-pane.module.css`
- `multi-picklist.module.css`
- `ingredient-catalog-manager.module.css`
- `ingredient-density-manager.module.css`
- `tag-catalog-manager.module.css`
- `recipe-column-order-manager.module.css`
- `recipe-picklist-manager.module.css`
- `tag-controls.module.css`

## Target grouping map

Split the four existing global stylesheets into the following ordered
sections. Keep every existing declaration exactly once. Names describe the
main task area of each section; a few sections necessarily retain adjacent
cross-feature rules where the current source interleaves them.

### Former `foundation.css` contents

| Stylesheet | Main contents |
| --- | --- |
| `foundation.css` | Design tokens, reset, body/theme defaults, shell, and shared layout primitives |
| `account-admin.css` | Account/navigation, administration, admin updates, and settings tab framing |
| `account-data-management.css` | Account content/reset and data import/export/status UI |
| `settings-controls.css` | Settings controls and their existing responsive adjustments |
| `recipe-presentation.css` | Recipe detail/output actions, print settings, nutrition, and notes presentation |

### Former `recipe-workspace.css` contents

| Stylesheet | Main contents |
| --- | --- |
| `recipe-actions.css` | Recipe detail actions, markers, privacy, duplicate, and trash controls |
| `recipe-explorer.css` | Recipe list, Find Recipes, filters, columns, and explorer toolbar |
| `recipe-instruction-editor.css` | Instruction-step editing and its adjacent field styles |
| `recipe-form.css` | General recipe form fields and controls |
| `recipe-ingredient-editor.css` | Ingredient sets, rows, measurements, and editor reordering/mobile behavior |

### Former `recipe-media.css` contents

| Stylesheet | Main contents |
| --- | --- |
| `recipe-media.css` | Recipe summary/photo layout, gallery, and image viewer |
| `media-manager.css` | Recipe-photo and publication-cover management, crop editor, and media dialogs |
| `recipe-reader.css` | Recipe reading layout and rendered ingredient/instruction content |
| `recipe-scaling-and-references.css` | Scaling, references, and recipe-relationship controls |
| `recipe-instruction-display.css` | Rendered instruction details and associated responsive rules |
| `publication-actions.css` | Publication deletion/destination action styles currently in this source |
| `recipe-responsive-overrides.css` | Existing late responsive block that spans multiple feature areas |

### Former `publications-explorer.css` contents

| Stylesheet | Main contents |
| --- | --- |
| `recipe-print.css` | Recipe print rules currently at the start of this source |
| `publications-explorer.css` | Publication list, explorer, search/filter/sort, and publication-specific responsive behavior |
| `explorer-responsive.css` | Shared responsive adjustments for publication and recipe explorer controls |
| `publication-detail.css` | Publication detail/edit, recipe association, picker, and transfer UI |
| `recipe-query.css` | Recipe filter builder, advanced rules, and related history/explorer rules |

Keep the stylesheet imports in this exact order after `@import "tailwindcss";`:

1. `foundation.css`
2. `account-admin.css`
3. `account-data-management.css`
4. `settings-controls.css`
5. `recipe-presentation.css`
6. `recipe-actions.css`
7. `recipe-explorer.css`
8. `recipe-instruction-editor.css`
9. `recipe-form.css`
10. `recipe-ingredient-editor.css`
11. `recipe-media.css`
12. `media-manager.css`
13. `recipe-reader.css`
14. `recipe-scaling-and-references.css`
15. `recipe-instruction-display.css`
16. `publication-actions.css`
17. `recipe-responsive-overrides.css`
18. `recipe-print.css`
19. `publications-explorer.css`
20. `explorer-responsive.css`
21. `publication-detail.css`
22. `recipe-query.css`

## Implementation rules

- Split only at complete top-level CSS rule or at-rule boundaries. Never cut
  inside a selector block, `@media`, `@supports`, `@keyframes`, or `@page`
  block.
- Preserve the original source sequence across all 22 imports. Do not group
  files alphabetically or move a responsive/print rule earlier just because
  its selectors belong to a different feature.
- Do not rewrite selectors, declarations, comments, or media queries during
  the move. Keep responsive and print rules intact. Whitespace may be
  normalized at chunk boundaries so each standalone stylesheet has one final
  newline.
- Keep the mixed late responsive block in `recipe-responsive-overrides.css`
  for this behavior-preserving pass. Refactoring that block into individual
  feature files would be a separate cascade-sensitive change.
- Do not migrate global styles to CSS Modules or change component imports.
- Update only live product-document links that point to a moved stylesheet.
  Leave historical session traces and discussion records untouched.

## Execution checklist

- [x] Create the ordered stylesheet sections and update `globals.css`.
- [x] Verify concatenating each new section in import order reproduces the
  original rule text and order; only chunk-boundary whitespace may differ.
- [x] Update any live documentation links to moved stylesheets.
- [x] Run CSS diagnostics, Markdown lint, build, and `git diff --check`.
  Markdown lint still reports 8 unrelated errors in `decision-log.md` and
  existing workstream records; none are in files changed for this task.
- [ ] Run representative recipe and publication browser checks if the local
  application is available. The local `/recipes` route redirected to sign-in,
  so those authenticated screens could not be checked; sign-in was viewed at
  desktop and mobile viewport sizes.

## Design and behavior references

This organization does not override the visual contracts in the
[visual design guide](./visual-design.md) or the owning slice briefs,
including the [recipe editor](./slices/4-recipe-card-basics.md),
[ingredient rows](./slices/5-ingredient-rows.md),
[measurements](./slices/6-measurements.md),
[instructions](./slices/7-instructions-and-mentions.md),
[Library Explorer](./slices/10a-library-explorer.md),
[images](./slices/12-images.md),
[Find Recipes](./slices/17-find-recipes.md),
[public recipe and print layout](./slices/dlc/dlc-08-recipe-public-and-print-layout.md),
[advanced query rules](./slices/dlc/dlc-13-advanced-query-groups.md), and
[Settings tabs](./slices/dlc/dlc-32-settings-tabs.md).
