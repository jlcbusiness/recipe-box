import type { createClient } from '../supabase/server';
import type { MeasurementType } from './measurement-rules';

export type RecipeState = 'want_to_try' | 'tried' | 'will_not_try';

export type PicklistCategory =
  | 'food_type'
  | 'meal_type'
  | 'cuisine'
  | 'equipment'
  | 'verdict'
  | 'enthusiasm'
  | 'informal_unit'
  | 'unmeasured_phrase';

export type RecipePicklistValue = {
  id: string;
  account_id: string;
  category: PicklistCategory;
  value: string;
  sort_order: number;
  is_protected: boolean;
};

export type IngredientOption = {
  id: string;
  name: string;
};

export type RecipeIngredient = {
  id: string;
  ingredient_id: string;
  ingredient_name: string;
  position: number;
  is_main: boolean;
  detail: string;
  preparation: string;
  measurements: RecipeMeasurement[];
};

export type RecipeMeasurement = {
  id: string;
  position: number;
  measurement_type: MeasurementType;
  amount_min: number | null;
  amount_max: number | null;
  unit_code: string | null;
  picklist_value_id: string | null;
  picklist_value: string | null;
};

export type RecipeInstructionStep = {
  id: string;
  position: number;
  content_markdown: string;
  plain_text: string;
};

type RecipeMeasurementRecord = Omit<RecipeMeasurement, 'picklist_value'> & {
  recipe_ingredient_id: string;
};

export type RecipeRecord = {
  id: string;
  name: string;
  food_type_id: string | null;
  state: RecipeState;
  verdict_id: string | null;
  enthusiasm_id: string | null;
  occasion_details: string | null;
  reason: string | null;
  serves: number | null;
  prep_time_minutes: number | null;
  mixing_time_minutes: number | null;
  marinate_time_minutes: number | null;
  chill_time_minutes: number | null;
  freeze_time_minutes: number | null;
  cook_time_minutes: number | null;
  bake_time_minutes: number | null;
  cooling_time_minutes: number | null;
  rest_time_minutes: number | null;
  total_time_minutes: number | null;
  notes_markdown: string;
  version: number;
  created_at: string;
  updated_at: string;
  meal_type_ids: string[];
  cuisine_ids: string[];
  equipment_ids: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeInstructionStep[];
};

export type RecipeSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getRecipePicklists(
  supabase: RecipeSupabaseClient,
): Promise<RecipePicklistValue[]> {
  const { data, error } = await supabase
    .from('recipe_picklist_values')
    .select('id, account_id, category, value, sort_order, is_protected')
    .order('category')
    .order('sort_order');

  if (error) {
    throw new Error('Unable to load recipe options.');
  }

  return data as RecipePicklistValue[];
}

export async function getIngredients(supabase: RecipeSupabaseClient): Promise<IngredientOption[]> {
  const { data, error } = await supabase.from('ingredients').select('id, name').order('name');

  if (error) {
    throw new Error('Unable to load ingredients.');
  }

  return data as IngredientOption[];
}

export async function getPreparationOptions(supabase: RecipeSupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('recipe_ingredients')
    .select('preparation')
    .neq('preparation', '')
    .order('preparation');

  if (error) {
    throw new Error('Unable to load preparation options.');
  }

  return [...new Set((data ?? []).map((row) => row.preparation))];
}

