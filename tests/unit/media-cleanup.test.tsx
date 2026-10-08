import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { processMediaDeletions } from '../../src/lib/media/server';

describe('media deletion cleanup', () => {
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
