# Recipe Box Comprehensive Reference Guide

## Authority and how to use this reference

This index and the nine topic pages in the
[comprehensive-reference/](./comprehensive-reference/) folder together form
the authoritative product reference for Recipe Box. The topic pages contain
the complete requirements; they are canonical parts of this guide, not
summaries. Other planning documents defer to this reference series and must be
corrected when they conflict with it.

Start with the [first-draft specification](./first-draft-spec.md) for a brief
orientation. Then use the page descriptions and detailed contents below to open
only the topic and sections relevant to the work at hand. Each topic page links
back here.

## Topic pages at a glance

| Page | Use it for |
| --- | --- |
| [Foundations and Delivery](./comprehensive-reference/00-foundations-and-delivery.md) — §§ 1, 14, 15, 16 | Product purpose and principles, technology and hosting architecture, deferred scope, and test-first delivery. |
| [Recipe Card and Metadata](./comprehensive-reference/01-recipe-card-and-metadata.md) — § 2 | Recipe identity, metadata fields, times, photos, entry presentation, and nutrition. |
| [Ingredients and Presentation](./comprehensive-reference/02-ingredients-and-presentation.md) — §§ 3, 4 | Ingredient rows, measurements, density, scaling, sets, portions, equivalents, reader modes, sorting, and reordering. |
| [Instructions and Links](./comprehensive-reference/03-instructions-and-links.md) — § 5 | Instruction authoring, mentions, recipe pairings, and recipe references. |
| [Publications and Search](./comprehensive-reference/04-publications-and-search.md) — §§ 6, 7 | Publications, the Recipe Tin, deletion and restore, recipe and publication search, and the source Library explorer. |
| [Settings and Taxonomies](./comprehensive-reference/05-settings-and-taxonomies.md) — § 8 | Picklists, ingredient catalog, tags, trusted densities, nutrition equivalents, preferences, Settings tabs, and account-menu destinations. |
| [Sharing and Accounts](./comprehensive-reference/06-sharing-and-accounts.md) — §§ 9, 10 | Privacy, URLs, public recipes, image delivery, abuse protection, authentication, invitations, roles, and administrator-managed updates. |
| [Import, Export, and History](./comprehensive-reference/07-import-export-and-history.md) — §§ 11, 12 | Backup bundles, export and import behavior, recovery boundaries, and forensic history. |
| [Interaction and Accessibility](./comprehensive-reference/08-interaction-and-accessibility.md) — § 13 | Desktop and mobile ergonomics, accessibility standards, accessible controls, ingredient editing, and private-shell navigation. |

## Detailed table of contents

### [Foundations and Delivery](./comprehensive-reference/00-foundations-and-delivery.md)

Product purpose and principles, technology and hosting architecture, deferred scope, and test-first delivery.

