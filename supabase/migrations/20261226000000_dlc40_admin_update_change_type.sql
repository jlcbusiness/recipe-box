alter table public.app_updates
  drop constraint app_updates_kind_check;

alter table public.app_updates
  add constraint app_updates_kind_check
  check (kind in ('fix', 'change', 'feature'));

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

  if p_body_markdown is null or p_kind is null or p_kind not in ('fix', 'change', 'feature') then
    raise exception 'Enter update text and choose Fix, Change, or Feature.' using errcode = '22023';
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

create or replace function public.admin_update_update(
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
  if p_body_markdown is null or p_kind is null or p_kind not in ('fix', 'change', 'feature') then
    raise exception 'Enter update text and choose Fix, Change, or Feature.' using errcode = '22023';
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
