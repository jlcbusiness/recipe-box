create table public.tags (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (account_id, id)
);

create unique index tags_account_name_ci_idx
  on public.tags (account_id, lower(btrim(name)));

alter table public.tags enable row level security;
grant select on public.tags to authenticated;

create policy "Account owners can read tags"
  on public.tags
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create function private.normalize_tag_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := pg_catalog.btrim(new.name);
  if new.name = '' or pg_catalog.char_length(new.name) > 160 then
    raise exception 'Tag names must contain 1 to 160 characters.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.normalize_tag_name() from public, anon, authenticated;

create trigger normalize_tag_name
  before insert or update of name on public.tags
  for each row execute function private.normalize_tag_name();

create table public.tag_catalog_revisions (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  revision integer not null default 1 check (revision > 0)
);

insert into public.tag_catalog_revisions (account_id)
select account.id
from public.accounts as account
on conflict (account_id) do nothing;

alter table public.tag_catalog_revisions enable row level security;
grant select on public.tag_catalog_revisions to authenticated;

create policy "Account owners can read tag catalog revisions"
  on public.tag_catalog_revisions
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create table public.tag_catalog_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null check (
    event_type in ('tag.added', 'tag.renamed', 'tag.merged', 'tag.deleted')
  ),
  tag_id uuid,
  replacement_id uuid,
  affected_recipe_ids uuid[] not null default array[]::uuid[],
  affected_publication_ids uuid[] not null default array[]::uuid[],
  before_data jsonb not null,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.tag_catalog_history enable row level security;
grant select on public.tag_catalog_history to authenticated;

create index tag_catalog_history_owner_created_idx
  on public.tag_catalog_history (account_id, created_at desc);

create policy "Account owners can read tag catalog history"
  on public.tag_catalog_history
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create function public.seed_tag_catalog_revision_after_account_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tag_catalog_revisions (account_id) values (new.id);
  return new;
end;
$$;

revoke all on function public.seed_tag_catalog_revision_after_account_insert()
  from public, anon, authenticated;

create trigger seed_tag_catalog_revision_after_account_insert
  after insert on public.accounts
  for each row execute function public.seed_tag_catalog_revision_after_account_insert();

create table public.recipe_tags (
  account_id uuid not null,
  recipe_id uuid not null,
  tag_id uuid not null,
  primary key (account_id, recipe_id, tag_id),
  foreign key (account_id, recipe_id)
    references public.recipes (account_id, id) on delete cascade,
  foreign key (account_id, tag_id)
    references public.tags (account_id, id) on delete cascade
);

create index recipe_tags_owner_tag_idx
  on public.recipe_tags (account_id, tag_id, recipe_id);

create table public.publication_tags (
  account_id uuid not null,
  publication_id uuid not null,
  tag_id uuid not null,
  primary key (account_id, publication_id, tag_id),
  foreign key (account_id, publication_id)
    references public.publications (account_id, id) on delete cascade,
  foreign key (account_id, tag_id)
    references public.tags (account_id, id) on delete cascade
);

create index publication_tags_owner_tag_idx
  on public.publication_tags (account_id, tag_id, publication_id);

alter table public.recipe_tags enable row level security;
alter table public.publication_tags enable row level security;
grant select, insert, delete on public.recipe_tags to authenticated;
grant select, insert, delete on public.publication_tags to authenticated;

create policy "Account owners can read recipe tags"
  on public.recipe_tags for select to authenticated
  using ((select auth.uid()) = account_id);

create policy "Recipe saves can insert recipe tags"
  on public.recipe_tags for insert to authenticated
  with check (
    (select auth.uid()) = account_id
    and current_setting('app.tag_assignment_context', true) = 'on'
  );

create policy "Recipe saves can delete recipe tags"
  on public.recipe_tags for delete to authenticated
  using (
    (select auth.uid()) = account_id
    and current_setting('app.tag_assignment_context', true) = 'on'
  );

