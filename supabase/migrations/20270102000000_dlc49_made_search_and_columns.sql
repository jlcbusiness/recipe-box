alter table public.accounts
  drop constraint accounts_recipe_column_order_check;

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
      'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
      'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
      'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
      'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
      'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'starred', 'hearted',
      'made_count', 'last_made_at'
    ]::text[]
    and pg_catalog.cardinality(p_hidden_columns) = (
      select pg_catalog.count(distinct hidden_column.value)
      from pg_catalog.unnest(p_hidden_columns) as hidden_column(value)
    );
$$;

update public.accounts as account
set recipe_column_order = account.recipe_column_order || array(
      select added_column.value
      from pg_catalog.unnest(array['made_count', 'last_made_at']::text[])
        with ordinality as added_column(value, position)
      where not (added_column.value = any(account.recipe_column_order))
      order by added_column.position
    ),
    recipe_hidden_columns = account.recipe_hidden_columns || array(
      select added_column.value
      from pg_catalog.unnest(array['made_count', 'last_made_at']::text[])
        with ordinality as added_column(value, position)
      where not (added_column.value = any(account.recipe_hidden_columns))
      order by added_column.position
    );

alter table public.accounts
  alter column recipe_column_order set default array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
    'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
    'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
    'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
    'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
    'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
    'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at', 'pairs_with',
    'opinion', 'citation', 'score', 'starred', 'hearted', 'made_count', 'last_made_at'
  ]::text[],
  alter column recipe_hidden_columns set default array[
    'publication_page', 'recipe_url', 'occasion_details', 'serves', 'makes', 'equipment',
    'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients',
    'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
    'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes',
    'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
    'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
    'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
    'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
    'vitamin_d', 'calcium', 'iron', 'potassium', 'made_count', 'last_made_at'
  ]::text[];

alter table public.accounts
  add constraint accounts_recipe_column_order_check
  check (
    pg_catalog.cardinality(recipe_column_order) = 50
    and pg_catalog.array_position(recipe_column_order, null) is null
    and recipe_column_order @> array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
      'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
      'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
      'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
      'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'starred', 'hearted',
      'made_count', 'last_made_at'
    ]::text[]
    and recipe_column_order <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
      'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
      'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
      'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
      'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'starred', 'hearted',
      'made_count', 'last_made_at'
    ]::text[]
  );

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
    'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'starred',
    'hearted', 'made_count', 'last_made_at'
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

create or replace function private.recipe_validate_made_search_filter(filter jsonb)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  field_name text := filter->>'field';
  operator_name text := filter->>'operator';
  time_zone text := filter->>'time_zone';
begin
  if field_name in ('made_count', 'column_made_count') then
    if operator_name not in (
      'equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between'
    )
      or pg_catalog.jsonb_typeof(filter->'value') is distinct from 'number'
      or filter ? 'time_zone' then
      raise exception 'Made filters require a supported numeric comparison and value.'
        using errcode = '22023';
    end if;
    if operator_name = 'between'
      and pg_catalog.jsonb_typeof(filter->'value_to') is distinct from 'number' then
      raise exception 'Made range filters require a numeric upper value.'
        using errcode = '22023';
    end if;
    if operator_name <> 'between' and filter ? 'value_to' then
      raise exception 'Only Made range filters accept an upper value.'
        using errcode = '22023';
    end if;
    return;
  end if;

  if field_name not in ('last_made_at', 'column_last_made_at') then
    raise exception 'Unsupported Made search filter.' using errcode = '22023';
  end if;

  if operator_name in ('is_empty', 'is_not_empty') then
    if filter ? 'value' or filter ? 'value_to' or filter ? 'time_zone' then
      raise exception 'Last Made existence filters do not accept values.'
        using errcode = '22023';
    end if;
    return;
  end if;

  if operator_name not in (
    'equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between'
  )
    or pg_catalog.jsonb_typeof(filter->'value') is distinct from 'string' then
    raise exception 'Last Made filters require a supported date comparison and value.'
      using errcode = '22023';
  end if;
  if operator_name = 'between'
    and pg_catalog.jsonb_typeof(filter->'value_to') is distinct from 'string' then
    raise exception 'Last Made range filters require an upper date.'
      using errcode = '22023';
  end if;
  if operator_name <> 'between' and filter ? 'value_to' then
    raise exception 'Only Last Made range filters accept an upper date.'
      using errcode = '22023';
  end if;
  if time_zone is null
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names as zone
      where zone.name = time_zone
    ) then
    raise exception 'Last Made date filters require a valid IANA timezone.'
      using errcode = '22023';
  end if;

  begin
    perform (filter->>'value')::date;
    if operator_name = 'between' then perform (filter->>'value_to')::date; end if;
  exception when others then
    raise exception 'Last Made filters require valid ISO dates.'
      using errcode = '22023';
  end;
