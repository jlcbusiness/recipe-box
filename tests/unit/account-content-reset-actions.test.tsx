import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, createAdminClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

import { checkAccountContentResetCleanup } from '../../src/app/settings/account-content-reset-actions';

describe('account cleanup status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an authenticated account before checking cleanup queues', async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    await expect(checkAccountContentResetCleanup()).resolves.toEqual({
      error: 'Sign in again before checking storage cleanup status.',
    });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('reports the current authenticated account queue counts', async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null }),
      },
    });
    const from = vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({
          count: table === 'media_deletion_queue' ? 20 : 1,
          error: null,
        }),
      })),
    }));
    createAdminClient.mockReturnValue({ from } as never);

    await expect(checkAccountContentResetCleanup()).resolves.toEqual({
      status: {
        cleanupStatus: 'pending',
        pendingMedia: 20,
        pendingExports: 1,
      },
    });
    expect(from).toHaveBeenNthCalledWith(1, 'media_deletion_queue');
    expect(from).toHaveBeenNthCalledWith(2, 'export_deletion_queue');
  });

  it('returns an explicit error when a cleanup queue cannot be checked', async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'account-id' } }, error: null }),
      },
    });
    const from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({
          count: null,
          error: { message: 'query failed' },
        }),
      })),
    }));
    createAdminClient.mockReturnValue({ from } as never);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(checkAccountContentResetCleanup()).resolves.toEqual({
      error:
        'Storage cleanup status could not be refreshed. Your last reported status is unchanged.',
    });
    expect(consoleError).toHaveBeenCalledWith(
      'Unable to refresh account reset cleanup status.',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
