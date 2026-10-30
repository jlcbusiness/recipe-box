alter table public.recipes
  drop constraint recipes_makes_pair_check,
  add constraint recipes_makes_pair_check
    check (
      (makes_quantity is null and makes_thing is null)
      or (
        makes_quantity is not null
        and makes_quantity > 0
        and makes_thing is not null
        and pg_catalog.btrim(makes_thing) <> ''
      )
    );
