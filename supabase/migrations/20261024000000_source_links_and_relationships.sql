create table public.recipe_site_listings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  recipe_id uuid not null,
  site_publication_id uuid not null,
  recipe_url text not null check (recipe_url ~* '^https?://[^[:space:]]+$'),
  unique (account_id, recipe_id),
  foreign key (account_id, recipe_id)
    references public.recipes (account_id, id) on delete cascade,
  foreign key (account_id, site_publication_id)
    references public.publications (account_id, id) on delete cascade
);

create table public.recipe_pairings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  source_recipe_id uuid not null,
  linked_recipe_id uuid,
  display_text text not null check (length(trim(display_text)) > 0),
  position smallint not null check (position >= 0),
  unique (account_id, source_recipe_id, id),
  unique (account_id, source_recipe_id, position),
  foreign key (account_id, source_recipe_id)
    references public.recipes (account_id, id) on delete cascade,
  foreign key (account_id, linked_recipe_id)
    references public.recipes (account_id, id) on delete set null (linked_recipe_id),
  check (linked_recipe_id is null or linked_recipe_id <> source_recipe_id)
);

create index recipe_pairings_linked_recipe_idx
  on public.recipe_pairings (account_id, linked_recipe_id)
  where linked_recipe_id is not null;

create table public.recipe_references (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  recipe_id uuid not null,
  reference_type text not null check (
    reference_type in ('publication', 'external_url', 'printed_citation')
  ),
  publication_id uuid,
  display_text text not null check (length(trim(display_text)) > 0),
  url text,
  position smallint not null check (position >= 0),
  unique (account_id, recipe_id, id),
  unique (account_id, recipe_id, position),
  foreign key (account_id, recipe_id)
    references public.recipes (account_id, id) on delete cascade,
  foreign key (account_id, publication_id)
    references public.publications (account_id, id) on delete set null (publication_id),
  check (
    (reference_type = 'publication' and publication_id is not null and url is null)
    or (reference_type = 'external_url' and publication_id is null and url is not null)
    or (reference_type = 'printed_citation' and publication_id is null and url is null)
  ),
  check (url is null or url ~* '^https?://[^[:space:]]+$')
);

create index recipe_site_listings_site_idx
  on public.recipe_site_listings (account_id, site_publication_id);

alter table public.recipe_site_listings enable row level security;
alter table public.recipe_pairings enable row level security;
alter table public.recipe_references enable row level security;

grant select, insert, delete on public.recipe_site_listings to authenticated;
grant select, insert, delete on public.recipe_pairings to authenticated;
grant select, insert, delete on public.recipe_references to authenticated;

create policy "Account owners can read recipe Site listings"
  on public.recipe_site_listings for select to authenticated
  using ((select auth.uid()) = account_id);
