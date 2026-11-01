'use server';

import { revalidatePath } from 'next/cache';
import { volumeUnits, weightUnits } from '../../lib/recipes/measurement-rules';
import {
  isNutritionBasis,
  type NutritionEquivalent,
  type NutritionProfile,
  validateNutritionProfile,
} from '../../lib/recipes/nutrition-rules';
import { createClient } from '../../lib/supabase/server';

export type IngredientNutritionActionState = {
  status?: 'saved' | 'conflict' | 'error';
  message?: string;
  revision?: number;
};

const actions = new Set(['profile_set', 'profile_remove', 'equivalent_set', 'equivalent_remove']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const volumeUnitCodes = new Set(volumeUnits.map((unit) => unit.code));
const weightUnitCodes = new Set(weightUnits.map((unit) => unit.code));

function parseJson(value: FormDataEntryValue | null): unknown | null {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isNutritionEquivalent(value: unknown): value is NutritionEquivalent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const equivalent = value as Record<string, unknown>;
  if (
    Object.keys(equivalent).length !== 5 ||
    !['measurementType', 'picklistValueId', 'picklistValue', 'volume', 'weight'].every((key) =>
      Object.hasOwn(equivalent, key),
    ) ||
    !['count', 'informal'].includes(String(equivalent.measurementType))
  ) {
    return false;
  }
  if (
    equivalent.measurementType === 'count'
      ? equivalent.picklistValueId !== null || equivalent.picklistValue !== null
      : typeof equivalent.picklistValueId !== 'string' ||
        !uuidPattern.test(equivalent.picklistValueId) ||
        typeof equivalent.picklistValue !== 'string' ||
        !equivalent.picklistValue.trim()
  ) {
    return false;
  }
  function validMeasure(measure: unknown, dimension: 'volume' | 'weight') {
    if (measure === null) return true;
    if (!measure || typeof measure !== 'object' || Array.isArray(measure)) return false;
    const record = measure as Record<string, unknown>;
    const units = dimension === 'volume' ? volumeUnitCodes : weightUnitCodes;
    return (
      Object.keys(record).length === 2 &&
      typeof record.amount === 'number' &&
      Number.isFinite(record.amount) &&
      record.amount > 0 &&
      typeof record.unitCode === 'string' &&
      units.has(record.unitCode)
    );
  }
  return (
    (equivalent.volume !== null || equivalent.weight !== null) &&
    validMeasure(equivalent.volume, 'volume') &&
    validMeasure(equivalent.weight, 'weight')
  );
}

export async function manageIngredientNutrition(
  _previousState: IngredientNutritionActionState,
  formData: FormData,
): Promise<IngredientNutritionActionState> {
  const action = formData.get('action');
  const revision = Number(formData.get('revision'));
  const ingredientId = formData.get('ingredient_id');
  if (
    typeof action !== 'string' ||
    !actions.has(action) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    typeof ingredientId !== 'string' ||
    !uuidPattern.test(ingredientId)
  ) {
    return { status: 'error', message: 'Choose a valid ingredient nutrition change.' };
  }

  let profile: NutritionProfile | null = null;
  let equivalent: NutritionEquivalent | null = null;
  if (action === 'profile_set') {
    const parsed = parseJson(formData.get('profile'));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !isNutritionBasis((parsed as Record<string, unknown>).servingSize)
    ) {
      return { status: 'error', message: 'Enter a valid serving size and nutrition profile.' };
    }
    profile = parsed as NutritionProfile;
    const validationError = validateNutritionProfile(profile);
    if (validationError) return { status: 'error', message: validationError };
  }
  if (action === 'equivalent_set') {
    equivalent = parseJson(formData.get('equivalent')) as NutritionEquivalent | null;
    if (!isNutritionEquivalent(equivalent)) {
      return { status: 'error', message: 'Enter a valid Count or Things equivalent.' };
    }
  }

  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return { status: 'error', message: 'Sign in to manage ingredient nutrition.' };
  }

  const { data: nextRevision, error } = await supabase.rpc('manage_ingredient_nutrition', {
    p_action: action,
    p_expected_revision: revision,
    p_ingredient_id: ingredientId,
    p_profile: profile,
    p_equivalent: equivalent,
  });
  if (error?.code === '40001' || error?.code === 'PT409') {
    return {
      status: 'conflict',
      message: 'The ingredient catalog changed in another session. The latest values are loading.',
    };
  }
  if (error) {
    return { status: 'error', message: 'Ingredient nutrition could not be updated.' };
  }

  revalidatePath('/settings');
  revalidatePath('/recipes');
  return {
    status: 'saved',
    message:
      action === 'equivalent_set'
        ? 'Measure equivalent saved.'
        : action === 'equivalent_remove'
          ? 'Measure equivalent removed.'
          : action === 'profile_remove'
            ? 'Nutrition data removed.'
            : 'Nutrition data saved.',
    revision: typeof nextRevision === 'number' ? nextRevision : revision + 1,
  };
}
