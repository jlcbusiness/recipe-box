import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications$/);
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

test('ingredient Settings saves and clears nutrition in the shared pane @e2e @a11y @nutrition', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
  const ingredientName = 'Nutrition Pane Flour';

  try {
    const addIngredient = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers,
        data: {
          p_action: 'add',
          p_expected_revision: 1,
          p_name: ingredientName,
        },
      },
    );
    expect(addIngredient.ok(), await addIngredient.text()).toBeTruthy();
    const ingredientResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id&name=eq.${encodeURIComponent(ingredientName)}`,
      { headers },
    );
    expect(ingredientResponse.ok(), await ingredientResponse.text()).toBeTruthy();
    const [ingredient] = await ingredientResponse.json();
    expect(ingredient?.id).toBeTruthy();

    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Recipe data' }).click();
    const section = page.getByRole('region', { name: 'Ingredients' });
    await section.getByRole('button', { name: 'Ingredients', exact: true }).click();
    const trigger = section.getByRole('button', { name: `Nutrition for ${ingredientName}` });
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: `Nutrition for ${ingredientName}` });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Serving size amount', { exact: true }).fill('1');
    await dialog.getByLabel(/Calories/u).fill('360');
    await dialog.getByLabel(/Protein/u).fill('12');
    const zeroEmpty = dialog.getByRole('button', { name: 'Zero Empty Fields' });
    await zeroEmpty.click();
    await expect(dialog.getByLabel('Sodium', { exact: true })).toHaveValue('0');
    await expect(dialog.getByLabel('Potassium', { exact: true })).toHaveValue('0');
    await expect(dialog.getByLabel(/Protein/u)).toHaveValue('12');
    await expect(zeroEmpty).toBeDisabled();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(section.getByRole('status')).toHaveText('Nutrition data saved.');

    await trigger.click();
    await expect(dialog.getByLabel('Serving size amount', { exact: true })).toHaveValue('1');
    await expect(dialog.getByLabel(/Calories/u)).toHaveValue('360');
    await expect(dialog.getByLabel(/Protein/u)).toHaveValue('12');
    await expect(
      dialog.getByLabel(/Calories/u).locator('xpath=ancestor::div[contains(@class, "factRow")]'),
    ).not.toHaveClass(/autoField/u);
    const desktopBounds = await dialog.boundingBox();
    expect(desktopBounds).not.toBeNull();
    expect(desktopBounds?.x).toBeGreaterThanOrEqual(0);
    expect((desktopBounds?.x ?? 0) + (desktopBounds?.width ?? 0)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? 0,
    );
    if (testInfo.project.name === 'chromium') {
      const screenshot = testInfo.outputPath('nutrition-settings-desktop.png');
      await page.screenshot({ path: screenshot, fullPage: true });
      await testInfo.attach('nutrition-settings-desktop', {
        path: screenshot,
        contentType: 'image/png',
      });
    }

    await page.setViewportSize({ width: 384, height: 915 });
    await expect(dialog).toBeVisible();
    const mobileBounds = await dialog.boundingBox();
    expect(mobileBounds).not.toBeNull();
    expect(mobileBounds?.x).toBeGreaterThanOrEqual(0);
    expect((mobileBounds?.x ?? 0) + (mobileBounds?.width ?? 0)).toBeLessThanOrEqual(384);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    const mobileScreenshot = testInfo.outputPath('nutrition-settings-mobile.png');
    await page.screenshot({ path: mobileScreenshot, fullPage: true });
    await testInfo.attach('nutrition-settings-mobile', {
      path: mobileScreenshot,
      contentType: 'image/png',
    });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(section.getByRole('status')).toHaveText('Nutrition data removed.');
    const profileResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredient_nutrition_profiles?select=ingredient_id&ingredient_id=eq.${ingredient.id}`,
      { headers },
    );
    expect(profileResponse.ok(), await profileResponse.text()).toBeTruthy();
    expect(await profileResponse.json()).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('database bundles round-trip nutrition profiles and measure equivalents @e2e @nutrition', async ({
  browser,
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const sourceUser = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${sourceUser.accessToken}`,
  };
  const requestedIngredientName = `Nutrition bundle ingredient ${randomUUID()}`;
  let destinationUser: Awaited<ReturnType<typeof createTestUser>> | undefined;
  let destinationPage: Page | undefined;

  try {
    const addIngredient = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers,
        data: {
          p_action: 'add',
          p_expected_revision: 1,
          p_name: requestedIngredientName,
        },
      },
    );
    expect(addIngredient.ok(), await addIngredient.text()).toBeTruthy();
    const ingredientResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id,name,account_id&account_id=eq.${sourceUser.id}`,
      { headers },
    );
    expect(ingredientResponse.ok(), await ingredientResponse.text()).toBeTruthy();
    const ingredients = (await ingredientResponse.json()) as Array<{
      id: string;
      name: string;
    }>;
    const ingredient = ingredients.find(
      (row) => row.name.toLocaleLowerCase() === requestedIngredientName.toLocaleLowerCase(),
    );
    if (!ingredient?.id) {
      throw new Error(`Created ingredient was not returned: ${JSON.stringify(ingredients)}`);
    }
    const ingredientName = ingredient.name;

    await signIn(page, sourceUser.email, sourceUser.password);
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Recipe data' }).click();
    const ingredientSection = page.getByRole('region', { name: 'Ingredients' });
    await ingredientSection.getByRole('button', { name: 'Ingredients', exact: true }).click();
    await ingredientSection
      .getByRole('button', { name: `Nutrition for ${ingredientName}` })
      .click();

    const nutritionDialog = page.getByRole('dialog', {
      name: `Nutrition for ${ingredientName}`,
    });
    await nutritionDialog.getByLabel('Serving size amount', { exact: true }).fill('1');
    await expect(
      nutritionDialog.getByRole('combobox', { name: 'Serving size unit' }),
    ).toContainText('cup');
    await nutritionDialog.getByLabel('Calories', { exact: true }).fill('248');
    await nutritionDialog.getByLabel('Protein', { exact: true }).fill('9');
    await nutritionDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(ingredientSection.getByRole('status')).toHaveText('Nutrition data saved.');

    await ingredientSection
      .getByRole('button', { name: `Measure equivalent for ${ingredientName}` })
      .click();
    const equivalentDialog = page.locator('dialog').filter({ hasText: 'Average measures' });
    await expect(equivalentDialog).toBeVisible();
    await equivalentDialog.getByLabel('Average volume amount').fill('2.5');
    await equivalentDialog.getByLabel('Average weight amount').fill('150');
    await equivalentDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(ingredientSection.getByRole('status')).toHaveText('Measure equivalent saved.');

    await page.goto('/account/app-data');
    const dataManagement = page.getByRole('region', { name: 'App data' });
    const exportButton = dataManagement.getByRole('button', { name: 'Export database' });
    const exportDownload = page.waitForEvent('download');
    if (testInfo.project.name === 'Fold 6') {
      await exportButton.tap();
    } else {
      await exportButton.click();
    }
    const download = await exportDownload;
    expect(download.suggestedFilename()).toBe('Recipe Box - Database Export.zip');
    const archivePath = await download.path();
    if (!archivePath) throw new Error('Expected the database export to be downloaded.');
    const archive = await readFile(archivePath);
    const exportedFiles = unzipSync(archive);
    const dataFile = exportedFiles['data.json'];
    if (!dataFile) throw new Error('The database export is missing data.json.');
    const portableData = JSON.parse(new TextDecoder().decode(dataFile)) as {
      records: {
        ingredient_nutrition_profiles: Array<{
          ingredient_id: string;
          serving_size_amount: number;
          serving_size_dimension: string;
          serving_size_unit_code: string;
          nutrients: Record<string, number>;
        }>;
        ingredient_measure_equivalents: Array<{
          ingredient_id: string;
          measurement_type: string;
          volume_amount: number | null;
          volume_unit_code: string | null;
          weight_amount: number | null;
          weight_unit_code: string | null;
        }>;
      };
    };
    expect(
      portableData.records.ingredient_nutrition_profiles.find(
        (profile) => profile.ingredient_id === ingredient.id,
      ),
    ).toMatchObject({
      serving_size_amount: 1,
      serving_size_dimension: 'volume',
      serving_size_unit_code: 'cup',
      nutrients: { calories: 248, protein: 9 },
    });
    expect(
      portableData.records.ingredient_measure_equivalents.find(
        (equivalent) => equivalent.ingredient_id === ingredient.id,
      ),
    ).toMatchObject({
      measurement_type: 'count',
      volume_amount: 2.5,
      volume_unit_code: 'cup',
      weight_amount: 150,
      weight_unit_code: 'g',
    });

    destinationUser = await createTestUser(request);
    const destinationContext = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001',
    });
    destinationPage = await destinationContext.newPage();
    await signIn(destinationPage, destinationUser.email, destinationUser.password);
    await destinationPage.goto('/account/app-data');
    const destinationDataManagement = destinationPage.getByRole('region', {
      name: 'App data',
    });
    await destinationDataManagement.getByRole('button', { name: 'Import database' }).click();
    const importDialog = destinationDataManagement.getByRole('dialog', {
      name: 'Import database',
    });
    await importDialog.getByLabel('Database archive').setInputFiles({
      name: 'nutrition-database-export.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    await expect(importDialog.getByRole('region', { name: 'Import details' })).toBeVisible();
    await expect(importDialog.locator('.database-import-feedback[role="status"]')).toHaveText(
      'Preview ready.',
    );
    await importDialog
      .getByRole('group', { name: 'Account settings' })
      .getByLabel('Use settings from this archive')
      .check();
    await importDialog.getByRole('button', { name: 'Import database' }).click();
    await expect(importDialog).not.toBeVisible();
    await expect(destinationDataManagement.getByRole('status')).toHaveText('Import complete.');

    await destinationPage.goto('/settings');
    await destinationPage.getByRole('tab', { name: 'Recipe data' }).click();
    const importedIngredientSection = destinationPage.getByRole('region', {
      name: 'Ingredients',
    });
    await importedIngredientSection
      .getByRole('button', { name: 'Ingredients', exact: true })
      .click();
    await importedIngredientSection
      .getByRole('button', { name: `Nutrition for ${ingredientName}` })
      .click();
    const importedNutritionDialog = destinationPage.getByRole('dialog', {
      name: `Nutrition for ${ingredientName}`,
    });
    await expect(
      importedNutritionDialog.getByLabel('Serving size amount', { exact: true }),
    ).toHaveValue('1');
    await expect(
      importedNutritionDialog.getByRole('combobox', { name: 'Serving size unit' }),
    ).toContainText('cup');
    await expect(importedNutritionDialog.getByLabel('Calories', { exact: true })).toHaveValue(
      '248',
    );
    await expect(importedNutritionDialog.getByLabel('Protein', { exact: true })).toHaveValue('9');
    await importedNutritionDialog.getByRole('button', { name: 'Close nutrition' }).click();

    await importedIngredientSection
      .getByRole('button', { name: `Measure equivalent for ${ingredientName}` })
      .click();
    const importedEquivalentDialog = destinationPage
      .locator('dialog')
      .filter({ hasText: 'Average measures' });
    await expect(importedEquivalentDialog).toBeVisible();
    await expect(
      importedEquivalentDialog.getByRole('combobox', { name: 'Recipe measurement' }),
    ).toContainText('Count');
    await expect(importedEquivalentDialog.getByLabel('Average volume amount')).toHaveValue('2.5');
    await expect(
      importedEquivalentDialog.getByRole('combobox', { name: 'Average volume unit' }),
    ).toContainText('cup');
    await expect(importedEquivalentDialog.getByLabel('Average weight amount')).toHaveValue('150');
    await expect(
      importedEquivalentDialog.getByRole('combobox', { name: 'Average weight unit' }),
    ).toContainText('g');
  } finally {
    await destinationPage?.context().close();
    if (destinationUser) await deleteTestUser(request, destinationUser);
    await deleteTestUser(request, sourceUser);
  }
});