create policy "Account owners can read publication tags"
  on public.publication_tags for select to authenticated
  using ((select auth.uid()) = account_id);

create policy "Publication saves can insert publication tags"
  on public.publication_tags for insert to authenticated
  with check (
    (select auth.uid()) = account_id
    and current_setting('app.tag_assignment_context', true) = 'on'
  );

create policy "Publication saves can delete publication tags"
  on public.publication_tags for delete to authenticated
  using (
    (select auth.uid()) = account_id
    and current_setting('app.tag_assignment_context', true) = 'on'
  );

create function private.recipe_tag_snapshot(p_account_id uuid, p_recipe_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name) order by lower(tag.name), tag.id),
    '[]'::jsonb
  )
  from public.recipe_tags as assignment
  join public.tags as tag
    on tag.account_id = assignment.account_id and tag.id = assignment.tag_id
  where assignment.account_id = p_account_id and assignment.recipe_id = p_recipe_id;
$$;

create function private.publication_tag_snapshot(p_account_id uuid, p_publication_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name) order by lower(tag.name), tag.id),
    '[]'::jsonb
  )
  from public.publication_tags as assignment
  join public.tags as tag
    on tag.account_id = assignment.account_id and tag.id = assignment.tag_id
  where assignment.account_id = p_account_id and assignment.publication_id = p_publication_id;
$$;

revoke all on function private.recipe_tag_snapshot(uuid, uuid) from public, anon, authenticated;
revoke all on function private.publication_tag_snapshot(uuid, uuid) from public, anon, authenticated;

create function private.add_recipe_tags_to_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_snapshots jsonb := coalesce(
    nullif(current_setting('app.recipe_tags_before', true), '')::jsonb,
    '{}'::jsonb
  );
  after_tags jsonb := private.recipe_tag_snapshot(new.account_id, new.record_id);
  before_tags jsonb;
begin
  if new.after_data is not null then
    new.after_data := new.after_data || jsonb_build_object('tags', after_tags);
  end if;
  if new.before_data is not null then
    before_tags := before_snapshots -> new.record_id::text;
    new.before_data := new.before_data || jsonb_build_object('tags', coalesce(before_tags, after_tags));
  end if;
  return new;
end;
$$;

revoke all on function private.add_recipe_tags_to_history() from public, anon, authenticated;

create trigger add_recipe_tags_to_history
  before insert on public.recipe_history
  for each row execute function private.add_recipe_tags_to_history();

create function private.add_publication_tags_to_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_snapshots jsonb := coalesce(
    nullif(current_setting('app.publication_tags_before', true), '')::jsonb,
    '{}'::jsonb
  );
  after_snapshots jsonb := coalesce(
    nullif(current_setting('app.publication_tags_after', true), '')::jsonb,
    '{}'::jsonb
  );
  create_snapshot jsonb := nullif(
    current_setting('app.publication_tags_create_snapshot', true),
    ''
  )::jsonb;
  before_tags jsonb;
  after_tags jsonb;
begin
  before_tags := before_snapshots -> new.record_id::text;
  after_tags := after_snapshots -> new.record_id::text;
  if new.event_type = 'publication.created' and create_snapshot is not null then
    after_tags := create_snapshot;
  end if;
  if after_tags is null then
    after_tags := private.publication_tag_snapshot(new.account_id, new.record_id);
  end if;
  if new.after_data is not null then
    new.after_data := new.after_data || jsonb_build_object('tags', after_tags);
  end if;
  if new.before_data is not null then
    before_tags := coalesce(
      before_tags,
      private.publication_tag_snapshot(new.account_id, new.record_id)
    );
    new.before_data := new.before_data || jsonb_build_object('tags', before_tags);
  end if;
  return new;
end;
$$;

revoke all on function private.add_publication_tags_to_history() from public, anon, authenticated;

