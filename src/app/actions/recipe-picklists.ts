'use server';

import { createClient } from '../../lib/supabase/server';

export type RecipePicklistActionState = {
  status?: 'saved' | 'conflict' | 'error';
  message?: string;
};

const categories = new Set([
  'food_type',
  'meal_type',
  'cuisine',
  'equipment',
  'verdict',
  'enthusiasm',
  'informal_unit',
  'unmeasured_phrase',
]);
const actions = new Set(['add', 'rename', 'reorder', 'delete', 'merge']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getUuid(formData: FormData, name: string): string | null | undefined {
  const value = formData.get(name);
  if (value === null || value === '') return null;
  return typeof value === 'string' && uuidPattern.test(value) ? value : undefined;
}

function getUuidList(formData: FormData, name: string): string[] | undefined {
  const values = formData.getAll(name);
  if (values.some((value) => typeof value !== 'string' || !uuidPattern.test(value))) {
    return undefined;
  }
  return values as string[];
}

export async function manageRecipePicklist(
  _previousState: RecipePicklistActionState,
  formData: FormData,
): Promise<RecipePicklistActionState> {
  const action = formData.get('action');
  const category = formData.get('category');
  const revisionValue = formData.get('revision');
  const revision = typeof revisionValue === 'string' ? Number(revisionValue) : NaN;
  const valueId = getUuid(formData, 'value_id');
  const targetId = getUuid(formData, 'target_id');
  const replacementId = getUuid(formData, 'replacement_id');
  const orderedIds = getUuidList(formData, 'ordered_id');
  const sourceIds = getUuidList(formData, 'source_id');
  const valueEntry = formData.get('value');
  const value = typeof valueEntry === 'string' ? valueEntry : null;

  if (
    typeof action !== 'string' ||
    !actions.has(action) ||
    typeof category !== 'string' ||
    !categories.has(category) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    valueId === undefined ||
    targetId === undefined ||
    replacementId === undefined ||
    orderedIds === undefined ||
    sourceIds === undefined ||
    ((action === 'add' || action === 'rename') && (!value || value.trim() === '')) ||
    ((action === 'rename' || action === 'delete') && valueId === null) ||
    (action === 'merge' && (sourceIds.length === 0 || targetId === null))
  ) {
    return { status: 'error', message: 'Choose a valid picklist change.' };
  }

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) {
    return { status: 'error', message: 'Sign in to manage recipe picklists.' };
  }

  const { error } = await supabase.rpc('manage_recipe_picklist', {
    p_action: action,
    p_category: category,
    p_expected_revision: revision,
    p_value_id: valueId,
    p_value: value,
    p_ordered_ids: orderedIds,
    p_source_ids: sourceIds,
    p_target_id: targetId,
    p_replacement_id: replacementId,
    p_clear_optional: formData.get('clear_optional') === 'true',
  });

  if (error?.code === '40001') {
    return {
      status: 'conflict',
      message: 'This picklist changed in another session. The latest values are loading.',
    };
  }
  if (error) {
    return { status: 'error', message: 'Recipe picklist could not be updated.' };
  }

  return { status: 'saved', message: 'Recipe picklist updated.' };
}
