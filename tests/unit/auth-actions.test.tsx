import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));

import { updatePassword } from '../../src/app/actions/auth';

describe('password recovery action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains when the new password matches the current password', async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { code: 'same_password' } });
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null }),
        updateUser,
      },
    });
    const formData = new FormData();
    formData.set('password', 'current-password-42');

    await expect(updatePassword(undefined, formData)).resolves.toEqual({
      error: 'Choose a password different from your current password.',
    });
    expect(updateUser).toHaveBeenCalledWith({ password: 'current-password-42' });
  });
});