create trigger add_publication_tags_to_history
  before insert on public.publication_history
  for each row execute function private.add_publication_tags_to_history();

create function public.manage_tag_catalog(
  p_action text,
  p_expected_revision integer,
  p_tag_id uuid default null,
  p_name text default null,
  p_replacement_id uuid default null
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
  tag_name text;
  affected_recipe_ids uuid[] := array[]::uuid[];
  affected_publication_ids uuid[] := array[]::uuid[];
  before_catalog jsonb;
  after_catalog jsonb;
  recipe_before_snapshots jsonb := '{}'::jsonb;
  publication_before_snapshots jsonb := '{}'::jsonb;
  recipe_id uuid;
  publication_id uuid;
  assignment_count integer;
  event_name text;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('add', 'rename', 'merge', 'delete') then
    raise exception 'Tag catalog action is invalid.' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Tag catalog revision is invalid.' using errcode = '22023';
  end if;
  if p_action in ('rename', 'merge', 'delete') and p_tag_id is null then
    raise exception 'Choose a tag.' using errcode = '23514';
  end if;
  if p_action in ('add', 'rename') then
    tag_name := btrim(coalesce(p_name, ''));
    if tag_name = '' or char_length(tag_name) > 160 then
      raise exception 'Tag names must contain 1 to 160 characters.' using errcode = '23514';
    end if;
  end if;
  if p_action = 'merge' and (p_replacement_id is null or p_replacement_id = p_tag_id) then
    raise exception 'Choose another tag to keep.' using errcode = '23514';
  end if;
  if p_action = 'delete' and p_replacement_id = p_tag_id then
    raise exception 'Choose another tag as the replacement.' using errcode = '23514';
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

  select coalesce(
    jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name) order by lower(tag.name), tag.id),
    '[]'::jsonb
  ) into before_catalog
  from public.tags as tag where tag.account_id = owner_id;

  if p_action <> 'add' then
    perform 1 from public.tags as tag
    where tag.account_id = owner_id and tag.id = p_tag_id
    for update;
    if not found then
      raise exception 'Tag is no longer available.' using errcode = 'P0002';
    end if;
  end if;
  if p_action in ('merge', 'delete') and p_replacement_id is not null then
    perform 1 from public.tags as tag
    where tag.account_id = owner_id and tag.id = p_replacement_id
    for update;
    if not found then
      raise exception 'Replacement tag is not available.' using errcode = 'P0002';
    end if;
  end if;

  if p_action in ('rename', 'merge', 'delete') then
    select coalesce(array_agg(distinct assignment.recipe_id order by assignment.recipe_id), array[]::uuid[])
    into affected_recipe_ids
    from public.recipe_tags as assignment
    where assignment.account_id = owner_id and assignment.tag_id = p_tag_id;
    select coalesce(
      array_agg(distinct assignment.publication_id order by assignment.publication_id),
      array[]::uuid[]
    ) into affected_publication_ids
    from public.publication_tags as assignment
    where assignment.account_id = owner_id and assignment.tag_id = p_tag_id;

    perform recipe.id from public.recipes as recipe
    where recipe.account_id = owner_id and recipe.id = any(affected_recipe_ids)
    order by recipe.id for update;
    perform publication.id from public.publications as publication
    where publication.account_id = owner_id and publication.id = any(affected_publication_ids)
    order by publication.id for update;

    select coalesce(jsonb_object_agg(ids.id::text, private.recipe_tag_snapshot(owner_id, ids.id)), '{}')
    into recipe_before_snapshots from unnest(affected_recipe_ids) as ids(id);
    select coalesce(
      jsonb_object_agg(ids.id::text, private.publication_tag_snapshot(owner_id, ids.id)),
      '{}'
    ) into publication_before_snapshots
    from unnest(affected_publication_ids) as ids(id);
    perform set_config('app.recipe_tags_before', recipe_before_snapshots::text, true);
    perform set_config('app.publication_tags_before', publication_before_snapshots::text, true);
  end if;

  if p_action = 'add' then
    insert into public.tags (account_id, name) values (owner_id, tag_name);
    event_name := 'tag.added';
  elsif p_action = 'rename' then
    update public.tags set name = tag_name
    where account_id = owner_id and id = p_tag_id;
    event_name := 'tag.renamed';
  elsif p_action = 'merge' then
    insert into public.recipe_tags (account_id, recipe_id, tag_id)
    select assignment.account_id, assignment.recipe_id, p_replacement_id
    from public.recipe_tags as assignment
    where assignment.account_id = owner_id and assignment.tag_id = p_tag_id
    on conflict do nothing;
    insert into public.publication_tags (account_id, publication_id, tag_id)
    select assignment.account_id, assignment.publication_id, p_replacement_id
    from public.publication_tags as assignment
    where assignment.account_id = owner_id and assignment.tag_id = p_tag_id
    on conflict do nothing;
    delete from public.recipe_tags
    where account_id = owner_id and tag_id = p_tag_id;
    delete from public.publication_tags
    where account_id = owner_id and tag_id = p_tag_id;
    delete from public.tags where account_id = owner_id and id = p_tag_id;
    event_name := 'tag.merged';
  else
    select count(*) into assignment_count
    from (
      select 1 from public.recipe_tags
      where account_id = owner_id and tag_id = p_tag_id
      union all
      select 1 from public.publication_tags
      where account_id = owner_id and tag_id = p_tag_id
    ) as assignments;
    if assignment_count > 0 and p_replacement_id is null then
      raise exception 'Choose a replacement for this assigned tag.' using errcode = '23514';
    end if;
    if p_replacement_id is not null then
      insert into public.recipe_tags (account_id, recipe_id, tag_id)
      select assignment.account_id, assignment.recipe_id, p_replacement_id
      from public.recipe_tags as assignment
      where assignment.account_id = owner_id and assignment.tag_id = p_tag_id
      on conflict do nothing;
      insert into public.publication_tags (account_id, publication_id, tag_id)
      select assignment.account_id, assignment.publication_id, p_replacement_id
      from public.publication_tags as assignment
      where assignment.account_id = owner_id and assignment.tag_id = p_tag_id
      on conflict do nothing;
      delete from public.recipe_tags where account_id = owner_id and tag_id = p_tag_id;
      delete from public.publication_tags where account_id = owner_id and tag_id = p_tag_id;
    end if;
    delete from public.tags where account_id = owner_id and id = p_tag_id;
    event_name := 'tag.deleted';
  end if;

  if cardinality(affected_recipe_ids) > 0 then
    update public.recipes
    set version = version + 1, updated_at = now()
    where account_id = owner_id and id = any(affected_recipe_ids);
  end if;
  if cardinality(affected_publication_ids) > 0 then
    update public.publications
    set version = version + 1, updated_at = now()
    where account_id = owner_id and id = any(affected_publication_ids);
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name) order by lower(tag.name), tag.id),
    '[]'::jsonb
  ) into after_catalog
  from public.tags as tag where tag.account_id = owner_id;

  update public.tag_catalog_revisions
  set revision = revision + 1
  where account_id = owner_id
  returning revision into next_revision;

  insert into public.tag_catalog_history (
    account_id, actor_user_id, event_type, tag_id, replacement_id,
    affected_recipe_ids, affected_publication_ids, before_data, after_data
  ) values (
    owner_id, auth.uid(), event_name, p_tag_id, p_replacement_id,
    affected_recipe_ids, affected_publication_ids, before_catalog, after_catalog
  );

  return next_revision;
