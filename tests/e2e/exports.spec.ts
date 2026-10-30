import { createHash, randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import { EXPORT_SCHEMA_VERSION } from '../../src/lib/exports/rules';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

function serviceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

function ownerHeaders(anonKey: string, accessToken: string) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  };
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications(?:\/[^/]+)?$/);
}

async function expectKeyboardFocusVisible(
  page: import('@playwright/test').Page,
  target: import('@playwright/test').Locator,
) {
  await target.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(target).toBeFocused();
  expect(await target.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const overflowingElements = Array.from(document.querySelectorAll('body *'))
      .map((element) => ({
        element: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        right: Math.round(element.getBoundingClientRect().right),
      }))
      .filter((element) => element.right > clientWidth)
      .slice(0, 10);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth,
      overflowingElements,
    };
  });
  expect(
    dimensions.scrollWidth,
    `Horizontal overflow at ${dimensions.clientWidth}px: ${JSON.stringify(dimensions.overflowingElements)}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function createPublication(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  headers: Record<string, string>,
  name: string,
) {
  const response = await request.post(`${apiUrl}/rest/v1/rpc/create_publication`, {
    headers,
    data: {
      p_name: name,
      p_publication_type: 'book',
      p_author: null,
      p_edition: null,
      p_isbn: null,
      p_retailer_url: null,
      p_issue: null,
      p_site_url: null,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as string;
}

async function createRecipe(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  headers: Record<string, string>,
  name: string,
) {
  const response = await request.post(`${apiUrl}/rest/v1/rpc/save_recipe`, {
    headers,
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
  const [recipe] = (await response.json()) as { id: string; version: number }[];
  return recipe.id;
}

async function startExport(
  page: import('@playwright/test').Page,
  scope: { type: 'database' } | { type: 'publication' | 'recipe'; id: string },
) {
  return page.evaluate(async (requestedScope) => {
    const response = await fetch('/api/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: requestedScope }),
    });
    return {
      status: response.status,
      body: (await response.json()) as {
        error?: string;
        downloadUrl?: string;
        expiresAt?: string;
      },
    };
  }, scope);
}

test('database export includes more than 1,000 rows, verified private images, and advances its date only after completion @e2e', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const { apiUrl, anonKey, serviceRoleKey } = await getLocalSupabaseConfig();
  const ownerTokenHeaders = ownerHeaders(anonKey, owner.accessToken);
  const adminHeaders = {
    ...serviceHeaders(serviceRoleKey),
    'Content-Type': 'application/json',
  };
  const publicationName = `Export book ${randomUUID()}`;
  const publicationId = await createPublication(
    request,
    apiUrl,
    ownerTokenHeaders,
    publicationName,
  );
  const recipeName = `Export soup ${randomUUID()}`;
  const recipeId = await createRecipe(request, apiUrl, ownerTokenHeaders, recipeName);
  const recipeUpdate = await request.patch(
    `${apiUrl}/rest/v1/recipes?id=eq.${recipeId}&account_id=eq.${owner.id}`,
    {
      headers: { ...adminHeaders, Prefer: 'return=minimal' },
      data: { publication_id: publicationId },
    },
  );
  expect(recipeUpdate.ok(), await recipeUpdate.text()).toBeTruthy();
  const recipeVersionResponse = await request.get(
    `${apiUrl}/rest/v1/recipes?select=version&id=eq.${recipeId}`,
    { headers: ownerTokenHeaders },
  );
  expect(recipeVersionResponse.ok(), await recipeVersionResponse.text()).toBeTruthy();
  const [{ version: recipeVersion }] = (await recipeVersionResponse.json()) as {
    version: number;
  }[];
  const privacyUpdate = await request.post(`${apiUrl}/rest/v1/rpc/set_recipe_privacy`, {
    headers: ownerTokenHeaders,
    data: { p_recipe_id: recipeId, p_expected_version: recipeVersion, p_is_private: true },
  });
  expect(privacyUpdate.ok(), await privacyUpdate.text()).toBeTruthy();
  const assetId = randomUUID();
  const imageBytes = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: 126, g: 154, b: 116 },
    },
  })
    .webp()
    .toBuffer();
  const fullPath = `${owner.id}/assets/${assetId}/full.webp`;
  const thumbnailPath = `${owner.id}/assets/${assetId}/thumbnail.webp`;

  try {
    const ingredients = Array.from({ length: 1005 }, (_, index) => ({
      account_id: owner.id,
      name: `Export ingredient ${index.toString().padStart(4, '0')}`,
    }));
    const ingredientInsert = await request.post(`${apiUrl}/rest/v1/ingredients`, {
      headers: { ...adminHeaders, Prefer: 'return=minimal' },
      data: ingredients,
    });
    expect(ingredientInsert.ok(), await ingredientInsert.text()).toBeTruthy();

    for (const objectPath of [fullPath, thumbnailPath]) {
      const upload = await request.post(`${apiUrl}/storage/v1/object/recipe-media/${objectPath}`, {
        headers: {
          ...serviceHeaders(serviceRoleKey),
          'Content-Type': 'image/webp',
          'x-upsert': 'false',
        },
        data: imageBytes,
      });
      expect(upload.ok(), await upload.text()).toBeTruthy();
    }

    const assetInsert = await request.post(`${apiUrl}/rest/v1/media_assets`, {
      headers: { ...adminHeaders, Prefer: 'return=minimal' },
      data: {
        id: assetId,
        account_id: owner.id,
        recipe_id: recipeId,
        publication_id: null,
        asset_type: 'recipe_photo',
        status: 'ready',
        full_path: fullPath,
        thumbnail_path: thumbnailPath,
        content_type: 'image/webp',
        byte_size: imageBytes.byteLength * 2,
        width: 32,
        height: 24,
      },
    });
    expect(assetInsert.ok(), await assetInsert.text()).toBeTruthy();

    await signIn(page, owner.email, owner.password);
    const result = await startExport(page, { type: 'database' });
    expect(result.status, result.body.error).toBe(200);
    expect(result.body.downloadUrl).toMatch(/^https?:\/\//);
    expect(Date.parse(result.body.expiresAt ?? '')).toBeGreaterThan(Date.now());
    expect(Date.parse(result.body.expiresAt ?? '') - Date.now()).toBeLessThanOrEqual(
      15 * 60 * 1000,
    );

    const download = await request.get(result.body.downloadUrl as string);
    expect(download.ok(), await download.text()).toBeTruthy();
    expect(download.headers()['content-disposition']).toContain('Recipe Box - Database Export.zip');
    const files = unzipSync(new Uint8Array(await download.body()));
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as {
      schema_version: number;
      scope: { type: string };
      files: Array<{ path: string; size_bytes: number; sha256: string }>;
    };
    const portableData = JSON.parse(new TextDecoder().decode(files['data.json'])) as {
      records: {
        ingredients: Array<{ name: string }>;
        recipes: Array<{ id: string; is_private: boolean }>;
        recipe_ingredient_sets: Array<{
          id: string;
          recipe_id: string;
          label: string;
          position: number;
        }>;
      };
    };

    expect(manifest.schema_version).toBe(EXPORT_SCHEMA_VERSION);
    expect(manifest.scope).toEqual({ type: 'database' });
    expect(portableData.records.ingredients).toHaveLength(1005);
    expect(portableData.records.recipes).toContainEqual(expect.objectContaining({ id: recipeId }));
    expect(portableData.records.recipes.find((recipe) => recipe.id === recipeId)?.is_private).toBe(
      true,
    );
    const exportedSets = portableData.records.recipe_ingredient_sets.filter(
      (set) => set.recipe_id === recipeId,
    );
    expect(exportedSets).toHaveLength(1);
    expect(exportedSets[0]).toMatchObject({ label: 'Main', position: 0 });
    expect(files[`images/${assetId}/full.webp`]).toEqual(files['data.json'] ? imageBytes : null);
    expect(files[`images/${assetId}/thumbnail.webp`]).toEqual(imageBytes);
    expect(manifest.files).toHaveLength(3);
    for (const listedFile of manifest.files) {
      const bytes = files[listedFile.path];
      expect(bytes, `Missing ZIP entry ${listedFile.path}`).toBeDefined();
      expect(bytes.byteLength).toBe(listedFile.size_bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(listedFile.sha256);
    }

    for (const { scope, filename } of [
      {
        scope: { type: 'publication' as const, id: publicationId },
        filename: `${publicationName} - Publication Export.zip`,
      },
      {
        scope: { type: 'recipe' as const, id: recipeId },
        filename: `${recipeName} - Recipe Export.zip`,
      },
    ]) {
      const scopedResult = await startExport(page, scope);
      expect(scopedResult.status, scopedResult.body.error).toBe(200);
      const scopedDownload = await request.get(scopedResult.body.downloadUrl as string);
      expect(scopedDownload.ok(), await scopedDownload.text()).toBeTruthy();
      expect(scopedDownload.headers()['content-disposition']).toContain(filename);
      const scopedFiles = unzipSync(new Uint8Array(await scopedDownload.body()));
      const scopedManifest = JSON.parse(new TextDecoder().decode(scopedFiles['manifest.json'])) as {
        scope: { type: string; id?: string };
      };
      const scopedData = JSON.parse(new TextDecoder().decode(scopedFiles['data.json'])) as {
        records: {
          recipes: Array<{ id: string; is_private: boolean }>;
          publications: Array<{ id: string }>;
          ingredients: Array<{ id: string }>;
          recipe_ingredient_sets: Array<{
            id: string;
            recipe_id: string;
            label: string;
            position: number;
          }>;
        };
      };

      expect(scopedManifest.scope).toEqual(scope);
      expect(scopedData.records.recipes.map((recipe) => recipe.id)).toEqual([recipeId]);
      expect(scopedData.records.recipes[0].is_private).toBe(true);
      expect(scopedData.records.publications.map((publication) => publication.id)).toEqual([
        publicationId,
      ]);
      expect(scopedData.records.ingredients).toEqual([]);
      expect(scopedData.records.recipe_ingredient_sets).toEqual(exportedSets);
    }

    const exportQueueResponse = await request.get(
      `${apiUrl}/rest/v1/export_deletion_queue?select=object_path,delete_after&account_id=eq.${owner.id}`,
      { headers: serviceHeaders(serviceRoleKey) },
    );
    expect(exportQueueResponse.ok(), await exportQueueResponse.text()).toBeTruthy();
    const exportQueue = (await exportQueueResponse.json()) as Array<{
      object_path: string;
      delete_after: string;
    }>;
    expect(exportQueue).toHaveLength(3);
    const exportObjectPaths = exportQueue.map((entry) => entry.object_path);
    expect(exportObjectPaths.every((path) => path.startsWith(`${owner.id}/exports/`))).toBe(true);
    expect(
      exportQueue.every(
        (entry) => Date.parse(entry.delete_after) - Date.now() >= 24 * 60 * 60 * 1000,
      ),
    ).toBe(true);
    const unsignedDownload = await request.get(
      `${apiUrl}/storage/v1/object/recipe-exports/${exportObjectPaths[0]}`,
      { headers: { apikey: anonKey } },
    );
    expect(unsignedDownload.ok()).toBe(false);

    const accountResponse = await request.get(
      `${apiUrl}/rest/v1/accounts?select=last_database_export_at&id=eq.${owner.id}`,
      { headers: serviceHeaders(serviceRoleKey) },
    );
    expect(accountResponse.ok(), await accountResponse.text()).toBeTruthy();
    const [account] = (await accountResponse.json()) as [
      { last_database_export_at: string | null },
    ];
    expect(account.last_database_export_at).toBeTruthy();
  } finally {
    const queuedExports = await request.get(
      `${apiUrl}/rest/v1/export_deletion_queue?select=object_path&account_id=eq.${owner.id}`,
      { headers: serviceHeaders(serviceRoleKey) },
    );
    if (queuedExports.ok()) {
      const queuedPaths = (await queuedExports.json()) as Array<{ object_path: string }>;
      for (const { object_path: objectPath } of queuedPaths) {
        const removal = await request.delete(
          `${apiUrl}/storage/v1/object/recipe-exports/${objectPath}`,
          { headers: serviceHeaders(serviceRoleKey) },
        );
        expect(removal.ok(), await removal.text()).toBeTruthy();
      }
    }
    for (const objectPath of [fullPath, thumbnailPath]) {
      await request.delete(`${apiUrl}/storage/v1/object/recipe-media/${objectPath}`, {
        headers: serviceHeaders(serviceRoleKey),
      });
    }
    await deleteTestUser(request, owner);
  }
});

test('export rejects unauthenticated and invalid scopes, and hides foreign records as unavailable @e2e', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const foreignOwner = await createTestUser(request);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();
  const foreignPublicationId = await createPublication(
    request,
    apiUrl,
    ownerHeaders(anonKey, foreignOwner.accessToken),
    `Foreign export book ${randomUUID()}`,
  );
  const foreignRecipeId = await createRecipe(
    request,
    apiUrl,
    ownerHeaders(anonKey, foreignOwner.accessToken),
    `Foreign export recipe ${randomUUID()}`,
  );

  try {
    const unauthenticated = await request.post('/api/exports', {
      data: { scope: { type: 'database' } },
    });
    expect(unauthenticated.status()).toBe(401);

    await signIn(page, owner.email, owner.password);
    const invalid = await startExport(page, { type: 'database', id: owner.id } as never);
    expect(invalid.status).toBe(400);

    const foreign = await startExport(page, { type: 'recipe', id: foreignRecipeId });
    const missing = await startExport(page, { type: 'recipe', id: randomUUID() });
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);

    const publication = await startExport(page, { type: 'publication', id: foreignPublicationId });
    expect(publication.status).toBe(404);
    expect(publication.body).toEqual(missing.body);
  } finally {
    await deleteTestUser(request, foreignOwner);
    await deleteTestUser(request, owner);
  }
});

test('a missing ready image fails export without advancing the database backup date @e2e', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const { apiUrl, anonKey, serviceRoleKey } = await getLocalSupabaseConfig();
  const adminHeaders = {
    ...serviceHeaders(serviceRoleKey),
    'Content-Type': 'application/json',
  };
  const recipeId = await createRecipe(
    request,
    apiUrl,
    ownerHeaders(anonKey, owner.accessToken),
    `Missing export image ${randomUUID()}`,
  );
  const assetId = randomUUID();

  try {
    const assetInsert = await request.post(`${apiUrl}/rest/v1/media_assets`, {
      headers: { ...adminHeaders, Prefer: 'return=minimal' },
      data: {
        id: assetId,
        account_id: owner.id,
        recipe_id: recipeId,
        publication_id: null,
        asset_type: 'recipe_photo',
        status: 'ready',
        full_path: `${owner.id}/assets/${assetId}/full.webp`,
        thumbnail_path: `${owner.id}/assets/${assetId}/thumbnail.webp`,
        content_type: 'image/webp',
        byte_size: 10,
        width: 32,
        height: 24,
      },
    });
    expect(assetInsert.ok(), await assetInsert.text()).toBeTruthy();

    await signIn(page, owner.email, owner.password);
    const result = await startExport(page, { type: 'database' });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe('Unable to prepare the export. Please try again.');

    const accountResponse = await request.get(
      `${apiUrl}/rest/v1/accounts?select=last_database_export_at&id=eq.${owner.id}`,
      { headers: serviceHeaders(serviceRoleKey) },
    );
    expect(accountResponse.ok(), await accountResponse.text()).toBeTruthy();
    const [account] = (await accountResponse.json()) as [
      { last_database_export_at: string | null },
    ];
    expect(account.last_database_export_at).toBeNull();

    const cleanupQueue = await request.get(
      `${apiUrl}/rest/v1/export_deletion_queue?select=id&account_id=eq.${owner.id}`,
      { headers: serviceHeaders(serviceRoleKey) },
    );
    expect(cleanupQueue.ok(), await cleanupQueue.text()).toBeTruthy();
    expect(await cleanupQueue.json()).toEqual([]);
  } finally {
    await deleteTestUser(request, owner);
  }
});

test('Settings, publication detail, and recipe detail expose accessible export actions with retry @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  const owner = await createTestUser(request);
  const { apiUrl, anonKey, serviceRoleKey } = await getLocalSupabaseConfig();
  const publicationName = `Export action book ${randomUUID()}`;
  const publicationId = await createPublication(
    request,
    apiUrl,
    ownerHeaders(anonKey, owner.accessToken),
    publicationName,
  );
  const recipeName = `Export action recipe ${randomUUID()}`;
  const recipeId = await createRecipe(
    request,
    apiUrl,
    ownerHeaders(anonKey, owner.accessToken),
    recipeName,
  );
  const detachRecipe = await request.patch(
    `${apiUrl}/rest/v1/recipes?id=eq.${recipeId}&account_id=eq.${owner.id}`,
    {
      headers: {
        ...serviceHeaders(serviceRoleKey),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      data: { publication_id: publicationId },
    },
  );
  expect(detachRecipe.ok(), await detachRecipe.text()).toBeTruthy();
  const requestedScopes: unknown[] = [];
  let requestCount = 0;
  let downloadRequestCount = 0;
  let releaseFirstRequest: (() => void) | undefined;
  const firstRequestGate = new Promise<void>((resolve) => {
    releaseFirstRequest = resolve;
  });

  try {
    await page.route('**/api/exports', async (route) => {
      requestCount += 1;
      const scope = JSON.parse(route.request().postData() ?? '{}').scope as {
        type: 'database' | 'publication' | 'recipe';
      };
      requestedScopes.push(scope);
      if (requestCount === 1) {
        await firstRequestGate;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unable to prepare the export. Please try again.' }),
        });
        return;
      }
      if (requestCount === 3 || requestCount === 5) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Unable to prepare the export. Please try again.' }),
        });
        return;
      }

      const filename =
        scope.type === 'database'
          ? 'Recipe Box - Database Export.zip'
          : scope.type === 'publication'
            ? `${publicationName} - Publication Export.zip`
            : `${recipeName} - Recipe Export.zip`;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          downloadUrl: `https://exports.example.test/exports/${requestCount}?download=${encodeURIComponent(filename)}`,
          expiresAt: '2026-10-15T12:15:00.000Z',
        }),
      });
    });
    await page.route('https://exports.example.test/exports/*', async (route) => {
      downloadRequestCount += 1;
      const filename = new URL(route.request().url()).searchParams.get('download');
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
        body: Buffer.from('PK\u0003\u0004'),
      });
    });
    const activateExport = (action: import('@playwright/test').Locator) =>
      testInfo.project.name === 'Fold 6' ? action.tap() : action.click();

    await signIn(page, owner.email, owner.password);
    await page.goto('/settings');
    const dataManagement = page.getByRole('region', { name: 'Data management' });
    await expect(dataManagement.getByText('No database export yet')).toBeVisible();
    await expect(
      dataManagement.getByText(/more than 30 days|Make a database export/),
    ).toBeVisible();
    const databaseExport = dataManagement.getByRole('button', { name: 'Export database' });
    await expectKeyboardFocusVisible(page, databaseExport);
    const settingsA11y = await new AxeBuilder({ page }).analyze();
    expect(settingsA11y.violations).toEqual([]);
    if (testInfo.project.name === 'Fold 6') {
      expect((await databaseExport.boundingBox())?.height).toBeGreaterThanOrEqual(48);
      await expectNoHorizontalOverflow(page);
      for (const width of [639, 640, 641, 839, 840, 841]) {
        await page.setViewportSize({ width, height: 864 });
        await expectNoHorizontalOverflow(page);
      }
      await page.setViewportSize({ width: 352, height: 864 });
    }
    const settingsExportTopBefore = (await databaseExport.boundingBox())?.y;

    await page.keyboard.press('Enter');
    await expect(databaseExport).toBeDisabled();
    await expect(dataManagement.getByRole('status')).toHaveText('Preparing database export...');
    releaseFirstRequest?.();
    await expect(dataManagement.getByRole('alert')).toHaveText(
      'Unable to prepare the export. Please try again.',
    );
    const settingsExportBox = await databaseExport.boundingBox();
    const settingsFeedbackBox = await dataManagement.getByRole('alert').boundingBox();
    expect(settingsFeedbackBox?.y).toBeGreaterThanOrEqual(
      (settingsExportBox?.y ?? 0) + (settingsExportBox?.height ?? 0),
    );
    expect(settingsExportBox?.y).toBe(settingsExportTopBefore);
    if (testInfo.project.name === 'Fold 6') {
      expect(settingsFeedbackBox?.width).toBeGreaterThan(100);
      await expectNoHorizontalOverflow(page);
    }
    await expect(databaseExport).toBeEnabled();
    const settingsDownloadEvent = page.waitForEvent('download');
    await activateExport(databaseExport);
    const settingsDownload = await settingsDownloadEvent;
    expect(settingsDownload.suggestedFilename()).toBe('Recipe Box - Database Export.zip');
    await expect(dataManagement.getByRole('status')).toHaveText(
      'Database export ready. Download started.',
    );

    const oldExportAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const timestampUpdate = await request.patch(`${apiUrl}/rest/v1/accounts?id=eq.${owner.id}`, {
      headers: {
        ...serviceHeaders(serviceRoleKey),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      data: { last_database_export_at: oldExportAt },
    });
    expect(timestampUpdate.ok(), await timestampUpdate.text()).toBeTruthy();
    await page.reload();
    const formattedExportDate = new Intl.DateTimeFormat('en', {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(oldExportAt));
    await expect(page.getByText(`Last database export: ${formattedExportDate}`)).toBeVisible();
    await expect(page.getByText(/Make a database export now/)).toBeVisible();

    await page.goto('/publications');
    const publicationCard = page
      .locator('.publication-explorer-card')
      .filter({ hasText: publicationName });
    await expect(publicationCard.getByRole('button', { name: 'Export publication' })).toHaveCount(
      0,
    );
    await page.goto(`/publications/${publicationId}`);
    const isMobile = testInfo.project.name === 'Fold 6';
    const transferTrigger = page.getByRole('button', { name: 'Publication transfer options' });
    const publicationExport = isMobile
      ? transferTrigger
      : page.getByRole('button', { name: 'Export publication' });
    const publicationImport = page.getByRole('button', { name: 'Import recipe' });
    const publicationEdit = page.getByRole('button', { name: 'Edit publication' });
    await expect(publicationExport).toBeVisible();
    if (isMobile) {
      await expect(transferTrigger.locator('.export-action-icon')).toBeVisible();
      await transferTrigger.focus();
      await page.keyboard.press('Enter');
      const transferMenu = page.getByRole('menu', { name: 'Publication transfer actions' });
      const exportOption = transferMenu.getByRole('menuitem', { name: 'Export publication' });
      const importOption = transferMenu.getByRole('menuitem', { name: 'Import recipe' });
      await expect(exportOption).toBeVisible();
      await expect(importOption).toBeVisible();
      await expect(exportOption).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(importOption).toBeFocused();
      await page.keyboard.press('Home');
      await expect(exportOption).toBeFocused();
      await page.keyboard.press('End');
      await expect(importOption).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(transferMenu).toHaveCount(0);
      await expect(transferTrigger).toBeFocused();

      await activateExport(transferTrigger);
      await activateExport(importOption);
      const importDialog = page.getByRole('dialog', { name: 'Import recipe' });
      await expect(importDialog).toBeVisible();
      await importDialog.getByRole('button', { name: 'Close import dialog' }).click();
      await expect(importDialog).not.toBeVisible();
    } else {
      await expect(publicationImport).toBeVisible();
    }
    await expect(publicationEdit).toBeVisible();
    const publicationActionTops = await page
      .locator(
        '.publication-mobile-actions button:visible, .publication-mobile-actions a:visible, .publication-detail-actions button:visible, .publication-detail-actions a:visible',
      )
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
    expect(new Set(publicationActionTops).size).toBe(1);
    const publicationExportX = (await publicationExport.boundingBox())?.x ?? 0;
    const publicationEditX = (await publicationEdit.boundingBox())?.x ?? 0;
    expect(isMobile ? publicationExportX : publicationEditX).toBeLessThan(
      isMobile ? publicationEditX : publicationExportX,
    );
    if (isMobile) {
      await expect(publicationEdit.locator('.publication-edit-label')).toBeHidden();
      await expect(page.locator('.publication-mobile-add-label')).toBeHidden();
      const exportBounds = await publicationExport.boundingBox();
      const transferActions = page.locator('.publication-mobile-transfer-actions');
      const transferBounds = await transferActions.boundingBox();
      const editBounds = await publicationEdit.boundingBox();
      expect(Math.round(exportBounds?.width ?? 0)).toBe(40);
      expect(Math.round(exportBounds?.height ?? 0)).toBe(40);
      const exportColors = await publicationExport.evaluate((element) => {
        const styles = getComputedStyle(element);
        return [styles.borderColor, styles.backgroundColor, styles.color];
      });
      const actionColors = await page
        .locator('.publication-transfer-export-source .export-action-button')
        .evaluate((element) => {
          const styles = getComputedStyle(element);
          return [styles.borderColor, styles.backgroundColor, styles.color];
        });
      expect(actionColors).toEqual(exportColors);
      expect((editBounds?.x ?? 0) - (transferBounds?.x ?? 0) - (transferBounds?.width ?? 0)).toBe(
        8,
      );
      const toolbarActions = page.locator(
        '.explorer-list-preferences-toolbar:has(.publication-mobile-add) button:visible, .explorer-list-preferences-toolbar:has(.publication-mobile-add) a:visible, .explorer-list-preferences-toolbar:has(.publication-mobile-add) select:visible',
      );
      const toolbarActionTops = await toolbarActions.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().top),
      );
      expect(new Set(toolbarActionTops.map(Math.round)).size).toBeLessThanOrEqual(2);
      const toolbarActionSizes = await toolbarActions.evaluateAll((elements) =>
        elements.map((element) => {
          const { width, height } = element.getBoundingClientRect();
          return [Math.round(width), Math.round(height)];
        }),
      );
      expect(toolbarActionSizes.every(([width, height]) => width === 40 && height === 40)).toBe(
        true,
      );
      for (const width of [352, 320]) {
        await page.setViewportSize({ width, height: 864 });
        await expectNoHorizontalOverflow(page);
        const toolbarActionBounds = await toolbarActions.evaluateAll((elements) =>
          elements.map((element) => {
            const { x, y, width: itemWidth } = element.getBoundingClientRect();
            return { x, y, width: itemWidth };
          }),
        );
        const toolbarActionRows = new Map<number, Array<{ x: number; width: number }>>();
        for (const { x, y, width: itemWidth } of toolbarActionBounds) {
          const row = Math.round(y);
          const bounds = toolbarActionRows.get(row) ?? [];
          bounds.push({ x, width: itemWidth });
          toolbarActionRows.set(row, bounds);
        }
        for (const row of toolbarActionRows.values()) {
          const sorted = [...row].sort((first, second) => first.x - second.x);
          const gaps = sorted.slice(0, -1).map((item, index) => {
            const next = sorted[index + 1]!;
            return next.x - item.x - item.width;
          });
          expect(gaps.every((gap) => gap >= -8 && gap <= 16)).toBe(true);
        }
      }
      await page.setViewportSize({ width: 352, height: 864 });
    } else {
      await expect(publicationExport.locator('.export-action-label')).toHaveText('Export');
      await expect(publicationEdit.locator('.publication-edit-label')).toBeVisible();
    }
    const publicationExportBackground = await publicationExport.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    const addRecipe = page.locator(
      '.publication-mobile-add:visible, .publication-new-recipe:visible',
    );
    const publicationActionLeftsBeforeExport = await Promise.all(
      [publicationExport, publicationEdit, addRecipe].map(
        async (action) => (await action.boundingBox())?.x,
      ),
    );
    const publicationActionTopsBeforeExport = await Promise.all(
      [publicationExport, publicationEdit, addRecipe].map(
        async (action) => (await action.boundingBox())?.y,
      ),
    );
    const publicationRecipes = page.getByRole('region', { name: 'Publication recipes' });
    const publicationRecipesTopBeforeExport = (await publicationRecipes.boundingBox())?.y;
    const addRecipeBackground = await addRecipe.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(publicationExportBackground).toBe('rgb(255, 255, 255)');
    expect(
      await publicationExport.evaluate((element) => getComputedStyle(element).borderTopColor),
    ).toBe('rgb(56, 96, 68)');
    expect(addRecipeBackground).toBe('rgb(56, 96, 68)');
    await expectKeyboardFocusVisible(page, publicationExport);
    const publicationA11y = await new AxeBuilder({ page }).analyze();
    expect(publicationA11y.violations).toEqual([]);
    if (testInfo.project.name === 'Fold 6') {
      const publicationExportBox = await publicationExport.boundingBox();
      expect(Math.round(publicationExportBox?.width ?? 0)).toBe(40);
      expect(Math.round(publicationExportBox?.height ?? 0)).toBe(40);
      await expectNoHorizontalOverflow(page);
    }
    const activatePublicationExport = async () => {
      if (isMobile) {
        await activateExport(transferTrigger);
        await activateExport(
          page.getByRole('menuitem', { name: 'Export publication', exact: true }),
        );
      } else {
        await activateExport(publicationExport);
      }
    };
    await activatePublicationExport();
    const publicationError = page.locator(
      isMobile
        ? '.publication-mobile-transfer-actions .export-action-feedback-error'
        : '.publication-detail-export-action .export-action-feedback-error',
    );
    await expect(publicationError).toHaveText('Unable to prepare the export. Please try again.');
    const publicationErrorBox = await publicationError.boundingBox();
    const publicationErrorActionBox = await publicationExport.boundingBox();
    expect(publicationErrorBox?.y).toBeGreaterThanOrEqual(
      (publicationErrorActionBox?.y ?? 0) + (publicationErrorActionBox?.height ?? 0),
    );
    expect(
      await Promise.all(
        [publicationExport, publicationEdit, addRecipe].map(
          async (action) => (await action.boundingBox())?.x,
        ),
      ),
    ).toEqual(publicationActionLeftsBeforeExport);
    expect(
      await Promise.all(
        [publicationExport, publicationEdit, addRecipe].map(
          async (action) => (await action.boundingBox())?.y,
        ),
      ),
    ).toEqual(publicationActionTopsBeforeExport);
    expect((await publicationRecipes.boundingBox())?.y).toBe(publicationRecipesTopBeforeExport);
    if (testInfo.project.name === 'Fold 6') {
      expect(publicationErrorBox?.width).toBeGreaterThan(100);
      await expectNoHorizontalOverflow(page);
    }
    const publicationDownload = page.waitForEvent('download');
    await activatePublicationExport();
    const publicationDownloadResult = await publicationDownload;
    expect(publicationDownloadResult.suggestedFilename()).toBe(
      `${publicationName} - Publication Export.zip`,
    );
    expect(new URL(page.url()).pathname).toBe(`/publications/${publicationId}`);
    const publicationFeedback = page.locator(
      isMobile
        ? '.publication-mobile-transfer-actions .export-action-feedback'
        : '.publication-detail-export-action .export-action-feedback',
    );
    await expect(publicationFeedback).toHaveText('Publication export ready. Download started.');
    expect(
      await Promise.all(
        [publicationExport, publicationEdit, addRecipe].map(
          async (action) => (await action.boundingBox())?.y,
        ),
      ),
    ).toEqual(publicationActionTopsBeforeExport);
    expect((await publicationRecipes.boundingBox())?.y).toBe(publicationRecipesTopBeforeExport);
    if (testInfo.project.name === 'Fold 6') {
      const toolbarActionTopsAfterExport = await page
        .locator(
          '.explorer-list-preferences-toolbar:has(.publication-mobile-add) button:visible, .explorer-list-preferences-toolbar:has(.publication-mobile-add) a:visible, .explorer-list-preferences-toolbar:has(.publication-mobile-add) select:visible',
        )
        .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
      expect(new Set(toolbarActionTopsAfterExport.map(Math.round)).size).toBeLessThanOrEqual(2);
    }
    const publicationTopsAfterExport = await page
      .locator(
        '.publication-mobile-actions button:visible, .publication-mobile-actions a:visible, .publication-detail-actions button:visible, .publication-detail-actions a:visible',
      )
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
    expect(new Set(publicationTopsAfterExport).size).toBe(1);
    const publicationExportBox = await publicationExport.boundingBox();
    const publicationFeedbackBox = await publicationFeedback.boundingBox();
    expect(publicationFeedbackBox?.y).toBeGreaterThanOrEqual(
      (publicationExportBox?.y ?? 0) + (publicationExportBox?.height ?? 0),
    );
    if (testInfo.project.name === 'Fold 6') {
      expect(publicationFeedbackBox?.width).toBeGreaterThan(100);
    }

    await page.goto(`/recipes/${recipeId}`);
    const recipeExport = page.getByRole('button', { name: 'Export recipe' });
    const recipePrint = page.locator('.recipe-output-menu-action').getByRole('button');
    const recipeSettings = page.getByRole('button', { name: 'Page settings' });
    const recipeEdit = page.getByRole('link', { name: 'Edit' });
    await expect(recipeExport).toBeVisible();
    const recipeDetails = page.getByRole('region', { name: 'Recipe details' });
    const recipeDetailsTopBeforeExport = (await recipeDetails.boundingBox())?.y;
    await expect(recipeExport.locator('.export-action-label')).toBeHidden();
    await expect(recipeExport.locator('.export-action-icon')).toBeVisible();
    const exportIconMask = await recipeExport
      .locator('.export-action-icon')
      .evaluate((element) => getComputedStyle(element).maskImage);
    expect(exportIconMask).toContain('export-arrow.png');
    const [exportBackground, printBackground, settingsBackground, editBackground] =
      await Promise.all([
        recipeExport.evaluate((element) => getComputedStyle(element).backgroundColor),
        recipePrint.evaluate((element) => getComputedStyle(element).backgroundColor),
        recipeSettings.evaluate((element) => getComputedStyle(element).backgroundColor),
        recipeEdit.evaluate((element) => getComputedStyle(element).backgroundColor),
      ]);
    expect(exportBackground).toBe('rgb(56, 96, 68)');
    expect(printBackground).toBe('rgb(56, 96, 68)');
    expect(settingsBackground).toBe('rgb(247, 249, 244)');
    expect(editBackground).toBe('rgb(247, 249, 244)');
    await expectKeyboardFocusVisible(page, recipeExport);
    const recipeA11y = await new AxeBuilder({ page }).analyze();
    expect(recipeA11y.violations).toEqual([]);
    if (testInfo.project.name === 'Fold 6') {
      const recipeExportBox = await recipeExport.boundingBox();
      expect(Math.round(recipeExportBox?.width ?? 0)).toBe(36);
      expect(Math.round(recipeExportBox?.height ?? 0)).toBe(36);
      await expectNoHorizontalOverflow(page);
    }
    const recipeActionLeftsBeforeExport = await Promise.all(
      [recipeExport, recipePrint, recipeEdit].map(
        async (action) => (await action.boundingBox())?.x,
      ),
    );
    await activateExport(recipeExport);
    const recipeError = page.locator(
      '.recipe-detail-heading-actions .export-action-feedback-error',
    );
    await expect(recipeError).toHaveText('Unable to prepare the export. Please try again.');
    const recipeErrorBox = await recipeError.boundingBox();
    const recipeErrorActionBox = await recipeExport.boundingBox();
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(recipeErrorBox?.y).toBeGreaterThanOrEqual(
      (recipeErrorActionBox?.y ?? 0) + (recipeErrorActionBox?.height ?? 0),
    );
    expect(recipeErrorBox?.x).toBeGreaterThanOrEqual(0);
    expect((recipeErrorBox?.x ?? 0) + (recipeErrorBox?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth,
    );
    expect(
      await Promise.all(
        [recipeExport, recipePrint, recipeEdit].map(
          async (action) => (await action.boundingBox())?.x,
        ),
      ),
    ).toEqual(recipeActionLeftsBeforeExport);
    expect((await recipeDetails.boundingBox())?.y).toBe(recipeDetailsTopBeforeExport);
    if (testInfo.project.name === 'Fold 6') {
      expect(recipeErrorBox?.width).toBeGreaterThan(100);
      await expectNoHorizontalOverflow(page);
    }
    const recipeDownload = page.waitForEvent('download');
    await activateExport(recipeExport);
    const recipeDownloadResult = await recipeDownload;
    expect(recipeDownloadResult.suggestedFilename()).toBe(`${recipeName} - Recipe Export.zip`);
    expect(new URL(page.url()).pathname).toBe(`/recipes/${recipeId}`);
    const sharedFeedback = page.locator('.recipe-action-feedback-region');
    await expect(sharedFeedback).toHaveText('Recipe export ready. Download started.');
    await expect(page.locator('.recipe-detail-export-action .export-action-feedback')).toHaveCount(
      0,
    );
    const recipeOutputDownload = page.waitForEvent('download');
    await recipePrint.click();
    await page.getByRole('menuitem', { name: 'Download HTML' }).click();
    await recipeOutputDownload;
    await expect(sharedFeedback).toHaveText('HTML download started.');
    await expect(page.locator('.recipe-action-feedback-region')).toHaveCount(1);
    const recipeActionTops = await page
      .locator('.recipe-detail-heading-actions button, .recipe-detail-heading-actions a')
      .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
    expect(new Set(recipeActionTops.map(Math.round)).size).toBeLessThanOrEqual(2);
    expect((await recipeDetails.boundingBox())?.y).toBe(recipeDetailsTopBeforeExport);
    const recipeExportBox = await recipeExport.boundingBox();
    const recipeFeedbackBox = await sharedFeedback.boundingBox();
    expect(recipeFeedbackBox?.y).toBeGreaterThanOrEqual(
      (recipeExportBox?.y ?? 0) + (recipeExportBox?.height ?? 0),
    );
    expect(downloadRequestCount).toBe(3);
    expect(requestedScopes).toEqual([
      { type: 'database' },
      { type: 'database' },
      { type: 'publication', id: publicationId },
      { type: 'publication', id: publicationId },
      { type: 'recipe', id: recipeId },
      { type: 'recipe', id: recipeId },
    ]);
  } finally {
    releaseFirstRequest?.();
    await deleteTestUser(request, owner);
  }
});

