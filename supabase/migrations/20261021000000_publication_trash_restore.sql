alter table public.publications
  add column trashed_at timestamptz,
  add column trashed_by_user_id uuid references auth.users (id) on delete set null;

alter table public.publication_history
  drop constraint publication_history_event_type_check,
  add constraint publication_history_event_type_check check (
    event_type in (
      'publication.created',
      'publication.trashed',
      'publication.restored'
    )
  );

create index publications_active_owner_type_name_idx
  on public.publications (account_id, publication_type, name)
  where trashed_at is null;

create index publications_trash_owner_deleted_idx
  on public.publications (account_id, trashed_at desc)
  where trashed_at is not null;

drop policy "Account owners can read publications" on public.publications;
create policy "Account owners can read active publications"
  on public.publications
  for select
  to authenticated
  using ((select auth.uid()) = account_id and trashed_at is null);

create or replace function public.guard_publication_lifecycle_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.publication_lifecycle_context', true) is distinct from 'on'
    and (
      old.trashed_at is not null
      or old.trashed_at is distinct from new.trashed_at
      or old.trashed_by_user_id is distinct from new.trashed_by_user_id
    )
  then
    raise exception 'Publication lifecycle changes require an authorized lifecycle action.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_publication_lifecycle_update
  before update on public.publications
  for each row execute function public.guard_publication_lifecycle_update();

