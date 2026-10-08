update storage.buckets
set public = false,
    file_size_limit = 20971520
where id = 'recipe-media';

drop policy "Account owners can upload their recipe media" on storage.objects;
drop policy "Account owners can update their recipe media" on storage.objects;
drop policy "Account owners can delete their recipe media" on storage.objects;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  recipe_id uuid,
  publication_id uuid,
  asset_type text not null check (asset_type in ('recipe_photo', 'publication_cover')),
  status text not null default 'pending' check (status in ('pending', 'ready')),
  staging_path text,
  full_path text,
  thumbnail_path text,
  content_type text,
  description text not null default '' check (length(description) <= 250),
  position integer not null default 0 check (position >= 0),
  is_primary boolean not null default false,
  byte_size bigint not null default 0 check (byte_size >= 0),
  width integer,
  height integer,
  created_by_user_id uuid references auth.users (id) on delete set null,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, id),
  foreign key (account_id, recipe_id)
    references public.recipes (account_id, id) on delete cascade,
  foreign key (account_id, publication_id)
    references public.publications (account_id, id) on delete cascade,
  check (
    (asset_type = 'recipe_photo' and recipe_id is not null and publication_id is null)
    or (asset_type = 'publication_cover' and publication_id is not null and recipe_id is null)
  ),
  check (asset_type = 'recipe_photo' or not is_primary),
  check (
    (status = 'pending'
      and full_path is null
      and thumbnail_path is null
      and content_type is null
      and byte_size = 0
      and width is null
      and height is null
      and not is_primary)
    or (status = 'ready'
      and full_path is not null
      and thumbnail_path is not null
      and content_type = 'image/webp'
      and byte_size > 0
      and width between 1 and 2048
      and height between 1 and 2048)
  )
);

create unique index media_assets_ready_cover_idx
  on public.media_assets (publication_id)
  where asset_type = 'publication_cover' and status = 'ready';

create unique index media_assets_primary_recipe_photo_idx
  on public.media_assets (recipe_id)
  where asset_type = 'recipe_photo' and status = 'ready' and is_primary;

create unique index media_assets_storage_path_idx
  on public.media_assets (staging_path)
  where staging_path is not null;

create index media_assets_owner_recipe_order_idx
  on public.media_assets (account_id, recipe_id, position)
  where status = 'ready' and asset_type = 'recipe_photo';

create index media_assets_owner_publication_idx
  on public.media_assets (account_id, publication_id)
  where status = 'ready' and asset_type = 'publication_cover';

alter table public.media_assets enable row level security;
grant select on public.media_assets to authenticated;

create policy "Owners can read ready media for active records"
  on public.media_assets
  for select
  to authenticated
  using (
    account_id = (select auth.uid())
    and status = 'ready'
    and (
      (recipe_id is not null and exists (
        select 1 from public.recipes as recipe
        where recipe.account_id = media_assets.account_id
          and recipe.id = media_assets.recipe_id
          and recipe.trashed_at is null
      ))
      or (publication_id is not null and exists (
        select 1 from public.publications as publication
        where publication.account_id = media_assets.account_id
          and publication.id = media_assets.publication_id
          and publication.trashed_at is null
      ))
    )
  );

create table public.media_deletion_queue (
  id bigint generated always as identity primary key,
  account_id uuid not null,
  object_path text not null unique,
  queued_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text
);

alter table public.media_deletion_queue enable row level security;
grant select, update, delete on public.media_deletion_queue to service_role;
grant usage, select on sequence public.media_deletion_queue_id_seq to service_role;

alter table public.recipe_history
  drop constraint recipe_history_event_type_check,
  add constraint recipe_history_event_type_check check (
    event_type in (
      'recipe.created',
      'recipe.updated',
      'recipe.trashed',
      'recipe.restored',
      'recipe.photo_added',
      'recipe.photo_updated',
      'recipe.photo_removed'
    )
  );

alter table public.publication_history
  drop constraint publication_history_event_type_check,
  add constraint publication_history_event_type_check check (
    event_type in (
      'publication.created',
      'publication.trashed',
      'publication.restored',
      'publication.cover_added',
      'publication.cover_updated',
      'publication.cover_removed'
    )
  );

create function public.media_asset_paths_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.media_deletion_queue (account_id, object_path)
  select old.account_id, paths.object_path
  from unnest(array[old.staging_path, old.full_path, old.thumbnail_path]) as paths(object_path)
  where paths.object_path is not null
  on conflict (object_path) do nothing;

  return old;
end;
$$;

create trigger media_asset_paths_before_delete
  before delete on public.media_assets
  for each row execute function public.media_asset_paths_before_delete();

create function public.media_asset_history_after_change()
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

