drop function public.purge_trashed_item(text, uuid, integer);

create function public.purge_trashed_item(
  p_item_type text,
  p_item_id uuid,
  p_expected_version integer,
  p_recipe_disposition text
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
  recipe_tin_id uuid;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_item_type is null or p_item_type not in ('recipe', 'publication') then
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

  if p_recipe_disposition is null or p_recipe_disposition not in (
    'all', 'deleted_with_publication', 'keep'
  ) then
    raise exception 'Choose what happens to this publication''s recipes.'
      using errcode = '23514';
  end if;

  delete from public.media_assets as media
  where media.account_id = owner_id
    and media.publication_id = p_item_id;

  if p_recipe_disposition = 'all' then
    delete from public.media_assets as media
    where media.account_id = owner_id
      and media.recipe_id in (
        select recipe.id
        from public.recipes as recipe
        where recipe.account_id = owner_id
          and (recipe.publication_id = p_item_id or recipe.publication_trash_id = p_item_id)
      );

    delete from public.recipe_history as history
    where history.account_id = owner_id
      and history.record_id in (
        select recipe.id
        from public.recipes as recipe
        where recipe.account_id = owner_id
          and (recipe.publication_id = p_item_id or recipe.publication_trash_id = p_item_id)
      );

    delete from public.recipes as recipe
    where recipe.account_id = owner_id
      and (recipe.publication_id = p_item_id or recipe.publication_trash_id = p_item_id);
  else
    if p_recipe_disposition = 'deleted_with_publication' then
      delete from public.media_assets as media
      where media.account_id = owner_id
        and media.recipe_id in (
          select recipe.id
          from public.recipes as recipe
          where recipe.account_id = owner_id
            and recipe.publication_trash_id = p_item_id
            and recipe.trashed_at is not null
        );

      delete from public.recipe_history as history
      where history.account_id = owner_id
        and history.record_id in (
          select recipe.id
          from public.recipes as recipe
          where recipe.account_id = owner_id
            and recipe.publication_trash_id = p_item_id
            and recipe.trashed_at is not null
        );

      delete from public.recipes as recipe
      where recipe.account_id = owner_id
        and recipe.publication_trash_id = p_item_id
        and recipe.trashed_at is not null;
    end if;

    if exists (
      select 1
      from public.recipes as recipe
      where recipe.account_id = owner_id
        and (recipe.publication_id = p_item_id or recipe.publication_trash_id = p_item_id)
    ) then
      recipe_tin_id := private.ensure_recipe_tin(owner_id);
      perform pg_catalog.set_config('app.recipe_lifecycle_context', 'on', true);
      update public.recipes as recipe
      set publication_id = recipe_tin_id,
          publication_page = null,
          recipe_url = null,
          publication_trash_id = null,
          publication_trash_previous_page = null,
          publication_trash_previous_url = null,
          version = recipe.version + 1
      where recipe.account_id = owner_id
        and (recipe.publication_id = p_item_id or recipe.publication_trash_id = p_item_id);
    end if;
  end if;

  delete from public.publication_history as history
  where history.account_id = owner_id
    and history.record_id = p_item_id;

  delete from public.publications as publication
  where publication.account_id = owner_id
    and publication.id = p_item_id;
end;
$$;

revoke all on function public.purge_trashed_item(text, uuid, integer, text)
  from public, anon;
grant execute on function public.purge_trashed_item(text, uuid, integer, text)
  to authenticated;

notify pgrst, 'reload schema';
