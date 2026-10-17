alter table public.recipes
  add column public_id uuid;

alter table public.recipes disable trigger recipe_history_after_save;

select pg_catalog.set_config('app.recipe_lifecycle_context', 'on', true);

update public.recipes
set public_id = gen_random_uuid()
where public_id is null;

select pg_catalog.set_config('app.recipe_lifecycle_context', '', true);

alter table public.recipes enable trigger recipe_history_after_save;

alter table public.recipes
  alter column public_id set default gen_random_uuid(),
  alter column public_id set not null,
  add constraint recipes_public_id_key unique (public_id);

create table public.purged_recipe_public_ids (
  public_id uuid primary key
);

alter table public.purged_recipe_public_ids enable row level security;
revoke all on public.purged_recipe_public_ids from public, anon, authenticated;
grant select, delete on public.purged_recipe_public_ids to service_role;

create function public.assign_recipe_public_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.public_id := gen_random_uuid();
  return new;
end;
$$;

revoke all on function public.assign_recipe_public_id() from public, anon, authenticated;

create trigger assign_recipe_public_id_before_insert
  before insert on public.recipes
  for each row execute function public.assign_recipe_public_id();

create function public.guard_recipe_public_link_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.public_id is distinct from new.public_id then
    raise exception 'Recipe public links cannot be changed.' using errcode = '42501';
  end if;

  if old.is_private is distinct from new.is_private
    and current_setting('app.recipe_privacy_context', true) is distinct from 'on'
  then
    raise exception 'Recipe privacy changes require an authorized privacy action.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_recipe_public_link_update() from public, anon, authenticated;

create trigger guard_recipe_public_link_update
  before update of public_id, is_private on public.recipes
  for each row execute function public.guard_recipe_public_link_update();

create function public.set_recipe_privacy(
  p_recipe_id uuid,
  p_expected_version integer,
  p_is_private boolean
)
returns table (public_id uuid, is_private boolean, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  recipe_public_id uuid;
  current_privacy boolean;
  current_version integer;
  recipe_trashed_at timestamptz;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 1 or p_is_private is null then
    raise exception 'A current version and privacy setting are required.' using errcode = '22023';
  end if;

  select recipe.public_id, recipe.is_private, recipe.version, recipe.trashed_at
  into recipe_public_id, current_privacy, current_version, recipe_trashed_at
  from public.recipes as recipe
  where recipe.id = p_recipe_id
    and recipe.account_id = owner_id
  for update;

  if not found then
    raise exception 'Recipe not found.' using errcode = 'P0002';
  end if;
  if current_version is distinct from p_expected_version then
    raise exception 'Recipe version is stale.' using errcode = '40001';
  end if;
  if recipe_trashed_at is not null then
    raise exception 'Recipe is in Trash.' using errcode = '55000';
  end if;

  if current_privacy is distinct from p_is_private then
    perform pg_catalog.set_config('app.recipe_privacy_context', 'on', true);
    return query
      update public.recipes as recipe
      set is_private = p_is_private,
          version = recipe.version + 1
      where recipe.id = p_recipe_id
        and recipe.account_id = owner_id
      returning recipe.public_id, recipe.is_private, recipe.version;
  else
    return query
      select recipe.public_id, recipe.is_private, recipe.version
      from public.recipes as recipe
      where recipe.id = p_recipe_id
        and recipe.account_id = owner_id;
  end if;
end;
$$;

revoke all on function public.set_recipe_privacy(uuid, integer, boolean)
  from public, anon;
grant execute on function public.set_recipe_privacy(uuid, integer, boolean)
  to authenticated;

create function public.tombstone_purged_recipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.purged_recipe_public_ids (public_id)
  values (old.public_id)
  on conflict (public_id) do nothing;
  return old;
end;
$$;

revoke all on function public.tombstone_purged_recipe() from public, anon, authenticated;

create trigger tombstone_purged_recipe_before_delete
  before delete on public.recipes
  for each row execute function public.tombstone_purged_recipe();

notify pgrst, 'reload schema';