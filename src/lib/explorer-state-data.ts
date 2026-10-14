import 'server-only';

import {
  createExplorerState,
  type ExplorerState,
  type ExplorerStateContext,
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
