# DLC 43: Rating Scale Guidance

**Status:** Draft candidate. Rating meanings must be agreed before
implementation.

## Outcome

People can understand the existing numeric Rating choices without changing
their stored values or turning the choice list into a set of labeled ratings.

## Existing contract

The current tried-only Rating is stored as one of `-5`, `-3`, `-1`, `0`, `1`,
`2`, `3`, `4`, or `5`. The existing DLC 10 contract keeps the option labels
numeric and explicitly excludes Rating meanings from Help and tooltips. This
proposal reopens that presentation rule; it does not replace the scale or
change its filtering, sorting, privacy, or persistence.

## Proposed behavior

- Keep all nine numeric choices and their existing saved values.
- Add a Rating explanation to Help once the meaning of each value is agreed.
- Add a keyboard- and touch-accessible information control beside the Rating
  field. It opens a compact explanation of the same scale without changing the
  picklist option labels.
- Keep displayed recipe Ratings numeric. Do not invent meanings for values
  that have not been defined.

The simplest middle ground is one contextual information panel plus the full
Help entry, rather than a hover-only tooltip on every option. The current
picklist is a custom listbox, so per-option descriptions are possible but
would need an accessible, touch-friendly interaction and shared-component
changes.

## Acceptance criteria

1. The picklist still offers exactly the existing nine numeric values, with
   numeric option labels and no change to the stored `score`.
2. Help and the contextual explanation present the same approved meanings.
3. The contextual control works by pointer, keyboard, and touch, and has an
   accessible name and description.
4. Rating filtering, sorting, private display, and existing bundles continue
   to use the unchanged numeric values.
5. Tests verify the Help content and the explanation control without adding
   labels to saved or displayed Ratings.

## Open decisions

- Define the intended description for each value. Existing negative meanings
  are `-1` “Needs work,” `-3` “No,” and `-5` “DO NOT TRY”; zero is neutral.
  Positive meanings are not currently defined.
- Confirm whether one contextual panel is preferred over per-option help.
- Reconcile the approved wording with DLC 10 and the comprehensive reference
  before implementation.

## Initial sizing

Low difficulty; about **0.5–1.5 days** after the wording is agreed; low churn.
The effort is Help content, one contextual control, and focused accessibility
and content tests.

## References

- [DLC 10: Recipe ratings, stars, and hearts](./dlc-10-ratings-and-favorites.md)
- [Recipe card and metadata reference](../../comprehensive-reference/01-recipe-card-and-metadata.md)
- [Help page](../../../../src/app/help/page.tsx)
- [Recipe form Rating field](../../../../src/app/recipes/recipe-form.tsx)
- [Custom picklist](../../../../src/app/picklist.tsx)
