import { Blob } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClient,
  createClient,
  createImportImageStager,
  processMediaDeletions,
  queueMediaDeletions,
} = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  createImportImageStager: vi.fn(),
  processMediaDeletions: vi.fn(),
  queueMediaDeletions: vi.fn(),
}));

vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/imports/media', () => ({
  createImportImageStager,
  MAX_IMPORT_MEDIA_OBJECT_BYTES: 20 * 1024 * 1024,
}));
vi.mock('../../src/lib/media/server', () => ({ processMediaDeletions, queueMediaDeletions }));

import { POST } from '../../src/app/api/recipes/[id]/duplicate/route';
import { type ExportSnapshot, exportTableNames } from '../../src/lib/exports/rules';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceRecipeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sourcePublicationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const destinationPublicationId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const publicSourceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const sourceAssetId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function emptyRecords() {
  return Object.fromEntries(exportTableNames.map((table) => [table, []]));
}

function snapshotWithRecipe({
  includePhoto = false,
}: {
  includePhoto?: boolean;
} = {}): ExportSnapshot {
  const records = {
    ...emptyRecords(),
    recipes: [
      {
        id: sourceRecipeId,
        name: 'Citrus cake',
        publication_id: sourcePublicationId,
        version: 3,
        is_private: false,
        trashed_at: null,
        saved_from_public_id: publicSourceId,
      },
    ],
    publications: [
      {
        id: sourcePublicationId,
        publication_type: 'book',
        name: 'Baking Annual',
        author: null,
        edition: null,
        isbn: null,
        retailer_url: null,
        site_url: null,
        trashed_at: null,
      },
      {
        id: destinationPublicationId,
        publication_type: 'book',
        name: 'Family Recipes',
        author: null,
        edition: null,
        isbn: null,
        retailer_url: null,
        site_url: null,
        trashed_at: null,
      },
    ],
    recipe_references: [
      {
        account_id: accountId,
        recipe_id: sourceRecipeId,
        reference_type: 'external_url',
        source_public_id: publicSourceId,
        is_protected_source: true,
        display_text: 'Original public recipe',
        url: 'https://example.test/recipe',
      },
    ],
    media_assets: includePhoto
      ? [
          {
            id: sourceAssetId,
            recipe_id: sourceRecipeId,
            publication_id: null,
            asset_type: 'recipe_photo',
            status: 'ready',
            full_path: `${accountId}/assets/${sourceAssetId}/full.webp`,
            thumbnail_path: `${accountId}/assets/${sourceAssetId}/thumb.webp`,
            source_full_path: `${accountId}/assets/${sourceAssetId}/full.webp`,
            source_thumbnail_path: `${accountId}/assets/${sourceAssetId}/thumb.webp`,
            source_byte_size: 12,
            content_type: 'image/webp',
            byte_size: 12,
            width: 10,
            height: 10,
          },
        ]
      : [],
  };
  return { accountPreferences: {}, records };
}

