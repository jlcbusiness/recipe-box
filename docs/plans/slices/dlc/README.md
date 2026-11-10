# Recipe Box DLC Roadmap

## Purpose

This roadmap organizes ideas in [the DLC brainstorm](../../discussion/dlc.md) and
remaining product deferrals in [the deferred-work inventory](../../discussion/later.md)
into candidate implementation slices. DLC numbers are independent of Slices
0–25. The order reflects dependencies and a sensible path through the work, not
priority or commitment. Phase order controls execution; DLC identifiers remain
stable even when a later-numbered repair belongs earlier. Each brief is a
planning boundary; expand and verify its product decisions before
implementation.

**Status:** Deferred items are indefinitely out of active plans and are
revisited only if a need arises. Canceled items are not active work unless
explicitly reopened.

## Delivered items excluded from new work

Equipment and managed recipe picklist values already exist in Settings, and
recipes can select existing values. DLC 25 delivered inline creation of
Equipment, Food Type, Meal Type, and Cuisine values from the recipe editor,
repaired the two-Enter commit and Tab/Arrow keyboard flow for ingredient rows
and measurements, and restored unordered and ordered Markdown list authoring
and rendering in instruction steps. Still-image upload and display exist; DLC
06 implements reversible framing for recipe photos and publication covers,
while retaining the existing single-image viewer without gallery navigation.

## Roadmap order

### Phase 0: Repair existing editor workflows

- **DLC 25 (implementation delivered):** [Recipe editor entry and picklist behavior](dlc-25-recipe-editor-entry-and-picklist-behavior.md)

### Phase 1: Navigation and authoring foundations

- **DLC 01 (delivered):** [Navigation and picklist typeahead](dlc-01-navigation-and-picklist-typeahead.md)
- **DLC 02 (delivered):** [Recipe reader and measurement polish](dlc-02-reader-and-measurement-polish.md)
- **DLC 03:** [Ingredient sets](dlc-03-ingredient-sets.md)
- **DLC 04:** [Ingredient amount semantics and references](dlc-04-ingredient-amounts-and-references.md)
- **DLC 05:** [Instruction authoring and references](dlc-05-instruction-authoring-and-references.md)

### Phase 2: Media and recipe presentation

- **DLC 06:** [Image framing and gallery](dlc-06-image-framing-and-gallery.md)
- **DLC 07:** [Video and animated media](dlc-07-video-and-animated-media.md)
- **DLC 08:** [Recipe reading, public, and print layout](dlc-08-recipe-public-and-print-layout.md)
- **DLC 09:** [Standalone recipe exports](dlc-09-standalone-recipe-exports.md)

### Phase 3: Recipe knowledge and discovery

- **DLC 10:** [Recipe score, stars, and hearts](dlc-10-ratings-and-favorites.md)
- **DLC 11:** [Yield and servings](dlc-11-yield-and-servings.md)
- **DLC 12:** [Recipe nutrition](dlc-12-recipe-nutrition.md)
- **DLC 13 (locally delivered):** [Advanced Rules expressions](dlc-13-advanced-query-groups.md)
- **DLC 14:** [Saved views](dlc-14-saved-views.md)
- **DLC 15 (deferred):** [Expanded recipe search](dlc-15-expanded-recipe-search.md)
- **DLC 16 (deferred):** [Ingredient density profiles](dlc-16-ingredient-density-profiles.md)

### Phase 4: Cooking, history, and operations

- **DLC 17 (canceled):** [Full-screen cooking mode](dlc-17-full-screen-cooking-mode.md)
- **DLC 18 (deferred):** [Recipe and catalog history](dlc-18-recipe-and-catalog-history.md)
- **DLC 19 (canceled):** [History bundle support](dlc-19-history-bundle-support.md)
- **DLC 20 (deferred):** [Expanded offline use](dlc-20-expanded-offline-use.md)
- **DLC 21 (canceled):** [App-controlled installation prompt](dlc-21-installation-prompt.md)
- **DLC 22 (deferred):** [Configurable Trash retention](dlc-22-configurable-trash-retention.md)
- **DLC 23 (deferred):** [Households and account roles](dlc-23-households-and-account-roles.md)
- **DLC 24:** [Account content reset](dlc-24-account-content-reset.md)

### Phase 5: Recipe and document-output follow-up

- **DLC 26 (delivered):** [Recipe-editor save shortcut](dlc-26-recipe-editor-save-shortcut.md)
  adds `Ctrl+S` (and `Cmd+S` on macOS) for create and edit forms. Shortcut
  saves stay in the editor; the visible Save button keeps its current behavior.
- **DLC 27 (candidate):** [Ingredient sets and instruction groups](dlc-27-ingredient-instruction-groups.md)
  will define how ingredient sets pair with instruction groups and how those
  sections flow through print and standalone exports.
- **DLC 29 (delivered):** [Recipe-specific unit display](dlc-29-recipe-specific-unit-display.md)
  adds a `Recipe` choice to the independent Volume and Weight preferences so
  private reading and printing preserve each saved measurement's unit system
  while allowing same-system simplification.

### Phase 6: Administration and release operations

- **DLC 28 (implemented):** [Admin Updates](dlc-28-admin-updates.md) adds an
  administrator-only Updates tab for globally shared, individually managed
  Fix and Feature entries with versioned completion, archive/restore, and
  append-only audit history.

### Phase 7: Public sharing and Recipe Tin

- **DLC 30 (implemented; production 500 resolved):**
  [Safe public recipe publishing](dlc-30-safe-public-recipe-publishing.md)
  makes recipes private by default, confirms the copy consequences when
  sharing a private link, and adds a public username and guarded photo delivery.
- **DLC 31 (delivered; depends on DLC 30):**
  [Save public recipe copies](dlc-31-save-public-recipe-copies.md) saves the
  public allow-listed recipe and photos as a private Recipe Tin copy with a
  protected, titled source reference and schema-v10 import/export support.

## Sequencing notes

- DLC 25's implementation establishes the current recipe-editor baseline for
  inline picklist creation, ingredient keyboard entry, and instruction lists.
  Its remaining acceptance-test coverage gaps are recorded in the brief.
- Build ingredient sets (DLC 03) before group-aware amounts and references
  (DLC 04), then add structured instruction references (DLC 05).
- Extend media (DLC 06–07) before setting the shared reading, public, and print
  contract (DLC 08), then implement portable exports (DLC 09).
- Define Advanced Rules expressions (DLC 13) before saved views (DLC 14); reuse that query
  model for expanded search (DLC 15) where appropriate.
- Define richer serving semantics (DLC 11) before nutrition calculations
  (DLC 12). Density profiles (DLC 16) are independent.
- DLC 19 history bundle support is canceled. If DLC 20 offline use or DLC 23
  household collaboration is rescheduled, each requires a focused architecture
  proof first.
- DLC 27 depends on ingredient sets (DLC 03), instruction authoring (DLC 05),
  and the paginated document-output contract (DLC 09); its relationship and
  editor behavior must be resolved in its brief before implementation.
- DLC 28 depends on the admin authorization boundary from Slice 2 and the
  Markdown authoring behavior from DLC 05. It is independent of DLC 26 and 27.
- DLC 24 means erasing account content while retaining authentication. Full
  account deletion is a separate, existing guarded administrative capability.
- DLC 31 depends on DLC 30 so viewers are told that publishing permits copies
  before a Save action exists. Copies remain private and retain protected source
  attribution.

## Existing deferrals not assigned a DLC brief

Acceptance and verification tasks remain in the [deferred-work inventory](../../discussion/later.md).
They are not product slices or scheduled work.
