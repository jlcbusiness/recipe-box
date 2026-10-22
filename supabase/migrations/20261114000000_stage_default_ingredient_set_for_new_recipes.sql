create or replace function public.save_recipe_with_ingredient_sets(
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
  p_ingredient_sets jsonb
)
returns table (id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  set_data jsonb;
  saved_id uuid;
  saved_version integer;
  before_sets jsonb := '[]'::jsonb;
  updated_rows integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_ingredient_sets is null
    or jsonb_typeof(p_ingredient_sets) <> 'array'
    or jsonb_array_length(p_ingredient_sets) = 0
    or p_ingredient_rows is null
    or jsonb_typeof(p_ingredient_rows) <> 'array'
  then
    raise exception 'Ingredient sets and rows are invalid.' using errcode = '23514';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_ingredient_sets) with ordinality as item(value, ordinal)
    where jsonb_typeof(item.value) <> 'object'
      or nullif(item.value->>'id', '') is null
      or nullif(item.value->>'label', '') is null
      or item.value->>'label' <> btrim(item.value->>'label')
      or char_length(item.value->>'label') not between 1 and 80
      or (item.value->>'position')::integer <> item.ordinal - 1
      or exists (
        select 1 from jsonb_object_keys(item.value) as field(key)
        where field.key not in ('id', 'label', 'position')
      )
  ) then
    raise exception 'Ingredient set labels or order are invalid.' using errcode = '23514';
  end if;
  if (
    select count(*) <> count(distinct (item.value->>'id')::uuid)
    from jsonb_array_elements(p_ingredient_sets) as item(value)
  ) or (
    select count(*) <> count(distinct lower(normalize(btrim(item.value->>'label'), NFKC)))
    from jsonb_array_elements(p_ingredient_sets) as item(value)
  ) then
    raise exception 'Ingredient set identifiers and labels must be unique.' using errcode = '23514';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_ingredient_rows) as item(value)
    where nullif(item.value->>'ingredient_set_id', '') is null
      or not exists (
        select 1 from jsonb_array_elements(p_ingredient_sets) as requested(value)
        where requested.value->>'id' = item.value->>'ingredient_set_id'
      )
  ) then
    raise exception 'Every ingredient row must belong to a submitted set.' using errcode = '23514';
  end if;
  if p_recipe_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', ingredient_set.id,
      'label', ingredient_set.label,
      'position', ingredient_set.position
    ) order by ingredient_set.position), '[]'::jsonb)
    into before_sets
    from public.recipe_ingredient_sets as ingredient_set
    where ingredient_set.account_id = owner_id
      and ingredient_set.recipe_id = p_recipe_id;
  end if;
  perform pg_catalog.set_config('app.recipe_ingredient_sets_before', before_sets::text, true);

  if p_recipe_id is not null then
    if exists (
      select 1
      from jsonb_array_elements(p_ingredient_sets) as item(value)
      join public.recipe_ingredient_sets as existing
        on existing.account_id = owner_id
        and existing.id = (item.value->>'id')::uuid
        and existing.recipe_id <> p_recipe_id
    ) then
      raise exception 'An ingredient set ID is not available to this recipe.' using errcode = '23514';
    end if;

    update public.recipe_ingredient_sets as existing
    set label = gen_random_uuid()::text
    where existing.account_id = owner_id
      and existing.recipe_id = p_recipe_id;

    for set_data in select item.value from jsonb_array_elements(p_ingredient_sets) as item(value)
    loop
      insert into public.recipe_ingredient_sets (account_id, recipe_id, id, label, position)
      values (
        owner_id, p_recipe_id, (set_data->>'id')::uuid,
        btrim(set_data->>'label'), (set_data->>'position')::integer
      )
      on conflict on constraint recipe_ingredient_sets_recipe_owner_id_key
      do update set label = excluded.label, position = excluded.position;
    end loop;
    perform pg_catalog.set_config('app.recipe_ingredient_set_save_context', 'on', true);
    perform pg_catalog.set_config(
      'app.recipe_ingredient_set_save_rows', p_ingredient_rows::text, true
    );
  end if;

  select saved.id, saved.version into saved_id, saved_version
  from public.save_recipe_with_relationships(
    p_recipe_id, p_expected_version, p_name, p_food_type_id, p_state,
    p_verdict_id, p_enthusiasm_id, p_occasion_details, p_reason, p_serves,
    p_prep_time_minutes, p_mixing_time_minutes, p_marinate_time_minutes,
    p_chill_time_minutes, p_freeze_time_minutes, p_cook_time_minutes,
    p_bake_time_minutes, p_cooling_time_minutes, p_rest_time_minutes,
    p_total_time_minutes, p_notes_markdown, p_meal_type_ids, p_cuisine_ids,
    p_equipment_ids, case
      when p_recipe_id is null then (
        select coalesce(jsonb_agg(item.value - 'ingredient_set_id' order by item.ordinality), '[]'::jsonb)
        from jsonb_array_elements(p_ingredient_rows) with ordinality as item(value, ordinality)
      )
      else p_ingredient_rows
    end, p_instruction_steps, p_publication_id,
    p_publication_page, p_recipe_url, p_recipe_relationships, p_tag_ids
  ) as saved;

  if p_recipe_id is null and exists (
    select 1
    from jsonb_array_elements(p_ingredient_sets) as item(value)
    join public.recipe_ingredient_sets as existing
      on existing.account_id = owner_id
      and existing.id = (item.value->>'id')::uuid
      and existing.recipe_id <> saved_id
  ) then
    raise exception 'An ingredient set ID is not available to this recipe.' using errcode = '23514';
  end if;

  if p_recipe_id is null then
    update public.recipe_ingredient_sets as existing
    set label = gen_random_uuid()::text
    where existing.account_id = owner_id
      and existing.recipe_id = saved_id;

    for set_data in select item.value from jsonb_array_elements(p_ingredient_sets) as item(value)
    loop
      insert into public.recipe_ingredient_sets (account_id, recipe_id, id, label, position)
      values (
        owner_id, saved_id, (set_data->>'id')::uuid,
        btrim(set_data->>'label'), (set_data->>'position')::integer
      )
      on conflict on constraint recipe_ingredient_sets_recipe_owner_id_key
      do update set label = excluded.label, position = excluded.position;
    end loop;
  end if;

  update public.recipe_ingredients as saved_ingredient
  set ingredient_set_id = (submitted.value->>'ingredient_set_id')::uuid
  from jsonb_array_elements(p_ingredient_rows) with ordinality as submitted(value, ordinal)
  where saved_ingredient.account_id = owner_id
    and saved_ingredient.recipe_id = saved_id
    and saved_ingredient.position = submitted.ordinal - 1
    and saved_ingredient.id = (submitted.value->>'recipe_ingredient_id')::uuid;
  get diagnostics updated_rows = row_count;
  if updated_rows <> jsonb_array_length(p_ingredient_rows) then
    raise exception 'An ingredient row changed while saving its set.' using errcode = '23514';
  end if;

  delete from public.recipe_ingredient_sets as ingredient_set
  where ingredient_set.account_id = owner_id
    and ingredient_set.recipe_id = saved_id
    and not exists (
      select 1
      from jsonb_array_elements(p_ingredient_sets) as submitted(value)
      where submitted.value->>'id' = ingredient_set.id::text
    );

  return query select saved_id, saved_version;
end;
$$;

notify pgrst, 'reload schema';