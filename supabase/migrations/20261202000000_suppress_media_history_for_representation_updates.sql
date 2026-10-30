create or replace function public.media_asset_history_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset public.media_assets;
  previous public.media_assets;
  change_type text;
  event_name text;
  before_value jsonb;
  after_value jsonb;
  actor_id uuid;
begin
  if tg_op = 'UPDATE'
    and auth.role() is not distinct from 'service_role'
    and current_setting('app.media_representation_update', true) = 'on'
  then
    return new;
  end if;

  if tg_op = 'DELETE' then
    previous := old;
    asset := old;
    if old.status <> 'ready' then
      return old;
    end if;
    change_type := 'removed';
    actor_id := old.updated_by_user_id;
  elsif tg_op = 'INSERT' then
    asset := new;
    if new.status <> 'ready' then
      return new;
    end if;
    change_type := 'added';
    actor_id := coalesce(new.updated_by_user_id, new.created_by_user_id);
  else
    previous := old;
    asset := new;
    if new.status <> 'ready' then
      return new;
    end if;
    if old.status <> 'ready' then
      change_type := 'added';
    elsif row(
      old.description,
      old.position,
      old.is_primary,
      old.byte_size,
      old.width,
      old.height
    ) is distinct from row(
      new.description,
      new.position,
      new.is_primary,
      new.byte_size,
      new.width,
      new.height
    ) then
      change_type := 'updated';
    else
      return new;
    end if;
    actor_id := coalesce(new.updated_by_user_id, new.created_by_user_id);
  end if;

  if asset.recipe_id is not null then
    if not exists (
      select 1 from public.recipes as recipe
      where recipe.account_id = asset.account_id and recipe.id = asset.recipe_id
    ) then
      return coalesce(new, old);
    end if;
    event_name := 'recipe.photo_' || change_type;
  else
    if not exists (
      select 1 from public.publications as publication
      where publication.account_id = asset.account_id and publication.id = asset.publication_id
    ) then
      return coalesce(new, old);
    end if;
    event_name := 'publication.cover_' || change_type;
  end if;

  if change_type in ('updated', 'removed') then
    before_value := jsonb_build_object(
      'id', previous.id,
      'asset_type', previous.asset_type,
      'description', previous.description,
      'position', previous.position,
      'is_primary', previous.is_primary,
      'byte_size', previous.byte_size,
      'width', previous.width,
      'height', previous.height
    );
  end if;
  if change_type in ('updated', 'added') then
    after_value := jsonb_build_object(
      'id', asset.id,
      'asset_type', asset.asset_type,
      'description', asset.description,
      'position', asset.position,
      'is_primary', asset.is_primary,
      'byte_size', asset.byte_size,
      'width', asset.width,
      'height', asset.height
    );
  end if;

  if asset.recipe_id is not null then
    insert into public.recipe_history (
      account_id, actor_user_id, record_id, event_type, before_data, after_data
    )
    values (
      asset.account_id, actor_id, asset.recipe_id, event_name, before_value, after_value
    );
  else
    insert into public.publication_history (
      account_id, actor_user_id, record_id, event_type, before_data, after_data
    )
    values (
      asset.account_id, actor_id, asset.publication_id, event_name, before_value, after_value
    );
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function public.materialize_legacy_media_crop_assets(
  p_asset_id uuid,
  p_expected_crop jsonb,
  p_expected_source_full_path text,
  p_expected_source_thumbnail_path text,
  p_full_path text,
  p_thumbnail_path text,
  p_byte_size bigint,
  p_display_width integer,
  p_display_height integer
)
returns table (
  id uuid,
  previous_full_path text,
  previous_thumbnail_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.media_assets;
  current_usage bigint;
  updated_rows integer;
  previous_history_setting text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'This operation is not available.' using errcode = '42501';
  end if;
  if p_expected_crop is null or jsonb_typeof(p_expected_crop) is distinct from 'object'
    or p_display_width is null or p_display_width not between 1 and 2048
    or p_display_height is null or p_display_height not between 1 and 2048
    or p_byte_size is null or p_byte_size < 1 or p_byte_size > 1073741824
  then
    raise exception 'The processed image metadata is invalid.' using errcode = '22023';
  end if;

  select * into target
  from public.media_assets as media
  where media.id = p_asset_id
    and media.status = 'ready'
  for update;
  if not found then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;

  if target.crop is distinct from p_expected_crop
    or target.full_path is distinct from target.source_full_path
    or target.thumbnail_path is distinct from target.source_thumbnail_path
    or target.source_full_path is distinct from p_expected_source_full_path
    or target.source_thumbnail_path is distinct from p_expected_source_thumbnail_path
  then
    raise exception 'The saved image framing or source changed before materialization.'
      using errcode = 'PT409';
  end if;

  if p_full_path !~ (
      '^' || target.account_id::text || '/assets/' || target.id::text ||
      '/framing/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/full[.]webp$'
    )
    or p_thumbnail_path is distinct from regexp_replace(p_full_path, '/full[.]webp$', '/thumb.webp')
    or p_full_path is not distinct from target.source_full_path
    or p_thumbnail_path is not distinct from target.source_thumbnail_path
    or p_byte_size < target.source_byte_size
  then
    raise exception 'The generated image paths or size are invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target.account_id::text, 0));
  select coalesce(sum(media.byte_size), 0) into current_usage
  from public.media_assets as media
  where media.account_id = target.account_id
    and media.status = 'ready'
    and media.id <> target.id;
  if current_usage + p_byte_size > 1073741824 then
    raise exception 'This framing would exceed the 1 GiB image storage limit.'
      using errcode = '54000';
  end if;

  previous_history_setting := current_setting('app.media_representation_update', true);
  perform set_config('app.media_representation_update', 'on', true);
  update public.media_assets as media
  set full_path = p_full_path,
      thumbnail_path = p_thumbnail_path,
      byte_size = p_byte_size,
      display_width = p_display_width,
      display_height = p_display_height,
      updated_at = now()
  where media.id = target.id
    and media.status = 'ready';
  perform set_config(
    'app.media_representation_update',
    coalesce(previous_history_setting, ''),
    true
  );
  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;

  return query select target.id, target.full_path, target.thumbnail_path;
end;
$$;

notify pgrst, 'reload schema';
