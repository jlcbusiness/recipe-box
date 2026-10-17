import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import {
  createTestUser,
  deleteTestUser,
  getLocalSupabaseConfig,
  type LocalSupabaseConfig,
  type TestUser,
} from '../support/local-supabase';

function ownerHeaders(config: LocalSupabaseConfig, user: TestUser) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
}

function serviceHeaders(config: LocalSupabaseConfig) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };
}

async function createRecipe(
  request: import('@playwright/test').APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  name: string,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
    headers: ownerHeaders(config, user),
    data: {
      p_recipe_id: null,
      p_expected_version: null,
      p_name: name,
      p_food_type_id: null,
      p_state: 'want_to_try',
      p_verdict_id: null,
      p_enthusiasm_id: null,
      p_occasion_details: null,
      p_reason: null,
      p_serves: null,
      p_prep_time_minutes: null,
      p_mixing_time_minutes: null,
      p_marinate_time_minutes: null,
      p_chill_time_minutes: null,
      p_freeze_time_minutes: null,
      p_cook_time_minutes: null,
      p_bake_time_minutes: null,
      p_cooling_time_minutes: null,
      p_rest_time_minutes: null,
      p_total_time_minutes: null,
      p_notes_markdown: '',
      p_meal_type_ids: [],
      p_cuisine_ids: [],
      p_equipment_ids: [],
      p_ingredient_rows: [],
      p_instruction_steps: [],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = (await response.json()) as Array<{ id: string; version: number }>;
  return recipe;
}

async function getPublicId(
  request: import('@playwright/test').APIRequestContext,
  config: LocalSupabaseConfig,
  recipeId: string,
) {
  const response = await request.get(
    `${config.apiUrl}/rest/v1/recipes?select=public_id&id=eq.${recipeId}`,
    { headers: serviceHeaders(config) },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = (await response.json()) as Array<{ public_id: string }>;
  return recipe.public_id;
}

async function signIn(page: Page, user: TestUser) {
  await page.goto('/');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/recipes$/);
}

async function waitForServiceWorker(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.active?.state === 'activated';
      }),
    )
    .toBe(true);
}

async function waitForCachedRecipe(page: Page, name: string) {
  await expect
    .poll(
      () =>
        page.evaluate(async (expectedName) => {
          for (const cacheName of await caches.keys()) {
            if (!cacheName.startsWith('recipe-box-private-')) continue;
            const cache = await caches.open(cacheName);
            for (const request of await cache.keys()) {
              const response = await cache.match(request);
              if (response && (await response.clone().text()).includes(expectedName)) return true;
            }
          }
          return false;
        }, name),
      { timeout: 10_000 },
    )
    .toBe(true);
}

test('manifest and root service worker support PWA installation @e2e', async ({ page }) => {
  await page.goto('/');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifestResponse = await page.evaluate(async (href) => {
    const response = await fetch(href ?? '');
    return { ok: response.ok, manifest: await response.json() };
  }, manifestHref);

  expect(manifestResponse.ok).toBe(true);
  expect(manifestResponse.manifest).toMatchObject({
    name: 'Recipe Box',
    short_name: 'Recipe Box',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  });
  expect(manifestResponse.manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
    ]),
  );

  for (const icon of manifestResponse.manifest.icons as Array<{
    sizes: string;
    src: string;
  }>) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    const dimensions = await sharp(await response.body()).metadata();
    expect(`${dimensions.width}x${dimensions.height}`).toBe(icon.sizes);
  }

  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
});

test('an owner opens cached recipes offline and sign-out removes them @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const recipeId = randomUUID();
  const recipe = await createRecipe(request, config, user, `Offline recipe ${recipeId}`);

  try {
    await signIn(page, user);
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    await page.goto(`/recipes/${recipe.id}`);
    await expect(page.getByRole('heading', { name: `Offline recipe ${recipeId}` })).toBeVisible();
    await waitForCachedRecipe(page, `Offline recipe ${recipeId}`);

    await page.context().setOffline(true);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Offline recipes' })).toBeVisible();
    const recipeLink = page.getByRole('link', { name: `Offline recipe ${recipeId}` });
    await expect(recipeLink).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(recipeLink).toBeFocused();
    const indexA11y = await new AxeBuilder({ page }).analyze();
    expect(indexA11y.violations).toEqual([]);

    await recipeLink.click();
    await expect(page.getByRole('heading', { name: `Offline recipe ${recipeId}` })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Offline copy');
    await expect(page.locator('.recipe-detail-heading-actions')).toHaveCount(0);
    await expect(page.locator('.recipe-history-link')).toHaveCount(0);
    expect(await page.locator('script').count()).toBe(0);
    expect(await page.locator('img[src^="http"]').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    const recipeA11y = await new AxeBuilder({ page }).analyze();
    expect(recipeA11y.violations).toEqual([]);

    await page.context().setOffline(false);
    await page.goto(`/recipes/${recipe.id}`);
    await page.locator('.account-menu-trigger').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.context().setOffline(true);
    await page.goto(`/recipes/${recipe.id}`);
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    await expect(page.getByText(`Offline recipe ${recipeId}`, { exact: true })).toHaveCount(0);
  } finally {
    await page.context().setOffline(false);
    await deleteTestUser(request, user);
  }
});

test('failed offline-cache deletion blocks sign-out and can be retried @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const recipe = await createRecipe(request, config, user, `Cache cleanup ${randomUUID()}`);

  await page.addInitScript(() => {
    const originalDelete = CacheStorage.prototype.delete;
    Object.defineProperty(window, '__restoreCacheDelete', {
      configurable: true,
      value: () => {
        CacheStorage.prototype.delete = originalDelete;
      },
    });
    CacheStorage.prototype.delete = function (cacheName) {
      if (cacheName.startsWith('recipe-box-private-')) {
        return Promise.reject(new DOMException('Cache cleanup denied.', 'SecurityError'));
      }
      return originalDelete.call(this, cacheName);
    };
  });

  try {
    await signIn(page, user);
    await page.goto(`/recipes/${recipe.id}`);
    await waitForCachedRecipe(page, 'Cache cleanup');
    await page.locator('.account-menu-trigger').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.locator('.account-menu-error')).toContainText('could not be cleared');
    await expect(page).toHaveURL(new RegExp(`/recipes/${recipe.id}$`));

    await page.evaluate(() => {
      (window as unknown as { __restoreCacheDelete: () => void }).__restoreCacheDelete();
    });
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('offline list keeps the ten most recently viewed recipes @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const recipes = await Promise.all(
    Array.from({ length: 11 }, (_, index) =>
      createRecipe(request, config, user, `Offline recency ${String(index).padStart(2, '0')}`),
    ),
  );

  try {
    await signIn(page, user);
    await waitForServiceWorker(page);
    for (const [index, recipe] of recipes.entries()) {
      await page.goto(`/recipes/${recipe.id}`);
      await expect(
        page.getByRole('heading', { name: `Offline recency ${String(index).padStart(2, '0')}` }),
      ).toBeVisible();
      await waitForCachedRecipe(page, `Offline recency ${String(index).padStart(2, '0')}`);
    }

    await page.context().setOffline(true);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Offline recipes' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Offline recency 00' })).toHaveCount(0);
    for (let index = 1; index < recipes.length; index += 1) {
      await expect(
        page.getByRole('link', { name: `Offline recency ${String(index).padStart(2, '0')}` }),
      ).toBeVisible();
    }

    await page.context().setOffline(false);
    await page.goto(`/recipes/${recipes[0].id}`);
    await waitForCachedRecipe(page, 'Offline recency 00');
    await page.context().setOffline(true);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Offline recency 00' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Offline recency 01' })).toHaveCount(0);
  } finally {
    await page.context().setOffline(false);
    await deleteTestUser(request, user);
  }
});

