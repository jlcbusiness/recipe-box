import { Blob } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));

import { GET } from '../../src/app/api/public-recipes/[publicId]/photos/[photoId]/route';
import { createPublicPhotoId } from '../../src/lib/recipes/public-photo-id';

const publicId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const photoId = createPublicPhotoId(publicId, assetId);

function makeQuery(
  result: { data: unknown; error: null | { code: string } },
  hasOrderedResults = false,
) {
  let orderCalls = 0;
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockImplementation(() => {
    orderCalls += 1;
    return hasOrderedResults && orderCalls === 2 ? Promise.resolve(result) : query;
  });
  query.maybeSingle.mockResolvedValue(result);
  return query;
}

function setup({
  recipeVisibility = [
    { is_private: false, trashed_at: null },
    { is_private: false, trashed_at: null },
  ],
  assetRows = [
    { id: assetId, full_path: 'private/path/full.webp', thumbnail_path: 'private/path/thumb.webp' },
  ],
}: {
  recipeVisibility?: Array<{ is_private: boolean; trashed_at: string | null }>;
  assetRows?: Array<{ id: string; full_path: string; thumbnail_path: string }>;
} = {}) {
  let recipeQueryIndex = 0;
  const queries = {
    recipes: () => {
      const current = recipeVisibility[recipeQueryIndex] ?? recipeVisibility.at(-1);
      recipeQueryIndex += 1;
      return makeQuery({ data: current, error: null });
    },
    media_assets: () => makeQuery({ data: assetRows, error: null }, true),
  };
  const download = vi.fn().mockResolvedValue({
    data: new Blob(['image bytes'], { type: 'image/webp' }),
    error: null,
  });
  const admin = {
    from: vi.fn((table: keyof typeof queries) => queries[table]()),
    storage: { from: vi.fn(() => ({ download })) },
  };
  createAdminClient.mockReturnValue(admin);
  return { admin, download };
}

function request() {
  return new Request(
    `http://localhost/api/public-recipes/${publicId}/photos/${photoId}?variant=full`,
  );
}

describe('public recipe photo route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('streams a photo only while the recipe is active and linkable', async () => {
    const { download } = setup();

    const response = await GET(request(), {
      params: Promise.resolve({ publicId, photoId }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-type')).toBe('image/webp');
    await expect(response.text()).resolves.toBe('image bytes');
    expect(download).toHaveBeenCalledWith('private/path/full.webp');
  });

  it.each([
    { is_private: true, trashed_at: null },
    { is_private: false, trashed_at: '2026-01-01T00:00:00.000Z' },
  ])('does not return bytes after the recipe becomes unavailable', async (visibility) => {
    const { download } = setup({ recipeVisibility: [visibility] });

    const response = await GET(request(), {
      params: Promise.resolve({ publicId, photoId }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(download).not.toHaveBeenCalled();
  });

  it('rejects a photo if the recipe becomes private while its bytes are loading', async () => {
    const { download } = setup({
      recipeVisibility: [
        { is_private: false, trashed_at: null },
        { is_private: true, trashed_at: null },
      ],
    });

    const response = await GET(request(), {
      params: Promise.resolve({ publicId, photoId }),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(download).toHaveBeenCalledOnce();
  });
});
