create function private.nutrition_unit_factor(p_dimension text, p_unit_code text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_dimension
    when 'volume' then case p_unit_code
      when 'tsp' then 4.92892159375
      when 'tbsp' then 14.78676478125
      when 'fl_oz' then 29.5735295625
      when 'cup' then 236.5882365
      when 'pt' then 473.176473
      when 'qt' then 946.352946
      when 'gal' then 3785.411784
      when 'ml' then 1
      when 'l' then 1000
    end
    when 'weight' then case p_unit_code
      when 'oz' then 28.349523125
      when 'lb' then 453.59237
      when 'g' then 1
      when 'kg' then 1000
    end
  end
$$;

create function private.nutrition_physical_amount(
  p_amount numeric,
  p_from_dimension text,
  p_from_unit_code text,
  p_to_dimension text,
  p_to_unit_code text,
  p_density_volume_amount numeric,
  p_density_volume_unit_code text,
  p_density_weight_amount numeric,
  p_density_weight_unit_code text
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  source_factor numeric;
  target_factor numeric;
  density_volume_factor numeric;
  density_weight_factor numeric;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;

  source_factor := private.nutrition_unit_factor(p_from_dimension, p_from_unit_code);
  target_factor := private.nutrition_unit_factor(p_to_dimension, p_to_unit_code);
  if source_factor is null or target_factor is null then
    return null;
  end if;
  if p_from_dimension = p_to_dimension then
    return p_amount * source_factor / target_factor;
  end if;
  if p_from_dimension not in ('volume', 'weight')
    or p_to_dimension not in ('volume', 'weight')
    or p_density_volume_amount is null
    or p_density_weight_amount is null then
    return null;
  end if;

  density_volume_factor := private.nutrition_unit_factor('volume', p_density_volume_unit_code);
  density_weight_factor := private.nutrition_unit_factor('weight', p_density_weight_unit_code);
  if density_volume_factor is null or density_weight_factor is null then
    return null;
  end if;

  if p_from_dimension = 'volume' then
    return (
      (p_amount * source_factor)
      / (p_density_volume_amount * density_volume_factor)
      * (p_density_weight_amount * density_weight_factor)
    ) / target_factor;
  end if;

  return (
    (p_amount * source_factor)
    / (p_density_weight_amount * density_weight_factor)
    * (p_density_volume_amount * density_volume_factor)
  ) / target_factor;
end;
$$;

create function private.nutrition_basis_signature_matches(
  p_signature text,
  p_basis_amount numeric,
  p_basis_dimension text,
  p_basis_unit_code text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  signature_data jsonb;
  significant_scale integer;
begin
  if p_signature is null or p_basis_amount is null or p_basis_amount <= 0 then
    return false;
  end if;

  signature_data := p_signature::jsonb;
  if jsonb_typeof(signature_data) is distinct from 'object' then
    return false;
  end if;

  significant_scale := 13 - floor(log(p_basis_amount))::integer;
  return (signature_data->>'amount')::numeric = round(p_basis_amount, significant_scale)
    and signature_data->>'dimension' = p_basis_dimension
    and signature_data->>'unitCode' = p_basis_unit_code;
exception when others then
  return false;
end;
$$;

create function private.recipe_nutrition_per_serving(
  p_account_id uuid,
  p_recipe_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  recipe_row public.recipes%rowtype;
  ingredient_row record;
  measurement_row record;
  equivalent_row record;
  basis_amount numeric;
  basis_dimension text;
  basis_unit_code text;
  profile_amount_in_basis numeric;
  profile_scale numeric;
  amount_in_basis numeric;
  equivalent_amount_in_basis numeric;
  ingredient_values jsonb;
  total_values jsonb := '{}'::jsonb;
  result_values jsonb := '{}'::jsonb;
  override_entry record;
  nutrient_key text;
  nutrient_amount numeric;
  ingredient_count integer := 0;
  complete boolean := true;
  ingredient_complete boolean;
  stale_override boolean;
  standard_nutrient_keys constant text[] := array[
    'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
    'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
    'vitamin_d', 'calcium', 'iron', 'potassium'
  ];
begin
  select recipe.*
  into recipe_row
  from public.recipes as recipe
  where recipe.account_id = p_account_id
    and recipe.id = p_recipe_id;
  if not found or recipe_row.serves is null or recipe_row.serves <= 0 then
    return '{}'::jsonb;
  end if;

  for ingredient_row in
    select
      assignment.id,
      assignment.ingredient_id,
      assignment.nutrition_serving_size_override,
      assignment.nutrition_overrides,
      profile.serving_size_amount as profile_serving_size_amount,
      profile.serving_size_dimension as profile_serving_size_dimension,
      profile.serving_size_unit_code as profile_serving_size_unit_code,
      profile.nutrients as profile_nutrients,
      density.volume_amount as density_volume_amount,
      density.volume_unit_code as density_volume_unit_code,
      density.weight_amount as density_weight_amount,
      density.weight_unit_code as density_weight_unit_code,
      equivalent.measurement_type as equivalent_measurement_type,
      equivalent.picklist_value_id as equivalent_picklist_value_id,
      equivalent.picklist_value as equivalent_picklist_value,
      equivalent.volume_amount as equivalent_volume_amount,
      equivalent.volume_unit_code as equivalent_volume_unit_code,
      equivalent.weight_amount as equivalent_weight_amount,
      equivalent.weight_unit_code as equivalent_weight_unit_code
    from public.recipe_ingredients as assignment
    left join public.ingredient_nutrition_profiles as profile
      on profile.account_id = assignment.account_id
      and profile.ingredient_id = assignment.ingredient_id
    left join public.ingredient_densities as density
      on density.account_id = assignment.account_id
      and density.ingredient_id = assignment.ingredient_id
    left join public.ingredient_measure_equivalents as equivalent
      on equivalent.account_id = assignment.account_id
      and equivalent.ingredient_id = assignment.ingredient_id
    where assignment.account_id = p_account_id
      and assignment.recipe_id = p_recipe_id
    order by assignment.position
  loop
    ingredient_count := ingredient_count + 1;
    if ingredient_row.nutrition_serving_size_override is not null then
      basis_amount := (ingredient_row.nutrition_serving_size_override->>'amount')::numeric;
      basis_dimension := ingredient_row.nutrition_serving_size_override->>'dimension';
      basis_unit_code := ingredient_row.nutrition_serving_size_override->>'unitCode';
    else
      basis_amount := ingredient_row.profile_serving_size_amount;
      basis_dimension := ingredient_row.profile_serving_size_dimension;
      basis_unit_code := ingredient_row.profile_serving_size_unit_code;
    end if;
    if basis_amount is null or basis_dimension is null or basis_unit_code is null then
      complete := false;
      continue;
    end if;

    select
      measurement.measurement_type,
      measurement.amount_min,
      measurement.amount_max,
      measurement.unit_code,
      measurement.picklist_value_id,
      picklist.display_value as picklist_value
    into measurement_row
    from public.recipe_ingredient_measurements as measurement
    left join public.recipe_picklist_values as picklist
      on picklist.account_id = measurement.account_id
      and picklist.id = measurement.picklist_value_id
    where measurement.account_id = p_account_id
      and measurement.recipe_ingredient_id = ingredient_row.id
      and measurement.measurement_type in ('volume', 'weight', 'count', 'informal')
    order by
      case
        when measurement.measurement_type = basis_dimension then 0
        when measurement.measurement_type in ('volume', 'weight') then 1
        else 2
      end,
      measurement.position
    limit 1;
    if not found
      or measurement_row.amount_min is null
      or measurement_row.amount_min <= 0
      or measurement_row.amount_max is not null then
      complete := false;
      continue;
    end if;

    amount_in_basis := null;
    equivalent_amount_in_basis := null;
    if measurement_row.measurement_type in ('volume', 'weight') then
      amount_in_basis := private.nutrition_physical_amount(
        measurement_row.amount_min,
        measurement_row.measurement_type,
        measurement_row.unit_code,
        basis_dimension,
        basis_unit_code,
        ingredient_row.density_volume_amount,
        ingredient_row.density_volume_unit_code,
        ingredient_row.density_weight_amount,
        ingredient_row.density_weight_unit_code
      );
    elsif ingredient_row.equivalent_measurement_type = measurement_row.measurement_type
      and (
        measurement_row.measurement_type = 'count'
        or (
          measurement_row.measurement_type = 'informal'
          and (
            (
              measurement_row.picklist_value_id is not null
              and measurement_row.picklist_value_id = ingredient_row.equivalent_picklist_value_id
            )
            or (
              measurement_row.picklist_value_id is null
              and ingredient_row.equivalent_picklist_value_id is null
              and pg_catalog.lower(pg_catalog.btrim(measurement_row.picklist_value))
                = pg_catalog.lower(pg_catalog.btrim(ingredient_row.equivalent_picklist_value))
            )
          )
        )
      ) then
      if basis_dimension = 'volume' and ingredient_row.equivalent_volume_amount is not null then
        equivalent_amount_in_basis := private.nutrition_physical_amount(
          ingredient_row.equivalent_volume_amount,
          'volume',
          ingredient_row.equivalent_volume_unit_code,
          basis_dimension,
          basis_unit_code,
          ingredient_row.density_volume_amount,
          ingredient_row.density_volume_unit_code,
          ingredient_row.density_weight_amount,
          ingredient_row.density_weight_unit_code
        );
      elsif basis_dimension = 'weight' and ingredient_row.equivalent_weight_amount is not null then
        equivalent_amount_in_basis := private.nutrition_physical_amount(
          ingredient_row.equivalent_weight_amount,
          'weight',
          ingredient_row.equivalent_weight_unit_code,
          basis_dimension,
          basis_unit_code,
          ingredient_row.density_volume_amount,
          ingredient_row.density_volume_unit_code,
          ingredient_row.density_weight_amount,
          ingredient_row.density_weight_unit_code
        );
      elsif basis_dimension = 'volume' and ingredient_row.equivalent_weight_amount is not null then
        equivalent_amount_in_basis := private.nutrition_physical_amount(
          ingredient_row.equivalent_weight_amount,
          'weight',
          ingredient_row.equivalent_weight_unit_code,
          basis_dimension,
          basis_unit_code,
          ingredient_row.density_volume_amount,
          ingredient_row.density_volume_unit_code,
          ingredient_row.density_weight_amount,
          ingredient_row.density_weight_unit_code
        );
      elsif basis_dimension = 'weight' and ingredient_row.equivalent_volume_amount is not null then
        equivalent_amount_in_basis := private.nutrition_physical_amount(
          ingredient_row.equivalent_volume_amount,
          'volume',
          ingredient_row.equivalent_volume_unit_code,
          basis_dimension,
          basis_unit_code,
          ingredient_row.density_volume_amount,
          ingredient_row.density_volume_unit_code,
          ingredient_row.density_weight_amount,
          ingredient_row.density_weight_unit_code
        );
      end if;
      if equivalent_amount_in_basis is not null then
        amount_in_basis := measurement_row.amount_min * equivalent_amount_in_basis;
      end if;
    end if;
    if amount_in_basis is null then
      complete := false;
      continue;
    end if;

    stale_override := false;
    for override_entry in
      select key, value from jsonb_each(ingredient_row.nutrition_overrides)
    loop
      if not private.nutrition_basis_signature_matches(
          override_entry.value->>'basisSignature',
          basis_amount,
          basis_dimension,
          basis_unit_code
        )
        and not private.nutrition_basis_signature_matches(
          override_entry.value->>'acknowledgedBasisSignature',
          basis_amount,
          basis_dimension,
          basis_unit_code
        ) then
        stale_override := true;
        exit;
      end if;
    end loop;
    if stale_override then
      complete := false;
      continue;
    end if;

    profile_scale := null;
    if ingredient_row.profile_serving_size_amount is not null then
      profile_amount_in_basis := private.nutrition_physical_amount(
        ingredient_row.profile_serving_size_amount,
        ingredient_row.profile_serving_size_dimension,
        ingredient_row.profile_serving_size_unit_code,
        basis_dimension,
        basis_unit_code,
        ingredient_row.density_volume_amount,
        ingredient_row.density_volume_unit_code,
        ingredient_row.density_weight_amount,
        ingredient_row.density_weight_unit_code
      );
      if profile_amount_in_basis is not null and profile_amount_in_basis > 0 then
        profile_scale := basis_amount / profile_amount_in_basis;
      end if;
    end if;

    ingredient_values := '{}'::jsonb;
    ingredient_complete := true;
    foreach nutrient_key in array standard_nutrient_keys
    loop
      nutrient_amount := null;
      if ingredient_row.nutrition_overrides ? nutrient_key then
        nutrient_amount := (
          ingredient_row.nutrition_overrides->nutrient_key->>'value'
        )::numeric;
      elsif ingredient_row.profile_nutrients ? nutrient_key and profile_scale is not null then
        nutrient_amount := (ingredient_row.profile_nutrients->>nutrient_key)::numeric
          * profile_scale;
      end if;

      if nutrient_amount is null then
        ingredient_complete := false;
        exit;
      end if;
      ingredient_values := ingredient_values || jsonb_build_object(nutrient_key, nutrient_amount);
    end loop;

    if not ingredient_complete then
      complete := false;
      continue;
    end if;

    foreach nutrient_key in array standard_nutrient_keys
    loop
      total_values := jsonb_set(
        total_values,
        array[nutrient_key],
        to_jsonb(
          coalesce((total_values->>nutrient_key)::numeric, 0)
          + (ingredient_values->>nutrient_key)::numeric
            * (amount_in_basis / basis_amount)
        ),
        true
      );
    end loop;
  end loop;

  foreach nutrient_key in array standard_nutrient_keys
  loop
    if recipe_row.nutrition_overrides ? nutrient_key then
      nutrient_amount := (recipe_row.nutrition_overrides->>nutrient_key)::numeric;
    elsif complete and ingredient_count > 0 and total_values ? nutrient_key then
      nutrient_amount := (total_values->>nutrient_key)::numeric;
    else
      continue;
    end if;
    result_values := result_values || jsonb_build_object(
      nutrient_key,
      round(nutrient_amount / recipe_row.serves)
    );
  end loop;

  return result_values;
end;
$$;

revoke all on function private.nutrition_unit_factor(text, text)
  from public, anon, authenticated;
revoke all on function private.nutrition_physical_amount(
  numeric, text, text, text, text, numeric, text, numeric, text
) from public, anon, authenticated;
revoke all on function private.nutrition_basis_signature_matches(text, numeric, text, text)
  from public, anon, authenticated;
revoke all on function private.recipe_nutrition_per_serving(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.nutrition_unit_factor(text, text),
  private.nutrition_physical_amount(numeric, text, text, text, text, numeric, text, numeric, text),
  private.nutrition_basis_signature_matches(text, numeric, text, text),
  private.recipe_nutrition_per_serving(uuid, uuid) to authenticated;

create function public.recipe_explorer_nutrition(p_recipe_ids uuid[])
returns table (recipe_id uuid, nutrition_values jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    recipe.id,
    private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)
  from public.recipes as recipe
  where recipe.account_id = auth.uid()
    and recipe.id = any(coalesce(p_recipe_ids, array[]::uuid[]))
$$;

revoke all on function public.recipe_explorer_nutrition(uuid[]) from public, anon;
grant execute on function public.recipe_explorer_nutrition(uuid[]) to authenticated;

alter function private.recipe_search_filter_matches(uuid, uuid, jsonb)
  rename to recipe_search_filter_matches_before_nutrition;

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
  numeric_value numeric;
  numeric_upper numeric;
  nutrition_values jsonb;
begin
  if field_name in (
    'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
    'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
    'vitamin_d', 'calcium', 'iron', 'potassium'
  ) then
    nutrition_values := private.recipe_nutrition_per_serving(
      target_account_id,
      target_recipe_id
    );
    numeric_value := (nutrition_values->>field_name)::numeric;
    if numeric_value is null then
      return false;
    end if;
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

  return private.recipe_search_filter_matches_before_nutrition(
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
revoke all on function private.recipe_search_filter_matches_before_nutrition(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.recipe_search_filter_matches_before_nutrition(uuid, uuid, jsonb)
  to authenticated;

do $$
declare
  function_source text;
  old_allowed_fields constant text :=
    $pattern$'created_at', 'updated_at', 'score', 'starred', 'hearted',
      'main_ingredient', 'main_ingredient_text'$pattern$;
  new_allowed_fields constant text :=
    $pattern$'created_at', 'updated_at', 'score', 'starred', 'hearted',
      'main_ingredient', 'main_ingredient_text', 'calories', 'total_fat',
      'saturated_fat', 'trans_fat', 'cholesterol', 'sodium', 'total_carbohydrate',
      'dietary_fiber', 'total_sugars', 'added_sugars', 'protein', 'vitamin_d',
      'calcium', 'iron', 'potassium'$pattern$;
  old_numeric_fields constant text :=
    $pattern$'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'score'
    ) then$pattern$;
  new_numeric_fields constant text :=
    $pattern$'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'score',
      'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
      'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
      'vitamin_d', 'calcium', 'iron', 'potassium'
    ) then$pattern$;
  old_sort_keys constant text :=
    $pattern$'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
    'score', 'makes'$pattern$;
  new_sort_keys constant text :=
    $pattern$'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
    'score', 'makes', 'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
    'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
    'vitamin_d', 'calcium', 'iron', 'potassium'$pattern$;
  old_sort_number constant text :=
    $pattern$        when 'total_time_minutes' then recipe.total_time_minutes::numeric
        when 'score' then recipe.score::numeric
        when 'makes' then recipe.makes_quantity::numeric
      end as sort_number,$pattern$;
  new_sort_number constant text :=
    $pattern$        when 'total_time_minutes' then recipe.total_time_minutes::numeric
        when 'score' then recipe.score::numeric
        when 'makes' then recipe.makes_quantity::numeric
        when 'calories' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'calories')::numeric
        when 'total_fat' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'total_fat')::numeric
        when 'saturated_fat' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'saturated_fat')::numeric
        when 'trans_fat' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'trans_fat')::numeric
        when 'cholesterol' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'cholesterol')::numeric
        when 'sodium' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'sodium')::numeric
        when 'total_carbohydrate' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'total_carbohydrate')::numeric
        when 'dietary_fiber' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'dietary_fiber')::numeric
        when 'total_sugars' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'total_sugars')::numeric
        when 'added_sugars' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'added_sugars')::numeric
        when 'protein' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'protein')::numeric
        when 'vitamin_d' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'vitamin_d')::numeric
        when 'calcium' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'calcium')::numeric
        when 'iron' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'iron')::numeric
        when 'potassium' then (private.recipe_nutrition_per_serving(recipe.account_id, recipe.id)->>'potassium')::numeric
      end as sort_number,$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.search_recipes(text,integer,integer,jsonb,text,text,uuid)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_allowed_fields) = 0 then
    raise exception 'Expected recipe search nutrition filter allowlist was not found';
  end if;
  if pg_catalog.strpos(function_source, old_numeric_fields) = 0 then
    raise exception 'Expected recipe search nutrition numeric filter list was not found';
  end if;
  if pg_catalog.strpos(function_source, old_sort_keys) = 0 then
    raise exception 'Expected recipe search nutrition sort allowlist was not found';
  end if;
  if pg_catalog.strpos(function_source, old_sort_number) = 0 then
    raise exception 'Expected recipe search nutrition sort expression was not found';
  end if;

  function_source := pg_catalog.replace(function_source, old_allowed_fields, new_allowed_fields);
  function_source := pg_catalog.replace(function_source, old_numeric_fields, new_numeric_fields);
  function_source := pg_catalog.replace(function_source, old_sort_keys, new_sort_keys);
  function_source := pg_catalog.replace(function_source, old_sort_number, new_sort_number);
  execute function_source;
