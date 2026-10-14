# Slice 14A: Settings and Personal Preferences

This slice adds the authenticated Settings destination and gives account unit
preferences a clear home. It manages the existing Volume and Weight system
defaults without adding a second preference store or changing recipe data.

## References

- [Delivery roadmap](../delivery-roadmap.md), Slice 14
- [First-draft specification](../first-draft-spec.md), Queries and Settings
- [Comprehensive reference, § 3.5: Unit display preferences](../comprehensive-reference.md#35-unit-display-preferences)
- [Comprehensive reference, § 8: Settings and taxonomies](../comprehensive-reference.md#8-settings-taxonomies-and-picklists)
- [Data model](../data-model.md), Configuration Boundaries
- [Visual design guide](../visual-design.md), Design Philosophy and Account menu
- [Decision log](../decision-log.md)
- Installed Next.js 16 documentation: Layouts and Pages, Authentication, and Server Actions

## Outcome

A signed-in person can open Settings from the private navigation, see the
account's Volume, Weight, and View defaults, and change each independently.
Settings presents them in a full-width, unframed Personal preferences section.
The three controls use the shared portal Picklist. Changes use the account's
owner-derived preference-update function and never overwrite another preference.
On mobile, Hand is a centered two-button preference that controls the compact
navigation order; it is intentionally absent on desktop.

## Scope

- Add `/settings` as an authenticated private-shell route.
- Add Settings to the desktop sidebar and mobile navigation.
- Show labeled Volume, Weight, and View defaults in the unframed Personal
  preferences section, without a Units heading.
- Use visibly labeled shared Picklist controls for US customary and Metric.
  Keep each trigger content-sized and stable when its selected value changes.
- Save a changed value immediately through the existing
  `update_account_unit_preferences` RPC and announce Saving, Saved, or an error.
- Remove the Units shortcut from shared navigation. Reuse the existing
  preference action and save status rather than adding a second preference
  implementation.
- Preserve the existing owner-derived authorization and restricted account
  column grants. No account ID is accepted from the client.

Picklist CRUD and ordering, ingredient catalog management, merge/delete
replacement flows, tags and their recipe/publication assignment, trusted
density, ingredient presentation, and mention-style preferences are outside
this first demonstration. They remain follow-on Settings domains for Slices
14B-14D, 15, and later work. Add each as a working section when its slice is
implemented; do not show empty sections or placeholder links in advance.

## Screen and interaction contract

- The page title is `Settings`, using the existing private-page title scale.
- The first section is `Personal preferences`, with a quiet divider. It contains
  labeled Volume, Weight, and View Picklists without a Units heading.
- Settings uses the wide private content area and unframed sections rather than
  a compact card or menu panel. Later management domains extend this page as
  real sections, without empty placeholders.
- Settings is the only entry point for changing account unit defaults. The
  private navigation does not contain a Units menu or shortcut.
- A Picklist change saves immediately. The unaffected dimension is omitted from
  the RPC update. A failed save restores the last saved value and presents an
  announced error without losing focus.
- The route follows the existing server-side `getUser()` check and redirects
  signed-out visitors to `/`. The server loads only the signed-in account's
  preference fields, including mobile hand preference.
- There are no destructive actions, confirmation dialogs, native file pickers,
  or staged drafts in this slice. Shared Picklist keyboard behavior is
  retained; changing a value is the commit action.

## Responsive and visual contract

- Follow the visual guide's pale paper and subtle green ruling, dark ink,
  muted supporting text, compact rules, and existing DM Sans / restrained
  Georgia hierarchy. Use no decorative panels, cards, gradients, or new palette.
- Use the wide private content area, with the preference fields in a wrapping
  two-column layout on desktop and stacked rows on narrow screens.
- Keep Picklist triggers content-sized and 36px high. Expand their mobile tap
  areas to 48px without changing their visible height. Keep the page free of
  horizontal overflow.
- Keep the desktop sidebar pinned while page content scrolls. Place Settings
  after Trash and immediately before Account in the utility links.
- On mobile, use compact icon-only navigation for Library, Search, Recipe Tin,
  Trash, Settings, and Account. The Hand preference defaults to Right and
  reverses this visual order; Left preserves the original order. Preserve
  descriptive accessible names and avoid a separate drawer or navigation gesture.
- Acceptance screenshots: desktop at 1280px wide and Fold 6 at the configured
  viewport, showing the wide unframed Settings section, current values, and the
  persistent navigation without overlap or horizontal scrolling.

## Test-first acceptance

Write the focused browser tests before production UI changes:

- Settings appears in desktop and mobile navigation and opens an authenticated
  page with a wide Personal preferences section and labeled Volume, Weight, and
  View Picklists.
- Signed-out access redirects to sign-in; a second account cannot read or change
  the first account's defaults.
- Changing Volume saves only Volume and preserves Weight; changing Weight saves
  only Weight and preserves Volume; View and Hand also save independently.
  Invalid RPC results retain the saved value and announce an error.
- No Units menu or shortcut remains in the shared navigation on desktop and
  mobile.
- Keyboard users can reach and operate both Picklists; focus remains
  visible, labels are programmatically associated, and the page passes axe.
- Chromium and Fold 6 checks confirm desktop navigation remains visible while
  content scrolls, Hand is hidden on desktop, mobile navigation remains
  available and reverses for Right, preference triggers have 48px hit areas,
  and the page has no horizontal overflow.

Run the focused Settings browser tests on Chromium and Fold 6, then unit tests,
typecheck, lint, and `git diff --check`. Do not run `npm run dev:local`; it
resets local Supabase data.

## Completion criteria

- The authenticated Settings route appears in the private navigation on
  desktop and mobile and uses the wide, unframed section layout.
- Both preference fields load from the signed-in account and save through the
  existing owner-derived RPC without changing the other dimension.
- Shared Picklists save and reload current values through the existing
  owner-derived RPC; no Units trigger remains in the navigation.
- Keyboard, accessibility, responsive-layout, and account-isolation acceptance
  checks pass on Chromium and Fold 6.
- The roadmap records Slice 14A separately from subsequent taxonomy, ingredient,
  and tag demonstrations; no unrelated schema or recipe behavior changes.
