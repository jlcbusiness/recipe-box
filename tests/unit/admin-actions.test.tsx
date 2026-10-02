import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, createAdminClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { grantAdmin, sendInvitation } from '../../src/app/admin/actions';

describe('admin actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not send an invitation without an authenticated user', async () => {
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });
    const formData = new FormData();
    formData.set('email', 'person@example.test');

    await expect(sendInvitation(undefined, formData)).resolves.toEqual({
      error: 'You do not have permission to send invitations.',
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('does not grant admin status to a non-admin account', async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null }),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: { is_admin: false } }),
          })),
        })),
      })),
    });
    const formData = new FormData();
    formData.set('accountId', '00000000-0000-4000-8000-000000000001');

    await expect(grantAdmin(formData)).resolves.toBeUndefined();
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
