# Local Synthetic Recipe Data

The synthetic site fixture provides repeatable recipe data for exercising recipe
metadata, ingredient references, instruction emphasis, and photo layouts. Its
food images are generated locally as SVG-based illustrations and converted to
WebP; no remote image source is contacted.

## Load the Fixture

Start local Supabase, then run:

```sh
npm run seed:synthetic -- --local
```

To validate the fixture and local account picklists without writing data:

```sh
npm run seed:synthetic -- --local --dry-run
```

The loader reads credentials from the running local Supabase CLI status and
rejects any API URL that is not loopback HTTP. It requires exactly one local
Auth account outside the `@example.test` test-user domain when one exists and
no dedicated fixture owner has been provisioned. It preserves that account and
uses it for the full fixture. If a reset leaves no non-test account, the
loader creates `synthetic-owner@example.test` as the full-fixture owner. If
multiple non-test accounts exist without that dedicated owner, the loader
stops rather than guessing.

The loader also ensures three local-only accounts for admin and isolation checks:

| Account | Data |
| --- | --- |
| `synthetic-admin@example.test` | Administrator access; no fixture recipes |
| `synthetic-neighbor@example.test` | Three recipes, one for each recipe state |
| `synthetic-empty@example.test` | No recipes; retains the default empty `Recipe Tin` collection |

New fixture accounts use the existing local E2E password
`local-test-password-42`. These are confirmed local Auth users, so no email
verification is needed. The loader grants administrator access only to the
dedicated synthetic admin account and does not change roles on existing
accounts. Existing fixture accounts are reused without changing their
passwords. Sign in with these accounts only against the local app.

The loader does not use a linked project, delete existing records, or print
account IDs, personal account emails, or credentials. Fixture publications
and recipes use `.test` URLs; existing matching records are reused so an
interrupted load can be resumed.

Local resets are allowed when the value of a clean baseline is worth the reset
and reload effort. `npm run dev:local` resets local Supabase before starting
the app; if the stack is already running, use `supabase db reset --local`.
After either reset, run `npm run seed:synthetic -- --local`. This provisions
the synthetic owner/admin/neighbor/empty accounts as needed and restores
publications, recipes, taxonomy assignments, instruction references, photo
assets, and account-isolation data. Resetting removes all local Auth users and
database records, including any data not represented in this fixture. Preserve
that data separately if it matters. Never reset a linked or hosted project.

## Fixture Coverage

The current fixture contains seven synthetic sites and 51 recipes. It varies
recipe states and opinions, uses existing recipe picklist values, references
every listed ingredient in instructions, emphasizes durations and oven or
stovetop heat, and assigns one gallery image plus one or two inline images per
recipe. Inline photos vary in step placement, alignment, width, and framing.
Afterlight Kitchen also includes repeated ingredients across separate sections,
divided ingredients with equal and unequal portion ratios, and cubed tofu with
size metadata. These examples are part of the reloadable fixture, so the normal
local seed command updates them without requiring a reset.
The loader compares saved ingredient rows, sections, measurements, and
instruction steps, so ingredient-only fixture edits are applied as well.
