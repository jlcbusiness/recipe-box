alter function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  rename to recipe_search_filter_matches_with_source_columns;

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
  field_value text;
begin
  if field_name in ('meal_type', 'cuisine', 'equipment', 'ingredient', 'tag')
    and operator_name in ('is', 'is_not') then
    select coalesce(pg_catalog.array_agg(item.value), '{}'::text[])
    into expected_values
    from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);

    if field_name = 'ingredient' then
      select coalesce(pg_catalog.array_agg(assignment.ingredient_id::text), '{}'::text[])
      into actual_values
      from public.recipe_ingredients as assignment
      where assignment.account_id = target_account_id
        and assignment.recipe_id = target_recipe_id;
    elsif field_name = 'tag' then
      select coalesce(pg_catalog.array_agg(assignment.tag_id::text), '{}'::text[])
      into actual_values
      from public.recipe_tags as assignment
      where assignment.account_id = target_account_id
        and assignment.recipe_id = target_recipe_id;
    else
      select coalesce(pg_catalog.array_agg(assignment.picklist_value_id::text), '{}'::text[])
      into actual_values
      from public.recipe_picklist_assignments as assignment
      where assignment.account_id = target_account_id
        and assignment.recipe_id = target_recipe_id
        and assignment.category = field_name;
    end if;

    return case operator_name
      when 'is' then actual_values @> expected_values and actual_values <@ expected_values
      else not (actual_values @> expected_values and actual_values <@ expected_values)
    end;
  end if;

  if field_name = 'publication_id' and operator_name = 'not_in' then
    select recipe.publication_id::text
    into field_value
    from public.recipes as recipe
    where recipe.account_id = target_account_id
      and recipe.id = target_recipe_id;

    select coalesce(pg_catalog.array_agg(item.value), '{}'::text[])
    into expected_values
    from pg_catalog.jsonb_array_elements_text(filter->'value') as item(value);

    return (field_value is null and not ('__recipe_tin__' = any(expected_values)))
      or (field_value is not null and not (field_value = any(expected_values)));
  end if;

  return private.recipe_search_filter_matches_with_source_columns(
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