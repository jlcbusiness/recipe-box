import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, refresh } = vi.hoisted(() => ({
  createClient: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { saveUnitPreferences } from '../../src/app/actions/unit-preferences';
import { UnitPreferences } from '../../src/app/settings/unit-preferences';

afterEach(cleanup);

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

  it('restores the saved value and announces a failed save', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: new Error('Database unavailable.') });
    const getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null });
    createClient.mockResolvedValue({ auth: { getUser }, rpc });
    render(<UnitPreferences volumeSystem="us_customary" weightSystem="us_customary" />);

    const weightPreference = screen.getByRole('combobox', { name: 'Weight' });
    fireEvent.click(weightPreference);
    fireEvent.click(screen.getByRole('option', { name: 'Metric' }));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Unit defaults could not be saved.');
      expect(weightPreference.textContent).toContain('US customary');
    });
    expect(rpc).toHaveBeenCalledWith('update_account_unit_preferences', {
      p_volume_system: null,
      p_weight_system: 'metric',
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
