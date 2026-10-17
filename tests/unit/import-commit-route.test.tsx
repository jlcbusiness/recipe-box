import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClient,
  createAdminClient,
  createImportImageStager,
  processMediaDeletions,
  queueMediaDeletions,
  readStoredImportBundle,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  createImportImageStager: vi.fn(),
  processMediaDeletions: vi.fn(),
  queueMediaDeletions: vi.fn(),
  readStoredImportBundle: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('../../src/lib/imports/media', () => ({ createImportImageStager }));
vi.mock('../../src/lib/media/server', () => ({ processMediaDeletions, queueMediaDeletions }));
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
const importedPublicationId = '11111111-1111-4111-8111-111111111111';
const existingPublicationId = '22222222-2222-4222-8222-222222222222';
const importedRecipeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const existingRecipeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const sourceAssetId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
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

function publicationMediaBundle() {
  return {
    data: {
      scope: { type: 'publication' as const, id: importedPublicationId },
      account_preferences: {},
      records: {
        ...emptyRecords(),
        publications: [
          {
            id: importedPublicationId,
            publication_type: 'book',
            name: 'Portable Baking Annual',
          },
        ],
        media_assets: [
          {
            id: sourceAssetId,
            publication_id: importedPublicationId,
            recipe_id: null,
            asset_type: 'publication_cover',
            status: 'ready',
            full_path: `images/${sourceAssetId}/full.webp`,
            thumbnail_path: `images/${sourceAssetId}/thumbnail.webp`,
            content_type: 'image/webp',
            byte_size: 12,
            width: 10,
            height: 10,
          },
        ],
      },
    },
    manifest: { format_version: 1 },
    images: new Map(),
  };
}

function mockStagedImages() {
  const stagedPaths = new Set<string>();
  const stagedObjects: string[] = [];
  createImportImageStager.mockImplementation(
    (_admin: unknown, ownerId: string, destinationAssetIds: Map<string, string>) => {
      const destinationAssetId = destinationAssetIds.get(sourceAssetId);
      const fullPath = `${ownerId}/assets/${destinationAssetId}/full.webp`;
      const thumbnailPath = `${ownerId}/assets/${destinationAssetId}/thumb.webp`;
      stagedObjects.push(fullPath, thumbnailPath);
      stagedPaths.add(fullPath);
      stagedPaths.add(thumbnailPath);
      return {
        imageSink: vi.fn(),
        stagedPaths,
        pathsBySourceAsset: new Map([[sourceAssetId, { fullPath, thumbnailPath }]]),
        metadataBySourceAsset: new Map([[sourceAssetId, { byteSize: 12, width: 10, height: 10 }]]),
      };
    },
  );
  return { stagedObjects, stagedPaths };
}