create policy "Account owners can add recipe Site listings during recipe save"
  on public.recipe_site_listings for insert to authenticated
  with check ((select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on');
create policy "Account owners can remove recipe Site listings during recipe save"
  on public.recipe_site_listings for delete to authenticated
  using ((select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on');

create policy "Account owners can read recipe pairings"
  on public.recipe_pairings for select to authenticated
  using ((select auth.uid()) = account_id);
create policy "Account owners can add recipe pairings during recipe save"
  on public.recipe_pairings for insert to authenticated
  with check ((select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on');
create policy "Account owners can remove recipe pairings during recipe save"
  on public.recipe_pairings for delete to authenticated
  using ((select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on');

create policy "Account owners can read recipe references"
  on public.recipe_references for select to authenticated
  using ((select auth.uid()) = account_id);
create policy "Account owners can add recipe references during recipe save"
  on public.recipe_references for insert to authenticated
  with check ((select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on');
create policy "Account owners can remove recipe references during recipe save"
  on public.recipe_references for delete to authenticated
  using ((select auth.uid()) = account_id
    and current_setting('app.recipe_save_context', true) = 'on');

create function public.recipe_relationship_snapshot(p_account_id uuid, p_recipe_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'site_listing', (
      select jsonb_build_object(
        'site_publication_id', listing.site_publication_id,
        'recipe_url', listing.recipe_url
      )
      from public.recipe_site_listings as listing
      where listing.account_id = p_account_id and listing.recipe_id = p_recipe_id
    ),
    'pairings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pairing.id, 'display_text', pairing.display_text,
        'linked_recipe_id', pairing.linked_recipe_id, 'position', pairing.position
      ) order by pairing.position)
      from public.recipe_pairings as pairing
      where pairing.account_id = p_account_id and pairing.source_recipe_id = p_recipe_id
    ), '[]'::jsonb),
    'references', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recipe_reference.id, 'reference_type', recipe_reference.reference_type,
        'display_text', recipe_reference.display_text,
        'publication_id', recipe_reference.publication_id,
        'url', recipe_reference.url, 'position', recipe_reference.position
      ) order by recipe_reference.position)
      from public.recipe_references as recipe_reference
      where recipe_reference.account_id = p_account_id and recipe_reference.recipe_id = p_recipe_id
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.recipe_relationship_snapshot(uuid, uuid)
  from public, anon, authenticated;

create function public.recipe_history_add_relationships()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  before_relationships jsonb := coalesce(
    nullif(current_setting('app.recipe_relationships_before', true), '')::jsonb,
    jsonb_build_object('site_listing', null, 'pairings', '[]'::jsonb, 'references', '[]'::jsonb)
  );
begin
  if new.before_data is not null then
    new.before_data := new.before_data || jsonb_build_object('relationships', before_relationships);
  end if;
  new.after_data := new.after_data || jsonb_build_object(
    'relationships', public.recipe_relationship_snapshot(new.account_id, new.record_id)
  );
  return new;
end;
$$;
create trigger recipe_history_add_relationships
  before insert on public.recipe_history
  for each row execute function public.recipe_history_add_relationships();

create function public.save_recipe_with_publication(
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
  p_recipe_relationships jsonb
)
returns table (id uuid, version integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  saved_id uuid;
  saved_version integer;
  primary_type text;
  site_type text;
  site_id uuid;
  site_url text;
  target_id uuid;
  target_name text;
  entry jsonb;
  reference_kind text;
  entry_text text;
  entry_url text;
  entry_id uuid;
  entry_position integer := 0;
  relationships_before jsonb;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_recipe_relationships is null or jsonb_typeof(p_recipe_relationships) <> 'object'
    or jsonb_typeof(p_recipe_relationships->'pairings') <> 'array'
    or jsonb_typeof(p_recipe_relationships->'references') <> 'array'
  then
    raise exception 'Recipe relationships must include a Site listing, pairings, and references.'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_recipe_relationships) as fields(key)
    where fields.key not in ('site_listing', 'pairings', 'references')
  ) then
    raise exception 'Recipe relationships contain an unknown field.' using errcode = '23514';
  end if;

  relationships_before := public.recipe_relationship_snapshot(owner_id, p_recipe_id);
  perform pg_catalog.set_config('app.recipe_relationships_before', relationships_before::text, true);
  perform pg_catalog.set_config('app.recipe_save_context', 'on', true);

  if p_recipe_relationships->'site_listing' is not null
    and p_recipe_relationships->'site_listing' <> 'null'::jsonb
  then
    if jsonb_typeof(p_recipe_relationships->'site_listing') <> 'object'
      or exists (
        select 1 from jsonb_object_keys(p_recipe_relationships->'site_listing') as fields(key)
        where fields.key not in ('site_publication_id', 'recipe_url')
      ) then
      raise exception 'Site listing contains an unknown field.' using errcode = '23514';
    end if;
    select publication.publication_type into primary_type
    from public.publications as publication
    where publication.account_id = owner_id and publication.id = p_publication_id
      and publication.trashed_at is null;
    if primary_type is distinct from 'magazine' then
      raise exception 'Only an active Magazine recipe can have a Site listing.' using errcode = '23514';
    end if;
    site_id := nullif(p_recipe_relationships->'site_listing'->>'site_publication_id', '')::uuid;
    site_url := nullif(trim(p_recipe_relationships->'site_listing'->>'recipe_url'), '');
    select publication.publication_type into site_type
    from public.publications as publication
    where publication.account_id = owner_id and publication.id = site_id
      and publication.trashed_at is null;
    if site_type is distinct from 'site' then
      raise exception 'Choose an active Site publication.' using errcode = 'P0002';
    end if;
    if site_url is null or site_url !~* '^https?://[^[:space:]]+$' then
      raise exception 'Site recipe URL must be an absolute HTTP(S) URL.' using errcode = '23514';
    end if;
  end if;

  for entry in
    select item.value from jsonb_array_elements(p_recipe_relationships->'pairings')
      with ordinality as item(value, ordinal) order by item.ordinal
  loop
    if jsonb_typeof(entry) <> 'object' or exists (
      select 1 from jsonb_object_keys(entry) as fields(key)
      where fields.key not in ('id', 'display_text', 'linked_recipe_id')
    ) then
      raise exception 'Pairing contains an unknown field.' using errcode = '23514';
    end if;
    target_id := nullif(entry->>'linked_recipe_id', '')::uuid;
    entry_text := nullif(trim(entry->>'display_text'), '');
    if target_id is not null then
      if target_id = p_recipe_id then
        raise exception 'A recipe cannot pair with itself.' using errcode = '23514';
      end if;
      select recipe.name into target_name from public.recipes as recipe
      where recipe.account_id = owner_id and recipe.id = target_id and recipe.trashed_at is null;
      if not found then
        raise exception 'Paired recipe is not available.' using errcode = 'P0002';
      end if;
      entry_text := target_name;
    end if;
    if entry_text is null then
      raise exception 'Pairing text is required.' using errcode = '23514';
    end if;
    entry_position := entry_position + 1;
  end loop;
  entry_position := 0;

  for entry in
    select item.value from jsonb_array_elements(p_recipe_relationships->'references')
      with ordinality as item(value, ordinal) order by item.ordinal
  loop
    if jsonb_typeof(entry) <> 'object' or exists (
      select 1 from jsonb_object_keys(entry) as fields(key)
      where fields.key not in ('id', 'reference_type', 'display_text', 'publication_id', 'url')
    ) then
      raise exception 'Reference contains an unknown field.' using errcode = '23514';
    end if;
    reference_kind := entry->>'reference_type';
    target_id := nullif(entry->>'publication_id', '')::uuid;
    entry_url := nullif(trim(entry->>'url'), '');
    entry_text := nullif(trim(entry->>'display_text'), '');
    if reference_kind = 'publication' then
      select publication.name into target_name from public.publications as publication
      where publication.account_id = owner_id and publication.id = target_id
        and publication.trashed_at is null;
      if not found or entry_url is not null then
        raise exception 'Referenced publication is not available.' using errcode = 'P0002';
      end if;
      entry_text := target_name;
    elsif reference_kind = 'external_url' then
      if target_id is not null or entry_url is null
        or entry_url !~* '^https?://[^[:space:]]+$' then
        raise exception 'External references require an absolute HTTP(S) URL.' using errcode = '23514';
      end if;
      entry_text := entry_url;
    elsif reference_kind = 'printed_citation' then
      if target_id is not null or entry_url is not null or entry_text is null then
        raise exception 'Printed references require citation text only.' using errcode = '23514';
      end if;
    else
      raise exception 'Reference type is invalid.' using errcode = '23514';
    end if;
    entry_position := entry_position + 1;
  end loop;
  entry_position := 0;

  select saved_recipe.id, saved_recipe.version into saved_id, saved_version
  from public.save_recipe_with_publication(
    p_recipe_id, p_expected_version, p_name, p_food_type_id, p_state,
    p_verdict_id, p_enthusiasm_id, p_occasion_details, p_reason, p_serves,
    p_prep_time_minutes, p_mixing_time_minutes, p_marinate_time_minutes,
    p_chill_time_minutes, p_freeze_time_minutes, p_cook_time_minutes,
    p_bake_time_minutes, p_cooling_time_minutes, p_rest_time_minutes,
    p_total_time_minutes, p_notes_markdown, p_meal_type_ids, p_cuisine_ids,
    p_equipment_ids, p_ingredient_rows, p_instruction_steps, p_publication_id,
    p_publication_page, p_recipe_url
  ) as saved_recipe;

  delete from public.recipe_site_listings as listing
  where listing.account_id = owner_id and listing.recipe_id = saved_id;
  delete from public.recipe_pairings as pairing
  where pairing.account_id = owner_id and pairing.source_recipe_id = saved_id;
  delete from public.recipe_references as recipe_reference
  where recipe_reference.account_id = owner_id and recipe_reference.recipe_id = saved_id;

  if site_id is not null then
    insert into public.recipe_site_listings (account_id, recipe_id, site_publication_id, recipe_url)
    values (owner_id, saved_id, site_id, site_url);
  end if;

  for entry in
    select item.value from jsonb_array_elements(p_recipe_relationships->'pairings')
      with ordinality as item(value, ordinal) order by item.ordinal
  loop
    target_id := nullif(entry->>'linked_recipe_id', '')::uuid;
    entry_text := nullif(trim(entry->>'display_text'), '');
    if target_id is not null then
      select recipe.name into entry_text from public.recipes as recipe
      where recipe.account_id = owner_id and recipe.id = target_id and recipe.trashed_at is null;
    end if;
    entry_id := coalesce(nullif(entry->>'id', '')::uuid, gen_random_uuid());
    insert into public.recipe_pairings (
      id, account_id, source_recipe_id, linked_recipe_id, display_text, position
    ) values (entry_id, owner_id, saved_id, target_id, entry_text, entry_position);
    entry_position := entry_position + 1;
  end loop;
  entry_position := 0;

  for entry in
    select item.value from jsonb_array_elements(p_recipe_relationships->'references')
      with ordinality as item(value, ordinal) order by item.ordinal
  loop
    reference_kind := entry->>'reference_type';
    target_id := nullif(entry->>'publication_id', '')::uuid;
    entry_url := nullif(trim(entry->>'url'), '');
    entry_text := nullif(trim(entry->>'display_text'), '');
    if reference_kind = 'publication' then
      select publication.name into entry_text from public.publications as publication
      where publication.account_id = owner_id and publication.id = target_id
        and publication.trashed_at is null;
    elsif reference_kind = 'external_url' then
      entry_text := entry_url;
    end if;
    entry_id := coalesce(nullif(entry->>'id', '')::uuid, gen_random_uuid());
    insert into public.recipe_references (
      id, account_id, recipe_id, reference_type, publication_id, display_text, url, position
    ) values (
      entry_id, owner_id, saved_id, reference_kind, target_id, entry_text, entry_url, entry_position
    );
    entry_position := entry_position + 1;
  end loop;

  return query select saved_id, saved_version;
end;
$$;

revoke all on function public.save_recipe_with_publication(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text, text, jsonb
) from public, anon;
grant execute on function public.save_recipe_with_publication(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text, text, jsonb
) to authenticated;