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

- **DLC 10:** [Ratings and favorites](dlc-10-ratings-and-favorites.md)
- **DLC 11:** [Yield and servings](dlc-11-yield-and-servings.md)
- **DLC 12:** [Recipe nutrition](dlc-12-recipe-nutrition.md)
- **DLC 13:** [Advanced query groups](dlc-13-advanced-query-groups.md)
- **DLC 14:** [Saved views](dlc-14-saved-views.md)
- **DLC 15:** [Expanded recipe search](dlc-15-expanded-recipe-search.md)
- **DLC 16:** [Ingredient density profiles](dlc-16-ingredient-density-profiles.md)

### Phase 4: Cooking, history, and operations

- **DLC 17:** [Full-screen cooking mode](dlc-17-full-screen-cooking-mode.md)
- **DLC 18:** [Recipe and catalog history](dlc-18-recipe-and-catalog-history.md)
- **DLC 19:** [History bundle support](dlc-19-history-bundle-support.md)
- **DLC 20:** [Expanded offline use](dlc-20-expanded-offline-use.md)
- **DLC 21:** [App-controlled installation prompt](dlc-21-installation-prompt.md)
- **DLC 22:** [Configurable Trash retention](dlc-22-configurable-trash-retention.md)
- **DLC 23:** [Households and account roles](dlc-23-households-and-account-roles.md)
- **DLC 24:** [Account content reset](dlc-24-account-content-reset.md)

### Phase 5: Recipe-editor workflow follow-up

- **DLC 26 (planned):** Add `Ctrl+S` (and `Cmd+S` on macOS) to invoke the
  explicit Save recipe flow, reusing its validation and error handling without
  introducing autosave. A focused brief is still needed.

## Sequencing notes

- DLC 25's implementation establishes the current recipe-editor baseline for
  inline picklist creation, ingredient keyboard entry, and instruction lists.
  Its remaining acceptance-test coverage gaps are recorded in the brief.
- Build ingredient sets (DLC 03) before group-aware amounts and references
  (DLC 04), then add structured instruction references (DLC 05).
- Extend media (DLC 06–07) before setting the shared reading, public, and print
  contract (DLC 08), then implement portable exports (DLC 09).
- Define query groups (DLC 13) before saved views (DLC 14); reuse that query
  model for expanded search (DLC 15) where appropriate.
- Define richer serving semantics (DLC 11) before nutrition calculations
  (DLC 12). Density profiles (DLC 16) are independent.
- History portability follows history restoration and browsing. Offline editing
  and household collaboration require focused architecture proofs before
  implementation planning is complete.
- DLC 24 means erasing account content while retaining authentication. Full
  account deletion is a separate, existing guarded administrative capability.

## Existing deferrals not assigned a DLC brief

Acceptance and verification tasks remain in the [deferred-work inventory](../../discussion/later.md).
They are not product slices or scheduled work.
