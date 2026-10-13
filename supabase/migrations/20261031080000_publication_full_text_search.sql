create table public.publication_search_documents (
  account_id uuid not null,
  publication_id uuid not null,
  search_vector tsvector not null,
  primary key (account_id, publication_id),
  foreign key (account_id, publication_id)
    references public.publications (account_id, id) on delete cascade
);

create index publication_search_documents_vector_idx
  on public.publication_search_documents using gin (search_vector);

alter table public.publication_search_documents enable row level security;
revoke all on public.publication_search_documents from public, anon, authenticated;
grant select on public.publication_search_documents to authenticated;

create policy "Account owners can read publication search documents"
  on public.publication_search_documents
  for select
  to authenticated
  using ((select auth.uid()) = account_id);

create function private.refresh_publication_search_document(
  target_account_id uuid,
  target_publication_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  document tsvector;
begin
  select
    setweight(to_tsvector('english', coalesce(publication.name, '')), 'A')
    || setweight(to_tsvector('english', coalesce(publication.author, '')), 'B')
    || setweight(
      to_tsvector(
        'english',
        coalesce((
          select string_agg(tag.name, ' ' order by lower(tag.name), tag.id)
          from public.publication_tags as assignment
          join public.tags as tag
            on tag.account_id = assignment.account_id
            and tag.id = assignment.tag_id
          where assignment.account_id = publication.account_id
            and assignment.publication_id = publication.id
        ), '')
      ),
      'C'
    )
  into document
  from public.publications as publication
  where publication.account_id = target_account_id
    and publication.id = target_publication_id;

  if not found then
    delete from public.publication_search_documents
    where account_id = target_account_id and publication_id = target_publication_id;
    return;
  end if;

  insert into public.publication_search_documents (account_id, publication_id, search_vector)
  values (target_account_id, target_publication_id, document)
  on conflict (account_id, publication_id)
  do update set search_vector = excluded.search_vector;
end;
$$;

revoke all on function private.refresh_publication_search_document(uuid, uuid)
  from public, anon, authenticated;

create function private.refresh_publication_search_after_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_publication_id uuid;
begin
  if tg_table_name = 'publication_tags' then
    if tg_op in ('UPDATE', 'DELETE') then
      perform private.refresh_publication_search_document(old.account_id, old.publication_id);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      perform private.refresh_publication_search_document(new.account_id, new.publication_id);
    end if;
  elsif tg_table_name = 'tags' then
    if tg_op = 'UPDATE' then
      for related_publication_id in
        select assignment.publication_id
        from public.publication_tags as assignment
        where assignment.account_id = new.account_id
          and assignment.tag_id = new.id
      loop
        perform private.refresh_publication_search_document(new.account_id, related_publication_id);
      end loop;
    end if;
  else
    if tg_op in ('UPDATE', 'DELETE') then
      perform private.refresh_publication_search_document(old.account_id, old.id);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      perform private.refresh_publication_search_document(new.account_id, new.id);
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.refresh_publication_search_after_source_change()
  from public, anon, authenticated;

create trigger refresh_publication_search_after_publication_change
  after insert or update or delete on public.publications
  for each row execute function private.refresh_publication_search_after_source_change();

create trigger refresh_publication_search_after_assignment_change
  after insert or update or delete on public.publication_tags
  for each row execute function private.refresh_publication_search_after_source_change();

create trigger refresh_publication_search_after_tag_rename
  after update of name on public.tags
  for each row execute function private.refresh_publication_search_after_source_change();

insert into public.publication_search_documents (account_id, publication_id, search_vector)
select
  publication.account_id,
  publication.id,
  setweight(to_tsvector('english', coalesce(publication.name, '')), 'A')
  || setweight(to_tsvector('english', coalesce(publication.author, '')), 'B')
  || setweight(
    to_tsvector(
      'english',
      coalesce((
        select string_agg(tag.name, ' ' order by lower(tag.name), tag.id)
        from public.publication_tags as assignment
        join public.tags as tag
          on tag.account_id = assignment.account_id
          and tag.id = assignment.tag_id
        where assignment.account_id = publication.account_id
          and assignment.publication_id = publication.id
      ), '')
    ),
    'C'
  )
from public.publications as publication;

create function private.publication_search_filter_matches(
  target_account_id uuid,
  target_publication_id uuid,
  filter jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  field_name text := filter->>'field';
  operator_name text := filter->>'operator';
  field_value text;
  expected_values text[];
  actual_values text[];
  numeric_value numeric;
  numeric_value_to numeric;
  date_value date;
  date_value_to date;
begin
  if field_name = 'tag' then
    select coalesce(pg_catalog.array_agg(item.value), '{}'::text[])
    into expected_values
    from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);
    select coalesce(pg_catalog.array_agg(assignment.tag_id::text), '{}'::text[])
    into actual_values
    from public.publication_tags as assignment
    where assignment.account_id = target_account_id
      and assignment.publication_id = target_publication_id;

    return case operator_name
      when 'is' then actual_values @> expected_values and actual_values <@ expected_values
      when 'is_not' then not (actual_values @> expected_values and actual_values <@ expected_values)
      when 'contains_all' then actual_values @> expected_values
      when 'contains_any' then actual_values && expected_values
      else not (actual_values && expected_values)
    end;
  end if;

  if field_name in ('name', 'author', 'edition', 'isbn', 'retailer_url', 'site_url') then
    select case field_name
      when 'name' then publication.name
      when 'author' then publication.author
      when 'edition' then publication.edition
      when 'isbn' then publication.isbn
      when 'retailer_url' then publication.retailer_url
      else publication.site_url
    end
    into field_value
    from public.publications as publication
    where publication.account_id = target_account_id
      and publication.id = target_publication_id;

    return case operator_name
      when 'contains' then pg_catalog.strpos(pg_catalog.lower(coalesce(field_value, '')), pg_catalog.lower(filter->>'value')) > 0
      when 'does_not_contain' then pg_catalog.strpos(pg_catalog.lower(coalesce(field_value, '')), pg_catalog.lower(filter->>'value')) = 0
      when 'equals' then pg_catalog.lower(coalesce(field_value, '')) = pg_catalog.lower(filter->>'value')
      when 'starts_with' then pg_catalog.left(pg_catalog.lower(coalesce(field_value, '')), pg_catalog.char_length(filter->>'value')) = pg_catalog.lower(filter->>'value')
      when 'is_empty' then field_value is null or pg_catalog.btrim(field_value) = ''
      else field_value is not null and pg_catalog.btrim(field_value) <> ''
    end;
  end if;

  if field_name = 'publication_type' then
    select publication.publication_type
    into field_value
    from public.publications as publication
    where publication.account_id = target_account_id
      and publication.id = target_publication_id;
    select coalesce(pg_catalog.array_agg(item.value), '{}'::text[])
    into expected_values
    from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);
    return case operator_name
      when 'in' then field_value = any(expected_values)
      else not (field_value = any(expected_values))
    end;
  end if;

  if field_name = 'recipe_count' then
    select count(*)::numeric
    into numeric_value
    from public.recipes as recipe
    where recipe.account_id = target_account_id
      and recipe.publication_id = target_publication_id
      and recipe.trashed_at is null;
    numeric_value_to := (filter->>'value')::numeric;
    if operator_name = 'between' then
      numeric_value_to := (filter->>'value_to')::numeric;
    end if;
    return case operator_name
      when 'equals' then numeric_value = (filter->>'value')::numeric
      when 'not_equals' then numeric_value <> (filter->>'value')::numeric
      when 'greater_than' then numeric_value > (filter->>'value')::numeric
      when 'less_than' then numeric_value < (filter->>'value')::numeric
      when 'at_least' then numeric_value >= (filter->>'value')::numeric
      when 'at_most' then numeric_value <= (filter->>'value')::numeric
      else numeric_value between (filter->>'value')::numeric and numeric_value_to
    end;
  end if;

  if field_name in ('created_at', 'updated_at') then
    select case field_name
      when 'created_at' then publication.created_at::date
      else publication.updated_at::date
    end
    into date_value
    from public.publications as publication
    where publication.account_id = target_account_id
      and publication.id = target_publication_id;
    date_value_to := (filter->>'value')::date;
    if operator_name = 'between' then
      date_value_to := (filter->>'value_to')::date;
    end if;
    return case operator_name
      when 'equals' then date_value = (filter->>'value')::date
      when 'not_equals' then date_value <> (filter->>'value')::date
      when 'greater_than' then date_value > (filter->>'value')::date
      when 'less_than' then date_value < (filter->>'value')::date
      when 'at_least' then date_value >= (filter->>'value')::date
      when 'at_most' then date_value <= (filter->>'value')::date
      else date_value between (filter->>'value')::date and date_value_to
    end;
  end if;

  return false;
