alter table public.recipe_ingredient_measurements
  add constraint recipe_ingredient_measurements_finite_amounts_check
  check (
    (
      amount_min is null
      or amount_min not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    )
    and (
      amount_max is null
      or amount_max not in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    )
  );
