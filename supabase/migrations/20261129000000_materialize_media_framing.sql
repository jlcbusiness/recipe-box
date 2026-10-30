alter table public.media_assets
  add column source_full_path text,
  add column source_thumbnail_path text,
  add column source_byte_size bigint;

update public.media_assets
set source_full_path = full_path,
    source_thumbnail_path = thumbnail_path,
    source_byte_size = byte_size
where status = 'ready';

alter table public.media_assets
  add constraint media_assets_source_variants_valid check (
    (status = 'pending'
      and source_full_path is null
      and source_thumbnail_path is null
      and source_byte_size is null)
    or (status = 'ready'
      and source_full_path is not null
      and source_thumbnail_path is not null
      and source_byte_size is not null
      and source_byte_size > 0
      and source_byte_size <= byte_size)
  );

create function public.media_asset_source_variants_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'ready' then
    new.source_full_path := coalesce(new.source_full_path, new.full_path);
    new.source_thumbnail_path := coalesce(new.source_thumbnail_path, new.thumbnail_path);
    new.source_byte_size := coalesce(new.source_byte_size, new.byte_size);
  end if;
  return new;
end;
$$;

create trigger media_asset_source_variants_before_write
  before insert or update of status, full_path, thumbnail_path, byte_size,
    source_full_path, source_thumbnail_path, source_byte_size
  on public.media_assets
  for each row execute function public.media_asset_source_variants_before_write();

grant select (source_full_path, source_thumbnail_path, source_byte_size)
  on public.media_assets to service_role;

create or replace function public.media_asset_paths_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.media_deletion_queue (account_id, object_path)
  select old.account_id, paths.object_path
  from unnest(array[
    old.staging_path,
    old.full_path,
    old.thumbnail_path,
    old.source_full_path,
    old.source_thumbnail_path
  ]) as paths(object_path)
  where paths.object_path is not null
  on conflict (object_path) do nothing;

  return old;
end;
$$;

create function public.update_media_crop_assets(
  p_asset_id uuid,
  p_expected_version integer,
  p_crop jsonb,
  p_full_path text,
  p_thumbnail_path text,
  p_byte_size bigint
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
  target public.media_assets;
  current_version integer;
  updated_version integer;
  parent_is_trashed boolean;
  current_usage bigint;
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

  if target.crop is not distinct from p_crop
    and target.full_path = p_full_path
    and target.thumbnail_path = p_thumbnail_path
    and target.byte_size = p_byte_size
  then
    return query select target.id, current_version, target.full_path, target.thumbnail_path;
    return;
  end if;

  if p_crop is null then
    if p_full_path is distinct from target.source_full_path
      or p_thumbnail_path is distinct from target.source_thumbnail_path
      or p_byte_size is distinct from target.source_byte_size
    then
      raise exception 'The source image paths are invalid.' using errcode = '22023';
    end if;
  else
    if p_full_path !~ (
        '^' || owner_id::text || '/assets/' || target.id::text ||
        '/framing/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/full[.]webp$'
      )
      or p_thumbnail_path is distinct from regexp_replace(p_full_path, '/full[.]webp$', '/thumb.webp')
      or p_byte_size < target.source_byte_size
      or p_full_path = target.source_full_path
      or p_thumbnail_path = target.source_thumbnail_path
    then
      raise exception 'The generated image paths are invalid.' using errcode = '22023';
    end if;
  end if;

  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 1073741824 then
    raise exception 'The processed image metadata is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select coalesce(sum(media.byte_size), 0) into current_usage
  from public.media_assets as media
  where media.account_id = owner_id
    and media.status = 'ready'
    and media.id <> target.id;
  if current_usage + p_byte_size > 1073741824 then
    raise exception 'This framing would exceed the 1 GiB image storage limit.'
      using errcode = '54000';
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
      full_path = p_full_path,
      thumbnail_path = p_thumbnail_path,
      byte_size = p_byte_size,
      updated_by_user_id = owner_id,
      updated_at = now()
  where media.id = target.id;

  return query select target.id, updated_version, target.full_path, target.thumbnail_path;
end;
$$;

create function public.commit_database_import_with_media_sources(
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
  requested_source_full_path text;
  requested_source_thumbnail_path text;
  requested_source_byte_size bigint;
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
      or not (item ?& array['id', 'source_full_path', 'source_thumbnail_path', 'source_byte_size'])
      or item - array['id', 'source_full_path', 'source_thumbnail_path', 'source_byte_size']
        <> '{}'::jsonb
    then
      raise exception 'Imported image sources are invalid.' using errcode = '23514';
    end if;

    asset_id := (item->>'id')::uuid;
    requested_source_full_path := item->>'source_full_path';
    requested_source_thumbnail_path := item->>'source_thumbnail_path';
    requested_source_byte_size := (item->>'source_byte_size')::bigint;
    if requested_source_full_path is null
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
    then
      raise exception 'Imported image source paths are invalid.' using errcode = '23514';
    end if;

    update public.media_assets as media
    set source_full_path = requested_source_full_path,
        source_thumbnail_path = requested_source_thumbnail_path,
        source_byte_size = requested_source_byte_size
    where media.id = asset_id
      and media.account_id = p_account_id
      and media.status = 'ready'
      and media.byte_size >= requested_source_byte_size;
    get diagnostics updated_rows = row_count;
    if updated_rows <> 1 then
      raise exception 'Imported image sources could not be restored.' using errcode = '23514';
    end if;
  end loop;

  if expected_updates <> jsonb_array_length(coalesce(p_records->'media_assets', '[]'::jsonb)) then
    raise exception 'Imported image sources are incomplete.' using errcode = '23514';
  end if;

  return result;
end;
$$;

revoke all on function public.media_asset_source_variants_before_write()
  from public, anon, authenticated;
revoke all on function public.update_media_crop(uuid, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.update_media_crop_assets(uuid, integer, jsonb, text, text, bigint)
  from public, anon;
grant execute on function public.update_media_crop_assets(uuid, integer, jsonb, text, text, bigint)
  to authenticated;
revoke all on function public.commit_database_import_with_media_sources(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb
) from public, anon, authenticated;
grant execute on function public.commit_database_import_with_media_sources(
  uuid, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb
) to service_role;

notify pgrst, 'reload schema';
