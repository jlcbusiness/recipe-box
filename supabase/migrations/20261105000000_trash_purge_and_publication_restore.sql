alter table public.recipes
  add column publication_trash_id uuid,
  add column publication_trash_previous_page text,
  add column publication_trash_previous_url text;

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
      or old.publication_trash_id is distinct from new.publication_trash_id
      or old.publication_trash_previous_page is distinct from new.publication_trash_previous_page
      or old.publication_trash_previous_url is distinct from new.publication_trash_previous_url
    )
  then
    raise exception 'Recipe lifecycle changes require an authorized lifecycle action.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.trash_publication(
  p_publication_id uuid,
  p_expected_version integer,
  p_recipe_disposition text,
  p_destination_publication_id uuid
)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  publication_version integer;
  publication_trashed_at timestamptz;
  destination_type text;
  deleted_at timestamptz := pg_catalog.now();
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select publication.version, publication.trashed_at
  into publication_version, publication_trashed_at
  from public.publications as publication
  where publication.id = p_publication_id
    and publication.account_id = owner_id
  for update;

  if not found then
    raise exception 'Publication not found.' using errcode = 'P0002';
  end if;
  if publication_version is distinct from p_expected_version then
    raise exception 'Publication version is stale.' using errcode = '40001';
  end if;
  if publication_trashed_at is not null then
    raise exception 'Publication is already in Trash.' using errcode = '55000';
  end if;
  if p_recipe_disposition is null
    or p_recipe_disposition not in ('delete', 'recipe_tin', 'another_publication')
  then
    raise exception 'Choose a valid recipe disposition.' using errcode = '23514';
  end if;

  if p_recipe_disposition = 'another_publication' then
    if p_destination_publication_id is null or p_destination_publication_id = p_publication_id then
      raise exception 'Choose another active publication.' using errcode = '23514';
    end if;

    select publication.publication_type
    into destination_type
    from public.publications as publication
    where publication.id = p_destination_publication_id
      and publication.account_id = owner_id
      and publication.trashed_at is null
    for update;

    if not found then
      raise exception 'Destination publication is not available.' using errcode = 'P0002';
    end if;
  elsif p_destination_publication_id is not null then
    raise exception 'A destination is only valid when moving recipes to another publication.'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config('app.recipe_lifecycle_context', 'on', true);

  if p_recipe_disposition = 'delete' then
    update public.recipes as recipe
    set trashed_at = deleted_at,
        trashed_by_user_id = owner_id,
        publication_trash_id = p_publication_id,
        publication_trash_previous_page = recipe.publication_page,
        publication_trash_previous_url = recipe.recipe_url,
        version = recipe.version + 1
    where recipe.account_id = owner_id
      and recipe.publication_id = p_publication_id
      and recipe.trashed_at is null;
  elsif p_recipe_disposition = 'recipe_tin' then
    update public.recipes as recipe
    set publication_id = null,
        publication_page = null,
        recipe_url = null,
        publication_trash_id = p_publication_id,
        publication_trash_previous_page = recipe.publication_page,
        publication_trash_previous_url = recipe.recipe_url,
        version = recipe.version + 1
    where recipe.account_id = owner_id
      and recipe.publication_id = p_publication_id
      and recipe.trashed_at is null;
  else
    update public.recipes as recipe
    set publication_id = p_destination_publication_id,
        publication_page = case
          when destination_type = 'book' then recipe.publication_page
          else null
        end,
        recipe_url = case
          when destination_type = 'site' then recipe.recipe_url
          else null
        end,
        version = recipe.version + 1
    where recipe.account_id = owner_id
      and recipe.publication_id = p_publication_id;
  end if;

  perform pg_catalog.set_config('app.publication_lifecycle_context', 'on', true);
  return query
    update public.publications as publication
    set trashed_at = deleted_at,
        trashed_by_user_id = owner_id,
        version = publication.version + 1
    where publication.id = p_publication_id
      and publication.account_id = owner_id
    returning publication.id, publication.version;
end;
$$;