test('an online not-found response removes its stale offline snapshot @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const recipe = await createRecipe(request, config, user, `Expired offline copy ${randomUUID()}`);

  try {
    await signIn(page, user);
    await waitForServiceWorker(page);
    await page.goto(`/recipes/${recipe.id}`);
    await waitForCachedRecipe(page, 'Expired offline copy');
    const trashResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, user),
      data: { p_recipe_id: recipe.id, p_expected_version: recipe.version },
    });
    expect(trashResponse.ok(), await trashResponse.text()).toBe(true);

    const unavailable = await page.goto(`/recipes/${recipe.id}`);
    expect(unavailable?.status()).toBe(404);
    await page.context().setOffline(true);
    await page.goto(`/recipes/${recipe.id}`);
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    await expect(page.getByText(`Expired offline copy ${recipe.id}`, { exact: true })).toHaveCount(
      0,
    );
  } finally {
    await page.context().setOffline(false);
    await deleteTestUser(request, user);
  }
});

test('an unauthenticated redirect removes its stale offline snapshot @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const recipe = await createRecipe(
    request,
    await getLocalSupabaseConfig(),
    user,
    `Signed-out offline copy ${randomUUID()}`,
  );

  try {
    await signIn(page, user);
    await waitForServiceWorker(page);
    await page.goto(`/recipes/${recipe.id}`);
    await waitForCachedRecipe(page, 'Signed-out offline copy');

    await page.context().clearCookies();
    await page.goto(`/recipes/${recipe.id}`);
    await expect(page).toHaveURL(/\/$/);

    await page.context().setOffline(true);
    await page.goto(`/recipes/${recipe.id}`);
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    await expect(
      page.getByText(`Signed-out offline copy ${recipe.id}`, { exact: true }),
    ).toHaveCount(0);
  } finally {
    await page.context().setOffline(false);
    await deleteTestUser(request, user);
  }
});

test('service-worker registration failure does not block online sign-in @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  await page.addInitScript(() => {
    const originalRegister = ServiceWorkerContainer.prototype.register;
    ServiceWorkerContainer.prototype.register = () =>
      Promise.reject(new DOMException('Registration disabled.', 'NotAllowedError'));
    Object.defineProperty(window, '__restoreServiceWorkerRegister', {
      configurable: true,
      value: () => {
        ServiceWorkerContainer.prototype.register = originalRegister;
      },
    });
  });

  try {
    await signIn(page, user);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.locator('.account-menu-trigger').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('public recipe pages are excluded from private offline storage @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const recipe = await createRecipe(
    request,
    config,
    user,
    `Public cache exclusion ${randomUUID()}`,
  );
  const publicId = await getPublicId(request, config, recipe.id);

  try {
    await page.goto('/');
    await waitForServiceWorker(page);
    await page.goto(`/r/${publicId}`);
    await expect(page.getByRole('heading', { name: /Public cache exclusion/ })).toBeVisible();
    expect(await page.locator('main').getAttribute('class')).toBeTruthy();
    const cachedPublicData = await page.evaluate(async (expectedName) => {
      for (const cacheName of await caches.keys()) {
        const cache = await caches.open(cacheName);
        for (const request of await cache.keys()) {
          if (new URL(request.url).pathname.startsWith('/r/')) return true;
          const response = await cache.match(request);
          if (response && (await response.clone().text()).includes(expectedName)) return true;
        }
      }
      return false;
    }, `Public cache exclusion ${recipe.id}`);
    expect(cachedPublicData).toBe(false);
  } finally {
    await deleteTestUser(request, user);
  }
});
