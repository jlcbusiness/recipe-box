import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, createAdminClient, createExportDownload } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  createExportDownload: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('../../src/lib/exports/server', () => ({
  createExportDownload,
  isExportScopeAvailable: vi.fn(() => true),
  ExportTooLargeError: class ExportTooLargeError extends Error {},
}));

import { POST } from '../../src/app/api/exports/route';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('export route failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['Storage upload failure', 'cleanup queue failure'])(
    'does not record a completed database export after %s',
    async (failure) => {
      const accountUpdate = vi.fn();
      const admin = {
        rpc: vi.fn().mockResolvedValue({
          data: { accountPreferences: {}, records: {} },
          error: null,
        }),
        from: vi.fn(() => ({ update: accountUpdate })),
      };
      createClient.mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: accountId } },
            error: null,
          }),
        },
      });
      createAdminClient.mockReturnValue(admin);
      createExportDownload.mockRejectedValue(new Error(failure));

      const response = await POST(
        new Request('http://localhost/api/exports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: { type: 'database' } }),
        }),
      );

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: 'Unable to prepare the export. Please try again.',
      });
      expect(createExportDownload).toHaveBeenCalledOnce();
      expect(admin.from).not.toHaveBeenCalled();
      expect(accountUpdate).not.toHaveBeenCalled();
    },
  );
});
