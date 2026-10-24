# Deferred Work Inventory

This inventory consolidates work explicitly deferred by the 36 slice briefs (Slices 0–25) and not delivered by a later slice. It separates remaining product capabilities from acceptance and verification work. Inclusion is not a priority or commitment; the linked briefs remain the source of requirements.

## Product work still open

### Accounts and administration

- Add household collaboration, role types beyond Owner, Admin, and Member, and a dedicated invitation-revocation control beyond deleting an invited account. ([Slice 2](../slices/2-invites-and-admin.md), [Slice 25](../slices/25-go-online.md), [admin action](../../../src/app/admin/actions.ts), [admin controls](../../../src/app/admin/admin-controls.tsx), [admin action tests](../../../tests/unit/admin-actions.test.tsx))

### Search and saved discovery

- Implement named or pinned saved views with creation, duplication, navigation entries, lifecycle management, and restoration of publication scope. ([Slices 10A](../slices/10a-library-explorer.md), [18](../slices/18-explorer-state.md), [19](../slices/19-advanced-queries-and-saved-views.md))
- Add a query builder for nested AND/OR groups and arbitrary clause grouping, along with query explanations and advanced query serialization. ([Slices 17](../slices/17-find-recipes.md), [18](../slices/18-explorer-state.md), [19](../slices/19-advanced-queries-and-saved-views.md))
- Add ingredient-alias search, typo-tolerant or fuzzy/infix matching, OCR, and recipe Reference search; implement public recipe search and public search documents. ([Slice 17](../slices/17-find-recipes.md))
- Add star ratings, a separate favorite flag, and a persistent favorites list; the Verdict value “Favorite” does not provide these capabilities. ([Slice 19](../slices/19-advanced-queries-and-saved-views.md))

### Recipe, reader, and media

- Add a recipe-editor save shortcut: `Ctrl+S` (`Cmd+S` on macOS) invokes the
	existing explicit Save recipe flow and its validation/error handling; this
	does not introduce autosave. Planned as DLC 26 in the [DLC roadmap](../slices/dlc/README.md).
- Introduce a dedicated Yield/Servings model beyond the numeric `serves` value used for scaling. ([Slice 4](../slices/4-recipe-card-basics.md), [Slice 13](../slices/13-scaling-and-unit-conversion.md))
- Extend density support with multiple or context-dependent profiles per ingredient, temperature/pressure/packing corrections, derivation for Count/Things/Feel, automatic updates to saved recipe quantities when density changes, and density-derived conversion on public or printed recipes. ([Slice 15](../slices/15-trusted-density.md))
- Build a full-screen or navigation-replacing cooking experience beyond the current temporary reader mode. ([Slice 16](../slices/16-cooking-views.md))
- Add a full-screen image gallery/lightbox, video, and animated-image support. Reversible image framing is delivered separately in [DLC 06](../slices/dlc/dlc-06-image-framing-and-gallery.md); navigable gallery behavior remains deferred. ([Slice 12](../slices/12-images.md))
- Add instruction-step sorting controls beyond manual reordering. ([Slices 7](../slices/7-instructions-and-mentions.md), [7.5](../slices/7.5-reorder-interaction-polish.md))
- Add configurable Trash retention periods. ([Slices 8](../slices/8-trash-restore-and-print.md), [10B](../slices/10b-publication-deletion-and-restore.md))
- Implement application-generated PDF export beyond browser-native Print-to-PDF. ([Slices 8](../slices/8-trash-restore-and-print.md), [20](../slices/20-export.md))

### History, backup, and offline use

- Add the ability to restore recipes or publications to earlier versions, search or filter event history, and browse catalog history. ([Slice 23](../slices/23-history-viewer.md))
- Support exporting forensic history in ZIP bundles and importing it into another account; history is currently excluded from both bundle formats. ([Slices 20](../slices/20-export.md), [21](../slices/21-import.md), [23](../slices/23-history-viewer.md))
- Expand offline support to sign-in, editing and saving, publication details, Find/search, history, public pages, private photos, and background synchronization. Current support is limited to cached recipe details and their local index. ([Slice 24](../slices/24-install-and-offline.md))
- Add an app-controlled install prompt beyond the browser's supported installation UI. ([Slice 24](../slices/24-install-and-offline.md))

## Acceptance and verification still open

- Run the production first-admin bootstrap flow and verify first-admin access. ([Slice 25](../slices/25-go-online.md))
- Complete iOS verification for install/offline behavior, wake lock, camera, and touch autocomplete. ([Slices 24](../slices/24-install-and-offline.md), [25](../slices/25-go-online.md))
- Record a successful scheduled production media-cleanup invocation. The daily 04:00 UTC schedule is configured; do not use a manual production invocation as a substitute without explicitly accepting its cleanup effects. ([Slice 25](../slices/25-go-online.md))
- Add targeted database assertions for every rejected publication/location combination and for publication assignment values in recipe-history snapshots. These are test gaps, not missing runtime constraints. ([Slice 9](../slices/9-publications-and-recipe-tin.md))

## Out of scope

The slice briefs do not assign future implementation work for automated CI or migration deployment on every Git push, support for multiple deployment environments, or requiring a custom domain for the single-owner deployment. ([Slice 25](../slices/25-go-online.md))
