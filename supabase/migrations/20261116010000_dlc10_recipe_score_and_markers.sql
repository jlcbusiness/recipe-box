alter table public.recipes
  add column score smallint,
  add column is_starred boolean not null default false,
  add column is_hearted boolean not null default false,
  add constraint recipes_score_allowed_values_check
    check (score is null or score in (-5, -3, -1, 0, 1, 2, 3, 4, 5)),
  add constraint recipes_score_tried_only_check
    check (score is null or state = 'tried');

create function private.apply_recipe_personal_signals_before_save()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('app.recipe_score_save', true) = 'on' then
    new.score := nullif(current_setting('app.recipe_score_value', true), '')::smallint;
  end if;

  if current_setting('app.recipe_markers_save', true) = 'on' then
    new.is_starred := coalesce(
      nullif(current_setting('app.recipe_starred_value', true), '')::boolean,
      false
    );
    new.is_hearted := coalesce(
      nullif(current_setting('app.recipe_hearted_value', true), '')::boolean,
      false
    );
  end if;

  if new.state <> 'tried' then
    new.score := null;
  end if;

  return new;
end;
$$;

revoke all on function private.apply_recipe_personal_signals_before_save()
  from public, anon, authenticated;

create trigger recipes_apply_personal_signals_before_save
  before insert or update on public.recipes
  for each row execute function private.apply_recipe_personal_signals_before_save();