function request(
  body: unknown = { name: 'Citrus cake (Copy)', publicationId: destinationPublicationId },
) {
  return new Request(`http://localhost/api/recipes/${sourceRecipeId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function context(id = sourceRecipeId) {
  return { params: Promise.resolve({ id }) };
}

function configure({
  authenticated = true,
  snapshot = snapshotWithRecipe(),
  commitResult = { data: { recipes: 1 }, error: null },
}: {
  authenticated?: boolean;
  snapshot?: ReturnType<typeof snapshotWithRecipe>;
  commitResult?: { data: unknown; error: null | { code: string } };
} = {}) {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) =>
    name === 'read_export_snapshot' ? { data: snapshot, error: null } : commitResult,
  );
  const download = vi.fn().mockResolvedValue({
    data: new Blob(['webp-bytes'], { type: 'image/webp' }),
    error: null,
  });
  const admin = {
    rpc,
    storage: { from: vi.fn(() => ({ download })) },
  };
  createClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: authenticated ? { id: accountId } : null },
        error: null,
      }),
    },
  });
  createAdminClient.mockReturnValue(admin);
  createImportImageStager.mockImplementation(
    (_admin: unknown, ownerId: string, destinationIds: Map<string, string>) => {
      const destinationAssetId = destinationIds.get(sourceAssetId);
      const stagedPaths = new Set<string>();
      if (destinationAssetId) {
        stagedPaths.add(`${ownerId}/assets/${destinationAssetId}/full.webp`);
        stagedPaths.add(`${ownerId}/assets/${destinationAssetId}/thumb.webp`);
      }
      return {
        imageSink: vi.fn().mockResolvedValue(undefined),
        finish: vi.fn().mockResolvedValue(undefined),
        stagedPaths,
        pathsBySourceAsset: new Map(),
        metadataBySourceAsset: new Map(),
      };
    },
  );
  queueMediaDeletions.mockResolvedValue(undefined);
  processMediaDeletions.mockResolvedValue({ failed: [] });
  return { admin, download, rpc };
}

describe('recipe duplicate route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a server-verified user before reading the account snapshot', async () => {
    const { rpc } = configure({ authenticated: false });

    const response = await POST(request(), context());

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid input and unavailable sources or destinations', async () => {
    const { rpc } = configure();
    const invalidBody = await POST(
      request({ name: ' ', publicationId: destinationPublicationId }),
      context(),
    );
    expect(invalidBody.status).toBe(400);

    const missingSource = await POST(request(), context('11111111-1111-4111-8111-111111111111'));
    expect(missingSource.status).toBe(404);

    const inactiveSnapshot = snapshotWithRecipe();
    const inactivePublication = inactiveSnapshot.records.publications?.[1];
    if (!inactivePublication) throw new Error('Expected the destination publication.');
    inactivePublication.trashed_at = '2026-11-12T12:00:00.000Z';
    const { rpc: inactiveRpc } = configure({ snapshot: inactiveSnapshot });
    const inactiveDestination = await POST(request(), context());
    expect(inactiveDestination.status).toBe(409);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(inactiveRpc).toHaveBeenCalledTimes(1);
  });

  it('creates a new private graph, clears direct-save identity, and retains source attribution', async () => {
    const { rpc } = configure();

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.recipeId).not.toBe(sourceRecipeId);
    const commitCall = rpc.mock.calls.find(
      ([name]) => name === 'commit_recipe_duplicate_with_media_sources',
    );
    expect(commitCall).toBeDefined();
    if (!commitCall) throw new Error('Expected the duplicate commit RPC.');
    const args = commitCall[1];
    expect(args).toMatchObject({
      p_account_id: accountId,
      p_source_recipe_id: sourceRecipeId,
      p_expected_source_version: 3,
      p_destination_publication_id: destinationPublicationId,
      p_records: {
        recipes: [
          expect.objectContaining({
            id: body.recipeId,
            name: 'Citrus cake (Copy)',
            publication_id: destinationPublicationId,
            is_private: true,
            saved_from_public_id: null,
          }),
        ],
        recipe_references: [
          expect.objectContaining({
            recipe_id: body.recipeId,
            source_public_id: publicSourceId,
            is_protected_source: true,
          }),
        ],
      },
    });
  });

  it('stages photo variants at new paths and commits their remapped metadata', async () => {
    const { download, rpc } = configure({
      snapshot: snapshotWithRecipe({ includePhoto: true }),
    });
    const stagedPaths = new Set<string>();
    const imageSink = vi.fn().mockResolvedValue(undefined);
    const finish = vi.fn().mockResolvedValue(undefined);
    let destinationAssetId = '';
    let fullPath = '';
    let thumbnailPath = '';
    createImportImageStager.mockImplementation(
      (_admin: unknown, ownerId: string, destinationIds: Map<string, string>) => {
        const destinationId = destinationIds.get(sourceAssetId);
        if (!destinationId) throw new Error('Expected the remapped photo ID.');
        destinationAssetId = destinationId;
        fullPath = `${ownerId}/assets/${destinationId}/full.webp`;
        thumbnailPath = `${ownerId}/assets/${destinationId}/thumb.webp`;
        stagedPaths.add(fullPath);
        stagedPaths.add(thumbnailPath);
        return {
          imageSink,
          finish,
          stagedPaths,
          pathsBySourceAsset: new Map([[sourceAssetId, { fullPath, thumbnailPath }]]),
          metadataBySourceAsset: new Map([
            [
              sourceAssetId,
              {
                byteSize: 12,
                width: 10,
                height: 10,
                variantByteSizes: { full: 6, thumbnail: 6 },
              },
            ],
          ]),
        };
      },
    );

    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(destinationAssetId).not.toBe(sourceAssetId);
    expect(download.mock.calls.map(([path]) => path)).toEqual([
      `${accountId}/assets/${sourceAssetId}/full.webp`,
      `${accountId}/assets/${sourceAssetId}/thumb.webp`,
    ]);
    expect(imageSink.mock.calls.map(([path]) => path)).toEqual([
      `images/${sourceAssetId}/full.webp`,
      `images/${sourceAssetId}/thumbnail.webp`,
    ]);
    expect(finish).toHaveBeenCalledOnce();

    const commitCall = rpc.mock.calls.find(
      ([name]) => name === 'commit_recipe_duplicate_with_media_sources',
    );
    expect(commitCall).toBeDefined();
    if (!commitCall) throw new Error('Expected the duplicate commit RPC.');
    expect(commitCall[1]).toMatchObject({
      p_records: {
        media_assets: [
          expect.objectContaining({
            id: destinationAssetId,
            recipe_id: body.recipeId,
            full_path: fullPath,
            thumbnail_path: thumbnailPath,
            source_full_path: fullPath,
            source_thumbnail_path: thumbnailPath,
          }),
        ],
      },
      p_media_sources: [
        expect.objectContaining({
          id: destinationAssetId,
          source_full_path: fullPath,
          source_thumbnail_path: thumbnailPath,
          source_byte_size: 12,
        }),
      ],
    });
    expect([...stagedPaths]).toEqual([fullPath, thumbnailPath]);
    expect(queueMediaDeletions).not.toHaveBeenCalled();
  });

  it('cleans staged photo paths when a media upload fails', async () => {
    const { admin } = configure({ snapshot: snapshotWithRecipe({ includePhoto: true }) });
    const stagedPaths = new Set<string>();
    createImportImageStager.mockImplementation(
      (_admin: unknown, ownerId: string, destinationIds: Map<string, string>) => {
        const destinationAssetId = destinationIds.get(sourceAssetId);
        const fullPath = `${ownerId}/assets/${destinationAssetId}/full.webp`;
        const thumbnailPath = `${ownerId}/assets/${destinationAssetId}/thumb.webp`;
        stagedPaths.add(fullPath);
        stagedPaths.add(thumbnailPath);
        return {
          imageSink: vi.fn().mockResolvedValue(undefined),
          finish: vi.fn().mockRejectedValue(new Error('Upload did not complete.')),
          stagedPaths,
          pathsBySourceAsset: new Map(),
          metadataBySourceAsset: new Map(),
        };
      },
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(503);
    expect(queueMediaDeletions).toHaveBeenCalledWith(admin, accountId, [...stagedPaths]);
    expect(processMediaDeletions).toHaveBeenCalledWith(admin, [...stagedPaths]);
  });

  it('cleans staged media and reports a stale-source conflict when commit fails', async () => {
    const { admin, rpc } = configure({
      snapshot: snapshotWithRecipe({ includePhoto: true }),
      commitResult: { data: null, error: { code: 'PT409' } },
    });
    const stagedPaths = new Set<string>();
    createImportImageStager.mockImplementation(
      (_admin: unknown, ownerId: string, destinationIds: Map<string, string>) => {
        const destinationAssetId = destinationIds.get(sourceAssetId);
        const fullPath = `${ownerId}/assets/${destinationAssetId}/full.webp`;
        const thumbnailPath = `${ownerId}/assets/${destinationAssetId}/thumb.webp`;
        stagedPaths.add(fullPath);
        stagedPaths.add(thumbnailPath);
        return {
          imageSink: vi.fn().mockResolvedValue(undefined),
          finish: vi.fn().mockResolvedValue(undefined),
          stagedPaths,
          pathsBySourceAsset: new Map([[sourceAssetId, { fullPath, thumbnailPath }]]),
          metadataBySourceAsset: new Map([
            [
              sourceAssetId,
              {
                byteSize: 12,
                width: 10,
                height: 10,
                variantByteSizes: { full: 6, thumbnail: 6 },
              },
            ],
          ]),
        };
      },
    );

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
    expect(queueMediaDeletions).toHaveBeenCalledWith(admin, accountId, [...stagedPaths]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
