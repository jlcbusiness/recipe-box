import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { discardPendingMediaUpload, processMediaDeletions } from '../../src/lib/media/server';

describe('media deletion cleanup', () => {
  it('discards only a pending upload through the server cancellation RPC', async () => {
    const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const upload = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      account_id: accountId,
      asset_type: 'publication_cover' as const,
      recipe_id: null,
      publication_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      status: 'pending' as const,
      staging_path: `${accountId}/staging/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/source`,
      full_path: null,
      thumbnail_path: null,
      created_by_user_id: accountId,
    };
    const requests: { path: string; method: string; body?: unknown }[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      requests.push({ path: url.pathname, method, body });

      if (url.pathname === '/rest/v1/rpc/discard_pending_media_upload') {
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/rest/v1/media_deletion_queue' && method === 'POST') {
        return Response.json([]);
      }
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };
    const admin = createClient('http://supabase.test', 'test-key', { global: { fetch } });

    await expect(discardPendingMediaUpload(admin, upload)).resolves.toBeUndefined();
    expect(requests).toEqual([
      {
        path: '/rest/v1/rpc/discard_pending_media_upload',
        method: 'POST',
        body: { p_asset_id: upload.id, p_account_id: accountId },
      },
      {
        path: '/rest/v1/media_deletion_queue',
        method: 'POST',
        body: [{ account_id: accountId, object_path: upload.staging_path }],
      },
    ]);
  });

  it('records a transient Storage failure and retries the queued deletion', async () => {
    const path = 'account/orphan.webp';
    let queue: { id: number; object_path: string; attempts: number; last_error?: string }[] = [
      { id: 1, object_path: path, attempts: 0 },
    ];
    let removalAttempts = 0;

    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      const method = init?.method ?? 'GET';

      if (url.pathname === '/rest/v1/media_deletion_queue' && method === 'GET') {
        return Response.json(
          queue.map(({ id, object_path, attempts }) => ({ id, object_path, attempts })),
        );
      }
      if (url.pathname === '/rest/v1/media_deletion_queue' && method === 'PATCH') {
        const id = Number(url.searchParams.get('id')?.replace('eq.', ''));
        const update = JSON.parse(String(init?.body)) as { attempts: number; last_error: string };
        queue = queue.map((item) => (item.id === id ? { ...item, ...update } : item));
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/rest/v1/media_deletion_queue' && method === 'DELETE') {
        queue = [];
        return new Response(null, { status: 204 });
      }
      if (url.pathname === '/rest/v1/media_assets' && method === 'PATCH') {
        return new Response(null, { status: 204 });
      }
      if (url.pathname.startsWith('/storage/v1/object/list/recipe-media')) {
        return Response.json([{ name: 'orphan.webp' }]);
      }
      if (url.pathname === '/storage/v1/object/recipe-media' && method === 'DELETE') {
        removalAttempts += 1;
        if (removalAttempts === 1) {
          return Response.json(
            { statusCode: '500', error: 'Internal Server Error', message: 'temporary failure' },
            { status: 500 },
          );
        }
        return Response.json({});
      }

      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    };
    const admin = createClient('http://supabase.test', 'test-key', { global: { fetch } });

    await expect(processMediaDeletions(admin, [path])).resolves.toEqual({
      processed: 0,
      failed: [path],
    });
    expect(queue).toEqual([
      { id: 1, object_path: path, attempts: 1, last_error: 'temporary failure' },
    ]);

    await expect(processMediaDeletions(admin, [path])).resolves.toEqual({
      processed: 1,
      failed: [],
    });
    expect(queue).toEqual([]);
    expect(removalAttempts).toBe(2);
  });
});
