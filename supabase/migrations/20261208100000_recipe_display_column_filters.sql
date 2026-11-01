create function private.recipe_explorer_column_value(
  target_account_id uuid,
  target_recipe_id uuid,
  p_column_key text
)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case p_column_key
    when 'occasion_details' then recipe.occasion_details
    when 'serves' then pg_catalog.trim_scale(recipe.serves)::text
    when 'makes' then case
      when recipe.makes_quantity is not null and recipe.makes_thing is not null
        then pg_catalog.trim_scale(recipe.makes_quantity)::text || ' ' || recipe.makes_thing
    end
    when 'equipment' then (
      select pg_catalog.string_agg(value.display_value, ', ' order by value.display_value)
      from public.recipe_picklist_assignments as assignment
      join public.recipe_picklist_values as value
        on value.account_id = assignment.account_id and value.id = assignment.picklist_value_id
      where assignment.account_id = recipe.account_id
        and assignment.recipe_id = recipe.id
        and assignment.category = 'equipment'
    )
    when 'cuisine' then (
      select pg_catalog.string_agg(value.display_value, ', ' order by value.display_value)
      from public.recipe_picklist_assignments as assignment
      join public.recipe_picklist_values as value
        on value.account_id = assignment.account_id and value.id = assignment.picklist_value_id
      where assignment.account_id = recipe.account_id
        and assignment.recipe_id = recipe.id
        and assignment.category = 'cuisine'
    )
    when 'tags' then (
      select pg_catalog.string_agg(
        tag.name,
        ', ' order by pg_catalog.lower(tag.name), tag.name
      )
      from public.recipe_tags as assignment
      join public.tags as tag
        on tag.account_id = assignment.account_id and tag.id = assignment.tag_id
      where assignment.account_id = recipe.account_id
        and assignment.recipe_id = recipe.id
    )
    when 'main_ingredients' then (
      select pg_catalog.string_agg(
        ingredient.name,
        ', ' order by recipe_ingredient.position
      )
      from public.recipe_ingredients as recipe_ingredient
      join public.ingredients as ingredient
        on ingredient.account_id = recipe_ingredient.account_id
        and ingredient.id = recipe_ingredient.ingredient_id
      where recipe_ingredient.account_id = recipe.account_id
        and recipe_ingredient.recipe_id = recipe.id
        and recipe_ingredient.is_main
    )
    when 'prep_time_minutes' then recipe.prep_time_minutes::text
    when 'mixing_time_minutes' then recipe.mixing_time_minutes::text
    when 'marinate_time_minutes' then recipe.marinate_time_minutes::text
    when 'chill_time_minutes' then recipe.chill_time_minutes::text
    when 'freeze_time_minutes' then recipe.freeze_time_minutes::text
    when 'cook_time_minutes' then recipe.cook_time_minutes::text
    when 'bake_time_minutes' then recipe.bake_time_minutes::text
    when 'cooling_time_minutes' then recipe.cooling_time_minutes::text
    when 'rest_time_minutes' then recipe.rest_time_minutes::text
    when 'created_at' then recipe.created_at::text
    when 'updated_at' then recipe.updated_at::text
    when 'pairs_with' then (
      select pg_catalog.string_agg(pairing.display_text, ', ' order by pairing.position)
      from public.recipe_pairings as pairing
      where pairing.account_id = recipe.account_id
        and pairing.source_recipe_id = recipe.id
    )
    when 'score' then recipe.score::text
    when 'starred' then case when recipe.is_starred then 'true' end
    when 'hearted' then case when recipe.is_hearted then 'true' end
    when 'calories' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'calories'
    when 'total_fat' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'total_fat'
    when 'saturated_fat' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'saturated_fat'
    when 'trans_fat' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'trans_fat'
    when 'cholesterol' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'cholesterol'
    when 'sodium' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'sodium'
    when 'total_carbohydrate' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'total_carbohydrate'
    when 'dietary_fiber' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'dietary_fiber'
    when 'total_sugars' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'total_sugars'
    when 'added_sugars' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'added_sugars'
    when 'protein' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'protein'
    when 'vitamin_d' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'vitamin_d'
    when 'calcium' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'calcium'
    when 'iron' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'iron'
    when 'potassium' then private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'potassium'
  end
  from public.recipes as recipe
  where recipe.account_id = target_account_id
    and recipe.id = target_recipe_id
    and recipe.trashed_at is null
$$;

