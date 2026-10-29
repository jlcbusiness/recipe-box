import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
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
    Prefer: 'return=representation',
  };
}

function expectNoStoreOrRevalidation(headers: Record<string, string>) {
  const cacheControl = headers['cache-control'] ?? '';
  expect(cacheControl).toMatch(/no-store|no-cache/);
  if (!/\bno-store\b/i.test(cacheControl)) {
    expect(cacheControl).toMatch(/\bmust-revalidate\b/i);
  }
}

async function expectRenderedCenterCrop(image: Locator) {
  const screenshot = await image.screenshot();
  const { data, info } = await sharp(screenshot)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (const x of [10, info.width - 10]) {
    const pixelOffset = (Math.floor(info.height / 2) * info.width + x) * info.channels;
    expect(data[pixelOffset + 1]).toBeGreaterThan(120);
    expect(data[pixelOffset]).toBeLessThan(140);
    expect(data[pixelOffset + 2]).toBeLessThan(180);
  }
}

async function inspectPrintedRecipePdf(pdfBytes: Buffer) {
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
  const pdfDocument = await getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  try {
    const pages = await Promise.all(
      Array.from({ length: pdfDocument.numPages }, (_, index) => pdfDocument.getPage(index + 1)),
    );
    const firstPage = pages[0];
    if (!firstPage) throw new Error('Expected the printed recipe to contain a page.');
    const viewport = firstPage.getViewport({ scale: 1 });
    const imageOperators = new Set([
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintInlineImageXObjectGroup,
      OPS.paintImageXObjectRepeat,
    ]);
    const pageContent = await Promise.all(
      pages.map(async (page) => {
        const [textContent, operatorList] = await Promise.all([
          page.getTextContent(),
          page.getOperatorList(),
        ]);
        return {
          text: textContent.items.map((item) => ('str' in item ? item.str : '')).join(' '),
          textBounds: textContent.items.flatMap((item) =>
            'str' in item ? [{ text: item.str, x: item.transform[4], width: item.width }] : [],
          ),
          imageOperations: operatorList.fnArray.filter((operator) => imageOperators.has(operator))
            .length,
        };
      }),
    );
    return {
      width: viewport.width,
      height: viewport.height,
      text: pageContent.map((page) => page.text).join(' '),
      textBounds: pageContent.flatMap((page) => page.textBounds),
      imageOperations: pageContent.reduce((count, page) => count + page.imageOperations, 0),
    };
  } finally {
    await pdfDocument.destroy();
  }
}

async function createRecipe(
  request: import('@playwright/test').APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  name = 'Guest citrus cake',
  publicationId?: string,
  includeCookingData = false,
  extraIngredientRows: unknown[] = [],
  instructionSuffix = '',
  plainTextSuffix = instructionSuffix,
) {
  const ingredientRowId = includeCookingData ? randomUUID() : null;
  const saltRowId = includeCookingData ? randomUUID() : null;
  const endpoint = publicationId ? 'save_recipe_with_relationships' : 'save_recipe';
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/${endpoint}`, {
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
      p_serves: includeCookingData ? 4 : 8,
      p_prep_time_minutes: includeCookingData ? 65 : 15,
      p_mixing_time_minutes: null,
      p_marinate_time_minutes: null,
      p_chill_time_minutes: null,
      p_freeze_time_minutes: null,
      p_cook_time_minutes: 30,
      p_bake_time_minutes: 35,
      p_cooling_time_minutes: 20,
      p_rest_time_minutes: null,
      p_total_time_minutes: 70,
      p_notes_markdown: 'Private note sentinel',
      p_meal_type_ids: [],
      p_cuisine_ids: [],
      p_equipment_ids: [],
      p_ingredient_rows: ingredientRowId
        ? [
            {
              recipe_ingredient_id: ingredientRowId,
              ingredient_id: null,
              ingredient_name: 'Flour',
              is_main: true,
              detail: '',
              preparation: '',
              measurements: [
                {
                  measurement_type: 'volume',
                  amount_min: 250,
                  amount_max: null,
                  unit_code: 'ml',
                  picklist_value_id: null,
                },
              ],
            },
            {
              recipe_ingredient_id: saltRowId,
              ingredient_id: null,
              ingredient_name: 'Salt',
              is_main: false,
              detail: '',
              preparation: '',
              measurements: [
                {
                  measurement_type: 'volume',
                  amount_min: 1 / 16,
                  amount_max: null,
                  unit_code: 'tsp',
                  picklist_value_id: null,
                },
              ],
            },
            ...extraIngredientRows,
          ]
        : [],
      p_instruction_steps: ingredientRowId
        ? [
            {
              id: randomUUID(),
              position: 0,
              content_markdown: `Fold [[ingredient:${ingredientRowId}|flour]] into batter.${instructionSuffix}`,
              plain_text: `Fold flour into batter.${plainTextSuffix}`,
            },
          ]
        : [],
      ...(publicationId
        ? {
            p_publication_id: publicationId,
            p_publication_page: null,
            p_recipe_url: null,
            p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
            p_tag_ids: [],
          }
        : {}),
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = await response.json();
  return recipe as { id: string; version: number };
}

async function createPublication(
  request: import('@playwright/test').APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  name: string,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/create_publication`, {
    headers: ownerHeaders(config, user),
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
  expect(recipe?.public_id).toBeTruthy();
  return recipe.public_id;
}

test('public links respect privacy and lifecycle HTTP status @e2e', async ({ request }) => {
  const user = await createTestUser(request);
  let otherUser: TestUser | null = null;
  const config = await getLocalSupabaseConfig();
  let tombstoneId: string | null = null;

  try {
    const recipe = await createRecipe(request, config, user);
    const publicId = await getPublicId(request, config, recipe.id);

    const publicResponse = await request.get(`/r/${publicId}`);
    expect(publicResponse.status()).toBe(200);
    expectNoStoreOrRevalidation(publicResponse.headers());
    const publicHtml = await publicResponse.text();
    expect(publicHtml).toContain('Guest citrus cake');
    expect(publicHtml).not.toContain('Private note sentinel');
    expect(publicHtml).not.toContain(recipe.id);
    expect(publicHtml).not.toContain('Main navigation');

    otherUser = await createTestUser(request);
    const nonOwnerPrivacyChange = await request.post(
      `${config.apiUrl}/rest/v1/rpc/set_recipe_privacy`,
      {
        headers: ownerHeaders(config, otherUser),
        data: {
          p_recipe_id: recipe.id,
          p_expected_version: recipe.version,
          p_is_private: true,
        },
      },
    );
    expect(nonOwnerPrivacyChange.ok()).toBe(false);
    const unchangedRecipe = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=is_private,version&id=eq.${recipe.id}`,
      { headers: ownerHeaders(config, user) },
    );
    expect(unchangedRecipe.ok(), await unchangedRecipe.text()).toBeTruthy();
    expect(await unchangedRecipe.json()).toEqual([{ is_private: false, version: recipe.version }]);

    const privatize = await request.post(`${config.apiUrl}/rest/v1/rpc/set_recipe_privacy`, {
      headers: ownerHeaders(config, user),
      data: {
        p_recipe_id: recipe.id,
        p_expected_version: recipe.version,
        p_is_private: true,
      },
    });
    expect(privatize.ok(), await privatize.text()).toBeTruthy();

    const privateResponse = await request.get(`/r/${publicId}`);
    expect(privateResponse.status()).toBe(404);
    expectNoStoreOrRevalidation(privateResponse.headers());
    const privateHtml = await privateResponse.text();
    expect(privateHtml).toContain('This recipe is currently unavailable.');
    expect(privateHtml).not.toContain('Guest citrus cake');

    const restoreLink = await request.post(`${config.apiUrl}/rest/v1/rpc/set_recipe_privacy`, {
      headers: ownerHeaders(config, user),
      data: {
        p_recipe_id: recipe.id,
        p_expected_version: recipe.version + 1,
        p_is_private: false,
      },
    });
    expect(restoreLink.ok(), await restoreLink.text()).toBeTruthy();

    const trash = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, user),
      data: { p_recipe_id: recipe.id, p_expected_version: recipe.version + 2 },
    });
    expect(trash.ok(), await trash.text()).toBeTruthy();
    const trashedResponse = await request.get(`/r/${publicId}`);
    expect(trashedResponse.status()).toBe(404);
    expectNoStoreOrRevalidation(trashedResponse.headers());
    expect(await trashedResponse.text()).toContain('This recipe is currently unavailable.');
    expect(await trashedResponse.text()).not.toContain('Guest citrus cake');

    const restoreTrashedRecipe = await request.post(`${config.apiUrl}/rest/v1/rpc/restore_recipe`, {
      headers: ownerHeaders(config, user),
      data: { p_recipe_id: recipe.id, p_expected_version: recipe.version + 3 },
    });
    expect(restoreTrashedRecipe.ok(), await restoreTrashedRecipe.text()).toBeTruthy();
    expect((await request.get(`/r/${publicId}`)).status()).toBe(200);
    const trashAgain = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, user),
      data: { p_recipe_id: recipe.id, p_expected_version: recipe.version + 4 },
    });
    expect(trashAgain.ok(), await trashAgain.text()).toBeTruthy();
    expect((await request.get(`/r/${publicId}`)).status()).toBe(404);

    const unknownResponse = await request.get(`/r/${randomUUID()}`);
    expect(unknownResponse.status()).toBe(404);
    expectNoStoreOrRevalidation(unknownResponse.headers());
    expect(await unknownResponse.text()).toContain('This recipe is currently unavailable.');

    const historyResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,after_data&record_id=eq.${recipe.id}&order=created_at.asc`,
      { headers: serviceHeaders(config) },
    );
    expect(historyResponse.ok(), await historyResponse.text()).toBeTruthy();
    const history = (await historyResponse.json()) as Array<{
      event_type: string;
      after_data: { is_private?: boolean } | null;
    }>;
    expect(history.map((event) => event.event_type)).toContain('recipe.updated');
    expect(history.some((event) => event.after_data?.is_private === true)).toBe(true);

    tombstoneId = publicId;
    const purge = await request.post(`${config.apiUrl}/rest/v1/rpc/purge_trashed_item`, {
      headers: ownerHeaders(config, user),
      data: {
        p_item_type: 'recipe',
        p_item_id: recipe.id,
        p_expected_version: recipe.version + 5,
        p_recipe_disposition: null,
      },
    });
    expect(purge.ok(), await purge.text()).toBeTruthy();

    const goneResponse = await request.get(`/r/${tombstoneId}`);
    expect(goneResponse.status()).toBe(410);
    expectNoStoreOrRevalidation(goneResponse.headers());
    expect(await goneResponse.text()).not.toContain('Guest citrus cake');
  } finally {
    if (otherUser) {
      await deleteTestUser(request, otherUser);
    }
    if (tombstoneId) {
      await request.delete(
        `${config.apiUrl}/rest/v1/purged_recipe_public_ids?public_id=eq.${tombstoneId}`,
        {
          headers: serviceHeaders(config),
        },
      );
    }
    await deleteTestUser(request, user);
  }
});

