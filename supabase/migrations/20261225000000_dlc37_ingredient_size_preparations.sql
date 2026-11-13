alter table public.recipe_ingredients
  drop constraint recipe_ingredients_size_requires_cubed_check,
  add constraint recipe_ingredients_size_requires_supported_preparation_check
    check (
      size_value is null
      or lower(btrim(preparation)) in ('cubed', 'diced', 'sliced')
    );

do $$
declare
  function_source text;
  matching_functions integer;
  old_preparation_check constant text :=
    $pattern$lower(btrim(coalesce(item.value->>'preparation', ''))) <> 'cubed'$pattern$;
  new_preparation_check constant text :=
    $pattern$lower(btrim(coalesce(item.value->>'preparation', ''))) not in ('cubed', 'diced', 'sliced')$pattern$;
  old_error_message constant text :=
    $pattern$Size requires a positive value and an inch or centimeter unit on cubed ingredients.$pattern$;
  new_error_message constant text :=
    $pattern$Size requires a positive value and an inch or centimeter unit on cubed, diced, or sliced ingredients.$pattern$;
begin
  select count(*)
  into matching_functions
  from pg_catalog.pg_proc as proc
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'save_recipe_with_ingredient_sets';

  if matching_functions <> 1 then
    raise exception 'Expected one recipe save function while updating Size validation';
  end if;

  select pg_catalog.pg_get_functiondef(proc.oid)
  into function_source
  from pg_catalog.pg_proc as proc
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'save_recipe_with_ingredient_sets';

  if pg_catalog.strpos(function_source, old_preparation_check) = 0
    or pg_catalog.strpos(function_source, old_error_message) = 0 then
    raise exception 'Expected recipe save Size validation was not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_preparation_check, new_preparation_check);
  function_source := pg_catalog.replace(function_source, old_error_message, new_error_message);
  execute function_source;
end;
$$;
