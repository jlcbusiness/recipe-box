create or replace function public.update_recipe_column_order(p_column_order text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := (select auth.uid());
  allowed_columns text[] := array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
    'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
    'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
    'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium', 'total_time_minutes',
    'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'starred', 'hearted'
  ];
  legacy_time_columns text[] := array[
    'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
    'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
    'rest_time_minutes'
  ];
begin
  if account_id is null then
    raise exception 'Authentication required';
  end if;

  if p_column_order is null
    or pg_catalog.cardinality(p_column_order) <> pg_catalog.cardinality(allowed_columns)
    or pg_catalog.array_position(p_column_order, null) is not null
    or not (p_column_order @> allowed_columns and p_column_order <@ allowed_columns) then
    raise exception 'Invalid recipe column order';
  end if;

  update public.accounts as account
  set recipe_column_order = p_column_order || array(
    select saved_column.value
    from pg_catalog.unnest(account.recipe_column_order) with ordinality
      as saved_column(value, position)
    where saved_column.value = any(legacy_time_columns)
    order by saved_column.position
  )
  where account.id = account_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

notify pgrst, 'reload schema';
