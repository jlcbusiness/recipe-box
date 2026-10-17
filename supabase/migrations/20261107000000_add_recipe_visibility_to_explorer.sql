alter table public.accounts
  drop constraint accounts_recipe_column_order_check;

update public.accounts
set recipe_column_order = array_append(recipe_column_order, 'visibility')
where not ('visibility' = any(recipe_column_order));

alter table public.accounts
  alter column recipe_column_order set default array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
    'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
    'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
    'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
    'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation'
  ]::text[];

alter table public.accounts
  add constraint accounts_recipe_column_order_check
  check (
    pg_catalog.cardinality(recipe_column_order) = 29
    and pg_catalog.array_position(recipe_column_order, null) is null
    and recipe_column_order @> array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
      'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
      'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
      'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation'
    ]::text[]
    and recipe_column_order <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
      'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
      'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
      'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation'
    ]::text[]
  );

create or replace function public.is_valid_recipe_hidden_columns(p_hidden_columns text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_hidden_columns is not null
    and pg_catalog.array_position(p_hidden_columns, null) is null
    and p_hidden_columns <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
      'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
      'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
      'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at',
      'pairs_with', 'opinion', 'citation'
    ]::text[]
    and pg_catalog.cardinality(p_hidden_columns) = (
      select pg_catalog.count(distinct hidden_column.value)
      from pg_catalog.unnest(p_hidden_columns) as hidden_column(value)
    );
$$;

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
    'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
    'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
    'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
    'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at',
    'pairs_with', 'opinion', 'citation'
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

  update public.accounts
  set recipe_column_order = p_column_order
  where id = account_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

do $$
declare
  function_source text;
  old_expression constant text :=
    'v_source_fields text[] := array[''publication_page'', ''recipe_url'', ''citation''];';
  new_expression constant text :=
    'v_source_fields text[] := array[''publication_page'', ''recipe_url'', ''citation'', ''visibility''];';
  old_visible_columns constant text :=
    'from jsonb_array_elements_text(v_preferences->''visible_columns'')
      with ordinality as column_name(value, ordinality);';
  new_visible_columns constant text :=
    'from jsonb_array_elements_text(v_preferences->''visible_columns'')
      with ordinality as column_name(value, ordinality)
    where column_name.value <> ''visibility'';';
  old_widths constant text :=
    ' - ''citation''::text;';
  new_widths constant text :=
    ' - ''citation''::text - ''visibility''::text;';
  old_legacy_call constant text :=
    '  perform public.update_explorer_state_with_legacy_validation(p_context_key, v_legacy_state);';
  new_legacy_call constant text :=
    '  if p_state->>''sort'' = ''visibility'' then
    v_legacy_state := jsonb_set(v_legacy_state, ''{sort}'', ''"name"''::jsonb);
  end if;
  perform public.update_explorer_state_with_legacy_validation(p_context_key, v_legacy_state);';
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state(text,jsonb)'::regprocedure
  ) into function_source;

  if pg_catalog.strpos(function_source, old_expression) = 0
    or pg_catalog.strpos(function_source, old_visible_columns) = 0
    or pg_catalog.strpos(function_source, old_legacy_call) = 0 then
    raise exception 'Expected explorer state validation expressions were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_expression, new_expression);
  function_source := pg_catalog.replace(function_source, old_visible_columns, new_visible_columns);
  if pg_catalog.strpos(function_source, old_widths) = 0 then
    raise exception 'Expected explorer width validation expression was not found';
  end if;
  function_source := pg_catalog.replace(function_source, old_widths, new_widths);
  function_source := pg_catalog.replace(function_source, old_legacy_call, new_legacy_call);
  execute function_source;
end;
$$;

alter function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  rename to recipe_search_filter_matches_with_visibility;

create function private.recipe_search_filter_matches(
  target_account_id uuid,
  target_recipe_id uuid,
  filter jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  field_name text := filter->>'field';
  operator_name text := filter->>'operator';
  field_value text;
  expected_values text[];
begin
  if field_name = 'visibility' then
    select case when recipe.is_private then 'private' else 'linkable' end
    into field_value
    from public.recipes as recipe
    where recipe.account_id = target_account_id
      and recipe.id = target_recipe_id;

    if not found then
      return false;
    end if;

    select coalesce(pg_catalog.array_agg(item.value), '{}'::text[])
    into expected_values
    from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);

    return case operator_name
      when 'in' then field_value = any(expected_values)
      else not (field_value = any(expected_values))
    end;
  end if;

  return private.recipe_search_filter_matches_with_visibility(
    target_account_id,
    target_recipe_id,
    filter
  );
end;
$$;

grant execute on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  to authenticated;

do $$
declare
  function_source text;
  old_filter_fields constant text :=
    '''citation'', ''state'', ''food_type'', ''verdict'', ''enthusiasm'', ''publication_id'', ''meal_type''';
  new_filter_fields constant text :=
    '''citation'', ''visibility'', ''state'', ''food_type'', ''verdict'', ''enthusiasm'', ''publication_id'', ''meal_type''';
  old_enum_fields constant text :=
    'field_name in (''state'', ''food_type'', ''verdict'', ''enthusiasm'', ''publication_id'')';
  new_enum_fields constant text :=
    'field_name in (''state'', ''visibility'', ''food_type'', ''verdict'', ''enthusiasm'', ''publication_id'')';
  old_enum_validation constant text :=
    'if field_name = ''state'' and exists (
        select 1 from pg_catalog.jsonb_array_elements_text(filter->''value'') as item(value)
        where item.value not in (''want_to_try'', ''tried'', ''will_not_try'')
      ) then
        raise exception ''Unsupported recipe state filter value.'' using errcode = ''22023'';
      end if;';
  new_enum_validation constant text :=
    'if field_name in (''state'', ''visibility'') and exists (
        select 1 from pg_catalog.jsonb_array_elements_text(filter->''value'') as item(value)
        where (field_name = ''state'' and item.value not in (''want_to_try'', ''tried'', ''will_not_try''))
          or (field_name = ''visibility'' and item.value not in (''private'', ''linkable''))
      ) then
        raise exception ''Unsupported recipe filter value.'' using errcode = ''22023'';
      end if;';
  old_sort_keys constant text :=
    '''pairs_with'', ''opinion'', ''citation''
  ) then';
  new_sort_keys constant text :=
    '''pairs_with'', ''opinion'', ''citation'', ''visibility''
  ) then';
  old_sort_value constant text :=
    'when ''citation'' then citation_columns.citation';
  new_sort_value constant text :=
    'when ''citation'' then citation_columns.citation
        when ''visibility'' then case when recipe.is_private then ''Private'' else ''Linkable'' end';
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes(text,integer,integer,jsonb,text,text,uuid)'::regprocedure
  ) into function_source;

  if pg_catalog.strpos(function_source, old_filter_fields) = 0
    or pg_catalog.strpos(function_source, old_enum_fields) = 0
    or pg_catalog.strpos(function_source, old_enum_validation) = 0
    or pg_catalog.strpos(function_source, old_sort_keys) = 0
    or pg_catalog.strpos(function_source, old_sort_value) = 0 then
    raise exception 'Expected recipe search validation expressions were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_filter_fields, new_filter_fields);
  function_source := pg_catalog.replace(function_source, old_enum_fields, new_enum_fields);
  function_source := pg_catalog.replace(function_source, old_enum_validation, new_enum_validation);
  function_source := pg_catalog.replace(function_source, old_sort_keys, new_sort_keys);
  function_source := pg_catalog.replace(function_source, old_sort_value, new_sort_value);
  execute function_source;
end;
$$;