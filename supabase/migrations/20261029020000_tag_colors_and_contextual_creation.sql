alter table public.tags add column color_key text;

update public.tags as tag
set color_key = (
  array[
    'pink', 'melon', 'peach', 'apricot', 'butter', 'pale_gold', 'sage', 'mint',
    'seafoam', 'aqua', 'powder_blue', 'periwinkle', 'sky_lilac', 'lilac', 'orchid', 'grey'
  ]::text[]
)[(get_byte(decode(md5(tag.id::text), 'hex'), 0) % 16) + 1]
where color_key is null;

alter table public.tags alter column color_key set not null;
alter table public.tags add constraint tags_color_key_chk check (
  color_key in (
    'pink', 'melon', 'peach', 'apricot', 'butter', 'pale_gold', 'sage', 'mint',
    'seafoam', 'aqua', 'powder_blue', 'periwinkle', 'sky_lilac', 'lilac', 'orchid', 'grey'
  )
);

create function private.assign_default_tag_color()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.color_key is null then
    new.color_key := (
      array[
        'pink', 'melon', 'peach', 'apricot', 'butter', 'pale_gold', 'sage', 'mint',
        'seafoam', 'aqua', 'powder_blue', 'periwinkle', 'sky_lilac', 'lilac', 'orchid', 'grey'
      ]::text[]
    )[(pg_catalog.get_byte(pg_catalog.decode(pg_catalog.md5(new.id::text), 'hex'), 0) % 16) + 1];
  end if;
  return new;
end;
$$;

revoke all on function private.assign_default_tag_color() from public, anon, authenticated;

create trigger assign_default_tag_color
  before insert or update of color_key on public.tags
  for each row execute function private.assign_default_tag_color();

alter table public.tag_catalog_history
  drop constraint tag_catalog_history_event_type_check;

alter table public.tag_catalog_history
  add constraint tag_catalog_history_event_type_check
  check (event_type in ('tag.added', 'tag.renamed', 'tag.merged', 'tag.deleted', 'tag.recolored'));

create or replace function private.recipe_tag_snapshot(p_account_id uuid, p_recipe_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', tag.id, 'name', tag.name, 'color_key', tag.color_key)
      order by lower(tag.name), tag.id
    ),
    '[]'::jsonb
  )
  from public.recipe_tags as assignment
  join public.tags as tag
    on tag.account_id = assignment.account_id and tag.id = assignment.tag_id
  where assignment.account_id = p_account_id and assignment.recipe_id = p_recipe_id;
$$;

create or replace function private.publication_tag_snapshot(p_account_id uuid, p_publication_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', tag.id, 'name', tag.name, 'color_key', tag.color_key)
      order by lower(tag.name), tag.id
    ),
    '[]'::jsonb
  )
  from public.publication_tags as assignment
  join public.tags as tag
    on tag.account_id = assignment.account_id and tag.id = assignment.tag_id
  where assignment.account_id = p_account_id and assignment.publication_id = p_publication_id;
$$;

create or replace function public.create_or_get_tag(
  p_name text,
  p_expected_revision integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  tag_name text := pg_catalog.btrim(coalesce(p_name, ''));
  current_revision integer;
  next_revision integer;
  tag_row public.tags%rowtype;
  before_catalog jsonb;
  after_catalog jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if tag_name = '' or pg_catalog.char_length(tag_name) > 160 then
    raise exception 'Tag names must contain 1 to 160 characters.' using errcode = '23514';
  end if;

  select revision.revision into current_revision
  from public.tag_catalog_revisions as revision
  where revision.account_id = owner_id
  for update;
  if not found then
    raise exception 'Tag catalog was not found.' using errcode = 'P0002';
  end if;
  if p_expected_revision is not null and current_revision is distinct from p_expected_revision then
    raise exception 'Tag catalog revision is stale.' using errcode = '40001';
  end if;

  select tag.* into tag_row
  from public.tags as tag
  where tag.account_id = owner_id and lower(btrim(tag.name)) = lower(tag_name)
  for update;
  if found then
    return jsonb_build_object(
      'id', tag_row.id,
      'name', tag_row.name,
      'color_key', tag_row.color_key,
      'created', false,
      'revision', current_revision
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', tag.id, 'name', tag.name, 'color_key', tag.color_key)
      order by lower(tag.name), tag.id
    ),
    '[]'::jsonb
  ) into before_catalog
  from public.tags as tag
  where tag.account_id = owner_id;

  insert into public.tags (account_id, name) values (owner_id, tag_name)
  returning * into tag_row;

  update public.tag_catalog_revisions
  set revision = revision + 1
  where account_id = owner_id
  returning revision into next_revision;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', tag.id, 'name', tag.name, 'color_key', tag.color_key)
      order by lower(tag.name), tag.id
    ),
    '[]'::jsonb
  ) into after_catalog
  from public.tags as tag
  where tag.account_id = owner_id;

  insert into public.tag_catalog_history (
    account_id, actor_user_id, event_type, tag_id, before_data, after_data
  ) values (
    owner_id, auth.uid(), 'tag.added', tag_row.id, before_catalog, after_catalog
  );

  return jsonb_build_object(
    'id', tag_row.id,
    'name', tag_row.name,
    'color_key', tag_row.color_key,
    'created', true,
    'revision', next_revision
  );
