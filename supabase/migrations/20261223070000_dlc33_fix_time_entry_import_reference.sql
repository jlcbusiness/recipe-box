do $$
declare
  function_source text;
  old_recipe_reference constant text :=
    $pattern$and existing_entry.recipe_id = commit_database_import_without_ingredient_sets.recipe_id;$pattern$;
  new_recipe_reference constant text :=
    $pattern$and existing_entry.recipe_id = (record_data->>'id')::uuid;$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.commit_database_import_without_ingredient_sets(uuid,jsonb,jsonb,jsonb,uuid[],uuid[])'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_recipe_reference) > 0 then
    execute pg_catalog.replace(function_source, old_recipe_reference, new_recipe_reference);
  elsif pg_catalog.strpos(function_source, new_recipe_reference) = 0 then
    raise exception 'Expected recipe time-entry import reference was not found';
  end if;
end;
$$;
