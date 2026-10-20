import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
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

async function createRecipe(
  request: import('@playwright/test').APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  name = 'Guest citrus cake',
  publicationId?: string,
  includeCookingData = false,
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
          ]
        : [],
      p_instruction_steps: ingredientRowId
        ? [
            {
              id: randomUUID(),
              position: 0,
              content_markdown: `Fold [[ingredient:${ingredientRowId}|flour]] into batter.`,
              plain_text: 'Fold flour into batter.',
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
    expect(publicResponse.headers()['cache-control']).toContain('no-store');
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
    expect(privateResponse.headers()['cache-control']).toContain('no-store');
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
    expect(trashedResponse.headers()['cache-control']).toContain('no-store');
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
    expect(unknownResponse.headers()['cache-control']).toContain('no-store');
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
    expect(goneResponse.headers()['cache-control']).toContain('no-store');
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
    const [shareBox, toggleBox, printBox, exportBox, editBox] = await Promise.all([
      page.getByRole('button', { name: 'Copy share link' }).boundingBox(),
      makePrivateToggle.boundingBox(),
      page.getByRole('button', { name: 'Print' }).boundingBox(),
      page.getByRole('button', { name: 'Export recipe' }).boundingBox(),
      page.getByRole('link', { name: 'Edit' }).boundingBox(),
    ]);
    if (!shareBox || !toggleBox || !printBox || !exportBox || !editBox) {
      throw new Error('Recipe visibility toolbar actions are not visible.');
    }
    const copyStatusBox = await copyStatus.boundingBox();
    expect(copyStatusBox).not.toBeNull();
    expect(copyStatusBox?.x).toBeCloseTo(shareBox.x, 1);
    expect(copyStatusBox?.y).toBeGreaterThan(shareBox.y + shareBox.height);
    await page.locator('main h1').click();
    await expect(copyStatus).toBeHidden();
    if (testInfo.project.name === 'chromium') {
      for (const actionBox of [toggleBox, printBox, exportBox, editBox]) {
        expect(actionBox.y).toBeCloseTo(shareBox.y, 1);
      }
      expect(shareBox.x).toBeLessThan(toggleBox.x);
      expect(toggleBox.x).toBeLessThan(printBox.x);
      expect(printBox.x).toBeLessThan(exportBox.x);
      expect(exportBox.x).toBeLessThan(editBox.x);
    } else {
      expect(toggleBox.x).toBeCloseTo(exportBox.x, 1);
      expect(toggleBox.x + toggleBox.width).toBeCloseTo(editBox.x + editBox.width, 1);
      expect(toggleBox.width).toBeCloseTo(editBox.x + editBox.width - exportBox.x, 1);
    }
    await expect(makePrivateToggle.locator('.recipe-privacy-toggle-state')).toHaveText('Linkable');
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
    await expect(page.locator('.recipe-privacy-toggle-state')).toHaveText('Linkable');
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

test('a guest can scale, switch units, and print the public recipe @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  let publicId: string | null = null;

  try {
    const recipe = await createRecipe(
      request,
      config,
      user,
      'Public cooking view',
      undefined,
      true,
    );
    publicId = await getPublicId(request, config, recipe.id);

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.goto(`/recipes/${recipe.id}/edit`);
    await page.getByRole('button', { name: 'Manage recipe photos' }).click();
    const photoDialog = page.getByRole('dialog', { name: 'Manage recipe photos' });
    const photoBuffer = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: { r: 126, g: 154, b: 116 },
      },
    })
      .png()
      .toBuffer();
    await photoDialog.getByLabel('Upload from device').setInputFiles({
      name: 'public-recipe-photo.png',
      mimeType: 'image/png',
      buffer: photoBuffer,
    });
    await expect(photoDialog.locator('.recipe-photo-grid-item')).toHaveCount(1);
    await photoDialog.getByRole('button', { name: 'Done' }).click();

    await page.goto(`/r/${publicId}`);
    await expect(
      page.getByRole('heading', { name: 'Public cooking view - serves 4' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Public cooking view | Recipe Box');
    await expect(page.locator('.recipe-public-serves-inline')).toHaveCSS('font-size', '16px');
    await expect(page.locator('.recipe-public-serves-inline')).toHaveCSS('font-weight', '400');
    await expect(page.getByText('Fold flour into batter.')).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.locator('.recipe-public-main')).toHaveCSS('padding-left', '24px');
    await expect(page.locator('.recipe-public-main')).toHaveCSS('padding-right', '24px');
    const [titleRowBox, titleBox, printBox] = await Promise.all([
      page.locator('.recipe-detail-title-row').boundingBox(),
      page.getByRole('heading', { name: 'Public cooking view - serves 4' }).boundingBox(),
      page.getByRole('button', { name: 'Print recipe' }).boundingBox(),
    ]);
    expect(titleRowBox).not.toBeNull();
    expect(titleBox).not.toBeNull();
    expect(printBox).not.toBeNull();
    expect(printBox!.x + printBox!.width).toBeCloseTo(titleRowBox!.x + titleRowBox!.width, 1);
    expect(Math.max(titleBox!.y, printBox!.y)).toBeLessThan(
      Math.min(titleBox!.y + titleBox!.height, printBox!.y + printBox!.height),
    );
    const summary = page.locator('.recipe-public-summary');
    await expect(summary).not.toContainText('serves 4');
    await expect(summary.getByRole('heading', { name: 'Time Breakdown' })).toBeVisible();
    await expect(summary.locator('.recipe-time-list')).toContainText('1 hr 5 min');
    await expect(summary.locator('.recipe-time-list')).toContainText('1 hr 10 min');
    const publicPhoto = page.locator('.recipe-public-photo');
    await expect(publicPhoto).toBeVisible();
    const [summaryBox, ingredientsBox, photoBox] = await Promise.all([
      summary.boundingBox(),
      page.getByRole('region', { name: 'Ingredients' }).boundingBox(),
      publicPhoto.boundingBox(),
    ]);
    if (!summaryBox || !ingredientsBox || !photoBox) {
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
    expect(photoBox.width).toBeLessThanOrEqual(420);
    expect(photoBox.height).toBeLessThanOrEqual(281);
    if ((page.viewportSize()?.width ?? 0) > 760) {
      expect(photoBox.x + photoBox.width).toBeLessThan(summaryBox.x);
      expect(Math.abs(photoBox.y - summaryBox.y)).toBeLessThanOrEqual(1);
    } else {
      expect(summaryBox.y).toBeGreaterThanOrEqual(photoBox.y + photoBox.height);
    }

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

    await page.evaluate(() => {
      window.print = () => {
        document.documentElement.dataset.printed = 'true';
      };
    });
    await page.getByRole('button', { name: 'Print recipe' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-printed', 'true');
    await page.emulateMedia({ media: 'print' });
    await expect(ingredientContent).toContainText('33.81 TBSP');
    await expect(summary.locator('.recipe-time-list')).toContainText('1 hr 5 min');
    await expect(summary.locator('.recipe-time-list')).toContainText('1 hr 10 min');
    await expect(page.getByRole('button', { name: 'Print recipe' })).toBeHidden();
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