export async function getRecipe(
  supabase: RecipeSupabaseClient,
  recipeId: string,
): Promise<RecipeRecord | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      'id, name, food_type_id, state, verdict_id, enthusiasm_id, occasion_details, reason, serves, prep_time_minutes, mixing_time_minutes, marinate_time_minutes, chill_time_minutes, freeze_time_minutes, cook_time_minutes, bake_time_minutes, cooling_time_minutes, rest_time_minutes, total_time_minutes, notes_markdown, version, created_at, updated_at',
    )
    .eq('id', recipeId)
    .maybeSingle();

  if (error) {
    throw new Error('Unable to load this recipe.');
  }
  if (!data) {
    return null;
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from('recipe_picklist_assignments')
    .select('category, picklist_value_id')
    .eq('recipe_id', recipeId);

  if (assignmentError) {
    throw new Error('Unable to load this recipe.');
  }

  const { data: recipeSteps, error: recipeStepsError } = await supabase
    .from('recipe_steps')
    .select('id, position, content_markdown, plain_text')
    .eq('recipe_id', recipeId)
    .order('position');

  if (recipeStepsError) {
    throw new Error('Unable to load this recipe.');
  }

  const { data: recipeIngredients, error: recipeIngredientsError } = await supabase
    .from('recipe_ingredients')
    .select('id, ingredient_id, position, is_main, detail, preparation')
    .eq('recipe_id', recipeId)
    .order('position');

  if (recipeIngredientsError) {
    throw new Error('Unable to load this recipe.');
  }

  const ingredientIds = [...new Set((recipeIngredients ?? []).map((row) => row.ingredient_id))];
  const recipeIngredientIds = (recipeIngredients ?? []).map((row) => row.id);
  let ingredientNames = new Map<string, string>();
  if (ingredientIds.length > 0) {
    const { data: canonicalIngredients, error: ingredientsError } = await supabase
      .from('ingredients')
      .select('id, name')
      .in('id', ingredientIds);

    if (ingredientsError) {
      throw new Error('Unable to load this recipe.');
    }

    ingredientNames = new Map(
      (canonicalIngredients ?? []).map((ingredient) => [ingredient.id, ingredient.name]),
    );
  }

  let recipeMeasurements: RecipeMeasurementRecord[] = [];
  if (recipeIngredientIds.length > 0) {
    const { data: measurementData, error: measurementError } = await supabase
      .from('recipe_ingredient_measurements')
      .select(
        'id, recipe_ingredient_id, position, measurement_type, amount_min, amount_max, unit_code, picklist_value_id',
      )
      .in('recipe_ingredient_id', recipeIngredientIds)
      .order('recipe_ingredient_id')
      .order('position');

    if (measurementError) {
      throw new Error('Unable to load this recipe.');
    }
    recipeMeasurements = measurementData ?? [];
  }

  const measurementPicklistIds = [
    ...new Set(
      recipeMeasurements
        .map((measurement) => measurement.picklist_value_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let measurementPicklistValues = new Map<string, string>();
  if (measurementPicklistIds.length > 0) {
    const { data: picklistData, error: picklistError } = await supabase
      .from('recipe_picklist_values')
      .select('id, value')
      .in('id', measurementPicklistIds);

    if (picklistError) {
      throw new Error('Unable to load this recipe.');
    }
    measurementPicklistValues = new Map(
      (picklistData ?? []).map((option) => [option.id, option.value]),
    );
  }

  const measurementsByIngredient = new Map<string, RecipeMeasurement[]>();
  for (const measurement of recipeMeasurements) {
    const rows = measurementsByIngredient.get(measurement.recipe_ingredient_id) ?? [];
    rows.push({
      ...measurement,
      picklist_value: measurement.picklist_value_id
        ? (measurementPicklistValues.get(measurement.picklist_value_id) ?? null)
        : null,
    });
    measurementsByIngredient.set(measurement.recipe_ingredient_id, rows);
  }

  const idsFor = (category: string) =>
    assignments
      .filter((assignment) => assignment.category === category)
      .map((assignment) => assignment.picklist_value_id);

  return {
    ...data,
    meal_type_ids: idsFor('meal_type'),
    cuisine_ids: idsFor('cuisine'),
    equipment_ids: idsFor('equipment'),
    ingredients: (recipeIngredients ?? []).map((row) => ({
      ...row,
      ingredient_name: ingredientNames.get(row.ingredient_id) ?? '',
      measurements: measurementsByIngredient.get(row.id) ?? [],
    })),
    steps: (recipeSteps ?? []) as RecipeInstructionStep[],
  } as RecipeRecord;
}

export const recipeStateLabels: Record<RecipeState, string> = {
  want_to_try: 'Want to try',
  tried: 'Tried',
  will_not_try: 'Will not try',
};