create or replace function public.publication_history_after_lifecycle_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.publication_history (
    account_id,
    actor_user_id,
    record_id,
    event_type,
    before_data,
    after_data
  )
  values (
    new.account_id,
    auth.uid(),
    new.id,
    case
      when old.trashed_at is null and new.trashed_at is not null then 'publication.trashed'
      else 'publication.restored'
    end,
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;

create trigger publication_history_after_lifecycle_update
  after update on public.publications
  for each row
  when (old.trashed_at is distinct from new.trashed_at)
  execute function public.publication_history_after_lifecycle_update();

create or replace function public.apply_recipe_publication_context()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_publication_type text;
begin
  if current_setting('app.recipe_publication_context', true) = 'on' then
    new.publication_id := nullif(current_setting('app.recipe_publication_id', true), '')::uuid;
    new.publication_page := nullif(trim(current_setting('app.recipe_publication_page', true)), '');
    new.recipe_url := nullif(trim(current_setting('app.recipe_url', true)), '');
  end if;

  if new.publication_id is null then
    if new.publication_page is not null or new.recipe_url is not null then
      raise exception 'Recipe Tin recipes cannot have a publication location.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select publication.publication_type
  into selected_publication_type
  from public.publications as publication
  where publication.account_id = new.account_id
    and publication.id = new.publication_id
    and publication.trashed_at is null
  for key share;

  if selected_publication_type is null then
    raise exception 'Publication is not available to this account.' using errcode = 'P0002';
  end if;

  if (selected_publication_type = 'book' and new.recipe_url is not null)
    or (selected_publication_type = 'magazine'
      and (new.publication_page is not null or new.recipe_url is not null))
    or (selected_publication_type = 'site' and new.publication_page is not null)
  then
    raise exception 'Recipe location does not match Publication type.' using errcode = '23514';
  end if;

  if new.recipe_url is not null and new.recipe_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Recipe URL must be an absolute HTTP(S) URL.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create function public.list_trashed_publications()
returns table (
  id uuid,
  name text,
  publication_type text,
  version integer,
  trashed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select publication.id,
         publication.name,
         publication.publication_type,
         publication.version,
         publication.trashed_at
  from public.publications as publication
  where publication.account_id = auth.uid()
    and publication.trashed_at is not null
  order by publication.trashed_at desc, publication.name, publication.id;
$$;

revoke all on function public.list_trashed_publications() from public, anon;
grant execute on function public.list_trashed_publications() to authenticated;

create function public.trash_publication(
  p_publication_id uuid,
  p_expected_version integer,
  p_recipe_disposition text,
  p_destination_publication_id uuid
)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  publication_version integer;
  publication_trashed_at timestamptz;
  destination_type text;
  deleted_at timestamptz := pg_catalog.now();
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select publication.version, publication.trashed_at
  into publication_version, publication_trashed_at
  from public.publications as publication
  where publication.id = p_publication_id
    and publication.account_id = owner_id
  for update;

  if not found then
    raise exception 'Publication not found.' using errcode = 'P0002';
  end if;
  if publication_version is distinct from p_expected_version then
    raise exception 'Publication version is stale.' using errcode = '40001';
  end if;
  if publication_trashed_at is not null then
    raise exception 'Publication is already in Trash.' using errcode = '55000';
  end if;
  if p_recipe_disposition is null
    or p_recipe_disposition not in ('delete', 'recipe_tin', 'another_publication')
  then
    raise exception 'Choose a valid recipe disposition.' using errcode = '23514';
  end if;

  if p_recipe_disposition = 'another_publication' then
    if p_destination_publication_id is null or p_destination_publication_id = p_publication_id then
      raise exception 'Choose another active publication.' using errcode = '23514';
    end if;

    select publication.publication_type
    into destination_type
    from public.publications as publication
    where publication.id = p_destination_publication_id
      and publication.account_id = owner_id
      and publication.trashed_at is null
    for update;

    if not found then
      raise exception 'Destination publication is not available.' using errcode = 'P0002';
    end if;
  elsif p_destination_publication_id is not null then
    raise exception 'A destination is only valid when moving recipes to another publication.'
      using errcode = '23514';
  end if;

  perform pg_catalog.set_config('app.recipe_lifecycle_context', 'on', true);

  if p_recipe_disposition = 'delete' then
    update public.recipes as recipe
    set trashed_at = deleted_at,
        trashed_by_user_id = owner_id,
        version = recipe.version + 1
    where recipe.account_id = owner_id
      and recipe.publication_id = p_publication_id
      and recipe.trashed_at is null;
  elsif p_recipe_disposition = 'recipe_tin' then
    update public.recipes as recipe
    set publication_id = null,
        publication_page = null,
        recipe_url = null,
        version = recipe.version + 1
    where recipe.account_id = owner_id
      and recipe.publication_id = p_publication_id;
  else
    update public.recipes as recipe
    set publication_id = p_destination_publication_id,
        publication_page = case
          when destination_type = 'book' then recipe.publication_page
          else null
        end,
        recipe_url = case
          when destination_type = 'site' then recipe.recipe_url
          else null
        end,
        version = recipe.version + 1
    where recipe.account_id = owner_id
      and recipe.publication_id = p_publication_id;
  end if;

  perform pg_catalog.set_config('app.publication_lifecycle_context', 'on', true);
  return query
    update public.publications as publication
    set trashed_at = deleted_at,
        trashed_by_user_id = owner_id,
        version = publication.version + 1
    where publication.id = p_publication_id
      and publication.account_id = owner_id
    returning publication.id, publication.version;
end;
$$;

revoke all on function public.trash_publication(uuid, integer, text, uuid)
  from public, anon;
grant execute on function public.trash_publication(uuid, integer, text, uuid)
  to authenticated;

create function public.restore_publication(p_publication_id uuid, p_expected_version integer)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  publication_version integer;
  publication_trashed_at timestamptz;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select publication.version, publication.trashed_at
  into publication_version, publication_trashed_at
  from public.publications as publication
  where publication.id = p_publication_id
    and publication.account_id = owner_id
  for update;

  if not found then
    raise exception 'Publication not found.' using errcode = 'P0002';
  end if;
  if publication_version is distinct from p_expected_version then
    raise exception 'Publication version is stale.' using errcode = '40001';
  end if;
  if publication_trashed_at is null then
    raise exception 'Publication is not in Trash.' using errcode = '55000';
  end if;

  perform pg_catalog.set_config('app.publication_lifecycle_context', 'on', true);
  return query
    update public.publications as publication
    set trashed_at = null,
        trashed_by_user_id = null,
        version = publication.version + 1
    where publication.id = p_publication_id
      and publication.account_id = owner_id
    returning publication.id, publication.version;
end;
$$;

revoke all on function public.restore_publication(uuid, integer) from public, anon;
grant execute on function public.restore_publication(uuid, integer) to authenticated;

create function public.purge_expired_publications(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged_count integer;
begin
  if p_cutoff is null then
    raise exception 'A purge cutoff is required.' using errcode = '22004';
  end if;

  delete from public.recipe_history as history
  using public.recipes as recipe, public.publications as publication
  where history.account_id = recipe.account_id
    and history.record_id = recipe.id
    and recipe.account_id = publication.account_id
    and recipe.publication_id = publication.id
    and recipe.trashed_at <= p_cutoff
    and publication.trashed_at <= p_cutoff;

  delete from public.recipes as recipe
  using public.publications as publication
  where recipe.account_id = publication.account_id
    and recipe.publication_id = publication.id
    and recipe.trashed_at <= p_cutoff
    and publication.trashed_at <= p_cutoff;

  delete from public.publication_history as history
  using public.publications as publication
  where history.account_id = publication.account_id
    and history.record_id = publication.id
    and publication.trashed_at <= p_cutoff;

  delete from public.publications as publication
  where publication.trashed_at <= p_cutoff;
  get diagnostics purged_count = row_count;

  return purged_count;
end;
$$;

revoke all on function public.purge_expired_publications(timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge_expired_publications(timestamptz)
  to service_role;

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'publication-trash-purge-daily'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'publication-trash-purge-daily',
    '15 3 * * *',
    'select public.purge_expired_publications(now() - interval ''30 days'');'
  );
end;
$$;