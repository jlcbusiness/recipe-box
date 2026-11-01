do $$
declare
  function_source text;
  old_filter_fields constant text :=
    $pattern$'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'score', 'starred', 'hearted'
    ) then$pattern$;
  new_filter_fields constant text :=
    $pattern$'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
      'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
      'vitamin_d', 'calcium', 'iron', 'potassium', 'score', 'starred', 'hearted'
    ) then$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_v1(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_filter_fields) = 0 then
    raise exception 'Expected explorer nutrition filter validation was not found';
  end if;

  execute pg_catalog.replace(function_source, old_filter_fields, new_filter_fields);
end;
$$;
