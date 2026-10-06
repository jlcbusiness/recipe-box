create extension if not exists pg_cron with schema pg_catalog;

alter table public.recipes
  add column trashed_at timestamptz,
  add column trashed_by_user_id uuid references auth.users (id) on delete set null;

create index recipes_active_owner_updated_idx
  on public.recipes (account_id, updated_at desc)
  where trashed_at is null;

create index recipes_trash_owner_deleted_idx
  on public.recipes (account_id, trashed_at desc)
  where trashed_at is not null;

alter table public.recipe_history
  drop constraint recipe_history_event_type_check,
  add constraint recipe_history_event_type_check check (
    event_type in (
      'recipe.created',
      'recipe.updated',
      'recipe.trashed',
      'recipe.restored'
    )
  );

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
  after_ingredients jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ingredient_id', recipe_ingredient.ingredient_id,
        'name', ingredient.name,
        'position', recipe_ingredient.position,
        'is_main', recipe_ingredient.is_main,
        'detail', recipe_ingredient.detail,
        'preparation', recipe_ingredient.preparation,
        'measurements', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'measurement_type', measurement.measurement_type,
              'amount_min', measurement.amount_min,
              'amount_max', measurement.amount_max,
              'unit_code', measurement.unit_code,
              'picklist_value_id', measurement.picklist_value_id,
              'picklist_value', picklist.value
            ) order by measurement.position
          )
          from public.recipe_ingredient_measurements as measurement
          left join public.recipe_picklist_values as picklist
            on picklist.account_id = measurement.account_id
            and picklist.id = measurement.picklist_value_id
          where measurement.account_id = recipe_ingredient.account_id
            and measurement.recipe_ingredient_id = recipe_ingredient.id
        ), '[]'::jsonb)
      ) order by recipe_ingredient.position
    ),
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
      else to_jsonb(old) || jsonb_build_object('ingredients', before_ingredients)
    end,
    to_jsonb(new) || jsonb_build_object('ingredients', after_ingredients)
  );

  return new;
end;
$$;

create or replace function public.guard_recipe_lifecycle_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.recipe_lifecycle_context', true) is distinct from 'on'
    and (
      old.trashed_at is not null
      or old.trashed_at is distinct from new.trashed_at
      or old.trashed_by_user_id is distinct from new.trashed_by_user_id
    )
  then
    raise exception 'Recipe lifecycle changes require an authorized lifecycle action.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_recipe_lifecycle_update
  before update on public.recipes
  for each row execute function public.guard_recipe_lifecycle_update();

drop policy "Account owners can read recipes" on public.recipes;
create policy "Account owners can read active recipes"
  on public.recipes
  for select
  to authenticated
  using ((select auth.uid()) = account_id and trashed_at is null);

drop policy "Account owners can update recipes" on public.recipes;
create policy "Account owners can update active recipes"
  on public.recipes
  for update
  to authenticated
  using ((select auth.uid()) = account_id and trashed_at is null)
  with check ((select auth.uid()) = account_id and trashed_at is null);

drop policy "Account owners can read recipe picklist assignments"
  on public.recipe_picklist_assignments;
create policy "Account owners can read active recipe picklist assignments"
  on public.recipe_picklist_assignments
  for select
  to authenticated
  using (
    (select auth.uid()) = account_id
    and exists (
      select 1
      from public.recipes as recipe
      where recipe.account_id = recipe_picklist_assignments.account_id
        and recipe.id = recipe_picklist_assignments.recipe_id
        and recipe.trashed_at is null
    )
  );

drop policy "Account owners can read recipe ingredients" on public.recipe_ingredients;
create policy "Account owners can read active recipe ingredients"
  on public.recipe_ingredients
  for select
  to authenticated
  using (
    (select auth.uid()) = account_id
    and exists (
      select 1
      from public.recipes as recipe
      where recipe.account_id = recipe_ingredients.account_id
        and recipe.id = recipe_ingredients.recipe_id
        and recipe.trashed_at is null
    )
  );

drop policy "Account owners can read recipe ingredient measurements"
  on public.recipe_ingredient_measurements;
create policy "Account owners can read active recipe ingredient measurements"
  on public.recipe_ingredient_measurements
  for select
  to authenticated
  using (
    (select auth.uid()) = account_id
    and exists (
      select 1
      from public.recipe_ingredients as recipe_ingredient
      join public.recipes as recipe
        on recipe.account_id = recipe_ingredient.account_id
        and recipe.id = recipe_ingredient.recipe_id
      where recipe_ingredient.account_id = recipe_ingredient_measurements.account_id
        and recipe_ingredient.id = recipe_ingredient_measurements.recipe_ingredient_id
        and recipe.trashed_at is null
    )
  );