end;
$$;

revoke all on function public.manage_tag_catalog(text, integer, uuid, text, uuid)
  from public, anon;
grant execute on function public.manage_tag_catalog(text, integer, uuid, text, uuid)
  to authenticated;

create function public.save_recipe_with_relationships(
  p_recipe_id uuid,
  p_expected_version integer,
  p_name text,
  p_food_type_id uuid,
  p_state text,
  p_verdict_id uuid,
  p_enthusiasm_id uuid,
  p_occasion_details text,
  p_reason text,
  p_serves integer,
  p_prep_time_minutes integer,
  p_mixing_time_minutes integer,
  p_marinate_time_minutes integer,
  p_chill_time_minutes integer,
  p_freeze_time_minutes integer,
  p_cook_time_minutes integer,
  p_bake_time_minutes integer,
  p_cooling_time_minutes integer,
  p_rest_time_minutes integer,
  p_total_time_minutes integer,
  p_notes_markdown text,
  p_meal_type_ids uuid[],
  p_cuisine_ids uuid[],
  p_equipment_ids uuid[],
  p_ingredient_rows jsonb,
  p_instruction_steps jsonb,
  p_publication_id uuid,
  p_publication_page text,
  p_recipe_url text,
  p_recipe_relationships jsonb,
  p_tag_ids uuid[]
)
returns table (id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  before_tags jsonb := '[]'::jsonb;
  saved_id uuid;
  saved_version integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_tag_ids is null
    or exists (select tag_id from unnest(p_tag_ids) as requested(tag_id) where tag_id is null)
    or cardinality(p_tag_ids) <> (select count(distinct tag_id) from unnest(p_tag_ids) as requested(tag_id))
  then
    raise exception 'Tag selection is invalid.' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(p_tag_ids) as requested(tag_id)
    left join public.tags as tag on tag.account_id = owner_id and tag.id = requested.tag_id
    where tag.id is null
  ) then
    raise exception 'A selected tag is not available to this account.' using errcode = '23503';
  end if;
  if p_recipe_id is not null then
    before_tags := private.recipe_tag_snapshot(owner_id, p_recipe_id);
  end if;

  select saved.id, saved.version into saved_id, saved_version
  from public.save_recipe_with_relationships(
    p_recipe_id, p_expected_version, p_name, p_food_type_id, p_state,
    p_verdict_id, p_enthusiasm_id, p_occasion_details, p_reason, p_serves,
    p_prep_time_minutes, p_mixing_time_minutes, p_marinate_time_minutes,
    p_chill_time_minutes, p_freeze_time_minutes, p_cook_time_minutes,
    p_bake_time_minutes, p_cooling_time_minutes, p_rest_time_minutes,
    p_total_time_minutes, p_notes_markdown, p_meal_type_ids, p_cuisine_ids,
    p_equipment_ids, p_ingredient_rows, p_instruction_steps, p_publication_id,
    p_publication_page, p_recipe_url, p_recipe_relationships
  ) as saved;

  perform set_config(
    'app.recipe_tags_before',
    jsonb_build_object(saved_id::text, before_tags)::text,
    true
  );
  perform set_config('app.tag_assignment_context', 'on', true);
  delete from public.recipe_tags
  where account_id = owner_id and recipe_id = saved_id;
  insert into public.recipe_tags (account_id, recipe_id, tag_id)
  select owner_id, saved_id, requested.tag_id
  from unnest(p_tag_ids) as requested(tag_id);

  return query select saved_id, saved_version;
