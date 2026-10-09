alter table public.publication_history
  drop constraint publication_history_event_type_check,
  add constraint publication_history_event_type_check check (
    event_type in (
      'publication.created',
      'publication.updated',
      'publication.trashed',
      'publication.restored',
      'publication.cover_added',
      'publication.cover_updated',
      'publication.cover_removed'
    )
  );

create function public.publication_history_after_metadata_update()
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
    before_data,
    after_data
  )
  values (
    new.account_id,
    auth.uid(),
    new.id,
    'publication.updated',
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;

create trigger publication_history_after_metadata_update
  after update on public.publications
  for each row
  when (
    old.version is distinct from new.version
    and old.trashed_at is not distinct from new.trashed_at
  )
  execute function public.publication_history_after_metadata_update();

create function public.update_publication(
  p_publication_id uuid,
  p_expected_version integer,
  p_name text,
  p_author text,
  p_edition text,
  p_isbn text,
  p_retailer_url text,
  p_site_url text
)
returns table (id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  publication_type_value text;
  publication_version integer;
  publication_trashed_at timestamptz;
  clean_isbn text := upper(regexp_replace(coalesce(p_isbn, ''), '[[:space:]-]', '', 'g'));
  isbn_total integer := 0;
  isbn_index integer;
  isbn_digit integer;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select publication.publication_type, publication.version, publication.trashed_at
  into publication_type_value, publication_version, publication_trashed_at
  from public.publications as publication
  where publication.id = p_publication_id
    and publication.account_id = owner_id
  for update;

  if not found then
    raise exception 'Publication not found.' using errcode = 'P0002';
  end if;
  if publication_version is distinct from p_expected_version then
    raise exception 'Publication version is stale.' using errcode = '40001';
  end if;
  if publication_trashed_at is not null then
    raise exception 'Publication is in Trash.' using errcode = '55000';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Publication name is required.' using errcode = '23514';
  end if;

  if publication_type_value = 'book' then
    if p_site_url is not null then
      raise exception 'Book fields do not match Publication type.' using errcode = '23514';
    end if;
    if p_isbn is not null and trim(p_isbn) <> '' and clean_isbn = '' then
      raise exception 'ISBN is invalid.' using errcode = '23514';
    end if;
    if clean_isbn <> '' then
      if length(clean_isbn) = 10 and clean_isbn ~ '^[0-9]{9}[0-9X]$' then
        for isbn_index in 1..10 loop
          isbn_digit := case
            when substr(clean_isbn, isbn_index, 1) = 'X' then 10
            else ascii(substr(clean_isbn, isbn_index, 1)) - ascii('0')
          end;
          isbn_total := isbn_total + isbn_digit * (11 - isbn_index);
        end loop;
        if isbn_total % 11 <> 0 then
          raise exception 'ISBN is invalid.' using errcode = '23514';
        end if;
      elsif length(clean_isbn) = 13 and clean_isbn ~ '^[0-9]{13}$' then
        for isbn_index in 1..12 loop
          isbn_total := isbn_total
            + (ascii(substr(clean_isbn, isbn_index, 1)) - ascii('0'))
              * case when isbn_index % 2 = 1 then 1 else 3 end;
        end loop;
        if (10 - (isbn_total % 10)) % 10
          <> ascii(substr(clean_isbn, 13, 1)) - ascii('0')
        then
          raise exception 'ISBN is invalid.' using errcode = '23514';
        end if;
      else
        raise exception 'ISBN is invalid.' using errcode = '23514';
      end if;
    end if;
    if p_retailer_url is not null
      and p_retailer_url !~* '^https?://[^[:space:]]+$'
    then
      raise exception 'Retailer URL must be an absolute HTTP(S) URL.'
        using errcode = '23514';
    end if;
  elsif publication_type_value = 'magazine' then
    if p_author is not null
      or p_edition is not null
      or p_isbn is not null
      or p_retailer_url is not null
      or p_site_url is not null
    then
      raise exception 'Magazine fields do not match Publication type.' using errcode = '23514';
    end if;
  elsif publication_type_value = 'site' then
    if p_author is not null
      or p_edition is not null
      or p_isbn is not null
      or p_retailer_url is not null
      or p_site_url is null
      or p_site_url !~* '^https?://[^[:space:]]+$'
    then
      raise exception 'Site fields do not match Publication type.' using errcode = '23514';
    end if;
  else
    raise exception 'Publication type is invalid.' using errcode = '23514';
  end if;

  return query
    update public.publications as publication
    set name = trim(p_name),
        author = case when publication_type_value = 'book' then nullif(trim(p_author), '') end,
        edition = case when publication_type_value = 'book' then nullif(trim(p_edition), '') end,
        isbn = case when publication_type_value = 'book' then nullif(clean_isbn, '') end,
        retailer_url = case
          when publication_type_value = 'book' then nullif(trim(p_retailer_url), '')
        end,
        site_url = case
          when publication_type_value = 'site' then nullif(trim(p_site_url), '')
        end,
        version = publication.version + 1
    where publication.id = p_publication_id
      and publication.account_id = owner_id
    returning publication.id, publication.version;
end;
$$;

revoke all on function public.update_publication(uuid, integer, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.update_publication(uuid, integer, text, text, text, text, text, text)
  to authenticated;