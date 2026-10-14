'use server';

import {
  createExplorerState,
  type ExplorerState,
  isExplorerStateContext,
} from '../../lib/explorer-state';
import { createClient } from '../../lib/supabase/server';

export type ExplorerStateActionResult = { error?: string };

export async function saveExplorerState(
  context: string,
  state: ExplorerState,
): Promise<ExplorerStateActionResult> {
  if (!isExplorerStateContext(context) || !createExplorerState(context, state)) {
    return { error: 'Explorer preference could not be saved.' };
  }

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) {
    return { error: 'Sign in to save explorer preferences.' };
  }

  const { error } = await supabase.rpc('update_explorer_state', {
    p_context_key: context,
    p_state: state,
  });
  return error ? { error: 'Explorer preference could not be saved.' } : {};
}
