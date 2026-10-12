'use server';

import { revalidatePath } from 'next/cache';
import { parseQuantityInput, volumeUnits, weightUnits } from '../../lib/recipes/measurement-rules';
import { createClient } from '../../lib/supabase/server';

export type IngredientDensityActionState = {
  status?: 'saved' | 'conflict' | 'error';
  message?: string;
  revision?: number;
};

const actions = new Set(['set', 'remove']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function manageIngredientDensity(
  _previousState: IngredientDensityActionState,
  formData: FormData,
): Promise<IngredientDensityActionState> {
  const action = formData.get('action');
  const revisionValue = formData.get('revision');
  const revision = typeof revisionValue === 'string' ? Number(revisionValue) : NaN;
  const ingredientId = formData.get('ingredient_id');
  const volumeQuantity = formData.get('volume_amount');
  const volumeUnitCode = formData.get('volume_unit_code');
  const weightQuantity = formData.get('weight_amount');
  const weightUnitCode = formData.get('weight_unit_code');

  if (
    typeof action !== 'string' ||
    !actions.has(action) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    typeof ingredientId !== 'string' ||
    !uuidPattern.test(ingredientId)
  ) {
    return { status: 'error', message: 'Choose a valid density change.' };
  }

  let volumeAmount: number | null = null;
  let weightAmount: number | null = null;
  if (action === 'set') {
    const volume =
      typeof volumeQuantity === 'string' ? parseQuantityInput(volumeQuantity) : null;
    const weight =
      typeof weightQuantity === 'string' ? parseQuantityInput(weightQuantity) : null;
    if (
      !volume ||
      volume.maximum !== null ||
      !weight ||
      weight.maximum !== null ||
      typeof volumeUnitCode !== 'string' ||
      !volumeUnits.some((unit) => unit.code === volumeUnitCode) ||
      typeof weightUnitCode !== 'string' ||
      !weightUnits.some((unit) => unit.code === weightUnitCode)
    ) {
      return {
        status: 'error',
        message: 'Enter one positive amount and a valid unit for Volume and Weight.',
      };
    }
    volumeAmount = volume.minimum;
    weightAmount = weight.minimum;
  }

  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return { status: 'error', message: 'Sign in to manage trusted densities.' };
  }

  const { data: nextRevision, error } = await supabase.rpc('manage_ingredient_density', {
    p_action: action,
    p_expected_revision: revision,
    p_ingredient_id: ingredientId,
    p_volume_amount: volumeAmount,
    p_volume_unit_code: action === 'set' ? volumeUnitCode : null,
    p_weight_amount: weightAmount,
    p_weight_unit_code: action === 'set' ? weightUnitCode : null,
  });

  if (error?.code === '40001') {
    return {
      status: 'conflict',
      message: 'The ingredient catalog changed in another session. The latest values are loading.',
    };
  }
  if (error?.code === '23505') {
    return { status: 'error', message: 'This ingredient already has a trusted density.' };
  }
  if (error) {
    return { status: 'error', message: 'Trusted density could not be updated.' };
  }

  revalidatePath('/settings');
  revalidatePath('/recipes');
  return {
    status: 'saved',
    message: action === 'set' ? 'Density saved.' : 'Density removed.',
    revision: typeof nextRevision === 'number' ? nextRevision : revision + 1,
  };
}