test('recipe nutrition inherits ingredient defaults and edits per-serving values @e2e @nutrition', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip((page.viewportSize()?.width ?? 1280) <= 720, 'Desktop ingredient grid workflow.');
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
  const ingredientName = 'Nutrition Calculation Flour';

  try {
    const addIngredient = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers,
        data: {
          p_action: 'add',
          p_expected_revision: 1,
          p_name: ingredientName,
        },
      },
    );
    expect(addIngredient.ok(), await addIngredient.text()).toBeTruthy();
    const revision = await addIngredient.json();
    const ingredientResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id&name=eq.${encodeURIComponent(ingredientName)}`,
      { headers },
    );
    expect(ingredientResponse.ok(), await ingredientResponse.text()).toBeTruthy();
    const [ingredient] = await ingredientResponse.json();
    expect(ingredient?.id).toBeTruthy();
    const profileResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`,
      {
        headers,
        data: {
          p_action: 'profile_set',
          p_expected_revision: revision,
          p_ingredient_id: ingredient.id,
          p_profile: {
            servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
            nutrients: {
              calories: 360,
              total_fat: 2,
              saturated_fat: 0,
              trans_fat: 0,
              cholesterol: 0,
              sodium: 4,
              total_carbohydrate: 76,
              dietary_fiber: 3,
              total_sugars: 0,
              added_sugars: 0,
              protein: 14.7,
              vitamin_d: 0,
              calcium: 15,
              iron: 4,
              potassium: 955,
            },
          },
          p_equivalent: null,
        },
      },
    );
    expect(profileResponse.ok(), await profileResponse.text()).toBeTruthy();
    const profileRevision = (await profileResponse.json()) as number;

    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Nutrition calculation recipe');
    const serves = page.getByLabel('Serves');
    await serves.fill('4');
    const editRecipeNutrition = page.getByRole('button', { name: 'Edit recipe nutrition' });
    await serves.fill('');
    await expect(editRecipeNutrition).toBeDisabled();
    await expect(
      page.getByText('Enter a positive Serves value to calculate or edit nutrition per serving.'),
    ).toBeVisible();
    await serves.fill('4');
    await expect(editRecipeNutrition).toBeEnabled();
    const grid = page.getByRole('table', { name: 'Recipe ingredients', exact: true });
    await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
    const ingredientInput = page.getByRole('combobox', { name: 'Ingredient, row 1' });
    await ingredientInput.fill(ingredientName);
    await page.getByRole('option', { name: ingredientName, exact: true }).click();
    await ingredientInput.press('Tab');
    const volumeAmount = page.getByRole('textbox', { name: 'Volume amount, row 1' });
    await volumeAmount.fill('2');
    await expect(volumeAmount).toHaveValue('2');
    await page.getByRole('combobox', { name: 'Volume unit, row 1' }).click();
    await page.getByRole('listbox').getByRole('option', { name: 'cup', exact: true }).click();
    await expect(volumeAmount).toHaveValue('2');

    const rowNutrition = page.getByRole('button', {
      name: `Nutrition for ${ingredientName}: complete`,
    });
    await expect(rowNutrition).toHaveClass(/recipe-ingredient-nutrition-complete/u);
    const estimate = page.locator('.recipe-nutrition-editor');
    await expect(estimate).toContainText('Estimated per serving: Calories: 180');
    await rowNutrition.click();
    const ingredientDialog = page.getByRole('dialog', { name: `Nutrition for ${ingredientName}` });
    const ingredientPaneA11y = await new AxeBuilder({ page }).analyze();
    expect(ingredientPaneA11y.violations).toEqual([]);
    const inheritedCalories = ingredientDialog.getByLabel('Calories, from ingredient Settings');
    await expect(inheritedCalories).toHaveValue('360');
    await expect(
      inheritedCalories.locator('xpath=ancestor::div[contains(@class, "factRow")]'),
    ).toHaveClass(/autoField/u);
    const inheritedProtein = ingredientDialog.getByLabel('Protein, from ingredient Settings');
    const inheritedPotassium = ingredientDialog.getByLabel('Potassium, from ingredient Settings');
    await expect(inheritedProtein).toHaveValue('14.7');
    await expect(inheritedPotassium).toHaveValue('955');
    const desktopViewport = page.viewportSize();
    if (!desktopViewport) throw new Error('Expected a desktop viewport.');
    const desktopProteinWidth = await inheritedProtein.evaluate(
      (input) => input.getBoundingClientRect().width,
    );
    const desktopPotassiumWidth = await inheritedPotassium.evaluate(
      (input) => input.getBoundingClientRect().width,
    );
    expect(desktopProteinWidth).toBe(desktopPotassiumWidth);
    await page.setViewportSize({ width: 384, height: 915 });
    const mobileProteinWidth = await inheritedProtein.evaluate(
      (input) => input.getBoundingClientRect().width,
    );
    const mobilePotassiumWidth = await inheritedPotassium.evaluate(
      (input) => input.getBoundingClientRect().width,
    );
    expect(mobileProteinWidth).toBe(mobilePotassiumWidth);
    await page.setViewportSize(desktopViewport);
    const mainCheckbox = page
      .getByRole('group', { name: 'Ingredient row controls' })
      .getByRole('checkbox', { name: 'Main, row 1' });
    const wasMain = await mainCheckbox.isChecked();
    await ingredientDialog.getByLabel('Protein, from ingredient Settings').fill('14');
    await expect(ingredientDialog.getByLabel('Protein', { exact: true })).toHaveValue('14');
    await ingredientDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(ingredientDialog).toBeHidden();
    expect(await mainCheckbox.isChecked()).toBe(wasMain);

    await editRecipeNutrition.click();
    const recipeDialog = page.getByRole('dialog', { name: 'Nutrition for This recipe' });
    await expect(recipeDialog).toContainText('Amounts per serving');
    const recipePaneA11y = await new AxeBuilder({ page }).analyze();
    expect(recipePaneA11y.violations).toEqual([]);
    const dialogScrollSizeBeforeTooltip = await recipeDialog.evaluate((dialog) => ({
      height: dialog.scrollHeight,
      width: dialog.scrollWidth,
    }));
    const caloriesBreakdownTrigger = recipeDialog.getByRole('button', {
      name: 'Show Calories ingredient calculation',
    });
    await caloriesBreakdownTrigger.hover();
    const caloriesBreakdown = recipeDialog.getByRole('tooltip', {
      name: 'Calories ingredient calculation',
    });
    await expect(caloriesBreakdown).toBeVisible();
    const tooltipBounds = await caloriesBreakdown.boundingBox();
    if (!tooltipBounds) throw new Error('Expected the ingredient calculation tooltip to render.');
    expect(tooltipBounds.x).toBeGreaterThanOrEqual(0);
    expect(tooltipBounds.y).toBeGreaterThanOrEqual(0);
    expect(tooltipBounds.x + tooltipBounds.width).toBeLessThanOrEqual(desktopViewport.width);
    expect(tooltipBounds.y + tooltipBounds.height).toBeLessThanOrEqual(desktopViewport.height);
    await expect
      .poll(() =>
        recipeDialog.evaluate((dialog) => ({
          height: dialog.scrollHeight,
          width: dialog.scrollWidth,
        })),
      )
      .toEqual(dialogScrollSizeBeforeTooltip);
    const caloriesBreakdownRow = caloriesBreakdown.getByRole('row').nth(1);
    await expect(caloriesBreakdownRow).toContainText('Nutrition Calculation Flour');
    await expect(caloriesBreakdownRow).toContainText('360');
    await expect(caloriesBreakdownRow).toContainText('2');
    await expect(caloriesBreakdownRow).toContainText('720');
    await caloriesBreakdownTrigger.focus();
    await page.keyboard.press('Escape');
    await expect(caloriesBreakdown).toBeHidden();
    await expect(recipeDialog).toBeVisible();
    const calculatedCalories = recipeDialog.getByLabel('Calories, calculated from ingredients');
    await expect(calculatedCalories).toHaveValue('180');
    const desktopDialogBounds = await recipeDialog.boundingBox();
    expect(desktopDialogBounds).not.toBeNull();
    expect(desktopDialogBounds?.x).toBeGreaterThanOrEqual(0);
    expect((desktopDialogBounds?.x ?? 0) + (desktopDialogBounds?.width ?? 0)).toBeLessThanOrEqual(
      desktopViewport.width,
    );
    if (testInfo.project.name === 'chromium') {
      await testInfo.attach('recipe-nutrition-per-serving-desktop', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
    await page.setViewportSize({ width: 384, height: 915 });
    await expect(recipeDialog).toBeVisible();
    const mobileDialogScrollSizeBeforeTooltip = await recipeDialog.evaluate((dialog) => ({
      height: dialog.scrollHeight,
      width: dialog.scrollWidth,
    }));
    await caloriesBreakdownTrigger.hover();
    await expect(caloriesBreakdown).toBeVisible();
    const mobileTooltipBounds = await caloriesBreakdown.boundingBox();
    if (!mobileTooltipBounds)
      throw new Error('Expected the ingredient calculation tooltip to render.');
    expect(mobileTooltipBounds.x).toBeGreaterThanOrEqual(0);
    expect(mobileTooltipBounds.y).toBeGreaterThanOrEqual(0);
    expect(mobileTooltipBounds.x + mobileTooltipBounds.width).toBeLessThanOrEqual(384);
    expect(mobileTooltipBounds.y + mobileTooltipBounds.height).toBeLessThanOrEqual(915);
    await expect
      .poll(() =>
        recipeDialog.evaluate((dialog) => ({
          height: dialog.scrollHeight,
          width: dialog.scrollWidth,
        })),
      )
      .toEqual(mobileDialogScrollSizeBeforeTooltip);
    await page.keyboard.press('Escape');
    await expect(caloriesBreakdown).toBeHidden();
    const mobileDialogBounds = await recipeDialog.boundingBox();
    expect(mobileDialogBounds).not.toBeNull();
    expect(mobileDialogBounds?.x).toBeGreaterThanOrEqual(0);
    expect((mobileDialogBounds?.x ?? 0) + (mobileDialogBounds?.width ?? 0)).toBeLessThanOrEqual(
      384,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    if (testInfo.project.name === 'chromium') {
      await testInfo.attach('recipe-nutrition-per-serving-mobile', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
    await page.setViewportSize(desktopViewport);
    await calculatedCalories.fill('200');
    await recipeDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(recipeDialog).toBeHidden();
    await expect(estimate).toContainText('Estimated per serving: Calories: 200');
    await editRecipeNutrition.click();
    await expect(recipeDialog.getByLabel('Calories', { exact: true })).toHaveValue('200');
    await expect(
      recipeDialog
        .getByLabel('Calories', { exact: true })
        .locator('xpath=ancestor::div[contains(@class, "factRow")]'),
    ).not.toHaveClass(/autoField/u);
    await recipeDialog.getByRole('button', { name: 'Cancel', exact: true }).click();

    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Nutrition calculation recipe' })).toBeVisible();
    const nutritionSection = page.getByRole('region', { name: 'Nutrition Per Serving' });
    await expect(nutritionSection).toContainText('Calories: 200');
    const recipeId = new URL(page.url()).pathname.split('/').filter(Boolean).at(-1);
    if (!recipeId) throw new Error('Expected the saved recipe URL to include its recipe ID.');
    const recipeHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,after_data&record_id=eq.${recipeId}&order=created_at.desc&limit=1`,
      { headers },
    );
    expect(recipeHistoryResponse.ok(), await recipeHistoryResponse.text()).toBeTruthy();
    const [recipeHistory] = (await recipeHistoryResponse.json()) as Array<{
      after_data: {
        ingredients: Array<{ nutrition_overrides: Record<string, { value: number }> }>;
        nutrition_overrides: Record<string, number>;
      };
      event_type: string;
    }>;
    expect(recipeHistory?.event_type).toBe('recipe.created');
    expect(recipeHistory?.after_data.nutrition_overrides).toMatchObject({ calories: 800 });
    expect(recipeHistory?.after_data.ingredients[0]?.nutrition_overrides).toMatchObject({
      protein: { value: 14 },
    });
    const nutritionValuesResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/recipe_explorer_nutrition`,
      { headers, data: { p_recipe_ids: [recipeId] } },
    );
    expect(nutritionValuesResponse.ok(), await nutritionValuesResponse.text()).toBeTruthy();
    const [nutritionValues] = await nutritionValuesResponse.json();
    expect(nutritionValues).toMatchObject({
      recipe_id: recipeId,
      nutrition_values: { calories: 200, protein: 7, potassium: 478 },
    });
    const nutrientSearchResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/search_recipes`,
      {
        headers,
        data: {
          p_query: null,
          p_limit: 10,
          p_offset: 0,
          p_filters: [
            { field: 'protein', operator: 'equals', value: 7 },
            { field: 'calories', operator: 'equals', value: 200 },
          ],
          p_sort_key: 'protein',
          p_sort_direction: 'desc',
          p_publication_id: null,
        },
      },
    );
    expect(nutrientSearchResponse.ok(), await nutrientSearchResponse.text()).toBeTruthy();
    const nutrientSearchResults = await nutrientSearchResponse.json();
    expect(nutrientSearchResults).toHaveLength(1);
    expect(nutrientSearchResults[0]).toMatchObject({
      recipe_id: recipeId,
      recipe_name: 'Nutrition calculation recipe',
      total_count: 1,
    });

    await page.goto('/recipes/find?tab=query');
    await page.getByRole('button', { name: 'Add rule' }).click();
    const queryRow = page.locator('.recipe-filter-row').first();
    await queryRow.getByRole('combobox', { name: 'Field' }).click();
    await page.getByRole('option', { name: 'Protein', exact: true }).click();
    await queryRow.getByRole('combobox', { name: 'Operator' }).click();
    await page.getByRole('option', { name: '=', exact: true }).click();
    await queryRow.getByLabel('Value').fill('7');
    await page.getByRole('button', { name: 'apply', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('1 recipe found');
    const queryResultRow = page
      .locator('.find-recipes-list tbody tr')
      .filter({ hasText: 'Nutrition calculation recipe' });
    await expect(queryResultRow).toBeVisible();
    await expect(page).not.toHaveURL(/[?&]auto_select_columns=/u);

    await queryRow.getByRole('combobox', { name: 'Field' }).click();
    await page.getByRole('option', { name: 'Calories', exact: true }).click();
    await queryRow.getByLabel('Value').fill('200');
    await page.getByRole('button', { name: 'apply', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('1 recipe found');

    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      /(^|\s)calories(\s|$)/u,
    );
    await expect(page).not.toHaveURL(/[?&]auto_select_columns=/u);
    const caloriesHeader = page.locator('.find-recipes-list th[data-explorer-column="calories"]');
    await expect(caloriesHeader).toBeVisible();
    await page.getByRole('link', { name: 'Sort by Calories ascending' }).click();
    await expect(page).toHaveURL(/[?&]sort=calories(?:&|$)/u);
    await expect(page).toHaveURL(/[?&]direction=asc(?:&|$)/u);
    await expect(page).toHaveURL(/[?&]filter=/u);
    await expect(caloriesHeader).toHaveAttribute('aria-sort', 'ascending');
    await page.getByRole('link', { name: 'Sort by Calories descending' }).click();
    await expect(page).toHaveURL(/[?&]direction=desc(?:&|$)/u);
    await expect(caloriesHeader).toHaveAttribute('aria-sort', 'descending');

    await page.getByRole('button', { name: 'Choose List columns' }).click();
    const caloriesColumn = page.getByRole('checkbox', { name: 'Calories', exact: true });
    await caloriesColumn.uncheck();
    await expect(caloriesHeader).toBeHidden();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await caloriesColumn.check();
    await expect(caloriesHeader).toBeVisible();
    const recipeRow = page
      .locator('.find-recipes-list tbody tr')
      .filter({ has: page.getByRole('link', { name: 'Nutrition calculation recipe' }) });
    const caloriesCell = recipeRow.locator('[data-explorer-column="calories"]');
    await expect(caloriesCell).toBeVisible();
    await expect(caloriesCell).toHaveText('200');

    await expect
      .poll(async () => {
        const response = await request.get(
          `${config.apiUrl}/rest/v1/explorer_state?select=state&context_key=eq.recipes-find`,
          { headers },
        );
        expect(response.ok(), await response.text()).toBeTruthy();
        const [saved] = (await response.json()) as {
          state: { display_preferences?: { visible_columns?: string[] } };
        }[];
        return saved?.state.display_preferences?.visible_columns;
      })
      .toContain('calories');
    await page.reload();
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await expect(page.getByRole('checkbox', { name: 'Calories', exact: true })).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(caloriesCell).toBeVisible();
    await expect(caloriesCell).toHaveText('200');

    const updatedProfileResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`,
      {
        headers,
        data: {
          p_action: 'profile_set',
          p_expected_revision: profileRevision,
          p_ingredient_id: ingredient.id,
          p_profile: {
            servingSize: { amount: 2, dimension: 'volume', unitCode: 'cup' },
            nutrients: {
              calories: 720,
              total_fat: 4,
              saturated_fat: 0,
              trans_fat: 0,
              cholesterol: 0,
              sodium: 8,
              total_carbohydrate: 152,
              dietary_fiber: 6,
              total_sugars: 0,
              added_sugars: 0,
              protein: 29.4,
              vitamin_d: 0,
              calcium: 30,
              iron: 8,
              potassium: 1910,
            },
          },
          p_equivalent: null,
        },
      },
    );
    expect(updatedProfileResponse.ok(), await updatedProfileResponse.text()).toBeTruthy();

    const staleEditorPage = await page.context().newPage();
    await staleEditorPage.goto(`/recipes/${recipeId}/edit`);
    await expect(staleEditorPage.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();
    await page.goto(`/recipes/${recipeId}/edit`);
    await page
      .getByRole('button', { name: new RegExp(`Nutrition for ${ingredientName}`, 'u') })
      .click();
    const staleIngredientDialog = page.getByRole('dialog', {
      name: `Nutrition for ${ingredientName}`,
    });
    const staleProtein = staleIngredientDialog.getByRole('spinbutton', { name: /Protein/u });
    await expect(staleProtein).toHaveValue('14');
    await expect(
      staleProtein.locator('xpath=ancestor::div[contains(@class, "factRow")]'),
    ).toHaveClass(/staleField/u);
    await staleIngredientDialog.getByRole('button', { name: 'Save', exact: true }).click();
    const staleConfirmation = page.getByRole('dialog', { name: 'Serving changed' });
    await expect(staleConfirmation).toBeVisible();
    await staleConfirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(staleIngredientDialog).toBeVisible();
    await staleIngredientDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(staleConfirmation).toBeVisible();
    await staleConfirmation.getByRole('button', { name: 'Update as-is' }).click();
    await expect(staleIngredientDialog).toBeHidden();
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Nutrition calculation recipe' })).toBeVisible();
    const updatedNutritionSection = page.getByRole('region', { name: 'Nutrition Per Serving' });
    await expect(updatedNutritionSection).toContainText('Calories: 200');
    const savedVersionResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=version,notes_markdown,nutrition_overrides&id=eq.${recipeId}`,
      { headers },
    );
    expect(savedVersionResponse.ok(), await savedVersionResponse.text()).toBeTruthy();
    const [savedVersion] = (await savedVersionResponse.json()) as Array<{
      notes_markdown: string;
      nutrition_overrides: Record<string, number>;
      version: number;
    }>;
    await staleEditorPage.getByLabel('Notes (Markdown)').fill('Stale nutrition save sentinel');
    await staleEditorPage.getByRole('button', { name: 'Save recipe' }).click();
    await expect(staleEditorPage.locator('.recipe-form-error')).toHaveText(
      'This recipe changed in another session. Reload before saving again.',
    );
    const afterConflictResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=version,notes_markdown,nutrition_overrides&id=eq.${recipeId}`,
      { headers },
    );
    expect(afterConflictResponse.ok(), await afterConflictResponse.text()).toBeTruthy();
    const [afterConflict] = (await afterConflictResponse.json()) as Array<{
      notes_markdown: string;
      nutrition_overrides: Record<string, number>;
      version: number;
    }>;
    expect(afterConflict).toEqual(savedVersion);
    await staleEditorPage.close();

    await page.emulateMedia({ media: 'print' });
    await expect(updatedNutritionSection).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    await waitForCachedRecipe(page, 'Calories: 200');
    await page.context().setOffline(true);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Offline recipes' })).toBeVisible();
    await page.getByRole('link', { name: 'Nutrition calculation recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Nutrition calculation recipe' })).toBeVisible();
    const offlineNutrition = page.getByRole('region', { name: 'Nutrition Per Serving' });
    await expect(offlineNutrition).toContainText('Calories: 200');
    const offlineA11y = await new AxeBuilder({ page }).analyze();
    expect(offlineA11y.violations).toEqual([]);
    await page.emulateMedia({ media: 'print' });
    await expect(offlineNutrition).toBeVisible();
    await page.emulateMedia({ media: null });
    await page.context().setOffline(false);

    const recipeStateResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=public_id,is_private,version&id=eq.${recipeId}`,
      { headers },
    );
    expect(recipeStateResponse.ok(), await recipeStateResponse.text()).toBeTruthy();
    const [recipeState] = (await recipeStateResponse.json()) as Array<{
      is_private: boolean;
      public_id: string;
      version: number;
    }>;
    expect(recipeState?.public_id).toBeTruthy();
    if (recipeState.is_private) {
      const usernameUpdate = await request.post(
        `${config.apiUrl}/rest/v1/rpc/set_public_username`,
        {
          headers,
          data: { p_public_username: `nutrition-${user.id.slice(0, 8)}` },
        },
      );
      expect(usernameUpdate.ok(), await usernameUpdate.text()).toBeTruthy();
      const publishResponse = await request.post(
        `${config.apiUrl}/rest/v1/rpc/set_recipe_privacy`,
        {
          headers,
          data: {
            p_recipe_id: recipeId,
            p_expected_version: recipeState.version,
            p_is_private: false,
          },
        },
      );
      expect(publishResponse.ok(), await publishResponse.text()).toBeTruthy();
    }

    await page.goto(`/r/${recipeState.public_id}`);
    await expect(
      page.getByRole('heading', { name: /Nutrition calculation recipe/u }),
    ).toBeVisible();
    const publicNutrition = page.getByRole('region', { name: 'Nutrition Per Serving' });
    await expect(publicNutrition).toContainText('Calories: 200');
    await page.emulateMedia({ media: 'print' });
    await expect(publicNutrition).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
    const publicA11y = await new AxeBuilder({ page }).analyze();
    expect(publicA11y.violations).toEqual([]);
    const publicOutputButton = page.getByRole('button', {
      name: /^(?:Print & )?Download$/u,
    });
    const htmlDownloadPromise = page.waitForEvent('download');
    await publicOutputButton.click();
    await page.getByRole('menuitem', { name: 'Download HTML' }).click();
    const htmlDownload = await htmlDownloadPromise;
    const htmlPath = await htmlDownload.path();
    if (!htmlPath) throw new Error('Expected the nutrition HTML download to have a file path.');
    const downloadedHtml = await readFile(htmlPath, 'utf8');
    expect(downloadedHtml).toContain('Nutrition Per Serving');
    expect(downloadedHtml).toContain('Calories: 200');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipe nutrition uses a saved Count average after loading a fresh editor @e2e @nutrition', async ({
  page,
  request,
}) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 720, 'Desktop ingredient grid workflow.');
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
  const ingredientName = 'Nutrition Count Equivalent Apple';

  try {
    const addIngredient = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers,
        data: {
          p_action: 'add',
          p_expected_revision: 1,
          p_name: ingredientName,
        },
      },
    );
    expect(addIngredient.ok(), await addIngredient.text()).toBeTruthy();
    const revision = await addIngredient.json();
    const ingredientResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id&name=eq.${encodeURIComponent(ingredientName)}`,
      { headers },
    );
    expect(ingredientResponse.ok(), await ingredientResponse.text()).toBeTruthy();
    const [ingredient] = await ingredientResponse.json();
    expect(ingredient?.id).toBeTruthy();
    const profileResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`,
      {
        headers,
        data: {
          p_action: 'profile_set',
          p_expected_revision: revision,
          p_ingredient_id: ingredient.id,
          p_profile: {
            servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
            nutrients: {
              calories: 120,
              total_fat: 0,
              saturated_fat: 0,
              trans_fat: 0,
              cholesterol: 0,
              sodium: 0,
              total_carbohydrate: 0,
              dietary_fiber: 0,
              total_sugars: 0,
              added_sugars: 0,
              protein: 0,
              vitamin_d: 0,
              calcium: 0,
              iron: 0,
              potassium: 0,
            },
          },
          p_equivalent: null,
        },
      },
    );
    expect(profileResponse.ok(), await profileResponse.text()).toBeTruthy();

    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Recipe data' }).click();
    const section = page.getByRole('region', { name: 'Ingredients' });
    await section.getByRole('button', { name: 'Ingredients', exact: true }).click();
    await section.getByRole('button', { name: `Measure equivalent for ${ingredientName}` }).click();

    const equivalentDialog = page.locator('dialog').filter({ hasText: 'Average measures' });
    await expect(equivalentDialog).toBeVisible();
    await expect(
      equivalentDialog.getByRole('combobox', { name: 'Recipe measurement' }),
    ).toContainText('Count');
    await equivalentDialog.getByLabel('Average volume amount').fill('1');
    await equivalentDialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(section.getByRole('status')).toHaveText('Measure equivalent saved.');

    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Count equivalent nutrition recipe');
    await page.getByLabel('Serves').fill('2');
    const grid = page.getByRole('table', { name: 'Recipe ingredients', exact: true });
    await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
    const ingredientInput = page.getByRole('combobox', { name: 'Ingredient, row 1' });
    await ingredientInput.fill(ingredientName);
    await page.getByRole('option', { name: ingredientName, exact: true }).click();
    await ingredientInput.press('Tab');
    await page.getByRole('combobox', { name: 'Ingredient type, row 1' }).click();
    await page.getByRole('option', { name: 'Count', exact: true }).click();
    await page.getByRole('textbox', { name: 'Count amount, row 1' }).fill('1');

    await expect(
      page.getByRole('button', { name: `Nutrition for ${ingredientName}: complete` }),
    ).toHaveClass(/recipe-ingredient-nutrition-complete/u);
    await expect(page.locator('.recipe-nutrition-editor')).toContainText(
      'Estimated per serving: Calories: 60',
    );

    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Recipe data' }).click();
    const updatedSection = page.getByRole('region', { name: 'Ingredients' });
    await updatedSection.getByRole('button', { name: 'Ingredients', exact: true }).click();
    await updatedSection
      .getByRole('button', { name: `Measure equivalent for ${ingredientName}` })
      .click();
    const updatedEquivalentDialog = page.locator('dialog').filter({ hasText: 'Average measures' });
    await updatedEquivalentDialog.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(updatedSection.getByRole('status')).toHaveText('Measure equivalent removed.');
  } finally {
    await deleteTestUser(request, user);
  }
});
