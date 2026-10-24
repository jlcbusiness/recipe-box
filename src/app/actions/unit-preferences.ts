'use server';

import { isInstructionEmphasisColor } from '../../lib/recipes/instruction-emphasis';
import type { TemperatureSystem } from '../../lib/recipes/instruction-markdown';
import type { MeasurementSystem } from '../../lib/recipes/measurement-rules';
import type { IngredientPresentation } from '../../lib/recipes/recipe-reader-rules';
import { createClient } from '../../lib/supabase/server';

export type UnitPreferenceActionState = {
  status?: 'saved' | 'error';
  message?: string;
};

type HandPreference = 'left' | 'right';

function isMeasurementSystem(value: FormDataEntryValue | null): value is MeasurementSystem {
  return value === 'us_customary' || value === 'metric';
}

function isIngredientPresentation(
  value: FormDataEntryValue | null,
): value is IngredientPresentation {
  return value === 'standard' || value === 'ingredient_first';
}

function isHandPreference(value: FormDataEntryValue | null): value is HandPreference {
  return value === 'left' || value === 'right';
}

function isTemperatureSystem(value: FormDataEntryValue | null): value is TemperatureSystem {
  return value === 'fahrenheit' || value === 'celsius';
}

export async function saveUnitPreferences(
  _previousState: UnitPreferenceActionState,
  formData: FormData,
): Promise<UnitPreferenceActionState> {
  const changedDimension = formData.get('changed_dimension');
  const volumeSystem = formData.get('volume_system');
  const weightSystem = formData.get('weight_system');
  const ingredientPresentation = formData.get('ingredient_presentation');
  const handPreference = formData.get('hand_preference');
  const temperatureSystem = formData.get('temperature_system');
  if (
    changedDimension === 'ingredient_color' ||
    changedDimension === 'temperature_color' ||
    changedDimension === 'duration_color'
  ) {
    const color = formData.get(changedDimension);
    if (!isInstructionEmphasisColor(color)) {
      return { status: 'error', message: 'Choose a valid emphasis color.' };
    }

    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save preferences.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      [`p_${changedDimension}`]: color,
    });
    return error
      ? { status: 'error', message: 'Instruction color could not be saved.' }
      : { status: 'saved', message: 'Saved.' };
  }

  if (changedDimension === 'print_colors') {
    const privatePrintUsesColors = formData.get('private_print_uses_colors');
    if (privatePrintUsesColors !== 'true' && privatePrintUsesColors !== 'false') {
      return { status: 'error', message: 'Choose a valid print preference.' };
    }

    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save preferences.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      p_private_print_uses_colors: privatePrintUsesColors === 'true',
    });
    return error
      ? { status: 'error', message: 'Print preference could not be saved.' }
      : { status: 'saved', message: 'Saved.' };
  }

  if (changedDimension === 'hand') {
    if (!isHandPreference(handPreference)) {
      return { status: 'error', message: 'Choose a valid hand preference.' };
    }

    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save preferences.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      p_hand_preference: handPreference,
    });
    return error
      ? { status: 'error', message: 'Hand preference could not be saved.' }
      : { status: 'saved', message: 'Saved.' };
  }

  if (changedDimension === 'temperature') {
    if (!isTemperatureSystem(temperatureSystem)) {
      return { status: 'error', message: 'Choose Fahrenheit or Celsius.' };
    }

    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save temperature preferences.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      p_temperature_system: temperatureSystem,
    });
    return error
      ? { status: 'error', message: 'Temperature preference could not be saved.' }
      : { status: 'saved', message: 'Saved.' };
  }

  if (changedDimension === 'presentation') {
    if (!isIngredientPresentation(ingredientPresentation)) {
      return { status: 'error', message: 'Choose a valid presentation.' };
    }

    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save preferences.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      p_volume_system: null,
      p_weight_system: null,
      p_ingredient_presentation: ingredientPresentation,
    });
    return error
      ? { status: 'error', message: 'Presentation preference could not be saved.' }
      : { status: 'saved', message: 'Saved.' };
  }

  if (changedDimension === 'volume' && isMeasurementSystem(volumeSystem)) {
    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save unit defaults.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      p_volume_system: volumeSystem,
      p_weight_system: null,
    });
    return error
      ? { status: 'error', message: 'Unit defaults could not be saved.' }
      : { status: 'saved', message: 'Saved.' };
  }
  if (changedDimension === 'weight' && isMeasurementSystem(weightSystem)) {
    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save unit defaults.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      p_volume_system: null,
      p_weight_system: weightSystem,
    });
    return error
      ? { status: 'error', message: 'Unit defaults could not be saved.' }
      : { status: 'saved', message: 'Saved.' };
  }

  return { status: 'error', message: 'Choose a valid system for Volume or Weight.' };
}
