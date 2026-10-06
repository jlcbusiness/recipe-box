import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/recipes$/);
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
}, testInfo) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await expect(page.getByRole('link', { name: 'Workspace' })).toHaveCount(0);
    const trashNavLink = page.locator('.private-nav-bottom').getByRole('link', { name: 'Trash' });
    await expect(trashNavLink).toBeVisible();
    const trashNavBounds = await trashNavLink.boundingBox();
    const accountMenuBounds = await page.locator('.account-menu-trigger').boundingBox();
    if (testInfo.project.name === 'Fold 6') {
      expect((trashNavBounds?.x ?? 0) + (trashNavBounds?.width ?? 0)).toBeLessThan(
        accountMenuBounds?.x ?? 0,
      );
    } else {
      expect((trashNavBounds?.y ?? 0) + (trashNavBounds?.height ?? 0)).toBeLessThan(
        accountMenuBounds?.y ?? 0,
      );
    }
    await page.getByRole('link', { name: 'Recipe Tin' }).click();
    await expect(page.getByRole('heading', { name: 'Recipes' })).toBeVisible();
    await expect(page.getByText('Your Recipe Tin is empty.')).toBeVisible();
    const addRecipeLink = page.getByRole('link', { name: 'Add Recipe' });
    await expect(addRecipeLink).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await addRecipeLink.hover();
    await expect(addRecipeLink).toHaveCSS('background-color', 'rgb(56, 96, 68)');
    await addRecipeLink.click();
    await expect(page.getByRole('heading', { name: 'Add Recipe' })).toBeVisible();
    const emptyIngredientPrompt =
      testInfo.project.name === 'Fold 6'
        ? page.locator('.recipe-ingredient-mobile-value .recipe-ingredient-empty-prompt')
        : page.locator('.recipe-ingredient-value-cell.is-empty .recipe-ingredient-empty-prompt');
    await expect(emptyIngredientPrompt).toHaveText('add ingredient');
    await expect(emptyIngredientPrompt).toHaveCSS('font-style', 'italic');
    await expect(emptyIngredientPrompt).toHaveCSS('text-align', 'left');
    expect(
      await emptyIngredientPrompt.evaluate((element) => getComputedStyle(element).fontFamily),
    ).toContain('Georgia');
    const titleFontSize = Number.parseFloat(
      await page
        .getByRole('heading', { name: 'Add Recipe' })
        .evaluate((element) => getComputedStyle(element).fontSize),
    );
    expect(titleFontSize).toBeGreaterThanOrEqual(21);
    expect(titleFontSize).toBeLessThanOrEqual(22);
    if (testInfo.project.name === 'Fold 6') {
      const mainWidth = await page
        .locator('main.recipes-main')
        .evaluate((element) => element.clientWidth);
      expect(
        (await page.locator('.collection-add-action').boundingBox())?.width ?? 0,
      ).toBeGreaterThan(mainWidth * 0.8);
    }
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
    expect(servesBounds?.height).toBe(stateBounds.height);
    await expect(page.getByLabel('Serves')).toHaveCSS('text-align', 'center');
    if (testInfo.project.name === 'Fold 6') {
      expect(servesBounds?.y).toBeGreaterThan(stateBounds.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        352,
      );
    } else {
      expect(Math.abs((servesBounds?.y ?? 0) - stateBounds.y)).toBeLessThanOrEqual(4);
      expect(Math.abs(stateEquipmentBounds.y - stateBounds.y)).toBeLessThanOrEqual(4);
      expect(stateEquipmentBounds.x).toBeGreaterThan(servesBounds?.x ?? 0);
    }
    await expect(page.getByLabel('Serves')).toHaveAttribute('step', '1');
    await expect(page.getByLabel('Serves')).toHaveAttribute('name', 'serves');
    await expect(page.getByRole('button', { name: 'Enthusiasm', exact: true })).toContainText(
      'What am I feeling?',
    );
    expect(foodTypeBounds?.width).toBeLessThanOrEqual(220);
    if (testInfo.project.name === 'Fold 6') {
      expect(foodTypeBounds?.height).toBeGreaterThanOrEqual(48);
    } else {
      expect(foodTypeBounds?.height).toBeLessThanOrEqual(40);
    }
    const formBounds = await page.locator('.recipe-form').boundingBox();
    const notesBounds = await page.getByLabel('Notes (Markdown)').boundingBox();
    expect(Math.abs((notesBounds?.width ?? 0) - (formBounds?.width ?? 0))).toBeLessThanOrEqual(1);
    await expect(page.locator('.recipe-form-fields').first()).toHaveCSS('display', 'flex');
    await selectSinglePicklist(page, 'Food Type', 'Soup');
    await expect(page.getByRole('group', { name: 'Times (min)' })).toBeVisible();
    await expect(page.getByLabel('Serves')).toBeVisible();
    for (const integerInput of await page.locator('.recipe-form input[type="number"]').all()) {
      await expect(integerInput).toHaveCSS('text-align', 'center');
    }
    for (const integerLabel of await page
      .locator('.recipe-form label[for="serves"] > span, .recipe-form .recipe-time-field > span')
      .all()) {
      await expect(integerLabel).toHaveCSS('text-align', 'center');
    }
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
    if (testInfo.project.name === 'Fold 6') {
      expect(mealTriggerBounds?.height).toBeGreaterThanOrEqual(48);
      expect(cuisineTriggerBounds?.height).toBeGreaterThanOrEqual(48);
      expect(equipmentTriggerBounds?.height).toBeGreaterThanOrEqual(48);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        352,
      );
    } else {
      expect(Math.abs((mealTriggerBounds?.y ?? 0) - foodTypeBounds.y)).toBeLessThanOrEqual(4);
      expect(Math.abs((cuisineTriggerBounds?.y ?? 0) - foodTypeBounds.y)).toBeLessThanOrEqual(4);
      expect(Math.abs((equipmentTriggerBounds?.y ?? 0) - stateBounds.y)).toBeLessThanOrEqual(4);
    }
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
    expect(Math.max(...componentTimeBottoms)).toBeLessThan(totalTimeBounds?.y ?? 0);
    const calculateButton = page.getByRole('button', { name: 'Calculate total time' });
    await expect(calculateButton).toHaveText('Σ');
    const totalRow = page.locator('.recipe-time-total-row');
    await expect(totalRow).toBeVisible();
    const calculateBounds = await calculateButton.boundingBox();
    if (testInfo.project.name === 'Fold 6') {
      expect(
        Math.abs(
          (calculateBounds?.y ?? 0) +
            (calculateBounds?.height ?? 0) / 2 -
            ((totalTimeBounds?.y ?? 0) + (totalTimeBounds?.height ?? 0) / 2),
        ),
      ).toBeLessThanOrEqual(8);
      expect(calculateBounds?.width).toBeGreaterThanOrEqual(48);
      expect(calculateBounds?.height).toBeGreaterThanOrEqual(48);
    } else {
      expect(calculateBounds?.y).toBe(totalTimeBounds?.y);
      expect(calculateBounds?.x).toBeGreaterThan(totalTimeBounds?.x ?? 0);
      expect(calculateBounds?.width).toBeLessThanOrEqual(34);
      expect(
        Math.abs((calculateBounds?.width ?? 0) - (calculateBounds?.height ?? 0)),
      ).toBeLessThanOrEqual(1);
    }
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
    const desktopEditLink = page.getByRole('link', { name: 'Edit' });
    await expect(desktopEditLink.locator('svg')).toBeVisible();
    await expect(desktopEditLink).toHaveAttribute('title', 'Edit recipe');
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
    await expect(detailMetadata).toHaveCSS('row-gap', '11px');
    await expect(page.locator('.recipe-detail-classification')).toHaveCSS('margin-top', '11px');
    await expect(page.locator('.recipe-detail-times')).toHaveCSS('margin-top', '11px');
    await expect(page.locator('.recipe-time-list')).toHaveCSS('margin-top', '0px');
    await expect(page.locator('.recipe-time-list dt')).toHaveText(['Prep', 'Mixing', 'Cook']);
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
    await expect(page.getByRole('heading', { name: 'Times', exact: true })).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    const timesSection = page.locator('.recipe-detail-times');
    const timesHeading = page.getByRole('heading', { name: 'Times', exact: true });
    await expect(timesHeading).toBeVisible();
    await expect(timesHeading).toHaveCSS('font-size', '18px');
    await expect(timesHeading).toHaveCSS('color', 'rgb(4, 31, 85)');
    await expect(timesHeading).toHaveCSS('font-variant-caps', 'all-small-caps');
    await expect(timesSection).toHaveCSS('border-top-width', '1px');
    await expect(timesSection).toHaveCSS('border-top-style', 'solid');
    await expect(timesSection).toContainText('Prep');
    await expect(timesSection).not.toContainText('Total time');
    await expect(
      page.locator('.recipe-metadata:not(.recipe-time-list) dt').filter({ hasText: 'Total time' }),
    ).toHaveCount(1);
    await expect(page.getByText('Add fresh basil at the end.')).toBeVisible();
    await page.setViewportSize({ width: 1600, height: 1000 });

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

    const mobileEditLink = page.getByRole('link', { name: 'Edit' });
    await expect(mobileEditLink.locator('svg')).toBeVisible();
    await expect(mobileEditLink).toHaveAttribute('title', 'Edit recipe');
    const mobileTitleBounds = await page
      .getByRole('heading', { name: 'Sunday tomato soup' })
      .boundingBox();
    const mobileEditBounds = await mobileEditLink.boundingBox();
    const mobileHeadingBounds = await page.locator('.recipe-detail-heading').boundingBox();
    expect(mobileEditBounds?.height).toBe(36);
    await expect(mobileEditLink).toHaveCSS('position', 'relative');
    await expect(mobileEditLink).toHaveCSS('height', '36px');
    const mobileEditHitArea = await mobileEditLink.evaluate((element) =>
      getComputedStyle(element, '::before'),
    );
    expect(mobileEditHitArea.position).toBe('absolute');
    expect(mobileEditHitArea.top).toBe('-8px');
    expect(mobileEditHitArea.bottom).toBe('-8px');
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

    await page.getByRole('link', { name: 'Edit' }).click();
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
        p_ingredient_rows: [],
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
      p_ingredient_rows: [],
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

    await firstPage.getByRole('link', { name: 'Edit' }).click();
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

    await page.getByRole('link', { name: 'Add Recipe' }).click();
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
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const editBounds = await page.getByRole('link', { name: 'Edit' }).boundingBox();
      const printBounds = await page.getByRole('button', { name: 'Print' }).boundingBox();
      expect(editBounds?.height).toBe(printBounds?.height);
      expect(editBounds?.width).toBe(printBounds?.width);
      expect(editBounds?.x).toBeGreaterThan(printBounds?.x ?? 0);
      expect(
        await page
          .getByRole('link', { name: 'Edit' })
          .evaluate((element) => getComputedStyle(element).borderRadius),
      ).toBe(
        await page
          .getByRole('button', { name: 'Print' })
          .evaluate((element) => getComputedStyle(element).borderRadius),
      );
    }
    const detailA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(detailA11y.violations).toEqual([]);

    await page.getByRole('link', { name: 'Edit' }).click();
    const editA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(editA11y.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners can save and reload ordered Markdown instruction steps @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Braised chickpeas');
    await expect(page.getByRole('group', { name: 'Instructions' })).toBeVisible();
    const firstInstruction = page.getByRole('textbox', { name: 'Instruction step 1' });
    const initialHeight = (await firstInstruction.boundingBox())?.height ?? 0;
    await firstInstruction.fill(
      'Add the drained chickpeas and stir until each one is coated. '.repeat(8),
    );
    await expect
      .poll(() => firstInstruction.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(initialHeight);
    await firstInstruction.fill('Warm the oil and add **garlic**.');
    await expect(page.getByPlaceholder('Add instruction…')).toBeVisible();
    const instructionDraft = page.getByPlaceholder('Add instruction…');
    await instructionDraft.click();
    await instructionDraft.pressSequentially('Stir in chickpeas and simmer.');
    await expect(page.getByRole('textbox', { name: 'Instruction step 2' })).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    await page.getByRole('textbox', { name: 'Instruction step 2' }).press('Escape');
    await expect(instructionDraft).toBeVisible();
    await expect(page.locator('.recipe-instruction-edit-step')).toHaveCount(2);
    await instructionDraft.pressSequentially('Stir in chickpeas and simmer.');
    await expect(page.getByRole('textbox', { name: 'Instruction step 2' })).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    const typedInstructionBox = await page
      .getByRole('textbox', { name: 'Instruction step 2' })
      .boundingBox();
    expect(typedInstructionBox?.width).toBeGreaterThan(120);
    expect(typedInstructionBox?.height).toBeLessThan(100);
    await expect(page.locator('.recipe-instruction-edit-step')).toHaveCount(3);
    await page.getByRole('textbox', { name: 'Instruction step 2' }).press('Enter');
    const thirdInstruction = page.getByRole('textbox', { name: 'Instruction step 3' });
    await expect(thirdInstruction).toBeFocused();
    await thirdInstruction.pressSequentially('Finish with lemon.');
    await expect(thirdInstruction).toHaveValue('Finish with lemon.');
    await expect(page.locator('.recipe-instruction-edit-step')).toHaveCount(4);
    const fourthDraft = page.getByPlaceholder('Add instruction…');
    await fourthDraft.fill('Let everything rest.');
    await expect(page.getByRole('textbox', { name: 'Instruction step 4' })).toHaveValue(
      'Let everything rest.',
    );
    await expect(page.locator('.recipe-instruction-edit-step')).toHaveCount(5);
    const instructionRows = page.locator('.recipe-instruction-edit-step');
    const firstDragHandle = page.getByRole('button', { name: 'Reorder instruction step 1' });
    const firstDragHandleBox = await firstDragHandle.boundingBox();
    const firstStepId = await instructionRows.nth(0).getAttribute('data-instruction-step-id');
    const secondStepId = await instructionRows.nth(1).getAttribute('data-instruction-step-id');
    const firstStepTop = (await instructionRows.nth(0).boundingBox())?.y;
    const secondInstructionRowBox = await instructionRows.nth(1).boundingBox();
    if (!firstDragHandleBox || !secondInstructionRowBox) {
      throw new Error('Instruction rows are missing drag targets.');
    }
    if (!firstStepId || !secondStepId || firstStepTop === undefined) {
      throw new Error('Instruction rows must have stable IDs and positions.');
    }
    const stableFirstStep = page.locator(
      `.recipe-instruction-edit-step[data-instruction-step-id="${firstStepId}"]`,
    );
    const stableSecondStep = page.locator(
      `.recipe-instruction-edit-step[data-instruction-step-id="${secondStepId}"]`,
    );
    const idleInstructionA11y = await new AxeBuilder({ page })
      .include('.recipe-instruction-editor')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(idleInstructionA11y.violations).toEqual([]);
    await page.mouse.move(
      firstDragHandleBox.x + firstDragHandleBox.width / 2,
      firstDragHandleBox.y + firstDragHandleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      secondInstructionRowBox.x + secondInstructionRowBox.width / 2,
      secondInstructionRowBox.y + secondInstructionRowBox.height / 2,
      { steps: 4 },
    );
    await expect(page.locator('.recipe-instruction-edit-step').nth(0)).toHaveAttribute(
      'data-reorder-state',
      'dragging',
    );
    await expect
      .poll(() =>
        page
          .locator('.recipe-instruction-edit-step[data-reorder-state="dragging"]')
          .evaluate((row) => getComputedStyle(row).transform),
      )
      .not.toBe('none');
    await expect(page.locator('.recipe-instruction-edit-step').nth(1)).toHaveAttribute(
      'data-reorder-state',
      'displaced',
    );
    const draggingInstructionA11y = await new AxeBuilder({ page })
      .include('.recipe-instruction-editor')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(draggingInstructionA11y.violations).toEqual([]);
    await expect(
      page.locator('.recipe-instruction-edit-step[data-reorder-state="dragging"]'),
    ).toHaveCount(1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() =>
        page
          .locator('.recipe-instruction-edit-step[data-reorder-state="displaced"]')
          .evaluate((row) => getComputedStyle(row).transitionDuration),
      )
      .toBe('0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect
      .poll(async () => {
        const bounds = await stableSecondStep.boundingBox();
        return bounds ? Math.abs(bounds.y - firstStepTop) : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(2);
    const firstPreviewTop = (await stableFirstStep.boundingBox())?.y;
    const secondPreviewTop = (await stableSecondStep.boundingBox())?.y;
    expect(firstPreviewTop).toBeDefined();
    expect(secondPreviewTop).toBeDefined();
    await page.mouse.up();
    const firstReleasedTop = (await stableFirstStep.boundingBox())?.y;
    const secondReleasedTop = (await stableSecondStep.boundingBox())?.y;
    expect(firstReleasedTop).toBeDefined();
    expect(secondReleasedTop).toBeDefined();
    expect(Math.abs((firstReleasedTop ?? 0) - (firstPreviewTop ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((secondReleasedTop ?? 0) - (secondPreviewTop ?? 0))).toBeLessThanOrEqual(2);
    await expect(stableFirstStep).toHaveCSS('transform', 'none');
    await expect(stableSecondStep).toHaveCSS('transform', 'none');
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    await expect(instructionRows.nth(0).locator('.recipe-instruction-step-number')).toHaveText('1');
    await expect(instructionRows.nth(0).getByRole('textbox')).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    await expect(instructionRows.nth(1).locator('.recipe-instruction-step-number')).toHaveText('2');
    await expect(instructionRows.nth(1).getByRole('textbox')).toHaveValue(
      'Warm the oil and add **garlic**.',
    );
    const droppedInstructionA11y = await new AxeBuilder({ page })
      .include('.recipe-instruction-editor')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(droppedInstructionA11y.violations).toEqual([]);
    await page.getByRole('textbox', { name: 'Instruction step 1' }).press('Control+ArrowDown');
    await expect(page.locator('.recipe-instruction-editor [aria-live="polite"]')).toHaveText(
      'Instruction step moved to position 2.',
    );
    await page.getByRole('textbox', { name: 'Instruction step 2' }).press('Control+ArrowUp');
    await expect(page.locator('.recipe-instruction-editor [aria-live="polite"]')).toHaveText(
      'Instruction step moved to position 1.',
    );
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    await expect(page.getByRole('textbox', { name: 'Instruction step 2' })).toHaveValue(
      'Warm the oil and add **garlic**.',
    );
    const dragInstructionAndCheckContinuity = async (sourceIndex: number, targetIndex: number) => {
      const sourceRow = instructionRows.nth(sourceIndex);
      const targetRow = instructionRows.nth(targetIndex);
      const sourceId = await sourceRow.getAttribute('data-instruction-step-id');
      const targetId = await targetRow.getAttribute('data-instruction-step-id');
      const sourceHandle = sourceRow.getByRole('button', {
        name: `Reorder instruction step ${sourceIndex + 1}`,
      });
      const handleBounds = await sourceHandle.boundingBox();
      const sourceBounds = await sourceRow.boundingBox();
      const targetBounds = await targetRow.boundingBox();
      if (!sourceId || !targetId || !handleBounds || !sourceBounds || !targetBounds) {
        throw new Error('Instruction rows must be visible for multi-row reordering.');
      }
      const stableSource = page.locator(
        `.recipe-instruction-edit-step[data-instruction-step-id="${sourceId}"]`,
      );
      const displacedIds =
        sourceIndex < targetIndex
          ? Array.from({ length: targetIndex - sourceIndex }, (_, index) => sourceIndex + index + 1)
          : Array.from({ length: sourceIndex - targetIndex }, (_, index) => targetIndex + index);
      const originalTops = new Map(
        await Promise.all(
          displacedIds.map(async (index) => {
            const row = instructionRows.nth(index);
            const id = await row.getAttribute('data-instruction-step-id');
            const bounds = await row.boundingBox();
            if (!id || !bounds) {
              throw new Error('Displaced instruction rows must have stable positions.');
            }
            return [id, bounds.y] as const;
          }),
        ),
      );
      await page.mouse.move(
        handleBounds.x + handleBounds.width / 2,
        handleBounds.y + handleBounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        targetBounds.x + targetBounds.width / 2,
        targetBounds.y + targetBounds.height / 2,
        { steps: 8 },
      );
      await expect(
        page.locator('.recipe-instruction-edit-step[data-reorder-state="displaced"]'),
      ).toHaveCount(Math.abs(targetIndex - sourceIndex));
      const expectedDisplacement = (sourceIndex < targetIndex ? -1 : 1) * sourceBounds.height;
      await expect
        .poll(async () => {
          const differences = await Promise.all(
            Array.from(originalTops, async ([id, top]) => {
              const bounds = await page
                .locator(`.recipe-instruction-edit-step[data-instruction-step-id="${id}"]`)
                .boundingBox();
              return bounds
                ? Math.abs(bounds.y - top - expectedDisplacement)
                : Number.POSITIVE_INFINITY;
            }),
          );
          return Math.max(...differences);
        })
        .toBeLessThanOrEqual(2);
      const previewTops = new Map(
        await Promise.all(
          Array.from(originalTops.keys(), async (id) => {
            const bounds = await page
              .locator(`.recipe-instruction-edit-step[data-instruction-step-id="${id}"]`)
              .boundingBox();
            if (!bounds) {
              throw new Error('Displaced instruction rows must remain visible while dragging.');
            }
            return [id, bounds.y] as const;
          }),
        ),
      );
      const sourcePreviewTop = (await stableSource.boundingBox())?.y;
      expect(sourcePreviewTop).toBeDefined();
      await page.mouse.up();
      const sourceReleasedTop = (await stableSource.boundingBox())?.y;
      expect(sourceReleasedTop).toBeDefined();
      expect(Math.abs((sourceReleasedTop ?? 0) - (sourcePreviewTop ?? 0))).toBeLessThanOrEqual(2);
      for (const [id, previewTop] of previewTops) {
        const releasedTop = (
          await page
            .locator(`.recipe-instruction-edit-step[data-instruction-step-id="${id}"]`)
            .boundingBox()
        )?.y;
        expect(releasedTop).toBeDefined();
        expect(Math.abs((releasedTop ?? 0) - previewTop)).toBeLessThanOrEqual(2);
      }
      await expect(stableSource).toHaveCSS('transform', 'none');
      for (const id of previewTops.keys()) {
        const displaced = page.locator(
          `.recipe-instruction-edit-step[data-instruction-step-id="${id}"]`,
        );
        await expect(displaced).toHaveCSS('transform', 'none');
      }
    };

    await dragInstructionAndCheckContinuity(3, 0);
    await dragInstructionAndCheckContinuity(0, 3);
    const firstStepBeforeCancel = await instructionRows.nth(0).getByRole('textbox').inputValue();
    const cancelHandle = await page
      .getByRole('button', { name: 'Reorder instruction step 1' })
      .boundingBox();
    const cancelTarget = await instructionRows.nth(2).boundingBox();
    if (!cancelHandle || !cancelTarget) {
      throw new Error('Instruction rows must be visible for cancellation.');
    }
    await page.mouse.move(
      cancelHandle.x + cancelHandle.width / 2,
      cancelHandle.y + cancelHandle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cancelTarget.x + cancelTarget.width / 2,
      cancelTarget.y + cancelTarget.height / 2,
      { steps: 4 },
    );
    await expect(
      page.locator('.recipe-instruction-edit-step[data-reorder-state="displaced"]'),
    ).toHaveCount(2);
    await page
      .getByRole('button', { name: 'Reorder instruction step 1' })
      .dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
    await page.mouse.up();
    await expect(page.locator('.recipe-instruction-edit-step[data-reorder-state]')).toHaveCount(0);
    await expect(instructionRows.nth(0).getByRole('textbox')).toHaveValue(firstStepBeforeCancel);
    const escapeDragHandle = page.getByRole('button', { name: 'Reorder instruction step 1' });
    const escapeHandle = await escapeDragHandle.boundingBox();
    const escapeTarget = await instructionRows.nth(2).boundingBox();
    if (!escapeHandle || !escapeTarget) {
      throw new Error('Instruction rows must be visible for Escape cancellation.');
    }
    await escapeDragHandle.focus();
    await page.mouse.move(
      escapeHandle.x + escapeHandle.width / 2,
      escapeHandle.y + escapeHandle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      escapeTarget.x + escapeTarget.width / 2,
      escapeTarget.y + escapeTarget.height / 2,
      { steps: 4 },
    );
    await escapeDragHandle.press('Escape');
    await expect(page.locator('.recipe-instruction-edit-step[data-reorder-state]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reorder instruction step 1' })).toBeFocused();
    await page.mouse.up();
    await expect(instructionRows.nth(0).getByRole('textbox')).toHaveValue(firstStepBeforeCancel);
    const thirdInstructionRow = page
      .locator('.recipe-instruction-edit-step')
      .filter({ has: page.getByRole('textbox', { name: 'Instruction step 3' }) });
    const removeThirdInstruction = page.getByRole('button', {
      name: 'Remove instruction step 3',
    });
    await page.mouse.move(0, 0);
    await expect(removeThirdInstruction).toHaveCSS(
      'opacity',
      testInfo.project.name === 'Fold 6' ? '1' : '0',
    );
    await thirdInstructionRow.hover();
    await expect(removeThirdInstruction).toHaveCSS('opacity', '1');
    await removeThirdInstruction.click();
    await page.getByPlaceholder('Add instruction…').fill('Finish with lemon.');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible();
    const steps = page.locator('.recipe-instruction-list > li');
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toHaveText('Stir in chickpeas and simmer.');
    await expect(steps.nth(1)).toContainText('Warm the oil and add garlic.');
    await expect(steps.nth(1).locator('strong')).toHaveText('garlic');
    await expect(steps.nth(2)).toHaveText('Let everything rest.');
    await expect(steps.nth(3)).toHaveText('Finish with lemon.');

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    await expect(page.getByRole('textbox', { name: 'Instruction step 2' })).toHaveValue(
      'Warm the oil and add **garlic**.',
    );
    await expect(page.getByRole('textbox', { name: 'Instruction step 3' })).toHaveValue(
      'Let everything rest.',
    );
    await expect(page.getByRole('textbox', { name: 'Instruction step 4' })).toHaveValue(
      'Finish with lemon.',
    );
    const persistedFirstInstruction = page.getByRole('textbox', {
      name: 'Instruction step 1',
    });
    await persistedFirstInstruction.fill('Discard this accidental change.');
    await persistedFirstInstruction.press('Escape');
    await expect(persistedFirstInstruction).toHaveValue('Stir in chickpeas and simmer.');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners can create an ingredient mention from an instruction # query @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Iron skillet vegetables');
    const instruction = page.getByPlaceholder('Add instruction…');
    await instruction.pressSequentially('## Heat\n\nAdd #iron');
    const suggestions = page.getByRole('listbox', { name: 'Ingredient suggestions' });
    await expect(suggestions).toBeVisible();
    await expect(suggestions.getByRole('option')).toHaveText('Create ingredient “iron”');
    const focusedInstruction = page.locator('.recipe-instruction-textarea:focus');
    await page.keyboard.press('Enter');
    await expect(focusedInstruction).toHaveValue(/\[\[ingredient:[^|]+\|iron\]\]/);
    await focusedInstruction.fill(
      `${await focusedInstruction.inputValue()} with **care**.\n\n- Stir gently`,
    );
    await expect(page.getByRole('table', { name: 'Recipe ingredients' })).toContainText('iron');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible();
    await expect(
      page.locator('.recipe-instruction-list > li').first().getByRole('heading', { name: 'Heat' }),
    ).toBeVisible();
    const renderedMentionInstruction = page
      .locator('.recipe-instruction-list > li')
      .filter({ has: page.locator('.recipe-instruction-mention') });
    await expect(renderedMentionInstruction.locator('.recipe-instruction-mention')).toHaveText(
      'iron',
    );
    await expect(renderedMentionInstruction.locator('strong')).toHaveText('care');
    await expect(renderedMentionInstruction.locator('ul > li')).toHaveText('Stir gently');
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeVisible();
    await expect(page.locator('.recipe-ingredient-list')).toContainText('iron');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('instruction mentions search the ingredient catalog and render as sentence-aware links @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const catalogIngredient = await request.post(`${config.apiUrl}/rest/v1/ingredients`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      data: { account_id: user.id, name: 'Bread' },
    });
    expect(catalogIngredient.ok(), await catalogIngredient.text()).toBeTruthy();

    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Catalog mention behavior');
    await page.getByPlaceholder('Add instruction…').fill('#');
    const firstStep = page.getByRole('textbox', { name: 'Instruction step 1' });
    const suggestions = page.getByRole('listbox', { name: 'Ingredient suggestions' });
    await expect(suggestions).toHaveCount(0);
    await firstStep.fill('bread');
    await firstStep.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 0));
    await firstStep.pressSequentially('#');
    await expect(firstStep).toHaveValue('#bread');
    await expect(suggestions.getByRole('option')).toHaveText('Bread');
    await expect(suggestions.getByRole('option', { name: /^Create ingredient/ })).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(firstStep).toHaveValue(/^\[\[ingredient:[^|]+\|bread\]\]$/);

    await firstStep.fill('Add #bread');
    await expect(suggestions.getByRole('option')).toHaveText('Bread');
    await expect(suggestions.getByRole('option', { name: /^Create ingredient/ })).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(firstStep).toHaveValue(/\[\[ingredient:[^|]+\|bread\]\]/);
    await firstStep.pressSequentially(' with [the mixing guide](example.test/mixing).');

    await firstStep.press('Enter');
    await page.getByRole('textbox', { name: 'Instruction step 2' }).fill('#');
    const secondStep = page.getByRole('textbox', { name: 'Instruction step 2' });
    await expect(suggestions.getByRole('option')).toHaveText('Bread');
    await expect(suggestions.getByRole('option', { name: /^Create ingredient/ })).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(secondStep).toHaveValue(/\[\[ingredient:[^|]+\|bread\]\]/);

    await secondStep.press('Enter');
    const thirdStep = page.getByRole('textbox', { name: 'Instruction step 3' });
    await thirdStep.fill('Add #miso');
    await expect(
      suggestions.getByRole('option', { name: 'Create ingredient “miso”' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(thirdStep).toHaveValue('Add #miso');

    await page.getByRole('button', { name: 'Save recipe' }).click();
    const steps = page.locator('.recipe-instruction-list > li');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText('Add bread with the mixing guide.');
    const guideLink = steps.nth(0).getByRole('link', { name: 'the mixing guide' });
    await expect(guideLink).toHaveAttribute('href', 'https://example.test/mixing');
    await expect(guideLink).toHaveCSS('color', 'rgb(23, 74, 120)');
    await guideLink.hover();
    await expect(guideLink).toHaveCSS('text-decoration-line', 'underline');
    await expect(steps.nth(1)).toHaveText('Bread');
    await expect(steps.nth(2)).toHaveText('Add #miso');
    await expect(page.locator('.recipe-instruction-list')).toHaveCSS('list-style-type', 'decimal');

    await page.route('https://example.test/mixing', (route) =>
      route.fulfill({ body: '<title>External guide</title>', contentType: 'text/html' }),
    );
    await guideLink.click();
    await expect(page).toHaveURL('https://example.test/mixing');
    await expect(page).toHaveTitle('External guide');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('mobile users can tap an instruction ingredient suggestion @e2e', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'Fold 6',
    'Touch selection is exercised in the Fold 6 project.',
  );

  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const catalogIngredient = await request.post(`${config.apiUrl}/rest/v1/ingredients`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      data: { account_id: user.id, name: 'Paprika' },
    });
    expect(catalogIngredient.ok(), await catalogIngredient.text()).toBeTruthy();

    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Touch-selected ingredient');
    const instruction = page.getByPlaceholder('Add instruction…');
    await instruction.tap();
    await instruction.pressSequentially('Add #paprika');

    const suggestion = page.getByRole('option', { name: 'Paprika' });
    await expect(suggestion).toBeVisible();
    await suggestion.tap();
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      /Add\s+\[\[ingredient:[^|]+\|paprika\]\]/,
    );
    await expect(page.getByRole('table', { name: 'Recipe ingredients' })).toContainText('paprika');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Ctrl+. inserts a degree symbol at the instruction caret @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Oven temperature');
    await page.getByPlaceholder('Add instruction…').fill('Bake at 350F.');
    const instruction = page.getByRole('textbox', { name: 'Instruction step 1' });
    await instruction.evaluate((element: HTMLTextAreaElement) => {
      const insertionPoint = element.value.indexOf('F');
      element.setSelectionRange(insertionPoint, insertionPoint);
    });
    await instruction.press('Control+.');
    await expect(instruction).toHaveValue('Bake at 350°F.');

    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.locator('.recipe-instruction-list > li')).toHaveText('Bake at 350°F.');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('instruction mention suggestions stay in the viewport and Escape preserves literal text @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Responsive mention suggestions');
    await page.setViewportSize({ width: 352, height: 844 });
    const instruction = page.getByPlaceholder('Add instruction…');
    await instruction.pressSequentially('Add #iron');
    const suggestions = page.getByRole('listbox', { name: 'Ingredient suggestions' });
    await expect(suggestions).toBeVisible();

    for (const viewportWidth of [352, 390]) {
      if (viewportWidth === 390) {
        await page.keyboard.press('Escape');
        await page.reload();
        await page.getByLabel('Name').fill('Responsive mention suggestions');
        await page.setViewportSize({ width: viewportWidth, height: 844 });
        await page.getByPlaceholder('Add instruction…').pressSequentially('Add #iron');
        await expect(suggestions).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewportWidth,
      );
      const suggestionBounds = await suggestions.boundingBox();
      expect(suggestionBounds?.x).toBeGreaterThanOrEqual(0);
      expect((suggestionBounds?.x ?? 0) + (suggestionBounds?.width ?? 0)).toBeLessThanOrEqual(
        viewportWidth,
      );
    }

    await page.keyboard.press('Escape');
    await expect(suggestions).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Add #iron',
    );
    await expect(page.getByRole('table', { name: 'Recipe ingredients' })).not.toContainText('iron');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners confirm before removing an ingredient referenced by instructions @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Linked ingredient removal');
    await page.getByPlaceholder('Add instruction…').pressSequentially('Heat #iron');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await page.getByRole('link', { name: 'Edit' }).click();

    const ingredientGrid = page.getByRole('table', { name: 'Recipe ingredients' });
    const deleteIngredient = page.getByRole('button', { name: 'Delete ingredient row 1' });
    await ingredientGrid.getByRole('row').nth(1).hover();
    await deleteIngredient.click();
    const confirmation = page.getByRole('dialog', { name: 'Remove ingredient?' });
    await expect(confirmation).toContainText('ordinary # text');
    const dialogA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(dialogA11y.violations).toEqual([]);
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(deleteIngredient).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      /\[\[ingredient:[^|]+\|iron\]\]/,
    );
    await expect(ingredientGrid).toContainText('iron');

    await deleteIngredient.click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(ingredientGrid).toContainText('iron');

    await ingredientGrid.getByRole('row').nth(1).hover();
    await deleteIngredient.click();
    await confirmation.getByRole('button', { name: 'Remove ingredient' }).click();
    await expect(ingredientGrid).not.toContainText('iron');
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Heat #iron',
    );
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.locator('.recipe-instruction-list > li')).toHaveText('Heat #iron');
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners can move a recipe to Trash and restore it @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Recipe Tin' }).click();
    await page.getByRole('link', { name: 'Add Recipe' }).click();
    await page.getByLabel('Name').fill('A recipe to restore');
    await page.getByLabel('Notes (Markdown)').fill('Keep these notes after restoration.');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'A recipe to restore' })).toBeVisible();
    const recipeId = new URL(page.url()).pathname.split('/').at(-1);
    if (!recipeId) {
      throw new Error('The saved recipe route must include its stable ID.');
    }

    const deleteRecipe = page.getByRole('button', { name: 'Delete', exact: true });
    await expect(page.getByRole('button', { name: 'Delete recipe' })).toHaveCount(0);
    const detailA11y = await new AxeBuilder({ page }).analyze();
    expect(detailA11y.violations).toEqual([]);
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();
    await expect(deleteRecipe).toBeVisible({ timeout: 1_000 });
    if (testInfo.project.name !== 'Fold 6') {
      await deleteRecipe.hover();
      await expect(deleteRecipe).toHaveCSS('background-color', 'rgb(180, 62, 50)');
      await expect(deleteRecipe).toHaveCSS('color', 'rgb(255, 255, 255)');
    }
    await deleteRecipe.click();
    const confirmation = page.getByRole('dialog', { name: 'Move recipe to Trash?' });
    await expect(confirmation).toContainText('30 days');
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    const dialogA11y = await new AxeBuilder({ page }).analyze();
    expect(dialogA11y.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();

    await deleteRecipe.click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to view' }).click();
    await expect(page.getByRole('heading', { name: 'A recipe to restore' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Move recipe to Trash?' })
      .getByRole('button', { name: 'Move to Trash' })
      .click();
    await expect(page).toHaveURL(/\/recipes\?status=trashed$/);
    await expect(page.getByRole('status')).toContainText('Recipe moved to Trash');
    expect((await page.request.get(`/recipes/${recipeId}`)).status()).toBe(404);
    expect((await page.request.get(`/recipes/${recipeId}/edit`)).status()).toBe(404);
    await page.goto(`/recipes/${recipeId}`);
    await expect(page.getByRole('heading', { name: 'Recipe not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Recipes' }).click();
    await page.getByRole('link', { name: 'Trash', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();
    const trashedRow = page.getByRole('row', { name: /A recipe to restore/ });
    await expect(trashedRow).toBeVisible();
    await expect(trashedRow.locator('td').nth(1)).not.toBeEmpty();
    await expect(trashedRow.locator('td').nth(2)).not.toBeEmpty();
    const populatedTrashA11y = await new AxeBuilder({ page }).analyze();
    expect(populatedTrashA11y.violations).toEqual([]);

    const restoreButton = trashedRow.getByRole('button', { name: 'Restore A recipe to restore' });
    if (testInfo.project.name !== 'Fold 6') {
      await expect(restoreButton).toHaveCSS('opacity', '0');
      await trashedRow.hover();
      await expect(restoreButton).toHaveCSS('opacity', '1');
      await restoreButton.focus();
    }
    for (const width of [352, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await expect(restoreButton).toHaveCSS('opacity', '1');
    }
    if (testInfo.project.name === 'Fold 6') {
      const restoreBounds = await page
        .getByRole('button', { name: 'Restore A recipe to restore' })
        .boundingBox();
      expect(restoreBounds?.height).toBeGreaterThanOrEqual(48);
    }
    await page.getByRole('button', { name: 'Restore A recipe to restore' }).click();

    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'A recipe to restore' })).toBeVisible();
    await expect(page.getByText('Keep these notes after restoration.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Keep these notes after restoration.')).toBeVisible();
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();
    const editDeleteButton = page.getByRole('button', { name: 'Delete', exact: true });
    await expect(editDeleteButton).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(editDeleteButton).toHaveCSS('color', 'rgb(180, 62, 50)');
    await expect(editDeleteButton).toHaveCSS('border-radius', '6px');
    await expect(page.getByRole('link', { name: 'Back to view' })).toBeVisible();
    await expect(page.getByLabel('Notes (Markdown)')).toHaveValue(
      'Keep these notes after restoration.',
    );
    await page.getByRole('link', { name: 'Recipe Tin', exact: true }).click();
    await expect(page.getByRole('link', { name: 'A recipe to restore' })).toBeVisible();
    await page.getByRole('link', { name: 'Trash', exact: true }).click();
    await expect(page.getByText('Trash is empty. Deleted recipes appear here.')).toBeVisible();
    const emptyTrashA11y = await new AxeBuilder({ page }).analyze();
    expect(emptyTrashA11y.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipe detail print matches the Standard view @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const ingredientRowId = randomUUID();
  const stepId = randomUUID();

  try {
    const saved = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'A recipe to print',
        p_food_type_id: null,
        p_state: 'want_to_try',
        p_verdict_id: null,
        p_enthusiasm_id: null,
        p_occasion_details: null,
        p_reason: null,
        p_serves: 4,
        p_prep_time_minutes: 15,
        p_mixing_time_minutes: null,
        p_marinate_time_minutes: null,
        p_chill_time_minutes: null,
        p_freeze_time_minutes: null,
        p_cook_time_minutes: 30,
        p_bake_time_minutes: null,
        p_cooling_time_minutes: null,
        p_rest_time_minutes: null,
        p_total_time_minutes: 45,
        p_notes_markdown: 'Serve warm.',
        p_meal_type_ids: [],
        p_cuisine_ids: [],
        p_equipment_ids: [],
        p_ingredient_rows: [
          {
            recipe_ingredient_id: ingredientRowId,
            ingredient_id: null,
            ingredient_name: 'Flour',
            is_main: true,
            detail: 'All-purpose',
            preparation: 'Sifted',
            measurements: [
              {
                measurement_type: 'volume',
                amount_min: 1.5,
                amount_max: null,
                unit_code: 'cup',
                picklist_value_id: null,
              },
            ],
          },
        ],
        p_instruction_steps: [
          {
            id: stepId,
            position: 0,
            content_markdown: `Mix [[ingredient:${ingredientRowId}|flour]].`,
            plain_text: 'Mix flour.',
          },
        ],
      },
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();

    await signIn(page, user.email, user.password);
    await page.goto(`/recipes/${(await saved.json())[0].id}`);
    await expect(page.getByRole('heading', { name: 'A recipe to print' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
    const printIngredient = page.locator('.recipe-ingredient-list li').first();
    const ingredientText = '1 1/2 cups all-purpose flour, sifted';
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(ingredientText);
    await expect(page.getByText('Mix flour.')).toBeVisible();
    await page.addInitScript(() => {
      window.print = () => {
        document.documentElement.dataset.printRequested = 'true';
      };
    });
    await page.reload();
    await page.getByRole('button', { name: 'Print' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');

    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Edit' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'A recipe to print' })).toBeVisible();
    await expect(page.getByText('Serve warm.')).toBeVisible();
    await expect(page.getByText('Mix flour.')).toBeVisible();
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(ingredientText);
    await expect(page.locator('.recipe-detail-section').first()).toHaveCSS('break-inside', 'avoid');
    const pdf = await page.pdf();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(1_000);
  } finally {
    await deleteTestUser(request, user);
  }
});
