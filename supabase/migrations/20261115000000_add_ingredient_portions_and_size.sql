do $$
begin
  if exists (
    select 1
    from public.recipe_ingredients as ingredient
    group by ingredient.account_id, ingredient.recipe_id,
      ingredient.ingredient_set_id, ingredient.ingredient_id
    having count(*) > 1
  ) then
    raise exception 'Resolve repeated ingredients within each section before applying this migration.'
      using errcode = '23505';
  end if;
end;
$$;

alter table public.recipe_ingredients
  add column portion_one_ratio numeric,
  add column size_value numeric,
  add column size_unit text,
  add constraint recipe_ingredients_portion_one_ratio_check
    check (portion_one_ratio is null or (portion_one_ratio > 0 and portion_one_ratio < 1)),
  add constraint recipe_ingredients_size_pair_check
    check (
      (size_value is null and size_unit is null)
      or (
        size_value is not null
        and size_value > 0
        and size_value < 'Infinity'::numeric
        and size_unit in ('in', 'cm')
      )
    ),
  add constraint recipe_ingredients_size_requires_cubed_check
    check (size_value is null or lower(btrim(preparation)) = 'cubed');

alter table public.recipe_ingredients
  add constraint recipe_ingredients_account_set_ingredient_key
    unique (account_id, ingredient_set_id, ingredient_id)
    deferrable initially deferred;

alter table public.recipe_step_mentions
  add column portion_ordinal smallint,
  add constraint recipe_step_mentions_portion_ordinal_check
    check (portion_ordinal is null or portion_ordinal in (1, 2));

create or replace function public.recipe_step_mentions_after_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mention_match text[];
  mention_position smallint := 0;
  mentioned_ingredient_id uuid;
  portion_ordinal smallint;
  marker_pattern constant text :=
    '\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?::([12]))?\|[^\]\r\n]+\]\]';
begin
  if regexp_replace(new.content_markdown, marker_pattern, '', 'gi') ~ '\[\[ingredient:' then
    raise exception 'Instruction contains an invalid ingredient mention.' using errcode = '23514';
  end if;

  for mention_match in
    select regexp_matches(new.content_markdown, marker_pattern, 'gi')
  loop
    mentioned_ingredient_id := mention_match[1]::uuid;
    portion_ordinal := nullif(mention_match[2], '')::smallint;
    if not exists (
      select 1
      from public.recipe_ingredients as ingredient
      where ingredient.account_id = new.account_id
        and ingredient.recipe_id = new.recipe_id
        and ingredient.id = mentioned_ingredient_id
        and (portion_ordinal is null or ingredient.portion_one_ratio is not null)
    ) then
      raise exception 'Instruction mentions must reference an available ingredient portion in this recipe.'
        using errcode = '23514';
    end if;

    insert into public.recipe_step_mentions (
      account_id, recipe_id, recipe_step_id, recipe_ingredient_id, position, portion_ordinal
    )
    values (
      new.account_id, new.recipe_id, new.id, mentioned_ingredient_id,
      mention_position, portion_ordinal
    );
    mention_position := mention_position + 1;
  end loop;

  return new;
end;
$$;

create or replace function public.recipe_history_capture_mentions_before_recipe_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mention_snapshot jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'recipe_step_id', mention.recipe_step_id,
        'position', mention.position,
        'recipe_ingredient_id', mention.recipe_ingredient_id,
        'portion_ordinal', mention.portion_ordinal
      ) order by step.position, mention.position
    ),
    '[]'::jsonb
  )
  into mention_snapshot
  from public.recipe_step_mentions as mention
  join public.recipe_steps as step
    on step.account_id = mention.account_id
    and step.recipe_id = mention.recipe_id
    and step.id = mention.recipe_step_id
  where mention.account_id = old.account_id
    and mention.recipe_id = old.id;

  perform pg_catalog.set_config('app.recipe_mentions_before', mention_snapshot::text, true);
  return new;
end;
$$;

