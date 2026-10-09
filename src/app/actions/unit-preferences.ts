'use server';

import type { MeasurementSystem } from '../../lib/recipes/measurement-rules';
import { createClient } from '../../lib/supabase/server';

export type UnitPreferenceActionState = {
  status?: 'saved' | 'error';
  message?: string;
};

function isMeasurementSystem(value: FormDataEntryValue | null): value is MeasurementSystem {
  return value === 'us_customary' || value === 'metric';
}

export async function saveUnitPreferences(
  _previousState: UnitPreferenceActionState,
  formData: FormData,
): Promise<UnitPreferenceActionState> {
  const changedDimension = formData.get('changed_dimension');
  const volumeSystem = formData.get('volume_system');
  const weightSystem = formData.get('weight_system');
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
