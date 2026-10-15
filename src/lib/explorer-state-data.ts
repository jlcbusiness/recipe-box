import 'server-only';

import {
  createExplorerState,
  defaultRecipeColumnOrder,
  type ExplorerState,
  type ExplorerStateContext,
  normalizeRecipeColumnOrder,
} from './explorer-state';
import type { RecipeSupabaseClient } from './recipes/data';

export async function getExplorerState(
  supabase: RecipeSupabaseClient,
  context: ExplorerStateContext,
): Promise<ExplorerState | null> {
  const { data, error } = await supabase
    .from('explorer_state')
    .select('state')
    .eq('context_key', context)
    .maybeSingle();

  if (error || !data) return null;
  return createExplorerState(context, data.state);
}

export async function getRecipeColumnSettings(supabase: RecipeSupabaseClient): Promise<{
  order: string[];
}> {
  const { data, error } = await supabase
    .from('accounts')
    .select('recipe_column_order')
    .maybeSingle();

  if (error || !data) {
    return { order: [...defaultRecipeColumnOrder] };
  }
  return {
    order: normalizeRecipeColumnOrder(data.recipe_column_order),
  };
}
