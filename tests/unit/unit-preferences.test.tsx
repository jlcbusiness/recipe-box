import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));

import { saveUnitPreferences } from '../../src/app/actions/unit-preferences';

describe('unit preference action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a visible error when saving account defaults fails', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error('Database unavailable.') });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    const formData = new FormData();
    formData.set('changed_dimension', 'weight');
    formData.set('weight_system', 'metric');

    await expect(saveUnitPreferences({}, formData)).resolves.toEqual({
      status: 'error',
      message: 'Unit defaults could not be saved.',
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_volume_system: null,
      p_weight_system: 'metric',
    });
  });
});
