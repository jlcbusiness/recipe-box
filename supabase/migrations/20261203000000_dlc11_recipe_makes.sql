alter table public.recipes
  add column makes_quantity integer,
  add column makes_thing text,
  add constraint recipes_makes_pair_check
    check (
      (makes_quantity is null and makes_thing is null)
      or (
        makes_quantity > 0
        and makes_thing is not null
        and pg_catalog.btrim(makes_thing) <> ''
      )
    );

create function private.apply_recipe_makes_before_save()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_setting('app.recipe_makes_save', true) = 'on' then
    new.makes_quantity := nullif(current_setting('app.recipe_makes_quantity', true), '')::integer;
    new.makes_thing := nullif(current_setting('app.recipe_makes_thing', true), '');
  end if;

  return new;
end;
$$;

revoke all on function private.apply_recipe_makes_before_save()
  from public, anon, authenticated;

create trigger recipes_apply_makes_before_save
  before insert or update on public.recipes
  for each row execute function private.apply_recipe_makes_before_save();

create function public.save_recipe_with_makes(
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
  p_score smallint,
  p_makes_quantity integer,
  p_makes_thing text
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

  if (p_makes_quantity is null) <> (p_makes_thing is null)
    or (
      p_makes_quantity is not null
      and (
        p_makes_quantity <= 0
        or pg_catalog.btrim(p_makes_thing) = ''
      )
    ) then
    raise exception 'Makes requires a positive quantity and non-empty thing.'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config('app.recipe_makes_save', 'on', true);
  perform pg_catalog.set_config(
    'app.recipe_makes_quantity',
    coalesce(p_makes_quantity::text, ''),
    true
  );
  perform pg_catalog.set_config(
    'app.recipe_makes_thing',
    coalesce(p_makes_thing, ''),
    true
  );

  return query
  select saved.id, saved.version
  from public.save_recipe_with_score(
    p_recipe_id, p_expected_version, p_name, p_food_type_id, p_state,
    p_verdict_id, p_enthusiasm_id, p_occasion_details, p_reason, p_serves,
    p_prep_time_minutes, p_mixing_time_minutes, p_marinate_time_minutes,
    p_chill_time_minutes, p_freeze_time_minutes, p_cook_time_minutes,
    p_bake_time_minutes, p_cooling_time_minutes, p_rest_time_minutes,
    p_total_time_minutes, p_notes_markdown, p_meal_type_ids, p_cuisine_ids,
    p_equipment_ids, p_ingredient_rows, p_instruction_steps, p_publication_id,
    p_publication_page, p_recipe_url, p_recipe_relationships, p_tag_ids,
    p_ingredient_sets, p_score
  ) as saved;
end;
$$;

revoke all on function public.save_recipe_with_makes(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text,
  text, jsonb, uuid[], jsonb, smallint, integer, text
) from public, anon;
grant execute on function public.save_recipe_with_makes(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text,
  text, jsonb, uuid[], jsonb, smallint, integer, text
) to authenticated;

alter table public.accounts
  drop constraint accounts_recipe_column_order_check;

update public.accounts
set recipe_column_order = array_append(recipe_column_order, 'makes')
where not ('makes' = any(recipe_column_order));

alter table public.accounts
  alter column recipe_column_order set default array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
    'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
    'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
    'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
    'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
    'score', 'starred', 'hearted'
  ]::text[];

alter table public.accounts
  add constraint accounts_recipe_column_order_check
  check (
    pg_catalog.cardinality(recipe_column_order) = 33
    and pg_catalog.array_position(recipe_column_order, null) is null
    and recipe_column_order @> array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
      'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
      'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
      'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
      'score', 'starred', 'hearted'
    ]::text[]
    and recipe_column_order <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
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
      'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
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
    'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
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

do $$
declare
  function_source text;
  old_visible_limit constant text :=
    'jsonb_array_length(v_preferences->''visible_columns'') > 33';
  new_visible_limit constant text :=
    'jsonb_array_length(v_preferences->''visible_columns'') > 34';
  old_visible_columns constant text :=
    $pattern$'publication_source', 'score', 'starred', 'hearted'
    ];$pattern$;
  new_visible_columns constant text :=
    $pattern$'publication_source', 'score', 'starred', 'hearted', 'makes'
    ];$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_with_legacy_validation(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_visible_limit) = 0
    or pg_catalog.strpos(function_source, old_visible_columns) = 0 then
    raise exception 'Expected explorer display preference validation expressions were not found';
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
    $pattern$p_state->>'sort' not in ('relevance', 'name', 'publication', 'publication_page', 'recipe_url', 'state', 'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation', 'score')$pattern$;
  new_sort_key constant text :=
    $pattern$p_state->>'sort' not in ('relevance', 'name', 'publication', 'publication_page', 'recipe_url', 'state', 'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation', 'score')$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_v1(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_sort_key) = 0 then
    raise exception 'Expected recipe explorer sort validation expression was not found';
  end if;

  execute pg_catalog.replace(function_source, old_sort_key, new_sort_key);
end;
$$;

do $$
declare
  function_source text;
  old_sort_key constant text :=
    $pattern$'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
    'score'$pattern$;
  new_sort_key constant text :=
    $pattern$'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
    'score', 'makes'$pattern$;
  old_sort_text constant text :=
    $pattern$when 'citation' then citation_columns.citation$pattern$;
  new_sort_text constant text :=
    $pattern$when 'citation' then citation_columns.citation
        when 'makes' then recipe.makes_thing$pattern$;
  old_numeric_sort constant text :=
    $pattern$when 'total_time_minutes' then recipe.total_time_minutes::numeric
        when 'score' then recipe.score::numeric$pattern$;
  new_numeric_sort constant text :=
    $pattern$when 'total_time_minutes' then recipe.total_time_minutes::numeric
        when 'score' then recipe.score::numeric
        when 'makes' then recipe.makes_quantity::numeric$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes(text,integer,integer,jsonb,text,text,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_sort_key) = 0
    or pg_catalog.strpos(function_source, old_sort_text) = 0
    or pg_catalog.strpos(function_source, old_numeric_sort) = 0 then
    raise exception 'Expected recipe search sort expressions were not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_sort_key, new_sort_key);
  function_source := pg_catalog.replace(function_source, old_sort_text, new_sort_text);
  function_source := pg_catalog.replace(function_source, old_numeric_sort, new_numeric_sort);
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
    );
    perform pg_catalog.set_config('app.recipe_makes_save', 'on', true);
    perform pg_catalog.set_config(
      'app.recipe_makes_quantity',
      coalesce(record_data->>'makes_quantity', ''),
      true
    );
    perform pg_catalog.set_config(
      'app.recipe_makes_thing',
      coalesce(record_data->>'makes_thing', ''),
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