end;
$$;

revoke all on function public.create_or_get_tag(text, integer) from public, anon;
grant execute on function public.create_or_get_tag(text, integer) to authenticated;

create function public.set_tag_color(
  p_tag_id uuid,
  p_color_key text,
  p_expected_revision integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  current_revision integer;
  next_revision integer;
  existing_color text;
  before_catalog jsonb;
  after_catalog jsonb;
  affected_recipe_ids uuid[] := array[]::uuid[];
  affected_publication_ids uuid[] := array[]::uuid[];
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_color_key is null or p_color_key not in (
    'pink', 'melon', 'peach', 'apricot', 'butter', 'pale_gold', 'sage', 'mint',
    'seafoam', 'aqua', 'powder_blue', 'periwinkle', 'sky_lilac', 'lilac', 'orchid', 'grey'
  ) then
    raise exception 'Choose a valid tag color.' using errcode = '23514';
  end if;

  select revision.revision into current_revision
  from public.tag_catalog_revisions as revision
  where revision.account_id = owner_id
  for update;
  if not found then
    raise exception 'Tag catalog was not found.' using errcode = 'P0002';
  end if;
  if current_revision is distinct from p_expected_revision then
    raise exception 'Tag catalog revision is stale.' using errcode = '40001';
  end if;

  select tag.color_key into existing_color
  from public.tags as tag
  where tag.account_id = owner_id and tag.id = p_tag_id
  for update;
  if not found then
    raise exception 'Tag is no longer available.' using errcode = 'P0002';
  end if;
  if existing_color = p_color_key then
    return current_revision;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', tag.id, 'name', tag.name, 'color_key', tag.color_key)
      order by lower(tag.name), tag.id
    ),
    '[]'::jsonb
  ) into before_catalog
  from public.tags as tag
  where tag.account_id = owner_id;

  select coalesce(array_agg(distinct assignment.recipe_id), array[]::uuid[])
  into affected_recipe_ids
  from public.recipe_tags as assignment
  where assignment.account_id = owner_id and assignment.tag_id = p_tag_id;
  select coalesce(array_agg(distinct assignment.publication_id), array[]::uuid[])
  into affected_publication_ids
  from public.publication_tags as assignment
  where assignment.account_id = owner_id and assignment.tag_id = p_tag_id;

  update public.tags
  set color_key = p_color_key
  where account_id = owner_id and id = p_tag_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', tag.id, 'name', tag.name, 'color_key', tag.color_key)
      order by lower(tag.name), tag.id
    ),
    '[]'::jsonb
  ) into after_catalog
  from public.tags as tag
  where tag.account_id = owner_id;

  update public.tag_catalog_revisions
  set revision = revision + 1
  where account_id = owner_id
  returning revision into next_revision;

  insert into public.tag_catalog_history (
    account_id, actor_user_id, event_type, tag_id,
    affected_recipe_ids, affected_publication_ids, before_data, after_data
  ) values (
    owner_id, auth.uid(), 'tag.recolored', p_tag_id,
    affected_recipe_ids, affected_publication_ids, before_catalog, after_catalog
  );

  return next_revision;
end;
$$;

revoke all on function public.set_tag_color(uuid, text, integer) from public, anon;
grant execute on function public.set_tag_color(uuid, text, integer) to authenticated;