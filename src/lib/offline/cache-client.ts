'use client';

import {
  MAX_OFFLINE_RECIPES,
  OFFLINE_INDEX_PATH,
  type OfflineRecipeEntry,
  PRIVATE_OFFLINE_CACHE_NAME,
  PRIVATE_OFFLINE_CACHE_PREFIX,
  selectRecentOfflineRecipes,
} from './cache-rules';

let cacheOperation = Promise.resolve();

function serializeCacheOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = cacheOperation.then(operation);
  cacheOperation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function storeOfflineRecipeSnapshot(entry: OfflineRecipeEntry, html: string): Promise<void> {
  return serializeCacheOperation(async () => {
    const cache = await caches.open(PRIVATE_OFFLINE_CACHE_NAME);
    const indexResponse = await cache.match(new URL(OFFLINE_INDEX_PATH, window.location.origin));
    const priorEntries = indexResponse
      ? ((await indexResponse.json()) as OfflineRecipeEntry[])
      : [];
    const lastViewedAt = Math.max(0, ...priorEntries.map((priorEntry) => priorEntry.viewedAt));
    const entries = selectRecentOfflineRecipes([
      ...priorEntries.filter((priorEntry) => priorEntry.path !== entry.path),
      { ...entry, viewedAt: Math.max(entry.viewedAt, lastViewedAt + 1) },
    ]);
    const retainedPaths = new Set(entries.map((offlineEntry) => offlineEntry.path));
    await cache.put(
      new URL(entry.path, window.location.origin),
      new Response(html, {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/html; charset=utf-8',
        },
      }),
    );
    await Promise.all(
      priorEntries
        .filter((priorEntry) => !retainedPaths.has(priorEntry.path))
        .map((priorEntry) => cache.delete(new URL(priorEntry.path, window.location.origin))),
    );
    await cache.put(
      new URL(OFFLINE_INDEX_PATH, window.location.origin),
      new Response(JSON.stringify(entries.slice(0, MAX_OFFLINE_RECIPES)), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

export function removeOfflineRecipe(path: string): Promise<void> {
  return serializeCacheOperation(async () => {
    if (!('caches' in window)) return;
    const cache = await caches.open(PRIVATE_OFFLINE_CACHE_NAME);
    await cache.delete(new URL(path, window.location.origin));
    const indexResponse = await cache.match(new URL(OFFLINE_INDEX_PATH, window.location.origin));
    const priorEntries = indexResponse
      ? ((await indexResponse.json()) as OfflineRecipeEntry[])
      : [];
    const entries = selectRecentOfflineRecipes(priorEntries.filter((entry) => entry.path !== path));
    await cache.put(
      new URL(OFFLINE_INDEX_PATH, window.location.origin),
      new Response(JSON.stringify(entries), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

export function clearPrivateOfflineCaches(): Promise<void> {
  return serializeCacheOperation(async () => {
    if (!('caches' in window)) return;
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith(PRIVATE_OFFLINE_CACHE_PREFIX))
        .map((cacheName) => caches.delete(cacheName)),
    );
  });
}
