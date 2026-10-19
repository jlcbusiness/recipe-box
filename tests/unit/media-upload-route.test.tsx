import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClient,
  createAdminClient,
  discardPendingMediaUpload,
  processMediaDeletions,
  queueMediaDeletions,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  discardPendingMediaUpload: vi.fn(),
  processMediaDeletions: vi.fn(),
  queueMediaDeletions: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));
vi.mock('../../src/lib/media/server', () => ({
  discardPendingMediaUpload,
  processMediaDeletions,
  queueMediaDeletions,
}));

import { POST } from '../../src/app/api/media/uploads/[id]/route';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const stagingPath = `${accountId}/staging/${assetId}/source`;

describe('media upload completion route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discards a reservation when its staged object is missing', async () => {
    const upload = {
      id: assetId,
      account_id: accountId,
      asset_type: 'publication_cover',
      recipe_id: null,
      publication_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      status: 'pending',
      staging_path: stagingPath,
      full_path: null,
      thumbnail_path: null,
      created_by_user_id: accountId,
    };
    const query = {
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: upload, error: null }),
    };
    query.eq.mockReturnValue(query);
    const download = vi.fn().mockResolvedValue({ data: null, error: new Error('not found') });
    const admin = {
      from: vi.fn(() => ({ select: vi.fn(() => query) })),
      storage: { from: vi.fn(() => ({ download })) },
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
    discardPendingMediaUpload.mockResolvedValue(undefined);
    processMediaDeletions.mockResolvedValue({ processed: 1, failed: [] });

    const response = await POST(
      new Request(`http://localhost/api/media/uploads/${assetId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: '' }),
      }),
      { params: Promise.resolve({ id: assetId }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'The image did not finish uploading. Choose it again and retry.',
    });
    expect(discardPendingMediaUpload).toHaveBeenCalledWith(admin, upload);
    expect(processMediaDeletions).toHaveBeenCalledWith(admin, [stagingPath]);
  });
});
