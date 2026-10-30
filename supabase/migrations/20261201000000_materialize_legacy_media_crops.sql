create function public.materialize_legacy_media_crop_assets(
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

  update public.media_assets as media
  set full_path = p_full_path,
      thumbnail_path = p_thumbnail_path,
      byte_size = p_byte_size,
      display_width = p_display_width,
      display_height = p_display_height,
      updated_at = now()
  where media.id = target.id
    and media.status = 'ready';
  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;

  return query select target.id, target.full_path, target.thumbnail_path;
end;
$$;

revoke all on function public.materialize_legacy_media_crop_assets(
  uuid, jsonb, text, text, text, text, bigint, integer, integer
) from public, anon, authenticated;
grant execute on function public.materialize_legacy_media_crop_assets(
  uuid, jsonb, text, text, text, text, bigint, integer, integer
) to service_role;

notify pgrst, 'reload schema';