end;
$$;

revoke all on function public.save_recipe_with_relationships(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text,
  text, jsonb, uuid[]
) from public, anon;
grant execute on function public.save_recipe_with_relationships(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text,
  text, jsonb, uuid[]
) to authenticated;

create function public.create_publication(
  p_name text,
  p_publication_type text,
  p_author text,
  p_edition text,
  p_isbn text,
  p_retailer_url text,
  p_issue text,
  p_site_url text,
  p_tag_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  publication_id uuid;
  tag_snapshot jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_tag_ids is null
    or exists (select tag_id from unnest(p_tag_ids) as requested(tag_id) where tag_id is null)
    or cardinality(p_tag_ids) <> (select count(distinct tag_id) from unnest(p_tag_ids) as requested(tag_id))
  then
    raise exception 'Tag selection is invalid.' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(p_tag_ids) as requested(tag_id)
    left join public.tags as tag on tag.account_id = owner_id and tag.id = requested.tag_id
    where tag.id is null
  ) then
    raise exception 'A selected tag is not available to this account.' using errcode = '23503';
  end if;
  select coalesce(
    jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name) order by lower(tag.name), tag.id),
    '[]'::jsonb
  ) into tag_snapshot
  from public.tags as tag
  where tag.account_id = owner_id and tag.id = any(p_tag_ids);
  perform set_config('app.publication_tags_create_snapshot', tag_snapshot::text, true);

  publication_id := public.create_publication(
    p_name, p_publication_type, p_author, p_edition, p_isbn,
    p_retailer_url, p_issue, p_site_url
  );
  perform set_config('app.tag_assignment_context', 'on', true);
  insert into public.publication_tags (account_id, publication_id, tag_id)
  select owner_id, publication_id, requested.tag_id
  from unnest(p_tag_ids) as requested(tag_id);
  return publication_id;
