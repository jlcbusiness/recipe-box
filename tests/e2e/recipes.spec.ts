import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

async function selectSinglePicklist(
  page: import('@playwright/test').Page,
  label: string,
  option: string,
) {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: option, exact: true }).click();
}

test('an owner can create, view, edit, and reload a Recipe Tin recipe @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Recipe Tin' }).click();
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
    await expect(page.getByText('Your Recipe Tin is empty.')).toBeVisible();
    await page.getByRole('link', { name: 'New Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'New Recipe' })).toBeVisible();
    const titleFontSize = Number.parseFloat(
      await page
        .getByRole('heading', { name: 'New Recipe' })
        .evaluate((element) => getComputedStyle(element).fontSize),
    );
    expect(titleFontSize).toBeGreaterThanOrEqual(21);
    expect(titleFontSize).toBeLessThanOrEqual(22);
    await expect(page.getByRole('main').getByRole('link', { name: 'Recipe Tin' })).toHaveCount(0);
    await page.getByLabel('Name').fill('Sunday tomato soup');
    await expect(page.getByLabel('State')).toBeVisible();
    await expect(page.locator('input[name="state"]')).toHaveValue('want_to_try');
    const nameBounds = await page.getByLabel('Name').boundingBox();
    const stateBounds = await page.getByLabel('State').boundingBox();
    const foodTypeBounds = await page
      .getByRole('button', { name: 'Food Type', exact: true })
      .boundingBox();
    const enthusiasmBounds = await page
      .getByRole('button', { name: 'Enthusiasm', exact: true })
      .boundingBox();
    const stateEquipmentBounds = await page
      .getByRole('button', { name: 'Equipment: Select' })
      .boundingBox();
    if (
      !nameBounds ||
      !stateBounds ||
      !foodTypeBounds ||
      !enthusiasmBounds ||
      !stateEquipmentBounds
    ) {
      throw new Error('Recipe metadata controls must have measurable bounds.');
    }
    const singlePicklistLabel = page.locator('.recipe-single-picklist > span').first();
    const multiPicklistLabel = page.locator('.recipe-choice-group > legend').first();
    await expect(singlePicklistLabel).toHaveCSS('font-size', '13px');
    await expect(multiPicklistLabel).toHaveCSS('font-size', '13px');
    await expect(singlePicklistLabel).toHaveCSS('font-weight', '700');
    await expect(multiPicklistLabel).toHaveCSS('font-weight', '700');
    await expect(page.getByRole('button', { name: 'State', exact: true })).toHaveCSS(
      'font-weight',
      '400',
    );
    await expect(page.getByRole('button', { name: 'Meal Type: Select' })).toHaveCSS(
      'font-weight',
      '400',
    );
    expect(stateBounds.y).toBeGreaterThan(nameBounds.y);
    expect(Math.abs(stateBounds.y - enthusiasmBounds.y)).toBeLessThanOrEqual(1);
    expect(foodTypeBounds.y).toBeGreaterThan(stateBounds.y);
    const servesBounds = await page.getByLabel('Serves').boundingBox();
    expect(Math.abs((servesBounds?.y ?? 0) - stateBounds.y)).toBeLessThanOrEqual(4);
    expect(servesBounds?.height).toBe(stateBounds.height);
    await expect(page.getByLabel('Serves')).toHaveCSS('text-align', 'center');
    expect(Math.abs(stateEquipmentBounds.y - stateBounds.y)).toBeLessThanOrEqual(4);
    expect(stateEquipmentBounds.x).toBeGreaterThan(servesBounds?.x ?? 0);
    await expect(page.getByLabel('Serves')).toHaveAttribute('step', '1');
    await expect(page.getByLabel('Serves')).toHaveAttribute('name', 'serves');
    await expect(page.getByRole('button', { name: 'Enthusiasm', exact: true })).toContainText(
      'What am I feeling?',
    );
    expect(foodTypeBounds?.width).toBeLessThanOrEqual(220);
    expect(foodTypeBounds?.height).toBeLessThanOrEqual(40);
    const formBounds = await page.locator('.recipe-form').boundingBox();
    const notesBounds = await page.getByLabel('Notes (Markdown)').boundingBox();
    expect(Math.abs((notesBounds?.width ?? 0) - (formBounds?.width ?? 0))).toBeLessThanOrEqual(1);
    await expect(page.locator('.recipe-form-fields').first()).toHaveCSS('display', 'flex');
    await selectSinglePicklist(page, 'Food Type', 'Soup');
    await expect(page.getByRole('group', { name: 'Times (min)' })).toBeVisible();
    await expect(page.getByLabel('Serves')).toBeVisible();
    const mealTriggerBounds = await page
      .getByRole('button', { name: 'Meal Type: Select' })
      .boundingBox();
    const cuisineTriggerBounds = await page
      .getByRole('button', { name: 'Cuisine: Select' })
      .boundingBox();
    const equipmentTriggerBounds = await page
      .getByRole('button', { name: 'Equipment: Select' })
      .boundingBox();
    expect(mealTriggerBounds?.height).toBe(stateBounds.height);
    expect(Math.abs((mealTriggerBounds?.y ?? 0) - foodTypeBounds.y)).toBeLessThanOrEqual(4);
    expect(Math.abs((cuisineTriggerBounds?.y ?? 0) - foodTypeBounds.y)).toBeLessThanOrEqual(4);
    expect(Math.abs((equipmentTriggerBounds?.y ?? 0) - stateBounds.y)).toBeLessThanOrEqual(4);
    const prepBounds = await page.getByLabel('Prep time (minutes)').boundingBox();
    const mixingBounds = await page.getByLabel('Mixing time (minutes)').boundingBox();
    await expect(page.locator('.recipe-time-fields')).toHaveCSS('display', 'flex');
    expect(prepBounds?.width).toBeLessThanOrEqual(58);
    expect(prepBounds?.height).toBeLessThanOrEqual(40);
    if (prepBounds && mixingBounds) {
      expect(mixingBounds.x - prepBounds.x - prepBounds.width).toBeLessThanOrEqual(10);
    }

    const mealGroup = page.getByRole('group', { name: 'Meal Type' });
    await expect(mealGroup.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Meal Type: Select' }).click();
    const dinnerOption = page.getByRole('button', { name: 'Dinner', exact: true });
    const mealMenuBounds = await page.locator('.recipe-picklist-menu').first().boundingBox();
    expect(mealMenuBounds?.width).toBeLessThanOrEqual(220);
    await dinnerOption.click();
    await expect(dinnerOption).toHaveAttribute('aria-pressed', 'true');
    await expect(dinnerOption).toHaveCSS('font-weight', '700');
    await expect(
      page
        .getByRole('button', { name: /Meal Type: Dinner/ })
        .locator('.recipe-picklist-trigger-label'),
    ).toHaveText(/✓\s*Dinner/);
    await expect(dinnerOption).toBeVisible();
    await page.getByRole('button', { name: 'Cuisine: Select' }).click();
    await page.getByRole('button', { name: 'Italian', exact: true }).click();
    await selectSinglePicklist(page, 'State', 'Want to Try');
    await selectSinglePicklist(page, 'Enthusiasm', 'Absolutely');
    await page.getByLabel('Serves').fill('4');
    await page.getByLabel('Prep time (minutes)').fill('15');
    await page.getByLabel('Mixing time (minutes)').fill('10');
    await page.getByLabel('Cook time (minutes)').fill('30');
    await page.getByLabel('Total time (minutes)').fill('999');
    expect(
      await page
        .getByLabel('Prep time (minutes)')
        .evaluate((element) => getComputedStyle(element).appearance),
    ).toBe('textfield');
    const componentTimeBottoms = await Promise.all(
      ['Prep', 'Mixing', 'Marinate', 'Chill', 'Freeze', 'Cook', 'Bake', 'Cooling', 'Rest'].map(
        async (label) => {
          const bounds = await page.getByLabel(`${label} time (minutes)`).boundingBox();
          return bounds ? bounds.y + bounds.height : 0;
        },
      ),
    );
    const totalTimeBounds = await page.getByLabel('Total time (minutes)').boundingBox();
    expect(totalTimeBounds?.y).toBeGreaterThan(Math.max(...componentTimeBottoms));
    const calculateButton = page.getByRole('button', { name: 'Calculate total time' });
    await expect(calculateButton).toHaveText('Σ');
    const totalRow = page.locator('.recipe-time-total-row');
    await expect(totalRow).toBeVisible();
    const calculateBounds = await calculateButton.boundingBox();
    expect(calculateBounds?.y).toBe(totalTimeBounds?.y);
    expect(calculateBounds?.x).toBeGreaterThan(totalTimeBounds?.x ?? 0);
    expect(calculateBounds?.width).toBeLessThanOrEqual(34);
    expect(
      Math.abs((calculateBounds?.width ?? 0) - (calculateBounds?.height ?? 0)),
    ).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Equipment: Select' }).click();
    await page.getByRole('button', { name: 'Medium skillet', exact: true }).click();
    await page.getByLabel('Notes (Markdown)').fill('Add **fresh** basil at the end.');

    await expect(page.getByLabel('Total time (minutes)')).toHaveValue('999');
    await page.getByLabel('Cook time (minutes)').fill('31');
    await expect(page.getByLabel('Total time (minutes)')).toHaveValue('999');
    await page.getByRole('button', { name: 'Calculate total time' }).click();
    await expect(page.getByLabel('Total time (minutes)')).toHaveValue('56');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Sunday tomato soup' })).toBeVisible();
    await page.setViewportSize({ width: 1600, height: 1000 });
    const desktopEditLink = page.getByRole('link', { name: 'Edit recipe' });
    await expect(desktopEditLink.locator('.recipe-edit-desktop')).toBeVisible();
    await expect(desktopEditLink.locator('.recipe-edit-mobile')).toBeHidden();
    const desktopTitleBounds = await page
      .getByRole('heading', { name: 'Sunday tomato soup' })
      .boundingBox();
    const desktopEditBounds = await desktopEditLink.boundingBox();
    expect(desktopEditBounds?.height).toBe(36);
    expect(
      Math.abs(
        (desktopEditBounds?.y ?? 0) +
          (desktopEditBounds?.height ?? 0) / 2 -
          ((desktopTitleBounds?.y ?? 0) + (desktopTitleBounds?.height ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(1);
    const detailTitleSize = Number.parseFloat(
      await page
        .getByRole('heading', { name: 'Sunday tomato soup' })
        .evaluate((element) => getComputedStyle(element).fontSize),
    );
    const sectionTitleSize = Number.parseFloat(
      await page
        .getByRole('heading', { name: 'Recipe details' })
        .evaluate((element) => getComputedStyle(element).fontSize),
    );
    expect(detailTitleSize).toBeGreaterThanOrEqual(21);
    expect(detailTitleSize).toBeLessThanOrEqual(22);
    expect(sectionTitleSize).toBeGreaterThanOrEqual(21);
    expect(sectionTitleSize).toBeLessThanOrEqual(22);
    expect(
      (await page.locator('.recipe-detail-section').first().boundingBox())?.width,
    ).toBeGreaterThanOrEqual(1000);
    await expect(page.getByRole('main').getByRole('link', { name: 'Recipe Tin' })).toHaveCount(0);
    await expect(page.getByRole('main').getByText('Recipe Tin', { exact: true })).toHaveCount(0);
    await expect(page.locator('.recipe-attribution')).toHaveCount(0);
    const detailLabels = await page
      .locator('.recipe-metadata:not(.recipe-time-list) dt')
      .allTextContents();
    const detailMetadata = page.locator('.recipe-metadata:not(.recipe-time-list)').first();
    await expect(detailMetadata).toHaveCSS('display', 'flex');
    await expect(detailMetadata).toHaveCSS('flex-wrap', 'wrap');
    const detailSectionBounds = await page.locator('.recipe-detail-section').first().boundingBox();
    const classificationBounds = await page.locator('.recipe-detail-classification').boundingBox();
    expect(
      Math.abs((classificationBounds?.width ?? 0) - (detailSectionBounds?.width ?? 0)),
    ).toBeLessThanOrEqual(1);
    expect(detailLabels).toEqual([
      'State',
      'Enthusiasm',
      'Serves',
      'Total time',
      'Equipment',
      'Food Type',
      'Meal Type',
      'Cuisine',
    ]);
    await expect(page.locator('.recipe-detail-classification dt')).toHaveText([
      'Food Type',
      'Meal Type',
      'Cuisine',
    ]);
    await expect(page.getByText('Add fresh basil at the end.')).toBeVisible();

    const recipeId = new URL(page.url()).pathname.split('/').at(-1);
    expect(recipeId).toBeTruthy();
    const headers = {
      apikey: config.anonKey,
      Authorization: `Bearer ${user.accessToken}`,
    };
    const recipeResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,version,total_time_minutes,serves&id=eq.${recipeId}`,
      { headers },
    );
    expect(await recipeResponse.json()).toEqual([
      { id: recipeId, version: 1, total_time_minutes: 56, serves: 4 },
    ]);

    const createHistory = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,actor_user_id&record_id=eq.${recipeId}`,
      { headers },
    );
    expect(await createHistory.json()).toEqual([
      { event_type: 'recipe.created', actor_user_id: user.id },
    ]);

    await page.goto('/recipes');
    expect((await page.locator('.recipes-main').boundingBox())?.width).toBeGreaterThanOrEqual(1150);
    await expect(page.getByRole('columnheader', { name: 'Opinion' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Last saved' })).toHaveCount(0);
    const recipeRow = page.getByRole('row', { name: /Sunday tomato soup/ });
    await expect(recipeRow).toContainText('Absolutely');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('columnheader', { name: 'Food Type' })).toBeHidden();
    await expect(page.getByRole('columnheader', { name: 'State' })).toBeHidden();
    await expect(recipeRow.locator('td:visible')).toHaveCount(2);
    await recipeRow.getByRole('link', { name: 'Sunday tomato soup' }).click();

    const mobileEditLink = page.getByRole('link', { name: 'Edit recipe' });
    await expect(mobileEditLink.locator('.recipe-edit-mobile')).toBeVisible();
    await expect(mobileEditLink.locator('.recipe-edit-desktop')).toBeHidden();
    await expect(mobileEditLink).toHaveCSS('font-variant-caps', 'all-small-caps');
    const mobileTitleBounds = await page
      .getByRole('heading', { name: 'Sunday tomato soup' })
      .boundingBox();
    const mobileEditBounds = await mobileEditLink.boundingBox();
    const mobileHeadingBounds = await page.locator('.recipe-detail-heading').boundingBox();
    expect(mobileEditBounds?.height).toBe(32);
    expect(
      Math.abs(
        (mobileHeadingBounds?.x ?? 0) +
          (mobileHeadingBounds?.width ?? 0) -
          ((mobileEditBounds?.x ?? 0) + (mobileEditBounds?.width ?? 0)),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (mobileEditBounds?.y ?? 0) +
          (mobileEditBounds?.height ?? 0) / 2 -
          ((mobileTitleBounds?.y ?? 0) + (mobileTitleBounds?.height ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(1);

    await mobileEditLink.click();
    const foodTypeTrigger = page.getByRole('button', { name: 'Food Type', exact: true });
    const foodTypeTriggerBounds = await foodTypeTrigger.boundingBox();
    const mealTypeTriggerBounds = await page
      .getByRole('button', { name: /Meal Type:/ })
      .boundingBox();
    expect(foodTypeTriggerBounds?.height).toBe(mealTypeTriggerBounds?.height);
    expect(
      Math.abs((foodTypeTriggerBounds?.y ?? 0) - (mealTypeTriggerBounds?.y ?? 0)),
    ).toBeLessThanOrEqual(1);
    const foodTypeLabelBounds = await page
      .locator('.recipe-single-picklist')
      .filter({ has: foodTypeTrigger })
      .locator(':scope > span')
      .boundingBox();
    const mealTypeLabel = page.getByRole('group', { name: 'Meal Type' }).locator('legend');
    const mealTypeLabelBounds = await mealTypeLabel.boundingBox();
    await expect(mealTypeLabel).toHaveCSS('font-size', '13px');
    expect(
      Math.abs((foodTypeLabelBounds?.y ?? 0) - (mealTypeLabelBounds?.y ?? 0)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((foodTypeLabelBounds?.height ?? 0) - (mealTypeLabelBounds?.height ?? 0)),
    ).toBeLessThanOrEqual(1);
    const mobileStateBounds = await page
      .getByRole('button', { name: 'State', exact: true })
      .boundingBox();
    const mobileServesBounds = await page.getByLabel('Serves').boundingBox();
    expect(mobileServesBounds?.height).toBe(mobileStateBounds?.height);
    await foodTypeTrigger.click();
    const foodTypeMenuBounds = await page.locator('#food_type_id-options').boundingBox();
    expect(
      Math.abs((foodTypeMenuBounds?.x ?? 0) - (foodTypeTriggerBounds?.x ?? 0)),
    ).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Soup', exact: true }).click();
    await selectSinglePicklist(page, 'State', 'Tried');
    await selectSinglePicklist(page, 'Verdict', 'Favorite');
    await page.getByLabel('Name').fill('Sunday tomato and basil soup');
    await page.getByLabel('Total time (minutes)').fill('70');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Sunday tomato and basil soup' })).toBeVisible();
    await page.goto('/recipes');
    await expect(page.getByRole('row', { name: /Sunday tomato and basil soup/ })).toContainText(
      'Favorite',
    );
    await page
      .getByRole('row', { name: /Sunday tomato and basil soup/ })
      .getByRole('link', { name: 'Sunday tomato and basil soup' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}$`));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sunday tomato and basil soup' })).toBeVisible();

    const updatedRecipe = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,version,total_time_minutes&id=eq.${recipeId}`,
      { headers },
    );
    expect(await updatedRecipe.json()).toEqual([
      { id: recipeId, version: 2, total_time_minutes: 70 },
    ]);
    const history = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,actor_user_id&record_id=eq.${recipeId}&order=created_at.asc`,
      { headers },
    );
    expect(await history.json()).toEqual([
      { event_type: 'recipe.created', actor_user_id: user.id },
      { event_type: 'recipe.updated', actor_user_id: user.id },
    ]);

    await page.getByRole('link', { name: 'Edit recipe' }).click();
    await selectSinglePicklist(page, 'State', 'Will not try');
    await page.getByLabel('Reason').fill('Contains an ingredient I avoid.');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Sunday tomato and basil soup' })).toBeVisible();
    await expect(page.locator('.recipe-metadata').first()).toContainText('Will not try');
    await page.goto('/recipes');
    await expect(page.getByRole('row', { name: /Sunday tomato and basil soup/ })).toContainText(
      'Contains an ingredient I avoid.',
    );
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipes and history are isolated to their owning account @e2e', async ({ request }) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const ownerPicklistsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id,category,value,sort_order,is_protected&order=category.asc&order=sort_order.asc`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${owner.accessToken}` } },
    );
    const otherPicklistsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id,category,value,sort_order,is_protected&order=category.asc&order=sort_order.asc`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${other.accessToken}` } },
    );
    const ownerPicklists = (await ownerPicklistsResponse.json()) as Array<{
      id: string;
      category: string;
      value: string;
      sort_order: number;
      is_protected: boolean;
    }>;
    const otherPicklists = (await otherPicklistsResponse.json()) as typeof ownerPicklists;
    const expectedPicklistCounts = {
      cuisine: 8,
      enthusiasm: 6,
      equipment: 10,
      food_type: 12,
      informal_unit: 11,
      meal_type: 10,
      unmeasured_phrase: 5,
      verdict: 12,
    };
    const countByCategory = (values: Array<{ category: string }>) =>
      values.reduce<Record<string, number>>((counts, value) => {
        counts[value.category] = (counts[value.category] ?? 0) + 1;
        return counts;
      }, {});
    expect(countByCategory(ownerPicklists)).toEqual(expectedPicklistCounts);
    const seedEntries = (values: typeof ownerPicklists) =>
      values
        .map(({ category, value, sort_order, is_protected }) => ({
          category,
          value,
          sort_order,
          is_protected,
        }))
        .sort((left, right) =>
          `${left.category}:${left.value}`.localeCompare(`${right.category}:${right.value}`),
        );
    expect(seedEntries(ownerPicklists)).toEqual(seedEntries(otherPicklists));
    expect(ownerPicklists).toHaveLength(74);
    expect(otherPicklists).toHaveLength(74);
    expect(ownerPicklists.every(({ id }) => !otherPicklists.some((value) => value.id === id))).toBe(
      true,
    );
    const otherPicklist = otherPicklists[0];
    const hiddenPicklistResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&id=eq.${otherPicklist.id}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${owner.accessToken}` } },
    );
    expect(await hiddenPicklistResponse.json()).toEqual([]);
    expect(
      ownerPicklists
        .filter(({ value }) => value === 'Specific occasion')
        .every(({ is_protected }) => is_protected),
    ).toBe(true);

    const insert = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${owner.accessToken}`,
      },
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'Owner-only fixture recipe',
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
      },
    });
    expect(insert.ok()).toBeTruthy();
    const [{ id: recipeId }] = await insert.json();

    const directInsert = await request.post(`${config.apiUrl}/rest/v1/recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${owner.accessToken}`,
      },
      data: { account_id: owner.id, name: 'Bypass attempt', state: 'want_to_try' },
    });
    expect(directInsert.ok()).toBeFalsy();

    const ownerRecipes = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id&id=eq.${recipeId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${owner.accessToken}` } },
    );
    const otherRecipes = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id&id=eq.${recipeId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${other.accessToken}` } },
    );
    expect(await ownerRecipes.json()).toEqual([{ id: recipeId }]);
    expect(await otherRecipes.json()).toEqual([]);

    const crossAccountUpdate = await request.patch(
      `${config.apiUrl}/rest/v1/recipes?id=eq.${recipeId}`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${other.accessToken}`,
          Prefer: 'return=representation',
        },
        data: { name: 'Unauthorized edit', version: 2 },
      },
    );
    expect(await crossAccountUpdate.json()).toEqual([]);

    const ownerHistory = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,actor_user_id&record_id=eq.${recipeId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${owner.accessToken}` } },
    );
    const otherHistory = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,actor_user_id&record_id=eq.${recipeId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${other.accessToken}` } },
    );
    expect(await ownerHistory.json()).toEqual([
      { event_type: 'recipe.created', actor_user_id: owner.id },
    ]);
    expect(await otherHistory.json()).toEqual([]);
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});

test('recipe saves preserve conditional data and reject stale versions atomically @e2e', async ({
  request,
}) => {
  const user = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };

  try {
    const specificOccasionResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&category=eq.enthusiasm&value=eq.${encodeURIComponent('Specific occasion')}`,
      { headers },
    );
    const dinnerResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&category=eq.meal_type&value=eq.Dinner`,
      { headers },
    );
    const favoriteResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&category=eq.verdict&value=eq.Favorite`,
      { headers },
    );
    const otherDinnerResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&category=eq.meal_type&value=eq.Dinner`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${other.accessToken}`,
        },
      },
    );
    const [{ id: enthusiasmId }] = await specificOccasionResponse.json();
    const [{ id: dinnerId }] = await dinnerResponse.json();
    const [{ id: favoriteId }] = await favoriteResponse.json();
    const [{ id: otherDinnerId }] = await otherDinnerResponse.json();
    const payload: Record<string, unknown> = {
      p_recipe_id: null,
      p_expected_version: null,
      p_name: 'Sunday dinner recipe',
      p_food_type_id: null,
      p_state: 'want_to_try',
      p_verdict_id: null,
      p_enthusiasm_id: enthusiasmId,
      p_occasion_details: 'For Sunday dinner',
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
      p_meal_type_ids: [dinnerId],
      p_cuisine_ids: [],
      p_equipment_ids: [],
    };
    const save = (overrides: Record<string, unknown>) =>
      request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
        headers,
        data: { ...payload, ...overrides },
      });

    const create = await save({});
    expect(create.ok(), await create.text()).toBeTruthy();
    const [created] = await create.json();
    expect(created.version).toBe(1);

    const fractionalServes = await save({ p_serves: 1.5 });
    expect(fractionalServes.ok()).toBeFalsy();

    const recipeId = created.id as string;
    const recipeResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,name,enthusiasm_id,occasion_details,version&id=eq.${recipeId}`,
      { headers },
    );
    expect(await recipeResponse.json()).toEqual([
      {
        id: recipeId,
        name: 'Sunday dinner recipe',
        enthusiasm_id: enthusiasmId,
        occasion_details: 'For Sunday dinner',
        version: 1,
      },
    ]);

    const update = await save({
      p_recipe_id: recipeId,
      p_expected_version: 1,
      p_name: 'Updated Sunday dinner recipe',
      p_state: 'tried',
      p_verdict_id: favoriteId,
      p_enthusiasm_id: null,
      p_occasion_details: null,
    });
    expect(update.ok()).toBeTruthy();

    const staleUpdate = await save({
      p_recipe_id: recipeId,
      p_expected_version: 1,
      p_name: 'Stale recipe edit',
      p_meal_type_ids: [],
    });
    expect((await staleUpdate.json()).code).toBe('40001');

    const invalidAssociationUpdate = await save({
      p_recipe_id: recipeId,
      p_expected_version: 2,
      p_name: 'Invalid association edit',
      p_meal_type_ids: [otherDinnerId],
    });
    expect((await invalidAssociationUpdate.json()).code).toBe('23503');

    const currentRecipe = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=name,state,verdict_id,version&id=eq.${recipeId}`,
      { headers },
    );
    expect(await currentRecipe.json()).toEqual([
      { name: 'Updated Sunday dinner recipe', state: 'tried', verdict_id: favoriteId, version: 2 },
    ]);
    const assignments = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_assignments?select=picklist_value_id&recipe_id=eq.${recipeId}`,
      { headers },
    );
    expect(await assignments.json()).toEqual([{ picklist_value_id: dinnerId }]);
    const history = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,actor_user_id,before_data,after_data&record_id=eq.${recipeId}&order=created_at.asc`,
      { headers },
    );
    const historyRows = await history.json();
    expect(historyRows).toHaveLength(2);
    expect(historyRows[0]).toMatchObject({
      event_type: 'recipe.created',
      actor_user_id: user.id,
      before_data: null,
      after_data: {
        name: 'Sunday dinner recipe',
        version: 1,
        occasion_details: 'For Sunday dinner',
      },
    });
    expect(historyRows[1]).toMatchObject({
      event_type: 'recipe.updated',
      actor_user_id: user.id,
      before_data: { name: 'Sunday dinner recipe', version: 1 },
      after_data: {
        name: 'Updated Sunday dinner recipe',
        state: 'tried',
        verdict_id: favoriteId,
        version: 2,
      },
    });
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, user);
  }
});

test('State controls conditional fields and clears old draft values @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('A recipe under consideration');
    await selectSinglePicklist(page, 'State', 'Want to Try');
    await expect(page.getByLabel('Enthusiasm')).toBeVisible();
    await expect(page.getByLabel('Verdict')).toBeHidden();
    await expect(page.getByLabel('Reason')).toBeHidden();

    await selectSinglePicklist(page, 'Enthusiasm', 'Specific occasion');
    await expect(page.getByLabel('Occasion Details')).toBeVisible();
    await page.getByLabel('Occasion Details').fill('Sunday dinner');
    await selectSinglePicklist(page, 'Enthusiasm', 'Absolutely');
    await expect(page.getByLabel('Occasion Details')).toBeHidden();
    await selectSinglePicklist(page, 'Enthusiasm', 'Specific occasion');
    await expect(page.getByLabel('Occasion Details')).toBeVisible();
    await expect(page.getByLabel('Occasion Details')).toHaveValue('');
    await page.getByLabel('Occasion Details').fill('Sunday dinner');

    await selectSinglePicklist(page, 'State', 'Tried');
    await expect(page.getByLabel('Verdict')).toBeVisible();
    await expect(page.getByLabel('Enthusiasm')).toBeHidden();
    await expect(page.getByLabel('Occasion Details')).toBeHidden();
    await expect(page.getByLabel('Reason')).toBeHidden();
    await selectSinglePicklist(page, 'Verdict', 'Favorite');

    await selectSinglePicklist(page, 'State', 'Will not try');
    await expect(page.getByLabel('Reason')).toBeVisible();
    await expect(page.getByLabel('Verdict')).toBeHidden();
    await page.getByLabel('Reason').fill('Contains an ingredient I avoid.');
    await expect(page.getByLabel('Reason')).toHaveAttribute('type', 'text');
    await selectSinglePicklist(page, 'State', 'Tried');
    await page.getByRole('button', { name: 'Verdict', exact: true }).click();
    const verdictOptions = await page
      .locator('#verdict_id-options .recipe-picklist-option')
      .allTextContents();
    const specificOccasionIndex = verdictOptions.indexOf('Specific occasion');
    expect(verdictOptions.slice(specificOccasionIndex, specificOccasionIndex + 3)).toEqual([
      'Specific occasion',
      'Once-a-year-rich',
      'So-so',
    ]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('stale recipe versions are rejected without overwriting the first save @e2e', async ({
  browser,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    const firstPage = await browser.newPage();
    await signIn(firstPage, user.email, user.password);
    await firstPage.goto('/recipes/new');
    await firstPage.getByLabel('Name').fill('Concurrent edit soup');
    await selectSinglePicklist(firstPage, 'State', 'Want to Try');
    await firstPage.getByRole('button', { name: 'Save recipe' }).click();
    await expect(firstPage.getByRole('heading', { name: 'Concurrent edit soup' })).toBeVisible();
    const detailPath = new URL(firstPage.url()).pathname;

    await firstPage.getByRole('link', { name: 'Edit recipe' }).click();
    const secondPage = await browser.newPage();
    await signIn(secondPage, user.email, user.password);
    await secondPage.goto(`${detailPath}/edit`);

    await firstPage.getByLabel('Name').fill('First writer wins');
    await firstPage.getByRole('button', { name: 'Save recipe' }).click();
    await expect(firstPage.getByRole('heading', { name: 'First writer wins' })).toBeVisible();

    await secondPage.getByLabel('Name').fill('Stale writer must not win');
    await secondPage.getByRole('button', { name: 'Save recipe' }).click();
    await expect(
      secondPage.getByText('This recipe changed in another session. Reload before saving again.', {
        exact: true,
      }),
    ).toBeVisible();
    await secondPage.reload();
    await expect(secondPage.getByLabel('Name')).toHaveValue('First writer wins');

    await firstPage.close();
    await secondPage.close();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Recipe Tin list and editor are accessible on desktop and mobile @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes');
    const listA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(listA11y.violations).toEqual([]);

    await page.getByRole('link', { name: 'New Recipe' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const prepInputBounds = await page.getByLabel('Prep time (minutes)').boundingBox();
    const prepTouchRowBounds = await page.locator('.recipe-time-field').first().boundingBox();
    expect(prepInputBounds?.height).toBeLessThanOrEqual(36);
    expect(prepTouchRowBounds?.height).toBeGreaterThanOrEqual(48);
    const mealTriggerBounds = await page
      .getByRole('button', { name: 'Meal Type: Select' })
      .boundingBox();
    expect(mealTriggerBounds?.height).toBeGreaterThanOrEqual(48);
    const totalInputBounds = await page.getByLabel('Total time (minutes)').boundingBox();
    const calculateButton = page.getByRole('button', { name: 'Calculate total time' });
    const calculateButtonBounds = await calculateButton.boundingBox();
    const calculateIconBounds = await calculateButton
      .locator('.recipe-calculate-icon')
      .boundingBox();
    expect(calculateButtonBounds?.width).toBeGreaterThanOrEqual(48);
    expect(calculateButtonBounds?.height).toBeGreaterThanOrEqual(48);
    expect(calculateIconBounds?.width).toBe(30);
    expect(calculateIconBounds?.height).toBe(30);
    expect(
      Math.abs(
        (calculateIconBounds?.y ?? 0) +
          (calculateIconBounds?.height ?? 0) / 2 -
          ((totalInputBounds?.y ?? 0) + (totalInputBounds?.height ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(10);
    await page.getByRole('button', { name: 'Meal Type: Select' }).click();
    const mealOptionBounds = await page
      .getByRole('button', { name: 'Dinner', exact: true })
      .boundingBox();
    expect(mealOptionBounds?.height).toBeGreaterThanOrEqual(48);
    await page.keyboard.press('Escape');
    const editorA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(editorA11y.violations).toEqual([]);

    await page.getByLabel('Name').fill('Accessible recipe');
    await selectSinglePicklist(page, 'State', 'Will not try');
    const reasonBounds = await page.getByLabel('Reason').boundingBox();
    const stateTriggerBounds = await page
      .getByRole('button', { name: 'State', exact: true })
      .boundingBox();
    expect(reasonBounds?.height).toBe(stateTriggerBounds?.height);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Accessible recipe' })).toBeVisible();
    const detailA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(detailA11y.violations).toEqual([]);

    await page.getByRole('link', { name: 'Edit recipe' }).click();
    const editA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(editA11y.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});
