do $$
declare
  function_source text;
  old_sort_keys constant text :=
    $pattern$'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
    'vitamin_d', 'calcium', 'iron', 'potassium'$pattern$;
  new_sort_keys constant text :=
    $pattern$'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
    'vitamin_d', 'calcium', 'iron', 'potassium', 'starred', 'hearted'$pattern$;
  old_sort_number constant text :=
    $pattern$        when 'potassium' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'potassium')::numeric
      end as sort_number,$pattern$;
  new_sort_number constant text :=
    $pattern$        when 'potassium' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'potassium')::numeric
        when 'starred' then case when recipe.is_starred then 1 else 0 end::numeric
        when 'hearted' then case when recipe.is_hearted then 1 else 0 end::numeric
      end as sort_number,$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes(text,integer,integer,jsonb,text,text,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_sort_keys) = 0
    or pg_catalog.strpos(function_source, old_sort_number) = 0 then
    raise exception 'Expected recipe search sort expressions were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_sort_keys, new_sort_keys);
  function_source := pg_catalog.replace(function_source, old_sort_number, new_sort_number);
  execute function_source;
end;
$$;

do $$
declare
  function_source text;
  old_sort_key constant text :=
    $pattern$'protein', 'vitamin_d', 'calcium', 'iron', 'potassium')$pattern$;
  new_sort_key constant text :=
    $pattern$'protein', 'vitamin_d', 'calcium', 'iron', 'potassium', 'starred', 'hearted')$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_v1(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_sort_key) = 0 then
    raise exception 'Expected explorer marker sort validation was not found';
  end if;

  execute pg_catalog.replace(function_source, old_sort_key, new_sort_key);
end;
$$;
