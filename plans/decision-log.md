# Recipe Box Decision Log

> **Reference Note:** For full context and comprehensive background on each
> decision, see [plans/comprehensive-reference.md](comprehensive-reference.md).

## Purpose

This log records high-impact decisions and their rationale. It is not a copy of
the product specification or a task list. The canonical behavior remains in
`comprehensive-reference.md`; the discussion folder remains historical context.

| Decision | Rationale |
| -------- | --------- |
| Use Publication in the UI. | Book is too narrow for books, magazine issues, and websites. |
| Use Recipe Tin for recipes without a primary publication. | It gives original and unparented recipes a permanent, meaningful home. |
| One ingredient row owns its measurements. | Separate visual ingredient and amount columns must not lose row alignment. |
| Keep volume and weight together when both are known. | A recipe may display `1 cup / 120 g` while retaining both source values. |
| Trusted density is Settings-only. | Volume-to-weight conversion must be explicit and ingredient-specific. |
| Main ingredients are row flags. | Classification stays attached to the actual recipe ingredient. |
| Verdict remains one holistic configurable picklist. | Judgment and practical repeat likelihood are intentionally intertwined. |
| Individual magazine issues are publications. | The issue is the relevant origin even when a recipe also has an online site. |
| Public URLs remain stable when privacy changes. | A Private toggle changes access, not identity or the shared link. |
| Private and trashed links return 404; permanently purged recipes return 410. | These HTTP semantics avoid misusing temporary-service errors and keep private/trashed recipes opaque. |
| History is forensic only in the first release. | Audit value is useful now; version restore adds avoidable complexity. |
| Deliberate save only; no autosave. | Avoids runaway history events and mid-edit version increments; history logs on explicit save. |
| Delivery is vertical slices, not one full implementation plan. | Each slice can be tested and adjusted before later complexity is added. |
| Testability is a non-negotiable architecture constraint, and automated tests are written before production code. | Every requirement needs deterministic automated acceptance coverage; test-first delivery prevents untestable designs and makes demonstrations repeatable. |
| The local test gate uses Vitest, Playwright with Chromium, and axe. | One reproducible command covers unit behavior, browser workflows, and automated accessibility without a hosted service. |
| Domain seed records are introduced with the schema that defines them, not in the schema-free baseline. | Avoids a throwaway fixture table and keeps local migrations representative of the real product model. |
| The Recipe Box Supabase stack uses ports 55420–55429. | The machine already runs other Supabase projects on the default and 654xx ranges; a separate range avoids disrupting them. |
| Use native HTML by default, React Aria Components for custom controls, and AG Grid Community only for the editable ingredient grid. | This keeps ordinary controls semantic, supplies accessible keyboard behavior for custom widgets, and provides proven cell navigation/editors without Enterprise licensing; custom grid behavior remains covered by automated tests. |
| The comprehensive reference is the master document; the spec summarizes it and defers to it. | One authority prevents drift, while the shorter spec stays the first thing read. |
| Deleted items go to the trash and are purged after 30 days. "Archive" is not used. | One clear lifecycle: delete, restore within 30 days, or purge. |
| Count has no unit. | A count is how many of the ingredient; a 14 oz can is entered as 14 oz. |
| Informal is a fifth quantity type with Settings-managed unit words (bunch, sprig, clove). | Non-standard measures need a unit word but must never convert. |
| Changing State clears Verdict, Enthusiasm, Occasion detail, and Reason. | A new state means a new reaction, so stale answers must not linger. |
| Unit display uses a default system per dimension, with per-ingredient view-time overrides. | Readers choose US customary or metric for volume and weight, and can still switch one ingredient. |
| Magazine recipes use a `+ Site` button for a secondary Site listing. | The recipe's online URL lives with the site while the issue stays primary. |
| Instructions and notes are markdown, and `#` triggers ingredient mentions on every platform. | Phones lack a convenient non-alphanumeric key, and `#` is a familiar convention. |
| Ingredients are managed with the other picklists and require a replacement when deleted. | A recipe row cannot exist without an ingredient. |
| Version restore is excluded; history is forensic only. | Restore adds snapshots and transactional complexity. |
| Ingredient-first is a viewer preference; Standard reads Amount, Ingredient, Preparation. | Recipe content stays stable while presentation suits the reader. |
| Production sign-up is invite-only; development is open. | Limits abuse and storage cost for a personal app. |
| Each account uses exactly one sign-in method. | Avoids identity-linking ambiguity and unverified-email takeover risk. |
| Invites are emailed, and accepting one verifies the email; there is no skip option. Open development sign-up has no verification. | The invite email already proves the mailbox, and tests stay frictionless. |
| Admin is an account flag; production starts with a pre-created admin invite for the owner's email. | Gives invites an owner without a circular dependency or a claimable first account. |
| Tags are deferred to the settings/taxonomy slice. | Keeps early recipe, publication, and query slices lean; tags are added once taxonomy management exists. |
| Development is entirely local; going online is the last slice, documented in the README. | Everything is tested before any hosted account or cost exists. |
| Backups are the app's own ZIP export; Supabase backups are not used. | The owner trusts and understands export and import. |
| Settings shows the last export date and a reminder after 30 days. | Export is the only backup, so forgetting it is the main risk. |
| Every picklist is seeded from the documented examples; Specific occasion is protected. | A usable start, while the value that reveals Occasion Details cannot be removed. |
| The first release has one light theme. | Dark theme is deferred to avoid doubling visual verification. |

## Recording New Decisions

Add a decision only when it changes data ownership, public behavior, a future
migration, security, a cross-feature rule, or the delivery roadmap. Link the
relevant discussion or slice brief when helpful.
