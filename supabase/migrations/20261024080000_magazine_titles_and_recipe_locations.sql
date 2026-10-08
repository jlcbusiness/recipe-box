alter table public.publications
  drop constraint publications_check;

alter table public.recipes
  drop constraint recipes_publication_location_exclusive_check;

create or replace function public.create_publication(
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
    if p_issue is not null
      or p_author is not null
      or p_edition is not null
      or p_isbn is not null
      or p_retailer_url is not null
      or p_site_url is not null
    then
      raise exception 'Magazine fields do not match Publication type.' using errcode = '23514';
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
    nullif(trim(p_site_url), '')
  )
  returning id into created_id;

  return created_id;
end;
$$;

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

create or replace function public.save_recipe_with_publication(
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

create temporary table magazine_title_duplicates on commit drop as
with ranked_publications as (
  select
    publication.id,
    first_value(publication.id) over (
      partition by publication.account_id, lower(btrim(publication.name))
      order by publication.created_at, publication.id
    ) as surviving_id
  from public.publications as publication
  where publication.publication_type = 'magazine'
)
select id as duplicate_id, surviving_id
from ranked_publications
where id <> surviving_id;

alter table public.recipes disable trigger recipe_history_after_save;

update public.recipes as recipe
set
  publication_page = coalesce(
    nullif(btrim(recipe.publication_page), ''),
    nullif(btrim(publication.issue), '')
  ),
  recipe_url = coalesce(
    nullif(btrim(recipe.recipe_url), ''),
    (
      select listing.recipe_url
      from public.recipe_site_listings as listing
      where listing.account_id = recipe.account_id
        and listing.recipe_id = recipe.id
    )
  )
from public.publications as publication
where recipe.publication_id = publication.id
  and publication.publication_type = 'magazine';

delete from public.recipe_site_listings as listing
using public.recipes as recipe, public.publications as publication
where listing.account_id = recipe.account_id
  and listing.recipe_id = recipe.id
  and publication.id = recipe.publication_id
  and publication.publication_type = 'magazine';

update public.recipe_references as recipe_reference
set
  publication_id = duplicate.surviving_id,
  display_text = surviving.name
from magazine_title_duplicates as duplicate
join public.publications as surviving on surviving.id = duplicate.surviving_id
where recipe_reference.publication_id = duplicate.duplicate_id;

update public.recipes as recipe
set publication_id = duplicate.surviving_id
from magazine_title_duplicates as duplicate
where recipe.publication_id = duplicate.duplicate_id;

delete from public.publications as publication
using magazine_title_duplicates as duplicate
where publication.id = duplicate.duplicate_id;

set constraints recipes_publication_owner_fkey immediate;

alter table public.recipes enable trigger recipe_history_after_save;

alter table public.publications
  drop column issue,
  add constraint publications_check check (
    (publication_type = 'book' and site_url is null)
    or (publication_type = 'magazine'
      and author is null
      and edition is null
      and isbn is null
      and retailer_url is null
      and site_url is null)
    or (publication_type = 'site'
      and author is null
      and edition is null
      and isbn is null
      and retailer_url is null
      and site_url is not null)
  );

create unique index publications_owner_magazine_title_idx
  on public.publications (account_id, lower(btrim(name)))
  where publication_type = 'magazine';