create or replace function private.rewrite_recipe_picklist_references(
  p_account_id uuid,
  p_category text,
  p_source_ids uuid[],
  p_target_id uuid,
  p_clear boolean
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_recipe_ids uuid[];
  affected_recipe_id uuid;
  before_ingredients jsonb;
begin
  select coalesce(
    array_agg(distinct reference_rows.recipe_id order by reference_rows.recipe_id),
    array[]::uuid[]
  )
  into affected_recipe_ids
  from (
    select recipe.id as recipe_id
    from public.recipes as recipe
    where recipe.account_id = p_account_id
      and p_category = 'food_type'
      and recipe.food_type_id = any(p_source_ids)
    union all
    select recipe.id
    from public.recipes as recipe
    where recipe.account_id = p_account_id
      and p_category = 'verdict'
      and recipe.verdict_id = any(p_source_ids)
    union all
    select recipe.id
    from public.recipes as recipe
    where recipe.account_id = p_account_id
      and p_category = 'enthusiasm'
      and recipe.enthusiasm_id = any(p_source_ids)
    union all
    select assignment.recipe_id
    from public.recipe_picklist_assignments as assignment
    where assignment.account_id = p_account_id
      and assignment.category = p_category
      and p_category in ('meal_type', 'cuisine', 'equipment')
      and assignment.picklist_value_id = any(p_source_ids)
    union all
    select recipe_ingredient.recipe_id
    from public.recipe_ingredient_measurements as measurement
    join public.recipe_ingredients as recipe_ingredient
      on recipe_ingredient.account_id = measurement.account_id
      and recipe_ingredient.id = measurement.recipe_ingredient_id
    where measurement.account_id = p_account_id
      and measurement.picklist_value_id = any(p_source_ids)
      and p_category in ('informal_unit', 'unmeasured_phrase')
  ) as reference_rows;

  perform recipe.id
  from public.recipes as recipe
  where recipe.account_id = p_account_id
    and recipe.id = any(affected_recipe_ids)
  order by recipe.id
  for update;

  if p_target_id is null and not p_clear then
    return affected_recipe_ids;
  end if;

  foreach affected_recipe_id in array affected_recipe_ids loop
    select private.recipe_ingredient_history_snapshot(p_account_id, affected_recipe_id)
    into before_ingredients;
    perform pg_catalog.set_config(
      'app.recipe_ingredients_before',
      before_ingredients::text,
      true
    );

    if p_category = 'food_type' then
      update public.recipes
      set food_type_id = case when p_clear then null else p_target_id end,
          version = version + 1
      where account_id = p_account_id and id = affected_recipe_id;
    elsif p_category = 'verdict' then
      update public.recipes
      set verdict_id = case when p_clear then null else p_target_id end,
          occasion_details = case when p_clear then null else occasion_details end,
          version = version + 1
      where account_id = p_account_id and id = affected_recipe_id;
    elsif p_category = 'enthusiasm' then
      update public.recipes
      set enthusiasm_id = case when p_clear then null else p_target_id end,
          occasion_details = case when p_clear then null else occasion_details end,
          version = version + 1
      where account_id = p_account_id and id = affected_recipe_id;
    elsif p_category in ('meal_type', 'cuisine', 'equipment') then
      if p_clear then
        delete from public.recipe_picklist_assignments as assignment
        where assignment.account_id = p_account_id
          and assignment.recipe_id = affected_recipe_id
          and assignment.category = p_category
          and assignment.picklist_value_id = any(p_source_ids);
      else
        delete from public.recipe_picklist_assignments as source
        where source.account_id = p_account_id
          and source.recipe_id = affected_recipe_id
          and source.category = p_category
          and source.picklist_value_id = any(p_source_ids)
          and exists (
            select 1
            from public.recipe_picklist_assignments as target
            where target.account_id = p_account_id
              and target.recipe_id = affected_recipe_id
              and target.category = p_category
              and target.picklist_value_id = p_target_id
          );
        update public.recipe_picklist_assignments as assignment
        set picklist_value_id = p_target_id
        where assignment.account_id = p_account_id
          and assignment.recipe_id = affected_recipe_id
          and assignment.category = p_category
          and assignment.picklist_value_id = any(p_source_ids);
      end if;
      update public.recipes
      set version = version + 1
      where account_id = p_account_id and id = affected_recipe_id;
    elsif p_category in ('informal_unit', 'unmeasured_phrase') then
      update public.recipe_ingredient_measurements as measurement
      set picklist_value_id = p_target_id
      from public.recipe_ingredients as recipe_ingredient
      where measurement.account_id = p_account_id
        and recipe_ingredient.account_id = p_account_id
        and recipe_ingredient.id = measurement.recipe_ingredient_id
        and recipe_ingredient.recipe_id = affected_recipe_id
        and measurement.picklist_value_id = any(p_source_ids);
      update public.recipes
      set version = version + 1
      where account_id = p_account_id and id = affected_recipe_id;
    end if;
  end loop;

  return affected_recipe_ids;
end;
$$;

revoke all on function private.rewrite_recipe_picklist_references(
  uuid, text, uuid[], uuid, boolean
) from public, anon, authenticated;