describe('import commit route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processMediaDeletions.mockResolvedValue({ failed: [] });
    queueMediaDeletions.mockResolvedValue(undefined);
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: accountId } }, error: null }),
      },
    });
    readStoredImportBundle.mockResolvedValue({
      data: {
        scope: { type: 'database' },
        account_preferences: {},
        records: { ...emptyRecords(), recipes: [{ id: importedRecipeId, name: 'Lemon cake' }] },
      },
      images: new Map(),
    });
  });

  it('replans against the current snapshot and submits one atomic RPC', async () => {
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
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
        p_account_preferences: {},
        p_expected_versions: [],
        p_records: expect.objectContaining({
          recipes: [expect.objectContaining({ id: expect.any(String) })],
        }),
      }),
    );
  });

  it('requires an account-settings choice and only applies archive settings when selected', async () => {
    readStoredImportBundle.mockResolvedValue({
      data: {
        scope: { type: 'database' },
        account_preferences: { volume_system: 'metric' },
        records: emptyRecords(),
      },
      images: new Map(),
    });
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
      if (name === 'read_export_snapshot') {
        return { data: { records: {}, accountPreferences: {} }, error: null };
      }
      return { data: { recipes: 0 }, error: null };
    });
    createAdminClient.mockReturnValue({ rpc });

    const missingChoice = await POST(request({ path: importPath, choices: {}, rootVersions: [] }));
    expect(missingChoice.status).toBe(400);

    const useArchive = await POST(
      request({
        path: importPath,
        choices: {},
        rootVersions: [],
        accountPreferencesAction: 'archive',
      }),
    );
    expect(useArchive.status).toBe(200);

    const keepCurrent = await POST(
      request({
        path: importPath,
        choices: {},
        rootVersions: [],
        accountPreferencesAction: 'keep',
      }),
    );
    expect(keepCurrent.status).toBe(200);

    const commitCalls = rpc.mock.calls.filter(([name]) => name === 'commit_database_import');
    expect(commitCalls.map(([, args]) => args.p_account_preferences)).toEqual([
      { volume_system: 'metric' },
      {},
    ]);
  });

  it('automatically replaces matched recipes when the publication choice is replace', async () => {
    readStoredImportBundle.mockResolvedValueOnce({
      data: {
        scope: { type: 'publication', id: importedPublicationId },
        account_preferences: {},
        records: {
          ...emptyRecords(),
          publications: [
            { id: importedPublicationId, publication_type: 'book', name: 'Baking Annual' },
          ],
          recipes: [
            {
              id: importedRecipeId,
              publication_id: importedPublicationId,
              name: 'Lemon cake',
            },
          ],
        },
      },
      images: new Map(),
    });
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
      if (name === 'read_export_snapshot') {
        return {
          data: {
            records: {
              publications: [
                {
                  id: existingPublicationId,
                  publication_type: 'book',
                  name: 'Baking Annual',
                  version: 4,
                  trashed_at: null,
                },
              ],
              recipes: [
                {
                  id: existingRecipeId,
                  publication_id: existingPublicationId,
                  name: 'Lemon cake',
                  version: 7,
                  trashed_at: null,
                },
              ],
            },
          },
          error: null,
        };
      }
      return { data: { recipes: 1 }, error: null };
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      request({
        path: importPath,
        expectedScope: 'publication',
        choices: {
          [`publication:${importedPublicationId}`]: {
            action: 'replace',
            targetId: existingPublicationId,
          },
        },
        rootVersions: [
          {
            kind: 'publication',
            incomingId: importedPublicationId,
            targetId: existingPublicationId,
            version: 4,
          },
          {
            kind: 'recipe',
            incomingId: importedRecipeId,
            targetId: existingRecipeId,
            version: 7,
          },
        ],
      }),
    );
    const body = await response.json();
    const commitArgs = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.imported).toBe(true);
    expect(commitArgs.p_replace_publication_ids).toEqual([existingPublicationId]);
    expect(commitArgs.p_replace_recipe_ids).toEqual([existingRecipeId]);
  });

  it('omits a missing publication and commits recipes to selected destinations', async () => {
    readStoredImportBundle.mockResolvedValueOnce({
      data: {
        scope: { type: 'publication', id: importedPublicationId },
        account_preferences: {},
        records: {
          ...emptyRecords(),
          publications: [
            { id: importedPublicationId, publication_type: 'book', name: 'Baking Annual' },
          ],
          recipes: [
            {
              id: importedRecipeId,
              publication_id: importedPublicationId,
              name: 'Lemon cake',
            },
          ],
        },
      },
      images: new Map(),
    });
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
      if (name === 'read_export_snapshot') {
        return {
          data: {
            records: {
              publications: [
                {
                  id: existingPublicationId,
                  publication_type: 'magazine',
                  name: 'Other publication',
                  version: 2,
                  trashed_at: null,
                },
              ],
              recipes: [],
            },
          },
          error: null,
        };
      }
      return { data: { recipes: 1 }, error: null };
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      request({
        path: importPath,
        expectedScope: 'publication',
        omitSourcePublication: true,
        recipeDestinationPublicationIds: { [importedRecipeId]: existingPublicationId },
        choices: {},
        rootVersions: [],
      }),
    );
    const body = await response.json();
    const commitArgs = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const records = commitArgs.p_records as Record<string, Array<Record<string, unknown>>>;

    expect(response.status).toBe(200);
    expect(records.publications).toEqual([]);
    expect(records.recipes).toEqual([
      expect.objectContaining({ publication_id: existingPublicationId }),
    ]);
    expect(body.destination).toEqual({ type: 'publication' });
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

  it('rejects a stale recipe-scoped replacement before staging or commit', async () => {
    readStoredImportBundle.mockResolvedValueOnce({
      data: {
        scope: { type: 'recipe', id: importedRecipeId },
        account_preferences: {},
        records: {
          ...emptyRecords(),
          publications: [
            { id: importedPublicationId, publication_type: 'book', name: 'Baking Annual' },
          ],
          recipes: [
            {
              id: importedRecipeId,
              publication_id: importedPublicationId,
              name: 'Lemon cake',
            },
          ],
        },
      },
      images: new Map(),
    });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        records: {
          publications: [
            {
              id: existingPublicationId,
              publication_type: 'book',
              name: 'Baking Annual',
              version: 4,
              trashed_at: null,
            },
          ],
          recipes: [
            {
              id: existingRecipeId,
              publication_id: existingPublicationId,
              name: 'Lemon cake',
              version: 8,
            },
          ],
        },
      },
      error: null,
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      request({
        path: importPath,
        expectedScope: 'recipe',
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
    expect(createImportImageStager).not.toHaveBeenCalled();
  });

  it('commits a recipe bundle against a linked destination publication', async () => {
    readStoredImportBundle.mockResolvedValueOnce({
      data: {
        scope: { type: 'recipe', id: importedRecipeId },
        account_preferences: {},
        records: {
          ...emptyRecords(),
          publications: [
            { id: importedPublicationId, publication_type: 'book', name: 'Baking Annual' },
          ],
          recipes: [
            {
              id: importedRecipeId,
              publication_id: importedPublicationId,
              name: 'Lemon cake',
            },
          ],
        },
      },
      images: new Map(),
    });
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
      if (name === 'read_export_snapshot') {
        return {
          data: {
            records: {
              publications: [
                {
                  id: existingPublicationId,
                  publication_type: 'book',
                  name: 'Baking Annual',
                  version: 4,
                  trashed_at: null,
                },
              ],
              recipes: [
                {
                  id: existingRecipeId,
                  publication_id: existingPublicationId,
                  name: 'Lemon cake',
                  version: 7,
                },
              ],
            },
          },
          error: null,
        };
      }
      return { data: { recipes: 1 }, error: null };
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      request({
        path: importPath,
        recipeDestinationPublicationIds: {
          [importedRecipeId]: existingPublicationId,
        },
        choices: {
          [`recipe:${importedRecipeId}`]: {
            action: 'duplicate',
            targetId: existingRecipeId,
          },
        },
        rootVersions: [
          {
            kind: 'recipe',
            incomingId: importedRecipeId,
            targetId: existingRecipeId,
            version: 7,
          },
        ],
      }),
    );
    const body = await response.json();
    const commitArgs = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const records = commitArgs.p_records as Record<string, Array<Record<string, unknown>>>;

    expect(response.status).toBe(200);
    expect(body.destination).toMatchObject({ type: 'recipe' });
    expect(body.destination.id).toBe(records.recipes[0].id);
    expect(records.publications).toEqual([]);
    expect(records.recipes[0]).toMatchObject({
      publication_id: existingPublicationId,
      name: 'Lemon cake (Imported)',
    });
    expect(commitArgs.p_account_preferences).toEqual({});
  });

  it('does not commit any records when a scoped recipe is ignored', async () => {
    readStoredImportBundle.mockResolvedValueOnce({
      data: {
        scope: { type: 'recipe', id: importedRecipeId },
        account_preferences: {},
        records: {
          ...emptyRecords(),
          publications: [
            { id: importedPublicationId, publication_type: 'collection', name: 'Recipe Tin' },
          ],
          recipes: [
            {
              id: importedRecipeId,
              publication_id: importedPublicationId,
              name: 'Milk Toast',
            },
          ],
        },
      },
      images: new Map(),
    });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        records: {
          publications: [
            {
              id: existingPublicationId,
              publication_type: 'collection',
              name: 'Recipe Tin',
              version: 1,
              trashed_at: null,
            },
          ],
          recipes: [
            {
              id: existingRecipeId,
              publication_id: existingPublicationId,
              name: 'Milk Toast',
              version: 2,
            },
          ],
        },
        accountPreferences: {},
      },
      error: null,
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      request({
        path: importPath,
        expectedScope: 'recipe',
        choices: {
          [`recipe:${importedRecipeId}`]: { action: 'keep', targetId: existingRecipeId },
        },
        rootVersions: [
          { kind: 'recipe', incomingId: importedRecipeId, targetId: existingRecipeId, version: 2 },
        ],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      imported: false,
      ignored: true,
      destination: null,
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(createImportImageStager).not.toHaveBeenCalled();
  });

  it('explains when the local database is missing the import RPC migration', async () => {
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) =>
      name === 'read_export_snapshot'
        ? { data: { records: {}, accountPreferences: {} }, error: null }
        : { data: null, error: { code: 'PGRST202' } },
    );
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(request({ path: importPath, choices: {}, rootVersions: [] }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Database import is unavailable until the latest database migrations are applied.',
    });
  });

  it('stages publication media and returns the remapped publication destination', async () => {
    readStoredImportBundle.mockResolvedValue(publicationMediaBundle());
    const { stagedObjects } = mockStagedImages();
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
      if (name === 'read_export_snapshot') {
        return { data: { records: {}, accountPreferences: {} }, error: null };
      }
      return { data: { publications: 1 }, error: null };
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      request({ path: importPath, expectedScope: 'publication', choices: {}, rootVersions: [] }),
    );
    const body = await response.json();
    const commitArgs = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    const records = commitArgs.p_records as Record<string, Array<Record<string, unknown>>>;
    const destinationAssetId = records.media_assets[0].id;

    expect(response.status).toBe(200);
    expect(body.destination).toEqual({ type: 'publication', id: records.publications[0].id });
    expect(body.destination.id).not.toBe(importedPublicationId);
    expect(records.media_assets[0]).toMatchObject({
      id: destinationAssetId,
      publication_id: records.publications[0].id,
    });
    expect(stagedObjects).toEqual([
      `${accountId}/assets/${destinationAssetId}/full.webp`,
      `${accountId}/assets/${destinationAssetId}/thumb.webp`,
    ]);
    expect(commitArgs.p_account_preferences).toEqual({});
    expect(readStoredImportBundle).toHaveBeenCalledTimes(2);
    expect(readStoredImportBundle.mock.calls[1]?.[3]).toEqual(expect.any(Function));
    expect(createImportImageStager).toHaveBeenCalledWith(
      expect.anything(),
      accountId,
      new Map([[sourceAssetId, destinationAssetId]]),
    );
    expect(processMediaDeletions).not.toHaveBeenCalled();
  });

  it('cleans staged publication media when the atomic commit fails', async () => {
    readStoredImportBundle.mockResolvedValue(publicationMediaBundle());
    const { stagedObjects } = mockStagedImages();
    const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
      if (name === 'read_export_snapshot') {
        return { data: { records: {}, accountPreferences: {} }, error: null };
      }
      return { data: null, error: { code: '23514' } };
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      request({ path: importPath, expectedScope: 'publication', choices: {}, rootVersions: [] }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('Unable to import this archive. No changes were committed.');
    expect(queueMediaDeletions).toHaveBeenCalledWith(
      expect.anything(),
      accountId,
      expect.arrayContaining(stagedObjects),
    );
    expect(processMediaDeletions).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(stagedObjects),
    );
  });

  it('rejects a bundle whose scope does not match the requested import action', async () => {
    const rpc = vi.fn();
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      request({ path: importPath, expectedScope: 'recipe', choices: {}, rootVersions: [] }),
    );

    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});
