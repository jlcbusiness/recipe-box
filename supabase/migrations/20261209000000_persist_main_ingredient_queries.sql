do $$
declare
  function_source text;
  old_recipe_filter_field constant text :=
    $pattern$'ingredient', 'state', 'food_type', 'verdict', 'enthusiasm', 'publication_id',$pattern$;
  new_recipe_filter_field constant text :=
    $pattern$'ingredient', 'main_ingredient', 'state', 'food_type', 'verdict', 'enthusiasm', 'publication_id',$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_v1(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_recipe_filter_field) = 0 then
    raise exception 'Expected explorer main-ingredient filter validation was not found';
  end if;

  execute pg_catalog.replace(function_source, old_recipe_filter_field, new_recipe_filter_field);
end;
$$;