test('every bulk and publication purge preserves public-link lifecycle status @e2e', async ({
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const publicIds: string[] = [];

  try {
    const bulkRecipe = await createRecipe(request, config, user, 'Bulk-purged recipe');
    const bulkPublicId = await getPublicId(request, config, bulkRecipe.id);
    publicIds.push(bulkPublicId);
    const trashBulkRecipe = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, user),
      data: { p_recipe_id: bulkRecipe.id, p_expected_version: bulkRecipe.version },
    });
    expect(trashBulkRecipe.ok(), await trashBulkRecipe.text()).toBeTruthy();
    const purgeAll = await request.post(`${config.apiUrl}/rest/v1/rpc/purge_all_trashed`, {
      headers: ownerHeaders(config, user),
      data: {},
    });
    expect(purgeAll.ok(), await purgeAll.text()).toBeTruthy();
    expect((await request.get(`/r/${bulkPublicId}`)).status()).toBe(410);

    const expiredRecipe = await createRecipe(request, config, user, 'Expired recipe purge');
    const expiredRecipePublicId = await getPublicId(request, config, expiredRecipe.id);
    publicIds.push(expiredRecipePublicId);
    const trashExpiredRecipe = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, user),
      data: { p_recipe_id: expiredRecipe.id, p_expected_version: expiredRecipe.version },
    });
    expect(trashExpiredRecipe.ok(), await trashExpiredRecipe.text()).toBeTruthy();
    const purgeExpiredRecipe = await request.post(
      `${config.apiUrl}/rest/v1/rpc/purge_expired_recipes`,
      {
        headers: serviceHeaders(config),
        data: { p_cutoff: '2100-01-01T00:00:00.000Z' },
      },
    );
    expect(purgeExpiredRecipe.ok(), await purgeExpiredRecipe.text()).toBeTruthy();
    expect((await request.get(`/r/${expiredRecipePublicId}`)).status()).toBe(410);

    const expiredPublicationId = await createPublication(
      request,
      config,
      user,
      'Expired publication purge',
    );
    const expiredPublicationRecipe = await createRecipe(
      request,
      config,
      user,
      'Expired publication recipe',
      expiredPublicationId,
    );
    const expiredPublicationPublicId = await getPublicId(
      request,
      config,
      expiredPublicationRecipe.id,
    );
    publicIds.push(expiredPublicationPublicId);
    const trashExpiredPublication = await request.post(
      `${config.apiUrl}/rest/v1/rpc/trash_publication`,
      {
        headers: ownerHeaders(config, user),
        data: {
          p_publication_id: expiredPublicationId,
          p_expected_version: 1,
          p_recipe_disposition: 'delete',
          p_destination_publication_id: null,
        },
      },
    );
    expect(trashExpiredPublication.ok(), await trashExpiredPublication.text()).toBeTruthy();
    const purgeExpiredPublication = await request.post(
      `${config.apiUrl}/rest/v1/rpc/purge_expired_publications`,
      {
        headers: serviceHeaders(config),
        data: { p_cutoff: '2100-01-01T00:00:00.000Z' },
      },
    );
    expect(purgeExpiredPublication.ok(), await purgeExpiredPublication.text()).toBeTruthy();
    expect((await request.get(`/r/${expiredPublicationPublicId}`)).status()).toBe(410);

    for (const disposition of ['all', 'deleted_with_publication', 'keep'] as const) {
      const publicationId = await createPublication(
        request,
        config,
        user,
        `Public-link purge ${disposition}`,
      );
      const recipe = await createRecipe(
        request,
        config,
        user,
        `Public-link purge recipe ${disposition}`,
        publicationId,
      );
      const publicId = await getPublicId(request, config, recipe.id);
      publicIds.push(publicId);

      const trashPublication = await request.post(
        `${config.apiUrl}/rest/v1/rpc/trash_publication`,
        {
          headers: ownerHeaders(config, user),
          data: {
            p_publication_id: publicationId,
            p_expected_version: 1,
            p_recipe_disposition: 'delete',
            p_destination_publication_id: null,
          },
        },
      );
      expect(trashPublication.ok(), await trashPublication.text()).toBeTruthy();

      const purgePublication = await request.post(
        `${config.apiUrl}/rest/v1/rpc/purge_trashed_item`,
        {
          headers: ownerHeaders(config, user),
          data: {
            p_item_type: 'publication',
            p_item_id: publicationId,
            p_expected_version: 2,
            p_recipe_disposition: disposition,
          },
        },
      );
      expect(purgePublication.ok(), await purgePublication.text()).toBeTruthy();
      expect((await request.get(`/r/${publicId}`)).status()).toBe(
        disposition === 'keep' ? 404 : 410,
      );
    }
  } finally {
    await deleteTestUser(request, user);
    for (const publicId of publicIds) {
      await request.delete(
        `${config.apiUrl}/rest/v1/purged_recipe_public_ids?public_id=eq.${publicId}`,
        { headers: serviceHeaders(config) },
      );
    }
  }
});

