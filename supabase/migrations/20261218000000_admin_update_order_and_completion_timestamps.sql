alter table public.app_updates
  add column sort_order bigint,
  add column completed_at timestamptz;

with ordered_updates as (
  select
    id,
    completed_version,
    updated_at,
    row_number() over (
      partition by (completed_version is null)
      order by created_at desc, id
    ) as position
  from public.app_updates
)
update public.app_updates as update_row
set sort_order = case
      when ordered_updates.completed_version is null then ordered_updates.position
      else 0
    end,
    completed_at = case
      when ordered_updates.completed_version is null then null
      else ordered_updates.updated_at
    end
from ordered_updates
where ordered_updates.id = update_row.id;

alter table public.app_updates
  alter column sort_order set not null,
  add constraint app_updates_completion_timestamp_check
    check (
      (completed_version is null and completed_at is null)
      or (
        completed_version is not null
        and completed_at is not null
        and sort_order = 0
      )
    );

alter table public.admin_update_events
  drop constraint admin_update_events_event_type_check,
  add constraint admin_update_events_event_type_check
    check (
      event_type in (
        'created',
        'edited',
        'classification_changed',
        'completion_changed',
        'reordered',
        'archived',
        'restored'
      )
    );

create or replace function public.record_admin_update_event()
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
    'completed_at', new.completed_at,
    'sort_order', new.sort_order,
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
      'completed_at', old.completed_at,
      'sort_order', old.sort_order,
      'is_archived', old.is_archived,
      'revision', old.revision
    );

    if old.is_archived is distinct from new.is_archived then
      event_kind := case when new.is_archived then 'archived' else 'restored' end;
    elsif old.completed_version is distinct from new.completed_version then
      event_kind := 'completion_changed';
    elsif old.kind is distinct from new.kind then
      event_kind := 'classification_changed';
    elsif old.sort_order is distinct from new.sort_order then
      event_kind := 'reordered';
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

drop trigger app_updates_record_event on public.app_updates;

create trigger app_updates_record_event
  after insert or update of
    body_markdown,
    kind,
    completed_version,
    completed_at,
    sort_order,
    is_archived,
    revision
  on public.app_updates
  for each row
  execute function public.record_admin_update_event();

create or replace function public.admin_update_create(p_body_markdown text, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_body text;
  update_id uuid;
  new_sort_order bigint;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.app_updates.manual_order', 0)
  );
  select coalesce(min(sort_order), 0) - 1
  into new_sort_order
  from public.app_updates
  where completed_version is null;

  insert into public.app_updates (
    body_markdown,
    kind,
    sort_order,
    created_by,
    updated_by
  )
  values (
    normalized_body,
    p_kind,
    new_sort_order,
    actor_id,
    actor_id
  )
  returning id into update_id;

  return update_id;
end;
$$;

create or replace function public.admin_update_set_completion(
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
  next_sort_order bigint;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.app_updates.manual_order', 0)
  );

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

  if p_completed_version is null then
    select coalesce(min(sort_order), 0) - 1
    into next_sort_order
    from public.app_updates
    where completed_version is null
      and id <> p_id;
  else
    next_sort_order := 0;
  end if;

  update public.app_updates
  set completed_version = p_completed_version,
      completed_at = case
        when p_completed_version is null then null
        when current_update.completed_version is null then pg_catalog.clock_timestamp()
        else current_update.completed_at
      end,
      sort_order = next_sort_order,
      revision = revision + 1,
      updated_at = pg_catalog.now(),
      updated_by = actor_id
  where id = p_id;

  return p_id;
end;
$$;

create function public.admin_update_reorder(p_ordered_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  active_count integer;
  provided_count integer;
  distinct_count integer;
  changed_count integer;
begin
  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if p_ordered_ids is null then
    raise exception 'Choose a valid update order.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.app_updates.manual_order', 0)
  );

  select count(*)::integer
  into active_count
  from public.app_updates
  where completed_version is null;

  select count(*)::integer, count(distinct provided.id)::integer
  into provided_count, distinct_count
  from pg_catalog.unnest(p_ordered_ids) as provided(id);

  if provided_count <> active_count or distinct_count <> active_count then
    raise exception 'The update list changed in another session.' using errcode = 'PT409';
  end if;
  if exists (
    select 1
    from pg_catalog.unnest(p_ordered_ids) as provided(id)
    left join public.app_updates as update_row
      on update_row.id = provided.id
      and update_row.completed_version is null
    where update_row.id is null
  ) or exists (
    select 1
    from public.app_updates as update_row
    where update_row.completed_version is null
      and not (update_row.id = any(p_ordered_ids))
  ) then
    raise exception 'The update list changed in another session.' using errcode = 'PT409';
  end if;

  with ordered_updates as (
    select provided.id, provided.position
    from pg_catalog.unnest(p_ordered_ids) with ordinality as provided(id, position)
  )
  update public.app_updates as update_row
  set sort_order = ordered_updates.position,
      updated_at = pg_catalog.now(),
      updated_by = actor_id
  from ordered_updates
  where update_row.id = ordered_updates.id
    and update_row.completed_version is null
    and update_row.sort_order is distinct from ordered_updates.position;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.admin_update_reorder(uuid[])
  from public, anon, service_role;
grant execute on function public.admin_update_reorder(uuid[]) to authenticated;
