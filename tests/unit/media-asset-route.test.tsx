import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClient,
  createAdminClient,
  cropImage,
  processMediaCleanup,
  processMediaDeletions,
  queueMediaDeletions,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  cropImage: vi.fn(),
  processMediaCleanup: vi.fn(),
  processMediaDeletions: vi.fn(),
  queueMediaDeletions: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('../../src/lib/media/server', () => ({
  processMediaCleanup,
  processMediaDeletions,
  queueMediaDeletions,
}));
vi.mock('../../src/lib/media/image-processing', () => ({
  cropImage,
  ImageProcessingError: class ImageProcessingError extends Error {},
}));

import { PATCH } from '../../src/app/api/media/assets/[id]/route';

const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function request(body: unknown) {
  return new Request(`http://localhost/api/media/assets/${assetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('media asset crop route', () => {
  const sourceFullPath = `owner-id/assets/${assetId}/full.webp`;
  const sourceThumbnailPath = `owner-id/assets/${assetId}/thumb.webp`;
  const crop = { left: 0.1, top: 0.2, width: 0.5, height: 0.4, rotation: 0 };

  function setup({
    asset = {
      id: assetId,
      account_id: 'owner-id',
      crop: null,
      full_path: sourceFullPath,
      thumbnail_path: sourceThumbnailPath,
      byte_size: 100,
      width: 100,
      height: 80,
      display_width: 100,
      display_height: 80,
      source_full_path: sourceFullPath,
      source_thumbnail_path: sourceThumbnailPath,
      source_byte_size: 100,
    },
    rpcResult = { data: [], error: null },
  }: {
    asset?: Record<string, unknown>;
    rpcResult?: { data: unknown; error: { code: string; message: string } | null };
  } = {}) {
    const rpc = vi.fn().mockResolvedValue(rpcResult);
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: asset, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const supabase = { auth: { getUser: vi.fn() }, from: vi.fn(() => query), rpc };
    const storage = {
      download: vi.fn().mockResolvedValue({ data: new Blob(['original']), error: null }),
      upload: vi.fn().mockResolvedValue({ error: null }),
    };
    const admin = { storage: { from: vi.fn(() => storage) } };
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'owner-id' } },
      error: null,
    });
    createClient.mockResolvedValue(supabase);
    createAdminClient.mockReturnValue(admin);
    cropImage.mockResolvedValue({
      full: { buffer: Buffer.from('full'), bytes: 4, width: 50, height: 40 },
      thumbnail: { buffer: Buffer.from('thumb'), bytes: 5, width: 50, height: 40 },
    });
    queueMediaDeletions.mockResolvedValue(undefined);
    processMediaDeletions.mockResolvedValue({ processed: 0, failed: [] });
    return { admin, rpc, storage, supabase };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores generated framed variants and preserves the original paths', async () => {
    const { rpc, storage } = setup({
      rpcResult: {
        data: [
          {
            id: assetId,
            version: 8,
            previous_full_path: sourceFullPath,
            previous_thumbnail_path: sourceThumbnailPath,
          },
        ],
        error: null,
      },
    });

    const response = await PATCH(request({ action: 'crop', expected_version: 7, crop }), {
      params: Promise.resolve({ id: assetId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      changed: true,
      cleanupPending: false,
      version: 8,
    });
    expect(cropImage).toHaveBeenCalledWith(Buffer.from('original'), crop);
    expect(storage.upload).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith('update_media_crop_assets_with_dimensions', {
      p_asset_id: assetId,
      p_expected_version: 7,
      p_crop: crop,
      p_full_path: expect.stringMatching(
        new RegExp(`^owner-id/assets/${assetId}/framing/.+/full\\.webp$`),
      ),
      p_thumbnail_path: expect.stringMatching(
        new RegExp(`^owner-id/assets/${assetId}/framing/.+/thumb\\.webp$`),
      ),
      p_byte_size: 109,
      p_display_width: 50,
      p_display_height: 40,
    });
  });

  it('rejects malformed crops before calling the database', async () => {
    const rpc = vi.fn();
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-id' } }, error: null }),
      },
      rpc,
    });

    const response = await PATCH(
      request({
        action: 'crop',
        expected_version: 7,
        crop: { left: 0.8, top: 0, width: 0.3, height: 0.5 },
      }),
      { params: Promise.resolve({ id: assetId }) },
    );

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps an optimistic version conflict to HTTP 409', async () => {
    setup({
      rpcResult: {
        data: null,
        error: { code: 'PT409', message: 'Recipe version is stale.' },
      },
    });

    const response = await PATCH(request({ action: 'crop', expected_version: 7, crop }), {
      params: Promise.resolve({ id: assetId }),
    });

    expect(response.status).toBe(409);
  });

  it('resets to retained source files and queues the generated variants for cleanup', async () => {
    const oldFullPath = `owner-id/assets/${assetId}/framing/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/full.webp`;
    const oldThumbnailPath = oldFullPath.replace('/full.webp', '/thumb.webp');
    const { rpc, storage } = setup({
      asset: {
        id: assetId,
        account_id: 'owner-id',
        crop,
        full_path: oldFullPath,
        thumbnail_path: oldThumbnailPath,
        byte_size: 109,
        width: 100,
        height: 80,
        display_width: 50,
        display_height: 40,
        source_full_path: sourceFullPath,
        source_thumbnail_path: sourceThumbnailPath,
        source_byte_size: 100,
      },
      rpcResult: {
        data: [
          {
            id: assetId,
            version: 8,
            previous_full_path: oldFullPath,
            previous_thumbnail_path: oldThumbnailPath,
          },
        ],
        error: null,
      },
    });

    const response = await PATCH(request({ action: 'crop', expected_version: 7, crop: null }), {
      params: Promise.resolve({ id: assetId }),
    });

    expect(response.status).toBe(200);
    expect(storage.download).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('update_media_crop_assets_with_dimensions', {
      p_asset_id: assetId,
      p_expected_version: 7,
      p_crop: null,
      p_full_path: sourceFullPath,
      p_thumbnail_path: sourceThumbnailPath,
      p_byte_size: 100,
      p_display_width: 100,
      p_display_height: 80,
    });
    expect(queueMediaDeletions).toHaveBeenCalledWith(expect.anything(), 'owner-id', [
      oldFullPath,
      oldThumbnailPath,
    ]);
  });

  it('requires authentication before changing framing', async () => {
    const rpc = vi.fn();
    createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      rpc,
    });

    const response = await PATCH(request({ action: 'crop', expected_version: 7, crop: null }), {
      params: Promise.resolve({ id: assetId }),
    });

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