end;
$$;

do $$
declare
  function_source text;
  old_sort_key constant text :=
    $pattern$p_state->>'sort' not in ('relevance', 'name', 'publication', 'publication_page', 'recipe_url', 'state', 'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation', 'score')$pattern$;
  new_sort_key constant text :=
    $pattern$p_state->>'sort' not in ('relevance', 'name', 'publication', 'publication_page', 'recipe_url', 'state', 'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients', 'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium')$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_v1(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_sort_key) = 0 then
    raise exception 'Expected explorer nutrition sort validation was not found';
  end if;

  execute pg_catalog.replace(function_source, old_sort_key, new_sort_key);
end;
$$;

do $$
declare
  function_source text;
  old_visible_columns constant text :=
    $pattern$'publication_source', 'score', 'starred', 'hearted', 'makes'
    ];$pattern$;
  new_visible_columns constant text :=
    $pattern$'publication_source', 'score', 'starred', 'hearted', 'makes',
      'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
      'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
      'vitamin_d', 'calcium', 'iron', 'potassium'
    ];$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_explorer_state_with_legacy_validation(text,jsonb)'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_visible_columns) = 0 then
    raise exception 'Expected explorer nutrition column validation was not found';
  end if;

  execute pg_catalog.replace(function_source, old_visible_columns, new_visible_columns);
