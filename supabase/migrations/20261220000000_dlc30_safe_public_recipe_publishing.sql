alter table public.accounts
  add column public_username text,
  add constraint accounts_public_username_format_check
    check (
      public_username is null
      or (
        char_length(public_username) between 3 and 30
        and public_username ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
      )
    );

create unique index accounts_public_username_lower_key
  on public.accounts (lower(public_username))
  where public_username is not null;

create function public.set_public_username(p_public_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_id uuid := auth.uid();
  normalized_username text := lower(btrim(p_public_username));
begin
  if user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if char_length(normalized_username) not between 3 and 30
    or normalized_username !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
  then
    raise exception 'The public username is invalid.' using errcode = 'PT422';
  end if;

  update public.accounts as account
  set public_username = normalized_username
  where account.id = user_id;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;

  return normalized_username;
end;
$$;

revoke all on function public.set_public_username(text) from public, anon;
grant execute on function public.set_public_username(text) to authenticated;

alter table public.recipes
  alter column is_private set default true;

alter table public.recipes disable trigger recipe_history_after_save;
alter table public.recipes disable trigger recipes_updated_at;

select pg_catalog.set_config('app.recipe_privacy_context', 'on', true);
select pg_catalog.set_config('app.recipe_lifecycle_context', 'on', true);

update public.recipes
set is_private = true
where is_private = false;

select pg_catalog.set_config('app.recipe_privacy_context', '', true);
select pg_catalog.set_config('app.recipe_lifecycle_context', '', true);

alter table public.recipes enable trigger recipes_updated_at;
alter table public.recipes enable trigger recipe_history_after_save;

drop function public.set_recipe_privacy(uuid, integer, boolean);

create function public.set_recipe_privacy(
  p_recipe_id uuid,
  p_expected_version integer,
  p_is_private boolean,
  p_public_username text default null
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
  current_username text;
  normalized_username text;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 1 or p_is_private is null then
    raise exception 'A current version and privacy setting are required.'
      using errcode = '22023';
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
    raise exception 'Recipe version is stale.' using errcode = 'PT409';
  end if;
  if recipe_trashed_at is not null then
    raise exception 'Recipe is in Trash.' using errcode = '55000';
  end if;

  if not p_is_private then
    select account.public_username
    into current_username
    from public.accounts as account
    where account.id = owner_id
    for update;

    if not found then
      raise exception 'Account not found.' using errcode = 'P0002';
    end if;

    if p_public_username is not null then
      normalized_username := lower(btrim(p_public_username));
      if char_length(normalized_username) not between 3 and 30
        or normalized_username !~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
      then
        raise exception 'The public username is invalid.' using errcode = 'PT422';
      end if;
    end if;

    if current_username is null then
      if normalized_username is null then
        raise exception 'A public username is required before publishing.'
          using errcode = 'PT422';
      end if;
      update public.accounts as account
      set public_username = normalized_username
      where account.id = owner_id;
    elsif normalized_username is not null
      and normalized_username is distinct from current_username
    then
      raise exception 'The public username is already set. Change it in Settings.'
        using errcode = 'PT409';
    end if;
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

revoke all on function public.set_recipe_privacy(uuid, integer, boolean, text)
  from public, anon;
grant execute on function public.set_recipe_privacy(uuid, integer, boolean, text)
  to authenticated;

notify pgrst, 'reload schema';
