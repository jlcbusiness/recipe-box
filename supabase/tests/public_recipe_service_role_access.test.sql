begin;

set local role postgres;
set local search_path = extensions, public;

select plan(1);

select ok(
  (
    select bool_and(
      has_table_privilege('service_role', format('public.%I', table_name), 'select')
    )
    from (values
      ('recipes'),
      ('publications'),
      ('recipe_ingredient_sets'),
      ('recipe_picklist_assignments'),
      ('recipe_steps'),
      ('recipe_ingredients'),
      ('recipe_pairings'),
      ('recipe_references'),
      ('recipe_picklist_values'),
      ('ingredients'),
      ('recipe_ingredient_measurements'),
      ('media_assets')
    ) as required_tables(table_name)
  ),
  'service_role can read the public recipe payload tables'
);

select * from finish();
rollback;