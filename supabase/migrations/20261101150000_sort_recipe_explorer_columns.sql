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
  if normalized_sort_key not in (
    'relevance', 'name', 'publication', 'publication_page', 'recipe_url', 'state',
    'occasion_details', 'serves', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes',
    'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
    'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
    'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation'
  ) then
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

  if normalized_query is not null then
    parsed_query := websearch_to_tsquery('english', normalized_query);
  end if;

  return query
  with matched_recipes as (
    select
      recipe.id as recipe_id,
      recipe.name as recipe_name,
      recipe.state,
      recipe.total_time_minutes,
      publication.name as publication_name,
      case when normalized_query is null then 0::real
        else ts_rank(search_document.search_vector, parsed_query) end as rank,
      count(*) over () as total_count,
      case normalized_sort_key
        when 'name' then recipe.name
        when 'publication' then publication.name
        when 'publication_page' then recipe.publication_page
        when 'recipe_url' then recipe.recipe_url
        when 'state' then recipe.state
        when 'occasion_details' then recipe.occasion_details
        when 'equipment' then picklist_columns.equipment
        when 'food_type' then food_type.display_value
        when 'meal_type' then picklist_columns.meal_type
        when 'cuisine' then picklist_columns.cuisine
        when 'tags' then tag_columns.tags
        when 'main_ingredients' then ingredient_columns.main_ingredients
        when 'pairs_with' then pairing_columns.pairs_with
        when 'opinion' then case recipe.state
          when 'want_to_try' then enthusiasm.display_value
          when 'tried' then verdict.display_value
          else recipe.reason
        end
        when 'citation' then citation_columns.citation
      end as sort_text,
      case normalized_sort_key
        when 'serves' then recipe.serves::numeric
        when 'prep_time_minutes' then recipe.prep_time_minutes::numeric
        when 'mixing_time_minutes' then recipe.mixing_time_minutes::numeric
        when 'marinate_time_minutes' then recipe.marinate_time_minutes::numeric
        when 'chill_time_minutes' then recipe.chill_time_minutes::numeric
        when 'freeze_time_minutes' then recipe.freeze_time_minutes::numeric
        when 'cook_time_minutes' then recipe.cook_time_minutes::numeric
        when 'bake_time_minutes' then recipe.bake_time_minutes::numeric
        when 'cooling_time_minutes' then recipe.cooling_time_minutes::numeric
        when 'rest_time_minutes' then recipe.rest_time_minutes::numeric
        when 'total_time_minutes' then recipe.total_time_minutes::numeric
      end as sort_number,
      case normalized_sort_key
        when 'created_at' then recipe.created_at
        when 'updated_at' then recipe.updated_at
      end as sort_timestamp
    from public.recipes as recipe
    join public.recipe_search_documents as search_document
      on search_document.account_id = recipe.account_id and search_document.recipe_id = recipe.id
    left join public.publications as publication
      on publication.account_id = recipe.account_id and publication.id = recipe.publication_id
    left join public.recipe_picklist_values as food_type
      on food_type.account_id = recipe.account_id and food_type.id = recipe.food_type_id
    left join public.recipe_picklist_values as enthusiasm
      on enthusiasm.account_id = recipe.account_id and enthusiasm.id = recipe.enthusiasm_id
    left join public.recipe_picklist_values as verdict
      on verdict.account_id = recipe.account_id and verdict.id = recipe.verdict_id
    left join lateral (
      select
        pg_catalog.string_agg(value.display_value, ', ' order by value.display_value)
          filter (where assignment.category = 'equipment') as equipment,
        pg_catalog.string_agg(value.display_value, ', ' order by value.display_value)
          filter (where assignment.category = 'meal_type') as meal_type,
        pg_catalog.string_agg(value.display_value, ', ' order by value.display_value)
          filter (where assignment.category = 'cuisine') as cuisine
      from public.recipe_picklist_assignments as assignment
      join public.recipe_picklist_values as value
        on value.account_id = assignment.account_id and value.id = assignment.picklist_value_id
      where assignment.account_id = recipe.account_id and assignment.recipe_id = recipe.id
    ) as picklist_columns on true
    left join lateral (
      select pg_catalog.string_agg(tag.name, ', ' order by pg_catalog.lower(tag.name), tag.name) as tags
      from public.recipe_tags as assignment
      join public.tags as tag
        on tag.account_id = assignment.account_id and tag.id = assignment.tag_id
      where assignment.account_id = recipe.account_id and assignment.recipe_id = recipe.id
    ) as tag_columns on true
    left join lateral (
      select pg_catalog.string_agg(ingredient.name, ', ' order by pg_catalog.lower(ingredient.name), ingredient.name)
        as main_ingredients
      from public.recipe_ingredients as recipe_ingredient
      join public.ingredients as ingredient
        on ingredient.account_id = recipe_ingredient.account_id
        and ingredient.id = recipe_ingredient.ingredient_id
      where recipe_ingredient.account_id = recipe.account_id
        and recipe_ingredient.recipe_id = recipe.id
        and recipe_ingredient.is_main
    ) as ingredient_columns on true
    left join lateral (
      select pg_catalog.string_agg(pairing.display_text, ', ' order by pairing.position) as pairs_with
      from public.recipe_pairings as pairing
      where pairing.account_id = recipe.account_id and pairing.source_recipe_id = recipe.id
    ) as pairing_columns on true
    left join lateral (
      select pg_catalog.string_agg(reference.display_text, ', ' order by reference.position) as citation
      from public.recipe_references as reference
      where reference.account_id = recipe.account_id
        and reference.recipe_id = recipe.id
        and reference.reference_type = 'printed_citation'
    ) as citation_columns on true
    where recipe.trashed_at is null
      and (p_publication_id is null or recipe.publication_id = p_publication_id)
      and (normalized_query is null or search_document.search_vector @@ parsed_query)
      and not exists (
        select 1 from pg_catalog.jsonb_array_elements(p_filters) as filter_row(value)
        where not private.recipe_search_filter_matches(recipe.account_id, recipe.id, filter_row.value)
      )
  )
  select
    matched.recipe_id,
    matched.recipe_name,
    matched.state,
    matched.total_time_minutes,
    matched.publication_name,
    matched.rank,
    matched.total_count
  from matched_recipes as matched
  order by
    case when normalized_sort_key = 'relevance' then matched.rank end desc nulls last,
    case when p_sort_direction = 'asc' then matched.sort_text end asc nulls last,
    case when p_sort_direction = 'desc' then matched.sort_text end desc nulls last,
    case when p_sort_direction = 'asc' then matched.sort_number end asc nulls last,
    case when p_sort_direction = 'desc' then matched.sort_number end desc nulls last,
    case when p_sort_direction = 'asc' then matched.sort_timestamp end asc nulls last,
    case when p_sort_direction = 'desc' then matched.sort_timestamp end desc nulls last,
    matched.recipe_name, matched.recipe_id
  limit p_limit offset p_offset;