drop policy "Account owners can read recipe instruction steps" on public.recipe_steps;
create policy "Account owners can read active recipe instruction steps"
  on public.recipe_steps
  for select
  to authenticated
  using (
    (select auth.uid()) = account_id
    and exists (
      select 1
      from public.recipes as recipe
      where recipe.account_id = recipe_steps.account_id
        and recipe.id = recipe_steps.recipe_id
        and recipe.trashed_at is null
    )
  );

drop policy "Account owners can read recipe step mentions" on public.recipe_step_mentions;
create policy "Account owners can read active recipe step mentions"
  on public.recipe_step_mentions
  for select
  to authenticated
  using (
    (select auth.uid()) = account_id
    and exists (
      select 1
      from public.recipes as recipe
      where recipe.account_id = recipe_step_mentions.account_id
        and recipe.id = recipe_step_mentions.recipe_id
        and recipe.trashed_at is null
    )
  );

drop policy "Account owners can read recipe history" on public.recipe_history;
create policy "Account owners can read active recipe history"
  on public.recipe_history
  for select
  to authenticated
  using (
    (select auth.uid()) = account_id
    and exists (
      select 1
      from public.recipes as recipe
      where recipe.account_id = recipe_history.account_id
        and recipe.id = recipe_history.record_id
        and recipe.trashed_at is null
    )
  );

create function public.list_trashed_recipes()
returns table (id uuid, name text, version integer, trashed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select recipe.id, recipe.name, recipe.version, recipe.trashed_at
  from public.recipes as recipe
  where recipe.account_id = auth.uid()
    and recipe.trashed_at is not null
  order by recipe.trashed_at desc, recipe.id;
$$;

revoke all on function public.list_trashed_recipes() from public, anon;
grant execute on function public.list_trashed_recipes() to authenticated;

create function public.trash_recipe(p_recipe_id uuid, p_expected_version integer)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipe_version integer;
  recipe_trashed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select recipe.version, recipe.trashed_at
  into recipe_version, recipe_trashed_at
  from public.recipes as recipe
  where recipe.id = p_recipe_id
    and recipe.account_id = auth.uid()
  for update;

  if not found then
    raise exception 'Recipe not found.' using errcode = 'P0002';
  end if;
  if recipe_version is distinct from p_expected_version then
    raise exception 'Recipe version is stale.' using errcode = '40001';
  end if;
  if recipe_trashed_at is not null then
    raise exception 'Recipe is already in Trash.' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('app.recipe_lifecycle_context', 'on', true);
  return query
    update public.recipes as recipe
    set trashed_at = pg_catalog.now(),
        trashed_by_user_id = auth.uid(),
        version = recipe.version + 1
    where recipe.id = p_recipe_id
      and recipe.account_id = auth.uid()
    returning recipe.id, recipe.version;
end;
$$;

revoke all on function public.trash_recipe(uuid, integer) from public, anon;
grant execute on function public.trash_recipe(uuid, integer) to authenticated;

create function public.restore_recipe(p_recipe_id uuid, p_expected_version integer)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipe_version integer;
  recipe_trashed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select recipe.version, recipe.trashed_at
  into recipe_version, recipe_trashed_at
  from public.recipes as recipe
  where recipe.id = p_recipe_id
    and recipe.account_id = auth.uid()
  for update;

  if not found then
    raise exception 'Recipe not found.' using errcode = 'P0002';
  end if;
  if recipe_version is distinct from p_expected_version then
    raise exception 'Recipe version is stale.' using errcode = '40001';
  end if;
  if recipe_trashed_at is null then
    raise exception 'Recipe is not in Trash.' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('app.recipe_lifecycle_context', 'on', true);
  return query
    update public.recipes as recipe
    set trashed_at = null,
        trashed_by_user_id = null,
        version = recipe.version + 1
    where recipe.id = p_recipe_id
      and recipe.account_id = auth.uid()
    returning recipe.id, recipe.version;
end;
$$;

revoke all on function public.restore_recipe(uuid, integer) from public, anon;
grant execute on function public.restore_recipe(uuid, integer) to authenticated;

create function public.purge_expired_recipes(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged_count integer;
begin
  if p_cutoff is null then
    raise exception 'A purge cutoff is required.' using errcode = '22004';
  end if;

  delete from public.recipe_history as history
  using public.recipes as recipe
  where history.account_id = recipe.account_id
    and history.record_id = recipe.id
    and recipe.trashed_at <= p_cutoff;

  delete from public.recipes as recipe
  where recipe.trashed_at <= p_cutoff;
  get diagnostics purged_count = row_count;

  return purged_count;
end;
$$;

revoke all on function public.purge_expired_recipes(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_expired_recipes(timestamptz) to service_role;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'recipe-trash-purge-daily'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'recipe-trash-purge-daily',
    '0 3 * * *',
    'select public.purge_expired_recipes(now() - interval ''30 days'');'
  );
end;
$$;