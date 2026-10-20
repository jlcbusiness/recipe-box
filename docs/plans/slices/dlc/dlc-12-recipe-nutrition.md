# DLC 12: Recipe nutrition

This brief explores per-serving nutrition estimates based on ingredient values.
It depends on agreed serving semantics in DLC 11 and requires a data-source
review before implementation.

## Outcome

A person can inspect clearly labeled estimated nutrition totals and per-serving
values for a recipe when sufficient ingredient data is available.

## Scope

- Define which nutrients are supported and their units.
- Store known nutrition values at a documented basis, such as per 100 g, with
  provenance and update date where applicable.
- Calculate recipe totals only when ingredient quantities can be converted
  reliably; report incomplete estimates rather than inventing values.
- Derive per-serving estimates from validated serving/yield semantics.
- Keep nutrition optional and expose it publicly only through an approved
  public-data decision.

## Decisions before implementation

- Select an authoritative nutrition source and review licensing, API terms,
  offline use, and update policy.
- Decide whether values are user-entered, imported, or both.
- Define how volume measures, density, missing values, preparation waste, and
  ingredient variants affect confidence and calculation.
- Approve rounding, uncertainty language, and public/print visibility.

## Acceptance

- Every displayed value has a traceable source or is clearly marked as
  user-provided; missing values never become zero silently.
- Unit conversions, yield/serving calculations, rounding, and incomplete-data
  cases have deterministic tests.
- Nutrition data is included in versioned bundles and history only as approved.
- Database/RLS, calculation, migration, browser, public privacy, and
  accessibility tests pass.

## References

- [Measurements and density](../6-measurements.md)
- [Trusted density](../15-trusted-density.md)
- [DLC brainstorm](../../discussion/dlc.md)
