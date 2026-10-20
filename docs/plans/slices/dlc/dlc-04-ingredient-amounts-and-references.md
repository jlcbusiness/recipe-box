# DLC 04: Ingredient amount semantics and references

This brief resolves “divided” and size qualifiers as explicit, usable recipe
information. It depends on ingredient sets in DLC 03.

## Outcome

A cook can understand how an ingredient quantity is divided across recipe
steps, and an instruction can refer unambiguously to a repeated ingredient or a
specific ingredient set.

## Scope

- Define a structured representation for a divided amount and its portions.
- Distinguish amount allocation from ingredient size and preparation text.
- Preserve existing Specifics and Preparation values and current measurement
  behavior unless a deliberate migration is approved.
- Allow instruction references to disambiguate repeated ingredient rows and
  set membership without exposing unstable internal IDs.
- Keep ingredient amounts and references consistent through scaling, unit
  conversion, public projection, print, history, and bundles.

## Decisions before implementation

- Decide whether division is a ratio, named portions, or per-use amounts, and
  whether the existing ingredient row remains canonical.
- Define when size belongs in Specifics versus a dedicated field; examples
  include “cubed” and “divided.”
- Approve a readable reference syntax, including numbering and set labels.
- Define validation and fallback behavior for partial or stale references.

## Acceptance

- Tests prove divided quantities are displayed and scaled without changing the
  base recipe amount unexpectedly.
- Repeated ingredients can be referenced consistently across sets and steps.
- Existing instruction mentions and imported bundles remain compatible.
- Mobile editing wraps without clipping and exposes labels to assistive
  technology.
- Unit, migration, browser, public, print, import/export, and history tests pass.
