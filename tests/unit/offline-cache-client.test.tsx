import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PRIVATE_OFFLINE_CACHE_NAME,
  PRIVATE_OFFLINE_CACHE_PREFIX,
} from '../../src/lib/offline/cache-rules';

vi.mock('server-only', () => ({}));

import { reconcilePrivateOfflineCacheGeneration } from '../../src/lib/offline/cache-client';

function createCacheStorage(initial: Record<string, Record<string, string>>) {
  const stores = new Map(
    Object.entries(initial).map(([name, entries]) => [
      name,
      new Map(Object.entries(entries).map(([path, value]) => [path, new Response(value)])),
    ]),
  );
  const cacheNames = () => [...stores.keys()];
  const cacheStorage = {
    keys: vi.fn(async () => cacheNames()),
    open: vi.fn(async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        delete: vi.fn(async (request: RequestInfo | URL) => store.delete(String(request))),
        match: vi.fn(async (request: RequestInfo | URL) => store.get(String(request))?.clone()),
        put: vi.fn(async (request: RequestInfo | URL, response: Response) => {
          store.set(String(request), response.clone());
        }),
      } as unknown as Cache;
    }),
    delete: vi.fn(async (name: string) => stores.delete(name)),
  };
  return { cacheStorage, stores };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('offline cache generation reconciliation', () => {
  it('removes private snapshots from an older account generation', async () => {
    const cacheName = PRIVATE_OFFLINE_CACHE_NAME;
    const metadataPath = new URL('/__recipe-box/offline-generation', window.location.origin).href;
    const snapshotPath = new URL(
      '/recipes/123e4567-e89b-12d3-a456-426614174000',
      window.location.origin,
    ).href;
    const { cacheStorage, stores } = createCacheStorage({
      [cacheName]: {
        [metadataPath]: 'old-generation',
        [snapshotPath]: 'private snapshot',
      },
      [`${PRIVATE_OFFLINE_CACHE_PREFIX}old`]: { [snapshotPath]: 'older snapshot' },
    });
    vi.stubGlobal('caches', cacheStorage);

    await reconcilePrivateOfflineCacheGeneration('new-generation');

    expect(cacheStorage.delete).toHaveBeenCalledWith(cacheName);
    expect(cacheStorage.delete).toHaveBeenCalledWith(`${PRIVATE_OFFLINE_CACHE_PREFIX}old`);
    const currentCache = stores.get(cacheName);
    expect(await currentCache?.get(metadataPath)?.text()).toBe('new-generation');
    expect(currentCache?.has(snapshotPath)).toBe(false);
  });

  it('preserves snapshots when the stored generation matches', async () => {
    const cacheName = PRIVATE_OFFLINE_CACHE_NAME;
    const metadataPath = new URL('/__recipe-box/offline-generation', window.location.origin).href;
    const snapshotPath = new URL(
      '/recipes/123e4567-e89b-12d3-a456-426614174000',
      window.location.origin,
    ).href;
    const { cacheStorage, stores } = createCacheStorage({
      [cacheName]: {
        [metadataPath]: 'current-generation',
        [snapshotPath]: 'private snapshot',
      },
    });
    vi.stubGlobal('caches', cacheStorage);

    await reconcilePrivateOfflineCacheGeneration('current-generation');

    expect(cacheStorage.delete).not.toHaveBeenCalled();
    expect(stores.get(cacheName)?.has(snapshotPath)).toBe(true);
  });
});
