alter table public.accounts
  add column content_generation uuid not null default gen_random_uuid();

alter table public.export_deletion_queue
  add column delete_immediately boolean not null default false;

alter table public.export_deletion_queue
  drop constraint export_deletion_queue_check,
  add constraint export_deletion_queue_retention_check
    check (delete_immediately or delete_after >= queued_at + interval '24 hours');

create table public.account_content_reset_challenges (
  id uuid primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  provider text not null check (provider in ('email_password', 'google')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  result jsonb
);

create unique index account_content_reset_challenges_open_account_idx
  on public.account_content_reset_challenges (account_id)
  where consumed_at is null;

create index account_content_reset_challenges_expiry_idx
  on public.account_content_reset_challenges (created_at);

alter table public.account_content_reset_challenges enable row level security;
revoke all on public.account_content_reset_challenges from public, anon, authenticated;
grant select, insert, update, delete on public.account_content_reset_challenges to service_role;

create function public.register_export_archive(
  p_account_id uuid,
  p_content_generation uuid,
  p_object_path text,
  p_delete_after timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_generation uuid;
  delete_now boolean;
begin
  if p_account_id is null
    or p_content_generation is null
    or p_object_path is null
    or p_delete_after is null
    or p_object_path not like p_account_id::text || '/exports/%.zip' then
    raise exception 'Invalid export archive registration.' using errcode = '22023';
  end if;

  select account.content_generation
  into current_generation
  from public.accounts as account
  where account.id = p_account_id
  for update;

  if current_generation is null then
    raise exception 'Account is unavailable.' using errcode = 'P0002';
  end if;

  delete_now := current_generation is distinct from p_content_generation;

  insert into public.export_deletion_queue (
    account_id,
    object_path,
    delete_after,
    delete_immediately
  )
  values (
    p_account_id,
    p_object_path,
    case when delete_now then pg_catalog.now() else p_delete_after end,
    delete_now
  )
  on conflict (object_path)
  do update set
    delete_after = least(
      public.export_deletion_queue.delete_after,
      excluded.delete_after
    ),
    delete_immediately =
      public.export_deletion_queue.delete_immediately or excluded.delete_immediately;

  return not delete_now;
end;
$$;

revoke all on function public.register_export_archive(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.register_export_archive(uuid, uuid, text, timestamptz)
  to service_role;

alter function public.read_export_snapshot(uuid)
  rename to read_export_snapshot_without_content_generation;

create function public.read_export_snapshot(p_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  snapshot jsonb;
  account_generation uuid;
begin
  snapshot := public.read_export_snapshot_without_content_generation(p_account_id);
  if snapshot is null then
    return null;
  end if;

  select account.content_generation
  into account_generation
  from public.accounts as account
  where account.id = p_account_id;

  if account_generation is null then
    return null;
  end if;

  return snapshot || pg_catalog.jsonb_build_object(
    'content_generation',
    account_generation
  );
end;
$$;

revoke all on function public.read_export_snapshot_without_content_generation(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.read_export_snapshot_without_content_generation(uuid)
  to service_role;
revoke all on function public.read_export_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.read_export_snapshot(uuid) to service_role;

create function public.reset_account_content(
  p_challenge_id uuid,
  p_confirmation_phrase text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  account_sign_in_method text;
  challenge public.account_content_reset_challenges%rowtype;
  reset_result jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_challenge_id is null
    or p_confirmation_phrase is distinct from 'RESET ALL CONTENT' then
    raise exception 'Recent provider authentication and the exact confirmation phrase are required.'
      using errcode = '42501';
  end if;

  select account.sign_in_method
  into account_sign_in_method
  from public.accounts as account
  where account.id = owner_id
  for update;

  if account_sign_in_method is null then
    raise exception 'Account is unavailable.' using errcode = '42501';
  end if;

  select reset_challenge.*
  into challenge
  from public.account_content_reset_challenges as reset_challenge
  where reset_challenge.id = p_challenge_id
    and reset_challenge.account_id = owner_id
  for update;

  if not found or challenge.provider is distinct from account_sign_in_method then
    raise exception 'Recent provider authentication is required.' using errcode = '42501';
  end if;

  if challenge.consumed_at is not null then
    if challenge.result is not null then
      return challenge.result || pg_catalog.jsonb_build_object('already_completed', true);
    end if;
    raise exception 'This reset confirmation is no longer available.' using errcode = '42501';
  end if;

  if challenge.verified_at is null or challenge.expires_at <= pg_catalog.now() then
    raise exception 'Recent provider authentication has expired.' using errcode = '42501';
  end if;

  update public.export_deletion_queue
  set delete_after = pg_catalog.now(),
      delete_immediately = true
  where account_id = owner_id;

  delete from public.media_assets as media
  where media.account_id = owner_id;

  delete from public.recipes as recipe
  where recipe.account_id = owner_id;

  delete from public.publications as publication
  where publication.account_id = owner_id
    and publication.publication_type <> 'collection';

  delete from public.tags as tag
  where tag.account_id = owner_id;

  delete from public.ingredients as ingredient
  where ingredient.account_id = owner_id;

  delete from public.recipe_picklist_values as picklist
  where picklist.account_id = owner_id;

  delete from public.explorer_state as state
  where state.account_id = owner_id;

  delete from public.recipe_search_documents as document
  where document.account_id = owner_id;

  delete from public.publication_search_documents as document
  where document.account_id = owner_id;

  delete from public.recipe_history as history
  where history.account_id = owner_id;

  delete from public.publication_history as history
  where history.account_id = owner_id;

  delete from public.recipe_picklist_history as history
  where history.account_id = owner_id;

  delete from public.ingredient_catalog_history as history
  where history.account_id = owner_id;

  delete from public.tag_catalog_history as history
  where history.account_id = owner_id;

  perform public.seed_recipe_picklists_for_account(owner_id);
  perform private.ensure_recipe_tin(owner_id);

  update public.recipe_picklist_revisions
  set revision = revision + 1
  where account_id = owner_id;

  update public.ingredient_catalog_revisions
  set revision = revision + 1
  where account_id = owner_id;

  update public.tag_catalog_revisions
  set revision = revision + 1
  where account_id = owner_id;

  update public.accounts
  set volume_system = default,
      weight_system = default,
      temperature_system = default,
      ingredient_presentation = default,
      hand_preference = default,
      ingredient_color = default,
      temperature_color = default,
      duration_color = default,
      private_print_uses_colors = default,
      include_instruction_photos_in_private_print = default,
      repeat_ingredients_in_private_print = default,
      include_private_details_in_private_print = default,
      recipe_column_order = default,
      recipe_hidden_columns = default,
      last_database_export_at = null,
      content_generation = gen_random_uuid()
  where id = owner_id;

  select pg_catalog.jsonb_build_object(
    'content_generation', account.content_generation,
    'database_reset', true
  )
  into reset_result
  from public.accounts as account
  where account.id = owner_id;

  update public.account_content_reset_challenges
  set consumed_at = pg_catalog.now(),
      result = reset_result
  where id = p_challenge_id
    and account_id = owner_id;

  return reset_result;
end;
$$;

revoke all on function public.reset_account_content(uuid, text) from public, anon;
grant execute on function public.reset_account_content(uuid, text) to authenticated;

notify pgrst, 'reload schema';