test('navigating away aborts an in-flight export request @e2e', async ({ page, request }) => {
  const owner = await createTestUser(request);
  let abortObserved = false;
  await page.exposeFunction('recordExportRequestAbort', () => {
    abortObserved = true;
  });
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    const windowWithExportState = window as Window & {
      exportRequestStarted?: boolean;
    };
    windowWithExportState.exportRequestStarted = false;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const inputUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (new URL(inputUrl, window.location.href).pathname !== '/api/exports') {
        return originalFetch(input, init);
      }

      windowWithExportState.exportRequestStarted = true;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            const recordAbort = (
              window as Window & { recordExportRequestAbort?: () => Promise<void> }
            ).recordExportRequestAbort;
            void recordAbort?.();
            reject(new DOMException('The export request was aborted.', 'AbortError'));
          },
          { once: true },
        );
      });
    };
  });

  try {
    await signIn(page, owner.email, owner.password);
    await page.goto('/settings');
    const exportButton = page.getByRole('button', { name: 'Export database' });
    await exportButton.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as Window & { exportRequestStarted?: boolean }).exportRequestStarted,
        ),
      )
      .toBe(true);
    await expect(exportButton).toBeDisabled();
    await page.getByRole('link', { name: 'Library' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await expect.poll(() => abortObserved).toBe(true);
  } finally {
    await deleteTestUser(request, owner);
  }
});