create function public.save_recipe_with_score(
  p_recipe_id uuid,
  p_expected_version integer,
  p_name text,
  p_food_type_id uuid,
  p_state text,
  p_verdict_id uuid,
  p_enthusiasm_id uuid,
  p_occasion_details text,
  p_reason text,
  p_serves integer,
  p_prep_time_minutes integer,
  p_mixing_time_minutes integer,
  p_marinate_time_minutes integer,
  p_chill_time_minutes integer,
  p_freeze_time_minutes integer,
  p_cook_time_minutes integer,
  p_bake_time_minutes integer,
  p_cooling_time_minutes integer,
  p_rest_time_minutes integer,
  p_total_time_minutes integer,
  p_notes_markdown text,
  p_meal_type_ids uuid[],
  p_cuisine_ids uuid[],
  p_equipment_ids uuid[],
  p_ingredient_rows jsonb,
  p_instruction_steps jsonb,
  p_publication_id uuid,
  p_publication_page text,
  p_recipe_url text,
  p_recipe_relationships jsonb,
  p_tag_ids uuid[],
  p_ingredient_sets jsonb,
  p_score smallint
)
returns table (id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_score is not null and (
    p_state is distinct from 'tried'
    or p_score not in (-5, -3, -1, 0, 1, 2, 3, 4, 5)
  ) then
    raise exception 'Score must be an allowed value for a Tried recipe.'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config('app.recipe_score_save', 'on', true);
  perform pg_catalog.set_config(
    'app.recipe_score_value',
    coalesce(p_score::text, ''),
    true
  );

  return query
  select saved.id, saved.version
  from public.save_recipe_with_ingredient_sets(
    p_recipe_id, p_expected_version, p_name, p_food_type_id, p_state,
    p_verdict_id, p_enthusiasm_id, p_occasion_details, p_reason, p_serves,
    p_prep_time_minutes, p_mixing_time_minutes, p_marinate_time_minutes,
    p_chill_time_minutes, p_freeze_time_minutes, p_cook_time_minutes,
    p_bake_time_minutes, p_cooling_time_minutes, p_rest_time_minutes,
    p_total_time_minutes, p_notes_markdown, p_meal_type_ids, p_cuisine_ids,
    p_equipment_ids, p_ingredient_rows, p_instruction_steps, p_publication_id,
    p_publication_page, p_recipe_url, p_recipe_relationships, p_tag_ids,
    p_ingredient_sets
  ) as saved;
end;
$$;

revoke all on function public.save_recipe_with_score(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text,
  text, jsonb, uuid[], jsonb, smallint
) from public, anon;
grant execute on function public.save_recipe_with_score(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text,
  text, jsonb, uuid[], jsonb, smallint
) to authenticated;

create function public.set_recipe_marker(
  p_recipe_id uuid,
  p_expected_version integer,
  p_marker text,
  p_enabled boolean
)
returns table (version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_version integer;
  current_marker_value boolean;
  updated_version integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'A valid recipe version is required.' using errcode = '22023';
  end if;
  if p_marker is null or p_marker not in ('star', 'heart') or p_enabled is null then
    raise exception 'The recipe marker is invalid.' using errcode = '22023';
  end if;

  select
    recipe.version,
    case p_marker
      when 'star' then recipe.is_starred
      else recipe.is_hearted
    end
  into current_version, current_marker_value
  from public.recipes as recipe
  where recipe.account_id = owner_id
    and recipe.id = p_recipe_id
    and recipe.trashed_at is null
  for update;

  if not found then
    raise exception 'This recipe is no longer available.' using errcode = 'P0002';
  end if;
  if current_version <> p_expected_version then
    raise exception 'This recipe changed in another session.'
      using errcode = 'PT409';
  end if;
  if current_marker_value = p_enabled then
    return query select current_version;
    return;
  end if;

  update public.recipes as recipe
  set is_starred = case when p_marker = 'star' then p_enabled else recipe.is_starred end,
      is_hearted = case when p_marker = 'heart' then p_enabled else recipe.is_hearted end,
      version = recipe.version + 1
  where recipe.account_id = owner_id
    and recipe.id = p_recipe_id
    and recipe.version = current_version
  returning recipe.version into updated_version;

  if updated_version is null then
    raise exception 'This recipe changed in another session.'
      using errcode = 'PT409';
  end if;

  return query select updated_version;
end;
$$;

revoke all on function public.set_recipe_marker(uuid, integer, text, boolean)
  from public, anon;
grant execute on function public.set_recipe_marker(uuid, integer, text, boolean)
  to authenticated;

alter table public.accounts
  drop constraint accounts_recipe_column_order_check;

update public.accounts
set recipe_column_order = array_append(recipe_column_order, 'score')
where not ('score' = any(recipe_column_order));
update public.accounts
set recipe_column_order = array_append(recipe_column_order, 'starred')
where not ('starred' = any(recipe_column_order));
update public.accounts
set recipe_column_order = array_append(recipe_column_order, 'hearted')
where not ('hearted' = any(recipe_column_order));

alter table public.accounts
  alter column recipe_column_order set default array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
    'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
    'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
    'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
    'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
    'score', 'starred', 'hearted'
  ]::text[];

alter table public.accounts
  add constraint accounts_recipe_column_order_check
  check (
    pg_catalog.cardinality(recipe_column_order) = 32
    and pg_catalog.array_position(recipe_column_order, null) is null
    and recipe_column_order @> array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
      'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
      'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
      'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
      'score', 'starred', 'hearted'
    ]::text[]
    and recipe_column_order <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
      'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
      'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
      'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
      'score', 'starred', 'hearted'
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
      'pairs_with', 'opinion', 'citation', 'score', 'starred', 'hearted'
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
    'pairs_with', 'opinion', 'citation', 'score', 'starred', 'hearted'
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

update public.explorer_state
set state = jsonb_set(
  state,
  '{display_preferences,visible_columns}',
  ((state #> '{display_preferences,visible_columns}') - 'starred' - 'hearted')
    || '["starred", "hearted"]'::jsonb,
  false
)
where (
  context_key = 'recipes-find'
  or context_key like 'publication-recipes:%'
)
  and jsonb_typeof(state #> '{display_preferences,visible_columns}') = 'array';

do $$
declare
  function_source text;
  old_visible_limit constant text :=
    'jsonb_array_length(v_preferences->''visible_columns'') > 30';
  new_visible_limit constant text :=
    'jsonb_array_length(v_preferences->''visible_columns'') > 33';
  old_visible_columns constant text :=
    $pattern$'publication_source'
    ];$pattern$;
  new_visible_columns constant text :=
    $pattern$'publication_source', 'score', 'starred', 'hearted'
    ];$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_with_legacy_validation(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_visible_limit) = 0
    or pg_catalog.strpos(function_source, old_visible_columns) = 0 then
    raise exception 'Expected explorer display validation expressions were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_visible_limit, new_visible_limit);
  function_source := pg_catalog.replace(function_source, old_visible_columns, new_visible_columns);
  execute function_source;
end;
$$;

do $$
declare
  function_source text;
  old_sort_key constant text :=
    $pattern$p_state->>'sort' not in ('relevance', 'name', 'publication', 'publication_page', 'recipe_url', 'state', 'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation')$pattern$;
  new_sort_key constant text :=
    $pattern$p_state->>'sort' not in ('relevance', 'name', 'publication', 'publication_page', 'recipe_url', 'state', 'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation', 'score')$pattern$;
  old_filter_fields constant text :=
    $pattern$'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at'
    ) then$pattern$;
  new_filter_fields constant text :=
    $pattern$'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'score', 'starred', 'hearted'
    ) then$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_v1(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_sort_key) = 0
    or pg_catalog.strpos(function_source, old_filter_fields) = 0 then
    raise exception 'Expected recipe explorer state validation expressions were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_sort_key, new_sort_key);
  function_source := pg_catalog.replace(function_source, old_filter_fields, new_filter_fields);
  execute function_source;