end;
$$;

create or replace function public.is_valid_recipe_hidden_columns(p_hidden_columns text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_hidden_columns is not null
    and pg_catalog.array_position(p_hidden_columns, null) is null
    and p_hidden_columns <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
      'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
      'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
      'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
      'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'starred', 'hearted'
    ]::text[]
    and pg_catalog.cardinality(p_hidden_columns) = (
      select pg_catalog.count(distinct hidden_column.value)
      from pg_catalog.unnest(p_hidden_columns) as hidden_column(value)
    );
$$;

do $$
declare
  function_source text;
  old_column_keys constant text :=
    $pattern$'score', 'starred', 'hearted'
  ];$pattern$;
  new_column_keys constant text :=
    $pattern$'score', 'starred', 'hearted', 'calories', 'total_fat', 'saturated_fat',
    'trans_fat', 'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber',
    'total_sugars', 'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium'
  ];$pattern$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.update_recipe_column_order(text[])'::regprocedure
  )
  into function_source;

  if pg_catalog.strpos(function_source, old_column_keys) = 0 then
    raise exception 'Expected recipe column-order validation was not found';
  end if;

  execute pg_catalog.replace(function_source, old_column_keys, new_column_keys);
end;
$$;

alter table public.accounts
  drop constraint accounts_recipe_column_order_check;

