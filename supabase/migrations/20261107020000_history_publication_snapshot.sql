create or replace function private.recipe_picklist_snapshot(p_account_id uuid, p_recipe_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'food_type', (
      select value.value
      from public.recipe_picklist_values as value
      where value.account_id = recipe.account_id
        and value.id = recipe.food_type_id
    ),
    'verdict', (
      select value.value
      from public.recipe_picklist_values as value
      where value.account_id = recipe.account_id
        and value.id = recipe.verdict_id
    ),
    'enthusiasm', (
      select value.value
      from public.recipe_picklist_values as value
      where value.account_id = recipe.account_id
        and value.id = recipe.enthusiasm_id
    ),
    'publication', (
      select publication.name
      from public.publications as publication
      where publication.account_id = recipe.account_id
        and publication.id = recipe.publication_id
    ),
    'meal_type', coalesce((
      select jsonb_agg(value.value order by value.sort_order, value.id)
      from public.recipe_picklist_assignments as assignment
      join public.recipe_picklist_values as value
        on value.account_id = assignment.account_id
        and value.id = assignment.picklist_value_id
      where assignment.account_id = recipe.account_id
        and assignment.recipe_id = recipe.id
        and assignment.category = 'meal_type'
    ), '[]'::jsonb),
    'cuisine', coalesce((
      select jsonb_agg(value.value order by value.sort_order, value.id)
      from public.recipe_picklist_assignments as assignment
      join public.recipe_picklist_values as value
        on value.account_id = assignment.account_id
        and value.id = assignment.picklist_value_id
      where assignment.account_id = recipe.account_id
        and assignment.recipe_id = recipe.id
        and assignment.category = 'cuisine'
    ), '[]'::jsonb),
    'equipment', coalesce((
      select jsonb_agg(value.value order by value.sort_order, value.id)
      from public.recipe_picklist_assignments as assignment
      join public.recipe_picklist_values as value
        on value.account_id = assignment.account_id
        and value.id = assignment.picklist_value_id
      where assignment.account_id = recipe.account_id
        and assignment.recipe_id = recipe.id
        and assignment.category = 'equipment'
    ), '[]'::jsonb)
  )
  from public.recipes as recipe
  where recipe.account_id = p_account_id and recipe.id = p_recipe_id;
$$;

revoke all on function private.recipe_picklist_snapshot(uuid, uuid)
  from public, anon, authenticated;