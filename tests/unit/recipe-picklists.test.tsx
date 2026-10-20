import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../src/lib/supabase/server', () => ({ createClient }));

import {
  createOrGetRecipePicklistValue,
  manageRecipePicklist,
} from '../../src/app/actions/recipe-picklists';

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

  it('validates category and non-empty value before creating an in-editor picklist value', async () => {
    await expect(createOrGetRecipePicklistValue('verdict' as never, 'Great')).resolves.toEqual({
      error: 'Choose a valid picklist category.',
    });
    await expect(createOrGetRecipePicklistValue('equipment', '   ')).resolves.toEqual({
      error: 'Enter a value before adding.',
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('reuses a case-insensitively matching picklist value without creating a duplicate', async () => {
    const existingRow = {
      id: '11111111-1111-4111-8111-111111111111',
      category: 'equipment' as const,
      value: 'Dutch oven',
      display_value: 'Dutch oven',
      sort_order: 3,
      is_protected: false,
    };
    const rpc = vi.fn();
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    const order = vi.fn().mockResolvedValue({ data: [existingRow], error: null });
    const eqCategory = vi.fn().mockReturnValue({ order });
    const eqAccount = vi.fn().mockReturnValue({ eq: eqCategory });
    const select = vi.fn().mockReturnValue({ eq: eqAccount });
    const from = vi.fn().mockReturnValue({ select });
    createClient.mockResolvedValue({ auth: { getUser }, from, rpc });

    await expect(createOrGetRecipePicklistValue('equipment', '  dutch   OVEN ')).resolves.toEqual({
      value: existingRow,
      created: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('adds a normalized picklist value using the current category revision and returns it', async () => {
    const createdRow = {
      id: '22222222-2222-4222-8222-222222222222',
      category: 'cuisine' as const,
      value: 'Peruvian Nikkei',
      display_value: 'Peruvian Nikkei',
      sort_order: 8,
      is_protected: false,
    };
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    let valuesCallCount = 0;
    const from = vi.fn((table: string) => {
      if (table === 'recipe_picklist_values') {
        valuesCallCount += 1;
        const rows = valuesCallCount === 1 ? [] : [createdRow];
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: rows, error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { revision: 1 }, error: null }),
            }),
          }),
        }),
      };
    });
    createClient.mockResolvedValue({ auth: { getUser }, from, rpc });

    await expect(
      createOrGetRecipePicklistValue('cuisine', '  Peruvian   Nikkei  '),
    ).resolves.toEqual({
      value: createdRow,
      created: true,
    });
    expect(rpc).toHaveBeenCalledWith('manage_recipe_picklist', {
      p_action: 'add',
      p_category: 'cuisine',
      p_expected_revision: 1,
      p_value_id: null,
      p_value: 'Peruvian Nikkei',
      p_ordered_ids: [],
      p_source_ids: [],
      p_target_id: null,
      p_replacement_id: null,
      p_clear_optional: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/settings');
  });

  it('surfaces an error without claiming success when picklist creation fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    const from = vi.fn((table: string) => {
      if (table === 'recipe_picklist_values') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { revision: 1 }, error: null }),
            }),
          }),
        }),
      };
    });
    createClient.mockResolvedValue({ auth: { getUser }, from, rpc });

    await expect(createOrGetRecipePicklistValue('food_type', 'Galette')).resolves.toEqual({
      error: 'Picklist value could not be added. Try again.',
    });
  });
});