revoke all on function private.recipe_explorer_column_value(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function private.recipe_explorer_column_value(uuid, uuid, text)
  to authenticated;

alter function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  rename to recipe_search_filter_matches_before_display_column_filters;

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
  column_key text;
  column_value text;
begin
  if field_name like 'column_%' then
    column_key := pg_catalog.substr(field_name, 8);
    if column_key not in (
      'occasion_details', 'serves', 'makes', 'equipment', 'cuisine', 'tags',
      'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
      'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
      'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
      'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
      'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes',
      'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
      'created_at', 'updated_at', 'pairs_with', 'score', 'starred', 'hearted'
    ) then
      return false;
    end if;

    column_value := nullif(
      private.recipe_explorer_column_value(target_account_id, target_recipe_id, column_key),
      ''
    );
    return exists (
      select 1
      from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value)
      where (column_value is null and item.value = '__blank__')
        or column_value = item.value
    );
  end if;

  return private.recipe_search_filter_matches_before_display_column_filters(
    target_account_id,
    target_recipe_id,
    filter
  );
end;
$$;

revoke all on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  to authenticated;
revoke all on function private.recipe_search_filter_matches_before_display_column_filters(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.recipe_search_filter_matches_before_display_column_filters(uuid, uuid, jsonb)
  to authenticated;

do $$
declare
  function_source text;
  old_field_prefix constant text :=
    $pattern$'main_ingredient', 'main_ingredient_text', 'calories'$pattern$;
  new_field_prefix constant text :=
    $pattern$'main_ingredient', 'main_ingredient_text',
      'column_occasion_details', 'column_serves', 'column_makes', 'column_equipment',
      'column_cuisine', 'column_tags', 'column_main_ingredients', 'column_calories',
      'column_total_fat', 'column_saturated_fat', 'column_trans_fat',
      'column_cholesterol', 'column_sodium', 'column_total_carbohydrate',
      'column_dietary_fiber', 'column_total_sugars', 'column_added_sugars',
      'column_protein', 'column_vitamin_d', 'column_calcium', 'column_iron',
      'column_potassium', 'column_prep_time_minutes', 'column_mixing_time_minutes',
      'column_marinate_time_minutes', 'column_chill_time_minutes',
      'column_freeze_time_minutes', 'column_cook_time_minutes',
      'column_bake_time_minutes', 'column_cooling_time_minutes',
      'column_rest_time_minutes', 'column_created_at', 'column_updated_at',
      'column_pairs_with', 'column_score', 'column_starred', 'column_hearted',
      'calories'$pattern$;
  old_filter_validation constant text :=
    $pattern$    if field_name in ('name', 'opinion', 'publication_source', 'publication_page', 'recipe_url', 'citation')
      and operator_name = 'in' then$pattern$;
  new_filter_validation constant text :=
    $pattern$    if field_name like 'column_%' then
      if operator_name is distinct from 'in'
        or pg_catalog.jsonb_typeof(filter->'value') is distinct from 'array' then
        raise exception 'Column value filters require an array of at most 500 strings.'
          using errcode = '22023';
      end if;
      if pg_catalog.jsonb_array_length(filter->'value') > 500
        or exists (
          select 1 from pg_catalog.jsonb_array_elements(filter->'value') as item(value)
          where pg_catalog.jsonb_typeof(item.value) <> 'string'
        ) then
        raise exception 'Column value filters require an array of at most 500 strings.'
          using errcode = '22023';
      end if;
    elsif field_name in ('name', 'opinion', 'publication_source', 'publication_page', 'recipe_url', 'citation')
      and operator_name = 'in' then$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes(text,integer,integer,jsonb,text,text,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_field_prefix) = 0 then
    raise exception 'Expected recipe search field allowlist was not found';
  end if;
  if pg_catalog.strpos(function_source, old_filter_validation) = 0 then
    raise exception 'Expected recipe search filter validation was not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_field_prefix, new_field_prefix);
  function_source := pg_catalog.replace(function_source, old_filter_validation, new_filter_validation);
  execute function_source;
end;
$$;

create function public.recipe_search_column_facet_values(
  p_query text default null,
  p_filters jsonb default '[]'::jsonb,
  p_column_keys text[] default '{}',
  p_publication_id uuid default null
)
returns table (column_key text, facet_value text, recipe_count bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_query text := nullif(pg_catalog.btrim(coalesce(p_query, '')), '');
  parsed_query tsquery;
begin
  if pg_catalog.char_length(coalesce(p_query, '')) > 500 then
    raise exception 'Search text exceeds 500 characters.' using errcode = '22023';
  end if;
  if p_column_keys is null
    or pg_catalog.cardinality(p_column_keys) > 40
    or pg_catalog.array_position(p_column_keys, null) is not null
    or not (p_column_keys <@ array[
      'occasion_details', 'serves', 'makes', 'equipment', 'cuisine', 'tags',
      'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
      'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
      'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
      'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
      'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes',
      'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
      'created_at', 'updated_at', 'pairs_with', 'score', 'starred', 'hearted'
    ]::text[])
    or pg_catalog.cardinality(p_column_keys) <> (
      select pg_catalog.count(distinct column_key.value)
      from pg_catalog.unnest(p_column_keys) as column_key(value)
    ) then
    raise exception 'Unsupported recipe display column facet.' using errcode = '22023';
  end if;

  perform result.recipe_id
  from public.search_recipes(p_query, 1, 0, p_filters, 'name', 'asc', p_publication_id) as result;

  if normalized_query is not null then
    parsed_query := websearch_to_tsquery('english', normalized_query);
  end if;

  return query
  with requested_columns as (
    select column_key.value
    from pg_catalog.unnest(p_column_keys) as column_key(value)
  ),
  matching_recipes as (
    select recipe.account_id, recipe.id, requested_columns.value as column_key
    from public.recipes as recipe
    join public.recipe_search_documents as search_document
      on search_document.account_id = recipe.account_id
      and search_document.recipe_id = recipe.id
    cross join requested_columns
    where recipe.trashed_at is null
      and (p_publication_id is null or recipe.publication_id = p_publication_id)
      and (normalized_query is null or search_document.search_vector @@ parsed_query)
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_filters) as filter_row(value)
        where coalesce(filter_row.value->>'field', '')
            <> 'column_' || requested_columns.value
          and not private.recipe_search_filter_matches(
            recipe.account_id,
            recipe.id,
            filter_row.value
          )
      )
  )
  select
    matching_recipes.column_key,
    coalesce(
      nullif(
        private.recipe_explorer_column_value(
          matching_recipes.account_id,
          matching_recipes.id,
          matching_recipes.column_key
        ),
        ''
      ),
      '__blank__'
    ) as facet_value,
    count(*) as recipe_count
  from matching_recipes
  group by matching_recipes.column_key, 2
  order by matching_recipes.column_key, 2;