end;
$$;

grant execute on function public.search_recipes(text, integer, integer, jsonb, text, text, uuid)
  to authenticated;

do $$
declare
  function_source text;
  old_expression constant text :=
    'p_state->>''sort'' not in (''relevance'', ''name'', ''state'', ''total_time_minutes'', ''created_at'', ''updated_at'')';
  new_expression constant text :=
    'p_state->>''sort'' not in (''relevance'', ''name'', ''publication'', ''publication_page'', ''recipe_url'', ''state'', ''occasion_details'', ''serves'', ''equipment'', ''food_type'', ''meal_type'', ''cuisine'', ''tags'', ''main_ingredients'', ''prep_time_minutes'', ''mixing_time_minutes'', ''marinate_time_minutes'', ''chill_time_minutes'', ''freeze_time_minutes'', ''cook_time_minutes'', ''bake_time_minutes'', ''cooling_time_minutes'', ''rest_time_minutes'', ''total_time_minutes'', ''created_at'', ''updated_at'', ''pairs_with'', ''opinion'', ''citation'')';
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_v1(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_expression) > 0 then
    execute pg_catalog.replace(function_source, old_expression, new_expression);
  elsif pg_catalog.strpos(function_source, new_expression) = 0 then
    raise exception 'Expected recipe explorer sort validation was not found';
  end if;
end;
$$;