end;
$$;

alter function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  rename to recipe_search_filter_matches_before_dlc10;

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
  expected_value boolean;
  actual_value boolean;
  score_value smallint;
  comparison_value numeric;
  upper_value numeric;
begin
  if field_name in ('starred', 'hearted') then
    if operator_name not in ('is', 'is_not')
      or jsonb_typeof(filter->'value') <> 'array'
      or jsonb_array_length(filter->'value') <> 1
      or jsonb_typeof(filter->'value'->0) <> 'string'
      or filter->'value'->>0 not in ('true', 'false') then
      raise exception 'Marker filters require one boolean value and a supported operator.'
        using errcode = '22023';
    end if;

    expected_value := filter->'value'->>0 = 'true';
    select case field_name
      when 'starred' then recipe.is_starred
      else recipe.is_hearted
    end
    into actual_value
    from public.recipes as recipe
    where recipe.account_id = target_account_id
      and recipe.id = target_recipe_id;

    if not found then
      return false;
    end if;

    return case operator_name
      when 'is' then actual_value = expected_value
      else actual_value <> expected_value
    end;
  end if;

  if field_name = 'score' then
    if operator_name not in (
      'equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between'
    )
      or jsonb_typeof(filter->'value') <> 'number'
      or (operator_name = 'between' and jsonb_typeof(filter->'value_to') <> 'number') then
      raise exception 'Score filters require a supported comparison and numeric value.'
        using errcode = '22023';
    end if;

    comparison_value := (filter->>'value')::numeric;
    upper_value := case
      when operator_name = 'between' then (filter->>'value_to')::numeric
      else null
    end;

    select recipe.score
    into score_value
    from public.recipes as recipe
    where recipe.account_id = target_account_id
      and recipe.id = target_recipe_id;

    if not found then
      return false;
    end if;

    return case operator_name
      when 'equals' then score_value = comparison_value
      when 'not_equals' then score_value is not null and score_value <> comparison_value
      when 'greater_than' then score_value > comparison_value
      when 'less_than' then score_value < comparison_value
      when 'at_least' then score_value >= comparison_value
      when 'at_most' then score_value <= comparison_value
      else score_value between comparison_value and upper_value
    end;
  end if;

  return private.recipe_search_filter_matches_before_dlc10(
    target_account_id,
    target_recipe_id,
    filter
  );
end;
$$;