end;
$$;

revoke all on function public.create_publication(text, text, text, text, text, text, text, text, uuid[])
  from public, anon;
grant execute on function public.create_publication(text, text, text, text, text, text, text, text, uuid[])
  to authenticated;

create function public.update_publication(
  p_publication_id uuid,
  p_expected_version integer,
  p_name text,
  p_author text,
  p_edition text,
  p_isbn text,
  p_retailer_url text,
  p_site_url text,
  p_tag_ids uuid[]
)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  before_tags jsonb;
  after_tags jsonb;
  saved_id uuid;
  saved_version integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_tag_ids is null
    or exists (select tag_id from unnest(p_tag_ids) as requested(tag_id) where tag_id is null)
    or cardinality(p_tag_ids) <> (select count(distinct tag_id) from unnest(p_tag_ids) as requested(tag_id))
  then
    raise exception 'Tag selection is invalid.' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(p_tag_ids) as requested(tag_id)
    left join public.tags as tag on tag.account_id = owner_id and tag.id = requested.tag_id
    where tag.id is null
  ) then
    raise exception 'A selected tag is not available to this account.' using errcode = '23503';
  end if;

  select private.publication_tag_snapshot(owner_id, p_publication_id)
  into before_tags;
  select coalesce(
    jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name) order by lower(tag.name), tag.id),
    '[]'::jsonb
  ) into after_tags
  from public.tags as tag
  where tag.account_id = owner_id and tag.id = any(p_tag_ids);
  perform set_config(
    'app.publication_tags_before',
    jsonb_build_object(p_publication_id::text, coalesce(before_tags, '[]'::jsonb))::text,
    true
  );
  perform set_config(
    'app.publication_tags_after',
    jsonb_build_object(p_publication_id::text, after_tags)::text,
    true
  );

  select saved.id, saved.version into saved_id, saved_version
  from public.update_publication(
    p_publication_id, p_expected_version, p_name, p_author, p_edition,
    p_isbn, p_retailer_url, p_site_url
  ) as saved;

  perform set_config('app.tag_assignment_context', 'on', true);
  delete from public.publication_tags
  where account_id = owner_id and publication_id = saved_id;
  insert into public.publication_tags (account_id, publication_id, tag_id)
  select owner_id, saved_id, requested.tag_id
  from unnest(p_tag_ids) as requested(tag_id);
  return query select saved_id, saved_version;
end;
$$;

revoke all on function public.update_publication(uuid, integer, text, text, text, text, text, text, uuid[])
  from public, anon;
grant execute on function public.update_publication(uuid, integer, text, text, text, text, text, text, uuid[])
  to authenticated;

notify pgrst, 'reload schema';