create or replace function public.restore_publication(p_publication_id uuid, p_expected_version integer)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  publication_version integer;
  publication_trashed_at timestamptz;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select publication.version, publication.trashed_at
  into publication_version, publication_trashed_at
  from public.publications as publication
  where publication.id = p_publication_id
    and publication.account_id = owner_id
  for update;

  if not found then
    raise exception 'Publication not found.' using errcode = 'P0002';
  end if;
  if publication_version is distinct from p_expected_version then
    raise exception 'Publication version is stale.' using errcode = '40001';
  end if;
  if publication_trashed_at is null then
    raise exception 'Publication is not in Trash.' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('app.publication_lifecycle_context', 'on', true);
  update public.publications as publication
  set trashed_at = null,
      trashed_by_user_id = null,
      version = publication.version + 1
  where publication.id = p_publication_id
    and publication.account_id = owner_id;

  perform pg_catalog.set_config('app.recipe_lifecycle_context', 'on', true);
  update public.recipes as recipe
  set publication_id = p_publication_id,
      publication_page = case
        when recipe.publication_id is null then recipe.publication_trash_previous_page
        else recipe.publication_page
      end,
      recipe_url = case
        when recipe.publication_id is null then recipe.publication_trash_previous_url
        else recipe.recipe_url
      end,
      trashed_at = null,
      trashed_by_user_id = null,
      publication_trash_id = null,
      publication_trash_previous_page = null,
      publication_trash_previous_url = null,
      version = recipe.version + 1
  where recipe.account_id = owner_id
    and recipe.publication_trash_id = p_publication_id;

  return query
    select publication.id, publication.version
    from public.publications as publication
    where publication.id = p_publication_id
      and publication.account_id = owner_id;
end;
$$;

create or replace function public.purge_expired_publications(p_cutoff timestamptz)
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

  delete from public.media_assets as media
  using public.recipes as recipe, public.publications as publication
  where media.account_id = recipe.account_id
    and media.recipe_id = recipe.id
    and recipe.account_id = publication.account_id
    and recipe.publication_id = publication.id
    and recipe.trashed_at <= p_cutoff
    and publication.trashed_at <= p_cutoff;

  delete from public.media_assets as media
  using public.publications as publication
  where media.account_id = publication.account_id
    and media.publication_id = publication.id
    and publication.trashed_at <= p_cutoff;

  delete from public.recipe_history as history
  using public.recipes as recipe, public.publications as publication
  where history.account_id = recipe.account_id
    and history.record_id = recipe.id
    and recipe.account_id = publication.account_id
    and recipe.publication_id = publication.id
    and recipe.trashed_at <= p_cutoff
    and publication.trashed_at <= p_cutoff;

  delete from public.recipes as recipe
  using public.publications as publication
  where recipe.account_id = publication.account_id
    and recipe.publication_id = publication.id
    and recipe.trashed_at <= p_cutoff
    and publication.trashed_at <= p_cutoff;

  delete from public.publication_history as history
  using public.publications as publication
  where history.account_id = publication.account_id
    and history.record_id = publication.id
    and publication.trashed_at <= p_cutoff;

  delete from public.publications as publication
  where publication.trashed_at <= p_cutoff;
  get diagnostics purged_count = row_count;

  return purged_count;
end;
$$;

