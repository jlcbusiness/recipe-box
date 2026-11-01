do $$
declare
  legacy_default_hidden_columns text[] := array[
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
begin
  update public.accounts
  set recipe_hidden_columns = array_append(recipe_hidden_columns, 'makes')
  where pg_catalog.cardinality(recipe_hidden_columns)
      = pg_catalog.cardinality(legacy_default_hidden_columns)
    and recipe_hidden_columns <@ legacy_default_hidden_columns
    and legacy_default_hidden_columns <@ recipe_hidden_columns;
end;
$$;

alter table public.accounts
  alter column recipe_hidden_columns set default array[
    'publication_page', 'recipe_url', 'occasion_details', 'serves', 'makes', 'equipment',
    'food_type', 'meal_type', 'cuisine', 'tags', 'main_ingredients',
    'prep_time_minutes', 'mixing_time_minutes', 'marinate_time_minutes',
    'chill_time_minutes', 'freeze_time_minutes', 'cook_time_minutes',
    'bake_time_minutes', 'cooling_time_minutes', 'rest_time_minutes',
    'total_time_minutes', 'created_at', 'updated_at', 'pairs_with', 'opinion', 'citation',
    'calories', 'total_fat', 'saturated_fat', 'trans_fat', 'cholesterol', 'sodium',
    'total_carbohydrate', 'dietary_fiber', 'total_sugars', 'added_sugars', 'protein',
    'vitamin_d', 'calcium', 'iron', 'potassium'
  ]::text[];
