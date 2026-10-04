'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { RecipeState } from '../../lib/recipes/data';
import type { IngredientRowPayload } from '../../lib/recipes/ingredient-rules';
import { createClient } from '../../lib/supabase/server';

export type RecipeActionState = {
  error?: string;
};

function formText(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function optionalId(formData: FormData, name: string): string | null {
  return formText(formData, name) || null;
}

function optionalInteger(formData: FormData, name: string): number | null | undefined {
  const raw = formText(formData, name);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function selectedIds(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(String).filter(Boolean);
}

function parseIngredientRows(formData: FormData): IngredientRowPayload[] | null {
  const raw = formData.get('ingredient_rows');
  if (typeof raw !== 'string') {
    return null;
  }

  try {
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) {
      return null;
    }

    return rows.every(
      (row) =>
        row !== null &&
        typeof row === 'object' &&
        (row.ingredient_id === null || typeof row.ingredient_id === 'string') &&
        (row.ingredient_name === null || typeof row.ingredient_name === 'string') &&
        typeof row.is_main === 'boolean' &&
        typeof row.detail === 'string' &&
        typeof row.preparation === 'string',
    )
      ? (rows as IngredientRowPayload[])
      : null;
  } catch {
    return null;
  }
}

export async function saveRecipe(
  _previousState: RecipeActionState | undefined,
  formData: FormData,
): Promise<RecipeActionState> {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { error: 'Sign in before saving a recipe.' };
  }

  const name = formText(formData, 'name');
  const state = formText(formData, 'state');
  if (!name) {
    return { error: 'Enter a recipe name.' };
  }
  if (!['want_to_try', 'tried', 'will_not_try'].includes(state)) {
    return { error: 'Choose a State before saving.' };
  }
  const ingredientRows = parseIngredientRows(formData);
  if (!ingredientRows) {
    return { error: 'Check the ingredient rows before saving.' };
  }

  const timeFields = [
    'prep_time_minutes',
    'mixing_time_minutes',
    'marinate_time_minutes',
    'chill_time_minutes',
    'freeze_time_minutes',
    'cook_time_minutes',
    'bake_time_minutes',
    'cooling_time_minutes',
    'rest_time_minutes',
    'total_time_minutes',
  ] as const;
  const times = Object.fromEntries(
    timeFields.map((field) => [field, optionalInteger(formData, field)]),
  );
  if (Object.values(times).some((value) => value === undefined)) {
    return { error: 'Time values must be whole minutes greater than or equal to zero.' };
  }

  const servesText = formText(formData, 'serves');
  const serves = servesText ? Number(servesText) : null;
  if (serves !== null && (!Number.isSafeInteger(serves) || serves <= 0)) {
    return { error: 'Serves must be a whole number greater than zero.' };
  }

  const recipeId = optionalId(formData, 'recipe_id');
  const expectedVersionText = formText(formData, 'expected_version');
  const expectedVersion = expectedVersionText ? Number(expectedVersionText) : null;
  if (
    recipeId &&
    (expectedVersion === null || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
  ) {
    return { error: 'Reload this recipe before saving.' };
  }

  const { data, error } = await supabase.rpc('save_recipe', {
    p_recipe_id: recipeId,
    p_expected_version: expectedVersion,
    p_name: name,
    p_food_type_id: optionalId(formData, 'food_type_id'),
    p_state: state as RecipeState,
    p_verdict_id: optionalId(formData, 'verdict_id'),
    p_enthusiasm_id: optionalId(formData, 'enthusiasm_id'),
    p_occasion_details: formText(formData, 'occasion_details') || null,
    p_reason: formText(formData, 'reason') || null,
    p_serves: serves,
    p_prep_time_minutes: times.prep_time_minutes,
    p_mixing_time_minutes: times.mixing_time_minutes,
    p_marinate_time_minutes: times.marinate_time_minutes,
    p_chill_time_minutes: times.chill_time_minutes,
    p_freeze_time_minutes: times.freeze_time_minutes,
    p_cook_time_minutes: times.cook_time_minutes,
    p_bake_time_minutes: times.bake_time_minutes,
    p_cooling_time_minutes: times.cooling_time_minutes,
    p_rest_time_minutes: times.rest_time_minutes,
    p_total_time_minutes: times.total_time_minutes,
    p_notes_markdown: String(formData.get('notes_markdown') ?? ''),
    p_meal_type_ids: selectedIds(formData, 'meal_type_ids'),
    p_cuisine_ids: selectedIds(formData, 'cuisine_ids'),
    p_equipment_ids: selectedIds(formData, 'equipment_ids'),
    p_ingredient_rows: ingredientRows,
  });

  if (error) {
    if (error.code === '40001') {
      return { error: 'This recipe changed in another session. Reload before saving again.' };
    }
    if (error.code === 'P0002') {
      return { error: 'This recipe is no longer available.' };
    }
    return { error: 'Unable to save this recipe. Check the selected options and try again.' };
  }

  const savedRecipe = Array.isArray(data) ? data[0] : data;
  if (!savedRecipe?.id) {
    return { error: 'Unable to confirm the recipe save. Reload before continuing.' };
  }

  revalidatePath('/recipes');
  revalidatePath(`/recipes/${savedRecipe.id}`);
  redirect(`/recipes/${savedRecipe.id}`);
}
