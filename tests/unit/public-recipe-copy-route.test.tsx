import { Blob } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildPublicRecipeCopyPayload,
  createAdminClient,
  createClient,
  getPublicRecipeCopySource,
  queueMediaDeletions,
} = vi.hoisted(() => ({
  buildPublicRecipeCopyPayload: vi.fn(),
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  getPublicRecipeCopySource: vi.fn(),
  queueMediaDeletions: vi.fn(),
}));

vi.mock('../../src/lib/recipes/public-copy-rules', () => ({ buildPublicRecipeCopyPayload }));
vi.mock('../../src/lib/recipes/public-data', () => ({ getPublicRecipeCopySource }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/media/server', () => ({ queueMediaDeletions }));

import { POST } from '../../src/app/api/public-recipes/[publicId]/copy/route';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const publicId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const copiedRecipeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const replacementRecipeId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const copiedPhotoId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const sourcePath = 'source-account/recipe/full.webp';
const thumbnailPath = 'source-account/recipe/thumbnail.webp';
const destinationFullPath = `${accountId}/assets/${copiedPhotoId}/full.webp`;
const destinationThumbnailPath = `${accountId}/assets/${copiedPhotoId}/thumb.webp`;

function createLookupQuery(result: { data: unknown; error: null | { code: string } }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
  };
  let data = result.data;
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockImplementation((field: string, value: unknown) => {
    if (
      field === 'trashed_at' &&
      value === null &&
      typeof data === 'object' &&
      data !== null &&
      'trashed_at' in data &&
      data.trashed_at !== null
    ) {
      data = null;
    }
    return query;
  });
  query.maybeSingle.mockImplementation(async () => ({ data, error: result.error }));
  return query;
}

function setup({
  existingRecipe = null,
  rpcResult = { data: { recipe_id: copiedRecipeId }, error: null },
  authenticated = true,
  sourceStatus = 'active',
}: {
  existingRecipe?: { id: string; version: number; trashed_at: string | null } | null;
  rpcResult?: { data: unknown; error: null | { code: string } };
  authenticated?: boolean;
  sourceStatus?: string;
} = {}) {
  const recipeLookup = createLookupQuery({
    data: existingRecipe,
    error: null,
  });
  const download = vi.fn().mockResolvedValue({
    data: new Blob(['webp-bytes'], { type: 'image/webp' }),
    error: null,
  });
  const upload = vi.fn().mockResolvedValue({ data: { path: destinationFullPath }, error: null });
  const admin = {
    from: vi.fn(() => recipeLookup),
    rpc: vi.fn().mockResolvedValue(rpcResult),
    storage: { from: vi.fn(() => ({ download, upload })) },
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
  getPublicRecipeCopySource.mockResolvedValue(
    sourceStatus === 'active'
      ? {
          status: 'active',
          publicId,
          authorUsername: 'source-user',
          recipe: { name: 'Citrus cake' },
          photoSources: [
            {
              photo: { id: 'public-photo-id', description: 'Finished cake' },
              fullPath: sourcePath,
              thumbnailPath,
            },
          ],
        }
      : { status: sourceStatus },
  );
  buildPublicRecipeCopyPayload.mockReturnValue({
    recipe: { name: 'Citrus cake' },
    photos: [{ id: copiedPhotoId, description: 'Finished cake' }],
  });
  queueMediaDeletions.mockResolvedValue(undefined);
  return { admin, download, recipeLookup, upload };
}

function request() {
  return new Request(`http://localhost/api/public-recipes/${publicId}/copy`, { method: 'POST' });
}

describe('public recipe copy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://recipe-box.example');
  });

  it('requires a server-verified user before resolving or copying the source', async () => {
    setup({ authenticated: false });

    const response = await POST(request(), {
      params: Promise.resolve({ publicId }),
    });

    expect(response.status).toBe(401);
    expect(getPublicRecipeCopySource).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('returns an existing saved copy without uploading media again', async () => {
    const { admin, download, recipeLookup, upload } = setup({
      existingRecipe: { id: copiedRecipeId, version: 4, trashed_at: null },
    });

    const response = await POST(request(), {
      params: Promise.resolve({ publicId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      alreadySaved: true,
      recipeId: copiedRecipeId,
    });
    expect(recipeLookup.select).toHaveBeenCalledWith('id');
    expect(recipeLookup.eq).toHaveBeenCalledWith('saved_from_public_id', publicId);
    expect(download).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('creates a fresh copy while leaving a matching copy in Trash', async () => {
    const { admin, download, recipeLookup, upload } = setup({
      existingRecipe: {
        id: copiedRecipeId,
        version: 7,
        trashed_at: '2026-11-10T12:00:00.000Z',
      },
      rpcResult: { data: { recipe_id: replacementRecipeId }, error: null },
    });

    const response = await POST(request(), {
      params: Promise.resolve({ publicId }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      alreadySaved: false,
      recipeId: replacementRecipeId,
    });
    expect(recipeLookup.is).toHaveBeenCalledWith('trashed_at', null);
    expect(download).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(admin.rpc).toHaveBeenCalledWith(
      'save_public_recipe_copy',
      expect.objectContaining({ p_source_public_id: publicId }),
    );
  });

  it('copies public photo variants into the signed-in account before the atomic database save', async () => {
    const { admin, download, upload } = setup();

    const response = await POST(request(), {
      params: Promise.resolve({ publicId }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      alreadySaved: false,
      recipeId: copiedRecipeId,
    });
    expect(download).toHaveBeenCalledWith(sourcePath);
    expect(download).toHaveBeenCalledWith(thumbnailPath);
    expect(upload).toHaveBeenCalledWith(
      destinationFullPath,
      expect.any(Blob),
      expect.objectContaining({ contentType: 'image/webp', upsert: false }),
    );
    expect(upload).toHaveBeenCalledWith(
      destinationThumbnailPath,
      expect.any(Blob),
      expect.objectContaining({ contentType: 'image/webp', upsert: false }),
    );
    expect(admin.rpc).toHaveBeenCalledWith(
      'save_public_recipe_copy',
      expect.objectContaining({
        p_destination_account_id: accountId,
        p_source_public_id: publicId,
      }),
    );
    expect(admin.rpc.mock.invocationCallOrder[0]).toBeGreaterThan(
      upload.mock.invocationCallOrder.at(-1) ?? 0,
    );
  });

  it('queues copied media for cleanup if the atomic database save fails', async () => {
    setup({ rpcResult: { data: null, error: { code: 'XX000' } } });

    const response = await POST(request(), {
      params: Promise.resolve({ publicId }),
    });

    expect(response.status).toBe(503);
    expect(queueMediaDeletions).toHaveBeenCalledWith(expect.anything(), accountId, [
      destinationFullPath,
      destinationThumbnailPath,
    ]);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });
});