end;
$$;

revoke all on function private.recipe_validate_made_search_filter(jsonb)
  from public, anon;
grant execute on function private.recipe_validate_made_search_filter(jsonb)
  to authenticated;

alter function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  rename to recipe_search_filter_matches_before_made_search;

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
  recipe_state text;
  made_count numeric;
  last_made_at timestamptz;
  filter_number numeric;
  filter_number_to numeric;
  local_date date;
  filter_date date;
  filter_date_to date;
  time_zone text := filter->>'time_zone';
begin
  if field_name in (
    'made_count', 'last_made_at', 'column_made_count', 'column_last_made_at'
  ) then
    perform private.recipe_validate_made_search_filter(filter);

    select recipe.state, recipe.made_count, recipe.last_made_at
    into recipe_state, made_count, last_made_at
    from public.recipes as recipe
    where recipe.account_id = target_account_id
      and recipe.id = target_recipe_id
      and recipe.trashed_at is null;

    if not found then return false; end if;

    if field_name in ('made_count', 'column_made_count') then
      if recipe_state = 'will_not_try' then return false; end if;
      filter_number := (filter->>'value')::numeric;
      if operator_name = 'between' then
        filter_number_to := (filter->>'value_to')::numeric;
      end if;
      return case operator_name
        when 'equals' then made_count = filter_number
        when 'not_equals' then made_count <> filter_number
        when 'greater_than' then made_count > filter_number
        when 'less_than' then made_count < filter_number
        when 'at_least' then made_count >= filter_number
        when 'at_most' then made_count <= filter_number
        when 'between' then made_count between filter_number and filter_number_to
        else false
      end;
    end if;

    if recipe_state = 'will_not_try' or last_made_at is null then
      return operator_name = 'is_empty';
    end if;
    if operator_name = 'is_empty' then return false; end if;
    if operator_name = 'is_not_empty' then return true; end if;

    filter_date := (filter->>'value')::date;
    if operator_name = 'between' then
      filter_date_to := (filter->>'value_to')::date;
    end if;
    local_date := (last_made_at at time zone time_zone)::date;
    return case operator_name
      when 'equals' then local_date = filter_date
      when 'not_equals' then local_date <> filter_date
      when 'greater_than' then local_date > filter_date
      when 'less_than' then local_date < filter_date
      when 'at_least' then local_date >= filter_date
      when 'at_most' then local_date <= filter_date
      when 'between' then local_date between filter_date and filter_date_to
      else false
    end;
  end if;

  return coalesce(
    private.recipe_search_filter_matches_before_made_search(
      target_account_id,
      target_recipe_id,
      filter
    ),
    false
  );
end;
$$;

