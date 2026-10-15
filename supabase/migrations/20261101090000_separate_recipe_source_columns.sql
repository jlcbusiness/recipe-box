alter table public.accounts
  drop constraint accounts_recipe_column_order_check,
  drop constraint accounts_recipe_hidden_columns_check;

create or replace function public.is_valid_recipe_hidden_columns(p_hidden_columns text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_hidden_columns is not null
    and pg_catalog.array_position(p_hidden_columns, null) is null
    and p_hidden_columns <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'enthusiasm',
      'verdict', 'reason', 'occasion_details', 'serves', 'equipment', 'food_type',
      'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes',
      'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
      'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'citation'
    ]::text[]
    and pg_catalog.cardinality(p_hidden_columns) = (
      select pg_catalog.count(distinct hidden_column.value)
      from pg_catalog.unnest(p_hidden_columns) as hidden_column(value)
    );
$$;

update public.accounts
set recipe_column_order = array_replace(recipe_column_order, 'publication_source', 'citation'),
    recipe_hidden_columns = array_replace(recipe_hidden_columns, 'publication_source', 'citation');

update public.explorer_state as saved_state
set state = jsonb_set(
  saved_state.state,
  '{display_preferences,visible_columns}',
  (
    select coalesce(
      pg_catalog.jsonb_agg(
        case column_name.value when 'publication_source' then 'citation' else column_name.value end
        order by column_name.ordinality
      ),
      '[]'::jsonb
    )
    from pg_catalog.jsonb_array_elements_text(
      saved_state.state #> '{display_preferences,visible_columns}'
    ) with ordinality as column_name(value, ordinality)
  )
)
where pg_catalog.jsonb_typeof(saved_state.state #> '{display_preferences,visible_columns}') = 'array'
  and saved_state.state #> '{display_preferences,visible_columns}' @> '["publication_source"]'::jsonb;

alter table public.accounts
  alter column recipe_column_order set default array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state', 'enthusiasm',
    'verdict', 'reason', 'occasion_details', 'serves', 'equipment', 'food_type',
    'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes',
    'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
    'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
    'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
    'updated_at', 'pairs_with', 'opinion', 'citation'
  ]::text[],
  alter column recipe_hidden_columns set default array[
    'publication_page', 'recipe_url', 'state', 'enthusiasm', 'verdict', 'reason',
    'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
    'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
    'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
    'rest_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation'
  ]::text[];

alter table public.accounts
  add constraint accounts_recipe_column_order_check
  check (
    pg_catalog.cardinality(recipe_column_order) = 31
    and pg_catalog.array_position(recipe_column_order, null) is null
    and recipe_column_order @> array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'enthusiasm',
      'verdict', 'reason', 'occasion_details', 'serves', 'equipment', 'food_type',
      'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes',
      'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
      'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'citation'
    ]::text[]
    and recipe_column_order <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'enthusiasm',
      'verdict', 'reason', 'occasion_details', 'serves', 'equipment', 'food_type',
      'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes',
      'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
      'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'citation'
    ]::text[]
  ),
  add constraint accounts_recipe_hidden_columns_check
  check (public.is_valid_recipe_hidden_columns(recipe_hidden_columns));

create or replace function public.update_recipe_column_order(p_column_order text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := (select auth.uid());
  v_allowed_columns text[] := array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state', 'enthusiasm',
    'verdict', 'reason', 'occasion_details', 'serves', 'equipment', 'food_type',
    'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes',
    'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
    'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
    'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
    'updated_at', 'pairs_with', 'opinion', 'citation'
  ];
begin
  if v_account_id is null then
    raise exception 'Authentication required';
  end if;

  if p_column_order is null
    or pg_catalog.cardinality(p_column_order) <> pg_catalog.cardinality(v_allowed_columns)
    or pg_catalog.array_position(p_column_order, null) is not null
    or not (p_column_order @> v_allowed_columns and p_column_order <@ v_allowed_columns) then
    raise exception 'Invalid recipe column order';
  end if;

  update public.accounts
  set recipe_column_order = p_column_order
  where id = v_account_id;

  if not found then
    raise exception 'Account not found';
  end if;
end;
$$;

revoke all on function public.update_recipe_column_order(text[]) from public, anon;
grant execute on function public.update_recipe_column_order(text[]) to authenticated;

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
  field_name text := filter->>'field';
  operator_name text := filter->>'operator';
  expected_values text[];
  actual_values text[];
  text_value text;
