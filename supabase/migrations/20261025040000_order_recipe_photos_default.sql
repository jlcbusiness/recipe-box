create or replace function public.reorder_recipe_photos(p_recipe_id uuid, p_asset_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  ready_count integer;
begin
  if owner_id is null or p_asset_ids is null then
    raise exception 'The photo order is invalid.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.recipes as recipe
    where recipe.id = p_recipe_id
      and recipe.account_id = owner_id
      and recipe.trashed_at is null
  ) then
    raise exception 'The recipe is unavailable.' using errcode = 'P0002';
  end if;

  select count(*) into ready_count
  from public.media_assets as media
  where media.account_id = owner_id
    and media.recipe_id = p_recipe_id
    and media.asset_type = 'recipe_photo'
    and media.status = 'ready';
  if ready_count <> cardinality(p_asset_ids)
    or cardinality(p_asset_ids) <> (
      select count(distinct asset_id) from unnest(p_asset_ids) as selected(asset_id)
    )
    or exists (
      select 1 from unnest(p_asset_ids) as selected(asset_id)
      where not exists (
        select 1 from public.media_assets as media
        where media.id = selected.asset_id
          and media.account_id = owner_id
          and media.recipe_id = p_recipe_id
          and media.asset_type = 'recipe_photo'
          and media.status = 'ready'
      )
    )
  then
    raise exception 'The photo order changed. Refresh and try again.' using errcode = '40001';
  end if;

  update public.media_assets
  set is_primary = false,
      updated_by_user_id = owner_id,
      updated_at = now()
  where account_id = owner_id
    and recipe_id = p_recipe_id
    and asset_type = 'recipe_photo'
    and status = 'ready'
    and is_primary;

  if cardinality(p_asset_ids) > 0 then
    update public.media_assets
    set is_primary = true,
        updated_by_user_id = owner_id,
        updated_at = now()
    where id = p_asset_ids[1];
  end if;

  update public.media_assets as media
  set position = selected.ordinality - 1,
      updated_by_user_id = owner_id,
      updated_at = now()
  from unnest(p_asset_ids) with ordinality as selected(asset_id, ordinality)
  where media.id = selected.asset_id
    and media.position <> selected.ordinality - 1;
end;
$$;

revoke all on function public.reorder_recipe_photos(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_recipe_photos(uuid, uuid[]) to authenticated;
