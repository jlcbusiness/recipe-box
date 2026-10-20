import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
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

async function getPicklistId(
  request: import('@playwright/test').APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  category: string,
  value: string,
) {
  const url = new URL(`${config.apiUrl}/rest/v1/recipe_picklist_values`);
  url.searchParams.set('select', 'id');
  url.searchParams.set('category', `eq.${category}`);
  url.searchParams.set('value', `eq.${value}`);
  const response = await request.get(url.toString(), { headers: ownerHeaders(config, user) });
  expect(response.ok()).toBeTruthy();
  const [result] = (await response.json()) as { id: string }[];
  expect(result).toBeDefined();
  return result.id;
}

async function saveRecipe(
  request: import('@playwright/test').APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  values: Record<string, unknown>,
) {
  const response = await request.post(
    `${config.apiUrl}/rest/v1/rpc/save_recipe_with_relationships`,
    {
      headers: ownerHeaders(config, user),
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'Herb roast potatoes',
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
        p_publication_id: null,
        p_publication_page: null,
        p_recipe_url: null,
        p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
        p_tag_ids: [],
        ...values,
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = await response.json();
  return recipe as { id: string; version: number };
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications$/);
}

test('active recipe owners can review readable, private change history @e2e @a11y', async ({
  browser,
  page,
  request,
}, testInfo) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const roastId = await getPicklistId(request, config, owner, 'food_type', 'Roast');
    const casseroleId = await getPicklistId(request, config, owner, 'food_type', 'Casserole');
    const dinnerId = await getPicklistId(request, config, owner, 'meal_type', 'Dinner');
    const lunchId = await getPicklistId(request, config, owner, 'meal_type', 'Lunch');
    const created = await saveRecipe(request, config, owner, {
      p_food_type_id: roastId,
      p_meal_type_ids: [dinnerId],
      p_prep_time_minutes: 20,
    });
    const updated = await saveRecipe(request, config, owner, {
      p_recipe_id: created.id,
      p_expected_version: created.version,
      p_name: 'Crispy herb roast potatoes',
      p_food_type_id: casseroleId,
      p_meal_type_ids: [lunchId],
      p_prep_time_minutes: 35,
    });

    const historyUrl = new URL(`${config.apiUrl}/rest/v1/recipe_history`);
    historyUrl.searchParams.set('select', 'event_type,before_data,after_data');
    historyUrl.searchParams.set('record_id', `eq.${created.id}`);
    historyUrl.searchParams.set('order', 'created_at.desc,id.desc');
    const ownHistoryResponse = await request.get(historyUrl.toString(), {
      headers: ownerHeaders(config, owner),
    });
    expect(ownHistoryResponse.ok()).toBeTruthy();
    const ownHistory = await ownHistoryResponse.json();
    expect(ownHistory).toHaveLength(2);
    expect(ownHistory.map((event: { event_type: string }) => event.event_type)).toEqual([
      'recipe.updated',
      'recipe.created',
    ]);
    expect(ownHistory[0].before_data.name).toBe('Herb roast potatoes');
    expect(ownHistory[0].after_data.name).toBe('Crispy herb roast potatoes');
    expect(ownHistory[0].before_data.picklists).toMatchObject({
      food_type: 'Roast',
      meal_type: ['Dinner'],
    });
    expect(ownHistory[0].after_data.picklists).toMatchObject({
      food_type: 'Casserole',
      meal_type: ['Lunch'],
    });

    const otherHistoryResponse = await request.get(historyUrl.toString(), {
      headers: ownerHeaders(config, other),
    });
    expect(otherHistoryResponse.ok()).toBeTruthy();
    expect(await otherHistoryResponse.json()).toEqual([]);

    await signIn(page, owner.email, owner.password);
    await page.setViewportSize({
      width: testInfo.project.name === 'Fold 6' ? 352 : 1024,
      height: 900,
    });
    await page.goto(`/recipes/${created.id}`);
    const historyLink = page.getByRole('link', { name: 'History' });
    await expect(historyLink).toBeVisible();
    expect(
      await historyLink.evaluate((link) => link.parentElement?.lastElementChild === link),
    ).toBe(true);
    await historyLink.focus();
    expect(
      await historyLink.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe('none');
    await historyLink.click();

    await expect(
      page.getByRole('heading', { name: 'History: Crispy herb roast potatoes' }),
    ).toBeVisible();
    const events = page.getByRole('list', { name: 'Recipe history' }).getByRole('listitem');
    await expect(events).toHaveCount(2);
    await expect(events.nth(0)).toContainText('Recipe updated');
    await expect(events.nth(0)).toContainText('Herb roast potatoes');
    await expect(events.nth(0)).toContainText('Crispy herb roast potatoes');
    await expect(events.nth(0)).toContainText('20 min');
    await expect(events.nth(0)).toContainText('35 min');
    await expect(events.nth(0)).toContainText(
      'Food type: Roast; Publication: Recipe Tin; Meal type: Dinner',
    );
    await expect(events.nth(0)).toContainText(
      'Food type: Casserole; Publication: Recipe Tin; Meal type: Lunch',
    );
    await expect(events.nth(1)).toContainText('Recipe created');
    await expect(page.getByRole('link', { name: 'Back to recipe' })).toBeVisible();
    await expect(page.getByText(owner.id, { exact: false })).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);

    const recipeResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=public_id&id=eq.${created.id}`,
      { headers: ownerHeaders(config, owner) },
    );
    const [{ public_id: publicId }] = (await recipeResponse.json()) as { public_id: string }[];
    await page.goto(`/r/${publicId}`);
    await expect(page.getByRole('link', { name: 'History' })).toHaveCount(0);
    await expect(page.getByText('History:', { exact: false })).toHaveCount(0);

    const trashResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: created.id, p_expected_version: updated.version },
    });
    expect(trashResponse.ok(), await trashResponse.text()).toBeTruthy();
    const restoreResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/restore_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: created.id, p_expected_version: updated.version + 1 },
    });
    expect(restoreResponse.ok(), await restoreResponse.text()).toBeTruthy();
    await page.goto(`/recipes/${created.id}/history`);
    const lifecycleEvents = page
      .getByRole('list', { name: 'Recipe history' })
      .getByRole('listitem');
    await expect(lifecycleEvents).toHaveCount(4);
    await expect(lifecycleEvents.nth(0)).toContainText('Recipe restored');
    await expect(lifecycleEvents.nth(1)).toContainText('Recipe moved to Trash');

    const otherPage = await browser.newPage();
    await signIn(otherPage, other.email, other.password);
    const foreignPageResponse = await otherPage.goto(`/recipes/${created.id}/history`);
    expect(foreignPageResponse?.status()).toBe(404);
    await otherPage.close();

    const secondTrashResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: created.id, p_expected_version: updated.version + 2 },
    });
    expect(secondTrashResponse.ok(), await secondTrashResponse.text()).toBeTruthy();
    const trashedPageResponse = await page.goto(`/recipes/${created.id}/history`);
    expect(trashedPageResponse?.status()).toBe(404);
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});

test('publication history is owner-only and returns to its active publication @e2e @a11y', async ({
  browser,
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const createdResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/create_publication`, {
      headers: ownerHeaders(config, owner),
      data: {
        p_name: 'Weeknight cooking',
        p_publication_type: 'book',
        p_author: 'M. Baker',
        p_edition: null,
        p_isbn: null,
        p_retailer_url: null,
        p_issue: null,
        p_site_url: null,
        p_tag_ids: [],
      },
    });
    expect(createdResponse.ok(), await createdResponse.text()).toBeTruthy();
    const publicationId = (await createdResponse.json()) as string;
    const updateResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
      headers: ownerHeaders(config, owner),
      data: {
        p_publication_id: publicationId,
        p_expected_version: 1,
        p_name: 'Weeknight cooking, revised edition',
        p_author: 'M. Baker',
        p_edition: null,
        p_isbn: null,
        p_retailer_url: null,
        p_site_url: null,
        p_tag_ids: [],
      },
    });
    expect(updateResponse.ok(), await updateResponse.text()).toBeTruthy();

    const historyUrl = new URL(`${config.apiUrl}/rest/v1/publication_history`);
    historyUrl.searchParams.set('select', 'event_type,before_data,after_data');
    historyUrl.searchParams.set('record_id', `eq.${publicationId}`);
    const foreignResponse = await request.get(historyUrl.toString(), {
      headers: ownerHeaders(config, other),
    });
    expect(foreignResponse.ok()).toBeTruthy();
    expect(await foreignResponse.json()).toEqual([]);

    await signIn(page, owner.email, owner.password);
    await page.goto(`/publications/${publicationId}`);
    const historyLink = page.getByRole('link', { name: 'History' });
    await expect(historyLink).toBeVisible();
    expect(
      await historyLink.evaluate((link) => link.parentElement?.lastElementChild === link),
    ).toBe(true);
    await historyLink.click();
    await expect(
      page.getByRole('heading', { name: 'History: Weeknight cooking, revised edition' }),
    ).toBeVisible();
    const events = page.getByRole('list', { name: 'Publication history' }).getByRole('listitem');
    await expect(events).toHaveCount(2);
    await expect(events.nth(0)).toContainText('Publication updated');
    await expect(events.nth(0)).toContainText('Weeknight cooking');
    await expect(events.nth(0)).toContainText('Weeknight cooking, revised edition');
    await expect(page.getByRole('link', { name: 'Back to publication' })).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    const otherPage = await browser.newPage();
    await signIn(otherPage, other.email, other.password);
    const foreignPageResponse = await otherPage.goto(`/publications/${publicationId}/history`);
    expect(foreignPageResponse?.status()).toBe(404);
    await otherPage.close();
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});