end;
$$;

revoke all on function public.recipe_search_column_facet_values(text, jsonb, text[], uuid)
  from public, anon;
grant execute on function public.recipe_search_column_facet_values(text, jsonb, text[], uuid)
  to authenticated;

do $$
declare
  function_source text;
  old_find_filters constant text :=
    $pattern$'name', 'publication', 'state', 'total_time_minutes'$pattern$;
  new_find_filters constant text :=
    $pattern$'name', 'publication', 'state', 'visibility', 'total_time_minutes',
          'opinion', 'meal_type', 'food_type', 'publication_page', 'recipe_url',
          'citation', 'occasion_details', 'serves', 'makes', 'equipment', 'cuisine',
          'tags', 'main_ingredients', 'calories', 'total_fat', 'saturated_fat',
          'trans_fat', 'cholesterol', 'sodium', 'total_carbohydrate',
          'dietary_fiber', 'total_sugars', 'added_sugars', 'protein', 'vitamin_d',
          'calcium', 'iron', 'potassium', 'prep_time_minutes', 'mixing_time_minutes',
          'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
          'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
          'rest_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'score',
          'starred', 'hearted', 'publication_source'$pattern$;
  old_publication_filters constant text :=
    $pattern$'name', 'state', 'total_time_minutes', 'opinion', 'meal_type', 'food_type',
            'publication_source'$pattern$;
  new_publication_filters constant text :=
    $pattern$'name', 'state', 'visibility', 'total_time_minutes', 'opinion', 'meal_type',
            'food_type', 'publication_page', 'recipe_url', 'citation',
            'occasion_details', 'serves', 'makes', 'equipment', 'cuisine', 'tags',
            'main_ingredients', 'calories', 'total_fat', 'saturated_fat',
            'trans_fat', 'cholesterol', 'sodium', 'total_carbohydrate',
            'dietary_fiber', 'total_sugars', 'added_sugars', 'protein', 'vitamin_d',
            'calcium', 'iron', 'potassium', 'prep_time_minutes', 'mixing_time_minutes',
            'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes',
            'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
            'rest_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'score',
            'starred', 'hearted', 'publication_source'$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_v1(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_find_filters) = 0 then
    raise exception 'Expected Find column-filter allowlist was not found';
  end if;
  if pg_catalog.strpos(function_source, old_publication_filters) = 0 then
    raise exception 'Expected publication column-filter allowlist was not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_find_filters, new_find_filters);
  function_source := pg_catalog.replace(
    function_source,
    old_publication_filters,
    new_publication_filters
  );
  execute function_source;
end;
$$;

notify pgrst, 'reload schema';
