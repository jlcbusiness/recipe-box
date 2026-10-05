alter table public.recipe_ingredient_measurements
  drop constraint recipe_ingredient_measurement_account_id_recipe_ingredient_fkey,
  add constraint recipe_ingredient_measurement_account_id_recipe_ingredient_fkey
    foreign key (account_id, recipe_ingredient_id)
    references public.recipe_ingredients (account_id, id)
    on delete cascade on update cascade;

create or replace function public.save_recipe(
  p_recipe_id uuid, p_expected_version integer, p_name text, p_food_type_id uuid, p_state text,
  p_verdict_id uuid, p_enthusiasm_id uuid, p_occasion_details text, p_reason text, p_serves integer,
  p_prep_time_minutes integer, p_mixing_time_minutes integer, p_marinate_time_minutes integer,
  p_chill_time_minutes integer, p_freeze_time_minutes integer, p_cook_time_minutes integer,
  p_bake_time_minutes integer, p_cooling_time_minutes integer, p_rest_time_minutes integer,
  p_total_time_minutes integer, p_notes_markdown text, p_meal_type_ids uuid[], p_cuisine_ids uuid[],
  p_equipment_ids uuid[], p_ingredient_rows jsonb, p_instruction_steps jsonb
)
returns table (id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  saved_id uuid;
  saved_version integer;
  before_steps jsonb;
  ingredient_ids jsonb;
  ingredient_row jsonb;
  submitted_ingredient_id uuid;
  step_data jsonb;
  step_id uuid;
  step_position integer := 0;
  content_markdown text;
  plain_text text;
  unknown_step_key text;
  client_ingredient_id text;
  persisted_ingredient_id text;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_instruction_steps is null or jsonb_typeof(p_instruction_steps) <> 'array' then
    raise exception 'Instruction steps must be an array.' using errcode = '23514';
  end if;

  if (
    select count(*) <> count(distinct submitted_ids.ingredient_id)
    from (
      select nullif(value->>'recipe_ingredient_id', '')::uuid as ingredient_id
      from jsonb_array_elements(p_ingredient_rows)
    ) as submitted_ids
    where submitted_ids.ingredient_id is not null
  ) then
    raise exception 'Recipe ingredient IDs must be unique.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_ingredient_rows) as input(value)
    join public.recipe_ingredients as existing
      on existing.id = nullif(input.value->>'recipe_ingredient_id', '')::uuid
    where existing.account_id <> owner_id
      or (p_recipe_id is not null and existing.recipe_id <> p_recipe_id)
  ) then
    raise exception 'Recipe ingredient ID is not available to this recipe.' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', step.id, 'position', step.position, 'content_markdown', step.content_markdown,
    'plain_text', step.plain_text
  ) order by step.position), '[]'::jsonb)
  into before_steps
  from public.recipe_steps as step
  where step.account_id = owner_id and step.recipe_id = p_recipe_id;
  perform pg_catalog.set_config('app.recipe_steps_before', before_steps::text, true);

  delete from public.recipe_steps as step
  where step.account_id = owner_id and step.recipe_id = p_recipe_id;

  select saved_recipe.id, saved_recipe.version into saved_id, saved_version
  from public.save_recipe(
    p_recipe_id, p_expected_version, p_name, p_food_type_id, p_state, p_verdict_id,
    p_enthusiasm_id, p_occasion_details, p_reason, p_serves, p_prep_time_minutes,
    p_mixing_time_minutes, p_marinate_time_minutes, p_chill_time_minutes,
    p_freeze_time_minutes, p_cook_time_minutes, p_bake_time_minutes, p_cooling_time_minutes,
    p_rest_time_minutes, p_total_time_minutes, p_notes_markdown, p_ingredient_rows,
    p_meal_type_ids, p_cuisine_ids, p_equipment_ids
  ) as saved_recipe;

  for ingredient_row in
    select value from jsonb_array_elements(p_ingredient_rows) with ordinality as input(value, ordinal)
    order by input.ordinal
  loop
    submitted_ingredient_id := nullif(ingredient_row->>'recipe_ingredient_id', '')::uuid;
    if submitted_ingredient_id is not null then
      update public.recipe_ingredients as saved_ingredient
      set id = submitted_ingredient_id
      where saved_ingredient.account_id = owner_id
        and saved_ingredient.recipe_id = saved_id
        and saved_ingredient.position = step_position;
    end if;
    step_position := step_position + 1;
  end loop;

  select coalesce(jsonb_object_agg(client_row.id::text, saved_ingredient.id::text), '{}'::jsonb)
  into ingredient_ids
  from jsonb_array_elements(p_ingredient_rows) with ordinality as ingredient_row(value, ordinal)
  join lateral (
    select nullif(ingredient_row.value->>'recipe_ingredient_id', '')::uuid as id
  ) as client_row on client_row.id is not null
  join public.recipe_ingredients as saved_ingredient
    on saved_ingredient.account_id = owner_id
    and saved_ingredient.recipe_id = saved_id
    and saved_ingredient.position = ingredient_row.ordinal - 1;

  delete from public.recipe_steps as step
  where step.account_id = owner_id and step.recipe_id = saved_id;

  step_position := 0;
  for step_data in
    select step_entry.value
    from jsonb_array_elements(p_instruction_steps) with ordinality as step_entry(value, ordinal)
    order by step_entry.ordinal
  loop
    if jsonb_typeof(step_data) <> 'object' then
      raise exception 'Each instruction step must be an object.' using errcode = '23514';
    end if;
    select object_key.key into unknown_step_key
    from jsonb_object_keys(step_data) as object_key(key)
    where object_key.key not in ('id', 'position', 'content_markdown', 'plain_text')
    limit 1;
    if unknown_step_key is not null then
      raise exception 'Instruction step contains an unknown field.' using errcode = '23514';
    end if;

    step_id := nullif(step_data->>'id', '')::uuid;
    content_markdown := nullif(trim(step_data->>'content_markdown'), '');
    plain_text := trim(coalesce(step_data->>'plain_text', ''));
    if step_id is null or content_markdown is null then
      raise exception 'Instruction step ID and Markdown are required.' using errcode = '23514';
    end if;
    if nullif(step_data->>'position', '')::integer is distinct from step_position then
      raise exception 'Instruction step positions must be contiguous and ordered.' using errcode = '23514';
    end if;

    for client_ingredient_id, persisted_ingredient_id in select key, value from jsonb_each_text(ingredient_ids)
    loop
      content_markdown := replace(
        content_markdown,
        '[[ingredient:' || client_ingredient_id || '|',
        '[[ingredient:' || persisted_ingredient_id || '|'
      );
    end loop;

    insert into public.recipe_steps (id, account_id, recipe_id, position, content_markdown, plain_text)
    values (step_id, owner_id, saved_id, step_position, content_markdown, plain_text);
    step_position := step_position + 1;
  end loop;

  return query select saved_id, saved_version;
end;
$$;