create function public.purge_trashed_item(
  p_item_type text,
  p_item_id uuid,
  p_expected_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  item_version integer;
  item_trashed_at timestamptz;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_item_type not in ('recipe', 'publication') then
    raise exception 'Choose a valid Trash item.' using errcode = '23514';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'A current item version is required.' using errcode = '22023';
  end if;

  if p_item_type = 'recipe' then
    select recipe.version, recipe.trashed_at
    into item_version, item_trashed_at
    from public.recipes as recipe
    where recipe.id = p_item_id
      and recipe.account_id = owner_id
    for update;
  else
    select publication.version, publication.trashed_at
    into item_version, item_trashed_at
    from public.publications as publication
    where publication.id = p_item_id
      and publication.account_id = owner_id
    for update;
  end if;

  if not found then
    raise exception 'Trash item not found.' using errcode = 'P0002';
  end if;
  if item_version is distinct from p_expected_version then
    raise exception 'Trash item version is stale.' using errcode = '40001';
  end if;
  if item_trashed_at is null then
    raise exception 'Only items in Trash can be purged.' using errcode = '55000';
  end if;

  if p_item_type = 'recipe' then
    delete from public.media_assets as media
    where media.account_id = owner_id
      and media.recipe_id = p_item_id;

    delete from public.recipe_history as history
    where history.account_id = owner_id
      and history.record_id = p_item_id;

    delete from public.recipes as recipe
    where recipe.account_id = owner_id
      and recipe.id = p_item_id;
    return;
  end if;

  if exists (
    select 1
    from public.recipes as recipe
    where recipe.account_id = owner_id
      and recipe.publication_id = p_item_id
      and recipe.trashed_at is null
  ) then
    raise exception 'Move active recipes before purging this publication.'
      using errcode = '55000';
  end if;

  delete from public.media_assets as media
  where media.account_id = owner_id
    and (media.publication_id = p_item_id or media.recipe_id in (
      select recipe.id
      from public.recipes as recipe
      where recipe.account_id = owner_id
        and recipe.publication_id = p_item_id
    ));

  delete from public.recipe_history as history
  where history.account_id = owner_id
    and history.record_id in (
      select recipe.id
      from public.recipes as recipe
      where recipe.account_id = owner_id
        and recipe.publication_id = p_item_id
    );

  delete from public.recipes as recipe
  where recipe.account_id = owner_id
    and recipe.publication_id = p_item_id;

  delete from public.publication_history as history
  where history.account_id = owner_id
    and history.record_id = p_item_id;

  delete from public.publications as publication
  where publication.account_id = owner_id
    and publication.id = p_item_id;
end;
$$;

revoke all on function public.purge_trashed_item(text, uuid, integer)
  from public, anon;
grant execute on function public.purge_trashed_item(text, uuid, integer)
  to authenticated;

create function public.purge_all_trashed()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  purged_recipe_count integer;
  purged_publication_count integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.recipes as recipe
    join public.publications as publication
      on publication.account_id = recipe.account_id
      and publication.id = recipe.publication_id
    where recipe.account_id = owner_id
      and recipe.trashed_at is null
      and publication.trashed_at is not null
  ) then
    raise exception 'Move active recipes before purging their publication.'
      using errcode = '55000';
  end if;

  delete from public.media_assets as media
  where media.account_id = owner_id
    and (
      media.recipe_id in (
        select recipe.id
        from public.recipes as recipe
        where recipe.account_id = owner_id
          and recipe.trashed_at is not null
      )
      or media.publication_id in (
        select publication.id
        from public.publications as publication
        where publication.account_id = owner_id
          and publication.trashed_at is not null
      )
      or media.recipe_id in (
        select recipe.id
        from public.recipes as recipe
        join public.publications as publication
          on publication.account_id = recipe.account_id
          and publication.id = recipe.publication_id
        where recipe.account_id = owner_id
          and publication.trashed_at is not null
      )
    );

  delete from public.recipe_history as history
  where history.account_id = owner_id
    and history.record_id in (
      select recipe.id
      from public.recipes as recipe
      where recipe.account_id = owner_id
        and recipe.trashed_at is not null
      union
      select recipe.id
      from public.recipes as recipe
      join public.publications as publication
        on publication.account_id = recipe.account_id
        and publication.id = recipe.publication_id
      where recipe.account_id = owner_id
        and publication.trashed_at is not null
    );

  delete from public.recipes as recipe
  where recipe.account_id = owner_id
    and (
      recipe.trashed_at is not null
      or recipe.publication_id in (
        select publication.id
        from public.publications as publication
        where publication.account_id = owner_id
          and publication.trashed_at is not null
      )
    );
  get diagnostics purged_recipe_count = row_count;

  delete from public.publication_history as history
  where history.account_id = owner_id
    and history.record_id in (
      select publication.id
      from public.publications as publication
      where publication.account_id = owner_id
        and publication.trashed_at is not null
    );

  delete from public.publications as publication
  where publication.account_id = owner_id
    and publication.trashed_at is not null;
  get diagnostics purged_publication_count = row_count;

  return pg_catalog.jsonb_build_object(
    'recipes', purged_recipe_count,
    'publications', purged_publication_count
  );
end;
$$;

revoke all on function public.purge_all_trashed() from public, anon;
grant execute on function public.purge_all_trashed() to authenticated;
