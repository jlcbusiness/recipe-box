create or replace function public.apply_recipe_publication_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_publication_type text;
begin
  if session_user = 'supabase_auth_admin'
    and old.trashed_by_user_id is not null
    and new.trashed_by_user_id is null
    and (to_jsonb(old) - 'trashed_by_user_id')
      is not distinct from (to_jsonb(new) - 'trashed_by_user_id')
  then
    return new;
  end if;

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