test('multi-recipe catalog rewrites retain each recipe before snapshot', async ({ request }) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const breakfastId = await getPicklistId(request, config, owner, 'meal_type', 'Breakfast');
    const dinnerId = await getPicklistId(request, config, owner, 'meal_type', 'Dinner');
    const lunchId = await getPicklistId(request, config, owner, 'meal_type', 'Lunch');
    const revisionUrl = new URL(`${config.apiUrl}/rest/v1/recipe_picklist_revisions`);
    revisionUrl.searchParams.set('select', 'revision');
    revisionUrl.searchParams.set('category', 'eq.meal_type');
    const revisionResponse = await request.get(revisionUrl.toString(), {
      headers: ownerHeaders(config, owner),
    });
    expect(revisionResponse.ok()).toBeTruthy();
    const [{ revision }] = (await revisionResponse.json()) as { revision: number }[];

    const breakfastRecipe = await saveRecipe(request, config, owner, {
      p_name: 'Breakfast history recipe',
      p_meal_type_ids: [breakfastId],
    });
    const dinnerRecipe = await saveRecipe(request, config, owner, {
      p_name: 'Dinner history recipe',
      p_meal_type_ids: [dinnerId],
    });
    const mergeResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_recipe_picklist`,
      {
        headers: ownerHeaders(config, owner),
        data: {
          p_action: 'merge',
          p_category: 'meal_type',
          p_expected_revision: revision,
          p_value_id: null,
          p_value: null,
          p_ordered_ids: [],
          p_source_ids: [breakfastId, dinnerId],
          p_target_id: lunchId,
          p_replacement_id: null,
          p_clear_optional: false,
        },
      },
    );
    expect(mergeResponse.ok(), await mergeResponse.text()).toBeTruthy();

    const historyUrl = new URL(`${config.apiUrl}/rest/v1/recipe_history`);
    historyUrl.searchParams.set('select', 'record_id,before_data,after_data');
    historyUrl.searchParams.set('record_id', `in.(${breakfastRecipe.id},${dinnerRecipe.id})`);
    historyUrl.searchParams.set('event_type', 'eq.recipe.updated');
    const historyResponse = await request.get(historyUrl.toString(), {
      headers: ownerHeaders(config, owner),
    });
    expect(historyResponse.ok()).toBeTruthy();
    const histories = (await historyResponse.json()) as {
      record_id: string;
      before_data: { picklists: { meal_type: string[] } };
      after_data: { picklists: { meal_type: string[] } };
    }[];
    expect(histories).toHaveLength(2);
    const byRecord = new Map(histories.map((event) => [event.record_id, event]));
    expect(byRecord.get(breakfastRecipe.id)?.before_data.picklists.meal_type).toEqual([
      'Breakfast',
    ]);
    expect(byRecord.get(dinnerRecipe.id)?.before_data.picklists.meal_type).toEqual(['Dinner']);
    expect(histories.every((event) => event.after_data.picklists.meal_type.includes('Lunch'))).toBe(
      true,
    );
  } finally {
    await deleteTestUser(request, owner);
  }
});

test('recipe history retains publication names across reassignment', async ({ request }) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const createPublication = async (name: string) => {
      const response = await request.post(`${config.apiUrl}/rest/v1/rpc/create_publication`, {
        headers: ownerHeaders(config, owner),
        data: {
          p_name: name,
          p_publication_type: 'book',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: null,
          p_tag_ids: [],
        },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return (await response.json()) as string;
    };

    const firstPublicationId = await createPublication('Sunday Table');
    const secondPublicationId = await createPublication('The Green Kitchen');
    const recipe = await saveRecipe(request, config, owner, {
      p_publication_id: firstPublicationId,
    });
    await saveRecipe(request, config, owner, {
      p_recipe_id: recipe.id,
      p_expected_version: recipe.version,
      p_publication_id: secondPublicationId,
    });

    const historyUrl = new URL(`${config.apiUrl}/rest/v1/recipe_history`);
    historyUrl.searchParams.set('select', 'before_data,after_data');
    historyUrl.searchParams.set('record_id', `eq.${recipe.id}`);
    historyUrl.searchParams.set('event_type', 'eq.recipe.updated');
    const response = await request.get(historyUrl.toString(), {
      headers: ownerHeaders(config, owner),
    });
    expect(response.ok()).toBeTruthy();
    const [event] = (await response.json()) as {
      before_data: { picklists: Record<string, unknown> };
      after_data: { picklists: Record<string, unknown> };
    }[];
    expect(event.before_data.picklists.publication).toBe('Sunday Table');
    expect(event.after_data.picklists.publication).toBe('The Green Kitchen');
    expect(Object.keys(event.before_data.picklists)).not.toContain('publication_id');
    expect(Object.keys(event.after_data.picklists)).not.toContain('publication_id');
  } finally {
    await deleteTestUser(request, owner);
  }
});

test('active records with no retained events show a compact empty state', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const recipe = await saveRecipe(request, config, owner, { p_name: 'No event recipe' });
    const deleteHistoryUrl = new URL(`${config.apiUrl}/rest/v1/recipe_history`);
    deleteHistoryUrl.searchParams.set('account_id', `eq.${owner.id}`);
    deleteHistoryUrl.searchParams.set('record_id', `eq.${recipe.id}`);
    const deleteHistoryResponse = await request.delete(deleteHistoryUrl.toString(), {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    });
    expect(deleteHistoryResponse.ok()).toBeTruthy();

    await signIn(page, owner.email, owner.password);
    await page.goto(`/recipes/${recipe.id}/history`);
    await expect(page.getByText('No history has been recorded for this recipe yet.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Recipe history' })).toHaveCount(0);
  } finally {
    await deleteTestUser(request, owner);
  }
});
