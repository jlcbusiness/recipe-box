import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));

import { manageRecipePicklist } from '../../src/app/actions/recipe-picklists';

describe('recipe picklist action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid action input before creating an authenticated client', async () => {
    const formData = new FormData();
    formData.set('action', 'add');
    formData.set('category', 'not-a-category');
    formData.set('revision', '1');

    await expect(manageRecipePicklist({}, formData)).resolves.toEqual({
      status: 'error',
      message: 'Choose a valid picklist change.',
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('authenticates and forwards the submitted operation to the owner-scoped RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 4, error: null });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    const formData = new FormData();
    formData.set('action', 'add');
    formData.set('category', 'food_type');
    formData.set('revision', '3');
    formData.set('value', 'Soup');

    await expect(manageRecipePicklist({}, formData)).resolves.toEqual({
      status: 'saved',
      message: 'Recipe picklist updated.',
    });
    expect(getUser).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('manage_recipe_picklist', {
      p_action: 'add',
      p_category: 'food_type',
      p_expected_revision: 3,
      p_value_id: null,
      p_value: 'Soup',
      p_ordered_ids: [],
      p_source_ids: [],
      p_target_id: null,
      p_replacement_id: null,
      p_clear_optional: false,
    });
  });

  it('reports stale revisions and requests a refresh', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '40001' } });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    const formData = new FormData();
    formData.set('action', 'reorder');
    formData.set('category', 'food_type');
    formData.set('revision', '2');

    await expect(manageRecipePicklist({}, formData)).resolves.toEqual({
      status: 'conflict',
      message: 'This picklist changed in another session. The latest values are loading.',
    });
  });
});