test('an owner can switch a recipe between linkable and private @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  let publicId: string | null = null;

  try {
    const recipe = await createRecipe(request, config, user);
    publicId = await getPublicId(request, config, recipe.id);

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.goto(`/recipes/${recipe.id}`);

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy share link' }).click();
    const copyStatus = page.getByRole('status');
    await expect(copyStatus).toHaveText('Link copied!');
    await expect(copyStatus).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${new URL(page.url()).origin}/r/${publicId}`,
    );

    const makePrivateToggle = page.getByRole('switch', { name: 'Make private' });
    await expect(makePrivateToggle).toHaveAttribute('aria-checked', 'true');
    const [shareBox, toggleBox, printBox, settingsBox, exportBox, editBox] = await Promise.all([
      page.getByRole('button', { name: 'Copy share link' }).boundingBox(),
      makePrivateToggle.boundingBox(),
      page.getByRole('button', { name: 'Print & Download' }).boundingBox(),
      page.getByRole('button', { name: 'Page settings' }).boundingBox(),
      page.getByRole('button', { name: 'Export recipe' }).boundingBox(),
      page.getByRole('link', { name: 'Edit' }).boundingBox(),
    ]);
    if (!shareBox || !toggleBox || !printBox || !settingsBox || !exportBox || !editBox) {
      throw new Error('Recipe visibility toolbar actions are not visible.');
    }
    const copyStatusBox = await copyStatus.boundingBox();
    expect(copyStatusBox).not.toBeNull();
    expect(copyStatusBox?.x).toBeCloseTo(shareBox.x, 1);
    expect(copyStatusBox?.y).toBeGreaterThan(shareBox.y + shareBox.height);
    await page.locator('main h1').click();
    await expect(copyStatus).toBeHidden();
    if (testInfo.project.name === 'chromium') {
      for (const actionBox of [toggleBox, printBox, settingsBox, exportBox, editBox]) {
        expect(actionBox.y).toBeCloseTo(shareBox.y, 1);
      }
      expect(shareBox.x).toBeLessThan(toggleBox.x);
      expect(toggleBox.x).toBeLessThan(printBox.x);
      expect(printBox.x).toBeLessThan(exportBox.x);
      expect(exportBox.x).toBeLessThan(settingsBox.x);
      expect(exportBox.x).toBeLessThan(editBox.x);
    } else {
      for (const actionBox of [toggleBox, printBox, settingsBox, exportBox, editBox]) {
        expect(actionBox.y).toBeCloseTo(shareBox.y, 1);
      }
      expect(shareBox.x).toBeLessThan(toggleBox.x);
      expect(toggleBox.x).toBeLessThan(printBox.x);
      expect(printBox.x).toBeLessThan(exportBox.x);
      expect(exportBox.x).toBeLessThan(settingsBox.x);
      expect(exportBox.x).toBeLessThan(editBox.x);
      const viewportWidth = page.viewportSize()?.width;
      if (!viewportWidth) {
        throw new Error('The mobile viewport width is unavailable.');
      }
      for (const actionBox of [shareBox, toggleBox, printBox, settingsBox, exportBox, editBox]) {
        expect(actionBox.x).toBeGreaterThanOrEqual(20);
        expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(viewportWidth - 20);
      }
    }
    if (testInfo.project.name === 'chromium') {
      await expect(makePrivateToggle.locator('.recipe-privacy-toggle-state-full')).toHaveText(
        'Linkable',
      );
    } else {
      await expect(makePrivateToggle.locator('.recipe-privacy-toggle-state-compact')).toBeVisible();
      expect(
        await makePrivateToggle
          .locator('.recipe-privacy-toggle-state-compact')
          .evaluate((element) => element.textContent),
      ).toBe('CanLink');
    }
    await expect(makePrivateToggle.locator('.recipe-privacy-toggle-track')).toHaveCSS(
      'background-color',
      'rgb(67, 143, 75)',
    );
    await makePrivateToggle.click();
    const makeLinkableToggle = page.getByRole('switch', { name: 'Make linkable' });
    await expect(makeLinkableToggle).toHaveAttribute('aria-checked', 'false');
    await expect(makeLinkableToggle.locator('.recipe-privacy-toggle-state')).toHaveText('Private');
    expect((await request.get(`/r/${publicId}`)).status()).toBe(404);

    await makeLinkableToggle.click();
    await expect(page.getByRole('switch', { name: 'Make private' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    if (testInfo.project.name === 'chromium') {
      await expect(page.locator('.recipe-privacy-toggle-state-full')).toHaveText('Linkable');
    } else {
      await expect(page.locator('.recipe-privacy-toggle-state-compact')).toBeVisible();
    }
    expect((await request.get(`/r/${publicId}`)).status()).toBe(200);
  } finally {
    await deleteTestUser(request, user);
    if (publicId) {
      await request.delete(
        `${config.apiUrl}/rest/v1/purged_recipe_public_ids?public_id=eq.${publicId}`,
        { headers: serviceHeaders(config) },
      );
    }
  }
});

test('public recipe output actions create standalone files and keep settings transient @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await page.addInitScript(() => {
      window.print = () => {
        const topDocument = window.top?.document;
        const photo = document.querySelector('.recipe-instruction-photo');
        const unit = document.querySelector('.recipe-reader-unit-trigger');
        topDocument?.documentElement.setAttribute(
          'data-print-page-count',
          String(document.querySelectorAll('.recipe-output-page').length),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-reader-layout',
          String(Boolean(document.querySelector('.recipe-reading-layout'))),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-photo-float',
          photo ? getComputedStyle(photo).float : 'none',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-unit-cursor',
          unit ? getComputedStyle(unit).cursor : 'default',
        );
        topDocument?.documentElement.setAttribute('data-print-requested', 'true');
        window.top?.dispatchEvent(new Event('afterprint'));
      };
    });
    const recipe = await createRecipe(
      request,
      config,
      user,
      'Standalone output view',
      undefined,
      true,
      [],
      ' Bake at F!350 for =45m=.',
      ' Bake at 350°F for 45m.',
    );
    const publicId = await getPublicId(request, config, recipe.id);
    await page.addInitScript(() => {
      window.print = () => {
        const topDocument = window.top?.document;
        const emphasisTokens = Array.from(
          document.querySelectorAll(
            '.recipe-instruction-mention, .recipe-instruction-duration, .recipe-instruction-temperature',
          ),
        );
        const ingredientColumn = document.querySelector('.recipe-output-ingredient-column');
        const groupHeadingOffsets = Array.from(
          document.querySelectorAll(
            '.recipe-output-ingredient-column .recipe-ingredient-set-divider h3',
          ),
        ).map((heading) => {
          if (!ingredientColumn) return Number.NaN;
          return Math.round(
            heading.getBoundingClientRect().left - ingredientColumn.getBoundingClientRect().left,
          );
        });
        const metadata = document.querySelector<HTMLElement>('.recipe-output-metadata');
        const attribution = document.querySelector<HTMLElement>('.recipe-output-attribution');
        const metadataRow = metadata?.firstElementChild;
        const metadataLabel = metadata?.querySelector('dt');
        const metadataValue = metadata?.querySelector('dd');
        const ingredientName = document.querySelector<HTMLElement>(
          '.recipe-output-ingredient-column .recipe-reader-table-name',
        );
        const ingredientDetails = document.querySelector<HTMLElement>(
          '.recipe-output-ingredient-column .recipe-reader-specifics',
        );
        const groupHeading = document.querySelector<HTMLElement>(
          '.recipe-output-ingredient-column .recipe-ingredient-set-divider h3',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-emphasis-colors',
          emphasisTokens.map((token) => getComputedStyle(token).color).join('|'),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-emphasis-weights',
          emphasisTokens.map((token) => getComputedStyle(token).fontWeight).join('|'),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-ingredient-group-heading-offsets',
          groupHeadingOffsets.join(','),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-metadata-margin',
          metadata ? getComputedStyle(metadata).marginTop : '',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-metadata-attribution-gap',
          metadata && attribution
            ? String(
                Math.round(
                  metadata.getBoundingClientRect().top - attribution.getBoundingClientRect().bottom,
                ),
              )
            : '',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-metadata-alignment',
          metadata ? getComputedStyle(metadata).alignItems : '',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-metadata-row-alignment',
          metadataRow instanceof HTMLElement ? getComputedStyle(metadataRow).alignItems : '',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-metadata-label-size',
          metadataLabel ? getComputedStyle(metadataLabel).fontSize : '',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-metadata-value-size',
          metadataValue ? getComputedStyle(metadataValue).fontSize : '',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-ingredient-details-style',
          ingredientDetails
            ? `${getComputedStyle(ingredientDetails).display},${getComputedStyle(ingredientDetails).marginTop}`
            : '',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-ingredient-name-weight',
          ingredientName ? getComputedStyle(ingredientName).fontWeight : '',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-group-heading-style',
          groupHeading
            ? `${getComputedStyle(groupHeading).fontFamily},${getComputedStyle(groupHeading).fontStyle},${getComputedStyle(groupHeading).fontSize}`
            : '',
        );
        topDocument?.documentElement.setAttribute('data-print-requested', 'true');
        window.top?.dispatchEvent(new Event('afterprint'));
      };
    });
    await page.goto(`/r/${publicId}`);
    await expect(
      page.getByRole('heading', { name: 'Standalone output view - serves 4' }),
    ).toBeVisible();
    await expect(page.locator('.recipe-instruction-list')).toContainText('Fold flour into batter.');
    const outputButton = page.getByRole('button', { name: 'Print & Download' });
    await expect(outputButton.locator('svg.lucide-printer')).toBeVisible();
    const settingsButton = page.getByRole('button', { name: 'Page settings' });
    await expect(page.getByRole('button', { name: 'Export recipe' })).toHaveCount(0);

    await outputButton.click();
    const outputMenu = page.getByRole('menu', { name: 'Print and download actions' });
    await expect(outputMenu.getByRole('menuitem')).toHaveCount(4);
    await expect(outputMenu.getByRole('menuitem', { name: 'Print', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(outputMenu).toBeHidden();
    await expect(outputButton).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileOutputButton = page.getByRole('button', { name: 'Download' });
    const mobileSettingsButton = page.getByRole('button', { name: 'Page settings' });
    await expect(mobileOutputButton).toHaveAttribute('title', 'Download');
    await expect(mobileOutputButton.locator('svg.lucide-download')).toBeVisible();
    const [mobileTriggerBox, mobileSettingsBox] = await Promise.all([
      mobileOutputButton.boundingBox(),
      mobileSettingsButton.boundingBox(),
    ]);
    if (!mobileTriggerBox || !mobileSettingsBox) {
      throw new Error('Expected the mobile output controls to have layout bounds.');
    }
    expect(mobileTriggerBox.width).toBe(36);
    expect(mobileTriggerBox.height).toBe(36);
    expect(mobileSettingsBox.width).toBe(36);
    expect(mobileSettingsBox.height).toBe(36);
    await mobileOutputButton.click();
    await expect(outputMenu.getByRole('menuitem')).toHaveCount(4);
    await expect(outputMenu.getByRole('menuitem', { name: 'Print', exact: true })).toBeVisible();
    const mobileMenuBox = await outputMenu.boundingBox();
    const viewport = page.viewportSize();
    if (!mobileTriggerBox || !mobileMenuBox || !viewport) {
      throw new Error('Expected the mobile output trigger and menu to have layout bounds.');
    }
    expect(mobileMenuBox.x).toBeGreaterThanOrEqual(0);
    expect(mobileMenuBox.x + mobileMenuBox.width).toBeLessThanOrEqual(viewport.width);
    expect(mobileMenuBox.y).toBeGreaterThanOrEqual(mobileTriggerBox.y + mobileTriggerBox.height);
    await page.keyboard.press('Escape');
    await expect(mobileOutputButton).toBeFocused();
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(outputButton).toBeVisible();

    await settingsButton.click();
    const settingsPanel = page.getByRole('dialog', { name: 'Page settings' });
    const repeatIngredients = settingsPanel.getByRole('checkbox', {
      name: 'Repeat ingredients on each page',
    });
    const includePhotos = settingsPanel.getByRole('checkbox', {
      name: 'Include instruction photos',
    });
    const useEmphasisColors = settingsPanel.getByRole('checkbox', {
      name: 'Use emphasis colors',
    });
    await expect(
      settingsPanel.getByRole('checkbox', { name: 'Include private-only details' }),
    ).toHaveCount(0);
    await expect(repeatIngredients).toBeChecked();
    await expect(includePhotos).toBeChecked();
    await expect(useEmphasisColors).toBeChecked();
    await repeatIngredients.uncheck();
    await includePhotos.uncheck();
    await useEmphasisColors.uncheck();
    await expect(page.locator('main.recipes-main')).toHaveClass(/no-instruction-photos/);
    await expect(page.locator('main.recipes-main')).toHaveClass(/no-instruction-emphasis/);
    await page.reload();
    await settingsButton.click();
    await expect(
      page.getByRole('checkbox', { name: 'Repeat ingredients on each page' }),
    ).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Include instruction photos' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Use emphasis colors' })).toBeChecked();

    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const title = document.querySelector<HTMLElement>('.recipe-detail-title');
      const summary = document.querySelector<HTMLElement>('.recipe-public-summary');
      const step = document.querySelector<HTMLElement>(
        'main.recipes-main .recipe-instruction-list > li',
      );
      const ingredientTable = document.querySelector<HTMLTableElement>(
        '[aria-labelledby="ingredients-title"] .recipe-ingredient-first-table',
      );
      const ingredientTableBody = ingredientTable?.tBodies.item(0);
      if (!title || !summary || !step || !ingredientTable || !ingredientTableBody) {
        throw new Error(
          'Expected the recipe title, summary, ingredient table, and instruction list to be available.',
        );
      }
      const groupRow = document.createElement('tr');
      groupRow.className = 'recipe-ingredient-set-divider';
      const groupCell = document.createElement('th');
      groupCell.colSpan = ingredientTable.tHead?.rows[0]?.cells.length ?? 2;
      const groupHeading = document.createElement('h3');
      groupHeading.textContent = 'Test ingredient group';
      groupCell.append(groupHeading);
      groupRow.append(groupCell);
      ingredientTableBody.prepend(groupRow);
      const ingredientName = ingredientTableBody.querySelector<HTMLElement>(
        'tr:not(.recipe-ingredient-set-divider) > th',
      );
      if (!ingredientName) throw new Error('Expected an ingredient name cell.');
      const ingredientDetails = document.createElement('span');
      ingredientDetails.className = 'recipe-reader-specifics';
      ingredientDetails.textContent = 'fresh';
      ingredientName.append(ingredientDetails);
      const attribution = document.createElement('p');
      attribution.className = 'recipe-attribution';
      attribution.classList.add('recipe-output-attribution');
      const from = document.createElement('span');
      from.textContent = 'From ';
      const publicationLink = document.createElement('a');
      publicationLink.href = 'https://pantry-fieldnotes.test/publications/pantry-fieldnotes';
      const publicationName = document.createElement('cite');
      publicationName.textContent = 'Pantry Fieldnotes';
      publicationLink.append(publicationName);
      const recipeLink = document.createElement('a');
      recipeLink.className = 'recipe-source-link';
      recipeLink.href = 'https://pantry-fieldnotes.test/recipes/standalone';
      recipeLink.textContent = recipeLink.href;
      attribution.append(from, publicationLink, recipeLink);
      title.append(attribution);

      const equipmentSection = document.createElement('section');
      equipmentSection.className = 'recipe-detail-section';
      const equipmentHeading = document.createElement('h2');
      equipmentHeading.textContent = 'Equipment';
      const equipmentList = document.createElement('ul');
      equipmentList.className = 'recipe-relationship-list';
      for (const item of ['Chef knife', 'Blender', 'Small pan']) {
        const row = document.createElement('li');
        row.textContent = item;
        equipmentList.append(row);
      }
      equipmentSection.append(equipmentHeading, equipmentList);
      summary.append(equipmentSection);

      const photo = document.createElement('span');
      photo.className = 'recipe-instruction-photo is-left';
      photo.style.cssText = 'float:left;width:120px;height:80px;background:#d5d7d1;';
      step.append(photo);
    });
    const htmlDownloadPromise = page.waitForEvent('download');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download HTML' }).click();
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText(
      'HTML download started.',
    );
    const sharedFeedback = page.locator('.recipe-action-feedback-region');
    await expect(sharedFeedback).toBeVisible();
    await expect(sharedFeedback).toHaveClass(/export-action-feedback/);
    const sharedFeedbackBox = await sharedFeedback.boundingBox();
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(sharedFeedbackBox?.x).toBeGreaterThanOrEqual(0);
    expect((sharedFeedbackBox?.x ?? 0) + (sharedFeedbackBox?.width ?? 0)).toBeLessThanOrEqual(
      viewportWidth,
    );
    const htmlDownload = await htmlDownloadPromise;
    expect(htmlDownload.suggestedFilename()).toBe('Standalone output view - Recipe.html');
    const htmlPath = await htmlDownload.path();
    if (!htmlPath) throw new Error('Expected the HTML output download to have a file path.');
    expect(
      await page
        .locator('.recipe-output-feedback')
        .evaluate((element) => getComputedStyle(element).pointerEvents),
    ).toBe('none');
    await settingsButton.click();
    await expect(settingsPanel).toBeVisible();
    await expect(page.locator('.recipe-output-feedback')).toBeHidden();
    await page.keyboard.press('Escape');
    const html = await readFile(htmlPath, 'utf8');
    expect(html).toContain('<title>Standalone output view</title>');
    expect(html).toContain('class="recipe-reading-layout');
    expect(html).not.toContain('recipe-output-page');
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/i);
    expect(html).toContain('Fold ');
    expect(html).toContain('flour');
    expect(html).toContain(' into batter.');
    expect(html).toContain('350°F');
    expect(html).not.toContain('Private note sentinel');
    expect(html).not.toContain('Time Breakdown');
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
    const standalonePage = await page.context().newPage();
    try {
      await standalonePage.setContent(html);
      await standalonePage.setViewportSize({ width: 1280, height: 900 });
      const standaloneReader = standalonePage.locator('.recipe-reading-layout');
      await expect(standaloneReader).toBeVisible();
      await expect(standalonePage.locator('.recipe-instruction-list')).toContainText(
        'Fold flour into batter.',
      );
      expect(await standaloneReader.evaluate((element) => getComputedStyle(element).display)).toBe(
        'grid',
      );
      const layout = await standalonePage.evaluate(() => {
        const title = document.querySelector('.recipe-detail-heading');
        const details = document.querySelector('.recipe-output-metadata');
        const reader = document.querySelector('.recipe-reading-layout');
        const overview = document.querySelector('.recipe-public-overview');
        const photo = document.querySelector('.recipe-instruction-photo');
        const attribution = document.querySelector('.recipe-attribution');
        const unit = document.querySelector('.recipe-reader-unit-trigger');
        const unitLabel = unit?.querySelector('.recipe-reader-unit-label');
        const metadataRows = Array.from(details?.children ?? []);
        const metadataLabel = details?.querySelector('dt');
        const metadataValue = details?.querySelector('dd');
        const ingredientDetails = document.querySelector('.recipe-reader-specifics');
        return {
          titleX: title?.getBoundingClientRect().x,
          detailsX: details?.getBoundingClientRect().x,
          readerX: reader?.getBoundingClientRect().x,
          overviewX: overview?.getBoundingClientRect().x,
          overviewDisplay: overview ? getComputedStyle(overview).display : null,
          metadataDisplay: details ? getComputedStyle(details).display : null,
          metadataLabels: metadataRows.map((row) => row.querySelector('dt')?.textContent?.trim()),
          metadataLineCount: new Set(
            metadataRows.map((row) => Math.round(row.getBoundingClientRect().top)),
          ).size,
          metadataMarginTop: details ? getComputedStyle(details).marginTop : null,
          metadataAlignment: details ? getComputedStyle(details).alignItems : null,
          metadataRowAlignment:
            metadataRows[0] instanceof HTMLElement
              ? getComputedStyle(metadataRows[0]).alignItems
              : null,
          metadataLabelSize: metadataLabel ? getComputedStyle(metadataLabel).fontSize : null,
          metadataValueSize: metadataValue ? getComputedStyle(metadataValue).fontSize : null,
          ingredientDetailsDisplay: ingredientDetails
            ? getComputedStyle(ingredientDetails).display
            : null,
          ingredientDetailsMarginTop: ingredientDetails
            ? getComputedStyle(ingredientDetails).marginTop
            : null,
          attributionColumnGap: attribution ? getComputedStyle(attribution).columnGap : null,
          photoFloat: photo ? getComputedStyle(photo).float : null,
          unitCursor: unit ? getComputedStyle(unit).cursor : null,
          unitDecoration: unitLabel ? getComputedStyle(unitLabel).textDecorationLine : null,
        };
      });
      if (
        layout.titleX === undefined ||
        layout.detailsX === undefined ||
        layout.readerX === undefined ||
        layout.overviewX === undefined
      ) {
        throw new Error('Expected the standalone recipe heading and content to be measurable.');
      }
      expect(layout.detailsX).toBeCloseTo(layout.overviewX, 0);
      expect(layout.overviewDisplay).toBe('block');
      expect(layout.metadataDisplay).toBe('flex');
      expect(layout.metadataLabels).toContain('Prep');
      expect(layout.metadataLabels).toContain('Equipment');
      expect(layout.metadataLineCount).toBe(1);
      expect(layout.metadataMarginTop).toBe('8px');
      expect(layout.metadataAlignment).toBe('flex-start');
      expect(layout.metadataRowAlignment).toBe('baseline');
      expect(layout.metadataLabelSize).toBe('13px');
      expect(layout.metadataValueSize).toBe('14px');
      expect(layout.ingredientDetailsDisplay).toBe('block');
      expect(layout.ingredientDetailsMarginTop).toBe('2px');
      expect(layout.attributionColumnGap).toBe('6px');
      expect(layout.photoFloat).toBe('none');
      expect(layout.unitCursor).toBe('default');
      expect(layout.unitDecoration).toBe('none');
      await standalonePage.setViewportSize({ width: 390, height: 844 });
      expect(await standaloneReader.evaluate((element) => getComputedStyle(element).display)).toBe(
        'block',
      );
      expect(
        await standalonePage.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    } finally {
      await standalonePage.close();
    }

    const pngDownloadPromise = page.waitForEvent('download');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download PNG' }).click();
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText(
      'PNG download started.',
    );
    const pngDownload = await pngDownloadPromise;
    expect(pngDownload.suggestedFilename()).toBe('Standalone output view - Recipe.png');
    const pngPath = await pngDownload.path();
    if (!pngPath) throw new Error('Expected the PNG output download to have a file path.');
    const png = await sharp(await readFile(pngPath)).metadata();
    expect(png.format).toBe('png');
    expect(png.width).toBe(3300);
    expect(png.height).toBe(2550);

    const pdfDownloadPromise = page.waitForEvent('download');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download PDF' }).click();
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText(
      'PDF download started.',
    );
    const pdfDownload = await pdfDownloadPromise;
    expect(pdfDownload.suggestedFilename()).toBe('Standalone output view - Recipe.pdf');
    const pdfPath = await pdfDownload.path();
    if (!pdfPath) throw new Error('Expected the PDF output download to have a file path.');
    const pdfDocument = await getDocument({
      data: new Uint8Array(await readFile(pdfPath)),
    }).promise;
    try {
      expect(pdfDocument.numPages).toBe(1);
      const viewport = await pdfDocument
        .getPage(1)
        .then((outputPage) => outputPage.getViewport({ scale: 1 }));
      expect(viewport.width).toBe(792);
      expect(viewport.height).toBe(612);
    } finally {
      await pdfDocument.destroy();
    }
    await expect(page.locator('.recipe-output-feedback')).toBeHidden({ timeout: 6_000 });

    let styleProbeRequested = false;
    await page.route('**/recipe-output-style-probe.png', async (route) => {
      styleProbeRequested = true;
      await route.fulfill({ status: 404, body: '' });
    });
    const styleProbe = await page.addStyleTag({
      content:
        '.recipe-output-standalone-style-probe { background-image: url("/recipe-output-style-probe.png"); }',
    });
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Print', exact: true }).click();
    const preparedPrintFrame = page.locator('iframe[title="Recipe print document"]');
    await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText('Print request sent.');
    await expect(preparedPrintFrame).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open print dialog' })).toHaveCount(0);
    expect(styleProbeRequested).toBe(false);
    await styleProbe.evaluate((element) => element.parentNode?.removeChild(element));
    await page.unroute('**/recipe-output-style-probe.png');
    await expect(outputButton).toBeEnabled();
    await settingsButton.click();
    await expect(settingsPanel).toBeVisible();
    await page.keyboard.press('Escape');
    const expectedEmphasisColors = await page
      .locator(
        '.recipe-instruction-mention, .recipe-instruction-duration, .recipe-instruction-temperature',
      )
      .evaluateAll((tokens) => tokens.map((token) => getComputedStyle(token).color).join('|'));
    await expect(page.locator('html')).toHaveAttribute(
      'data-print-emphasis-colors',
      expectedEmphasisColors,
    );
    await expect(page.locator('html')).toHaveAttribute(
      'data-print-emphasis-weights',
      '700|700|700',
    );
    const groupHeadingOffsets = (
      (await page.locator('html').getAttribute('data-print-ingredient-group-heading-offsets')) ?? ''
    )
      .split(',')
      .map(Number);
    expect(groupHeadingOffsets.length).toBeGreaterThan(0);
    expect(groupHeadingOffsets.every((offset) => offset >= 0)).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-print-metadata-margin', '8px');
    await expect(page.locator('html')).toHaveAttribute('data-print-metadata-attribution-gap', '8');
    await expect(page.locator('html')).toHaveAttribute(
      'data-print-metadata-alignment',
      'flex-start',
    );
    await expect(page.locator('html')).toHaveAttribute(
      'data-print-metadata-row-alignment',
      'baseline',
    );
    await expect(page.locator('html')).toHaveAttribute('data-print-metadata-label-size', '10px');
    await expect(page.locator('html')).toHaveAttribute('data-print-metadata-value-size', '10px');
    await expect(page.locator('html')).toHaveAttribute(
      'data-print-ingredient-details-style',
      'block,2px',
    );
    await expect(page.locator('html')).toHaveAttribute('data-print-ingredient-name-weight', '500');
    await expect(page.locator('html')).toHaveAttribute(
      'data-print-group-heading-style',
      /Georgia.*italic.*12px/,
    );

    await settingsButton.click();
    await repeatIngredients.uncheck();
    await includePhotos.uncheck();
    await useEmphasisColors.uncheck();
    await page.keyboard.press('Escape');
    await page
      .locator('html')
      .evaluate((element) => element.removeAttribute('data-print-requested'));
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Print', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText('Print request sent.');
    const neutralEmphasisColors = (
      (await page.locator('html').getAttribute('data-print-emphasis-colors')) ?? ''
    ).split('|');
    expect(neutralEmphasisColors.length).toBe(3);
    expect(neutralEmphasisColors.every((color) => color === 'rgb(23, 25, 20)')).toBe(true);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('multi-page recipe output contains separated instruction photos and creates a PNG archive @e2e', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await page.addInitScript(() => {
      window.print = () => {
        const topDocument = window.top?.document;
        const photo = document.querySelector('.recipe-instruction-photo');
        const unit = document.querySelector('.recipe-reader-unit-trigger');
        const metadata = document.querySelector('.recipe-output-metadata');
        const metadataRows = Array.from(metadata?.children ?? []);
        const outputPages = Array.from(
          document.querySelectorAll<HTMLElement>('.recipe-output-page'),
        );
        const stepNumbers = Array.from(
          document.querySelectorAll<HTMLOListElement>(
            '.recipe-output-page ol.recipe-instruction-list',
          ),
        ).flatMap((list) => {
          const reset = Number.parseInt(list.style.counterReset.split(' ').at(-1) ?? '', 10);
          const firstStep = reset + 1;
          if (list.start !== firstStep) return [-1];
          return Array.from(list.children, (_, index) => firstStep + index);
        });
        const ingredientPageTexts = outputPages.map(
          (page) =>
            page
              .querySelector('.recipe-output-ingredient-column')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() ?? '',
        );
        const pageNumbers = outputPages.map(
          (page) => page.querySelector('.recipe-output-footer')?.textContent?.trim() ?? '',
        );
        const columnOverflow = outputPages.flatMap((page) =>
          Array.from(
            page.querySelectorAll<HTMLElement>('.recipe-output-column'),
            (column) => column.scrollHeight > column.clientHeight,
          ),
        );
        const recipeTextSizes = outputPages.flatMap((page) =>
          Array.from(page.querySelectorAll<HTMLElement>('.recipe-output-column *'))
            .filter((element) => Boolean(element.textContent?.trim()))
            .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
        );
        const minimumRecipeTextSize = Math.min(...recipeTextSizes);
        const photoStyle = photo ? getComputedStyle(photo) : null;
        topDocument?.documentElement.setAttribute(
          'data-print-page-count',
          String(document.querySelectorAll('.recipe-output-page').length),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-reader-layout',
          String(Boolean(document.querySelector('.recipe-reading-layout'))),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-photo-float',
          photo ? getComputedStyle(photo).float : 'none',
        );
        topDocument?.documentElement.setAttribute(
          'data-print-photo-margins',
          photoStyle ? `${photoStyle.marginTop},${photoStyle.marginBottom}` : '',
        );
        topDocument?.documentElement.setAttribute('data-print-step-numbers', stepNumbers.join(','));
        topDocument?.documentElement.setAttribute(
          'data-print-ingredient-page-texts',
          JSON.stringify(ingredientPageTexts),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-page-numbers',
          JSON.stringify(pageNumbers),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-column-overflow',
          JSON.stringify(columnOverflow),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-minimum-recipe-text-size',
          String(minimumRecipeTextSize),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-metadata-labels',
          Array.from(metadata?.querySelectorAll('dt') ?? [])
            .map((term) => term.textContent?.trim())
            .join(','),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-metadata-line-count',
          String(
            new Set(metadataRows.map((row) => Math.round(row.getBoundingClientRect().top))).size,
          ),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-unit-cursor',
          unit ? getComputedStyle(unit).cursor : 'default',
        );
        topDocument?.documentElement.setAttribute('data-print-requested', 'true');
        window.dispatchEvent(new Event('afterprint'));
      };
    });
    const recipe = await createRecipe(
      request,
      config,
      user,
      'Paginated output view',
      undefined,
      true,
    );
    const publicId = await getPublicId(request, config, recipe.id);
    await page.goto(`/r/${publicId}`);
    await expect(
      page.getByRole('heading', { name: 'Paginated output view - serves 4' }),
    ).toBeVisible();
    await page.evaluate(() => {
      const list = document.querySelector<HTMLOListElement>(
        'main.recipes-main .recipe-instruction-list',
      );
      const firstStep = list?.firstElementChild;
      if (!(list instanceof HTMLOListElement) || !(firstStep instanceof HTMLLIElement)) {
        throw new Error('Expected the recipe instruction list to be available.');
      }

      const photo = document.createElement('span');
      photo.className = 'recipe-instruction-photo is-left';
      photo.style.cssText = 'float:left;width:120px;height:280px;background:#d5d7d1;';
      const paragraph = firstStep.querySelector('p');
      (paragraph ?? firstStep).append(photo);
      const summary = document.querySelector<HTMLElement>('.recipe-public-summary');
      if (!summary) throw new Error('Expected the public timing summary to be available.');
      const equipmentSection = document.createElement('section');
      equipmentSection.className = 'recipe-detail-section';
      const equipmentHeading = document.createElement('h2');
      equipmentHeading.textContent = 'Equipment';
      const equipmentList = document.createElement('ul');
      equipmentList.className = 'recipe-relationship-list';
      for (const item of ['Chef knife', 'Blender', 'Small pan']) {
        const row = document.createElement('li');
        row.textContent = item;
        equipmentList.append(row);
      }
      equipmentSection.append(equipmentHeading, equipmentList);
      summary.append(equipmentSection);

      for (let index = 2; index <= 16; index += 1) {
        const step = document.createElement('li');
        step.textContent = `Additional instruction ${index}: stir gently while scraping the bottom and sides of the pan, then check the texture before serving.`;
        list.append(step);
      }
    });

    const outputButton = page.getByRole('button', { name: 'Print & Download' });
    const htmlDownloadPromise = page.waitForEvent('download');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download HTML' }).click();
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText(
      'HTML download started.',
    );
    const htmlDownload = await htmlDownloadPromise;
    const htmlPath = await htmlDownload.path();
    if (!htmlPath) throw new Error('Expected the paginated HTML output to have a file path.');
    const html = await readFile(htmlPath, 'utf8');
    expect(htmlDownload.suggestedFilename()).toBe('Paginated output view - Recipe.html');
    expect(html).toContain('class="recipe-reading-layout');
    expect(html).not.toContain('recipe-output-page');
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/i);
    const standalonePage = await page.context().newPage();
    try {
      await standalonePage.setContent(html);
      await expect(standalonePage.locator('.recipe-reading-layout')).toBeVisible();
      expect(
        await standalonePage.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    } finally {
      await standalonePage.close();
    }
    for (let index = 2; index <= 16; index += 1) {
      expect(html).toContain(`Additional instruction ${index}`);
    }

    const pngDownloadPromise = page.waitForEvent('download');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download PNG' }).click();
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText(
      'PNG download started.',
    );
    const pngDownload = await pngDownloadPromise;
    expect(pngDownload.suggestedFilename()).toBe('Paginated output view - Recipe Pages.zip');
    const pngPath = await pngDownload.path();
    if (!pngPath) throw new Error('Expected the PNG archive to have a file path.');
    const pngFiles = unzipSync(await readFile(pngPath));
    expect(Object.keys(pngFiles)).toEqual(['page-01.png', 'page-02.png']);
    const firstPng = pngFiles['page-01.png'];
    if (!firstPng) throw new Error('Expected the PNG archive to contain its first page.');
    const png = await sharp(Buffer.from(firstPng)).metadata();
    expect(png.format).toBe('png');
    expect(png.width).toBe(3300);
    expect(png.height).toBe(2550);

    const pdfDownloadPromise = page.waitForEvent('download');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download PDF' }).click();
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText(
      'PDF download started.',
    );
    const pdfDownload = await pdfDownloadPromise;
    expect(pdfDownload.suggestedFilename()).toBe('Paginated output view - Recipe.pdf');
    const pdfPath = await pdfDownload.path();
    if (!pdfPath) throw new Error('Expected the PDF output to have a file path.');
    const pdfDocument = await getDocument({
      data: new Uint8Array(await readFile(pdfPath)),
    }).promise;
    try {
      expect(pdfDocument.numPages).toBe(2);
      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
        const pdfPage = await pdfDocument.getPage(pageNumber);
        const viewport = pdfPage.getViewport({ scale: 1 });
        expect(viewport.width).toBe(792);
        expect(viewport.height).toBe(612);
        const operatorList = await pdfPage.getOperatorList();
        expect(operatorList.fnArray).toContain(OPS.paintImageXObject);
      }
    } finally {
      await pdfDocument.destroy();
    }

    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Print', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-print-page-count', '2');
    await expect(page.locator('html')).toHaveAttribute(
      'data-print-step-numbers',
      '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16',
    );
    const printedIngredientPages = JSON.parse(
      (await page.locator('html').getAttribute('data-print-ingredient-page-texts')) ?? '[]',
    ) as string[];
    expect(printedIngredientPages).toHaveLength(2);
    expect(
      printedIngredientPages.every((ingredients) =>
        ingredients.toLocaleLowerCase().includes('flour'),
      ),
    ).toBe(true);
    expect(
      JSON.parse((await page.locator('html').getAttribute('data-print-page-numbers')) ?? '[]'),
    ).toEqual(['Page 1 of 2', 'Page 2 of 2']);
    expect(
      JSON.parse((await page.locator('html').getAttribute('data-print-column-overflow')) ?? '[]'),
    ).toEqual([false, false, false, false]);
    expect(
      Number(await page.locator('html').getAttribute('data-print-minimum-recipe-text-size')),
    ).toBeGreaterThanOrEqual((96 * 3) / 25.4 - 0.01);
    await expect(page.locator('html')).toHaveAttribute('data-print-photo-margins', '12px,12px');
    await expect(page.locator('html')).toHaveAttribute(
      'data-print-metadata-labels',
      /Prep.*Cook.*Equipment/,
    );
    await expect(page.locator('html')).toHaveAttribute('data-print-metadata-line-count', '1');
    await expect(page.locator('html')).toHaveAttribute('data-print-reader-layout', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-print-photo-float', 'none');
    await expect(page.locator('html')).toHaveAttribute('data-print-unit-cursor', 'default');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('print continues an oversized ingredient column while standalone formats fail clearly @e2e', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await page.addInitScript(() => {
      window.print = () => {
        const topDocument = window.top?.document;
        const pages = Array.from(document.querySelectorAll<HTMLElement>('.recipe-output-page'));
        const ingredientItems = pages.flatMap((outputPage) =>
          Array.from(
            outputPage.querySelectorAll<HTMLElement>('[data-output-test-ingredient="true"]'),
            (item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          ),
        );
        const instructionTexts = pages.flatMap((outputPage) =>
          Array.from(
            outputPage.querySelectorAll('.recipe-output-instruction-column li'),
            (item) => item.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          ),
        );
        const pageNumbers = pages.map(
          (outputPage) =>
            outputPage.querySelector('.recipe-output-footer')?.textContent?.trim() ?? '',
        );
        const columnsFit = pages.flatMap((outputPage) =>
          Array.from(
            outputPage.querySelectorAll<HTMLElement>('.recipe-output-column'),
            (column) => column.scrollHeight <= column.clientHeight,
          ),
        );
        const textSizes = pages.flatMap((outputPage) =>
          Array.from(outputPage.querySelectorAll<HTMLElement>('.recipe-output-column *'))
            .filter((element) => Boolean(element.textContent?.trim()))
            .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
        );
        topDocument?.documentElement.setAttribute('data-print-page-count', String(pages.length));
        topDocument?.documentElement.setAttribute(
          'data-print-overflow-ingredients',
          JSON.stringify(ingredientItems),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-overflow-instructions',
          JSON.stringify(instructionTexts),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-overflow-page-numbers',
          JSON.stringify(pageNumbers),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-overflow-columns-fit',
          JSON.stringify(columnsFit),
        );
        topDocument?.documentElement.setAttribute(
          'data-print-overflow-minimum-text-size',
          String(Math.min(...textSizes)),
        );
        topDocument?.documentElement.setAttribute('data-print-requested', 'true');
        window.dispatchEvent(new Event('afterprint'));
      };
    });

    const recipe = await createRecipe(
      request,
      config,
      user,
      'Overflowing ingredient column',
      undefined,
      true,
    );
    const publicId = await getPublicId(request, config, recipe.id);
    await page.goto(`/r/${publicId}`);
    await expect(
      page.getByRole('heading', { name: 'Overflowing ingredient column - serves 4' }),
    ).toBeVisible();
    await page.evaluate(() => {
      const ingredients = document.querySelector<HTMLElement>(
        'main.recipes-main [aria-labelledby="ingredients-title"]',
      );
      const list = ingredients?.querySelector<HTMLOListElement>('ol.recipe-ingredient-list');
      const tableBody = ingredients?.querySelector<HTMLTableSectionElement>(
        '.recipe-ingredient-first-table tbody',
      );
      if (!ingredients || (!list && !tableBody)) {
        throw new Error('Expected the recipe ingredient list to be available.');
      }

      for (let index = 1; index <= 70; index += 1) {
        const label = `Overflow ingredient ${String(index).padStart(2, '0')} with a long preparation note that wraps at the minimum readable text size`;
        if (list) {
          const item = document.createElement('li');
          item.dataset.outputTestIngredient = 'true';
          item.textContent = label;
          list.append(item);
        } else if (tableBody) {
          const row = document.createElement('tr');
          row.dataset.outputTestIngredient = 'true';
          const name = document.createElement('th');
          name.scope = 'row';
          name.textContent = label;
          row.append(
            name,
            document.createElement('td'),
            document.createElement('td'),
            document.createElement('td'),
          );
          tableBody.append(row);
        }
      }

      const instructionList = document.querySelector<HTMLOListElement>(
        'main.recipes-main .recipe-instruction-list',
      );
      if (!instructionList)
        throw new Error('Expected the recipe instruction list to be available.');
      for (let index = 2; index <= 5; index += 1) {
        const step = document.createElement('li');
        step.textContent = `Overflow test instruction ${index}`;
        instructionList.append(step);
      }
    });

    const outputButton = page.getByRole('button', { name: 'Print & Download' });
    const errorFeedback = page.locator('.recipe-output-feedback-error');
    for (const format of ['Download HTML', 'Download PNG', 'Download PDF']) {
      await outputButton.click();
      await page.getByRole('menuitem', { name: format }).click();
      await expect(errorFeedback).toContainText(
        'The complete ingredients column cannot fit at the minimum 3 mm text size.',
      );
    }

    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Print', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');
    await expect(page.locator('html')).toHaveText(/Print request sent\./);
    const printedIngredients = JSON.parse(
      (await page.locator('html').getAttribute('data-print-overflow-ingredients')) ?? '[]',
    ) as string[];
    expect(printedIngredients).toHaveLength(70);
    expect(printedIngredients[0]).toContain('Overflow ingredient 01');
    expect(printedIngredients.at(-1)).toContain('Overflow ingredient 70');
    expect(new Set(printedIngredients).size).toBe(70);

    const printedInstructions = JSON.parse(
      (await page.locator('html').getAttribute('data-print-overflow-instructions')) ?? '[]',
    ) as string[];
    expect(printedInstructions[0]).toContain('Fold flour into batter.');
    expect(printedInstructions.slice(-4)).toEqual([
      'Overflow test instruction 2',
      'Overflow test instruction 3',
      'Overflow test instruction 4',
      'Overflow test instruction 5',
    ]);

    const printedPageNumbers = JSON.parse(
      (await page.locator('html').getAttribute('data-print-overflow-page-numbers')) ?? '[]',
    ) as string[];
    expect(printedPageNumbers.length).toBeGreaterThan(1);
    expect(printedPageNumbers).toEqual(
      printedPageNumbers.map((_, index) => `Page ${index + 1} of ${printedPageNumbers.length}`),
    );
    expect(
      JSON.parse(
        (await page.locator('html').getAttribute('data-print-overflow-columns-fit')) ?? '[]',
      ),
    ).toEqual(Array(printedPageNumbers.length * 2).fill(true));
    expect(
      Number(await page.locator('html').getAttribute('data-print-overflow-minimum-text-size')),
    ).toBeGreaterThanOrEqual((96 * 3) / 25.4 - 0.01);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('standalone output reports unavailable photos, supports retry, and aborts image fetches @e2e', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  let downloadCount = 0;

  try {
    page.on('download', () => {
      downloadCount += 1;
    });
    const recipe = await createRecipe(
      request,
      config,
      user,
      'Output image failure',
      undefined,
      true,
    );
    const publicId = await getPublicId(request, config, recipe.id);
    await page.goto(`/r/${publicId}`);
    await expect(
      page.getByRole('heading', { name: 'Output image failure - serves 4' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Page settings' }).click();
    await page.getByRole('checkbox', { name: 'Include instruction photos' }).check();
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const state = window as Window & {
        __outputFetchAborted?: boolean;
        __outputFetchStarted?: boolean;
      };
      state.__outputFetchAborted = false;
      state.__outputFetchStarted = false;
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes('output-failure-image.png')) {
          return Promise.resolve(new Response('missing image', { status: 404 }));
        }
        if (url.includes('output-cancel-image.png')) {
          state.__outputFetchStarted = true;
          return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) return;
            const abort = () => {
              state.__outputFetchAborted = true;
              reject(new DOMException('Canceled.', 'AbortError'));
            };
            if (signal.aborted) abort();
            else signal.addEventListener('abort', abort, { once: true });
          });
        }
        return nativeFetch(input, init);
      };
    });
    await page.evaluate(() => {
      const firstStep = document.querySelector<HTMLElement>(
        'main.recipes-main .recipe-instruction-list > li',
      );
      if (!firstStep) throw new Error('Expected the first instruction to be available.');
      const state = window as Window & {
        __outputFetchAborted?: boolean;
        __outputFetchStarted?: boolean;
      };
      state.__outputFetchAborted = false;
      state.__outputFetchStarted = false;
      const image = document.createElement('img');
      image.className = 'recipe-instruction-photo';
      image.dataset.outputTestImage = 'true';
      image.src = new URL('/output-failure-image.png', window.location.origin).href;
      firstStep.append(image);
    });

    const outputButton = page.getByRole('button', { name: 'Print & Download' });
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download PDF' }).click();
    await expect(page.locator('.recipe-output-feedback-error')).toContainText(
      'An instruction photo could not be loaded. Check the connection and retry.',
    );

    await page.locator('[data-output-test-image="true"]').evaluate((image) => image.remove());
    const retryDownload = page.waitForEvent('download');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download PDF' }).click();
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText(
      'PDF download started.',
    );
    await retryDownload;

    await page.evaluate(() => {
      const firstStep = document.querySelector<HTMLElement>(
        'main.recipes-main .recipe-instruction-list > li',
      );
      if (!firstStep) throw new Error('Expected the first instruction to be available.');
      const image = document.createElement('img');
      image.className = 'recipe-instruction-photo';
      image.dataset.outputTestImage = 'true';
      image.src = new URL('/output-cancel-image.png', window.location.origin).href;
      firstStep.append(image);
    });
    const downloadCountBeforeCancel = downloadCount;
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download PDF' }).click();
    await page.waitForFunction(() => {
      const state = window as Window & { __outputFetchStarted?: boolean };
      return state.__outputFetchStarted;
    });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.recipe-output-feedback-cancelled')).toHaveText(
      'Output generation canceled.',
    );
    await page.waitForFunction(() => {
      const state = window as Window & { __outputFetchAborted?: boolean };
      return state.__outputFetchAborted;
    });
    expect(downloadCount).toBe(downloadCountBeforeCancel);

    await page.evaluate(() => {
      const state = window as Window & {
        __outputFetchAborted?: boolean;
        __outputFetchStarted?: boolean;
      };
      state.__outputFetchAborted = false;
      state.__outputFetchStarted = false;
      window.addEventListener(
        'pagehide',
        () =>
          window.sessionStorage.setItem(
            'recipe-output-aborted-on-navigation',
            String(state.__outputFetchAborted),
          ),
        { once: true },
      );
    });
    const downloadCountBeforeNavigation = downloadCount;
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download PDF' }).click();
    await page.waitForFunction(() => {
      const state = window as Window & { __outputFetchStarted?: boolean };
      return state.__outputFetchStarted;
    });
    await page.goto('/');
    expect(
      await page.evaluate(() =>
        window.sessionStorage.getItem('recipe-output-aborted-on-navigation'),
      ),
    ).toBe('true');
    expect(downloadCount).toBe(downloadCountBeforeNavigation);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('a guest can scale, switch units, and print the public recipe @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const carrotRowId = randomUUID();
  let publicId: string | null = null;

  try {
    const recipe = await createRecipe(
      request,
      config,
      user,
      'Public cooking view',
      undefined,
      true,
      [
        {
          recipe_ingredient_id: carrotRowId,
          ingredient_id: null,
          ingredient_name: 'Carrot',
          is_main: false,
          detail: '',
          preparation: 'cubed',
          portion_one_ratio: 0.25,
          size_value: 1.25,
          size_unit: 'in',
          measurements: [
            {
              measurement_type: 'count',
              amount_min: 4,
              amount_max: null,
              unit_code: null,
              picklist_value_id: null,
            },
          ],
        },
      ],
      ' Bake at F!350 for =45m=.',
      ' Bake at 350°F for 45m.',
    );
    publicId = await getPublicId(request, config, recipe.id);
    const carrotUpdate = await request.patch(
      `${config.apiUrl}/rest/v1/recipe_ingredients?id=eq.${carrotRowId}`,
      {
        headers: serviceHeaders(config),
        data: { portion_one_ratio: 0.25, size_value: 1.25, size_unit: 'in' },
      },
    );
    expect(carrotUpdate.ok(), await carrotUpdate.text()).toBeTruthy();

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.goto(`/recipes/${recipe.id}`);
    await expect(page.getByRole('heading', { name: 'Public cooking view' })).toBeVisible();
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(`/recipes/${recipe.id}/edit`);
    await page.getByRole('button', { name: 'Manage recipe photos' }).click();
    const photoDialog = page.getByRole('dialog', { name: 'Manage recipe photos' });
    const photoPattern = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="900"><rect width="2400" height="900" fill="#68a07f"/><rect width="300" height="900" fill="#df321d"/><rect x="2100" width="300" height="900" fill="#2668dc"/></svg>',
    );
    const photoBuffer = await sharp(photoPattern).png().toBuffer();
    await photoDialog.getByLabel('Upload from device').setInputFiles({
      name: 'public-recipe-photo.png',
      mimeType: 'image/png',
      buffer: photoBuffer,
    });
    await expect(photoDialog.locator('.recipe-photo-grid-item')).toHaveCount(1);
    await photoDialog.getByRole('button', { name: 'Adjust framing for photo 1' }).click();
    await page.getByRole('combobox', { name: 'Aspect ratio' }).click();
    await page.getByRole('option', { name: '4:3' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(photoDialog.locator('.media-manager-status:visible')).toHaveText(
      'Photo framing saved.',
    );
    const framedPhotoResponse = await request.get(
      `${config.apiUrl}/rest/v1/media_assets?select=crop,width,height&recipe_id=eq.${recipe.id}&status=eq.ready`,
      { headers: ownerHeaders(config, user) },
    );
    expect(framedPhotoResponse.ok(), await framedPhotoResponse.text()).toBeTruthy();
    const [framedPhoto] = (await framedPhotoResponse.json()) as {
      crop: { left: number; top: number; width: number; height: number } | null;
      width: number;
      height: number;
    }[];
    const savedCrop = framedPhoto.crop;
    expect(savedCrop).not.toBeNull();
    if (!savedCrop) throw new Error('Expected saved public recipe framing.');
    const savedCropAspectRatio =
      (savedCrop.width * framedPhoto.width) / (savedCrop.height * framedPhoto.height);
    expect(savedCrop.left).toBeGreaterThan(300 / 2400);
    expect(savedCrop.left + savedCrop.width).toBeLessThan(2100 / 2400);
    await photoDialog.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('link', { name: 'Back to view' }).click();
    await expect(page).toHaveURL(`/recipes/${recipe.id}`);
    const cachedGalleryImage = page.locator('.recipe-photo-feature-image');
    await expect(cachedGalleryImage).toBeVisible();
    expect(await cachedGalleryImage.getAttribute('viewBox')).toBe(
      `${savedCrop.left * framedPhoto.width} ${savedCrop.top * framedPhoto.height} ${savedCrop.width * framedPhoto.width} ${savedCrop.height * framedPhoto.height}`,
    );
    const galleryBounds = await cachedGalleryImage.boundingBox();
    expect(galleryBounds).not.toBeNull();
    if (!galleryBounds) throw new Error('Expected the cropped gallery image to have bounds.');
    expect(galleryBounds.width / galleryBounds.height).toBeCloseTo(savedCropAspectRatio, 2);
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(`/recipes/${recipe.id}/edit`);
    const instruction = page.getByRole('textbox', { name: 'Instruction step 1' });
    await instruction.focus();
    await instruction.evaluate((element) => {
      if (!(element instanceof HTMLTextAreaElement)) {
        throw new Error('Expected the instruction editor to be a textarea.');
      }
      const position = element.value.indexOf(' into batter');
      if (position < 0) throw new Error('Expected the instruction to contain batter text.');
      element.setSelectionRange(position, position);
    });
    await instruction.press('Shift+Enter');
    await instruction.pressSequentially('+p');
    await page
      .getByRole('button', { name: /^Insert photo \d{2}$/u })
      .first()
      .click();
    await expect(instruction).toHaveValue(/\+photo\d{2}/u);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page).toHaveURL(`/recipes/${recipe.id}`);
    const savedStepsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_steps?select=content_markdown&recipe_id=eq.${recipe.id}`,
      { headers: ownerHeaders(config, user) },
    );
    expect(savedStepsResponse.ok(), await savedStepsResponse.text()).toBeTruthy();
    const savedSteps = (await savedStepsResponse.json()) as { content_markdown: string }[];
    expect(savedSteps.some((step) => step.content_markdown.includes('[[photo:'))).toBe(true);
    const privateGalleryImage = page.locator('.recipe-photo-feature-image');
    await expect(privateGalleryImage).toBeVisible();
    expect(await privateGalleryImage.getAttribute('viewBox')).toBe(
      `${savedCrop.left * framedPhoto.width} ${savedCrop.top * framedPhoto.height} ${savedCrop.width * framedPhoto.width} ${savedCrop.height * framedPhoto.height}`,
    );
    await expectRenderedCenterCrop(privateGalleryImage);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const [
      privateMainBounds,
      privateHeadingBounds,
      privateTitleBounds,
      privateActionsBounds,
      privateSummaryBounds,
      privateReaderBounds,
      privateDetailsBounds,
      privateGalleryBounds,
    ] = await Promise.all([
      page.locator('main.recipes-main').boundingBox(),
      page.locator('.recipe-detail-heading').boundingBox(),
      page.locator('.recipe-detail-title').boundingBox(),
      page.locator('.recipe-detail-heading-actions').boundingBox(),
      page.locator('.recipe-summary-layout').boundingBox(),
      page.locator('.recipe-reading-layout').boundingBox(),
      page
        .locator('.recipe-summary-layout-with-detail-heading > .recipe-detail-section')
        .boundingBox(),
      page
        .locator('.recipe-summary-layout-with-detail-heading > .recipe-photo-gallery')
        .boundingBox(),
    ]);
    if (
      !privateMainBounds ||
      !privateHeadingBounds ||
      !privateTitleBounds ||
      !privateActionsBounds ||
      !privateSummaryBounds ||
      !privateReaderBounds ||
      !privateDetailsBounds ||
      !privateGalleryBounds
    ) {
      throw new Error('Expected private recipe content sections to have layout boxes.');
    }
    for (const bounds of [privateSummaryBounds, privateReaderBounds]) {
      expect(bounds.x).toBeCloseTo(privateMainBounds.x, 1);
      expect(bounds.x + bounds.width).toBeCloseTo(privateMainBounds.x + privateMainBounds.width, 1);
    }
    expect(privateGalleryBounds.x).toBeCloseTo(privateMainBounds.x, 1);
    expect(privateActionsBounds.y).toBeCloseTo(privateTitleBounds.y, 0);
    expect(privateActionsBounds.x).toBeGreaterThanOrEqual(
      privateTitleBounds.x + privateTitleBounds.width,
    );
    expect(privateHeadingBounds.x).toBeCloseTo(privateDetailsBounds.x, 1);
    expect(privateHeadingBounds.x + privateHeadingBounds.width).toBeCloseTo(
      privateDetailsBounds.x + privateDetailsBounds.width,
      1,
    );
    expect(
      Math.abs(privateDetailsBounds.y - (privateHeadingBounds.y + privateHeadingBounds.height) - 8),
    ).toBeLessThanOrEqual(1);
    expect(privateGalleryBounds.x + privateGalleryBounds.width + 32).toBeLessThanOrEqual(
      privateHeadingBounds.x + 1,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    const [mobileHeadingBounds, mobileGalleryBounds, mobileDetailsBounds] = await Promise.all([
      page.locator('.recipe-detail-heading').boundingBox(),
      page
        .locator('.recipe-summary-layout-with-detail-heading > .recipe-photo-gallery')
        .boundingBox(),
      page
        .locator('.recipe-summary-layout-with-detail-heading > .recipe-detail-section')
        .boundingBox(),
    ]);
    if (!mobileHeadingBounds || !mobileGalleryBounds || !mobileDetailsBounds) {
      throw new Error('Expected the mobile recipe summary to have layout boxes.');
    }
    expect(mobileGalleryBounds.y).toBeGreaterThan(mobileHeadingBounds.y);
    expect(mobileDetailsBounds.y).toBeGreaterThan(mobileGalleryBounds.y);
    expect(
      Math.abs(mobileGalleryBounds.y - (mobileHeadingBounds.y + mobileHeadingBounds.height) - 16),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(mobileDetailsBounds.y - (mobileGalleryBounds.y + mobileGalleryBounds.height) - 16),
    ).toBeLessThanOrEqual(1);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const privateDefaultPdf = await inspectPrintedRecipePdf(
      await page.pdf({ preferCSSPageSize: true }),
    );
    expect(privateDefaultPdf.width).toBeGreaterThan(privateDefaultPdf.height);
    expect(privateDefaultPdf.imageOperations).toBe(1);
    for (const { x, width, text } of privateDefaultPdf.textBounds.filter(
      ({ text }) => text.trim().length > 0,
    )) {
      expect(
        x,
        `Printed text "${text}" should stay inside the left page margin.`,
      ).toBeGreaterThanOrEqual(17);
      expect(
        x + width,
        `Printed text "${text}" should stay inside the right page margin.`,
      ).toBeLessThanOrEqual(privateDefaultPdf.width - 17);
    }
    const printedPageNumber = privateDefaultPdf.textBounds.find(({ text }) =>
      /^Page \d+ of \d+$/u.test(text),
    );
    if (!printedPageNumber) throw new Error('Expected the printed page number to be visible.');
    expect(printedPageNumber.x + printedPageNumber.width).toBeLessThanOrEqual(
      privateDefaultPdf.width - 17,
    );
    const printedTitle = privateDefaultPdf.textBounds.find(({ text }) =>
      text.includes('Public cooking view'),
    );
    expect(printedTitle?.x).toBeCloseTo(18, 0);
    const printedMetadata = privateDefaultPdf.textBounds.find(({ text }) => text === 'State');
    expect(printedMetadata?.x).toBeCloseTo(18, 0);
    const printedIngredients = privateDefaultPdf.textBounds.find(
      ({ text }) => text === 'Ingredients',
    );
    expect(printedIngredients?.x).toBeCloseTo(18, 0);

    await page.goto('/settings');
    await page
      .getByRole('checkbox', {
        name: 'Omit instruction photos in print and downloads',
      })
      .check();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await page.goto(`/recipes/${recipe.id}`);
    const privateInstructionPhoto = page.locator('.recipe-instruction-photo');
    await expect(privateGalleryImage).toBeVisible();
    await expect(privateInstructionPhoto).toBeVisible();
    const privateNoPhotosPdf = await inspectPrintedRecipePdf(
      await page.pdf({ preferCSSPageSize: true }),
    );
    expect(privateNoPhotosPdf.width).toBeGreaterThan(privateNoPhotosPdf.height);
    expect(privateNoPhotosPdf.imageOperations).toBe(0);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.recipe-photo-gallery')).toBeHidden();
    await expect(privateInstructionPhoto).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    await expect(privateGalleryImage).toBeVisible();
    await expect(privateInstructionPhoto).toBeVisible();

    await page.goto(`/recipes/${recipe.id}/edit`);
    await page.getByRole('button', { name: 'Manage recipe photos' }).click();
    const publicPhotoDialog = page.getByRole('dialog', { name: 'Manage recipe photos' });
    await publicPhotoDialog.getByLabel('Upload from device').setInputFiles({
      name: 'public-recipe-photo-2.png',
      mimeType: 'image/png',
      buffer: photoBuffer,
    });
    await expect(publicPhotoDialog.locator('.recipe-photo-grid-item')).toHaveCount(2);
    await publicPhotoDialog.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('link', { name: 'Back to view' }).click();
    await expect(page).toHaveURL(`/recipes/${recipe.id}`);

    await page.goto(`/r/${publicId}`);
    const outputButton = page.getByRole('button', { name: 'Print & Download' });
    await expect(
      page.getByRole('heading', { name: 'Public cooking view - serves 4' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Public cooking view | Recipe Box');
    await expect(page.locator('.recipe-public-serves-inline')).toHaveCSS('font-size', '16px');
    await expect(page.locator('.recipe-public-serves-inline')).toHaveCSS('font-weight', '400');
    await expect(page.locator('.recipe-instruction-temperature')).toHaveText('350°F');
    await expect(page.getByText('Fold flour into batter.')).toBeVisible();
    const instructionPhoto = page.locator('.recipe-instruction-photo .framed-media-image');
    await expect(instructionPhoto).toBeVisible();
    await expect(instructionPhoto).toHaveAttribute('aria-hidden', 'true');
    const instructionPhotoBounds = await instructionPhoto.boundingBox();
    expect(instructionPhotoBounds).not.toBeNull();
    if (!instructionPhotoBounds) {
      throw new Error('Expected the cropped instruction photo to have bounds.');
    }
    expect(instructionPhotoBounds.width / instructionPhotoBounds.height).toBeCloseTo(
      savedCropAspectRatio,
      2,
    );
    await expectRenderedCenterCrop(instructionPhoto);
    const publicPhotoViewBox = await instructionPhoto.getAttribute('viewBox');
    expect(publicPhotoViewBox).toBe(
      `${savedCrop.left * framedPhoto.width} ${savedCrop.top * framedPhoto.height} ${savedCrop.width * framedPhoto.width} ${savedCrop.height * framedPhoto.height}`,
    );
    const publicHtmlDownloadPromise = page.waitForEvent('download');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download HTML' }).click();
    const publicHtmlDownload = await publicHtmlDownloadPromise;
    const publicHtmlPath = await publicHtmlDownload.path();
    if (!publicHtmlPath) throw new Error('Expected the public HTML download to have a file path.');
    const publicHtml = await readFile(publicHtmlPath, 'utf8');
    expect(publicHtml).toMatch(/<image[^>]+href="data:image\/[^;]+;base64,/u);
    expect(publicHtml).not.toContain('storage/v1/object/sign');
    expect(publicHtml).not.toContain('Private note sentinel');

    const publicPngDownloadPromise = page.waitForEvent('download');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download PNG' }).click();
    const publicPngDownload = await publicPngDownloadPromise;
    const publicPngPath = await publicPngDownload.path();
    if (!publicPngPath) throw new Error('Expected the public PNG download to have a file path.');
    const publicPng = await sharp(await readFile(publicPngPath)).metadata();
    expect(publicPng.format).toBe('png');
    expect(publicPng.width).toBe(3300);
    expect(publicPng.height).toBe(2550);

    const instructionViewer = page.locator('.image-viewer-dialog').nth(1);
    await instructionPhoto.click();
    await expect(instructionViewer).toHaveJSProperty('open', true);
    await expect(instructionViewer.locator('.image-viewer-full-image')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(instructionViewer).toHaveJSProperty('open', false);
    const embeddedPhotoBounds = await page.locator('.recipe-instruction-photo').boundingBox();
    const instructionBlockBounds = await page
      .locator('.recipe-instruction-with-photo')
      .boundingBox();
    const leadingInstructionBounds = await page
      .locator('.recipe-instruction-with-photo')
      .evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          const text = textNode.textContent ?? '';
          const start = text.indexOf('Fold');
          if (start >= 0) {
            const range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, start + 'Fold'.length);
            const bounds = range.getBoundingClientRect();
            return { y: bounds.y, right: bounds.right };
          }
          textNode = walker.nextNode();
        }
        throw new Error('Expected leading public instruction text.');
      });
    const followingInstructionBounds = await page
      .locator('.recipe-instruction-with-photo')
      .evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
          const text = textNode.textContent ?? '';
          const start = text.indexOf('into batter.');
          if (start >= 0) {
            const range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, start + 'into batter.'.length);
            const bounds = range.getBoundingClientRect();
            return { y: bounds.y, right: bounds.right };
          }
          textNode = walker.nextNode();
        }
        throw new Error('Expected trailing public instruction text.');
      });
    if (!embeddedPhotoBounds || !instructionBlockBounds) {
      throw new Error('Expected the public instruction image and block to have layout boxes.');
    }
    const viewportWidth = page.viewportSize()?.width ?? 0;
    expect(embeddedPhotoBounds.width).toBeLessThanOrEqual(
      Math.min(200, instructionBlockBounds.width * (viewportWidth <= 640 ? 1 : 0.55)) + 1,
    );
    const photoMarginBottom = await page
      .locator('.recipe-instruction-photo')
      .evaluate((element) => Number.parseFloat(getComputedStyle(element).marginBottom));
    expect(photoMarginBottom).toBeGreaterThanOrEqual(96 / 25.4);
    if (viewportWidth <= 640) {
      expect(leadingInstructionBounds.y).toBeLessThan(embeddedPhotoBounds.y);
      expect(followingInstructionBounds.y).toBeGreaterThanOrEqual(
        embeddedPhotoBounds.y + embeddedPhotoBounds.height - 1,
      );
    } else {
      expect(leadingInstructionBounds.y).toBeLessThan(embeddedPhotoBounds.y);
      expect(leadingInstructionBounds.right).toBeLessThanOrEqual(embeddedPhotoBounds.x);
      expect(followingInstructionBounds.right).toBeLessThanOrEqual(embeddedPhotoBounds.x);
    }
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.locator('.recipe-public-main')).toHaveCSS('padding-left', '24px');
    await expect(page.locator('.recipe-public-main')).toHaveCSS('padding-right', '24px');
    const settingsButton = page.getByRole('button', { name: 'Page settings' });
    await settingsButton.click();
    const noEmphasisToggle = page.getByRole('checkbox', { name: 'Use emphasis colors' });
    const noPhotosToggle = page.getByRole('checkbox', { name: 'Include instruction photos' });
    await expect(noEmphasisToggle).toBeChecked();
    await expect(noPhotosToggle).toBeChecked();
    await expect(instructionPhoto).toBeVisible();
    await page.keyboard.press('Escape');
    await page.emulateMedia({ media: 'print' });
    const publicDefaultPdf = await inspectPrintedRecipePdf(
      await page.pdf({ preferCSSPageSize: true }),
    );
    expect(publicDefaultPdf.width).toBeGreaterThan(publicDefaultPdf.height);
    expect(publicDefaultPdf.imageOperations).toBe(1);
    expect(publicDefaultPdf.text).toContain('Public cooking view');
    expect(publicDefaultPdf.text).not.toContain('No instruction photos');
    await page.emulateMedia({ media: 'screen' });
    await settingsButton.click();
    await page.keyboard.press('Tab');
    await expect(noPhotosToggle).toBeFocused();
    expect(await noPhotosToggle.evaluate((element) => element.matches(':focus-visible'))).toBe(
      true,
    );
    await page.keyboard.press('Space');
    await expect(noPhotosToggle).not.toBeChecked();
    await expect(instructionPhoto).toBeHidden();
    await page.reload();
    await settingsButton.click();
    await expect(page.getByRole('checkbox', { name: 'Include instruction photos' })).toBeChecked();
    await expect(instructionPhoto).toBeVisible();
    await page.keyboard.press('Escape');
    const [titleRowBox, titleBox, actionsBox, printBox, toggleBox] = await Promise.all([
      page.locator('.recipe-detail-title-row').boundingBox(),
      page.getByRole('heading', { name: 'Public cooking view - serves 4' }).boundingBox(),
      page.locator('.recipe-public-title-actions').boundingBox(),
      outputButton.boundingBox(),
      settingsButton.boundingBox(),
    ]);
    if (
      !titleRowBox ||
      !titleBox ||
      !printBox ||
      !toggleBox ||
      ((page.viewportSize()?.width ?? 0) > 640 && !actionsBox)
    ) {
      throw new Error('Expected the public title and actions to be visible.');
    }
    if (actionsBox) {
      expect(actionsBox.x + actionsBox.width).toBeCloseTo(titleRowBox.x + titleRowBox.width, 1);
    }
    if ((page.viewportSize()?.width ?? 0) <= 640) {
      expect(toggleBox.x + toggleBox.width).toBeCloseTo(titleRowBox.x + titleRowBox.width, 1);
      expect(printBox.width).toBeGreaterThanOrEqual(48);
      expect(printBox.height).toBeGreaterThanOrEqual(48);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
    } else {
      if (!actionsBox) {
        throw new Error('Expected the desktop public title actions to have bounds.');
      }
      expect(printBox.x + printBox.width).toBeLessThanOrEqual(toggleBox.x);
      expect(toggleBox.x + toggleBox.width).toBeCloseTo(titleRowBox.x + titleRowBox.width, 1);
      expect(Math.max(titleBox.y, actionsBox.y)).toBeLessThan(
        Math.min(titleBox.y + titleBox.height, actionsBox.y + actionsBox.height),
      );
    }
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    const [narrowTitleRowBox, narrowPrintBox, narrowToggleBox] = await Promise.all([
      page.locator('.recipe-detail-title-row').boundingBox(),
      outputButton.boundingBox(),
      settingsButton.boundingBox(),
    ]);
    if (!narrowTitleRowBox || !narrowPrintBox || !narrowToggleBox) {
      throw new Error('Expected the narrow public title and actions to be visible.');
    }
    expect(narrowToggleBox.x + narrowToggleBox.width).toBeCloseTo(
      narrowTitleRowBox.x + narrowTitleRowBox.width,
      1,
    );
    expect(narrowPrintBox.x + narrowPrintBox.width).toBeLessThanOrEqual(narrowToggleBox.x);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.setViewportSize({ width: 1600, height: 1000 });
    const [widePublicMain, widePublicReader] = await Promise.all([
      page.locator('.recipe-public-main').boundingBox(),
      page.locator('.recipe-reading-layout').boundingBox(),
    ]);
    if (!widePublicMain || !widePublicReader) {
      throw new Error('Expected the wide public recipe layout to have bounds.');
    }
    expect(widePublicMain.width).toBeCloseTo(1600, 0);
    expect(widePublicReader.width).toBeCloseTo(1360, 0);
    expect(widePublicReader.x).toBeCloseTo(120, 0);
    if (originalViewport) await page.setViewportSize(originalViewport);
    const emphasisTokens = [
      page.locator('.recipe-instruction-mention').first(),
      page.locator('.recipe-instruction-temperature').first(),
      page.locator('.recipe-instruction-duration').first(),
    ];
    await settingsButton.click();
    await expect(noEmphasisToggle).toBeChecked();
    for (const token of emphasisTokens) await expect(token).toBeVisible();
    const getEmphasisColors = () =>
      Promise.all(
        emphasisTokens.map((token) => token.evaluate((element) => getComputedStyle(element).color)),
      );
    const coloredTokenColors = await getEmphasisColors();
    expect(new Set(coloredTokenColors).size).toBe(3);
    const coloredTokenWeights = await Promise.all(
      emphasisTokens.map((token) =>
        token.evaluate((element) => getComputedStyle(element).fontWeight),
      ),
    );
    expect(coloredTokenWeights).toEqual(['700', '700', '700']);
    await noEmphasisToggle.uncheck();
    const neutralTokenStyles = await Promise.all(
      emphasisTokens.map((token) =>
        token.evaluate((element) => ({
          color: getComputedStyle(element).color,
          fontWeight: getComputedStyle(element).fontWeight,
          parentColor: element.parentElement ? getComputedStyle(element.parentElement).color : null,
          parentFontWeight: element.parentElement
            ? getComputedStyle(element.parentElement).fontWeight
            : null,
        })),
      ),
    );
    expect(
      neutralTokenStyles.every(
        ({ color, fontWeight, parentColor, parentFontWeight }) =>
          color === parentColor && fontWeight === parentFontWeight,
      ),
    ).toBe(true);
    await noEmphasisToggle.check();
    expect(await getEmphasisColors()).toEqual(coloredTokenColors);
    await noEmphasisToggle.uncheck();
    const summary = page.locator('.recipe-public-summary');
    await expect(summary).not.toContainText('serves 4');
    await expect(summary.getByRole('heading', { name: 'Time Breakdown' })).toBeVisible();
    await expect(summary.locator('.recipe-time-list')).toContainText('1 hr 5 min');
    await expect(summary.locator('.recipe-time-list')).toContainText('1 hr 10 min');
    const publicGallery = page.locator('.recipe-public-overview-split .recipe-photo-gallery');
    const publicPhoto = publicGallery.locator('.recipe-photo-feature-image');
    await expect(publicPhoto).toBeVisible();
    await expect(publicGallery.locator('.recipe-photo-feature-image')).toHaveCount(1);
    await expect(publicGallery.locator('.recipe-photo-thumbnail-button')).toHaveCount(2);
    const firstPhotoThumbnail = publicGallery.getByRole('button', { name: 'Show photo 1' });
    const secondPhotoThumbnail = publicGallery.getByRole('button', { name: 'Show photo 2' });
    await expect(firstPhotoThumbnail).toHaveAttribute('aria-pressed', 'true');
    const primaryPhotoId = await publicPhoto.getAttribute('data-photo-id');
    if (!primaryPhotoId) throw new Error('Expected the public primary photo to have an id.');
    await secondPhotoThumbnail.click();
    await expect(secondPhotoThumbnail).toHaveAttribute('aria-pressed', 'true');
    await expect(publicPhoto).not.toHaveAttribute('data-photo-id', primaryPhotoId);
    const [summaryBox, ingredientsBox, galleryBox, photoBox] = await Promise.all([
      summary.boundingBox(),
      page.getByRole('region', { name: 'Ingredients', exact: true }).boundingBox(),
      publicGallery.boundingBox(),
      publicPhoto.boundingBox(),
    ]);
    if (!summaryBox || !ingredientsBox || !galleryBox || !photoBox) {
      throw new Error('Expected the public photo, summary, and ingredients to be visible.');
    }
    expect(summaryBox.y + summaryBox.height).toBeLessThan(ingredientsBox.y);
    await expect(page.locator('.recipe-ingredient-list, .recipe-ingredient-table')).toContainText(
      '250 ml',
    );
    await expect(page.locator('.recipe-ingredient-list, .recipe-ingredient-table')).toContainText(
      'pinch',
    );
    await expect(page.locator('.recipe-ingredient-list, .recipe-ingredient-table')).toContainText(
      'salt',
    );
    await expect(page.locator('.recipe-ingredient-list, .recipe-ingredient-table')).toContainText(
      'cubed 1 ¼ in',
    );
    await expect(page.locator('.recipe-ingredient-list, .recipe-ingredient-table')).toContainText(
      '1 : 3',
    );
    expect(photoBox.width).toBeLessThanOrEqual(420);
    expect(photoBox.height).toBeLessThanOrEqual(281);
    if ((page.viewportSize()?.width ?? 0) > 760) {
      expect(galleryBox.x + galleryBox.width).toBeLessThan(summaryBox.x);
      expect(Math.abs(galleryBox.y - summaryBox.y)).toBeLessThanOrEqual(1);
    } else {
      expect(summaryBox.y).toBeGreaterThanOrEqual(galleryBox.y + galleryBox.height);
    }
    const publicGalleryViewer = page.locator('.image-viewer-dialog').first();
    await publicPhoto.click();
    await expect(publicGalleryViewer).toHaveJSProperty('open', true);
    const publicFullSizeImage = publicGalleryViewer.locator('.image-viewer-full-image');
    await expect(publicFullSizeImage).toBeVisible();
    const publicImageBounds = await publicFullSizeImage.boundingBox();
    expect(publicImageBounds).not.toBeNull();
    if (!publicImageBounds) {
      throw new Error('Expected the public full-size photo to be visible.');
    }
    expect(publicImageBounds.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? Infinity);
    expect(publicImageBounds.height).toBeLessThanOrEqual(page.viewportSize()?.height ?? Infinity);
    await publicGalleryViewer.getByRole('button', { name: 'Close image viewer' }).click();
    await expect(publicGalleryViewer).toHaveJSProperty('open', false);
    const galleryViewport = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    const [mobileGalleryBox, mobileSummaryBox] = await Promise.all([
      publicGallery.boundingBox(),
      summary.boundingBox(),
    ]);
    if (!mobileGalleryBox || !mobileSummaryBox) {
      throw new Error('Expected the mobile public gallery and summary to have bounds.');
    }
    expect(mobileSummaryBox.y).toBeGreaterThanOrEqual(mobileGalleryBox.y + mobileGalleryBox.height);
    if (galleryViewport) await page.setViewportSize(galleryViewport);

    await page.getByRole('button', { name: 'Scale recipe' }).focus();
    await page.keyboard.press('Enter');
    const scaleDialog = page.getByRole('dialog', { name: 'Scale recipe' });
    await scaleDialog.getByLabel('To').fill('8');
    await scaleDialog.getByRole('button', { name: 'Submit' }).click();
    const ingredientContent = page.locator('.recipe-ingredient-list, .recipe-ingredient-table');
    await expect(ingredientContent).toContainText('500 ml');

    await page.getByRole('combobox', { name: 'Change Flour volume unit' }).click();
    await page.getByRole('option', { name: 'TBSP' }).click();
    await expect(ingredientContent).toContainText('33.81 TBSP');

    await page.addInitScript(() => {
      window.print = () => {
        window.top?.document.documentElement.setAttribute('data-printed', 'true');
        window.dispatchEvent(new Event('afterprint'));
      };
    });
    await settingsButton.click();
    await noPhotosToggle.uncheck();
    await expect(instructionPhoto).toBeHidden();
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Print', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-printed', 'true');
    await page.emulateMedia({ media: 'print' });
    await expect(ingredientContent).toContainText('33.81 TBSP');
    await expect(summary.locator('.recipe-time-list')).toContainText('1 hr 5 min');
    await expect(summary.locator('.recipe-time-list')).toContainText('1 hr 10 min');
    await expect(outputButton).toBeHidden();
    await expect(settingsButton).toBeHidden();
    await expect(page.locator('.recipe-photo-gallery')).toBeHidden();
    await expect(instructionPhoto).toBeHidden();
    const printedTokenColors = await Promise.all(
      emphasisTokens.map((token) =>
        token.evaluate((element) => ({
          color: getComputedStyle(element).color,
          parentColor: element.parentElement ? getComputedStyle(element.parentElement).color : null,
        })),
      ),
    );
    expect(printedTokenColors.every(({ color, parentColor }) => color === parentColor)).toBe(true);
    await expect(ingredientContent).toContainText('cubed 1 ¼ in');
    await expect(ingredientContent).toContainText('2 : 6');
    const publicNoPhotosPdf = await inspectPrintedRecipePdf(
      await page.pdf({ preferCSSPageSize: true }),
    );
    expect(publicNoPhotosPdf.width).toBeGreaterThan(publicNoPhotosPdf.height);
    expect(publicNoPhotosPdf.imageOperations).toBe(0);
    expect(publicNoPhotosPdf.text).toContain('33.81 TBSP');
    expect(publicNoPhotosPdf.text).not.toContain('No instruction photos');

    await page.emulateMedia({ media: 'screen' });
    const longRecipeName =
      'A very long recipe title that wraps across multiple lines on a narrow screen';
    const renameResponse = await request.patch(
      `${config.apiUrl}/rest/v1/recipes?id=eq.${recipe.id}`,
      { headers: serviceHeaders(config), data: { name: longRecipeName } },
    );
    expect(renameResponse.ok(), await renameResponse.text()).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/r/${publicId}`);
    const longTitle = page.getByRole('heading', { name: longRecipeName });
    const [longTitleBox, longTitleRowBox, longTitlePrintBox, longTitleSettingsBox] =
      await Promise.all([
        longTitle.boundingBox(),
        page.locator('.recipe-detail-title-row').boundingBox(),
        page.getByRole('button', { name: 'Print & Download' }).boundingBox(),
        page.getByRole('button', { name: 'Page settings' }).boundingBox(),
      ]);
    if (!longTitleBox || !longTitleRowBox || !longTitlePrintBox || !longTitleSettingsBox) {
      throw new Error('Expected the long public title and actions to have layout bounds.');
    }
    expect(longTitlePrintBox.x + longTitlePrintBox.width).toBeLessThanOrEqual(
      longTitleSettingsBox.x,
    );
    expect(longTitleSettingsBox.x + longTitleSettingsBox.width).toBeCloseTo(
      longTitleRowBox.x + longTitleRowBox.width,
      1,
    );
    expect(longTitlePrintBox.width).toBeGreaterThanOrEqual(48);
    expect(longTitlePrintBox.height).toBeGreaterThanOrEqual(48);
    expect(longTitleSettingsBox.width).toBeGreaterThanOrEqual(48);
    expect(longTitleSettingsBox.height).toBeGreaterThanOrEqual(48);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  } finally {
    await deleteTestUser(request, user);
    if (publicId) {
      await request.delete(
        `${config.apiUrl}/rest/v1/purged_recipe_public_ids?public_id=eq.${publicId}`,
        { headers: serviceHeaders(config) },
      );
    }
  }
});

test('the public recipe page has no automated accessibility violations @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  let publicId: string | null = null;

  try {
    const recipe = await createRecipe(request, config, user);
    publicId = await getPublicId(request, config, recipe.id);
    await page.goto(`/r/${publicId}`);

    const accessibilityScan = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScan.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
    if (publicId) {
      await request.delete(
        `${config.apiUrl}/rest/v1/purged_recipe_public_ids?public_id=eq.${publicId}`,
        { headers: serviceHeaders(config) },
      );
    }
  }
});
