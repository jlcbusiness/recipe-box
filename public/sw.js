const ASSET_CACHE = 'recipe-box-assets-v1';
const PRIVATE_CACHE = 'recipe-box-private-v1';
const PRIVATE_CACHE_PREFIX = 'recipe-box-private-';
const OFFLINE_INDEX_PATH = '/__recipe-box/offline-index';
const MAX_OFFLINE_RECIPES = 10;
const recipePathPattern =
  /^\/recipes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(ASSET_CACHE);
        await cache.addAll(['/icons/recipe-box-192.png', '/icons/recipe-box-512.png']);
      } catch {
        // Installation still works when optional assets cannot be precached.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter(
            (name) =>
              (name.startsWith(PRIVATE_CACHE_PREFIX) && name !== PRIVATE_CACHE) ||
              (name.startsWith('recipe-box-assets-') && name !== ASSET_CACHE),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (
    url.pathname.startsWith('/_next/static/css/') ||
    url.pathname.startsWith('/_next/static/media/') ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(fetchAsset(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetchNavigation(request));
  }
});

async function fetchAsset(request) {
  try {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    return fetch(request);
  }
}

async function fetchNavigation(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (
      recipePathPattern.test(url.pathname) &&
      ([401, 404, 410].includes(response.status) ||
        response.type === 'opaqueredirect' ||
        response.redirected ||
        (response.url && new URL(response.url).pathname !== url.pathname))
    ) {
      await removeOfflineRecipe(url.pathname);
    }
    return response;
  } catch {
    if (url.pathname === '/') return offlineIndexResponse();
    if (recipePathPattern.test(url.pathname)) {
      const cache = await caches.open(PRIVATE_CACHE).catch(() => null);
      const cached = await cache?.match(new URL(url.pathname, self.location.origin));
      if (cached) return cached;
    }
    return offlineUnavailableResponse();
  }
}

async function readOfflineEntries() {
  const cache = await caches.open(PRIVATE_CACHE);
  const response = await cache.match(new URL(OFFLINE_INDEX_PATH, self.location.origin));
  if (!response) return [];

  try {
    const entries = await response.json();
    if (!Array.isArray(entries)) return [];
    return entries
      .filter(
        (entry) =>
          entry &&
          recipePathPattern.test(entry.path) &&
          typeof entry.title === 'string' &&
          Number.isFinite(entry.viewedAt),
      )
      .sort((left, right) => right.viewedAt - left.viewedAt || left.path.localeCompare(right.path))
      .slice(0, MAX_OFFLINE_RECIPES);
  } catch {
    return [];
  }
}

async function offlineIndexResponse() {
  const entries = await readOfflineEntries().catch(() => []);
  const styles = [...new Set(entries.flatMap((entry) => entry.styles ?? []))].filter(
    (path) => typeof path === 'string' && path.startsWith('/_next/static/css/'),
  );
  const styleLinks = styles.map((path) => `<link rel="stylesheet" href="${escapeHtml(path)}">`);
  const recipeLinks = entries
    .map((entry) => `<li><a href="${escapeHtml(entry.path)}">${escapeHtml(entry.title)}</a></li>`)
    .join('');
  const emptyMessage = entries.length ? '' : '<p>No recipes are saved for offline reading.</p>';
  return htmlResponse(`
    <!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="theme-color" content="#386044"><title>Offline recipes | Recipe Box</title>
    ${styleLinks.join('')}
    <style>body{margin:0;background:#faf7eb;color:#292c26;font-family:"DM Sans",sans-serif}
    main{max-width:72rem;margin:2rem auto;padding:0 1.5rem}a{color:#285236}
    a:focus-visible{outline:3px solid #d89a22;outline-offset:3px}.offline-status{padding:.75rem 0}
    li{padding:.6rem 0}</style></head><body><main>
    <p class="offline-status" role="status">Offline. These saved copies may be out of date.</p>
    <h1>Offline recipes</h1><ul>${recipeLinks}</ul>${emptyMessage}
    </main></body></html>
  `);
}

function offlineUnavailableResponse() {
  return htmlResponse(`
    <!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Offline | Recipe Box</title><style>body{margin:0;background:#faf7eb;color:#292c26;
    font-family:"DM Sans",sans-serif}main{max-width:42rem;margin:2rem auto;padding:0 1.5rem}</style>
    </head><body><main><p class="offline-status" role="status">Offline.</p>
    <h1>You are offline</h1><p>This page is not saved on this device.</p></main></body></html>
  `);
}

async function removeOfflineRecipe(path) {
  const cache = await caches.open(PRIVATE_CACHE);
  await cache.delete(new URL(path, self.location.origin));
  const entries = (await readOfflineEntries()).filter((entry) => entry.path !== path);
  await cache.put(
    new URL(OFFLINE_INDEX_PATH, self.location.origin),
    new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json' } }),
  );
}

function htmlResponse(html) {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
