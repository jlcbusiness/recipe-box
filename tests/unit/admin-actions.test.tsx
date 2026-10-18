import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, createAdminClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  deleteAccount,
  demoteAdmin,
  grantAdmin,
  sendInvitation,
  transferAccountOwner,
} from '../../src/app/admin/actions';

function mockAuthenticatedActor(account: { is_admin: boolean; is_owner: boolean }) {
  createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'actor-id' } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: account, error: null }),
        })),
      })),
    })),
  });
}

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

    await expect(grantAdmin(undefined, formData)).resolves.toEqual({
      error: 'You do not have permission to grant administrator access.',
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('does not allow a non-owner admin to delete an administrator', async () => {
    mockAuthenticatedActor({ is_admin: true, is_owner: false });
    const deleteUser = vi.fn();
    createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { is_admin: true, is_owner: false },
              error: null,
            }),
          })),
        })),
      })),
      auth: { admin: { deleteUser } },
    } as never);
    const formData = new FormData();
    formData.set('accountId', '00000000-0000-4000-8000-000000000002');

    await expect(deleteAccount(undefined, formData)).resolves.toEqual({
      error: 'Only the owner can delete an administrator account.',
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('allows an admin to permanently delete a regular account', async () => {
    mockAuthenticatedActor({ is_admin: true, is_owner: false });
    const targetId = '00000000-0000-4000-8000-000000000002';
    const deleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
    const adminClient = {
      from: vi.fn((table: string) => {
        if (table === 'accounts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { is_admin: false, is_owner: false },
                  error: null,
                }),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }),
      storage: {
        from: vi.fn(() => ({
          list: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
      auth: { admin: { deleteUser } },
    };
    createAdminClient.mockReturnValue(adminClient as never);
    const formData = new FormData();
    formData.set('accountId', targetId);

    await expect(deleteAccount(undefined, formData)).resolves.toEqual({
      message: 'Account permanently deleted.',
    });
    expect(deleteUser).toHaveBeenCalledWith(targetId);
  });

  it('does not allow a non-owner admin to transfer ownership', async () => {
    mockAuthenticatedActor({ is_admin: true, is_owner: false });
    const rpc = vi.fn();
    createAdminClient.mockReturnValue({ rpc } as never);
    const formData = new FormData();
    formData.set('accountId', '00000000-0000-4000-8000-000000000002');

    await expect(transferAccountOwner(undefined, formData)).resolves.toEqual({
      error: 'Only the owner can transfer ownership.',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not allow a non-owner admin to demote another administrator', async () => {
    mockAuthenticatedActor({ is_admin: true, is_owner: false });
    const update = vi.fn();
    createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { is_admin: true, is_owner: false },
              error: null,
            }),
          })),
        })),
        update,
      })),
    } as never);
    const formData = new FormData();
    formData.set('accountId', '00000000-0000-4000-8000-000000000002');

    await expect(demoteAdmin(undefined, formData)).resolves.toEqual({
      error: 'Only the owner can remove administrator access.',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('transfers ownership through the database action for the current owner', async () => {
    mockAuthenticatedActor({ is_admin: true, is_owner: true });
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    createAdminClient.mockReturnValue({ rpc } as never);
    const targetId = '00000000-0000-4000-8000-000000000002';
    const formData = new FormData();
    formData.set('accountId', targetId);

    await expect(transferAccountOwner(undefined, formData)).resolves.toEqual({
      message: 'Account ownership transferred.',
    });
    expect(rpc).toHaveBeenCalledWith('transfer_account_owner', {
      p_current_owner_id: 'actor-id',
      p_new_owner_id: targetId,
    });
  });
});
