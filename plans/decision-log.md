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
| Slice 1 uses a minimal Account record as the first owner-scoped RLS and storage resource; tests provision local Auth users directly. | Account isolation can be proven without inventing recipe schema, and direct local setup makes fixtures deterministic. This does not alter the product sign-up policy: Slice 2 owns invitations, admins, production restrictions, and one-provider enforcement. |
| Supabase Auth is the source of truth for email invitations; Account admin and sign-in-method fields are writable only by trusted server-side code. | Native Auth supplies email binding, single-use tokens, and configured expiry. Column privileges prevent a user from self-promoting or changing their provider; the secret key remains server-only. |
| Slice 2 implements open local email/password sign-up and email/password invitations; Google identity linking is validated before OAuth is enabled in Slice 25. | Local tests need no hosted provider, and one method is immutable for each account. Supabase may link same-email identities, so Google must not be enabled until the provider-conflict path is tested. |
| Next.js authentication uses Supabase SSR cookie clients and the Next.js proxy for session refresh. | Request-scoped cookies and verified Auth claims avoid custom session formats and prevent protected content from trusting unverified browser session data. |
| The Recipe Box Supabase stack uses ports 55420–55429. | The machine already runs other Supabase projects on the default and 654xx ranges; a separate range avoids disrupting them. |
| Use native HTML by default, React Aria Components for custom controls, and AG Grid Community only for the editable ingredient grid. | This keeps ordinary controls semantic, supplies accessible keyboard behavior for custom widgets, and provides proven cell navigation/editors without Enterprise licensing; custom grid behavior remains covered by automated tests. |
| The comprehensive reference is the master document; the spec summarizes it and defers to it. | One authority prevents drift, while the shorter spec stays the first thing read. |
| Deleted items go to the trash and are purged after 30 days. "Archive" is not used. | One clear lifecycle: delete, restore within 30 days, or purge. |
| Count has no unit. | A count is how many of the ingredient; a 14 oz can is entered as 14 oz. |
| Informal is a fifth quantity type with Settings-managed unit words (bunch, sprig, clove). | Non-standard measures need a unit word but must never convert. |
| Changing State clears Verdict, Enthusiasm, Occasion detail, and Reason. | A new state means a new reaction, so stale answers must not linger. |
| Unit display uses a default system per dimension, with per-ingredient view-time overrides. | Readers choose US customary or metric for volume and weight, and can still switch one ingredient. |
| Magazine recipes use a `+ Site` button for a secondary Site listing. | The recipe's online URL lives with the site while the issue stays primary. |
| Instructions and notes are Markdown; Tiptap 3.31.4 handles editing, and confirmed `#` mentions serialize as `[[ingredient:<stable-id>|<slug>]]`. | The proof passed keyboard selection, Escape-to-plain-text, new-mention insertion, Markdown/plain-text round-trip, and mobile accessibility. The Markdown extension is early release, so the product editor must keep parser/serializer tests. |
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
| New recipes default to Want to try; State, its active response, and optional integer Serves share the row below Name. | The most common capture path is considering a recipe; State remains visible and editable rather than silently hidden in secondary metadata, while its response and serving count stay visually attached. |
| Recipe metadata uses content-sized controls and flex-wrap rows, not a field grid. | Compact controls preserve scannability; widths follow the longest option or useful text length, fields wrap naturally, and time inputs fit their labels/value with 8px gaps. |
| Multi-picklists are dropdown menus with stable-width triggers, checkmark-only selected options, and pale green bold emphasis. | Selection must read as an item choice, not browser text selection or a checklist; the checkmark keeps selection clear without relying on color. |
| Verdict order places Specific occasion immediately before Once-a-year-rich and So-so. | Occasion context and its related cadence options are adjacent during entry. |
| Recipe Tin lists replace Last saved with Opinion (active Enthusiasm, Verdict, or Reason); mobile shows only Name and Opinion. | The list surfaces the recipe owner's current response and keeps the small-screen view focused on identification and decision. |
| Recipe detail uses State/response, Serves, Total Time, Equipment, a dedicated desktop classification row, remaining times, and Notes; mobile Edit sits beside the title. | View mode prioritizes serving and total duration before secondary classification, while keeping the title action compact on small screens. |
| Serves is one optional positive integer at the end of the State row, with Equipment immediately after it; Yield is removed. | A single count of people is simpler to capture and scale than separate serving and free-text yield fields, while keeping related capture fields together. |
| Recipe detail uses content-sized flex-wrap metadata like the edit form, ordered State/response, Serves, Equipment, classification, times, and Notes. | The same field order and wrapping behavior make entering and scanning metadata predictable across viewports. |
| Single- and multi-picklists use identical label typography and regular-weight trigger text; Reason matches the adjacent picker height. | Equal label size and control weight avoid visual misalignment; matching Reason height preserves a coherent tap and scan rhythm. |
| The mobile `Σ` control has a compact visible 30px square inside a 48px hit target. | The control stays visually light without sacrificing touch accessibility. |
| Serves text is centered; its field is 36px high on desktop and 48px on mobile. | Centering the count improves scanability, while the mobile field aligns with the touch-sized picklist triggers. |
| The desktop Edit control is 36px tall; the mobile “Edit” control is 32px tall, 18px small caps, and aligned to the right edge of the title row. | The desktop action keeps its right-side position while the mobile title row uses the available width without moving the action beneath the name. |
| Desktop Recipe Tin content grows by about 192px, to 1172px for the list and 1012px for detail metadata. | The existing centered layout remains, with more room for the list and recipe fields on wide screens. |
| The shared account menu sits at the bottom of desktop navigation and appears as a circular initials control on mobile. | One account-options menu works consistently across the private shell while using space appropriate to each layout. |

## Recording New Decisions

Add a decision only when it changes data ownership, public behavior, a future
migration, security, a cross-feature rule, or the delivery roadmap. Link the
relevant discussion or slice brief when helpful.
