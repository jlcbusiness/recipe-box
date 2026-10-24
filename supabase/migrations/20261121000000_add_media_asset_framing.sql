alter table public.media_assets
  add column crop jsonb,
  add constraint media_assets_crop_valid check (
    crop is null or case
      when jsonb_typeof(crop) <> 'object' then false
      when not (crop ?& array['left', 'top', 'width', 'height']) then false
      when crop - array['left', 'top', 'width', 'height'] <> '{}'::jsonb then false
      when jsonb_typeof(crop->'left') <> 'number'
        or jsonb_typeof(crop->'top') <> 'number'
        or jsonb_typeof(crop->'width') <> 'number'
        or jsonb_typeof(crop->'height') <> 'number'
      then false
      else
        (crop->>'left')::numeric >= 0
        and (crop->>'top')::numeric >= 0
        and (crop->>'width')::numeric > 0
        and (crop->>'height')::numeric > 0
        and (crop->>'left')::numeric + (crop->>'width')::numeric <= 1
        and (crop->>'top')::numeric + (crop->>'height')::numeric <= 1
    end
  );

create function public.media_crop_history_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := coalesce(new.updated_by_user_id, new.created_by_user_id);
  before_value jsonb := jsonb_build_object('id', old.id, 'crop', old.crop);
  after_value jsonb := jsonb_build_object('id', new.id, 'crop', new.crop);
begin
  if old.crop is not distinct from new.crop or new.status <> 'ready' then
    return new;
  end if;

  if new.recipe_id is not null then
    insert into public.recipe_history (
      account_id, actor_user_id, record_id, event_type, before_data, after_data
    )
    values (
      new.account_id, actor_id, new.recipe_id, 'recipe.photo_updated', before_value, after_value
    );
  else
    insert into public.publication_history (
      account_id, actor_user_id, record_id, event_type, before_data, after_data
    )
    values (
      new.account_id, actor_id, new.publication_id, 'publication.cover_updated',
      before_value, after_value
    );
  end if;

  return new;
end;
$$;

create trigger media_crop_history_after_update
  after update of crop on public.media_assets
  for each row execute function public.media_crop_history_after_update();

create function public.update_media_crop(
  p_asset_id uuid,
  p_expected_version integer,
  p_crop jsonb
)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  target public.media_assets;
  current_version integer;
  updated_version integer;
  parent_is_trashed boolean;
  updated_rows integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into target
  from public.media_assets as media
  where media.id = p_asset_id
    and media.account_id = owner_id
    and media.status = 'ready';
  if not found then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;

  if target.recipe_id is not null then
    select recipe.version, recipe.trashed_at is not null
    into current_version, parent_is_trashed
    from public.recipes as recipe
    where recipe.id = target.recipe_id
      and recipe.account_id = owner_id
    for update;
  else
    select publication.version, publication.trashed_at is not null
    into current_version, parent_is_trashed
    from public.publications as publication
    where publication.id = target.publication_id
      and publication.account_id = owner_id
    for update;
  end if;

  if not found or parent_is_trashed then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;
  if p_expected_version is null or current_version <> p_expected_version then
    raise exception 'The parent record changed in another session. Reload before saving framing.'
      using errcode = 'PT409';
  end if;

  select * into target
  from public.media_assets as media
  where media.id = p_asset_id
    and media.account_id = owner_id
    and media.status = 'ready'
  for update;
  if not found then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;
  if target.crop is not distinct from p_crop then
    return query select target.id, current_version;
    return;
  end if;

  if target.recipe_id is not null then
    update public.recipes as recipe
    set version = recipe.version + 1,
        updated_at = now()
    where recipe.id = target.recipe_id
      and recipe.account_id = owner_id
      and recipe.trashed_at is null
      and recipe.version = p_expected_version
    returning recipe.version into updated_version;
  else
    update public.publications as publication
    set version = publication.version + 1,
        updated_at = now()
    where publication.id = target.publication_id
      and publication.account_id = owner_id
      and publication.trashed_at is null
      and publication.version = p_expected_version
    returning publication.version into updated_version;
  end if;
  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'The parent record changed in another session. Reload before saving framing.'
      using errcode = 'PT409';
  end if;

  update public.media_assets as media
  set crop = p_crop,
      updated_by_user_id = owner_id,
      updated_at = now()
  where media.id = target.id;

  return query select target.id, updated_version;
end;
$$;

revoke all on function public.media_crop_history_after_update() from public, anon, authenticated;
revoke all on function public.update_media_crop(uuid, integer, jsonb) from public, anon;
grant execute on function public.update_media_crop(uuid, integer, jsonb) to authenticated;

notify pgrst, 'reload schema';