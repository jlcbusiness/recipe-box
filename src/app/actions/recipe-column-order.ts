'use server';

import { normalizeHiddenRecipeColumns, normalizeRecipeColumnOrder } from '../../lib/explorer-state';
import { createClient } from '../../lib/supabase/server';

export type RecipeColumnOrderActionResult = { error?: string };

export async function saveRecipeColumnOrder(
  columnOrder: unknown,
): Promise<RecipeColumnOrderActionResult> {
  if (!Array.isArray(columnOrder)) {
    return { error: 'Recipe column order could not be saved.' };
  }
  const normalizedOrder = normalizeRecipeColumnOrder(columnOrder);
  if (normalizedOrder.some((key, index) => key !== columnOrder[index])) {
    return { error: 'Recipe column order could not be saved.' };
  }

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) {
    return { error: 'Sign in to save recipe column order.' };
  }

  const { error } = await supabase.rpc('update_recipe_column_order', {
    p_column_order: normalizedOrder,
  });
  return error ? { error: 'Recipe column order could not be saved.' } : {};
}

export async function saveRecipeHiddenColumns(
  hiddenColumns: unknown,
): Promise<RecipeColumnOrderActionResult> {
  if (!Array.isArray(hiddenColumns)) {
    return { error: 'Recipe column visibility could not be saved.' };
  }
  const normalizedColumns = normalizeHiddenRecipeColumns(hiddenColumns);
  if (
    normalizedColumns.length !== hiddenColumns.length ||
    normalizedColumns.some((key, index) => key !== hiddenColumns[index])
  ) {
    return { error: 'Recipe column visibility could not be saved.' };
  }

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) {
    return { error: 'Sign in to save recipe column visibility.' };
  }

  const { error } = await supabase.rpc('update_recipe_hidden_columns', {
    p_hidden_columns: normalizedColumns,
  });
  return error ? { error: 'Recipe column visibility could not be saved.' } : {};
}
