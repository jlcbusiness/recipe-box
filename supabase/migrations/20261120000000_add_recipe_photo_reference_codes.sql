alter table public.media_assets
  add column reference_code smallint,
  add constraint media_assets_reference_code_range check (
    reference_code is null or reference_code between 0 and 99
  );

create unique index media_assets_recipe_photo_reference_code_idx
  on public.media_assets (recipe_id, reference_code)
  where asset_type = 'recipe_photo' and reference_code is not null;

create function public.assign_recipe_photo_reference_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate smallint;
  attempts integer := 0;
begin
  if new.asset_type <> 'recipe_photo' or new.recipe_id is null then
    new.reference_code := null;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.asset_type = 'recipe_photo'
    and old.recipe_id = new.recipe_id
    and old.reference_code is not null
  then
    new.reference_code := old.reference_code;
    return new;
  end if;

  perform 1
  from public.recipes as recipe
  where recipe.id = new.recipe_id
  for update;

  loop
    candidate := floor(random() * 100)::smallint;
    attempts := attempts + 1;
    exit when not exists (
      select 1
      from public.media_assets as media
      where media.recipe_id = new.recipe_id
        and media.asset_type = 'recipe_photo'
        and media.reference_code = candidate
        and media.id <> new.id
    );
    if attempts >= 100 then
      raise exception 'No photo reference codes remain for this recipe.' using errcode = '54000';
    end if;
  end loop;

  new.reference_code := candidate;
  return new;
end;
$$;

create or replace function public.delete_recipe_photo_with_references(
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
  where media.id = p_asset_id and media.account_id = owner_id;
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

  select * into target
  from public.media_assets as media
  where media.id = p_asset_id
    and media.account_id = owner_id
    and media.recipe_id = target_recipe.id
  for update;
  if not found or target.status <> 'ready' or target.asset_type <> 'recipe_photo' then
    raise exception 'The image is unavailable.' using errcode = 'P0002';
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
      '\[\[photo:' || target.id::text || '\]\](-[1-9][0-9]{0,3})?',
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

create trigger assign_recipe_photo_reference_code
  before insert or update of asset_type, recipe_id, reference_code on public.media_assets
  for each row execute function public.assign_recipe_photo_reference_code();

revoke all on function public.assign_recipe_photo_reference_code() from public, anon, authenticated;

do $$
declare
  photo record;
begin
  for photo in
    select media.id
    from public.media_assets as media
    where media.asset_type = 'recipe_photo'
      and media.reference_code is null
    order by media.recipe_id, media.created_at, media.id
  loop
    update public.media_assets as media
    set reference_code = null
    where media.id = photo.id;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
