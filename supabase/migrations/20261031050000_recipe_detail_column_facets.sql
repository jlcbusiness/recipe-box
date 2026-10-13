create or replace function private.recipe_search_filter_matches(
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
  recipe_row public.recipes%rowtype;
  field_name text := filter->>'field';
  operator_name text := filter->>'operator';
  text_value text;
  field_value text;
  expected_values text[];
  actual_values text[];
  numeric_value numeric;
  numeric_upper numeric;
  date_value timestamptz;
  date_upper timestamptz;
begin
  select recipe.* into recipe_row
  from public.recipes as recipe
  where recipe.account_id = target_account_id and recipe.id = target_recipe_id;
  if not found then return false; end if;

  if field_name in (
    'name', 'notes_markdown', 'reason', 'occasion_details', 'publication_name',
    'publication_author', 'opinion', 'publication_source'
  ) then
    if field_name = 'name' then
      text_value := recipe_row.name;
    elsif field_name = 'notes_markdown' then
      text_value := recipe_row.notes_markdown;
    elsif field_name = 'reason' then
      text_value := recipe_row.reason;
    elsif field_name = 'occasion_details' then
      text_value := recipe_row.occasion_details;
    elsif field_name = 'publication_name' then
      select publication.name into text_value
      from public.publications as publication
      where publication.account_id = target_account_id and publication.id = recipe_row.publication_id;
    elsif field_name = 'publication_author' then
      select publication.author into text_value
      from public.publications as publication
      where publication.account_id = target_account_id and publication.id = recipe_row.publication_id;
    elsif field_name = 'publication_source' then
      text_value := coalesce(recipe_row.publication_page::text, recipe_row.recipe_url);
    elsif recipe_row.state = 'want_to_try' then
      select value.display_value into text_value
      from public.recipe_picklist_values as value
      where value.account_id = target_account_id and value.id = recipe_row.enthusiasm_id;
    elsif recipe_row.state = 'tried' then
      select value.display_value into text_value
      from public.recipe_picklist_values as value
      where value.account_id = target_account_id and value.id = recipe_row.verdict_id;
    else
      text_value := recipe_row.reason;
    end if;

    if operator_name = 'in' then
      select coalesce(pg_catalog.array_agg(pg_catalog.lower(item.value)), '{}'::text[])
      into expected_values
      from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);
      return pg_catalog.lower(coalesce(text_value, '')) = any(expected_values)
        or (text_value is null and '__blank__' = any(expected_values));
    elsif operator_name = 'is_empty' then
      return coalesce(pg_catalog.btrim(text_value), '') = '';
    elsif operator_name = 'is_not_empty' then
      return coalesce(pg_catalog.btrim(text_value), '') <> '';
    elsif operator_name = 'contains' then
      return pg_catalog.strpos(pg_catalog.lower(coalesce(text_value, '')), pg_catalog.lower(filter->>'value')) > 0;
    elsif operator_name = 'does_not_contain' then
      return pg_catalog.strpos(pg_catalog.lower(coalesce(text_value, '')), pg_catalog.lower(filter->>'value')) = 0;
    elsif operator_name = 'equals' then
      return pg_catalog.lower(coalesce(text_value, '')) = pg_catalog.lower(filter->>'value');
    else
      return pg_catalog.starts_with(pg_catalog.lower(coalesce(text_value, '')), pg_catalog.lower(filter->>'value'));
    end if;
  end if;

  if field_name in ('state', 'food_type', 'verdict', 'enthusiasm', 'publication_id') then
    field_value := case field_name
      when 'state' then recipe_row.state
      when 'food_type' then recipe_row.food_type_id::text
      when 'verdict' then recipe_row.verdict_id::text
      when 'enthusiasm' then recipe_row.enthusiasm_id::text
      else recipe_row.publication_id::text
    end;
    select coalesce(pg_catalog.array_agg(item.value), '{}'::text[])
    into expected_values
    from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);
    if operator_name = 'in' then
      return field_value = any(expected_values)
        or (field_name = 'publication_id' and field_value is null and '__recipe_tin__' = any(expected_values))
        or (field_name = 'food_type' and field_value is null and '__blank__' = any(expected_values));
    end if;
    return field_value is null or not (field_value = any(expected_values));
  end if;

  if field_name in ('meal_type', 'cuisine', 'equipment', 'tag') then
    if field_name = 'tag' then
      select coalesce(pg_catalog.array_agg(assignment.tag_id::text), '{}'::text[])
      into actual_values
      from public.recipe_tags as assignment
      where assignment.account_id = target_account_id and assignment.recipe_id = target_recipe_id;
    else
      select coalesce(pg_catalog.array_agg(assignment.picklist_value_id::text), '{}'::text[])
      into actual_values
      from public.recipe_picklist_assignments as assignment
      where assignment.account_id = target_account_id
        and assignment.recipe_id = target_recipe_id
        and assignment.category = field_name;
    end if;
    select coalesce(pg_catalog.array_agg(item.value), '{}'::text[])
    into expected_values
    from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);
    return case operator_name
      when 'contains_any' then actual_values && expected_values
        or (field_name = 'meal_type' and cardinality(actual_values) = 0 and '__blank__' = any(expected_values))
      when 'contains_all' then actual_values @> expected_values
      else not (actual_values && expected_values)
    end;
  end if;

  if field_name in (
    'serves', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
    'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
    'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes'
  ) then
    numeric_value := case field_name
      when 'serves' then recipe_row.serves
      when 'prep_time_minutes' then recipe_row.prep_time_minutes
      when 'mixing_time_minutes' then recipe_row.mixing_time_minutes
      when 'marinate_time_minutes' then recipe_row.marinate_time_minutes
      when 'chill_time_minutes' then recipe_row.chill_time_minutes
      when 'freeze_time_minutes' then recipe_row.freeze_time_minutes
      when 'cook_time_minutes' then recipe_row.cook_time_minutes
      when 'bake_time_minutes' then recipe_row.bake_time_minutes
      when 'cooling_time_minutes' then recipe_row.cooling_time_minutes
      when 'rest_time_minutes' then recipe_row.rest_time_minutes
      else recipe_row.total_time_minutes
    end;
    if operator_name = 'in' then
      return (numeric_value is null and filter->'value' @> '"__blank__"'::jsonb)
        or (numeric_value is not null and exists (
          select 1 from pg_catalog.jsonb_array_elements(filter->'value') as item(value)
          where pg_catalog.jsonb_typeof(item.value) = 'number'
            and (item.value #>> '{}')::numeric = numeric_value
        ));
    end if;
    if numeric_value is null then return false; end if;
    numeric_upper := nullif(filter->>'value_to', '')::numeric;
    return case operator_name
      when 'equals' then numeric_value = (filter->>'value')::numeric
      when 'not_equals' then numeric_value <> (filter->>'value')::numeric
      when 'greater_than' then numeric_value > (filter->>'value')::numeric
      when 'less_than' then numeric_value < (filter->>'value')::numeric
      when 'at_least' then numeric_value >= (filter->>'value')::numeric
      when 'at_most' then numeric_value <= (filter->>'value')::numeric
      else numeric_value between (filter->>'value')::numeric and numeric_upper
    end;
  end if;

  if field_name in ('created_at', 'updated_at') then
    date_value := case field_name when 'created_at' then recipe_row.created_at else recipe_row.updated_at end;
    date_upper := nullif(filter->>'value_to', '')::timestamptz;
    return case operator_name
      when 'equals' then date_value::date = (filter->>'value')::date
      when 'not_equals' then date_value::date <> (filter->>'value')::date
      when 'greater_than' then date_value > (filter->>'value')::timestamptz
      when 'less_than' then date_value < (filter->>'value')::timestamptz
      when 'at_least' then date_value >= (filter->>'value')::timestamptz
      when 'at_most' then date_value <= (filter->>'value')::timestamptz
      else date_value::date between (filter->>'value')::date and date_upper::date
    end;
  end if;
  return false;
end;
$$;

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
      'tag', 'serves', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
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
    elsif field_name in ('meal_type', 'cuisine', 'equipment', 'tag') then
      if operator_name not in ('contains_any', 'contains_all', 'does_not_contain')
        or pg_catalog.jsonb_typeof(filter->'value') <> 'array'
        or pg_catalog.jsonb_array_length(filter->'value') > 500 then
        raise exception 'Multi-select filters require a supported operator and at most 500 values.'
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

create or replace function public.recipe_search_facet_values(
  p_query text default null,
  p_filters jsonb default '[]'::jsonb,
  p_facet_field text default 'name',
  p_publication_id uuid default null
)
returns table (facet_value text, facet_label text, recipe_count bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_query text := nullif(pg_catalog.btrim(coalesce(p_query, '')), '');
  parsed_query tsquery;
begin
  if p_facet_field not in (
    'name', 'publication_id', 'state', 'total_time_minutes', 'opinion',
    'meal_type', 'food_type', 'publication_source'
  ) then
    raise exception 'Unsupported recipe facet field.' using errcode = '22023';
  end if;
  if pg_catalog.char_length(coalesce(p_query, '')) > 500 then
    raise exception 'Search text exceeds 500 characters.' using errcode = '22023';
  end if;
  if normalized_query is not null then parsed_query := websearch_to_tsquery('english', normalized_query); end if;
  perform result.recipe_id
  from public.search_recipes(p_query, 1, 0, p_filters, 'name', 'asc', p_publication_id) as result;

  return query
  with matching_recipes as (
    select recipe.account_id, recipe.id, recipe.name, recipe.state, recipe.total_time_minutes,
      recipe.publication_id, recipe.food_type_id, recipe.enthusiasm_id, recipe.verdict_id,
      recipe.reason, recipe.publication_page, recipe.recipe_url
    from public.recipes as recipe
    join public.recipe_search_documents as search_document
      on search_document.account_id = recipe.account_id and search_document.recipe_id = recipe.id
    where recipe.trashed_at is null
      and (p_publication_id is null or recipe.publication_id = p_publication_id)
      and (normalized_query is null or search_document.search_vector @@ parsed_query)
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(p_filters) as filter_row(value)
        where not private.recipe_search_filter_matches(recipe.account_id, recipe.id, filter_row.value)
      )
  ),
  facet_rows as (
    select recipe.name as value, recipe.name as label, count(*) as value_count
    from matching_recipes as recipe where p_facet_field = 'name' group by recipe.name
    union all
    select coalesce(recipe.publication_id::text, '__recipe_tin__'),
      coalesce(publication.name, 'Recipe Tin'), count(*)
    from matching_recipes as recipe
    left join public.publications as publication
      on publication.account_id = recipe.account_id and publication.id = recipe.publication_id
    where p_facet_field = 'publication_id'
    group by recipe.publication_id, publication.name
    union all
    select recipe.state, case recipe.state when 'want_to_try' then 'Want to Try'
      when 'tried' then 'Tried' else 'Will Not Try' end, count(*)
    from matching_recipes as recipe where p_facet_field = 'state' group by recipe.state
    union all
    select coalesce(recipe.total_time_minutes::text, '__blank__'),
      case when recipe.total_time_minutes is null then 'No total time'
        else recipe.total_time_minutes::text || ' min' end, count(*)
    from matching_recipes as recipe where p_facet_field = 'total_time_minutes'
    group by recipe.total_time_minutes
    union all
    select coalesce(recipe.food_type_id::text, '__blank__'),
      coalesce(value.display_value, 'No food type'), count(*)
    from matching_recipes as recipe
    left join public.recipe_picklist_values as value
      on value.account_id = recipe.account_id and value.id = recipe.food_type_id
    where p_facet_field = 'food_type'
    group by recipe.food_type_id, value.display_value
    union all
    select coalesce(assignment.picklist_value_id::text, '__blank__'),
      coalesce(value.display_value, 'No meal type'), count(distinct recipe.id)
    from matching_recipes as recipe
    left join public.recipe_picklist_assignments as assignment
      on assignment.account_id = recipe.account_id and assignment.recipe_id = recipe.id
      and assignment.category = 'meal_type'
    left join public.recipe_picklist_values as value
      on value.account_id = recipe.account_id and value.id = assignment.picklist_value_id
    where p_facet_field = 'meal_type'
    group by assignment.picklist_value_id, value.display_value
    union all
    select coalesce(opinion.value, '__blank__'), coalesce(opinion.value, 'No opinion'), count(*)
    from matching_recipes as recipe
    left join public.recipe_picklist_values as verdict
      on verdict.account_id = recipe.account_id and verdict.id = recipe.verdict_id
    left join public.recipe_picklist_values as enthusiasm
      on enthusiasm.account_id = recipe.account_id and enthusiasm.id = recipe.enthusiasm_id
    cross join lateral (
      select case recipe.state when 'want_to_try' then enthusiasm.display_value
        when 'tried' then verdict.display_value else recipe.reason end as value
    ) as opinion
    where p_facet_field = 'opinion'
    group by opinion.value
    union all
    select coalesce(recipe.publication_page::text, recipe.recipe_url, '__blank__'),
      case when recipe.publication_page is not null then 'Page ' || recipe.publication_page::text
        when recipe.recipe_url is not null then recipe.recipe_url else 'No page or URL' end,
      count(*)
    from matching_recipes as recipe where p_facet_field = 'publication_source'
    group by recipe.publication_page, recipe.recipe_url
  )
  select facet_rows.value, facet_rows.label, facet_rows.value_count
  from facet_rows order by facet_rows.label collate "C";
end;
$$;

revoke all on function public.recipe_search_facet_values(text, jsonb, text, uuid)
  from public, anon;
grant execute on function public.recipe_search_facet_values(text, jsonb, text, uuid)
  to authenticated;