create trigger media_asset_history_after_insert
  after insert on public.media_assets
  for each row execute function public.media_asset_history_after_change();

create trigger media_asset_history_after_update
  after update on public.media_assets
  for each row execute function public.media_asset_history_after_change();

create trigger media_asset_history_after_delete
  after delete on public.media_assets
  for each row execute function public.media_asset_history_after_change();

create function public.reserve_media_upload(
  p_parent_type text,
  p_parent_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  new_asset_id uuid := gen_random_uuid();
  new_asset_type text;
  new_staging_path text;
  existing_count integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_parent_type not in ('recipe', 'publication') or p_parent_id is null then
    raise exception 'The media parent is invalid.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));

  if p_parent_type = 'recipe' then
    if not exists (
      select 1 from public.recipes as recipe
      where recipe.id = p_parent_id
        and recipe.account_id = owner_id
        and recipe.trashed_at is null
    ) then
      raise exception 'The recipe is unavailable.' using errcode = 'P0002';
    end if;
    new_asset_type := 'recipe_photo';
    select count(*) into existing_count
    from public.media_assets as media
    where media.account_id = owner_id
      and media.recipe_id = p_parent_id
      and media.asset_type = 'recipe_photo';
    if existing_count >= 12 then
      raise exception 'A recipe can have at most 12 photos.' using errcode = '54000';
    end if;
  else
    if not exists (
      select 1 from public.publications as publication
      where publication.id = p_parent_id
        and publication.account_id = owner_id
        and publication.trashed_at is null
    ) then
      raise exception 'The publication is unavailable.' using errcode = 'P0002';
    end if;
    new_asset_type := 'publication_cover';
    if exists (
      select 1 from public.media_assets as media
      where media.account_id = owner_id
        and media.publication_id = p_parent_id
        and media.asset_type = 'publication_cover'
        and media.status = 'pending'
    ) then
      raise exception 'A cover upload is already in progress.' using errcode = '55000';
    end if;
  end if;

  select count(*) into existing_count
  from public.media_assets as media
  where media.account_id = owner_id and media.status = 'pending';
  if existing_count >= 5 then
    raise exception 'Finish or cancel another image upload before starting a new one.'
      using errcode = '54000';
  end if;

  new_staging_path := owner_id::text || '/staging/' || new_asset_id::text || '/source';
  insert into public.media_assets (
    id, account_id, recipe_id, publication_id, asset_type, staging_path, created_by_user_id
  )
  values (
    new_asset_id,
    owner_id,
    case when p_parent_type = 'recipe' then p_parent_id else null end,
    case when p_parent_type = 'publication' then p_parent_id else null end,
    new_asset_type,
    new_staging_path,
    owner_id
  );

  return new_asset_id;
end;
$$;

revoke all on function public.reserve_media_upload(text, uuid) from public, anon;
grant execute on function public.reserve_media_upload(text, uuid) to authenticated;

create function public.complete_media_upload(
  p_asset_id uuid,
  p_width integer,
  p_height integer,
  p_byte_size bigint,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.media_assets;
  current_usage bigint;
  becomes_primary boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Media finalization requires the trusted server.' using errcode = '42501';
  end if;
  if p_width is null or p_height is null
    or p_width < 1 or p_height < 1
    or p_width > 2048 or p_height > 2048
    or p_byte_size is null or p_byte_size < 1
    or p_description is null or length(p_description) > 250
  then
    raise exception 'The processed image metadata is invalid.' using errcode = '22023';
  end if;

  select * into target
  from public.media_assets as media
  where media.id = p_asset_id and media.status = 'pending'
  for update;
  if not found then
    raise exception 'The image upload is no longer available.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target.account_id::text, 0));

  if (target.recipe_id is not null and not exists (
        select 1 from public.recipes as recipe
        where recipe.id = target.recipe_id
          and recipe.account_id = target.account_id
          and recipe.trashed_at is null
      ))
    or (target.publication_id is not null and not exists (
        select 1 from public.publications as publication
        where publication.id = target.publication_id
          and publication.account_id = target.account_id
          and publication.trashed_at is null
      ))
  then
    raise exception 'The image parent is no longer available.' using errcode = 'P0002';
  end if;

  select coalesce(sum(media.byte_size), 0) into current_usage
  from public.media_assets as media
  where media.account_id = target.account_id and media.status = 'ready';
  if current_usage + p_byte_size > 1073741824 then
    raise exception 'This upload would exceed the 1 GiB image storage limit.'
      using errcode = '54000';
  end if;

  if target.asset_type = 'publication_cover' then
    delete from public.media_assets as existing
    where existing.account_id = target.account_id
      and existing.publication_id = target.publication_id
      and existing.asset_type = 'publication_cover'
      and existing.status = 'ready';
  else
    becomes_primary := not exists (
      select 1 from public.media_assets as existing
      where existing.account_id = target.account_id
        and existing.recipe_id = target.recipe_id
        and existing.asset_type = 'recipe_photo'
        and existing.status = 'ready'
        and existing.is_primary
    );
  end if;

  update public.media_assets as media
  set status = 'ready',
      full_path = target.account_id::text || '/assets/' || target.id::text || '/full.webp',
      thumbnail_path = target.account_id::text || '/assets/' || target.id::text || '/thumb.webp',
      content_type = 'image/webp',
      description = p_description,
      byte_size = p_byte_size,
      width = p_width,
      height = p_height,
      is_primary = becomes_primary,
      updated_by_user_id = target.created_by_user_id,
      updated_at = now()
  where media.id = target.id;
end;
$$;

revoke all on function public.complete_media_upload(uuid, integer, integer, bigint, text)
  from public, anon, authenticated;
grant execute on function public.complete_media_upload(uuid, integer, integer, bigint, text)
  to service_role;

create function public.set_recipe_photo_primary(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  target public.media_assets;
begin
  select * into target
  from public.media_assets as media
  where media.id = p_asset_id
    and media.account_id = owner_id
    and media.asset_type = 'recipe_photo'
    and media.status = 'ready'
  for update;
  if not found or not exists (
    select 1 from public.recipes as recipe
    where recipe.id = target.recipe_id
      and recipe.account_id = owner_id
      and recipe.trashed_at is null
  ) then
    raise exception 'The photo is unavailable.' using errcode = 'P0002';
  end if;

  update public.media_assets
  set is_primary = false,
      updated_by_user_id = owner_id,
      updated_at = now()
  where account_id = owner_id
    and recipe_id = target.recipe_id
    and asset_type = 'recipe_photo'
    and status = 'ready'
    and is_primary
    and id <> p_asset_id;

  update public.media_assets
  set is_primary = true,
      updated_by_user_id = owner_id,
      updated_at = now()
  where id = p_asset_id and not is_primary;
end;
$$;

revoke all on function public.set_recipe_photo_primary(uuid) from public, anon;
grant execute on function public.set_recipe_photo_primary(uuid) to authenticated;

create function public.update_media_description(p_asset_id uuid, p_description text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  target public.media_assets;
begin
  if p_description is null or length(p_description) > 250 then
    raise exception 'Photo descriptions must be 250 characters or fewer.'
      using errcode = '22023';
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
  if (target.recipe_id is not null and not exists (
        select 1 from public.recipes as recipe
        where recipe.id = target.recipe_id
          and recipe.account_id = owner_id
          and recipe.trashed_at is null
      ))
    or (target.publication_id is not null and not exists (
        select 1 from public.publications as publication
        where publication.id = target.publication_id
          and publication.account_id = owner_id
          and publication.trashed_at is null
      ))
  then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;

  update public.media_assets
  set description = p_description,
      updated_by_user_id = owner_id,
      updated_at = now()
  where id = p_asset_id and description is distinct from p_description;
end;
$$;

revoke all on function public.update_media_description(uuid, text) from public, anon;
grant execute on function public.update_media_description(uuid, text) to authenticated;

create function public.reorder_recipe_photos(p_recipe_id uuid, p_asset_ids uuid[])
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

create function public.delete_media_asset(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  target public.media_assets;
begin
  select * into target
  from public.media_assets as media
  where media.id = p_asset_id and media.account_id = owner_id
  for update;
  if not found or target.status <> 'ready' then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;
  if (target.recipe_id is not null and not exists (
        select 1 from public.recipes as recipe
        where recipe.id = target.recipe_id
          and recipe.account_id = owner_id
          and recipe.trashed_at is null
      ))
    or (target.publication_id is not null and not exists (
        select 1 from public.publications as publication
        where publication.id = target.publication_id
          and publication.account_id = owner_id
          and publication.trashed_at is null
      ))
  then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;

  delete from public.media_assets where id = p_asset_id;
  if target.recipe_id is not null and target.is_primary then
    update public.media_assets as next_photo
    set is_primary = true,
        updated_by_user_id = owner_id,
        updated_at = now()
    where next_photo.id = (
      select candidate.id
      from public.media_assets as candidate
      where candidate.recipe_id = target.recipe_id
        and candidate.account_id = owner_id
        and candidate.asset_type = 'recipe_photo'
        and candidate.status = 'ready'
      order by candidate.position, candidate.created_at
      limit 1
    );
  end if;
end;
$$;

revoke all on function public.delete_media_asset(uuid) from public, anon;
grant execute on function public.delete_media_asset(uuid) to authenticated;
