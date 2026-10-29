'use server';

import type { InstructionEmphasisColor } from '../../lib/recipes/instruction-emphasis';
import {
  defaultInstructionEmphasis,
  isInstructionEmphasisColor,
} from '../../lib/recipes/instruction-emphasis';
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
  if (changedDimension === 'instruction_emphasis') {
    const allEmphasisDisabled = formData.get('all_emphasis_disabled');
    if (allEmphasisDisabled !== 'true' && allEmphasisDisabled !== 'false') {
      return { status: 'error', message: 'Choose a valid instruction emphasis setting.' };
    }
    const colors: Record<'ingredient' | 'temperature' | 'duration', InstructionEmphasisColor> =
      allEmphasisDisabled === 'true'
        ? { ingredient: 'none', temperature: 'none', duration: 'none' }
        : defaultInstructionEmphasis;

    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save preferences.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      p_ingredient_color: colors.ingredient,
      p_temperature_color: colors.temperature,
      p_duration_color: colors.duration,
    });
    if (error) {
      return { status: 'error', message: 'Instruction emphasis could not be saved.' };
    }
    return {
      status: 'saved',
      message:
        allEmphasisDisabled === 'true'
          ? 'All instruction emphasis turned off.'
          : 'Instruction emphasis restored.',
    };
  }

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

  if (changedDimension === 'print_photos') {
    const includeInstructionPhotos = formData.get('include_instruction_photos_in_private_print');
    if (includeInstructionPhotos !== 'true' && includeInstructionPhotos !== 'false') {
      return { status: 'error', message: 'Choose a valid print preference.' };
    }

    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save preferences.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      p_include_instruction_photos_in_private_print: includeInstructionPhotos === 'true',
    });
    return error
      ? { status: 'error', message: 'Print preference could not be saved.' }
      : { status: 'saved', message: 'Saved.' };
  }

  if (changedDimension === 'print_repeat_ingredients') {
    const repeatIngredients = formData.get('repeat_ingredients_in_private_print');
    if (repeatIngredients !== 'true' && repeatIngredients !== 'false') {
      return { status: 'error', message: 'Choose a valid print preference.' };
    }

    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save preferences.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      p_repeat_ingredients_in_private_print: repeatIngredients === 'true',
    });
    return error
      ? { status: 'error', message: 'Print preference could not be saved.' }
      : { status: 'saved', message: 'Saved.' };
  }

  if (changedDimension === 'print_private_details') {
    const includePrivateDetails = formData.get('include_private_details_in_private_print');
    if (includePrivateDetails !== 'true' && includePrivateDetails !== 'false') {
      return { status: 'error', message: 'Choose a valid print preference.' };
    }

    const supabase = await createClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return { status: 'error', message: 'Sign in to save preferences.' };
    }

    const { error } = await supabase.rpc('update_account_unit_preferences', {
      p_include_private_details_in_private_print: includePrivateDetails === 'true',
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
