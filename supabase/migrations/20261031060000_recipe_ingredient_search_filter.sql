alter function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  rename to recipe_search_filter_matches_legacy;

create function private.recipe_search_filter_matches(
  target_account_id uuid,
  target_recipe_id uuid,
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
  expected_values text[];
  actual_values text[];
begin
  if field_name <> 'ingredient' then
    return private.recipe_search_filter_matches_legacy(
      target_account_id,
      target_recipe_id,
      filter
    );
  end if;

  if operator_name not in ('contains_any', 'contains_all', 'does_not_contain') then
    return false;
  end if;

  select coalesce(pg_catalog.array_agg(item.value), '{}'::text[])
  into expected_values
  from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);

  select coalesce(pg_catalog.array_agg(assignment.ingredient_id::text), '{}'::text[])
  into actual_values
  from public.recipe_ingredients as assignment
  where assignment.account_id = target_account_id
    and assignment.recipe_id = target_recipe_id;

  return case operator_name
    when 'contains_any' then actual_values && expected_values
    when 'contains_all' then actual_values @> expected_values
    else not (actual_values && expected_values)
  end;
end;
$$;

grant execute on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  to authenticated;

create or replace function public.search_recipes(
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_filters jsonb default '[]'::jsonb,
  p_sort_key text default null,
  p_sort_direction text default 'asc',
  p_publication_id uuid default null
)
returns table (
  recipe_id uuid,
  recipe_name text,
  state text,
  total_time_minutes integer,
  publication_name text,
  rank real,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_query text := nullif(pg_catalog.btrim(coalesce(p_query, '')), '');
  normalized_sort_key text;
  parsed_query tsquery;
  filter jsonb;
  field_name text;
  operator_name text;
  allowed_field boolean;
begin
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
  normalized_sort_key := coalesce(nullif(pg_catalog.btrim(p_sort_key), ''),
    case when normalized_query is null then 'name' else 'relevance' end);
  if normalized_sort_key not in ('relevance', 'name', 'state', 'total_time_minutes', 'created_at', 'updated_at') then
    raise exception 'Unsupported recipe sort key.' using errcode = '22023';
  end if;
  if p_sort_direction not in ('asc', 'desc') then
    raise exception 'Unsupported recipe sort direction.' using errcode = '22023';
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
    allowed_field := field_name in (
      'name', 'notes_markdown', 'reason', 'occasion_details', 'publication_name',
      'publication_author', 'opinion', 'publication_source', 'state', 'food_type',
      'verdict', 'enthusiasm', 'publication_id', 'meal_type', 'cuisine', 'equipment',
      'ingredient', 'tag', 'serves', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
      'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at'
    );
    if not allowed_field then
      raise exception 'Unsupported recipe filter field.' using errcode = '22023';
    end if;

    if field_name in ('name', 'opinion', 'publication_source') and operator_name = 'in' then
      if pg_catalog.jsonb_typeof(filter->'value') <> 'array'
        or pg_catalog.jsonb_array_length(filter->'value') > 500
        or exists (
          select 1 from pg_catalog.jsonb_array_elements(filter->'value') as item(value)
          where pg_catalog.jsonb_typeof(item.value) <> 'string'
        ) then
        raise exception 'Column value filters require an array of at most 500 strings.'
          using errcode = '22023';
      end if;
    elsif field_name in ('name', 'notes_markdown', 'reason', 'occasion_details', 'publication_name', 'publication_author') then
      if operator_name not in ('contains', 'does_not_contain', 'equals', 'starts_with', 'is_empty', 'is_not_empty') then
        raise exception 'Unsupported text filter operator.' using errcode = '22023';
      end if;
      if operator_name not in ('is_empty', 'is_not_empty')
        and (pg_catalog.jsonb_typeof(filter->'value') <> 'string' or pg_catalog.char_length(filter->>'value') = 0) then
        raise exception 'Text filters require a non-empty string value.' using errcode = '22023';
      end if;
    elsif field_name in ('state', 'food_type', 'verdict', 'enthusiasm', 'publication_id') then
      if operator_name not in ('in', 'not_in')
        or pg_catalog.jsonb_typeof(filter->'value') <> 'array'
        or pg_catalog.jsonb_array_length(filter->'value') > 500 then
        raise exception 'Enum filters require In or Not In and an array of at most 500 values.'
          using errcode = '22023';
      end if;
      if field_name = 'state' and exists (
        select 1 from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value)
        where item.value not in ('want_to_try', 'tried', 'will_not_try')
      ) then
        raise exception 'Unsupported recipe state filter value.' using errcode = '22023';
      end if;
    elsif field_name in ('meal_type', 'cuisine', 'equipment', 'ingredient', 'tag') then
      if operator_name not in ('contains_any', 'contains_all', 'does_not_contain')
        or pg_catalog.jsonb_typeof(filter->'value') <> 'array'
        or pg_catalog.jsonb_array_length(filter->'value') > 500
        or exists (
          select 1 from pg_catalog.jsonb_array_elements(filter->'value') as item(value)
          where pg_catalog.jsonb_typeof(item.value) <> 'string'
        ) then
        raise exception 'Multi-select filters require a supported operator and at most 500 string values.'
          using errcode = '22023';
      end if;
    elsif field_name = 'total_time_minutes' and operator_name = 'in' then
      if pg_catalog.jsonb_typeof(filter->'value') <> 'array'
        or pg_catalog.jsonb_array_length(filter->'value') > 500
        or exists (
          select 1 from pg_catalog.jsonb_array_elements(filter->'value') as item(value)
          where pg_catalog.jsonb_typeof(item.value) <> 'number'
            and not (pg_catalog.jsonb_typeof(item.value) = 'string' and item.value #>> '{}' = '__blank__')
        ) then
        raise exception 'Total time value filters require numbers or the blank marker.'
          using errcode = '22023';
      end if;
    elsif field_name in (
      'serves', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
      'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes'
    ) then
      if operator_name not in ('equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between')
        or pg_catalog.jsonb_typeof(filter->'value') <> 'number' then
        raise exception 'Numeric filters require a supported comparison and numeric value.' using errcode = '22023';
      end if;
      if operator_name = 'between' and pg_catalog.jsonb_typeof(filter->'value_to') <> 'number' then
        raise exception 'Between filters require a numeric upper value.' using errcode = '22023';
      end if;
    else
      if operator_name not in ('equals', 'not_equals', 'greater_than', 'less_than', 'at_least', 'at_most', 'between')
        or pg_catalog.jsonb_typeof(filter->'value') <> 'string' then
        raise exception 'Date filters require a supported comparison and date value.' using errcode = '22023';
      end if;
      begin
        perform (filter->>'value')::date;
        if operator_name = 'between' then perform (filter->>'value_to')::date; end if;
      exception when others then
        raise exception 'Date filters require valid ISO dates.' using errcode = '22023';
      end;
    end if;
  end loop;

  if normalized_query is not null then parsed_query := websearch_to_tsquery('english', normalized_query); end if;
  return query
  select recipe.id, recipe.name, recipe.state, recipe.total_time_minutes, publication.name,
    case when normalized_query is null then 0::real else ts_rank(search_document.search_vector, parsed_query) end,
    count(*) over ()
  from public.recipes as recipe
  join public.recipe_search_documents as search_document
    on search_document.account_id = recipe.account_id and search_document.recipe_id = recipe.id
  left join public.publications as publication
    on publication.account_id = recipe.account_id and publication.id = recipe.publication_id
  where recipe.trashed_at is null
    and (p_publication_id is null or recipe.publication_id = p_publication_id)
    and (normalized_query is null or search_document.search_vector @@ parsed_query)
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_filters) as filter_row(value)
      where not private.recipe_search_filter_matches(recipe.account_id, recipe.id, filter_row.value)
    )
  order by
    case when normalized_sort_key = 'relevance' then
      case when normalized_query is null then 0::real else ts_rank(search_document.search_vector, parsed_query) end
    end desc nulls last,
    case when normalized_sort_key = 'name' and p_sort_direction = 'asc' then recipe.name end asc nulls last,
    case when normalized_sort_key = 'name' and p_sort_direction = 'desc' then recipe.name end desc nulls last,
    case when normalized_sort_key = 'state' and p_sort_direction = 'asc' then recipe.state end asc nulls last,
    case when normalized_sort_key = 'state' and p_sort_direction = 'desc' then recipe.state end desc nulls last,
    case when normalized_sort_key = 'total_time_minutes' and p_sort_direction = 'asc' then recipe.total_time_minutes end asc nulls last,
    case when normalized_sort_key = 'total_time_minutes' and p_sort_direction = 'desc' then recipe.total_time_minutes end desc nulls last,
    case when normalized_sort_key = 'created_at' and p_sort_direction = 'asc' then recipe.created_at end asc nulls last,
    case when normalized_sort_key = 'created_at' and p_sort_direction = 'desc' then recipe.created_at end desc nulls last,
    case when normalized_sort_key = 'updated_at' and p_sort_direction = 'asc' then recipe.updated_at end asc nulls last,
    case when normalized_sort_key = 'updated_at' and p_sort_direction = 'desc' then recipe.updated_at end desc nulls last,
    recipe.name, recipe.id
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.search_recipes(text, integer, integer, jsonb, text, text, uuid)
  to authenticated;