create or replace function public.recipe_history_add_instruction_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_setting text := nullif(current_setting('app.recipe_steps_before', true), '');
  before_mentions_setting text := nullif(current_setting('app.recipe_mentions_before', true), '');
  raw_before_steps jsonb;
  before_mentions jsonb := coalesce(before_mentions_setting::jsonb, '[]'::jsonb);
  before_steps jsonb;
  after_steps jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', step.id,
        'position', step.position,
        'content_markdown', step.content_markdown,
        'plain_text', step.plain_text,
        'mentions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'position', mention.position,
            'recipe_ingredient_id', mention.recipe_ingredient_id,
            'portion_ordinal', mention.portion_ordinal
          ) order by mention.position)
          from public.recipe_step_mentions as mention
          where mention.account_id = step.account_id
            and mention.recipe_id = step.recipe_id
            and mention.recipe_step_id = step.id
        ), '[]'::jsonb)
      ) order by step.position
    ),
    '[]'::jsonb
  )
  into after_steps
  from public.recipe_steps as step
  where step.account_id = new.account_id
    and step.recipe_id = new.record_id;

  if before_setting is not null then
    raw_before_steps := before_setting::jsonb;
  elsif new.before_data is not null then
    raw_before_steps := after_steps;
  else
    raw_before_steps := '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      step_entry.value || jsonb_build_object(
        'mentions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'position', mention_entry.value->'position',
            'recipe_ingredient_id', mention_entry.value->'recipe_ingredient_id',
            'portion_ordinal', mention_entry.value->'portion_ordinal'
          ) order by (mention_entry.value->>'position')::integer)
          from jsonb_array_elements(before_mentions) as mention_entry(value)
          where mention_entry.value->>'recipe_step_id' = step_entry.value->>'id'
        ), '[]'::jsonb)
      ) order by step_entry.ordinal
    ),
    '[]'::jsonb
  )
  into before_steps
  from jsonb_array_elements(raw_before_steps) with ordinality as step_entry(value, ordinal);

  if new.before_data is not null then
    new.before_data := new.before_data || jsonb_build_object('steps', before_steps);
  end if;
  new.after_data := new.after_data || jsonb_build_object('steps', after_steps);
  return new;
end;
$$;

create or replace function private.assign_default_recipe_ingredient_set()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  imported_row jsonb;
begin
  if current_setting('app.database_import_context', true) = 'on' then
    select item.value into imported_row
    from jsonb_array_elements(
      nullif(current_setting('app.database_import_recipe_ingredients', true), '')::jsonb
    ) as item(value)
    where item.value->>'recipe_id' = new.recipe_id::text
      and (item.value->>'position')::integer = new.position;
    new.ingredient_set_id := nullif(imported_row->>'ingredient_set_id', '')::uuid;
    new.portion_one_ratio := nullif(imported_row->>'portion_one_ratio', '')::numeric;
    new.size_value := nullif(imported_row->>'size_value', '')::numeric;
    new.size_unit := nullif(imported_row->>'size_unit', '');
  end if;

  if current_setting('app.recipe_ingredient_set_save_context', true) = 'on' then
    select item.value into imported_row
    from jsonb_array_elements(
      nullif(current_setting('app.recipe_ingredient_set_save_rows', true), '')::jsonb
    ) with ordinality as item(value, row_position)
    where item.row_position - 1 = new.position;
    new.ingredient_set_id := nullif(imported_row->>'ingredient_set_id', '')::uuid;
    new.portion_one_ratio := nullif(imported_row->>'portion_one_ratio', '')::numeric;
    new.size_value := nullif(imported_row->>'size_value', '')::numeric;
    new.size_unit := nullif(imported_row->>'size_unit', '');
  end if;

  if current_setting('app.recipe_ingredient_portion_save_rows', true) is not null then
    select item.value into imported_row
    from jsonb_array_elements(
      nullif(current_setting('app.recipe_ingredient_portion_save_rows', true), '')::jsonb
    ) with ordinality as item(value, row_position)
    where item.row_position - 1 = new.position;
    new.portion_one_ratio := nullif(imported_row->>'portion_one_ratio', '')::numeric;
    new.size_value := nullif(imported_row->>'size_value', '')::numeric;
    new.size_unit := nullif(imported_row->>'size_unit', '');
  end if;

  if new.ingredient_set_id is null then
    select ingredient_set.id into new.ingredient_set_id
    from public.recipe_ingredient_sets as ingredient_set
    where ingredient_set.account_id = new.account_id
      and ingredient_set.recipe_id = new.recipe_id
      and ingredient_set.label = 'Main';
  end if;
  if new.ingredient_set_id is null then
    raise exception 'A recipe ingredient set is required.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.capture_recipe_ingredient_amounts_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_ingredients jsonb := coalesce(
    nullif(current_setting('app.recipe_ingredients_before', true), '')::jsonb,
    '[]'::jsonb
  );
  enriched_ingredients jsonb;
