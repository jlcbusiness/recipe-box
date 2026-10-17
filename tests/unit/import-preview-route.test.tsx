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
  isOwnedImportArchivePath: (ownerId: string, path: unknown) =>
    typeof path === 'string' &&
    path.startsWith(`${ownerId}/imports/`) &&
    /^[0-9a-f-]+\.zip$/i.test(path.slice(`${ownerId}/imports/`.length)),
}));

import { POST } from '../../src/app/api/imports/preview/route';
import { exportTableNames } from '../../src/lib/exports/rules';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const importedPublicationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const existingPublicationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const importedRecipeId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const existingRecipeId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const importPath = `${accountId}/imports/ffffffff-ffff-4fff-8fff-ffffffffffff.zip`;

function emptyRecords() {
  return Object.fromEntries(exportTableNames.map((table) => [table, []]));
}

describe('import preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: accountId } },
          error: null,
        }),
      },
    });
    readStoredImportBundle.mockResolvedValue({
      data: {
        scope: { type: 'database' },
        records: {
          ...emptyRecords(),
          publications: [
            { id: importedPublicationId, publication_type: 'book', name: 'Baking Annual' },
          ],
          recipes: [
            { id: importedRecipeId, publication_id: importedPublicationId, name: 'Lemon cake' },
          ],
        },
        account_preferences: { volume_system: 'metric' },
      },
      images: new Map(),
    });
  });

  it('returns detected root conflicts and archive counts without writing records', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        accountPreferences: {},
        records: {
          recipes: [
            {
              id: existingRecipeId,
              publication_id: existingPublicationId,
              name: 'Lemon cake',
              version: 7,
            },
          ],
          publications: [
            {
              id: existingPublicationId,
              publication_type: 'book',
              name: ' Baking Annual ',
              version: 3,
            },
          ],
        },
      },
      error: null,
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      new Request('http://localhost/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: importPath }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.conflicts).toEqual([
      {
        kind: 'publication',
        incomingId: importedPublicationId,
        incomingName: 'Baking Annual',
        candidates: [{ id: existingPublicationId, name: ' Baking Annual ', version: 3 }],
      },
      {
        kind: 'recipe',
        incomingId: importedRecipeId,
        incomingName: 'Lemon cake',
        candidates: [
          {
            id: existingRecipeId,
            name: 'Lemon cake',
            publicationId: existingPublicationId,
            publicationName: ' Baking Annual ',
            version: 7,
          },
        ],
      },
    ]);
    expect(body.counts.publications).toBe(1);
    expect(body.counts.recipes).toBe(1);
    expect(body.preferences).toEqual(['volume_system']);
    expect(body.privacy).toEqual({ privateRecipes: 1, publicRecipes: 0 });
    expect(readStoredImportBundle).toHaveBeenCalledWith(expect.anything(), accountId, importPath);
    expect(rpc).toHaveBeenCalledWith('read_export_snapshot', { p_account_id: accountId });
  });

  it('does not treat trashed publications or recipes as active import matches', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        records: {
          publications: [
            {
              id: existingPublicationId,
              publication_type: 'book',
              name: 'Baking Annual',
              version: 3,
              trashed_at: '2026-10-15T12:00:00Z',
            },
          ],
          recipes: [
            {
              id: existingRecipeId,
              publication_id: existingPublicationId,
              name: 'Lemon cake',
              version: 7,
              trashed_at: '2026-10-15T12:00:00Z',
            },
          ],
        },
      },
      error: null,
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      new Request('http://localhost/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: importPath }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ conflicts: [] });
  });

  it('includes recipe conflicts under the first candidate of an ambiguous database publication', async () => {
    const secondPublicationId = '11111111-1111-4111-8111-111111111111';
    const secondRecipeId = '22222222-2222-4222-8222-222222222222';
    const rpc = vi.fn().mockResolvedValue({
      data: {
        records: {
          publications: [
            {
              id: existingPublicationId,
              publication_type: 'book',
              name: 'Baking Annual',
              version: 3,
            },
            {
              id: secondPublicationId,
              publication_type: 'book',
              name: 'Baking Annual',
              version: 2,
            },
          ],
          recipes: [
            {
              id: existingRecipeId,
              publication_id: existingPublicationId,
              name: 'Lemon cake',
              version: 7,
            },
            {
              id: secondRecipeId,
              publication_id: secondPublicationId,
              name: 'Lemon cake',
              version: 4,
            },
          ],
        },
      },
      error: null,
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      new Request('http://localhost/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: importPath }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.conflicts).toContainEqual(
      expect.objectContaining({
        kind: 'recipe',
        incomingId: importedRecipeId,
        candidates: [
          expect.objectContaining({ id: existingRecipeId, publicationId: existingPublicationId }),
        ],
      }),
    );
  });

  it('matches a recipe across publications and returns destination choices immediately', async () => {
    const scopedBundle = {
      data: {
        scope: { type: 'recipe' as const, id: importedRecipeId },
        account_preferences: {},
        records: {
          ...emptyRecords(),
          publications: [
            { id: importedPublicationId, publication_type: 'book', name: 'Baking Annual' },
          ],
          recipes: [
            { id: importedRecipeId, publication_id: importedPublicationId, name: 'Lemon cake' },
          ],
        },
      },
      images: new Map(),
    };
    readStoredImportBundle.mockResolvedValue(scopedBundle);
    const rpc = vi.fn().mockResolvedValue({
      data: {
        records: {
          recipes: [
            {
              id: existingRecipeId,
              publication_id: existingPublicationId,
              name: 'Lemon cake',
              version: 7,
            },
          ],
          publications: [
            {
              id: existingPublicationId,
              publication_type: 'book',
              name: 'Baking Annual',
              version: 3,
              trashed_at: null,
            },
          ],
        },
      },
      error: null,
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      new Request('http://localhost/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: importPath }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.scope).toEqual({ type: 'recipe', id: importedRecipeId });
    expect(body.sourcePublication).toEqual({
      id: importedPublicationId,
      name: 'Baking Annual',
      destinationId: existingPublicationId,
      willCreate: false,
      candidateCount: 1,
    });
    expect(body.incomingRecipes).toEqual([{ id: importedRecipeId, name: 'Lemon cake' }]);
    expect(body.destinationPublications).toContainEqual({
      id: existingPublicationId,
      name: 'Baking Annual',
      publicationType: 'book',
    });
    expect(body.conflicts).toEqual([
      {
        kind: 'recipe',
        incomingId: importedRecipeId,
        incomingName: 'Lemon cake',
        candidates: [
          {
            id: existingRecipeId,
            name: 'Lemon cake',
            publicationId: existingPublicationId,
            publicationName: 'Baking Annual',
            version: 7,
          },
        ],
      },
    ]);
  });

  it('marks a missing source publication for automatic creation', async () => {
    readStoredImportBundle.mockResolvedValueOnce({
      data: {
        scope: { type: 'recipe' as const, id: importedRecipeId },
        account_preferences: {},
        records: {
          ...emptyRecords(),
          publications: [
            { id: importedPublicationId, publication_type: 'book', name: 'Baking Annual' },
          ],
          recipes: [
            { id: importedRecipeId, publication_id: importedPublicationId, name: 'Lemon cake' },
          ],
        },
      },
      images: new Map(),
    });
    const rpc = vi.fn().mockResolvedValue({
      data: { records: { recipes: [], publications: [] } },
      error: null,
    });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      new Request('http://localhost/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: importPath }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sourcePublication).toEqual({
      id: importedPublicationId,
      name: 'Baking Annual',
      destinationId: null,
      willCreate: true,
      candidateCount: 0,
    });
    expect(body.incomingRecipes).toEqual([{ id: importedRecipeId, name: 'Lemon cake' }]);
    expect(body.conflicts).toEqual([]);
  });

  it('reports an unmatched publication root for destination-only import choices', async () => {
    readStoredImportBundle.mockResolvedValueOnce({
      data: {
        scope: { type: 'publication' as const, id: importedPublicationId },
        account_preferences: {},
        records: {
          ...emptyRecords(),
          publications: [
            { id: importedPublicationId, publication_type: 'book', name: 'Baking Annual' },
          ],
          recipes: [
            { id: importedRecipeId, publication_id: importedPublicationId, name: 'Lemon cake' },
          ],
        },
      },
      images: new Map(),
    });
    const rpc = vi.fn().mockResolvedValue({ data: { records: {} }, error: null });
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      new Request('http://localhost/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: importPath, expectedScope: 'publication' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sourcePublication).toEqual({
      id: importedPublicationId,
      name: 'Baking Annual',
      destinationId: null,
      willCreate: true,
      candidateCount: 0,
    });
    expect(body.incomingRecipes).toEqual([{ id: importedRecipeId, name: 'Lemon cake' }]);
  });

  it('requires verified authentication before reading a bundle or account snapshot', async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    });

    const response = await POST(
      new Request('http://localhost/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: importPath }),
      }),
    );

    expect(response.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(readStoredImportBundle).not.toHaveBeenCalled();
  });

  it('rejects a path outside the authenticated owner namespace', async () => {
    const response = await POST(
      new Request('http://localhost/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/imports/${importPath}`,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(readStoredImportBundle).not.toHaveBeenCalled();
  });

  it('rejects a bundle whose scope does not match the requested import action', async () => {
    const rpc = vi.fn();
    createAdminClient.mockReturnValue({ rpc });

    const response = await POST(
      new Request('http://localhost/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: importPath, expectedScope: 'recipe' }),
      }),
    );

    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});