revoke all on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  to authenticated;
revoke all on function private.recipe_search_filter_matches_before_made_search(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.recipe_search_filter_matches_before_made_search(uuid, uuid, jsonb)
  to authenticated;

do $$
declare
  function_source text;
  old_filter_keys constant text :=
    $pattern$where key not in ('field', 'operator', 'value', 'value_to')$pattern$;
  new_filter_keys constant text :=
    $pattern$where key not in ('field', 'operator', 'value', 'value_to', 'time_zone')$pattern$;
  old_filter_error constant text :=
    'Each search filter must contain only field, operator, value, and value_to.';
  new_filter_error constant text :=
    'Each search filter must contain only field, operator, value, value_to, and time_zone.';
  old_field_tail constant text :=
    $pattern$'column_pairs_with', 'column_score', 'column_starred', 'column_hearted',
      'calories'$pattern$;
  new_field_tail constant text :=
    $pattern$'column_pairs_with', 'column_score', 'column_starred', 'column_hearted',
      'column_made_count', 'column_last_made_at', 'made_count', 'last_made_at',
      'calories'$pattern$;
  old_column_filter_start constant text :=
    $pattern$    if field_name like 'column_%' then$pattern$;
  new_column_filter_start constant text :=
    $pattern$    if field_name in (
      'made_count', 'last_made_at', 'column_made_count', 'column_last_made_at'
    ) then
      perform private.recipe_validate_made_search_filter(filter);
    elsif field_name like 'column_%' then$pattern$;
  old_sort_tail constant text :=
    $pattern$'starred', 'hearted', 'visibility'
  ) then$pattern$;
  new_sort_tail constant text :=
    $pattern$'starred', 'hearted', 'visibility', 'made_count', 'last_made_at'
  ) then$pattern$;
  old_made_sort_case constant text :=
    $pattern$        when 'hearted' then case when recipe.is_hearted then 1 else 0 end::numeric$pattern$;
  new_made_sort_case constant text :=
    $pattern$        when 'hearted' then case when recipe.is_hearted then 1 else 0 end::numeric
        when 'made_count' then case
          when recipe.state = 'will_not_try' then null
          else recipe.made_count::numeric
        end$pattern$;
  old_timestamp_sort_cases constant text :=
    $pattern$        when 'created_at' then recipe.created_at
        when 'updated_at' then recipe.updated_at$pattern$;
  new_timestamp_sort_cases constant text :=
    $pattern$        when 'created_at' then recipe.created_at
        when 'updated_at' then recipe.updated_at
        when 'last_made_at' then case
          when recipe.state = 'will_not_try' then null
          else recipe.last_made_at
        end$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes(text,integer,integer,jsonb,text,text,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_filter_keys) = 0
    or pg_catalog.strpos(function_source, old_filter_error) = 0
    or pg_catalog.strpos(function_source, old_field_tail) = 0
    or pg_catalog.strpos(function_source, old_column_filter_start) = 0
    or pg_catalog.strpos(function_source, old_sort_tail) = 0
    or pg_catalog.strpos(function_source, old_made_sort_case) = 0
    or pg_catalog.strpos(function_source, old_timestamp_sort_cases) = 0 then
    raise exception 'Expected recipe search validation or sort anchors were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_filter_keys, new_filter_keys);
  function_source := pg_catalog.replace(function_source, old_filter_error, new_filter_error);
  function_source := pg_catalog.replace(function_source, old_field_tail, new_field_tail);
  function_source := pg_catalog.replace(
    function_source,
    old_column_filter_start,
    new_column_filter_start
  );
  function_source := pg_catalog.replace(function_source, old_sort_tail, new_sort_tail);
  function_source := pg_catalog.replace(
    function_source,
    old_made_sort_case,
    new_made_sort_case
  );
  function_source := pg_catalog.replace(
    function_source,
    old_timestamp_sort_cases,
    new_timestamp_sort_cases
  );

  if pg_catalog.strpos(function_source, 'if filter ? ''time_zone'' and field_name not in') = 0 then
    function_source := pg_catalog.replace(
      function_source,
      'operator_name := filter->>''operator'';',
      'operator_name := filter->>''operator'';' || pg_catalog.chr(10)
        || '    if filter ? ''time_zone'' and field_name not in ('
        || '''last_made_at'', ''column_last_made_at'') then' || pg_catalog.chr(10)
        || '      raise exception ''Timezone is only valid for Last Made filters.'''
        || ' using errcode = ''22023'';' || pg_catalog.chr(10)
        || '    end if;'
    );
  end if;

  execute function_source;
