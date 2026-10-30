alter table public.media_assets
  add column display_width integer,
  add column display_height integer;

update public.media_assets
set display_width = width,
    display_height = height
where status = 'ready';

alter table public.media_assets
  add constraint media_assets_display_dimensions_valid check (
    (status = 'pending'
      and display_width is null
      and display_height is null)
    or (status = 'ready'
      and display_width between 1 and 2048
      and display_height between 1 and 2048)
  );

create or replace function public.media_asset_source_variants_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'ready' then
    new.source_full_path := coalesce(new.source_full_path, new.full_path);
    new.source_thumbnail_path := coalesce(new.source_thumbnail_path, new.thumbnail_path);
    new.source_byte_size := coalesce(new.source_byte_size, new.byte_size);
    new.display_width := coalesce(new.display_width, new.width);
    new.display_height := coalesce(new.display_height, new.height);
  end if;
  return new;
end;
$$;

drop trigger media_asset_source_variants_before_write on public.media_assets;
create trigger media_asset_source_variants_before_write
  before insert or update of status, full_path, thumbnail_path, byte_size,
    width, height, source_full_path, source_thumbnail_path, source_byte_size,
    display_width, display_height
  on public.media_assets
  for each row execute function public.media_asset_source_variants_before_write();

create function public.update_media_crop_assets_with_dimensions(
  p_asset_id uuid,
  p_expected_version integer,
  p_crop jsonb,
  p_full_path text,
  p_thumbnail_path text,
  p_byte_size bigint,
  p_display_width integer,
  p_display_height integer
)
returns table (
  id uuid,
  version integer,
  previous_full_path text,
  previous_thumbnail_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  source_width integer;
  source_height integer;
  crop_result record;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_display_width is null or p_display_width not between 1 and 2048
    or p_display_height is null or p_display_height not between 1 and 2048
  then
    raise exception 'The processed image dimensions are invalid.' using errcode = '22023';
  end if;

  select media.width, media.height
  into source_width, source_height
  from public.media_assets as media
  where media.id = p_asset_id
    and media.account_id = owner_id
    and media.status = 'ready';
  if not found then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;
  if p_crop is null and (
    p_display_width is distinct from source_width
    or p_display_height is distinct from source_height
  ) then
    raise exception 'Reset image dimensions must match the retained source.'
      using errcode = '22023';
  end if;

  select * into crop_result
  from public.update_media_crop_assets(
    p_asset_id,
    p_expected_version,
    p_crop,
    p_full_path,
    p_thumbnail_path,
    p_byte_size
  );
  if not found then
    raise exception 'The image framing could not be saved.' using errcode = 'P0002';
  end if;

  update public.media_assets as media
  set display_width = p_display_width,
      display_height = p_display_height
  where media.id = p_asset_id
    and media.account_id = owner_id
    and media.status = 'ready';
  if not found then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;

  return query
  select crop_result.id, crop_result.version,
    crop_result.previous_full_path, crop_result.previous_thumbnail_path;
end;
$$;

create or replace function public.commit_database_import_with_media_sources(
  p_account_id uuid,
  p_account_preferences jsonb,
  p_records jsonb,
  p_expected_versions jsonb,
  p_replace_recipe_ids uuid[],
  p_replace_publication_ids uuid[],
  p_media_sources jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  item jsonb;
  asset_id uuid;
  processed_asset_ids uuid[] := '{}';
  requested_source_full_path text;
  requested_source_thumbnail_path text;
  requested_source_byte_size bigint;
  requested_display_width integer;
  requested_display_height integer;
  updated_rows integer;
  expected_updates integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'This operation is not available.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_media_sources) is distinct from 'array' then
    raise exception 'Imported image sources are invalid.' using errcode = '23514';
  end if;

  result := public.commit_database_import_with_preferences(
    p_account_id,
    p_account_preferences,
    p_records,
    p_expected_versions,
    p_replace_recipe_ids,
    p_replace_publication_ids
  );

  expected_updates := jsonb_array_length(p_media_sources);
  for item in select value from jsonb_array_elements(p_media_sources)
  loop
    if jsonb_typeof(item) is distinct from 'object'
      or not (item ?& array[
        'id', 'source_full_path', 'source_thumbnail_path', 'source_byte_size',
        'display_width', 'display_height'
      ])
      or item - array[
        'id', 'source_full_path', 'source_thumbnail_path', 'source_byte_size',
        'display_width', 'display_height'
      ] <> '{}'::jsonb
      or jsonb_typeof(item->'display_width') is distinct from 'number'
      or jsonb_typeof(item->'display_height') is distinct from 'number'
      or item->>'display_width' !~ '^[0-9]+$'
      or item->>'display_height' !~ '^[0-9]+$'
    then
      raise exception 'Imported image sources are invalid.' using errcode = '23514';
    end if;

    asset_id := (item->>'id')::uuid;
    requested_source_full_path := item->>'source_full_path';
    requested_source_thumbnail_path := item->>'source_thumbnail_path';
    requested_source_byte_size := (item->>'source_byte_size')::bigint;
    requested_display_width := (item->>'display_width')::integer;
    requested_display_height := (item->>'display_height')::integer;
    if asset_id = any(processed_asset_ids)
      or requested_source_full_path is null
      or requested_source_thumbnail_path is null
      or requested_source_byte_size is null
      or requested_source_full_path !~ (
        '^' || p_account_id::text || '/assets/' || asset_id::text ||
        '/(full[.]webp|source/full[.]webp)$'
      )
      or requested_source_thumbnail_path !~ (
        '^' || p_account_id::text || '/assets/' || asset_id::text ||
        '/(thumb[.]webp|source/thumb[.]webp)$'
      )
      or requested_source_byte_size < 1
      or requested_display_width not between 1 and 2048
      or requested_display_height not between 1 and 2048
    then
      raise exception 'Imported image source paths or dimensions are invalid.'
        using errcode = '23514';
    end if;

    update public.media_assets as media
    set source_full_path = requested_source_full_path,
        source_thumbnail_path = requested_source_thumbnail_path,
        source_byte_size = requested_source_byte_size,
        display_width = requested_display_width,
        display_height = requested_display_height
    where media.id = asset_id
      and media.account_id = p_account_id
      and media.status = 'ready'
      and media.byte_size >= requested_source_byte_size;
    get diagnostics updated_rows = row_count;
    if updated_rows <> 1 then
      raise exception 'Imported image sources could not be restored.' using errcode = '23514';
    end if;
    processed_asset_ids := array_append(processed_asset_ids, asset_id);
  end loop;

  if expected_updates <> jsonb_array_length(coalesce(p_records->'media_assets', '[]'::jsonb)) then
    raise exception 'Imported image sources are incomplete.' using errcode = '23514';
  end if;

  return result;
end;
$$;

revoke all on function public.update_media_crop_assets(uuid, integer, jsonb, text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.update_media_crop_assets_with_dimensions(
  uuid, integer, jsonb, text, text, bigint, integer, integer
) from public, anon, authenticated;
grant execute on function public.update_media_crop_assets_with_dimensions(
  uuid, integer, jsonb, text, text, bigint, integer, integer
) to authenticated;
revoke all on function public.commit_database_import_with_media_sources(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.commit_database_import_with_media_sources(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb
) to service_role;

notify pgrst, 'reload schema';