update public.accounts
set recipe_column_order = recipe_column_order || array[
  'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
  'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
  'vitamin_d', 'calcium', 'iron', 'potassium'
]::text[],
    recipe_hidden_columns = recipe_hidden_columns || array[
      'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
      'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
      'vitamin_d', 'calcium', 'iron', 'potassium'
    ]::text[];

alter table public.accounts
  alter column recipe_column_order set default array[
    'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
    'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
    'tags', 'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
    'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
    'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
    'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes', 'chill_time_minutes',
    'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes', 'cooling_time_minutes',
    'rest_time_minutes', 'total_time_minutes', 'created_at', 'updated_at', 'pairs_with',
    'opinion', 'citation', 'score', 'starred', 'hearted'
  ]::text[],
  alter column recipe_hidden_columns set default array[
    'publication_page', 'recipe_url', 'occasion_details', 'serves', 'equipment',
    'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients',
    'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
    'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes',
    'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
    'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
    'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
    'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
    'vitamin_d', 'calcium', 'iron', 'potassium'
  ]::text[];

alter table public.accounts
  add constraint accounts_recipe_column_order_check
  check (
    pg_catalog.cardinality(recipe_column_order) = 48
    and pg_catalog.array_position(recipe_column_order, null) is null
    and recipe_column_order @> array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
      'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
      'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
      'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
      'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'starred', 'hearted'
    ]::text[]
    and recipe_column_order <@ array[
      'name', 'publication', 'publication_page', 'recipe_url', 'state', 'visibility',
      'occasion_details', 'serves', 'makes', 'equipment', 'food_type', 'meal_type', 'cuisine',
      'tags', 'main_ingredients', 'calories', 'total_fat', 'saturated_fat', 'trans_fat',
      'cholesterol', 'sodium', 'total_carbohydrate', 'dietary_fiber', 'total_sugars',
      'added_sugars', 'protein', 'vitamin_d', 'calcium', 'iron', 'potassium',
      'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
      'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes', 'bake_time_minutes',
      'cooling_time_minutes', 'rest_time_minutes', 'total_time_minutes', 'created_at',
      'updated_at', 'pairs_with', 'opinion', 'citation', 'score', 'starred', 'hearted'
    ]::text[]
  );

notify pgrst, 'reload schema';
