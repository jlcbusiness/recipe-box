create table public.app_updates (
  id uuid primary key default gen_random_uuid(),
  body_markdown text not null,
  kind text not null,
  completed_version text,
  is_archived boolean not null default false,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint app_updates_body_markdown_check
    check (
      char_length(
        pg_catalog.regexp_replace(
          body_markdown,
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
      ) between 1 and 5000
    ),
  constraint app_updates_kind_check check (kind in ('fix', 'feature')),
  constraint app_updates_completed_version_check
    check (
      completed_version is null
      or (
        completed_version !~ '[^0-9.]'
        and completed_version ~
          '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
      )
    ),
  constraint app_updates_revision_check check (revision > 0)
);

create index app_updates_archive_created_idx
  on public.app_updates (is_archived, created_at desc, id asc);

create table public.admin_update_events (
  id bigint generated always as identity primary key,
  update_id uuid not null references public.app_updates (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null
    check (
      event_type in (
        'created',
        'edited',
        'classification_changed',
        'completion_changed',
        'archived',
        'restored'
      )
    ),
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create index admin_update_events_update_id_idx
  on public.admin_update_events (update_id, id);

alter table public.app_updates enable row level security;
alter table public.admin_update_events enable row level security;

revoke all on public.app_updates, public.admin_update_events
  from public, anon, authenticated, service_role;
grant select on public.app_updates, public.admin_update_events to authenticated;

create function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.accounts as account
    where account.id = (select auth.uid())
      and account.is_admin
  );
$$;

revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated;

create policy "Admins can read application updates"
  on public.app_updates
  for select
  to authenticated
  using ((select public.current_user_is_admin()));

create policy "Admins can read admin update events"
  on public.admin_update_events
  for select
  to authenticated
  using ((select public.current_user_is_admin()));

create function public.record_admin_update_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_actor uuid := (select auth.uid());
  event_kind text;
  previous_state jsonb;
  current_state jsonb;
begin
  current_state := pg_catalog.jsonb_build_object(
    'body_markdown', new.body_markdown,
    'kind', new.kind,
    'completed_version', new.completed_version,
    'is_archived', new.is_archived,
    'revision', new.revision
  );

  if tg_op = 'INSERT' then
    event_kind := 'created';
  else
    previous_state := pg_catalog.jsonb_build_object(
      'body_markdown', old.body_markdown,
      'kind', old.kind,
      'completed_version', old.completed_version,
      'is_archived', old.is_archived,
      'revision', old.revision
    );

    if old.is_archived is distinct from new.is_archived then
      event_kind := case when new.is_archived then 'archived' else 'restored' end;
    elsif old.completed_version is distinct from new.completed_version then
      event_kind := 'completion_changed';
    elsif old.kind is distinct from new.kind then
      event_kind := 'classification_changed';
    else
      event_kind := 'edited';
    end if;
  end if;

  insert into public.admin_update_events (
    update_id,
    actor_id,
    event_type,
    before_state,
    after_state
  )
  values (
    new.id,
    event_actor,
    event_kind,
    previous_state,
    current_state
  );

  return new;
end;
$$;

create trigger app_updates_record_event
  after insert or update of body_markdown, kind, completed_version, is_archived, revision
  for each row
  execute function public.record_admin_update_event();

create function public.admin_update_create(p_body_markdown text, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_body text;
  update_id uuid;
begin
  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if p_body_markdown is null or p_kind is null or p_kind not in ('fix', 'feature') then
    raise exception 'Enter update text and choose Fix or Feature.' using errcode = '22023';
  end if;

  normalized_body := pg_catalog.regexp_replace(
    p_body_markdown,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  if char_length(normalized_body) not between 1 and 5000 then
    raise exception 'Update text must contain 1 to 5,000 characters.' using errcode = '22023';
  end if;

  insert into public.app_updates (
    body_markdown,
    kind,
    created_by,
    updated_by
  )
  values (
    normalized_body,
    p_kind,
    actor_id,
    actor_id
  )
  returning id into update_id;

  return update_id;
end;
$$;

create function public.admin_update_update(
  p_id uuid,
  p_revision integer,
  p_body_markdown text,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_update public.app_updates%rowtype;
  normalized_body text;
begin
  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_id is null or p_revision is null then
    raise exception 'A valid update and revision are required.' using errcode = '22023';
  end if;
  if p_body_markdown is null or p_kind is null or p_kind not in ('fix', 'feature') then
    raise exception 'Enter update text and choose Fix or Feature.' using errcode = '22023';
  end if;

  normalized_body := pg_catalog.regexp_replace(
    p_body_markdown,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
  if char_length(normalized_body) not between 1 and 5000 then
    raise exception 'Update text must contain 1 to 5,000 characters.' using errcode = '22023';
  end if;

  select update_row.*
  into current_update
  from public.app_updates as update_row
  where update_row.id = p_id
  for update;
  if not found then
    raise exception 'Update not found.' using errcode = 'P0002';
  end if;
  if current_update.revision <> p_revision then
    raise exception 'This update changed in another session.' using errcode = 'PT409';
  end if;
  if current_update.body_markdown = normalized_body
    and current_update.kind = p_kind then
    return p_id;
  end if;

  update public.app_updates
  set body_markdown = normalized_body,
      kind = p_kind,
      revision = revision + 1,
      updated_at = pg_catalog.now(),
      updated_by = actor_id
  where id = p_id;

  return p_id;
end;
$$;

create function public.admin_update_set_completion(
  p_id uuid,
  p_revision integer,
  p_completed_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_update public.app_updates%rowtype;
begin
  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_id is null or p_revision is null then
    raise exception 'A valid update and revision are required.' using errcode = '22023';
  end if;
  if p_completed_version is not null
    and (
      p_completed_version ~ '[^0-9.]'
      or p_completed_version !~
        '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'
    ) then
    raise exception 'Enter a standard major.minor.patch version.' using errcode = '22023';
  end if;

  select update_row.*
  into current_update
  from public.app_updates as update_row
  where update_row.id = p_id
  for update;
  if not found then
    raise exception 'Update not found.' using errcode = 'P0002';
  end if;
  if current_update.revision <> p_revision then
    raise exception 'This update changed in another session.' using errcode = 'PT409';
  end if;
  if current_update.completed_version is not distinct from p_completed_version then
    return p_id;
  end if;

  update public.app_updates
  set completed_version = p_completed_version,
      revision = revision + 1,
      updated_at = pg_catalog.now(),
      updated_by = actor_id
  where id = p_id;

  return p_id;
end;
$$;

create function public.admin_update_archive(p_id uuid, p_revision integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_update public.app_updates%rowtype;
begin
  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_id is null or p_revision is null then
    raise exception 'A valid update and revision are required.' using errcode = '22023';
  end if;

  select update_row.*
  into current_update
  from public.app_updates as update_row
  where update_row.id = p_id
  for update;
  if not found then
    raise exception 'Update not found.' using errcode = 'P0002';
  end if;
  if current_update.revision <> p_revision then
    raise exception 'This update changed in another session.' using errcode = 'PT409';
  end if;
  if current_update.is_archived then
    return p_id;
  end if;

  update public.app_updates
  set is_archived = true,
      revision = revision + 1,
      updated_at = pg_catalog.now(),
      updated_by = actor_id
  where id = p_id;

  return p_id;
end;
$$;

create function public.admin_update_restore(p_id uuid, p_revision integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_update public.app_updates%rowtype;
begin
  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_id is null or p_revision is null then
    raise exception 'A valid update and revision are required.' using errcode = '22023';
  end if;

  select update_row.*
  into current_update
  from public.app_updates as update_row
  where update_row.id = p_id
  for update;
  if not found then
    raise exception 'Update not found.' using errcode = 'P0002';
  end if;
  if current_update.revision <> p_revision then
    raise exception 'This update changed in another session.' using errcode = 'PT409';
  end if;
  if not current_update.is_archived then
    return p_id;
  end if;

  update public.app_updates
  set is_archived = false,
      revision = revision + 1,
      updated_at = pg_catalog.now(),
      updated_by = actor_id
  where id = p_id;

  return p_id;
end;
$$;

revoke all on function public.record_admin_update_event() from public, anon, authenticated, service_role;
revoke all on function public.admin_update_create(text, text)
  from public, anon, service_role;
revoke all on function public.admin_update_update(uuid, integer, text, text)
  from public, anon, service_role;
revoke all on function public.admin_update_set_completion(uuid, integer, text)
  from public, anon, service_role;
revoke all on function public.admin_update_archive(uuid, integer)
  from public, anon, service_role;
revoke all on function public.admin_update_restore(uuid, integer)
  from public, anon, service_role;

grant execute on function public.admin_update_create(text, text) to authenticated;
grant execute on function public.admin_update_update(uuid, integer, text, text) to authenticated;
grant execute on function public.admin_update_set_completion(uuid, integer, text) to authenticated;
grant execute on function public.admin_update_archive(uuid, integer) to authenticated;
grant execute on function public.admin_update_restore(uuid, integer) to authenticated;
