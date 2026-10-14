# Recipe Box Design Philosophy

Recipe Box is a private culinary archive for collecting recipes and
publications, preserving where recipes came from, and returning to them in the
kitchen. Its paper-and-ink surface gives the archive a quiet identity; it is
not a vintage costume, a feed, or a generic dashboard.

This document is the durable product-design authority. The
[visual design guide](visual-design.md) records verified, slice-specific screen
and interaction contracts.

## Product character

Keep the Library, Recipe Tin, recipe reading and editing, shared vocabularies,
and personal preferences recognizable as distinct jobs within one visual
language. Cooking informs readability and touch decisions, but planned cooking
features are never described as shipped behavior.

## Principles

- **Lead with the record.** Make the recipe, publication, or collection the
  visual anchor. Keep navigation and routine actions available without letting
  application chrome compete with the content.
- **Keep provenance close.** Place a recipe's publication, citation, or source
  link near its identity without confusing a publication with the recipe.
- **Make density legible.** Use compact aligned lists, tables, and metadata for
  comparison, while leaving meaningful values room to read.
- **Show structure when editing; use natural language when reading.** Forms may
  expose measurements, relationships, and provenance as controls. Reading
  turns those records into familiar cooking language.
- **Make state and consequence visible.** Draft, saved, derived, overridden,
  selected, primary, and destructive states must be distinguishable without
  relying on color or suggesting an unsaved change has persisted.
- **Keep temporary state temporary.** Make the persistence scope of preferences,
  recipe data, and reader-only state clear. A temporary presentation, sort, or
  cooking check-off must not silently update the recipe.
- **Keep personal metadata lightweight.** Tags are a flat reusable descriptive
  layer, not hierarchy or workflow state.
- **Preserve user agency.** Calculations and conversions are explicit,
  understandable, and correctable. Never silently replace a saved measurement
  or hide whether a value was derived or entered by the person.
- **Treat device capabilities as enhancements.** An unavailable or denied
  optional API never blocks the primary task; report its actual state.
- **Prefer continuity with purpose.** Reuse spacing, typography, action
  placement, and control behavior across related tasks. Give imagery or a
  distinct treatment a role only when it helps identify content or complete an
  action.

## Visual language

Use the light paper surface, subtle green ruling, and dark readable ink as a
restrained foundation. Typography, alignment, and whitespace establish
hierarchy; color reinforces meaning but never carries it alone. Use leaf for
constructive or source context, tomato for destructive or warning states, navy
for structural emphasis, and gold for visible keyboard focus.

Use DM Sans Variable for interface copy and controls. A restrained Georgia serif
may distinguish page titles or compact editorial values such as density
expressions; keep serif styling out of dense controls. Favor crisp geometry,
restrained borders, and shadows only where an overlay needs separation. The
ruled-paper texture is quiet surface detail, not an excuse for gradients, glass
effects, ornamental shapes, or nested cards.

Recipe photos and publication covers are informative content. Show actual
imagery when it identifies a record, preserve useful content, and keep editing
affordances visually distinct from the image.

## Information hierarchy and interaction

Let recipe and publication names lead. Align state, opinion, source, and other
secondary facts for scanning and comparison. Fit controls and columns to their
content, let related fields wrap, and give long names and URLs usable room.
Use semantic tables or lists for repeated records; reserve cards for discrete
objects whose boundary helps, such as publication covers in a grid.

Keep routine actions near their object and never make an essential action
hover-only. Use visible labels, text for consequential save and delete actions,
and familiar icons only when they have accessible names, visible focus, and a
tooltip when clarification helps. Distinguish canceling from deleting and
staged changes from immediate ones. Make confirmation, progress, success, and
recoverable errors clear, preserving drafts where correction is needed.

Menus and popovers are anchored, viewport-bounded, dismissible, and
keyboard-operable. Selection and focus do not rely on color alone. Focus order,
screen-reader status, contrast, reduced motion, and touch targets are part of
the interaction, not a finishing pass.

## Responsive composition

Desktop supports sustained organization and comparison through aligned,
data-dense layouts. Mobile is a distinct use context, not a shrunken desktop:
keep navigation compact, recompose editing into focused interactions, and keep
dialogs and popovers within the viewport while preserving task order and
meaning. Keep visible controls compact where density matters while preserving
generous touch targets. Prevent page-level horizontal scrolling, overlap, and
layout shifts at every size.

Kitchen-facing work accommodates interruption, glare, and one-handed use as it
ships. Do not present planned cooking behavior as current.

## Avoid

Avoid marketing-page composition, feature narration, decorative imagery,
faux-vintage kitchen props, generic dashboard grids, ornamental gradients,
glass effects, bokeh, and floating decorative shapes. Avoid dense field walls,
repeated cards around ordinary content, oversized gutters, arbitrary equal-width
controls, and text that repeats what the interface already communicates.

Do not crop meaningful recipe imagery merely to fill a slot, use color as the
only signal for state or importance, hide actions on hover, omit labels, shrink
touch targets, or add motion that distracts from reading or shifts layout.

## Unspecified details

Choose the smallest clear pattern that supports the task and fits established
product behavior. Check it with realistic content on desktop and mobile. A
refinement succeeds only when it preserves information hierarchy, data meaning,
keyboard and pointer operation, touch use, and assistive-technology behavior.
