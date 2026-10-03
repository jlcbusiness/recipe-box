import type { createClient } from '../supabase/server';

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

  const idsFor = (category: string) =>
    assignments
      .filter((assignment) => assignment.category === category)
      .map((assignment) => assignment.picklist_value_id);

  return {
    ...data,
    meal_type_ids: idsFor('meal_type'),
    cuisine_ids: idsFor('cuisine'),
    equipment_ids: idsFor('equipment'),
  } as RecipeRecord;
}

export const recipeStateLabels: Record<RecipeState, string> = {
  want_to_try: 'Want to try',
  tried: 'Tried',
  will_not_try: 'Will not try',
};
