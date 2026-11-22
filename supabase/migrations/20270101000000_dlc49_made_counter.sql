alter table public.recipes
  add column made_count integer not null default 0,
  add column last_made_at timestamptz;

alter table public.recipes disable trigger recipe_history_after_save;

with last_tried as (
  select
    history.account_id,
    history.record_id,
    max(history.created_at) as last_made_at
  from public.recipe_history as history
  where history.event_type in ('recipe.created', 'recipe.updated')
    and history.after_data->>'state' = 'tried'
    and (
      history.before_data is null
      or history.before_data->>'state' is distinct from 'tried'
    )
  group by history.account_id, history.record_id
)
update public.recipes as recipe
set made_count = 1,
    last_made_at = last_tried.last_made_at
from last_tried
where recipe.account_id = last_tried.account_id
  and recipe.id = last_tried.record_id
  and recipe.state = 'tried';

update public.recipes
set made_count = 1
where state = 'tried'
  and made_count = 0;

alter table public.recipes enable trigger recipe_history_after_save;

alter table public.recipes
  add constraint recipes_made_data_check check (
    made_count >= 0
    and (made_count > 0 or last_made_at is null)
    and (state <> 'tried' or made_count >= 1)
  );

create function private.initialize_recipe_made_on_tried()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state = 'tried' and new.made_count = 0 then
    new.made_count := 1;
    new.last_made_at := coalesce(new.last_made_at, pg_catalog.clock_timestamp());
  end if;
  return new;
end;
$$;

revoke all on function private.initialize_recipe_made_on_tried()
  from public, anon, authenticated;

create trigger recipes_initialize_made_on_tried
  before insert or update of state on public.recipes
  for each row execute function private.initialize_recipe_made_on_tried();

create function private.mark_recipe_made_at(
  p_recipe_id uuid,
  p_expected_version integer,
  p_timezone text,
  p_marked_at timestamptz
)
returns table (version integer, made_count integer, last_made_at timestamptz, state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_version integer;
  current_made_count integer;
  current_last_made_at timestamptz;
  current_state text;
  updated_version integer;
  updated_made_count integer;
  updated_last_made_at timestamptz;
  updated_state text;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_recipe_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_timezone is null
    or p_marked_at is null
  then
    raise exception 'A valid recipe, version, time zone, and timestamp are required.'
      using errcode = '22023';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_timezone_names as timezone
    where timezone.name = p_timezone
  ) then
    raise exception 'The requested time zone is invalid.' using errcode = '22023';
  end if;

  select recipe.version, recipe.made_count, recipe.last_made_at, recipe.state
  into current_version, current_made_count, current_last_made_at, current_state
  from public.recipes as recipe
  where recipe.account_id = owner_id
    and recipe.id = p_recipe_id
    and recipe.trashed_at is null
  for update;

  if not found then
    raise exception 'This recipe is no longer available.' using errcode = 'P0002';
  end if;
  if current_state = 'will_not_try' then
    raise exception 'Made is unavailable while State is Will not try.' using errcode = '22023';
  end if;
  if current_last_made_at is not null
    and (current_last_made_at at time zone p_timezone)::date
      = (p_marked_at at time zone p_timezone)::date
  then
    return query
    select current_version, current_made_count, current_last_made_at, current_state;
    return;
  end if;
  if current_version <> p_expected_version then
    raise exception 'This recipe changed in another session.' using errcode = 'PT409';
  end if;
  if current_made_count = 2147483647 then
    raise exception 'The Made count is at its maximum value.' using errcode = '22003';
  end if;

  update public.recipes as recipe
  set state = 'tried',
      made_count = current_made_count + 1,
      last_made_at = p_marked_at,
      verdict_id = case when current_state = 'want_to_try' then null else recipe.verdict_id end,
      enthusiasm_id = case
        when current_state = 'want_to_try' then null
        else recipe.enthusiasm_id
      end,
      occasion_details = case
        when current_state = 'want_to_try' then null
        else recipe.occasion_details
      end,
      reason = case when current_state = 'want_to_try' then null else recipe.reason end,
      version = recipe.version + 1
  where recipe.account_id = owner_id
    and recipe.id = p_recipe_id
    and recipe.version = current_version
    and recipe.trashed_at is null
  returning recipe.version, recipe.made_count, recipe.last_made_at, recipe.state
  into updated_version, updated_made_count, updated_last_made_at, updated_state;

  if updated_version is null then
    raise exception 'This recipe changed in another session.' using errcode = 'PT409';
  end if;

  return query
  select updated_version, updated_made_count, updated_last_made_at, updated_state;
end;
$$;

revoke all on function private.mark_recipe_made_at(uuid, integer, text, timestamptz)
  from public, anon, authenticated;

create function public.mark_recipe_made(
  p_recipe_id uuid,
  p_expected_version integer,
  p_timezone text
)
returns table (version integer, made_count integer, last_made_at timestamptz, state text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select *
  from private.mark_recipe_made_at(
    p_recipe_id,
    p_expected_version,
    p_timezone,
    pg_catalog.clock_timestamp()
  );
end;
$$;

revoke all on function public.mark_recipe_made(uuid, integer, text)
  from public, anon;
grant execute on function public.mark_recipe_made(uuid, integer, text)
  to authenticated;

notify pgrst, 'reload schema';