- [1. Product Vision and Paradigm](./comprehensive-reference/00-foundations-and-delivery.md#1-product-vision-and-paradigm)
  - [1.1 The Problem Being Solved](./comprehensive-reference/00-foundations-and-delivery.md#11-the-problem-being-solved)
  - [1.2 Core Architectural Philosophy](./comprehensive-reference/00-foundations-and-delivery.md#12-core-architectural-philosophy)
- [14. Technology Stack and Hosting Architecture](./comprehensive-reference/00-foundations-and-delivery.md#14-technology-stack-and-hosting-architecture)
- [15. Deferred Features Catalog](./comprehensive-reference/00-foundations-and-delivery.md#15-deferred-features-catalog)
- [16. Testability and test-first delivery](./comprehensive-reference/00-foundations-and-delivery.md#16-testability-and-test-first-delivery)

### [Recipe Card and Metadata](./comprehensive-reference/01-recipe-card-and-metadata.md)

Recipe identity, metadata fields, times, photos, entry presentation, and nutrition.

- [2. Recipe Card and Metadata](./comprehensive-reference/01-recipe-card-and-metadata.md#2-recipe-card-and-metadata)
  - [2.1 Metadata Fields Breakdown](./comprehensive-reference/01-recipe-card-and-metadata.md#21-metadata-fields-breakdown)
  - [2.2 Time Tracking and Overlapping Times](./comprehensive-reference/01-recipe-card-and-metadata.md#22-time-tracking-and-overlapping-times)
  - [2.3 Recipe Photos](./comprehensive-reference/01-recipe-card-and-metadata.md#23-recipe-photos)
  - [2.4 Recipe Metadata Entry Presentation](./comprehensive-reference/01-recipe-card-and-metadata.md#24-recipe-metadata-entry-presentation)
  - [2.5 Nutrition Presentation](./comprehensive-reference/01-recipe-card-and-metadata.md#25-nutrition-presentation)

### [Ingredients and Presentation](./comprehensive-reference/02-ingredients-and-presentation.md)

Ingredient rows, measurements, density, scaling, sets, portions, equivalents, reader modes, sorting, and reordering.

- [3. Ingredient Rows, Measurements, and Density](./comprehensive-reference/02-ingredients-and-presentation.md#3-ingredient-rows-measurements-and-density)
  - [3.1 Ingredient Row Structure](./comprehensive-reference/02-ingredients-and-presentation.md#31-ingredient-row-structure)
  - [3.2 Dual Measurement (Volume + Weight)](./comprehensive-reference/02-ingredients-and-presentation.md#32-dual-measurement-volume-weight)
  - [3.3 Trusted Ingredient Density](./comprehensive-reference/02-ingredients-and-presentation.md#33-trusted-ingredient-density)
  - [3.4 Scaling Math and Rounding Rules](./comprehensive-reference/02-ingredients-and-presentation.md#34-scaling-math-and-rounding-rules)
  - [3.5 Unit Display Preferences](./comprehensive-reference/02-ingredients-and-presentation.md#35-unit-display-preferences)
  - [3.6 Ingredient Sets](./comprehensive-reference/02-ingredients-and-presentation.md#36-ingredient-sets)
  - [3.7 Divided portions and Size](./comprehensive-reference/02-ingredients-and-presentation.md#37-divided-portions-and-size)
  - [3.8 Nutrition and Measure Equivalents](./comprehensive-reference/02-ingredients-and-presentation.md#38-nutrition-and-measure-equivalents)
- [4. Ingredient Presentation and Sorting](./comprehensive-reference/02-ingredients-and-presentation.md#4-ingredient-presentation-and-sorting)
  - [4.1 The Two Presentation Modes](./comprehensive-reference/02-ingredients-and-presentation.md#41-the-two-presentation-modes)
    - [A. Standard View (Amount-First)](./comprehensive-reference/02-ingredients-and-presentation.md#a-standard-view-amount-first)
    - [B. Ingredient-First View ("Mine")](./comprehensive-reference/02-ingredients-and-presentation.md#b-ingredient-first-view-mine)
  - [4.2 Ingredient Sorting Options](./comprehensive-reference/02-ingredients-and-presentation.md#42-ingredient-sorting-options)
  - [4.3 Manual Reordering](./comprehensive-reference/02-ingredients-and-presentation.md#43-manual-reordering)

### [Instructions and Links](./comprehensive-reference/03-instructions-and-links.md)

Instruction authoring, mentions, recipe pairings, and recipe references.

- [5. Instructions, Autocomplete, and Recipe Linking](./comprehensive-reference/03-instructions-and-links.md#5-instructions-autocomplete-and-recipe-linking)
  - [5.1 Instructions Editor and `#` Mentions](./comprehensive-reference/03-instructions-and-links.md#51-instructions-editor-and-mentions)
  - [5.2 Recipe-to-Recipe Links ("Pairs With")](./comprehensive-reference/03-instructions-and-links.md#52-recipe-to-recipe-links-pairs-with)
  - [5.3 References Section](./comprehensive-reference/03-instructions-and-links.md#53-references-section)

### [Publications and Search](./comprehensive-reference/04-publications-and-search.md)

Publications, the Recipe Tin, deletion and restore, recipe and publication search, and the source Library explorer.

- [6. Publications, Magazine Handling, and The Recipe Tin](./comprehensive-reference/04-publications-and-search.md#6-publications-magazine-handling-and-the-recipe-tin)
  - [6.1 Publication Types and Attributes](./comprehensive-reference/04-publications-and-search.md#61-publication-types-and-attributes)
  - [6.2 Magazine Titles, Recipe Locations, and Online URLs](./comprehensive-reference/04-publications-and-search.md#62-magazine-titles-recipe-locations-and-online-urls)
  - [6.3 Creation and Editing Workflows](./comprehensive-reference/04-publications-and-search.md#63-creation-and-editing-workflows)
  - [6.4 The Recipe Tin Collection](./comprehensive-reference/04-publications-and-search.md#64-the-recipe-tin-collection)
  - [6.5 Deletion Rules for Publications](./comprehensive-reference/04-publications-and-search.md#65-deletion-rules-for-publications)
  - [6.6 Trash, Restore, and Purge](./comprehensive-reference/04-publications-and-search.md#66-trash-restore-and-purge)
- [7. Queries, Search, and Library Explorer](./comprehensive-reference/04-publications-and-search.md#7-queries-search-and-library-explorer)
  - [7.1 Recipe and Publication Search and Filters](./comprehensive-reference/04-publications-and-search.md#71-recipe-and-publication-search-and-filters)
  - [7.2 Full-Text Search](./comprehensive-reference/04-publications-and-search.md#72-full-text-search)
  - [7.3 Source Library Explorer](./comprehensive-reference/04-publications-and-search.md#73-source-library-explorer)

### [Settings and Taxonomies](./comprehensive-reference/05-settings-and-taxonomies.md)

Picklists, ingredient catalog, tags, trusted densities, nutrition equivalents,
preferences, Settings tabs, and account-menu destinations.

- [8. Settings, Taxonomies, and Picklists](./comprehensive-reference/05-settings-and-taxonomies.md#8-settings-taxonomies-and-picklists)
  - [8.1 Centralized Picklist Management](./comprehensive-reference/05-settings-and-taxonomies.md#81-centralized-picklist-management)
    - [Ingredient catalog](./comprehensive-reference/05-settings-and-taxonomies.md#ingredient-catalog)
    - [Tags](./comprehensive-reference/05-settings-and-taxonomies.md#tags)
  - [8.2 Trusted Densities](./comprehensive-reference/05-settings-and-taxonomies.md#82-trusted-densities)
  - [8.3 Equivalents](./comprehensive-reference/05-settings-and-taxonomies.md#83-nutrition-and-measure-equivalents)
  - [8.4 Personal Preferences](./comprehensive-reference/05-settings-and-taxonomies.md#84-personal-preferences)
  - [8.5 Settings Tabs](./comprehensive-reference/05-settings-and-taxonomies.md#85-settings-tabs)
  - [8.6 Account menu destinations](./comprehensive-reference/05-settings-and-taxonomies.md#86-account-menu-destinations)

### [Sharing and Accounts](./comprehensive-reference/06-sharing-and-accounts.md)

Privacy, URLs, public recipes, image delivery, abuse protection,
authentication, invitations, roles, and administrator-managed updates.

- [9. Sharing, Privacy, URLs, and Image Delivery](./comprehensive-reference/06-sharing-and-accounts.md#9-sharing-privacy-urls-and-image-delivery)
  - [9.1 URL Structure and Hash IDs](./comprehensive-reference/06-sharing-and-accounts.md#91-url-structure-and-hash-ids)
  - [9.2 Privacy Toggle and HTTP Status Behavior](./comprehensive-reference/06-sharing-and-accounts.md#92-privacy-toggle-and-http-status-behavior)
  - [9.3 Public Recipe Experience](./comprehensive-reference/06-sharing-and-accounts.md#93-public-recipe-experience)
  - [9.4 Recipe duplication](./comprehensive-reference/06-sharing-and-accounts.md#94-recipe-duplication)
  - [9.5 Secure Image Delivery](./comprehensive-reference/06-sharing-and-accounts.md#95-secure-image-delivery)
  - [9.6 Abuse Protection](./comprehensive-reference/06-sharing-and-accounts.md#96-abuse-protection)
- [10. Authentication and Account Setup](./comprehensive-reference/06-sharing-and-accounts.md#10-authentication-and-account-setup)
  - [10.0 Role terminology and current implementation boundary](./comprehensive-reference/06-sharing-and-accounts.md#100-role-terminology-and-current-implementation-boundary)
  - [10.1 Email and Password Authentication](./comprehensive-reference/06-sharing-and-accounts.md#101-email-and-password-authentication)
  - [10.2 Social Authentication](./comprehensive-reference/06-sharing-and-accounts.md#102-social-authentication)
  - [10.3 Invite-Only Sign-Up](./comprehensive-reference/06-sharing-and-accounts.md#103-invite-only-sign-up)
  - [10.4 Slice 1 account boundary and deterministic auth testing](./comprehensive-reference/06-sharing-and-accounts.md#104-slice-1-account-boundary-and-deterministic-auth-testing)
  - [10.5 Slice 2 sign-up and invitation boundary](./comprehensive-reference/06-sharing-and-accounts.md#105-slice-2-sign-up-and-invitation-boundary)
  - [10.6 Administrator-managed Updates](./comprehensive-reference/06-sharing-and-accounts.md#106-administrator-managed-updates)

### [Import, Export, and History](./comprehensive-reference/07-import-export-and-history.md)

Backup bundles, export and import behavior, recovery boundaries, and forensic history.

- [11. Import, Export, and Backup Bundles](./comprehensive-reference/07-import-export-and-history.md#11-import-export-and-backup-bundles)
  - [11.1 ZIP Bundle Formats](./comprehensive-reference/07-import-export-and-history.md#111-zip-bundle-formats)
  - [11.2 Export Scopes](./comprehensive-reference/07-import-export-and-history.md#112-export-scopes)
  - [11.3 Import Conflict Resolution](./comprehensive-reference/07-import-export-and-history.md#113-import-conflict-resolution)
  - [11.4 Backup Reminder](./comprehensive-reference/07-import-export-and-history.md#114-backup-reminder)
  - [11.5 Export Delivery and Limits](./comprehensive-reference/07-import-export-and-history.md#115-export-delivery-and-limits)
  - [11.6 Recovery and reset boundaries](./comprehensive-reference/07-import-export-and-history.md#116-recovery-and-reset-boundaries)
- [12. Change History and Forensic Audit](./comprehensive-reference/07-import-export-and-history.md#12-change-history-and-forensic-audit)
  - [12.1 Purpose and Constraints](./comprehensive-reference/07-import-export-and-history.md#121-purpose-and-constraints)
  - [12.2 Captured Audit Events](./comprehensive-reference/07-import-export-and-history.md#122-captured-audit-events)

### [Interaction and Accessibility](./comprehensive-reference/08-interaction-and-accessibility.md)

Desktop and mobile ergonomics, accessibility standards, accessible controls, ingredient editing, and private-shell navigation.

- [13. Interaction, Keyboard-First Design, and Accessibility](./comprehensive-reference/08-interaction-and-accessibility.md#13-interaction-keyboard-first-design-and-accessibility)
  - [13.1 Desktop Ergonomics](./comprehensive-reference/08-interaction-and-accessibility.md#131-desktop-ergonomics)
  - [13.2 Mobile Kitchen Ergonomics](./comprehensive-reference/08-interaction-and-accessibility.md#132-mobile-kitchen-ergonomics)
  - [13.3 Accessibility Standards](./comprehensive-reference/08-interaction-and-accessibility.md#133-accessibility-standards)
  - [13.4 Accessible controls and ingredient editing](./comprehensive-reference/08-interaction-and-accessibility.md#134-accessible-controls-and-ingredient-editing)
  - [13.5 Private shell account menu](./comprehensive-reference/08-interaction-and-accessibility.md#135-private-shell-account-menu)

## Reorganization blueprint

See [the reference reorganization blueprint][reorganization-blueprint] for the
page map, authority model, and link-preservation rules.

[reorganization-blueprint]: ./comprehensive-reference-reorganization-blueprint.md