begin
  if field_name in ('publication_page', 'recipe_url', 'citation') then
    if field_name = 'publication_page' then
      select recipe.publication_page::text into text_value
      from public.recipes as recipe
      where recipe.account_id = target_account_id and recipe.id = target_recipe_id;
    elsif field_name = 'recipe_url' then
      select recipe.recipe_url into text_value
      from public.recipes as recipe
      where recipe.account_id = target_account_id and recipe.id = target_recipe_id;
    else
      select pg_catalog.string_agg(reference.display_text, ', ' order by reference.position)
      into text_value
      from public.recipe_references as reference
      where reference.account_id = target_account_id
        and reference.recipe_id = target_recipe_id
        and reference.reference_type = 'printed_citation';
    end if;

    if operator_name = 'in' then
      select coalesce(pg_catalog.array_agg(pg_catalog.lower(item.value)), '{}'::text[])
      into expected_values
      from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);
      if field_name = 'citation' then
        select coalesce(pg_catalog.array_agg(pg_catalog.lower(reference.display_text)), '{}'::text[])
        into actual_values
        from public.recipe_references as reference
        where reference.account_id = target_account_id
          and reference.recipe_id = target_recipe_id
          and reference.reference_type = 'printed_citation';
        return actual_values && expected_values
          or (pg_catalog.cardinality(actual_values) = 0 and '__blank__' = any(expected_values));
      end if;
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

  return private.recipe_search_filter_matches_before_set_operators(
    target_account_id,
    target_recipe_id,
    filter
  );
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
      'publication_author', 'opinion', 'publication_source', 'publication_page', 'recipe_url',
      'citation', 'state', 'food_type', 'verdict', 'enthusiasm', 'publication_id', 'meal_type',
      'cuisine', 'equipment', 'ingredient', 'tag', 'serves', 'prep_time_minutes',
      'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
      'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
      'total_time_minutes', 'created_at', 'updated_at'
    );
    if not allowed_field then
      raise exception 'Unsupported recipe filter field.' using errcode = '22023';
    end if;

    if field_name in ('name', 'opinion', 'publication_source', 'publication_page', 'recipe_url', 'citation')
      and operator_name = 'in' then
      if pg_catalog.jsonb_typeof(filter->'value') <> 'array'
        or pg_catalog.jsonb_array_length(filter->'value') > 500
        or exists (
          select 1 from pg_catalog.jsonb_array_elements(filter->'value') as item(value)
          where pg_catalog.jsonb_typeof(item.value) <> 'string'
        ) then
        raise exception 'Column value filters require an array of at most 500 strings.'
          using errcode = '22023';
      end if;
    elsif field_name in (
      'name', 'notes_markdown', 'reason', 'occasion_details', 'publication_name',
      'publication_author', 'publication_source', 'publication_page', 'recipe_url', 'citation'
    ) then
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
        raise exception 'Enum filters require Is or Isn''t and an array of at most 500 values.'
          using errcode = '22023';
      end if;
      if field_name = 'state' and exists (
        select 1 from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value)
        where item.value not in ('want_to_try', 'tried', 'will_not_try')
      ) then
        raise exception 'Unsupported recipe state filter value.' using errcode = '22023';
      end if;
    elsif field_name in ('meal_type', 'cuisine', 'equipment', 'ingredient', 'tag') then
      if operator_name not in ('is', 'is_not', 'contains_any', 'contains_all', 'does_not_contain')
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
    'meal_type', 'food_type', 'publication_source', 'publication_page', 'recipe_url', 'citation'
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
    union all
    select coalesce(recipe.publication_page::text, '__blank__'),
      coalesce(recipe.publication_page::text, 'No page'), count(*)
    from matching_recipes as recipe where p_facet_field = 'publication_page'
    group by recipe.publication_page
    union all
    select coalesce(recipe.recipe_url, '__blank__'),
      coalesce(recipe.recipe_url, 'No URL'), count(*)
    from matching_recipes as recipe where p_facet_field = 'recipe_url'
    group by recipe.recipe_url
    union all
    select coalesce(reference.display_text, '__blank__'),
      coalesce(reference.display_text, 'No citation'), count(distinct recipe.id)
    from matching_recipes as recipe
    left join public.recipe_references as reference
      on reference.account_id = recipe.account_id and reference.recipe_id = recipe.id
      and reference.reference_type = 'printed_citation'
    where p_facet_field = 'citation'
    group by reference.display_text
  )
  select facet_rows.value, facet_rows.label, facet_rows.value_count
  from facet_rows order by facet_rows.label collate "C";
end;
$$;

revoke all on function public.recipe_search_facet_values(text, jsonb, text, uuid)
  from public, anon;
grant execute on function public.recipe_search_facet_values(text, jsonb, text, uuid)
  to authenticated;