begin
  select coalesce(
    jsonb_agg(
      item.value || jsonb_build_object(
        'ingredient_set_id', ingredient.ingredient_set_id,
        'portion_one_ratio', ingredient.portion_one_ratio,
        'size_value', ingredient.size_value,
        'size_unit', ingredient.size_unit
      ) order by item.ordinality
    ),
    '[]'::jsonb
  )
  into enriched_ingredients
  from jsonb_array_elements(before_ingredients) with ordinality as item(value, ordinality)
  left join public.recipe_ingredients as ingredient
    on ingredient.account_id = old.account_id
    and ingredient.recipe_id = old.id
    and ingredient.position = (item.value->>'position')::integer;

  perform pg_catalog.set_config(
    'app.recipe_ingredients_before', enriched_ingredients::text, true
  );
  return new;
end;
$$;

revoke all on function private.capture_recipe_ingredient_amounts_before()
  from public, anon, authenticated;

create trigger recipes_capture_ingredient_amounts_before
  before update on public.recipes
  for each row execute function private.capture_recipe_ingredient_amounts_before();

create or replace function public.recipe_history_after_save()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_ingredients jsonb := coalesce(
    nullif(current_setting('app.recipe_ingredients_before', true), '')::jsonb,
    '[]'::jsonb
  );
  before_ingredient_sets jsonb := coalesce(
    nullif(current_setting('app.recipe_ingredient_sets_before', true), '')::jsonb,
    '[]'::jsonb
  );
  after_ingredients jsonb;
  after_ingredient_sets jsonb;
begin
  if session_user = 'supabase_auth_admin'
    and old.trashed_at is not null
    and old.trashed_at is not distinct from new.trashed_at
    and old.trashed_by_user_id is not null
    and new.trashed_by_user_id is null
  then
    return new;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ingredient_set.id,
    'label', ingredient_set.label,
    'position', ingredient_set.position
  ) order by ingredient_set.position), '[]'::jsonb)
  into after_ingredient_sets
  from public.recipe_ingredient_sets as ingredient_set
  where ingredient_set.account_id = new.account_id
    and ingredient_set.recipe_id = new.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ingredient_id', recipe_ingredient.ingredient_id,
    'name', ingredient.name,
    'ingredient_set_id', recipe_ingredient.ingredient_set_id,
    'position', recipe_ingredient.position,
    'is_main', recipe_ingredient.is_main,
    'detail', recipe_ingredient.detail,
    'preparation', recipe_ingredient.preparation,
    'portion_one_ratio', recipe_ingredient.portion_one_ratio,
    'size_value', recipe_ingredient.size_value,
    'size_unit', recipe_ingredient.size_unit,
    'measurements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'measurement_type', measurement.measurement_type,
        'amount_min', measurement.amount_min,
        'amount_max', measurement.amount_max,
        'unit_code', measurement.unit_code,
        'picklist_value_id', measurement.picklist_value_id,
        'picklist_value', picklist.value
      ) order by measurement.position)
      from public.recipe_ingredient_measurements as measurement
      left join public.recipe_picklist_values as picklist
        on picklist.account_id = measurement.account_id
        and picklist.id = measurement.picklist_value_id
      where measurement.account_id = recipe_ingredient.account_id
        and measurement.recipe_ingredient_id = recipe_ingredient.id
    ), '[]'::jsonb)
  ) order by recipe_ingredient.position), '[]'::jsonb)
  into after_ingredients
  from public.recipe_ingredients as recipe_ingredient
  join public.ingredients as ingredient
    on ingredient.account_id = recipe_ingredient.account_id
    and ingredient.id = recipe_ingredient.ingredient_id
  where recipe_ingredient.account_id = new.account_id
    and recipe_ingredient.recipe_id = new.id;

  insert into public.recipe_history (
    account_id, actor_user_id, record_id, event_type, before_data, after_data
  )
  values (
    new.account_id,
    auth.uid(),
    new.id,
    case
      when tg_op = 'INSERT' then 'recipe.created'
      when old.trashed_at is null and new.trashed_at is not null then 'recipe.trashed'
      when old.trashed_at is not null and new.trashed_at is null then 'recipe.restored'
      else 'recipe.updated'
    end,
    case
      when tg_op = 'INSERT' then null
      else to_jsonb(old) || jsonb_build_object(
        'ingredients', before_ingredients,
        'ingredient_sets', before_ingredient_sets
      )
    end,
    to_jsonb(new) || jsonb_build_object(
      'ingredients', after_ingredients,
      'ingredient_sets', after_ingredient_sets
    )
  );

  return new;
end;
$$;

create or replace function private.validate_recipe_ingredient_portions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid;
  row_account_id uuid;
  first_ratio numeric;
  valid_measurement_count integer;
  total_measurement_count integer;
