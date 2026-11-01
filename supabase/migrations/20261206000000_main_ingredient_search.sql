alter function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  rename to recipe_search_filter_matches_before_main_ingredient;

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
  main_ingredient_names text;
begin
  if field_name = 'main_ingredient' then
    select coalesce(pg_catalog.array_agg(item.value), '{}'::text[])
    into expected_values
    from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);

    select coalesce(pg_catalog.array_agg(distinct assignment.ingredient_id::text), '{}'::text[])
    into actual_values
    from public.recipe_ingredients as assignment
    where assignment.account_id = target_account_id
      and assignment.recipe_id = target_recipe_id
      and assignment.is_main;

    return case operator_name
      when 'is' then actual_values @> expected_values and actual_values <@ expected_values
      when 'is_not' then not (actual_values @> expected_values and actual_values <@ expected_values)
      when 'contains_any' then actual_values && expected_values
      when 'contains_all' then actual_values @> expected_values
      else not (actual_values && expected_values)
    end;
  end if;

  -- Internal filter behind Search's "Main ingredients only" option. It uses the
  -- same English text parsing as the search bar so stems and phrases behave alike.
  if field_name = 'main_ingredient_text' then
    select pg_catalog.string_agg(ingredient.name, ' ')
    into main_ingredient_names
    from public.recipe_ingredients as assignment
    join public.ingredients as ingredient
      on ingredient.account_id = assignment.account_id
      and ingredient.id = assignment.ingredient_id
    where assignment.account_id = target_account_id
      and assignment.recipe_id = target_recipe_id
      and assignment.is_main;

    if main_ingredient_names is null then
      return false;
    end if;

    return pg_catalog.to_tsvector('english'::regconfig, main_ingredient_names)
      @@ pg_catalog.websearch_to_tsquery('english'::regconfig, filter->>'value');
  end if;

  return private.recipe_search_filter_matches_before_main_ingredient(
    target_account_id,
    target_recipe_id,
    filter
  );
end;
$$;

revoke all on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  to authenticated;
revoke all on function private.recipe_search_filter_matches_before_main_ingredient(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.recipe_search_filter_matches_before_main_ingredient(uuid, uuid, jsonb)
  to authenticated;

do $$
declare
  function_source text;
  old_allowed_fields constant text :=
    $pattern$'created_at', 'updated_at', 'score', 'starred', 'hearted'$pattern$;
  new_allowed_fields constant text :=
    $pattern$'created_at', 'updated_at', 'score', 'starred', 'hearted',
      'main_ingredient', 'main_ingredient_text'$pattern$;
  old_multi_fields constant text :=
    $pattern$    elsif field_name in ('meal_type', 'cuisine', 'equipment', 'ingredient', 'tag') then$pattern$;
  new_multi_fields constant text :=
    $pattern$    elsif field_name = 'main_ingredient_text' then
      if operator_name is distinct from 'matches'
        or pg_catalog.jsonb_typeof(filter->'value') is distinct from 'string'
        or pg_catalog.char_length(pg_catalog.btrim(filter->>'value')) = 0
        or pg_catalog.char_length(filter->>'value') > 500 then
        raise exception 'Main ingredient text filters require Matches and 1 to 500 characters.'
          using errcode = '22023';
      end if;
    elsif field_name in ('meal_type', 'cuisine', 'equipment', 'ingredient', 'main_ingredient', 'tag') then$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes(text,integer,integer,jsonb,text,text,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_allowed_fields) = 0 then
    raise exception 'Expected recipe filter field allowlist was not found';
  end if;
  if pg_catalog.strpos(function_source, old_multi_fields) = 0 then
    raise exception 'Expected recipe multi-select filter validation was not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_allowed_fields, new_allowed_fields);
  function_source := pg_catalog.replace(function_source, old_multi_fields, new_multi_fields);
  execute function_source;
end;
$$;

notify pgrst, 'reload schema';
