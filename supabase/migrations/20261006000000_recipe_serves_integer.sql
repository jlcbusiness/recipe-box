drop function public.save_recipe(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, numeric, text,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[]
);

do $$
begin
  if exists (
    select 1
    from public.recipes
    where servings is not null
      and servings <> trunc(servings)
  ) then
    raise exception 'Cannot convert fractional Servings to integer Serves.'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.recipes rename column servings to serves;
alter table public.recipes drop constraint recipes_servings_check;
alter table public.recipes
  alter column serves type integer using serves::integer;
alter table public.recipes
  add constraint recipes_serves_check
  check (serves is null or serves > 0);
alter table public.recipes drop column yield_text;

create function public.save_recipe(
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
  p_equipment_ids uuid[]
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
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Recipe name is required.' using errcode = '23514';
  end if;

  if p_state not in ('want_to_try', 'tried', 'will_not_try') then
    raise exception 'Recipe State is invalid.' using errcode = '23514';
  end if;

  if (p_state = 'want_to_try' and (p_verdict_id is not null or p_reason is not null))
    or (p_state = 'tried' and (p_enthusiasm_id is not null or p_reason is not null))
    or (p_state = 'will_not_try' and (p_verdict_id is not null or p_enthusiasm_id is not null or p_occasion_details is not null)) then
    raise exception 'Recipe response fields do not match State.' using errcode = '23514';
  end if;

  if p_occasion_details is not null and not (
    (
      p_state = 'want_to_try'
      and exists (
        select 1 from public.recipe_picklist_values as picklist
        where picklist.account_id = owner_id
          and picklist.category = 'enthusiasm'
          and picklist.id = p_enthusiasm_id
          and picklist.value = 'Specific occasion'
      )
    )
    or (
      p_state = 'tried'
      and exists (
        select 1 from public.recipe_picklist_values as picklist
        where picklist.account_id = owner_id
          and picklist.category = 'verdict'
          and picklist.id = p_verdict_id
          and picklist.value = 'Specific occasion'
      )
    )
  ) then
    raise exception 'Occasion Details require Specific occasion.' using errcode = '23514';
  end if;

  if p_serves is not null and p_serves <= 0 then
    raise exception 'Serves must be greater than zero.' using errcode = '23514';
  end if;

  perform private.set_recipe_save_context();

  if p_recipe_id is null then
    insert into public.recipes (
      account_id, name, food_type_id, state, verdict_id, enthusiasm_id,
      occasion_details, reason, serves, prep_time_minutes,
      mixing_time_minutes, marinate_time_minutes, chill_time_minutes,
      freeze_time_minutes, cook_time_minutes, bake_time_minutes,
      cooling_time_minutes, rest_time_minutes, total_time_minutes, notes_markdown
    )
    values (
      owner_id, trim(p_name), p_food_type_id, p_state, p_verdict_id,
      p_enthusiasm_id, p_occasion_details, p_reason, p_serves,
      p_prep_time_minutes, p_mixing_time_minutes, p_marinate_time_minutes,
      p_chill_time_minutes, p_freeze_time_minutes, p_cook_time_minutes,
      p_bake_time_minutes, p_cooling_time_minutes, p_rest_time_minutes,
      p_total_time_minutes, coalesce(p_notes_markdown, '')
    )
    returning recipes.id, recipes.version into saved_id, saved_version;
  else
    update public.recipes as recipe
    set
      name = trim(p_name),
      food_type_id = p_food_type_id,
      state = p_state,
      verdict_id = p_verdict_id,
      enthusiasm_id = p_enthusiasm_id,
      occasion_details = p_occasion_details,
      reason = p_reason,
      serves = p_serves,
      prep_time_minutes = p_prep_time_minutes,
      mixing_time_minutes = p_mixing_time_minutes,
      marinate_time_minutes = p_marinate_time_minutes,
      chill_time_minutes = p_chill_time_minutes,
      freeze_time_minutes = p_freeze_time_minutes,
      cook_time_minutes = p_cook_time_minutes,
      bake_time_minutes = p_bake_time_minutes,
      cooling_time_minutes = p_cooling_time_minutes,
      rest_time_minutes = p_rest_time_minutes,
      total_time_minutes = p_total_time_minutes,
      notes_markdown = coalesce(p_notes_markdown, ''),
      version = recipe.version + 1
    where recipe.id = p_recipe_id
      and recipe.account_id = owner_id
      and recipe.version = p_expected_version
    returning recipe.id, recipe.version into saved_id, saved_version;

    if saved_id is null then
      if exists (
        select 1 from public.recipes as recipe
        where recipe.id = p_recipe_id and recipe.account_id = owner_id
      ) then
        raise exception 'Recipe version conflict.' using errcode = '40001';
      end if;
      raise exception 'Recipe not found.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.recipe_picklist_assignments as assignment
  where assignment.account_id = owner_id and assignment.recipe_id = saved_id;

  insert into public.recipe_picklist_assignments (account_id, recipe_id, category, picklist_value_id)
  select owner_id, saved_id, 'meal_type', values.value_id
  from unnest(coalesce(p_meal_type_ids, array[]::uuid[])) as values(value_id);

  insert into public.recipe_picklist_assignments (account_id, recipe_id, category, picklist_value_id)
  select owner_id, saved_id, 'cuisine', values.value_id
  from unnest(coalesce(p_cuisine_ids, array[]::uuid[])) as values(value_id);

  insert into public.recipe_picklist_assignments (account_id, recipe_id, category, picklist_value_id)
  select owner_id, saved_id, 'equipment', values.value_id
  from unnest(coalesce(p_equipment_ids, array[]::uuid[])) as values(value_id);

  return query select saved_id, saved_version;
end;
$$;

revoke all on function public.save_recipe(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[]
) from public, anon;
grant execute on function public.save_recipe(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[]
) to authenticated;