begin
  if tg_table_name = 'recipe_ingredient_measurements' then
    row_id := coalesce(new.recipe_ingredient_id, old.recipe_ingredient_id);
    row_account_id := coalesce(new.account_id, old.account_id);
  else
    row_id := coalesce(new.id, old.id);
    row_account_id := coalesce(new.account_id, old.account_id);
  end if;

  select ingredient.portion_one_ratio
  into first_ratio
  from public.recipe_ingredients as ingredient
  where ingredient.account_id = row_account_id
    and ingredient.id = row_id;
  if not found or first_ratio is null then
    return null;
  end if;

  select
    count(*) filter (
      where measurement.measurement_type in ('volume', 'weight', 'count', 'informal')
        and measurement.amount_min is not null
        and measurement.amount_min > 0
        and measurement.amount_max is null
    ),
    count(*)
  into valid_measurement_count, total_measurement_count
  from public.recipe_ingredient_measurements as measurement
  where measurement.account_id = row_account_id
    and measurement.recipe_ingredient_id = row_id;

  if total_measurement_count = 0 or valid_measurement_count <> total_measurement_count then
    raise exception 'Only scalar Unit, Count, and Things amounts can be divided.'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke all on function private.validate_recipe_ingredient_portions()
  from public, anon, authenticated;

create constraint trigger recipe_ingredients_validate_portions
  after insert or update on public.recipe_ingredients
  deferrable initially deferred
  for each row execute function private.validate_recipe_ingredient_portions();

create constraint trigger recipe_ingredient_measurements_validate_portions
  after insert or update or delete on public.recipe_ingredient_measurements
  deferrable initially deferred
  for each row execute function private.validate_recipe_ingredient_portions();

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
  perform pg_catalog.set_config(
    'app.recipe_ingredient_portion_save_rows', p_ingredient_rows::text, true
  );
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
  if exists (
    select 1
    from jsonb_array_elements(p_ingredient_rows) as item(value)
    where nullif(item.value->>'portion_one_ratio', '') is not null
      and (
        (item.value->>'portion_one_ratio')::numeric <= 0
        or (item.value->>'portion_one_ratio')::numeric >= 1
        or jsonb_typeof(item.value->'measurements') is distinct from 'array'
        or jsonb_array_length(item.value->'measurements') = 0
        or exists (
          select 1
          from jsonb_array_elements(item.value->'measurements') as measurement(value)
          where measurement.value->>'measurement_type' not in (
              'volume', 'weight', 'count', 'informal'
            )
            or nullif(measurement.value->>'amount_min', '') is null
            or (measurement.value->>'amount_min')::numeric <= 0
            or nullif(measurement.value->>'amount_max', '') is not null
        )
      )
  ) then
    raise exception 'Only scalar Unit, Count, and Things amounts can be divided.'
      using errcode = '23514';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_ingredient_rows) as item(value)
    where (nullif(item.value->>'size_value', '') is null)
      <> (nullif(item.value->>'size_unit', '') is null)
      or (
        nullif(item.value->>'size_value', '') is not null
        and (
          (item.value->>'size_value')::numeric <= 0
          or item.value->>'size_unit' not in ('in', 'cm')
          or lower(btrim(coalesce(item.value->>'preparation', ''))) <> 'cubed'
        )
      )
  ) then
    raise exception 'Size requires a positive value and an inch or centimeter unit on cubed ingredients.'
      using errcode = '23514';
  end if;
  if (
    select count(*) <> count(distinct (
      (item.value->>'ingredient_set_id')::uuid,
      lower(normalize(btrim(coalesce(
        canonical.name,
        nullif(item.value->>'ingredient_name', '')
      )), NFKC))
    ))
    from jsonb_array_elements(p_ingredient_rows) as item(value)
    left join public.ingredients as canonical
      on canonical.account_id = owner_id
      and canonical.id = nullif(item.value->>'ingredient_id', '')::uuid
  ) then
    raise exception 'An ingredient can appear only once in each section.' using errcode = '23505';
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
  set ingredient_set_id = (submitted.value->>'ingredient_set_id')::uuid,
      portion_one_ratio = nullif(submitted.value->>'portion_one_ratio', '')::numeric,
      size_value = nullif(submitted.value->>'size_value', '')::numeric,
      size_unit = nullif(submitted.value->>'size_unit', '')
  from jsonb_array_elements(p_ingredient_rows) with ordinality as submitted(value, ordinal)
  where saved_ingredient.account_id = owner_id
    and saved_ingredient.recipe_id = saved_id
    and saved_ingredient.position = submitted.ordinal - 1
    and saved_ingredient.id = (submitted.value->>'recipe_ingredient_id')::uuid;
  get diagnostics updated_rows = row_count;
  if updated_rows <> jsonb_array_length(p_ingredient_rows) then
    raise exception 'An ingredient row changed while saving its section or portions.' using errcode = '23514';
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