create table public.recipe_ingredient_sets (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  recipe_id uuid not null,
  label text not null,
  position integer not null check (position >= 0),
  primary key (account_id, id),
  constraint recipe_ingredient_sets_recipe_owner_id_key
    unique (account_id, recipe_id, id),
  constraint recipe_ingredient_sets_label_check
    check (label = btrim(label) and char_length(label) between 1 and 80),
  constraint recipe_ingredient_sets_recipe_fkey
    foreign key (account_id, recipe_id)
    references public.recipes (account_id, id) on delete cascade
);

create unique index recipe_ingredient_sets_label_key
  on public.recipe_ingredient_sets (account_id, recipe_id, lower(normalize(label, NFKC)));

insert into public.recipe_ingredient_sets (account_id, recipe_id, label, position)
select recipe.account_id, recipe.id, 'Main', 0
from public.recipes as recipe;

alter table public.recipe_ingredients
  add column ingredient_set_id uuid;

update public.recipe_ingredients as ingredient
set ingredient_set_id = ingredient_set.id
from public.recipe_ingredient_sets as ingredient_set
where ingredient_set.account_id = ingredient.account_id
  and ingredient_set.recipe_id = ingredient.recipe_id
  and ingredient_set.label = 'Main';

alter table public.recipe_ingredients
  alter column ingredient_set_id set not null,
  add constraint recipe_ingredients_set_fkey
    foreign key (account_id, recipe_id, ingredient_set_id)
    references public.recipe_ingredient_sets (account_id, recipe_id, id)
    on delete restrict;

create function private.assign_default_recipe_ingredient_set()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

revoke all on function private.assign_default_recipe_ingredient_set()
  from public, anon, authenticated;

create trigger recipe_ingredients_assign_default_set
  before insert on public.recipe_ingredients
  for each row execute function private.assign_default_recipe_ingredient_set();

alter table public.recipe_ingredient_sets enable row level security;
grant select, insert, update, delete on public.recipe_ingredient_sets to authenticated;

create policy "Account owners can read recipe ingredient sets"
  on public.recipe_ingredient_sets
  for select to authenticated
  using (account_id = (select auth.uid()));

create policy "Account owners can manage recipe ingredient sets"
  on public.recipe_ingredient_sets
  for all to authenticated
  using (
    account_id = (select auth.uid())
    and exists (
      select 1 from public.recipes as recipe
      where recipe.account_id = recipe_ingredient_sets.account_id
        and recipe.id = recipe_ingredient_sets.recipe_id
        and recipe.trashed_at is null
    )
  )
  with check (
    account_id = (select auth.uid())
    and exists (
      select 1 from public.recipes as recipe
      where recipe.account_id = recipe_ingredient_sets.account_id
        and recipe.id = recipe_ingredient_sets.recipe_id
        and recipe.trashed_at is null
    )
  );

create function private.create_default_recipe_ingredient_set()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.recipe_ingredient_sets (account_id, recipe_id, label, position)
  values (new.account_id, new.id, 'Main', 0);
  return new;
end;
$$;

revoke all on function private.create_default_recipe_ingredient_set()
  from public, anon, authenticated;

create trigger recipes_create_default_ingredient_set
  after insert on public.recipes
  for each row execute function private.create_default_recipe_ingredient_set();

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

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', ingredient_set.id,
      'label', ingredient_set.label,
      'position', ingredient_set.position
    ) order by ingredient_set.position),
    '[]'::jsonb
  )
  into after_ingredient_sets
  from public.recipe_ingredient_sets as ingredient_set
  where ingredient_set.account_id = new.account_id
    and ingredient_set.recipe_id = new.id;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'ingredient_id', recipe_ingredient.ingredient_id,
      'name', ingredient.name,
      'ingredient_set_id', recipe_ingredient.ingredient_set_id,
      'position', recipe_ingredient.position,
      'is_main', recipe_ingredient.is_main,
      'detail', recipe_ingredient.detail,
      'preparation', recipe_ingredient.preparation,
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
    ) order by recipe_ingredient.position),
    '[]'::jsonb
  )
  into after_ingredients
  from public.recipe_ingredients as recipe_ingredient
  join public.ingredients as ingredient
    on ingredient.account_id = recipe_ingredient.account_id
    and ingredient.id = recipe_ingredient.ingredient_id
  where recipe_ingredient.account_id = new.account_id
    and recipe_ingredient.recipe_id = new.id;

  insert into public.recipe_history (
    account_id,
    actor_user_id,
    record_id,
    event_type,
    before_data,
    after_data
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

create function public.save_recipe_with_ingredient_sets(
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

revoke all on function public.save_recipe_with_ingredient_sets(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text,
  text, jsonb, uuid[], jsonb
) from public, anon;
grant execute on function public.save_recipe_with_ingredient_sets(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text,
  text, jsonb, uuid[], jsonb
) to authenticated;

notify pgrst, 'reload schema';