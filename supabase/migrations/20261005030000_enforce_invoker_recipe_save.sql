create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.set_recipe_save_context()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.set_config('app.recipe_save_context', 'on', true);
end;
$$;

revoke all on function private.set_recipe_save_context() from public, anon;
grant execute on function private.set_recipe_save_context() to authenticated;

drop policy "Account owners can create recipes" on public.recipes;
create policy "Account owners can create recipes"
  on public.recipes
  for insert
  to authenticated
  with check (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );

drop policy "Account owners can update recipes" on public.recipes;
create policy "Account owners can update recipes"
  on public.recipes
  for update
  to authenticated
  using (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  )
  with check (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );

drop policy "Account owners can add recipe picklist assignments"
  on public.recipe_picklist_assignments;
create policy "Account owners can add recipe picklist assignments"
  on public.recipe_picklist_assignments
  for insert
  to authenticated
  with check (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );

drop policy "Account owners can remove recipe picklist assignments"
  on public.recipe_picklist_assignments;
create policy "Account owners can remove recipe picklist assignments"
  on public.recipe_picklist_assignments
  for delete
  to authenticated
  using (
    (select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on'
  );

grant insert, update on public.recipes to authenticated;
grant insert, delete on public.recipe_picklist_assignments to authenticated;

create or replace function public.save_recipe(
  p_recipe_id uuid,
  p_expected_version integer,
  p_name text,
  p_food_type_id uuid,
  p_state text,
  p_verdict_id uuid,
  p_enthusiasm_id uuid,
  p_occasion_details text,
  p_reason text,
  p_servings numeric,
  p_yield_text text,
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

  if p_servings is not null and p_servings <= 0 then
    raise exception 'Servings must be greater than zero.' using errcode = '23514';
  end if;

  perform private.set_recipe_save_context();

  if p_recipe_id is null then
    insert into public.recipes (
      account_id, name, food_type_id, state, verdict_id, enthusiasm_id,
      occasion_details, reason, servings, yield_text, prep_time_minutes,
      mixing_time_minutes, marinate_time_minutes, chill_time_minutes,
      freeze_time_minutes, cook_time_minutes, bake_time_minutes,
      cooling_time_minutes, rest_time_minutes, total_time_minutes, notes_markdown
    )
    values (
      owner_id, trim(p_name), p_food_type_id, p_state, p_verdict_id,
      p_enthusiasm_id, p_occasion_details, p_reason, p_servings,
      nullif(trim(p_yield_text), ''), p_prep_time_minutes, p_mixing_time_minutes,
      p_marinate_time_minutes, p_chill_time_minutes, p_freeze_time_minutes,
      p_cook_time_minutes, p_bake_time_minutes, p_cooling_time_minutes,
      p_rest_time_minutes, p_total_time_minutes, coalesce(p_notes_markdown, '')
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
      servings = p_servings,
      yield_text = nullif(trim(p_yield_text), ''),
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