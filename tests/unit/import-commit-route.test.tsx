import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, createAdminClient, readStoredImportBundle } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  readStoredImportBundle: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('../../src/lib/imports/server', () => ({
  readStoredImportBundle,
  ImportBundleError: class ImportBundleError extends Error {
    status: number;
    constructor(message: string, status = 422) {
      super(message);
      this.status = status;
    }
  },
  isOwnedImportArchivePath: (ownerId: string, path: unknown) =>
    typeof path === 'string' &&
    path.startsWith(`${ownerId}/imports/`) &&
    /^[0-9a-f-]+\.zip$/i.test(path.slice(`${ownerId}/imports/`.length)),
}));

import { POST } from '../../src/app/api/imports/commit/route';
import { exportTableNames } from '../../src/lib/exports/rules';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const importedRecipeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const existingRecipeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const importPath = `${accountId}/imports/dddddddd-dddd-4ddd-8ddd-dddddddddddd.zip`;

function emptyRecords() {
  return Object.fromEntries(exportTableNames.map((table) => [table, []]));
}

function request(body: unknown) {
  return new Request('http://localhost/api/imports/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('import commit route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: accountId } }, error: null }),
      },
    });
    readStoredImportBundle.mockResolvedValue({
      data: {
        scope: { type: 'database' },
        account_preferences: { volume_system: 'metric' },
        records: { ...emptyRecords(), recipes: [{ id: importedRecipeId, name: 'Lemon cake' }] },
      },
      images: new Map(),
    });
  });

  it('replans against the current snapshot and submits one atomic RPC', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'read_export_snapshot') {
        return { data: { records: {}, accountPreferences: {} }, error: null };
      }
      return { data: { recipes: 1 }, error: null };
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(request({ path: importPath, choices: {}, rootVersions: [] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ imported: true, result: { recipes: 1 } });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith(
      'commit_database_import',
      expect.objectContaining({
        p_account_id: accountId,
        p_account_preferences: { volume_system: 'metric' },
        p_expected_versions: [],
        p_records: expect.objectContaining({
          recipes: [expect.objectContaining({ id: expect.any(String) })],
        }),
      }),
    );
  });

  it('rejects a stale preview version before the transactional RPC', async () => {
    readStoredImportBundle.mockResolvedValueOnce({
      data: {
        scope: { type: 'database' },
        account_preferences: {},
        records: {
          ...emptyRecords(),
          recipes: [{ id: importedRecipeId, publication_id: null, name: 'Lemon cake' }],
        },
      },
      images: new Map(),
    });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        records: { recipes: [{ id: existingRecipeId, name: 'Lemon cake', version: 8 }] },
        accountPreferences: {},
      },
      error: null,
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      request({
        path: importPath,
        choices: {
          [`recipe:${importedRecipeId}`]: { action: 'replace', targetId: existingRecipeId },
        },
        rootVersions: [
          { kind: 'recipe', incomingId: importedRecipeId, targetId: existingRecipeId, version: 7 },
        ],
      }),
    );

    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