revoke all on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  to authenticated;
revoke all on function private.recipe_search_filter_matches_before_dlc10(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.recipe_search_filter_matches_before_dlc10(uuid, uuid, jsonb)
  to authenticated;

do $$
declare
  function_source text;
  old_sort_key constant text :=
    $pattern$'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation'$pattern$;
  new_sort_key constant text :=
    $pattern$'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
    'score'$pattern$;
  old_filter_fields constant text :=
    $pattern$'total_time_minutes', 'created_at', 'updated_at'
    );$pattern$;
  new_filter_fields constant text :=
    $pattern$'total_time_minutes', 'created_at', 'updated_at', 'score', 'starred', 'hearted'
    );$pattern$;
  old_numeric_fields constant text :=
    $pattern$'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes'
    ) then$pattern$;
  new_numeric_fields constant text :=
    $pattern$'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'score'
    ) then$pattern$;
  old_numeric_sort constant text :=
    $pattern$when 'total_time_minutes' then recipe.total_time_minutes::numeric$pattern$;
  new_numeric_sort constant text :=
    $pattern$when 'total_time_minutes' then recipe.total_time_minutes::numeric
        when 'score' then recipe.score::numeric$pattern$;
  old_marker_branch constant text :=
    $pattern$    elsif field_name = 'total_time_minutes' and operator_name = 'in' then$pattern$;
  new_marker_branch constant text :=
    $pattern$    elsif field_name in ('starred', 'hearted') then
      if operator_name not in ('is', 'is_not')
        or pg_catalog.jsonb_typeof(filter->'value') <> 'array'
        or pg_catalog.jsonb_array_length(filter->'value') <> 1
        or pg_catalog.jsonb_typeof(filter->'value'->0) <> 'string'
        or filter->'value'->>0 not in ('true', 'false') then
        raise exception 'Marker filters require one boolean value and a supported operator.'
          using errcode = '22023';
      end if;
    elsif field_name = 'total_time_minutes' and operator_name = 'in' then$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes(text,integer,integer,jsonb,text,text,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_sort_key) = 0
    or pg_catalog.strpos(function_source, old_filter_fields) = 0
    or pg_catalog.strpos(function_source, old_numeric_fields) = 0
    or pg_catalog.strpos(function_source, old_numeric_sort) = 0
    or pg_catalog.strpos(function_source, old_marker_branch) = 0 then
    raise exception 'Expected recipe search validation expressions were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_sort_key, new_sort_key);
  function_source := pg_catalog.replace(function_source, old_filter_fields, new_filter_fields);
  function_source := pg_catalog.replace(function_source, old_numeric_fields, new_numeric_fields);
  function_source := pg_catalog.replace(function_source, old_numeric_sort, new_numeric_sort);
  function_source := pg_catalog.replace(function_source, old_marker_branch, new_marker_branch);
  execute function_source;
end;
$$;

do $$
declare
  function_source text;
  old_import_context constant text :=
    $pattern$    perform pg_catalog.set_config(
      'app.database_import_recipe_is_private',
      coalesce(record_data->>'is_private', 'true'),
      true
    );$pattern$;
  new_import_context constant text :=
    $pattern$    perform pg_catalog.set_config(
      'app.database_import_recipe_is_private',
      coalesce(record_data->>'is_private', 'true'),
      true
    );
    perform pg_catalog.set_config('app.recipe_score_save', 'on', true);
    perform pg_catalog.set_config(
      'app.recipe_score_value',
      coalesce(record_data->>'score', ''),
      true
    );
    perform pg_catalog.set_config('app.recipe_markers_save', 'on', true);
    perform pg_catalog.set_config(
      'app.recipe_starred_value',
      coalesce(record_data->>'is_starred', 'false'),
      true
    );
    perform pg_catalog.set_config(
      'app.recipe_hearted_value',
      coalesce(record_data->>'is_hearted', 'false'),
      true
    );$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.commit_database_import_without_ingredient_sets(uuid,jsonb,jsonb,jsonb,uuid[],uuid[])'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_import_context) = 0 then
    raise exception 'Expected database import recipe context was not found';
  end if;

  execute pg_catalog.replace(function_source, old_import_context, new_import_context);
end;
$$;

notify pgrst, 'reload schema';