end;
$$;

revoke all on function private.publication_search_filter_matches(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.publication_search_filter_matches(uuid, uuid, jsonb)
  to authenticated;

create function public.search_publications(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_filters jsonb default '[]'::jsonb,
  p_sort_key text default null,
  p_sort_direction text default 'asc',
  p_publication_type text default null
)
returns table (
  publication_id uuid,
  publication_type text,
  name text,
  author text,
  edition text,
  issue text,
  isbn text,
  retailer_url text,
  site_url text,
  recipe_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  tag_ids uuid[],
  tag_names text[],
  rank real,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  normalized_query text := nullif(pg_catalog.btrim(coalesce(p_query, '')), '');
  normalized_sort_key text;
  parsed_query tsquery;
  filter jsonb;
  field_name text;
  operator_name text;
begin
  if owner_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if pg_catalog.char_length(coalesce(p_query, '')) > 500 then
    raise exception 'Search text exceeds 500 characters.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'Search page size must be between 1 and 100.' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Search offset must be between 0 and 1000000.' using errcode = '22023';
  end if;
  if p_filters is null or pg_catalog.jsonb_typeof(p_filters) <> 'array'
    or pg_catalog.jsonb_array_length(p_filters) > 10 then
    raise exception 'Search filters must be an array containing at most 10 filters.'
      using errcode = '22023';
  end if;
  if p_publication_type is not null and p_publication_type not in ('book', 'magazine', 'site') then
    raise exception 'Unsupported publication type.' using errcode = '22023';
  end if;
  normalized_sort_key := coalesce(nullif(pg_catalog.btrim(p_sort_key), ''),
    case when normalized_query is null then 'name' else 'relevance' end);
  if normalized_sort_key not in ('relevance', 'name', 'type', 'author', 'edition', 'recipe_count', 'created_at', 'updated_at') then
    raise exception 'Unsupported publication sort key.' using errcode = '22023';
  end if;
  if p_sort_direction not in ('asc', 'desc') then
    raise exception 'Unsupported publication sort direction.' using errcode = '22023';
  end if;

  for filter in select value from pg_catalog.jsonb_array_elements(p_filters)
  loop
    if pg_catalog.jsonb_typeof(filter) <> 'object' or exists (
      select 1 from pg_catalog.jsonb_object_keys(filter) as key_name(key)
      where key not in ('field', 'operator', 'value', 'value_to')
    ) then
      raise exception 'Each search filter must contain only field, operator, value, and value_to.'
        using errcode = '22023';
    end if;
    field_name := filter->>'field';
    operator_name := filter->>'operator';

    if field_name in ('name', 'author', 'edition', 'isbn', 'retailer_url', 'site_url') then
      if operator_name not in ('contains', 'does_not_contain', 'equals', 'starts_with', 'is_empty', 'is_not_empty') then
        raise exception 'Unsupported text filter operator.' using errcode = '22023';
      end if;
      if operator_name not in ('is_empty', 'is_not_empty')
        and (pg_catalog.jsonb_typeof(filter->'value') is distinct from 'string'
          or pg_catalog.char_length(filter->>'value') = 0) then
        raise exception 'Text filters require a non-empty string value.' using errcode = '22023';
      end if;
    elsif field_name = 'publication_type' then
      if operator_name not in ('in', 'not_in')
        or pg_catalog.jsonb_typeof(filter->'value') is distinct from 'array'
        or pg_catalog.jsonb_array_length(filter->'value') > 3
        or exists (
          select 1 from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value)
          where item.value not in ('book', 'magazine', 'site')
        ) then
        raise exception 'Type filters require supported publication types.' using errcode = '22023';
      end if;
    elsif field_name = 'tag' then
      if operator_name not in ('is', 'is_not', 'contains_any', 'contains_all', 'does_not_contain')
        or pg_catalog.jsonb_typeof(filter->'value') is distinct from 'array'
        or pg_catalog.jsonb_array_length(filter->'value') > 500
        or exists (
          select 1 from pg_catalog.jsonb_array_elements(filter->'value') as item(value)
          where pg_catalog.jsonb_typeof(item.value) <> 'string'
        ) then
        raise exception 'Tag filters require a supported operator and at most 500 tag IDs.'
          using errcode = '22023';
      end if;
    elsif field_name = 'recipe_count' then
      if operator_name not in ('equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between')
        or pg_catalog.jsonb_typeof(filter->'value') is distinct from 'number' then
        raise exception 'Recipe-count filters require a supported comparison and numeric value.'
          using errcode = '22023';
      end if;
      if operator_name = 'between' and pg_catalog.jsonb_typeof(filter->'value_to') is distinct from 'number' then
        raise exception 'Between filters require a numeric upper value.' using errcode = '22023';
      end if;
    elsif field_name in ('created_at', 'updated_at') then
      if operator_name not in ('equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between')
        or pg_catalog.jsonb_typeof(filter->'value') is distinct from 'string' then
        raise exception 'Date filters require a supported comparison and date value.' using errcode = '22023';
      end if;
      begin
        perform (filter->>'value')::date;
        if operator_name = 'between' then perform (filter->>'value_to')::date; end if;
      exception when others then
        raise exception 'Date filters require valid ISO dates.' using errcode = '22023';
      end;
    else
      raise exception 'Unsupported publication filter field.' using errcode = '22023';
    end if;
  end loop;

  if normalized_query is not null then
    parsed_query := websearch_to_tsquery('english', normalized_query);
  end if;

  return query
  select
    publication.id,
    publication.publication_type,
    publication.name,
    publication.author,
    publication.edition,
    null::text,
    publication.isbn,
    publication.retailer_url,
    publication.site_url,
    recipe_stats.recipe_count,
    publication.created_at,
    publication.updated_at,
    coalesce(tag_values.tag_ids, '{}'::uuid[]),
    coalesce(tag_values.tag_names, '{}'::text[]),
    case when normalized_query is null then 0::real
      else ts_rank(search_document.search_vector, parsed_query) end,
    count(*) over ()
  from public.publications as publication
  join public.publication_search_documents as search_document
    on search_document.account_id = publication.account_id
    and search_document.publication_id = publication.id
  left join lateral (
    select
      coalesce(pg_catalog.array_agg(assignment.tag_id order by lower(tag.name), tag.id), '{}'::uuid[]) as tag_ids,
      coalesce(pg_catalog.array_agg(tag.name order by lower(tag.name), tag.id), '{}'::text[]) as tag_names
    from public.publication_tags as assignment
    join public.tags as tag
      on tag.account_id = assignment.account_id and tag.id = assignment.tag_id
    where assignment.account_id = publication.account_id
      and assignment.publication_id = publication.id
  ) as tag_values on true
  left join lateral (
    select count(*)::bigint as recipe_count
    from public.recipes as recipe
    where recipe.account_id = publication.account_id
      and recipe.publication_id = publication.id
      and recipe.trashed_at is null
  ) as recipe_stats on true
  where publication.account_id = owner_id
    and publication.trashed_at is null
    and (p_publication_type is null or publication.publication_type = p_publication_type)
    and (normalized_query is null or search_document.search_vector @@ parsed_query)
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_filters) as filter_row(value)
      where not private.publication_search_filter_matches(
        publication.account_id, publication.id, filter_row.value
      )
    )
  order by
    case when normalized_sort_key = 'relevance' then
      case when normalized_query is null then 0::real else ts_rank(search_document.search_vector, parsed_query) end
    end desc nulls last,
    case when normalized_sort_key = 'name' and p_sort_direction = 'asc' then publication.name end asc nulls last,
    case when normalized_sort_key = 'name' and p_sort_direction = 'desc' then publication.name end desc nulls last,
    case when normalized_sort_key = 'type' and p_sort_direction = 'asc' then publication.publication_type end asc nulls last,
    case when normalized_sort_key = 'type' and p_sort_direction = 'desc' then publication.publication_type end desc nulls last,
    case when normalized_sort_key = 'author' and p_sort_direction = 'asc' then publication.author end asc nulls last,
    case when normalized_sort_key = 'author' and p_sort_direction = 'desc' then publication.author end desc nulls last,
    case when normalized_sort_key = 'edition' and p_sort_direction = 'asc' then publication.edition end asc nulls last,
    case when normalized_sort_key = 'edition' and p_sort_direction = 'desc' then publication.edition end desc nulls last,
    case when normalized_sort_key = 'recipe_count' and p_sort_direction = 'asc' then recipe_stats.recipe_count end asc nulls last,
    case when normalized_sort_key = 'recipe_count' and p_sort_direction = 'desc' then recipe_stats.recipe_count end desc nulls last,
    case when normalized_sort_key = 'created_at' and p_sort_direction = 'asc' then publication.created_at end asc nulls last,
    case when normalized_sort_key = 'created_at' and p_sort_direction = 'desc' then publication.created_at end desc nulls last,
    case when normalized_sort_key = 'updated_at' and p_sort_direction = 'asc' then publication.updated_at end asc nulls last,
    case when normalized_sort_key = 'updated_at' and p_sort_direction = 'desc' then publication.updated_at end desc nulls last,
    publication.name,
    publication.id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.search_publications(text, integer, integer, jsonb, text, text, text)
  from public, anon;
grant execute on function public.search_publications(text, integer, integer, jsonb, text, text, text)
  to authenticated;

notify pgrst, 'reload schema';