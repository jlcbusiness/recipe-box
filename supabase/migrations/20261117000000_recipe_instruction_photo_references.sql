create function public.validate_recipe_step_photo_references()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  marker_count bigint;
  valid_marker_count bigint;
  marker text[];
  asset_id uuid;
begin
  select count(*) into marker_count
  from regexp_matches(new.content_markdown, '\[\[photo:', 'g');

  select count(*) into valid_marker_count
  from regexp_matches(
    new.content_markdown,
    '\[\[photo:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]',
    'gi'
  );

  if marker_count <> valid_marker_count then
    raise exception 'Instruction contains an invalid photo reference.' using errcode = '23514';
  end if;

  for marker in
    select regexp_matches(
      new.content_markdown,
      '\[\[photo:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]',
      'gi'
    )
  loop
    asset_id := marker[1]::uuid;
    if not exists (
      select 1
      from public.media_assets as media
      where media.id = asset_id
        and media.account_id = new.account_id
        and media.recipe_id = new.recipe_id
        and media.asset_type = 'recipe_photo'
        and media.status = 'ready'
    ) then
      raise exception 'Instruction photos must reference a ready photo owned by this recipe.'
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

create trigger recipe_step_photo_reference_guard
  before insert or update of content_markdown, account_id, recipe_id on public.recipe_steps
  for each row execute function public.validate_recipe_step_photo_references();

revoke all on function public.validate_recipe_step_photo_references() from public, anon, authenticated;

create function public.delete_recipe_photo_with_references(
  p_asset_id uuid,
  p_expected_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  target public.media_assets;
  target_recipe public.recipes;
  before_steps jsonb;
  has_references boolean;
  updated_rows integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select * into target
  from public.media_assets as media
  where media.id = p_asset_id and media.account_id = owner_id
  for update;
  if not found or target.status <> 'ready' or target.asset_type <> 'recipe_photo'
    or target.recipe_id is null
  then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;

  select * into target_recipe
  from public.recipes as recipe
  where recipe.id = target.recipe_id
    and recipe.account_id = owner_id
    and recipe.trashed_at is null
  for update;
  if not found then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;
  if p_expected_version is null or target_recipe.version <> p_expected_version then
    raise exception 'The recipe changed in another session. Reload before removing this photo.'
      using errcode = 'PT409';
  end if;

  select exists (
    select 1
    from public.recipe_steps as step
    where step.account_id = owner_id
      and step.recipe_id = target.recipe_id
      and position(('[[photo:' || target.id::text || ']]') in step.content_markdown) > 0
  ) into has_references;

  if has_references then
    select coalesce(
      jsonb_agg(jsonb_build_object(
        'id', step.id,
        'position', step.position,
        'content_markdown', step.content_markdown,
        'plain_text', step.plain_text
      ) order by step.position),
      '[]'::jsonb
    ) into before_steps
    from public.recipe_steps as step
    where step.account_id = owner_id and step.recipe_id = target.recipe_id;

    perform pg_catalog.set_config('app.recipe_steps_before', before_steps::text, true);
    update public.recipe_steps as step
    set content_markdown = regexp_replace(
      step.content_markdown,
      '\[\[photo:' || target.id::text || '\]\]',
      '',
      'gi'
    )
    where step.account_id = owner_id
      and step.recipe_id = target.recipe_id
      and position(('[[photo:' || target.id::text || ']]') in step.content_markdown) > 0;

    update public.recipes as recipe
    set version = recipe.version + 1,
        updated_at = now()
    where recipe.id = target_recipe.id
      and recipe.account_id = owner_id
      and recipe.version = p_expected_version;
    get diagnostics updated_rows = row_count;
    if updated_rows <> 1 then
      raise exception 'The recipe changed in another session. Reload before removing this photo.'
        using errcode = 'PT409';
    end if;
  end if;

  delete from public.media_assets where id = target.id;
  if target.is_primary then
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

revoke all on function public.delete_recipe_photo_with_references(uuid, integer) from public, anon;
grant execute on function public.delete_recipe_photo_with_references(uuid, integer) to authenticated;

create or replace function public.delete_media_asset(p_asset_id uuid)
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
  if target.recipe_id is not null then
    raise exception 'Recipe photos must be removed through the version-checked recipe action.'
      using errcode = 'PT409';
  end if;
  if target.publication_id is null or not exists (
    select 1 from public.publications as publication
    where publication.id = target.publication_id
      and publication.account_id = owner_id
      and publication.trashed_at is null
  ) then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
  end if;

  delete from public.media_assets where id = p_asset_id;
end;
$$;

revoke all on function public.delete_media_asset(uuid) from public, anon;
grant execute on function public.delete_media_asset(uuid) to authenticated;

notify pgrst, 'reload schema';
