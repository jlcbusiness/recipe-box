import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('../../src/lib/media/server', () => ({ processMediaCleanup: vi.fn() }));

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves bounded normalized crop coordinates with the expected parent version', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: assetId, version: 8 }],
      error: null,
    });
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
        crop: { left: 0.1, top: 0.2, width: 0.5, height: 0.4, rotation: 0 },
      }),
      { params: Promise.resolve({ id: assetId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ changed: true, version: 8 });
    expect(rpc).toHaveBeenCalledWith('update_media_crop', {
      p_asset_id: assetId,
      p_expected_version: 7,
      p_crop: { left: 0.1, top: 0.2, width: 0.5, height: 0.4, rotation: 0 },
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
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PT409', message: 'Recipe version is stale.' },
    });
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-id' } }, error: null }),
      },
      rpc,
    });

    const response = await PATCH(request({ action: 'crop', expected_version: 7, crop: null }), {
      params: Promise.resolve({ id: assetId }),
    });

    expect(response.status).toBe(409);
  });

  it('requires authentication before changing framing', async () => {
    const rpc = vi.fn();
    createClient.mockResolvedValue({
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
