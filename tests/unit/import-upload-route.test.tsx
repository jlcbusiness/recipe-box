import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient, createAdminClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('../../src/lib/supabase/server', () => ({ createClient }));
vi.mock('../../src/lib/supabase/admin', () => ({ createAdminClient }));

import { DELETE, POST } from '../../src/app/api/imports/uploads/route';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function authenticatedClient() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: accountId } },
        error: null,
      }),
    },
  };
}

function deleteRequest(path: unknown) {
  return new Request('http://localhost/api/imports/uploads', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}

describe('import upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires a verified signed-in user before creating an upload grant', async () => {
    createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('creates an owner-scoped signed upload and queues its eventual cleanup', async () => {
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: { token: 'single-use-upload-token' },
      error: null,
    });
    const queued: Record<string, unknown>[] = [];
    const insert = vi.fn(async (row: Record<string, unknown>) => {
      queued.push(row);
      return { error: null };
    });
    createClient.mockResolvedValue(authenticatedClient());
    createAdminClient.mockReturnValue({
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) },
      from: vi.fn(() => ({ insert })),
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ token: 'single-use-upload-token' });
    expect(body.path).toMatch(new RegExp(`^${accountId}/imports/[0-9a-f-]+\\.zip$`));
    expect(createSignedUploadUrl).toHaveBeenCalledWith(body.path, { upsert: false });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ account_id: accountId, object_path: body.path });
    expect(
      Date.parse(String(queued[0].delete_after)) - Date.parse(String(queued[0].queued_at)),
    ).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('does not disclose a signed grant when cleanup scheduling fails', async () => {
    const remove = vi.fn().mockResolvedValue({ error: null });
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: { token: 'must-not-be-returned' },
      error: null,
    });
    createClient.mockResolvedValue(authenticatedClient());
    createAdminClient.mockReturnValue({
      storage: { from: vi.fn(() => ({ createSignedUploadUrl, remove })) },
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: new Error('db unavailable') }),
      })),
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.token).toBeUndefined();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('removes only an authenticated owner upload and clears its cleanup queue entry', async () => {
    const path = `${accountId}/imports/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.zip`;
    const remove = vi.fn().mockResolvedValue({ error: null });
    const eq = vi.fn().mockReturnThis();
    const queueDelete = vi.fn().mockReturnValue({ eq });
    createClient.mockResolvedValue(authenticatedClient());
    createAdminClient.mockReturnValue({
      storage: { from: vi.fn(() => ({ remove })) },
      from: vi.fn(() => ({ delete: queueDelete })),
    });

    const response = await DELETE(deleteRequest(path));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cancelled: true, cleanupPending: false });
    expect(remove).toHaveBeenCalledWith([path]);
    expect(queueDelete).toHaveBeenCalledOnce();
    expect(eq).toHaveBeenNthCalledWith(1, 'account_id', accountId);
    expect(eq).toHaveBeenNthCalledWith(2, 'object_path', path);
  });

  it('does not delete a foreign archive', async () => {
    createClient.mockResolvedValue(authenticatedClient());

    const response = await DELETE(
      deleteRequest(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/imports/cccccccc-cccc-4ccc-8ccc-cccccccccccc.zip',
      ),
    );

    expect(response.status).toBe(404);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