end;
$$;

do $$
declare
  function_source text;
  old_sort constant text :=
    $pattern$p_state->>'sort' not in ('relevance', 'name', 'publication', 'publication_page', 'recipe_url', 'state', 'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium', 'starred', 'hearted')$pattern$;
  new_sort constant text :=
    $pattern$p_state->>'sort' not in ('relevance', 'name', 'publication', 'publication_page', 'recipe_url', 'state', 'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium', 'starred', 'hearted', 'made_count', 'last_made_at')$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_v1(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_sort) = 0
    and pg_catalog.strpos(function_source, new_sort) = 0 then
    raise exception 'Expected recipe explorer sort validation was not found';
  end if;

  if pg_catalog.strpos(function_source, old_sort) > 0 then
    execute pg_catalog.replace(function_source, old_sort, new_sort);
  end if;
end;
$$;

do $$
declare
  function_source text;
  old_rule_keys constant text :=
    $pattern$key_name.key not in ('id', 'field', 'operator', 'value', 'value_to')$pattern$;
  new_rule_keys constant text :=
    $pattern$key_name.key not in ('id', 'field', 'operator', 'value', 'value_to', 'time_zone')$pattern$;
  old_rule_validation constant text :=
    $pattern$    select pg_catalog.jsonb_agg(rule.value - 'id' order by rule.ordinality)
    into validation_filters
    from pg_catalog.jsonb_array_elements(rule_list) with ordinality as rule(value, ordinality);

    perform public.search_recipes_before_advanced_rules(
      null, 1, 0, validation_filters, 'name', 'asc', null
    );$pattern$;
  new_rule_validation constant text :=
    $pattern$    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(rule_list) as rule(value)
      where rule.value ? 'time_zone'
        and rule.value->>'field' not in ('last_made_at', 'column_last_made_at')
    ) then
      raise exception 'Timezone is only valid for Last Made filters.'
        using errcode = '22023';
    end if;

    perform private.recipe_validate_made_search_filter(rule.value - 'id')
    from pg_catalog.jsonb_array_elements(rule_list) as rule(value)
    where rule.value->>'field' in (
      'made_count', 'column_made_count', 'last_made_at', 'column_last_made_at'
    );

    select coalesce(
      pg_catalog.jsonb_agg(
        (rule.value - 'id') - 'time_zone' order by rule.ordinality
      ) filter (
        where rule.value->>'field' not in (
          'made_count', 'column_made_count', 'last_made_at', 'column_last_made_at'
        )
      ),
      '[]'::jsonb
    )
    into validation_filters
    from pg_catalog.jsonb_array_elements(rule_list) with ordinality as rule(value, ordinality);

    perform public.search_recipes_before_advanced_rules(
      null, 1, 0, validation_filters, 'name', 'asc', null
    );$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'private.recipe_advanced_rules_compile(jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_rule_keys) = 0
    and pg_catalog.strpos(function_source, new_rule_keys) = 0 then
    raise exception 'Expected advanced rule key validation was not found';
  end if;

  if pg_catalog.strpos(function_source, old_rule_validation) = 0
    and pg_catalog.strpos(function_source, new_rule_validation) = 0 then
    raise exception 'Expected advanced rule filter validation was not found';
  end if;

  if pg_catalog.strpos(function_source, old_rule_keys) > 0 then
    execute pg_catalog.replace(function_source, old_rule_keys, new_rule_keys);
    select pg_catalog.pg_get_functiondef(
      'private.recipe_advanced_rules_compile(jsonb)'::regprocedure
    )
    into function_source;
  end if;

  if pg_catalog.strpos(function_source, old_rule_validation) > 0 then
    execute pg_catalog.replace(function_source, old_rule_validation, new_rule_validation);
  end if;
end;
$$;

notify pgrst, 'reload schema';
