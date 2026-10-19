'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';

export type IngredientCatalogActionState = {
  status?: 'saved' | 'conflict' | 'error';
  message?: string;
  revision?: number;
};

const actions = new Set(['add', 'rename', 'merge', 'delete']);
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

export async function manageIngredientCatalog(
  _previousState: IngredientCatalogActionState,
  formData: FormData,
): Promise<IngredientCatalogActionState> {
  const action = formData.get('action');
  const revisionValue = formData.get('revision');
  const revision = typeof revisionValue === 'string' ? Number(revisionValue) : NaN;
  const ingredientId = getUuid(formData, 'ingredient_id');
  const replacementId = getUuid(formData, 'replacement_id');
  const orderedIds = getUuidList(formData, 'ordered_id');
  const nameEntry = formData.get('name');
  const name = typeof nameEntry === 'string' ? nameEntry : null;

  if (
    typeof action !== 'string' ||
    !actions.has(action) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    ingredientId === undefined ||
    replacementId === undefined ||
    orderedIds === undefined ||
    ((action === 'add' || action === 'rename') && (!name || name.trim() === '')) ||
    ((action === 'rename' || action === 'merge' || action === 'delete') && ingredientId === null) ||
    (action === 'merge' && replacementId === null)
  ) {
    return { status: 'error', message: 'Choose a valid ingredient catalog change.' };
  }

  const supabase = await createClient();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return { status: 'error', message: 'Sign in to manage ingredients.' };
  }

  const { data: nextRevision, error } = await supabase.rpc('manage_ingredient_catalog', {
    p_action: action,
    p_expected_revision: revision,
    p_ingredient_id: ingredientId,
    p_name: name,
    p_ordered_ids: orderedIds,
    p_replacement_id: replacementId,
  });

  if (error?.code === '40001' || error?.code === 'PT409') {
    return {
      status: 'conflict',
      message: 'The ingredient catalog changed in another session. The latest values are loading.',
    };
  }
  if (error?.code === '23505') {
    return { status: 'error', message: 'An ingredient with that name already exists.' };
  }
  if (error) {
    return { status: 'error', message: 'Ingredient catalog could not be updated.' };
  }

  revalidatePath('/settings');
  revalidatePath('/recipes');
  return {
    status: 'saved',
    message: 'Ingredient catalog updated.',
    revision: typeof nextRevision === 'number' ? nextRevision : revision + 1,
  };
}
