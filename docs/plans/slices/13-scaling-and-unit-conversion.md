# Slice 13: Scaling and Unit Conversion

This brief defines read-time recipe scaling, within-dimension unit conversion,
and account defaults for volume and weight display systems. Recipe measurements
remain unchanged; conversion never crosses between volume and weight.

## References

- [Delivery roadmap](../delivery-roadmap.md), slice 13
- [First-draft specification](../first-draft-spec.md), Ingredients and Views
- [Comprehensive reference, § 3: Ingredients and measurements](../comprehensive-reference.md#3-ingredient-rows-measurements-and-density)
- [Comprehensive reference, § 3.5: Unit display preferences](../comprehensive-reference.md#35-unit-display-preferences)
- [Comprehensive reference, § 4: Ingredient presentation and sorting](../comprehensive-reference.md#4-ingredient-presentation-and-sorting)
- [Comprehensive reference, § 8.3: Personal preferences](../comprehensive-reference.md#83-personal-preferences)
- [Comprehensive reference, § 13: Accessibility](../comprehensive-reference.md#13-interaction-keyboard-first-design-and-accessibility)
- [Comprehensive reference, § 16: Testability](../comprehensive-reference.md#16-testability-and-test-first-delivery)
- [Data model boundary](../data-model.md)
- [Visual design guide](../visual-design.md)
- [Decision log](../decision-log.md)
- Installed Next.js 16 documentation for Server and Client Components and Server Actions under `node_modules/next/dist/docs/`
- Supabase PostgreSQL functions and row-level security documentation
- [NIST Guide to the SI, Appendix B.9: Conversion factors by quantity](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9)

## Outcome

A reader can scale an active recipe by target servings, multiplication, or
division; convert volume and weight independently; and override a displayed
unit for one ingredient without changing the saved recipe. Signed-in readers
can set separate volume and weight defaults from a compact navigation-menu
control. Printing reflects the current scale, converted units, and overrides.

## Decisions

- Scaling and unit conversion are derived view state. They never update recipe
  measurements, recipe servings, recipe versions, or recipe history.
- Target servings are a positive whole number and are available only when the
  recipe has a positive base `serves` value. Their multiplier is target
  servings divided by base servings. Multiplication accepts a positive integer
  or decimal; division accepts a positive integer divisor.
- Scale both endpoints of numeric ranges. Scale Volume, Weight, Count, and
  Things amounts. Keep Feel phrases and all unmeasured values unchanged.
- Preserve full precision in calculations. Format US customary amounts with
  common fractions (denominators 2, 3, 4, and 8) when within 0.03; otherwise
  show at most two decimal places. Format metric amounts as decimals with at
  most two decimal places. Do not display zero or negative converted amounts.
- Convert only among units of the same dimension. Volume and weight defaults
  are independent. A per-ingredient unit override applies only to that
  ingredient and dimension and is not saved to the recipe or account default.
  Rows with both dimensions may display and override each independently.
- Keep the stored unit when it already matches the selected system. Otherwise,
  choose the largest target-system unit that keeps the scaled lower amount at
  least 1; if none does, choose the target system's smallest unit. Use the same
  unit for both endpoints of a range. An explicit per-ingredient override
  always wins over this automatic choice.
- Use fixed, high-precision conversion factors through canonical milliliters
  for volume and grams for weight. Prefer exact factors when defined; round
  only for display. Record the factors and their NIST source in the
  implementation and tests. Do not add volume-to-weight conversion or infer
  density; trusted density belongs to Slice 15.
- Store the two default systems on the signed-in account, defaulting to
  `us_customary`. The existing account read policy is sufficient; keep direct
  authenticated account updates restricted and expose a narrow authenticated
  database function that derives the owner from `auth.uid()`, validates both
  systems, and updates only these preferences. Do not accept an account ID.
- Until the Settings page arrives in Slice 14, put the two clearly labeled
  defaults in a compact navigation-menu popover. Use a familiar ruler icon
  with a tooltip and accessible name on mobile; retain visible `Units` text on
  desktop. Show Trash as an icon-only mobile link with its accessible name and
  tooltip so the persistent mobile navigation retains room. Keep both controls
  keyboard-operable, visibly focused, and within the viewport.
- Public recipe behavior is out of scope until Slice 22. Do not change public
  access or add unauthenticated preference storage.

## Data and calculation contract

- Add a forward migration for account volume and weight default-system fields,
  constraints, and the authenticated preference-update function. Preserve
  existing account ownership, RLS, and restricted column grants. Revoke
  function execution from `public` and `anon`; grant it to `authenticated`.
- Keep the calculation and unit-conversion rules in a pure library boundary
  with no database or browser dependencies. Validate finite positive factors,
  supported unit codes, valid systems, and valid scaling inputs.
- Keep stored unit codes and amounts as the source of truth. Convert both
  range boundaries independently, and apply scaling before display formatting.
- Resolve each ingredient's displayed volume and weight units from its
  applicable per-ingredient override or the account defaults. Preserve
  independent dimensions on dual-measurement rows.
- A preference update must not alter account admin/sign-in fields, recipe
  content, recipe versions, or recipe history. Failed or invalid requests leave
  both defaults unchanged.

## UI and interaction

- Add a compact `Units` control to the shared private navigation, not a new
  Settings destination or a recipe-specific persistent setting. Its popover
  has visibly labeled Volume and Weight choices for US customary and Metric.
  Changing either choice saves that account default and leaves the other
  dimension unchanged.
- Add reader controls near the recipe's ingredient section for servings,
  multiply/divide, and unit overrides. Keep scale and per-ingredient overrides
  local to the current rendered recipe. Provide a direct reset to the base
  recipe values and account-default units.
- Use native semantic controls where possible, with explicit labels and
  accessible descriptions for scale mode, factor/target, dimension, and each
  ingredient's unit override. Invalid or unavailable serving scaling must be
  explained without making the recipe unusable.
- Keep recipe detail calm and unframed: compact controls, natural-language
  amounts, existing paper-and-ink colors, and no dashboard cards. Desktop stays
  keyboard-first and content-sized; mobile is touch-first with at least 48px
  hit targets and no horizontal page overflow.
- Keep reader output, including the scaled servings value where applicable,
  visible in print. Hide navigation and interactive controls using the current
  print conventions. The print action must use the same active derived values
  as the screen.

## Test-first acceptance

Write focused failing coverage before production code:

- Unit tests cover exact within-dimension conversion factors in both
  directions, all supported units, unchanged same-unit values, invalid units,
  dual measurements, scaling modes, invalid factors, ranges, and formatting
  boundaries around accepted fractions and two-decimal rounding.
- Unit tests prove Count and Things scale without unit conversion, while Feel
  phrases and missing numeric measurements remain unchanged. Conversion never
  pairs or derives a Volume and Weight value.
- Database/API tests prove defaults for new and existing accounts, owner-only
  preference updates, rejection of anonymous and foreign-owner attempts,
  rejection of invalid systems, preservation of the other dimension, and no
  ability to alter admin or sign-in-method fields.
- Browser tests cover target servings, multiply, divide, reset, each dimension's
  system default, per-ingredient unit overrides, dual-measurement rows, and
  unchanged stored recipe values after viewing and printing.
- The Reset browser assertion clears overrides in both dimensions and restores
  the recipe's saved base servings and account-default unit systems.
- Chromium and Fold 6 coverage verifies the navigation popover's labels,
  keyboard access, focus, dismissal, saving/error status, 48px mobile targets,
  icon-only mobile Trash and Units controls, and no horizontal overflow.
- Print-media and PDF.js text assertions prove the selected scale and units are
  retained and controls/navigation are omitted. Axe coverage includes the
  navigation popover and recipe reader controls.

## Verification

Run the focused unit and owner-scoped database/API tests first, followed by the
recipe detail and print browser tests on Chromium and Fold 6. Use the isolated
`npm run test:migration:magazine` harness to verify unit defaults for accounts
created before and after the migration. Reuse local data when useful; a local
reset is allowed when a clean baseline is worth the reset and reload effort.
Follow the README procedure and reload the synthetic fixture. Never reset
linked or hosted Supabase. Then run `npm run typecheck`, `npm run lint`, and the
production build.

## Completion criteria

- Every acceptance test passes locally without a hosted account or database
  reset.
- Scaling and unit conversion change only reader output, preserve stored
  measurements, and never convert between dimensions.
- Preference writes are owner-scoped and cannot update protected account
  fields; the navigation control works accessibly at desktop and mobile sizes.
- Screen and print show the same active scale and unit choices.
- Update the comprehensive reference, data model, visual guide, decision log,
  and roadmap to describe behavior that passed acceptance tests. Keep the full
  Settings page and public recipe view within their assigned later slices.
