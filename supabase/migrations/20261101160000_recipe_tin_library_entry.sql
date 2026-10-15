alter table public.publications
  drop constraint if exists publications_publication_type_check,
  drop constraint if exists publications_check;

alter table public.publications
  add constraint publications_type_check
    check (publication_type in ('book', 'magazine', 'site', 'collection')),
  add constraint publications_details_check
    check (
      (publication_type = 'book'
        and site_url is null)
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
      or (publication_type = 'collection'
        and name = 'Recipe Tin'
        and author is null
        and edition is null
        and isbn is null
        and retailer_url is null
        and site_url is null)
    );

create unique index publications_one_recipe_tin_per_account_idx
  on public.publications (account_id)
  where publication_type = 'collection';

create function private.ensure_recipe_tin(target_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipe_tin_id uuid;
  previous_context text := current_setting('app.recipe_tin_provisioning', true);
  previous_lifecycle_context text := current_setting('app.publication_lifecycle_context', true);
begin
  select publication.id
  into recipe_tin_id
  from public.publications as publication
  where publication.account_id = target_account_id
    and publication.publication_type = 'collection';

  if recipe_tin_id is not null then
    return recipe_tin_id;
  end if;

  perform set_config('app.recipe_tin_provisioning', 'on', true);
  perform set_config('app.publication_lifecycle_context', 'on', true);
  insert into public.publications (account_id, name, publication_type)
  values (target_account_id, 'Recipe Tin', 'collection')
  on conflict (account_id) where publication_type = 'collection' do nothing
  returning id into recipe_tin_id;
  perform set_config('app.recipe_tin_provisioning', coalesce(previous_context, ''), true);
  perform set_config(
    'app.publication_lifecycle_context',
    coalesce(previous_lifecycle_context, ''),
    true
  );

  if recipe_tin_id is null then
    select publication.id
    into recipe_tin_id
    from public.publications as publication
    where publication.account_id = target_account_id
      and publication.publication_type = 'collection';
  end if;

  if recipe_tin_id is null then
    raise exception 'Unable to provision the Recipe Tin for this account.';
  end if;

  return recipe_tin_id;
end;
$$;

revoke all on function private.ensure_recipe_tin(uuid) from public, anon, authenticated;

create function private.provision_recipe_tin_for_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_recipe_tin(new.id);
  return new;
end;
$$;

revoke all on function private.provision_recipe_tin_for_account()
  from public, anon, authenticated;

create trigger accounts_provision_recipe_tin
  after insert on public.accounts
  for each row execute function private.provision_recipe_tin_for_account();

do $$
declare
  account_row record;
begin
  for account_row in select account.id from public.accounts as account loop
    perform private.ensure_recipe_tin(account_row.id);
  end loop;
end;
$$;

create function public.guard_recipe_tin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.publication_type = 'collection'
      and current_setting('app.recipe_tin_provisioning', true) is distinct from 'on' then
      raise exception 'Recipe Tin is managed by the system.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.publication_type = 'collection' or new.publication_type = 'collection' then
      raise exception 'Recipe Tin is permanent and cannot be changed.' using errcode = '42501';
    end if;
    return new;
  end if;

  if old.publication_type = 'collection'
    and exists (select 1 from public.accounts as account where account.id = old.account_id) then
    raise exception 'Recipe Tin is permanent and cannot be deleted.' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_recipe_tin() from public, anon, authenticated;

create trigger publications_guard_recipe_tin
  before insert or update or delete on public.publications
  for each row execute function public.guard_recipe_tin();

alter table public.recipes disable trigger recipe_history_after_save;

update public.recipes as recipe
set publication_id = publication.id
from public.publications as publication
where publication.account_id = recipe.account_id
  and publication.publication_type = 'collection'
  and recipe.publication_id is null;

set constraints recipes_publication_owner_fkey immediate;

alter table public.recipes enable trigger recipe_history_after_save;

alter table public.recipes
  alter column publication_id set not null;

do $$
declare
  function_source text;
  old_recipe_tin_disposition constant text := $fragment$    set publication_id = null,
        publication_page = null,
        recipe_url = null,
        version = recipe.version + 1$fragment$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.trash_publication(uuid,integer,text,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_recipe_tin_disposition) = 0 then
    raise exception 'Could not safely update publication trash disposition for Recipe Tin.';
  end if;

  function_source := pg_catalog.replace(
    function_source,
    old_recipe_tin_disposition,
    $fragment$    set publication_id = private.ensure_recipe_tin(owner_id),
        publication_page = null,
        recipe_url = null,
        version = recipe.version + 1$fragment$
  );

  execute function_source;
end;
$$;

create or replace function public.apply_recipe_publication_context()
returns trigger
language plpgsql
security definer
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
    select publication.id
    into new.publication_id
    from public.publications as publication
    where publication.account_id = new.account_id
      and publication.publication_type = 'collection'
      and publication.trashed_at is null;
  end if;

  if new.publication_id is null then
    raise exception 'Recipe Tin is not available to this account.' using errcode = 'P0002';
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

  if (selected_publication_type = 'collection'
      and (new.publication_page is not null or new.recipe_url is not null))
    or (selected_publication_type = 'book' and new.recipe_url is not null)
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

do $$
declare
  function_source text;
  old_type_check constant text :=
    $fragment$if p_publication_type is not null and p_publication_type not in ('book', 'magazine', 'site') then$fragment$;
  old_filter_limit constant text :=
    $fragment$jsonb_array_length(filter->'value') > 3$fragment$;
  old_filter_types constant text :=
    $fragment$where item.value not in ('book', 'magazine', 'site')$fragment$;
  old_order_by constant text := $fragment$  order by
    case when normalized_sort_key = 'relevance' then$fragment$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_publications(text,integer,integer,jsonb,text,text,text)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_type_check) = 0
    or pg_catalog.strpos(function_source, old_filter_limit) = 0
    or (pg_catalog.length(function_source) - pg_catalog.length(
      pg_catalog.replace(function_source, old_filter_limit, '')
    )) <> pg_catalog.length(old_filter_limit)
    or pg_catalog.strpos(function_source, old_filter_types) = 0
    or (pg_catalog.length(function_source) - pg_catalog.length(
      pg_catalog.replace(function_source, old_filter_types, '')
    )) <> pg_catalog.length(old_filter_types)
    or pg_catalog.strpos(function_source, old_order_by) = 0 then
    raise exception 'Could not safely update the Library search function for Recipe Tin.';
  end if;

  function_source := pg_catalog.replace(
    function_source,
    old_type_check,
    $fragment$if p_publication_type is not null and p_publication_type not in ('book', 'magazine', 'site', 'collection') then$fragment$
  );
  function_source := pg_catalog.replace(
    function_source,
    old_filter_limit,
    $fragment$jsonb_array_length(filter->'value') > 4$fragment$
  );
  function_source := pg_catalog.replace(
    function_source,
    old_filter_types,
    $fragment$where item.value not in ('book', 'magazine', 'site', 'collection')$fragment$
  );
  function_source := pg_catalog.replace(
    function_source,
    old_order_by,
    $fragment$  order by
    (publication.publication_type = 'collection') desc,
    case when normalized_sort_key = 'relevance' then$fragment$
  );

  execute function_source;
end;
$$;

notify pgrst, 'reload schema';