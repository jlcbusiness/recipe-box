create table public.publications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  publication_type text not null check (
    publication_type in ('book', 'magazine', 'site')
  ),
  name text not null check (length(trim(name)) > 0),
  author text,
  edition text,
  isbn text,
  retailer_url text check (
    retailer_url is null or retailer_url ~* '^https?://[^[:space:]]+$'
  ),
  issue text,
  site_url text check (
    site_url is null or site_url ~* '^https?://[^[:space:]]+$'
  ),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, id),
  check (
    (publication_type = 'book'
      and issue is null
      and site_url is null)
    or (publication_type = 'magazine'
      and author is null
      and edition is null
      and isbn is null
      and retailer_url is null
      and nullif(trim(issue), '') is not null
      and site_url is null)
    or (publication_type = 'site'
      and author is null
      and edition is null
      and isbn is null
      and retailer_url is null
      and issue is null
      and site_url is not null)
  )
);

create index publications_owner_type_name_idx
  on public.publications (account_id, publication_type, name);

alter table public.recipes
  add column publication_id uuid,
  add column publication_page text,
  add column recipe_url text check (
    recipe_url is null or recipe_url ~* '^https?://[^[:space:]]+$'
  ),
  add constraint recipes_publication_owner_fkey
    foreign key (account_id, publication_id)
    references public.publications (account_id, id)
    deferrable initially deferred,
  add constraint recipes_publication_location_exclusive_check
    check (publication_page is null or recipe_url is null);

create index recipes_owner_publication_active_idx
  on public.recipes (account_id, publication_id, updated_at desc)
  where trashed_at is null and publication_id is not null;

create table public.publication_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  record_id uuid not null,
  event_type text not null check (event_type = 'publication.created'),
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.publications enable row level security;
alter table public.publication_history enable row level security;

grant select on public.publications to authenticated;
grant select on public.publication_history to authenticated;

create policy "Account owners can read publications"
  on public.publications
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create policy "Account owners can read publication history"
  on public.publication_history
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create function public.publication_history_after_insert()
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
    after_data
  )
  values (
    new.account_id,
    auth.uid(),
    new.id,
    'publication.created',
    to_jsonb(new)
  );
  return new;
end;
$$;

create trigger publication_history_after_insert
  after insert on public.publications
  for each row execute function public.publication_history_after_insert();

create function public.create_publication(
  p_name text,
  p_publication_type text,
  p_author text,
  p_edition text,
  p_isbn text,
  p_retailer_url text,
  p_issue text,
  p_site_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  created_id uuid;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Publication name is required.' using errcode = '23514';
  end if;

  if p_publication_type not in ('book', 'magazine', 'site') then
    raise exception 'Publication type is invalid.' using errcode = '23514';
  end if;

  if p_publication_type = 'book' then
    if p_issue is not null or p_site_url is not null then
      raise exception 'Book fields do not match Publication type.' using errcode = '23514';
    end if;
  elsif p_publication_type = 'magazine' then
    if nullif(trim(p_issue), '') is null
      or p_author is not null
      or p_edition is not null
      or p_isbn is not null
      or p_retailer_url is not null
      or p_site_url is not null
    then
      raise exception 'Magazine Issue fields do not match Publication type.' using errcode = '23514';
    end if;
  elsif p_site_url is null
    or p_author is not null
    or p_edition is not null
    or p_isbn is not null
    or p_retailer_url is not null
    or p_issue is not null
  then
    raise exception 'Site fields do not match Publication type.' using errcode = '23514';
  end if;

  if (p_retailer_url is not null and p_retailer_url !~* '^https?://[^[:space:]]+$')
    or (p_site_url is not null and p_site_url !~* '^https?://[^[:space:]]+$')
  then
    raise exception 'Publication URLs must be absolute HTTP(S) URLs.' using errcode = '23514';
  end if;

  insert into public.publications (
    account_id,
    name,
    publication_type,
    author,
    edition,
    isbn,
    retailer_url,
    issue,
    site_url
  )
  values (
    owner_id,
    trim(p_name),
    p_publication_type,
    nullif(trim(p_author), ''),
    nullif(trim(p_edition), ''),
    nullif(trim(p_isbn), ''),
    nullif(trim(p_retailer_url), ''),
    nullif(trim(p_issue), ''),
    nullif(trim(p_site_url), '')
  )
  returning id into created_id;

  return created_id;
end;
$$;

revoke all on function public.create_publication(text, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.create_publication(text, text, text, text, text, text, text, text)
  to authenticated;

create function public.apply_recipe_publication_context()
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
    and publication.id = new.publication_id;

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

create trigger recipes_apply_publication_context
  before insert or update on public.recipes
  for each row execute function public.apply_recipe_publication_context();

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
  p_recipe_url text
)
returns table (id uuid, version integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  saved_id uuid;
  saved_version integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_publication_page is not null and p_recipe_url is not null then
    raise exception 'Choose either a page reference or a recipe URL.' using errcode = '23514';
  end if;

  if p_recipe_url is not null and p_recipe_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Recipe URL must be an absolute HTTP(S) URL.' using errcode = '23514';
  end if;

  perform pg_catalog.set_config('app.recipe_publication_context', 'on', true);
  perform pg_catalog.set_config(
    'app.recipe_publication_id',
    coalesce(p_publication_id::text, ''),
    true
  );
  perform pg_catalog.set_config('app.recipe_publication_page', coalesce(p_publication_page, ''), true);
  perform pg_catalog.set_config('app.recipe_url', coalesce(p_recipe_url, ''), true);

  select saved_recipe.id, saved_recipe.version
  into saved_id, saved_version
  from public.save_recipe(
    p_recipe_id,
    p_expected_version,
    p_name,
    p_food_type_id,
    p_state,
    p_verdict_id,
    p_enthusiasm_id,
    p_occasion_details,
    p_reason,
    p_serves,
    p_prep_time_minutes,
    p_mixing_time_minutes,
    p_marinate_time_minutes,
    p_chill_time_minutes,
    p_freeze_time_minutes,
    p_cook_time_minutes,
    p_bake_time_minutes,
    p_cooling_time_minutes,
    p_rest_time_minutes,
    p_total_time_minutes,
    p_notes_markdown,
    p_meal_type_ids,
    p_cuisine_ids,
    p_equipment_ids,
    p_ingredient_rows,
    p_instruction_steps
  ) as saved_recipe;

  return query select saved_id, saved_version;
end;
$$;

revoke all on function public.save_recipe_with_publication(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text, text
) from public, anon;
grant execute on function public.save_recipe_with_publication(
  uuid, integer, text, uuid, text, uuid, uuid, text, text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  integer, integer, text, uuid[], uuid[], uuid[], jsonb, jsonb, uuid, text, text
) to authenticated;
