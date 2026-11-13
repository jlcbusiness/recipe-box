import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { captureScreenshot } from '../support/capture-screenshot';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function selectFilterOption(page: Page, row: Locator, label: string, option: string) {
  await row.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function selectFilterValue(page: Page, row: Locator, value: string) {
  await row.getByRole('button', { name: /^Value:/ }).click();
  await page
    .getByRole('group', { name: 'Value options' })
    .getByRole('button', { name: value, exact: true })
    .click();
  await page.keyboard.press('Escape');
}

async function createContractRecipe(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  anonKey: string,
  accessToken: string,
  recipe: {
    name: string;
    state: 'want_to_try' | 'tried';
    totalTime: number | null;
    notes: string;
    ingredients?: string[];
    mainIngredients?: string[];
    score?: number;
  },
): Promise<string> {
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
  const ingredientSetId = randomUUID();
  const timeEntries: { time_type_id: string; minutes: number; position: number }[] = [];
  if (recipe.totalTime !== null) {
    const timeTypeResponse = await request.get(
      `${apiUrl}/rest/v1/recipe_picklist_values?select=id&category=eq.time_type&value=eq.Cook`,
      { headers },
    );
    const timeTypeBody = await timeTypeResponse.text();
    expect(timeTypeResponse.ok(), timeTypeBody).toBeTruthy();
    const [cookTimeType] = JSON.parse(timeTypeBody) as { id: string }[];
    expect(cookTimeType).toBeDefined();
    timeEntries.push({
      time_type_id: cookTimeType.id,
      minutes: recipe.totalTime,
      position: 0,
    });
  }

  const response = await request.post(`${apiUrl}/rest/v1/rpc/save_recipe_with_time_entries`, {
    headers,
    data: {
      p_recipe_id: null,
      p_expected_version: null,
      p_name: recipe.name,
      p_food_type_id: null,
      p_state: recipe.state,
      p_verdict_id: null,
      p_enthusiasm_id: null,
      p_occasion_details: null,
      p_reason: null,
      p_serves: null,
      p_notes_markdown: recipe.notes,
      p_meal_type_ids: [],
      p_cuisine_ids: [],
      p_equipment_ids: [],
      p_ingredient_rows: (recipe.ingredients ?? []).map((ingredientName) => ({
        recipe_ingredient_id: randomUUID(),
        ingredient_set_id: ingredientSetId,
        ingredient_id: null,
        ingredient_name: ingredientName,
        is_main: recipe.mainIngredients?.includes(ingredientName) ?? false,
        detail: '',
        preparation: '',
        measurements: [],
      })),
      p_instruction_steps: [],
      p_publication_id: null,
      p_publication_page: null,
      p_recipe_url: null,
      p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
      p_tag_ids: [],
      p_ingredient_sets: [{ id: ingredientSetId, label: 'Main', position: 0 }],
      p_score: recipe.score ?? null,
      p_makes_quantity: null,
      p_makes_thing: null,
      p_nutrition_overrides: {},
      p_time_entries: timeEntries,
    },
  });
  const responseBody = await response.text();
  expect(response.ok(), responseBody).toBeTruthy();
  const [createdRecipe] = JSON.parse(responseBody) as { id: string; version: number }[];
  return createdRecipe.id;
}

async function setContractRecipePrivacy(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  anonKey: string,
  accessToken: string,
  recipeId: string,
  isPrivate: boolean,
  publicUsername?: string,
) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
  const recipeResponse = await request.get(
    `${apiUrl}/rest/v1/recipes?select=version&id=eq.${recipeId}`,
    { headers },
  );
  const recipeResponseBody = await recipeResponse.text();
  expect(recipeResponse.ok(), recipeResponseBody).toBeTruthy();
  const [{ version }] = JSON.parse(recipeResponseBody) as { version: number }[];
  const privacyResponse = await request.post(`${apiUrl}/rest/v1/rpc/set_recipe_privacy`, {
    headers,
    data: {
      p_recipe_id: recipeId,
      p_expected_version: version,
      p_is_private: isPrivate,
      p_public_username: publicUsername ?? null,
    },
  });
  expect(privacyResponse.ok(), await privacyResponse.text()).toBeTruthy();
}

async function setContractRecipeMarker(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  anonKey: string,
  accessToken: string,
  recipeId: string,
  marker: 'star' | 'heart',
) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
  const recipeResponse = await request.get(
    `${apiUrl}/rest/v1/recipes?select=version&id=eq.${recipeId}`,
    { headers },
  );
  const recipeResponseBody = await recipeResponse.text();
  expect(recipeResponse.ok(), recipeResponseBody).toBeTruthy();
  const [{ version }] = JSON.parse(recipeResponseBody) as { version: number }[];
  const markerResponse = await request.post(`${apiUrl}/rest/v1/rpc/set_recipe_marker`, {
    headers,
    data: {
      p_recipe_id: recipeId,
      p_expected_version: version,
      p_marker: marker,
      p_enabled: true,
    },
  });
  expect(markerResponse.ok(), await markerResponse.text()).toBeTruthy();
}

test('Find Recipes Query shows every selected multi-value option @e2e', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const ingredientNames = Array.from(
    { length: 12 },
    (_, index) => `Selected Ingredient ${String(index + 1).padStart(2, '0')}`,
  );

  try {
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: 'Selected ingredients visibility recipe',
      state: 'want_to_try',
      totalTime: null,
      notes: '',
      ingredients: ingredientNames,
    });

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/find?tab=query');
    const expectQueryActionAlignment = async () => {
      const [addRuleBounds, applyBounds] = await Promise.all([
        page.getByRole('button', { name: 'Add rule' }).boundingBox(),
        page.getByRole('button', { name: 'apply', exact: true }).boundingBox(),
      ]);
      if (!addRuleBounds || !applyBounds) {
        throw new Error('The Query action controls should be measurable.');
      }
      expect(
        Math.abs(
          addRuleBounds.y + addRuleBounds.height / 2 - (applyBounds.y + applyBounds.height / 2),
        ),
      ).toBeLessThanOrEqual(1);
    };
    await expectQueryActionAlignment();
    await page.getByRole('button', { name: 'Add rule' }).click();

    const row = page.locator('.recipe-filter-row').first();
    await expect(row.locator('.recipe-filter-rule-number')).toHaveText('1.');
    await expect(row.locator('.recipe-filter-mobile-toggle')).toBeHidden();
    await expect(row.getByRole('combobox', { name: 'Operator' })).toBeDisabled();
    await expect(row.getByLabel('Value')).toBeDisabled();
    await selectFilterOption(page, row, 'Field', 'Ingredient');
    const value = row.getByRole('button', { name: /^Value:/ });
    await expect(row.getByRole('combobox', { name: 'Operator' })).toBeEnabled();
    await expect(value).toBeEnabled();
    await expect(value).toContainText('Select');
    await row.getByRole('combobox', { name: 'Operator' }).click();
    await expect(page.getByRole('option', { name: 'Is', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await value.click();
    const options = page.getByRole('group', { name: 'Value options' });
    for (const ingredientName of ingredientNames) {
      await options.getByRole('button', { name: ingredientName, exact: true }).click();
    }
    await page.keyboard.press('Escape');

    await expect(value).toContainText(ingredientNames.join(', '));
    await expect(value).toHaveAccessibleName(`Value: ${ingredientNames.join(', ')}`);
    await expect(value.locator('.recipe-picklist-trigger-label [aria-hidden="true"]')).toHaveCount(
      0,
    );

    const expectMobileInlineLayout = async (valueControl: Locator) => {
      const [rowBounds, numberBounds, fieldBounds, operatorBounds, valueBounds, removeBounds] =
        await Promise.all([
          row.boundingBox(),
          row.locator('.recipe-filter-mobile-toggle').boundingBox(),
          row.getByLabel('Field').boundingBox(),
          row.getByLabel('Operator').boundingBox(),
          valueControl.boundingBox(),
          row.getByRole('button', { name: 'Remove filter 1' }).boundingBox(),
        ]);
      if (
        !rowBounds ||
        !numberBounds ||
        !fieldBounds ||
        !operatorBounds ||
        !valueBounds ||
        !removeBounds
      ) {
        throw new Error('The mobile Query controls should be measurable.');
      }
      const controlCenters = [fieldBounds, operatorBounds, valueBounds, removeBounds].map(
        ({ y, height }) => y + height / 2,
      );
      expect(Math.max(...controlCenters) - Math.min(...controlCenters)).toBeLessThanOrEqual(1);
      expect(numberBounds.x).toBeCloseTo(rowBounds.x, 0);
      expect(fieldBounds.x - numberBounds.x - numberBounds.width).toBeCloseTo(96 / 25.4, 0);
      expect(fieldBounds.width).toBeGreaterThan(operatorBounds.width);
      const numberValue = await valueControl.evaluate((control) =>
        control.classList.contains('recipe-filter-number-value-control'),
      );
      if (numberValue) {
        expect(operatorBounds.width).toBeGreaterThan(30);
        expect(operatorBounds.width).toBeLessThan(38);
        expect(valueBounds.width).toBeLessThan(80);
      } else {
        expect(operatorBounds.width).toBeGreaterThan(40);
        expect(operatorBounds.width).toBeLessThan(48);
      }
      expect(operatorBounds.x - fieldBounds.x - fieldBounds.width).toBeCloseTo(96 / 25.4, 0);
      expect(valueBounds.x - operatorBounds.x - operatorBounds.width).toBeCloseTo(96 / 25.4, 0);
      const clearance = removeBounds.x - valueBounds.x - valueBounds.width;
      if (Math.abs(clearance - 96 / 25.4) > 0.5) {
        throw new Error(
          `Expected 1mm clearance between Value and Remove: ${JSON.stringify({
            rowBounds,
            fieldBounds,
            operatorBounds,
            valueBounds,
            removeBounds,
            clearance,
          })}`,
        );
      }
      expect(removeBounds.width).toBe(16);
      expect(removeBounds.x + removeBounds.width).toBeLessThanOrEqual(
        rowBounds.x + rowBounds.width + 1,
      );
    };

    for (const width of [352, 390]) {
      await page.setViewportSize({ width, height: 820 });
      await expectQueryActionAlignment();

      if (width === 352) {
        await value.click();
        await expect(options).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(value).toContainText(ingredientNames[0]);
        const mobileValueBounds = await value.boundingBox();
        if (!mobileValueBounds) {
          throw new Error('The mobile Query value field should be measurable.');
        }
        expect(mobileValueBounds.height).toBeLessThanOrEqual(40);
        await expectMobileInlineLayout(value);
        const expandRule = row.getByRole('button', { name: 'Expand filter 1' });
        await expect(expandRule).toHaveText('1');
        await expect(expandRule.locator('svg')).toHaveAttribute('aria-hidden', 'true');
        await expect(expandRule.locator('svg')).toHaveCSS('transform', 'none');
        await expandRule.click();
        await expect(row).toHaveAttribute('data-mobile-expanded', 'true');
        const collapseRule = row.getByRole('button', { name: 'Collapse filter 1' });
        await expect(collapseRule).toHaveText('1');
        await expect(collapseRule.locator('svg')).toHaveCSS(
          'transform',
          'matrix(0, 1, -1, 0, 0, 0)',
        );
        const [
          expandedValueBounds,
          expandedOperatorBounds,
          expandedRemoveBounds,
          expandedRowMetrics,
        ] = await Promise.all([
          value.boundingBox(),
          row.getByLabel('Operator').boundingBox(),
          row.getByRole('button', { name: 'Remove filter 1' }).boundingBox(),
          row.evaluate((element) => {
            const rowElement = element as HTMLElement;
            return { clientWidth: rowElement.clientWidth, scrollWidth: rowElement.scrollWidth };
          }),
        ]);
        if (!expandedValueBounds || !expandedOperatorBounds || !expandedRemoveBounds) {
          throw new Error('The expanded mobile Query controls should be measurable.');
        }
        await expect(value).toHaveAccessibleName(`Value: ${ingredientNames.join(', ')}`);
        expect(expandedValueBounds.width).toBeGreaterThan(mobileValueBounds.width);
        const expandedOperatorPadding = await row.getByLabel('Operator').evaluate((control) => {
          const style = getComputedStyle(control);
          return [Number.parseFloat(style.paddingLeft), Number.parseFloat(style.paddingRight)];
        });
        for (const padding of expandedOperatorPadding) {
          expect(padding).toBeGreaterThanOrEqual(96 / 25.4);
        }
        const expandedValueMetrics = await value.evaluate((trigger) => {
          const label = trigger.querySelector('.recipe-picklist-trigger-label');
          const summary = label?.querySelector('span:last-child');
          return {
            text: summary?.textContent,
            width: summary?.clientWidth,
            scrollWidth: summary?.scrollWidth,
            whiteSpace: summary ? getComputedStyle(summary).whiteSpace : null,
            height: trigger.getBoundingClientRect().height,
          };
        });
        expect(expandedValueBounds.height, JSON.stringify(expandedValueMetrics)).toBeGreaterThan(
          mobileValueBounds.height,
        );
        expect(expandedValueBounds.y).toBeGreaterThan(
          expandedOperatorBounds.y + expandedOperatorBounds.height,
        );
        expect(
          expandedRemoveBounds.x - expandedValueBounds.x - expandedValueBounds.width,
        ).toBeCloseTo(96 / 25.4, 0);
        expect(
          Math.abs(
            expandedRemoveBounds.y +
              expandedRemoveBounds.height / 2 -
              (expandedValueBounds.y + expandedValueBounds.height / 2),
          ),
        ).toBeLessThanOrEqual(1);
        expect(expandedRowMetrics.scrollWidth).toBeLessThanOrEqual(expandedRowMetrics.clientWidth);
        await collapseRule.click();
        await expect(row).toHaveAttribute('data-mobile-expanded', 'false');
        expect((await value.boundingBox())?.height).toBeLessThanOrEqual(40);
        await expectMobileInlineLayout(value);

        await value.click();
        await expect(options).toBeVisible();
        const [optionsBounds, optionsScrollMetrics] = await Promise.all([
          options.boundingBox(),
          options.evaluate((element) => {
            const menu = element as HTMLElement;
            return { clientHeight: menu.clientHeight, scrollHeight: menu.scrollHeight };
          }),
        ]);
        if (!optionsBounds) {
          throw new Error('The mobile Query value menu should be measurable.');
        }
        expect(optionsBounds.width).toBeLessThanOrEqual(320);
        expect(optionsBounds.x + optionsBounds.width).toBeLessThanOrEqual(width + 1);
        expect(optionsBounds.height).toBeLessThanOrEqual(280);
        expect(optionsScrollMetrics.scrollHeight).toBeGreaterThan(
          optionsScrollMetrics.clientHeight,
        );
        await page.mouse.move(
          optionsBounds.x + optionsBounds.width / 2,
          optionsBounds.y + optionsBounds.height / 2,
        );
        await page.mouse.wheel(0, 180);
        await expect
          .poll(() => options.evaluate((element) => (element as HTMLElement).scrollTop))
          .toBeGreaterThan(0);
        await expect(options).toBeVisible();
        await page.keyboard.press('Escape');
      }

      await selectFilterOption(page, row, 'Field', 'Publication Author');
      if (width === 352) {
        const fieldControl = row.getByLabel('Field');
        const collapsedFieldBounds = await fieldControl.boundingBox();
        if (!collapsedFieldBounds)
          throw new Error('The mobile Field control should be measurable.');
        await row.getByRole('button', { name: 'Expand filter 1' }).click();
        const [expandedFieldBounds, expandedOperatorBounds, expandedRowBounds] = await Promise.all([
          fieldControl.boundingBox(),
          row.getByLabel('Operator').boundingBox(),
          row.boundingBox(),
        ]);
        if (!expandedFieldBounds || !expandedOperatorBounds || !expandedRowBounds)
          throw new Error('The expanded Field and Operator controls should be measurable.');
        expect(expandedFieldBounds.width).toBeGreaterThan(collapsedFieldBounds.width);
        expect(expandedFieldBounds.width).toBeLessThan(expandedRowBounds.width * 0.6);
        expect(expandedOperatorBounds.width).toBeLessThan(expandedRowBounds.width * 0.3);
        await row.getByRole('button', { name: 'Collapse filter 1' }).click();
      }
      const textValue = row.getByLabel('Value');
      await textValue.fill('representative mobile query value');
      await expect(row.getByLabel('Operator')).toContainText('Has');
      await expect(row.getByLabel('Operator')).toHaveAttribute('title', 'Contains');
      await expectMobileInlineLayout(textValue);
      if (width === 352) {
        const collapsedTextBounds = await textValue.boundingBox();
        if (!collapsedTextBounds) throw new Error('The mobile text Value should be measurable.');
        await row.getByRole('button', { name: 'Expand filter 1' }).click();
        const expandedTextBounds = await textValue.boundingBox();
        const expandedTextRowMetrics = await row.evaluate((element) => {
          const rowElement = element as HTMLElement;
          return { clientWidth: rowElement.clientWidth, scrollWidth: rowElement.scrollWidth };
        });
        if (!expandedTextBounds) throw new Error('The expanded text Value should be measurable.');
        expect(expandedTextBounds.width).toBeGreaterThan(collapsedTextBounds.width);
        expect(expandedTextBounds.y).toBeGreaterThan(collapsedTextBounds.y);
        expect(expandedTextRowMetrics.scrollWidth).toBeLessThanOrEqual(
          expandedTextRowMetrics.clientWidth,
        );
        await row.getByRole('button', { name: 'Collapse filter 1' }).click();
        await textValue.fill('e');
        await row.getByRole('button', { name: 'Expand filter 1' }).click();
        expect((await textValue.boundingBox())?.width).toBeLessThan(48);
        await row.getByRole('button', { name: 'Collapse filter 1' }).click();
      }

      await selectFilterOption(page, row, 'Field', 'Total Time');
      await selectFilterOption(page, row, 'Operator', 'Between');
      const numberValue = row.getByLabel('Value');
      const throughValue = row.getByLabel('Through');
      await numberValue.fill('8888');
      await throughValue.fill('8888');
      await expect(row.getByLabel('Operator')).toContainText('Rng');
      await expect(row.getByLabel('Operator')).toHaveAttribute('title', 'Between');
      await expect(numberValue).toHaveClass(/recipe-filter-number-value-control/);
      await expect(throughValue).toHaveClass(/recipe-filter-number-value-to-control/);
      await expectMobileInlineLayout(numberValue);
      const [numberValueBounds, throughValueBounds, betweenRowBounds] = await Promise.all([
        numberValue.boundingBox(),
        throughValue.boundingBox(),
        row.boundingBox(),
      ]);
      if (!numberValueBounds || !throughValueBounds || !betweenRowBounds) {
        throw new Error('The mobile Between values should be measurable.');
      }
      expect(throughValueBounds.y).toBeGreaterThan(numberValueBounds.y + numberValueBounds.height);
      expect(throughValueBounds.x).toBeGreaterThanOrEqual(betweenRowBounds.x);
      expect(throughValueBounds.x + throughValueBounds.width).toBeLessThanOrEqual(
        betweenRowBounds.x + betweenRowBounds.width + 1,
      );

      await selectFilterOption(page, row, 'Field', 'Calories');
      await numberValue.fill('123.5');
      await expect(numberValue).toHaveClass(/recipe-filter-number-value-control/);
      await expectMobileInlineLayout(numberValue);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBeTruthy();
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes limits search and query criteria to main ingredients @e2e', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = { apikey: config.anonKey, Authorization: `Bearer ${user.accessToken}` };
  const mainRecipeName = 'Zephyr chicken supper';
  const supportingRecipeName = 'Zephyr rice with chicken stock';

  try {
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: mainRecipeName,
      state: 'want_to_try',
      totalTime: null,
      notes: '',
      ingredients: ['Zephyr chicken thighs', 'Zephyr lemon'],
      mainIngredients: ['Zephyr chicken thighs'],
    });
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: supportingRecipeName,
      state: 'want_to_try',
      totalTime: null,
      notes: '',
      ingredients: ['Zephyr rice', 'Zephyr chicken stock'],
      mainIngredients: ['Zephyr rice'],
    });

    const searchNames = async (query: string | null, filters: unknown[]) => {
      const response = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
        headers,
        data: { p_query: query, p_filters: filters, p_sort_key: 'name', p_limit: 50, p_offset: 0 },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return ((await response.json()) as { recipe_name: string }[]).map(
        ({ recipe_name }) => recipe_name,
      );
    };
    const mainText = (value: string) => ({
      field: 'main_ingredient_text',
      operator: 'matches',
      value,
    });

    expect(await searchNames('zephyr chicken', [])).toEqual([mainRecipeName, supportingRecipeName]);
    expect(await searchNames('zephyr chicken', [mainText('zephyr chicken')])).toEqual([
      mainRecipeName,
    ]);
    expect(await searchNames('zephyr rice', [mainText('zephyr rice')])).toEqual([
      supportingRecipeName,
    ]);
    expect(await searchNames('zephyr stock', [mainText('zephyr stock')])).toEqual([]);

    const invalidText = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers,
      data: { p_filters: [{ ...mainText('zephyr'), operator: 'contains' }] },
    });
    expect(invalidText.status()).toBe(400);

    const ingredientsResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id,name`,
      { headers },
    );
    expect(ingredientsResponse.ok(), await ingredientsResponse.text()).toBeTruthy();
    const ingredientIds = new Map(
      ((await ingredientsResponse.json()) as { id: string; name: string }[]).map(({ id, name }) => [
        name.toLowerCase(),
        id,
      ]),
    );
    const chickenId = ingredientIds.get('zephyr chicken thighs');
    const stockId = ingredientIds.get('zephyr chicken stock');
    expect(chickenId && stockId).toBeTruthy();
    expect(
      await searchNames(null, [
        { field: 'main_ingredient', operator: 'contains_any', value: [chickenId, stockId] },
      ]),
    ).toEqual([mainRecipeName]);
    expect(
      await searchNames(null, [
        { field: 'ingredient', operator: 'contains_any', value: [chickenId, stockId] },
      ]),
    ).toEqual([mainRecipeName, supportingRecipeName]);
    expect(
      await searchNames(null, [
        { field: 'main_ingredient', operator: 'does_not_contain', value: [chickenId] },
      ]),
    ).toEqual([supportingRecipeName]);

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/find?tab=search&q=zephyr+chicken&sort=name&direction=asc');
    await expect(page.getByText('2 recipes found')).toBeVisible();
    const mainOnly = page.getByRole('checkbox', { name: 'Main ingredients only' });
    await expect(mainOnly).not.toBeChecked();
    await mainOnly.check();
    await expect(page).toHaveURL(/[?&]main=1(?:&|$)/);
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.getByRole('link', { name: mainRecipeName })).toBeVisible();
    await expect(mainOnly).toBeChecked();

    await page.getByRole('link', { name: 'Sort by Name descending' }).click();
    await expect(page).toHaveURL(/direction=desc/);
    await expect(page).toHaveURL(/[?&]main=1(?:&|$)/);
    await expect(page.getByText('1 recipe found')).toBeVisible();

    await mainOnly.uncheck();
    await expect(page).not.toHaveURL(/[?&]main=1(?:&|$)/);
    await expect(page.getByText('2 recipes found')).toBeVisible();

    await page.getByRole('tab', { name: 'Query' }).click();
    await expect(page).not.toHaveURL(/[?&](?:q|main)=/);
    await page.getByRole('button', { name: 'add rule' }).click();
    await page
      .locator('.recipe-filter-row')
      .first()
      .getByRole('combobox', { name: 'Field' })
      .click();
    await expect(page.getByRole('option', { name: 'Main Ingredient', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    const mainFilter = JSON.stringify({
      field: 'main_ingredient',
      operator: 'contains_any',
      value: [chickenId, stockId],
    });
    await page.goto(
      `/recipes/find?filter=${encodeURIComponent(mainFilter)}&tab=query&sort=name&direction=asc`,
    );
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.getByRole('link', { name: mainRecipeName })).toBeVisible();
    await expect(page.locator('.recipe-filter-row').first()).toContainText('Main Ingredient');

    const queryUrl = `/recipes/find?filter=${encodeURIComponent(mainFilter)}&tab=query&sort=name&direction=asc`;
    const preferences = page.locator('.explorer-list-preferences');
    await page.setViewportSize({ width: 346, height: 547 });
    const valueTrigger = page.locator('.recipe-filter-value-trigger');
    await expect(valueTrigger).toHaveAttribute(
      'aria-label',
      /zephyr chicken stock, zephyr chicken thighs/i,
    );
    expect(
      await valueTrigger.evaluate((trigger) => {
        const label = trigger.querySelector('.recipe-picklist-trigger-label');
        const value = label?.querySelector('span:last-child');
        return {
          whiteSpace: label ? getComputedStyle(label).whiteSpace : null,
          textOverflow: value ? getComputedStyle(value).textOverflow : null,
        };
      }),
    ).toEqual({ whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
    expect((await valueTrigger.boundingBox())?.height).toBeLessThanOrEqual(40);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(preferences).not.toHaveAttribute('data-visible-columns', /main_ingredients/u);
    const autoSelect = page.getByRole('checkbox', { name: "Don't auto-select columns" });
    await expect(autoSelect).not.toBeChecked();
    const [clearAllBounds, applyBounds, autoSelectBounds] = await Promise.all([
      page.locator('.recipe-filter-clear-all').boundingBox(),
      page.locator('.recipe-filter-apply').boundingBox(),
      autoSelect.boundingBox(),
    ]);
    if (!clearAllBounds || !applyBounds || !autoSelectBounds) {
      throw new Error('Expected the Query actions to be measurable.');
    }
    expect(autoSelectBounds.y).toBeGreaterThanOrEqual(
      Math.max(clearAllBounds.y + clearAllBounds.height, applyBounds.y + applyBounds.height),
    );
    await autoSelect.check();
    await page.locator('.recipe-filter-apply').click();
    await expect(preferences).not.toHaveAttribute('data-visible-columns', /main_ingredients/u);
    await expect(page).not.toHaveURL(/[?&]auto_select_columns=/u);

    await page.goto(`${queryUrl}&auto_select_columns=1`);
    await expect(preferences).toHaveAttribute('data-visible-columns', /main_ingredients/u);
    await expect(page).not.toHaveURL(/[?&]auto_select_columns=/u);
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    const mainIngredientsColumn = page.getByRole('checkbox', {
      name: 'Main Ingredients',
      exact: true,
    });
    await expect(mainIngredientsColumn).toBeChecked();
    const popoverBounds = await page.locator('.explorer-list-preferences-popover').boundingBox();
    if (!popoverBounds) throw new Error('Column chooser must be visible');
    const viewport = await page.evaluate(() => ({
      height: window.innerHeight,
      width: window.innerWidth,
    }));
    expect(popoverBounds.x).toBeGreaterThanOrEqual(0);
    expect(popoverBounds.x + popoverBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(popoverBounds.y).toBeGreaterThanOrEqual(0);
    expect(popoverBounds.y + popoverBounds.height).toBeLessThanOrEqual(viewport.height);
    const initialScrollY = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => {
      document.body.style.minHeight = '150vh';
    });
    await page.evaluate(() => window.scrollBy(0, 100));
    const scrolledY = await page.evaluate(() => window.scrollY);
    expect(scrolledY).toBeGreaterThan(initialScrollY);
    const scrolledPopoverBounds = await page
      .locator('.explorer-list-preferences-popover')
      .boundingBox();
    if (!scrolledPopoverBounds)
      throw new Error('Column chooser must remain visible while scrolling');
    expect(Math.abs(scrolledPopoverBounds.x - popoverBounds.x)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(popoverBounds.y - scrolledPopoverBounds.y - (scrolledY - initialScrollY)),
    ).toBeLessThanOrEqual(1);
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), initialScrollY);
    await mainIngredientsColumn.scrollIntoViewIfNeeded({ timeout: 5_000 });
    const preferenceSave = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/recipes/find',
    );
    await mainIngredientsColumn.uncheck({ timeout: 5_000 });
    expect((await preferenceSave).ok()).toBe(true);
    await expect(preferences).not.toHaveAttribute('data-visible-columns', /main_ingredients/u);
    await page.keyboard.press('Escape');
    await page.goto(queryUrl);
    await expect(preferences).not.toHaveAttribute('data-visible-columns', /main_ingredients/u);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes exposes and filters recipe visibility @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const linkableRecipeName = 'Linkable visibility filter recipe';
    const privateRecipeName = 'Private visibility filter recipe';
    const linkableRecipeId = await createContractRecipe(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      {
        name: linkableRecipeName,
        state: 'want_to_try',
        totalTime: null,
        notes: '',
      },
    );
    await setContractRecipePrivacy(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      linkableRecipeId,
      false,
      `link-${randomUUID().slice(0, 8)}`,
    );
    const privateRecipeId = await createContractRecipe(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      { name: privateRecipeName, state: 'want_to_try', totalTime: null, notes: '' },
    );
    await setContractRecipePrivacy(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      privateRecipeId,
      true,
    );

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/find?column_visibility=private&sort=name&direction=asc&view=details');
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await page.getByRole('checkbox', { name: 'Visibility' }).uncheck();
    await expect(page.locator('.explorer-list-preferences')).not.toHaveAttribute(
      'data-visible-columns',
      /(?:^|\s)visibility(?:\s|$)/,
    );
    await expect(
      page.locator('.find-recipes-list thead [data-explorer-column="visibility"]'),
    ).toHaveCSS('display', 'none');
    const privateRow = page
      .locator('.find-recipes-list tbody tr')
      .filter({ has: page.getByRole('link', { name: privateRecipeName }) });
    await expect(privateRow.locator('[data-explorer-column="visibility"]')).toHaveCSS(
      'display',
      'none',
    );
    const visibleCellTops = await privateRow
      .locator('td:visible')
      .evaluateAll((cells) => [
        ...new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().top))),
      ]);
    expect(visibleCellTops).toHaveLength(1);
    const [headerGeometry, cellGeometry] = await Promise.all([
      page.locator('.find-recipes-list thead th:visible').evaluateAll((cells) =>
        cells.map((cell) => {
          const { x, y, width } = cell.getBoundingClientRect();
          return { x, top: Math.round(y), width };
        }),
      ),
      privateRow.locator('td:visible').evaluateAll((cells) =>
        cells.map((cell) => {
          const { x, y, width } = cell.getBoundingClientRect();
          return { x, top: Math.round(y), width };
        }),
      ),
    ]);
    expect(new Set(headerGeometry.map(({ top }) => top)).size).toBe(1);
    expect(headerGeometry).toHaveLength(cellGeometry.length);
    for (const [index, header] of headerGeometry.entries()) {
      expect(Math.abs(header.x - cellGeometry[index].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(header.width - cellGeometry[index].width)).toBeLessThanOrEqual(1);
    }
    await expect(privateRow.locator('[data-explorer-column="visibility"]')).toHaveText('Private');
    await expect(page.getByRole('link', { name: linkableRecipeName, exact: true })).toHaveCount(0);

    await page.goto('/recipes/find?tab=query&sort=name&direction=asc&view=details');
    await page.getByRole('button', { name: 'Add rule' }).click();
    const visibilityRule = page.locator('.recipe-filter-row').first();
    await selectFilterOption(page, visibilityRule, 'Field', 'Visibility');
    await selectFilterValue(page, visibilityRule, 'Linkable');
    await visibilityRule.getByRole('button', { name: 'Value: Linkable' }).press('Enter');
    await expect(page.getByText('1 recipe found')).toBeVisible();
    const linkableRow = page
      .locator('.find-recipes-list tbody tr')
      .filter({ has: page.getByRole('link', { name: linkableRecipeName }) });
    await expect(linkableRow.locator('[data-explorer-column="visibility"]')).toHaveText('Linkable');
    await expect(page.getByRole('link', { name: privateRecipeName, exact: true })).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes Query filters by Starred and Hearted @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const markedRecipeName = 'Query marker fixture';
    const unmarkedRecipeName = 'Query unmarked fixture';
    const markedRecipeId = await createContractRecipe(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      {
        name: markedRecipeName,
        state: 'want_to_try',
        totalTime: null,
        notes: '',
      },
    );
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: unmarkedRecipeName,
      state: 'want_to_try',
      totalTime: null,
      notes: '',
    });
    for (const marker of ['star', 'heart'] as const) {
      await setContractRecipeMarker(
        request,
        config.apiUrl,
        config.anonKey,
        user.accessToken,
        markedRecipeId,
        marker,
      );
    }

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/recipes/find?tab=query&sort=name&direction=asc&view=details');
    await expect(page.locator('.recipe-marker-filters')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Filter recipes by Star' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Filter recipes by Heart' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Add rule' }).click();
    const starredRule = page.locator('.recipe-filter-row').first();
    await selectFilterOption(page, starredRule, 'Field', 'Starred');
    await selectFilterOption(page, starredRule, 'Operator', 'Is');
    await starredRule.getByRole('combobox', { name: 'Value' }).click();
    await expect(page.getByRole('option', { name: 'Yes', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'No', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await selectFilterOption(page, starredRule, 'Value', 'Yes');
    const applyButton = page.getByRole('button', { name: 'apply', exact: true });
    await expect(applyButton).toBeEnabled();
    await expect(page.getByText('2 recipes found')).toBeVisible();
    await expect(page.getByRole('link', { name: markedRecipeName })).toBeVisible();
    await expect(page.getByRole('link', { name: unmarkedRecipeName })).toBeVisible();
    expect(new URL(page.url()).searchParams.getAll('filter')).toHaveLength(0);
    await applyButton.click();

    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(starredRule.getByRole('combobox', { name: 'Field' })).toContainText('Starred');
    await expect(page.getByRole('link', { name: markedRecipeName })).toBeVisible();
    await expect(page).toHaveURL((url) => url.searchParams.getAll('filter').length === 1);
    await expect(page.getByRole('link', { name: unmarkedRecipeName })).toHaveCount(0);

    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect(applyButton).toBeDisabled();
    const heartedRule = page.locator('.recipe-filter-row').nth(1);
    await selectFilterOption(page, heartedRule, 'Field', 'Hearted');
    await selectFilterOption(page, heartedRule, 'Operator', 'Is');
    await selectFilterOption(page, heartedRule, 'Value', 'Yes');
    expect(new URL(page.url()).searchParams.getAll('filter')).toHaveLength(1);
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await applyButton.click();

    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(starredRule.getByRole('combobox', { name: 'Field' })).toContainText('Starred');
    await expect(heartedRule.getByRole('combobox', { name: 'Field' })).toContainText('Hearted');
    await expect(page.getByRole('link', { name: markedRecipeName })).toBeVisible();
    expect(new URL(page.url()).searchParams.getAll('filter')).toHaveLength(2);
    await expect(page).toHaveURL((url) => url.searchParams.getAll('filter').length === 2);

    await page.getByRole('button', { name: 'clear all', exact: true }).click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    await expect(page.getByText('1 recipe found')).toBeVisible();
    expect(new URL(page.url()).searchParams.getAll('filter')).toHaveLength(2);
    await applyButton.click();
    await expect(page.getByText('2 recipes found')).toBeVisible();
    expect(new URL(page.url()).searchParams.getAll('filter')).toHaveLength(0);
    await expect(page).toHaveURL((url) => url.searchParams.getAll('filter').length === 0);

    await page.getByRole('button', { name: 'Add rule' }).click();
    const resetRule = page.locator('.recipe-filter-row').first();
    await selectFilterOption(page, resetRule, 'Field', 'Starred');
    await selectFilterOption(page, resetRule, 'Operator', 'Is');
    await selectFilterOption(page, resetRule, 'Value', 'Yes');
    await applyButton.click();
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page).toHaveURL((url) => url.searchParams.getAll('filter').length === 1);

    await page.getByRole('tab', { name: 'Search' }).click();
    await expect(page).toHaveURL((url) => {
      const params = url.searchParams;
      return params.get('tab') === 'search' && !params.has('filter') && !params.has('q');
    });
    await expect(page.locator('.recipe-marker-filters')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filter recipes by Star' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filter recipes by Heart' })).toBeVisible();
    await expect(page.getByText('2 recipes found')).toBeVisible();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);

    const searchInput = page.locator('#recipe-search');
    await searchInput.fill(markedRecipeName);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await page.getByRole('tab', { name: 'Query' }).click();
    await expect(page).toHaveURL((url) => {
      const params = url.searchParams;
      return params.get('tab') === 'query' && !params.has('filter') && !params.has('q');
    });
    await expect(searchInput).toHaveValue('');
    await expect(page.getByText('2 recipes found')).toBeVisible();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);

    await page.getByRole('button', { name: 'Switch to List view' }).click();
    const markerIndicators = page.locator('.recipe-explorer-simple-list .recipe-marker-indicators');
    await expect(markerIndicators).toHaveCount(1);
    const queryMarkerPadding = await markerIndicators.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).paddingRight),
    );
    expect(queryMarkerPadding).toBeGreaterThanOrEqual(7.5);

    await page.getByRole('tab', { name: 'Search' }).click();
    await expect(markerIndicators).toHaveCount(1);
    const searchMarkerPadding = await markerIndicators.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).paddingRight),
    );
    expect(searchMarkerPadding).toBeGreaterThanOrEqual(7.5);

    await page.getByRole('tab', { name: 'Query' }).click();
    await expect(page.locator('.recipe-marker-filters')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Filter recipes by Star' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Filter recipes by Heart' })).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes Query filters signed Rating values and Rating existence @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const ratedRecipeName = 'Query negative Rating fixture';
    const unratedRecipeName = 'Query missing Rating fixture';
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: ratedRecipeName,
      state: 'tried',
      totalTime: null,
      notes: '',
      score: -3,
    });
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: unratedRecipeName,
      state: 'tried',
      totalTime: null,
      notes: '',
    });

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/recipes/find?tab=query&sort=name&direction=asc&view=details');

    await page.getByRole('button', { name: 'Add rule' }).click();
    const ratingRule = page.locator('.recipe-filter-row').first();
    await selectFilterOption(page, ratingRule, 'Field', 'Rating');
    await selectFilterOption(page, ratingRule, 'Operator', '=');
    const ratingValue = ratingRule.locator('input[type="number"]');
    await expect(ratingValue).toHaveAttribute('min', '-5');
    await expect(ratingValue).toHaveAttribute('max', '5');
    await ratingValue.fill('-3');
    await page.getByRole('button', { name: 'apply', exact: true }).click();

    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.getByRole('link', { name: ratedRecipeName })).toBeVisible();
    await expect(page.getByRole('link', { name: unratedRecipeName })).toHaveCount(0);

    await selectFilterOption(page, ratingRule, 'Operator', 'Exists');
    await expect(ratingRule.locator('input[type="number"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'apply', exact: true }).click();

    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.getByRole('link', { name: ratedRecipeName })).toBeVisible();
    await expect(page.getByRole('link', { name: unratedRecipeName })).toHaveCount(0);
    const existsFilter = JSON.parse(new URL(page.url()).searchParams.get('filter') ?? '{}');
    expect(existsFilter).toMatchObject({ field: 'score', operator: 'is_not_empty' });
    expect(existsFilter).not.toHaveProperty('value');

    await selectFilterOption(page, ratingRule, 'Operator', "Doesn't Exist");
    await expect(ratingRule.locator('input[type="number"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'apply', exact: true }).click();

    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.getByRole('link', { name: ratedRecipeName })).toHaveCount(0);
    await expect(page.getByRole('link', { name: unratedRecipeName })).toBeVisible();
    const missingFilter = JSON.parse(new URL(page.url()).searchParams.get('filter') ?? '{}');
    expect(missingFilter).toMatchObject({ field: 'score', operator: 'is_empty' });
    expect(missingFilter).not.toHaveProperty('value');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes centers and resizes Rating and marker columns in Search and Query @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const recipeId = await createContractRecipe(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      {
        name: `Marker column layout ${randomUUID()}`,
        state: 'want_to_try',
        totalTime: null,
        notes: '',
      },
    );
    for (const marker of ['star', 'heart'] as const) {
      await setContractRecipeMarker(
        request,
        config.apiUrl,
        config.anonKey,
        user.accessToken,
        recipeId,
        marker,
      );
    }

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/find?tab=query&view=details');

    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await page.getByRole('checkbox', { name: 'Rating', exact: true }).check();
    await expect(page.locator('th[data-explorer-column="score"]')).toBeVisible();
    await page.keyboard.press('Escape');

    const table = page.locator('.find-recipes-list');
    const row = table.locator('tbody tr').filter({ hasText: /Marker column layout/ });
    await expect(row).toHaveCount(1);
    await expect(table.locator('thead tr')).toHaveCSS('border-bottom-width', '1px');
    await expect(table.locator('thead th').first()).toHaveCSS('border-bottom-width', '0px');
    await expect(row).toHaveCSS('border-bottom-width', '1px');
    await expect(row.locator('td').first()).toHaveCSS('border-bottom-width', '0px');

    const expectCentered = async (
      column: string,
      cell: Locator,
      content: Locator,
      measureCellText = false,
    ) => {
      const [cellBounds, measuredTextBounds] = await Promise.all([
        cell.boundingBox(),
        measureCellText
          ? cell.evaluate((element) => {
              const range = document.createRange();
              range.selectNodeContents(element);
              const { x, y, width, height } = range.getBoundingClientRect();
              return { x, y, width, height };
            })
          : Promise.resolve(null),
      ]);
      const contentBounds = measuredTextBounds ?? (await content.boundingBox());
      if (!cellBounds || !contentBounds) {
        throw new Error('Expected the Find Recipe column content to be measurable.');
      }
      const { expectedTrackCenter, visibleCenter } = await table.evaluate((element, columnKey) => {
        const preferences = element.closest<HTMLElement>('.explorer-list-preferences');
        const visibleColumns = preferences?.dataset.visibleColumns?.split(' ') ?? [];
        const columnWidths = getComputedStyle(element)
          .gridTemplateColumns.trim()
          .split(/\s+/)
          .map(Number.parseFloat);
        const columnIndex = visibleColumns.indexOf(columnKey);
        if (columnIndex < 0 || columnWidths[columnIndex] === undefined) {
          throw new Error(`The ${columnKey} column must have a rendered grid track.`);
        }
        const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
        const offset = columnWidths
          .slice(0, columnIndex)
          .reduce((total, width) => total + width + gap, 0);
        const trackCenter =
          element.getBoundingClientRect().left + offset + columnWidths[columnIndex] / 2;
        return { expectedTrackCenter: trackCenter, visibleCenter: trackCenter - gap / 2 };
      }, column);
      expect(
        Math.abs(cellBounds.x + cellBounds.width / 2 - expectedTrackCenter),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(visibleCenter - (contentBounds.x + contentBounds.width / 2)),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          cellBounds.y + cellBounds.height / 2 - (contentBounds.y + contentBounds.height / 2),
        ),
      ).toBeLessThanOrEqual(1);
    };
    const expectResizeHandleCentered = async (column: string) => {
      const header = table.locator(`th[data-explorer-column="${column}"]`);
      const handle = header.locator(`[data-explorer-resize-column="${column}"]`);
      const [headerBounds, handleBounds] = await Promise.all([
        header.boundingBox(),
        handle.boundingBox(),
      ]);
      if (!headerBounds || !handleBounds) {
        throw new Error(`Expected the ${column} column resize handle to be measurable.`);
      }
      expect(
        Math.abs(handleBounds.x + handleBounds.width / 2 - (headerBounds.x + headerBounds.width)),
      ).toBeLessThanOrEqual(1);
    };

    const expectColumnsCentered = async () => {
      await expect(table.locator('th[data-explorer-column="score"]')).toContainText('Rtg');
      await expectResizeHandleCentered('score');
      await expectCentered(
        'score',
        table.locator('th[data-explorer-column="score"]'),
        table.locator('th[data-explorer-column="score"] abbr'),
      );
      await expectCentered(
        'score',
        row.locator('td[data-explorer-column="score"]'),
        row.locator('td[data-explorer-column="score"]').getByText('—', { exact: true }),
        true,
      );
      for (const [column, marker] of [
        ['starred', 'star'],
        ['hearted', 'heart'],
      ] as const) {
        await expectResizeHandleCentered(column);
        await expectCentered(
          column,
          table.locator(`th[data-explorer-column="${column}"]`),
          table.locator(`th[data-explorer-column="${column}"] .recipe-marker-column-heading`),
        );
        await expectCentered(
          column,
          row.locator(`td[data-explorer-column="${column}"]`),
          row.locator(`td[data-explorer-column="${column}"] .recipe-marker-stamp`),
        );
        await expect(table.locator(`th[data-explorer-column="${column}"]`)).toContainText(
          marker === 'star' ? 'Star' : 'Heart',
        );
      }
    };

    await expectColumnsCentered();

    for (const [column, minWidth, maxWidth] of [
      ['score', 64, 120],
      ['starred', 56, 96],
      ['hearted', 56, 96],
    ] as const) {
      const header = table.locator(`th[data-explorer-column="${column}"]`);
      const handle = header.locator(`[data-explorer-resize-column="${column}"]`);
      for (const width of [maxWidth, minWidth]) {
        const [headerBounds, handleBounds] = await Promise.all([
          header.boundingBox(),
          handle.boundingBox(),
        ]);
        if (!headerBounds || !handleBounds) {
          throw new Error(`Expected the ${column} column and resize handle to be measurable.`);
        }
        const startX = Math.min(
          handleBounds.x + handleBounds.width / 2,
          headerBounds.x + headerBounds.width - 1,
        );
        const centerY = handleBounds.y + handleBounds.height / 2;
        const resizeHandleAtPointer = await page.evaluate(
          ({ x, y }) =>
            document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-explorer-resize-column]')
              ?.dataset.explorerResizeColumn ?? null,
          { x: startX, y: centerY },
        );
        expect(resizeHandleAtPointer).toBe(column);
        await page.mouse.move(startX, centerY);
        await page.mouse.down();
        await page.mouse.move(startX + width - headerBounds.width, centerY, { steps: 6 });
        await page.mouse.up();
        await expect
          .poll(async () => Math.round((await header.boundingBox())?.width ?? 0))
          .toBe(width);
      }
    }

    await page.goto('/recipes/find?tab=search&view=details');
    await expect(row).toHaveCount(1);
    await expectColumnsCentered();
    await expect(page.locator('.recipe-marker-filters')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filter recipes by Star' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filter recipes by Heart' })).toBeVisible();
    await expect(table.locator('th[data-explorer-column="starred"]')).toHaveCSS('width', '56px');
    await expect(table.locator('th[data-explorer-column="hearted"]')).toHaveCSS('width', '56px');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Details honors column minimums and scrolls instead of compressing @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: `Column minimums ${randomUUID()}`,
      state: 'want_to_try',
      totalTime: null,
      notes: '',
    });

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/find?view=details');
    await expect(page.locator('.find-recipes-list tbody tr')).toContainText('Column minimums');
    await expect(page.locator('.recipe-list-scroll-hint')).toHaveCount(0);

    await page.getByRole('button', { name: 'Choose List columns' }).click();
    for (const column of [
      'Makes',
      'Visibility',
      'Total Time',
      'Date Added',
      'Date Changed',
      'Calories',
      'Main Ingredients',
      'Pairs With',
    ]) {
      await page.getByRole('checkbox', { name: column, exact: true }).check();
    }
    await page.keyboard.press('Escape');

    const table = page.locator('.find-recipes-list');
    await expect(table.locator('tbody tr')).toContainText('Column minimums');
    const layout = await table.evaluate((element) => {
      const container = element.parentElement;
      return {
        widths: Object.fromEntries(
          [...element.querySelectorAll('thead th')].map((header) => [
            header.getAttribute('data-explorer-column'),
            header.getBoundingClientRect().width,
          ]),
        ),
        scrollWidth: container?.scrollWidth ?? 0,
        clientWidth: container?.clientWidth ?? 0,
      };
    });
    expect(layout.widths.name).toBeGreaterThanOrEqual(180);
    expect(layout.widths.publication).toBeGreaterThanOrEqual(152);
    expect(layout.widths.visibility).toBeGreaterThanOrEqual(136);
    expect(layout.widths.main_ingredients).toBeGreaterThanOrEqual(152);
    expect(layout.widths.makes).toBeGreaterThanOrEqual(96);
    expect(layout.widths.created_at).toBeGreaterThanOrEqual(96);
    expect(layout.widths.updated_at).toBeGreaterThanOrEqual(96);
    expect(layout.scrollWidth).toBeGreaterThan(layout.clientWidth);

    const [nameBounds, publicationBounds] = await Promise.all([
      table.locator('th[data-explorer-column="name"]').boundingBox(),
      table.locator('th[data-explorer-column="publication"]').boundingBox(),
    ]);
    if (!nameBounds || !publicationBounds) {
      throw new Error('Expected the Name and Publication headers to be measurable.');
    }
    expect(nameBounds.x + nameBounds.width).toBeLessThanOrEqual(publicationBounds.x);
    const scrollHint = page.locator('.recipe-list-scroll-hint');
    await expect(scrollHint).toContainText('More columns are offscreen');
    const [scrollHintBounds, tableBounds] = await Promise.all([
      scrollHint.boundingBox(),
      table.boundingBox(),
    ]);
    if (!scrollHintBounds || !tableBounds) {
      throw new Error('The overflow hint and recipe table should be measurable.');
    }
    expect(scrollHintBounds.y + scrollHintBounds.height).toBeLessThanOrEqual(tableBounds.y);
    await expect(page.locator('.recipe-list-scroll')).toHaveCSS('overflow-x', 'auto');
    await expect(page.locator('.recipe-list-scroll')).toHaveAttribute('tabindex', '0');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLayout = await page.locator('.recipe-list-scroll').evaluate((element) => {
      const row = element.querySelector('.find-recipes-list tbody tr');
      const bounds = element.getBoundingClientRect();
      return {
        overflows: element.scrollWidth > element.clientWidth + 1,
        rowFlexWrap: row ? getComputedStyle(row).flexWrap : null,
        visibleCellsFit: [...(row?.querySelectorAll('td') ?? [])]
          .filter((cell) => getComputedStyle(cell).display !== 'none')
          .every((cell) => {
            const cellBounds = cell.getBoundingClientRect();
            return cellBounds.left >= bounds.left - 1 && cellBounds.right <= bounds.right + 1;
          }),
      };
    });
    expect(mobileLayout.rowFlexWrap).toBe('wrap');
    expect(mobileLayout.overflows).toBe(false);
    expect(mobileLayout.visibleCellsFit).toBe(true);
    await expect(scrollHint).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBeTruthy();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(scrollHint).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBeTruthy();

    for (const column of ['visibility', 'main_ingredients']) {
      const heading = table.locator(
        `th[data-explorer-column="${column}"] .recipe-list-column-heading`,
      );
      const dimensions = await heading.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    }

    for (const column of ['starred', 'hearted']) {
      const markerHeader = table.locator(`th[data-explorer-column="${column}"]`);
      await markerHeader.scrollIntoViewIfNeeded();
      await expect(markerHeader).toBeInViewport();
    }
    expect(
      await table.evaluate((element) => element.parentElement?.scrollLeft ?? 0),
    ).toBeGreaterThan(0);

    const publicationHeader = table.locator('th[data-explorer-column="publication"]');
    await expect(publicationHeader).toHaveCSS('width', '152px');
    const publicationHeading = await publicationHeader
      .locator('.recipe-list-column-heading')
      .evaluate((heading) => ({
        clientWidth: heading.clientWidth,
        scrollWidth: heading.scrollWidth,
      }));
    expect(publicationHeading.scrollWidth).toBeLessThanOrEqual(publicationHeading.clientWidth);

    const makesHeader = table.locator('th[data-explorer-column="makes"]');
    await makesHeader.scrollIntoViewIfNeeded();
    const [headerBounds, handleBounds] = await Promise.all([
      makesHeader.boundingBox(),
      makesHeader.locator('[data-explorer-resize-column="makes"]').boundingBox(),
    ]);
    if (!headerBounds || !handleBounds) {
      throw new Error('Expected the Makes column and resize handle to be measurable.');
    }
    const startX = Math.min(
      handleBounds.x + handleBounds.width / 2,
      headerBounds.x + headerBounds.width - 1,
    );
    const centerY = handleBounds.y + handleBounds.height / 2;
    await page.mouse.move(startX, centerY);
    await page.mouse.down();
    await page.mouse.move(startX + 96 - headerBounds.width, centerY, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await makesHeader.boundingBox())?.width ?? 0))
      .toBe(96);
    const makesHeading = await makesHeader
      .locator('.recipe-list-column-heading')
      .evaluate((heading) => ({
        clientWidth: heading.clientWidth,
        scrollWidth: heading.scrollWidth,
      }));
    expect(makesHeading.scrollWidth).toBeLessThanOrEqual(makesHeading.clientWidth);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find mobile Details aligns active markers with recipe titles @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const recipeName = `Mobile marker title ${randomUUID()} ${'long recipe name '.repeat(5)}`;
    const ratingOnlyRecipeName = `Grid rating only ${randomUUID()}`;
    const heartOnlyRecipeName = `Grid heart only ${randomUUID()}`;
    const twoSignalRecipeName = `Grid two signals ${randomUUID()}`;
    const recipeId = await createContractRecipe(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      {
        name: recipeName,
        state: 'tried',
        totalTime: null,
        notes: '',
        score: -3,
      },
    );
    for (const marker of ['star', 'heart'] as const) {
      await setContractRecipeMarker(
        request,
        config.apiUrl,
        config.anonKey,
        user.accessToken,
        recipeId,
        marker,
      );
    }
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: ratingOnlyRecipeName,
      state: 'tried',
      totalTime: null,
      notes: '',
      score: 2,
    });
    const heartOnlyRecipeId = await createContractRecipe(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      {
        name: heartOnlyRecipeName,
        state: 'want_to_try',
        totalTime: null,
        notes: '',
      },
    );
    await setContractRecipeMarker(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      heartOnlyRecipeId,
      'heart',
    );
    const twoSignalRecipeId = await createContractRecipe(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      {
        name: twoSignalRecipeName,
        state: 'tried',
        totalTime: null,
        notes: '',
        score: 0,
      },
    );
    await setContractRecipeMarker(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      twoSignalRecipeId,
      'star',
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.goto('/recipes/find?tab=search&view=details');

    const listColumnsButton = page.getByRole('button', { name: 'Choose List columns' });
    const expectColumnChooserConnected = async () => {
      const viewControls = page.locator('.recipe-explorer-view-controls');
      await expect(listColumnsButton).toBeVisible();
      await expect(viewControls).toBeVisible();
      const geometry = await page.evaluate(() => {
        const chooser = document.querySelector('.explorer-list-preferences-trigger');
        const controls = document.querySelector('.recipe-explorer-view-controls');
        if (!chooser || !controls) return null;
        const chooserBounds = chooser.getBoundingClientRect();
        const controlsBounds = controls.getBoundingClientRect();
        return {
          chooser: {
            x: chooserBounds.x,
            y: chooserBounds.y,
            width: chooserBounds.width,
          },
          controls: {
            x: controlsBounds.x,
            y: controlsBounds.y,
            width: controlsBounds.width,
          },
        };
      });
      if (!geometry) throw new Error('Expected mobile view and column control geometry.');
      expect(Math.abs(geometry.chooser.y - geometry.controls.y)).toBeLessThanOrEqual(1);
      const chooserBeforeControls =
        Math.abs(geometry.chooser.x + geometry.chooser.width - geometry.controls.x) <= 1;
      const controlsBeforeChooser =
        Math.abs(geometry.controls.x + geometry.controls.width - geometry.chooser.x) <= 1;
      expect(chooserBeforeControls || controlsBeforeChooser).toBe(true);
      await expect(listColumnsButton).toHaveCSS(
        chooserBeforeControls ? 'border-right-width' : 'border-left-width',
        '0px',
      );
    };

    await expect(listColumnsButton).toHaveCSS('width', '40px');
    await expect(listColumnsButton).toHaveCSS('height', '40px');
    await expectColumnChooserConnected();
    await page.getByRole('tab', { name: 'Query' }).click();
    await expect(page.locator('.recipe-marker-filters')).toHaveCount(0);
    await expect(listColumnsButton).toHaveCSS('width', '40px');
    await expect(listColumnsButton).toHaveCSS('height', '40px');
    await expectColumnChooserConnected();
    await page.getByRole('tab', { name: 'Search' }).click();
    await expect(page.locator('.recipe-marker-filters')).toBeVisible();

    const table = page.locator('.find-recipes-list');
    const row = table.locator('tbody tr').filter({ hasText: recipeName });
    await expect(row).toHaveCount(1);
    await expect(row.locator('td[data-explorer-column="score"]')).toBeHidden();
    const titleBounds = await row.locator('.find-recipes-mobile-title').boundingBox();
    const titleRowBounds = await row.locator('.mobile-details-title-row').boundingBox();
    const markerGroupBounds = await row.locator('.mobile-details-title-markers').boundingBox();
    const starStampBounds = await row
      .locator(
        '.mobile-details-title-markers [data-explorer-column="starred"] .recipe-marker-stamp',
      )
      .boundingBox();
    const heartStampBounds = await row
      .locator(
        '.mobile-details-title-markers [data-explorer-column="hearted"] .recipe-marker-stamp',
      )
      .boundingBox();
    const mobileRating = row.locator('.mobile-details-title-rating');
    const ratingBounds = await mobileRating.boundingBox();
    const ratingTextBounds = await mobileRating
      .locator(':scope > span:not(.visually-hidden)')
      .boundingBox();
    const starIconBounds = await row
      .locator(
        '.mobile-details-title-markers [data-explorer-column="starred"] .recipe-marker-stamp svg',
      )
      .boundingBox();
    const heartIconBounds = await row
      .locator(
        '.mobile-details-title-markers [data-explorer-column="hearted"] .recipe-marker-stamp svg',
      )
      .boundingBox();
    const metadataBounds = await row.locator('.find-recipes-mobile-metadata').boundingBox();
    const titleOverflow = await row.locator('.find-recipes-mobile-title').evaluate((element) => ({
      clientWidth: element.clientWidth,
      overflow: getComputedStyle(element).overflow,
      scrollWidth: element.scrollWidth,
      textOverflow: getComputedStyle(element).textOverflow,
    }));
    const viewControlsBounds = await page.locator('.recipe-explorer-view-controls').boundingBox();
    const markerFiltersBounds = await page.locator('.recipe-marker-filters').boundingBox();
    const starFilterBounds = await page
      .getByRole('button', { name: 'Filter recipes by Star' })
      .boundingBox();
    const rowBounds = await row.boundingBox();

    await expect(row.locator('.mobile-details-title-markers')).toBeVisible();
    await expect(mobileRating.locator('.visually-hidden')).toHaveText('Rating ');
    await expect(mobileRating.locator('.recipe-score-negative')).toHaveText('-3');
    await expect(mobileRating.locator('.recipe-score-negative')).toHaveCSS(
      'color',
      'rgb(180, 62, 50)',
    );
    await expect(row.locator('.find-recipes-mobile-metadata')).not.toContainText('Rating');
    await expect(row.locator('.find-recipes-mobile-metadata .recipe-marker-stamp')).toHaveCount(0);
    await expect(row.locator('td[data-explorer-column="starred"]')).toBeHidden();
    await expect(row.locator('td[data-explorer-column="hearted"]')).toBeHidden();
    expect(titleBounds).not.toBeNull();
    expect(titleRowBounds).not.toBeNull();
    expect(titleOverflow.scrollWidth).toBeGreaterThan(titleOverflow.clientWidth);
    expect(titleOverflow.overflow).toBe('hidden');
    expect(titleOverflow.textOverflow).toBe('ellipsis');
    expect(markerGroupBounds).not.toBeNull();
    expect(ratingBounds).not.toBeNull();
    expect(ratingTextBounds).not.toBeNull();
    expect(starStampBounds).not.toBeNull();
    expect(heartStampBounds).not.toBeNull();
    expect(starIconBounds).not.toBeNull();
    expect(heartIconBounds).not.toBeNull();
    expect(metadataBounds).not.toBeNull();
    expect(viewControlsBounds).not.toBeNull();
    expect(markerFiltersBounds).not.toBeNull();
    expect(starFilterBounds).not.toBeNull();
    expect(rowBounds).not.toBeNull();
    if (
      !titleBounds ||
      !titleRowBounds ||
      !markerGroupBounds ||
      !ratingBounds ||
      !ratingTextBounds ||
      !starStampBounds ||
      !heartStampBounds ||
      !starIconBounds ||
      !heartIconBounds ||
      !metadataBounds ||
      !viewControlsBounds ||
      !markerFiltersBounds ||
      !starFilterBounds ||
      !rowBounds
    ) {
      throw new Error('Expected mobile Find title, marker, metadata, and toolbar geometry.');
    }
    const titleCenterY = titleBounds.y + titleBounds.height / 2;
    const starCenterY = starStampBounds.y + starStampBounds.height / 2;
    const heartCenterY = heartStampBounds.y + heartStampBounds.height / 2;
    const ratingCenterY = ratingBounds.y + ratingBounds.height / 2;
    expect(Math.abs(titleCenterY - ratingCenterY)).toBeLessThanOrEqual(1);
    expect(Math.abs(titleCenterY - starCenterY)).toBeLessThanOrEqual(1);
    expect(Math.abs(titleCenterY - heartCenterY)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(titleCenterY - (starIconBounds.y + starIconBounds.height / 2) - 2),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(titleCenterY - (heartIconBounds.y + heartIconBounds.height / 2) - 2),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        starIconBounds.x -
          ratingTextBounds.x -
          ratingTextBounds.width -
          (heartIconBounds.x - starIconBounds.x - starIconBounds.width),
      ),
    ).toBeLessThanOrEqual(1);
    expect(starStampBounds.x + starStampBounds.width).toBeLessThan(heartStampBounds.x);
    expect(ratingBounds.x + ratingBounds.width).toBeLessThan(starStampBounds.x);
    expect(heartStampBounds.x + heartStampBounds.width).toBeLessThanOrEqual(
      titleRowBounds.x + titleRowBounds.width - 7,
    );
    expect(
      Math.abs(
        markerGroupBounds.x + markerGroupBounds.width - (titleRowBounds.x + titleRowBounds.width),
      ),
    ).toBeLessThanOrEqual(1);
    expect(metadataBounds.y).toBeGreaterThanOrEqual(titleRowBounds.y + titleRowBounds.height);
    expect(
      Math.abs(
        markerFiltersBounds.y +
          markerFiltersBounds.height / 2 -
          (viewControlsBounds.y + viewControlsBounds.height / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(markerFiltersBounds.x + markerFiltersBounds.width).toBeLessThanOrEqual(
      viewControlsBounds.x,
    );
    expect(starFilterBounds.width).toBe(40);
    expect(starFilterBounds.height).toBe(40);
    expect(
      Math.abs(titleRowBounds.x + titleRowBounds.width - (rowBounds.x + rowBounds.width)),
    ).toBeLessThanOrEqual(1);

    await page.getByRole('tab', { name: 'Query' }).click();
    await expect(row.locator('.mobile-details-title-rating .recipe-score-negative')).toHaveText(
      '-3',
    );
    await expect(page.locator('.recipe-marker-filters')).toHaveCount(0);
    const queryTitleBounds = await row.locator('.mobile-details-title-text').boundingBox();
    const queryRatingBounds = await row.locator('.mobile-details-title-rating').boundingBox();
    const queryStarBounds = await row
      .locator(
        '.mobile-details-title-markers [data-explorer-column="starred"] .recipe-marker-stamp',
      )
      .boundingBox();
    const queryHeartBounds = await row
      .locator(
        '.mobile-details-title-markers [data-explorer-column="hearted"] .recipe-marker-stamp',
      )
      .boundingBox();
    const queryRatingTextBounds = await row
      .locator('.mobile-details-title-rating > span:not(.visually-hidden)')
      .boundingBox();
    const queryStarIconBounds = await row
      .locator(
        '.mobile-details-title-markers [data-explorer-column="starred"] .recipe-marker-stamp svg',
      )
      .boundingBox();
    const queryHeartIconBounds = await row
      .locator(
        '.mobile-details-title-markers [data-explorer-column="hearted"] .recipe-marker-stamp svg',
      )
      .boundingBox();
    expect(queryTitleBounds).not.toBeNull();
    expect(queryRatingBounds).not.toBeNull();
    expect(queryStarBounds).not.toBeNull();
    expect(queryHeartBounds).not.toBeNull();
    expect(queryRatingTextBounds).not.toBeNull();
    expect(queryStarIconBounds).not.toBeNull();
    expect(queryHeartIconBounds).not.toBeNull();
    if (
      !queryTitleBounds ||
      !queryRatingBounds ||
      !queryStarBounds ||
      !queryHeartBounds ||
      !queryRatingTextBounds ||
      !queryStarIconBounds ||
      !queryHeartIconBounds
    ) {
      throw new Error('Expected mobile Query Details title, Rating, and marker geometry.');
    }
    const queryTitleCenterY = queryTitleBounds.y + queryTitleBounds.height / 2;
    expect(
      Math.abs(queryTitleCenterY - (queryRatingBounds.y + queryRatingBounds.height / 2)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(queryTitleCenterY - (queryStarBounds.y + queryStarBounds.height / 2)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(queryTitleCenterY - (queryHeartBounds.y + queryHeartBounds.height / 2)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(queryTitleCenterY - (queryStarIconBounds.y + queryStarIconBounds.height / 2) - 2),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(queryTitleCenterY - (queryHeartIconBounds.y + queryHeartIconBounds.height / 2) - 2),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        queryStarIconBounds.x -
          queryRatingTextBounds.x -
          queryRatingTextBounds.width -
          (queryHeartIconBounds.x - queryStarIconBounds.x - queryStarIconBounds.width),
      ),
    ).toBeLessThanOrEqual(1);

    for (const tab of ['search', 'query'] as const) {
      for (const viewport of [
        { width: 1280, height: 900 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/recipes/find?tab=${tab}&view=grid`);
        const gridPillFixtures = [
          { name: recipeName, markerCount: 2, hasRating: true },
          ...(tab === 'search' && viewport.width === 390
            ? [
                { name: ratingOnlyRecipeName, markerCount: 0, hasRating: true },
                { name: heartOnlyRecipeName, markerCount: 1, hasRating: false },
                { name: twoSignalRecipeName, markerCount: 1, hasRating: true },
              ]
            : []),
        ];
        for (const fixture of gridPillFixtures) {
          const card = page.locator('.find-recipes-grid li').filter({ hasText: fixture.name });
          const gridStack = card.locator('.recipe-grid-marker-indicators');
          const gridContent = gridStack.locator('.recipe-grid-marker-content');
          const markerStack = gridStack.locator('.recipe-marker-indicators');
          const gridRating = gridStack.locator('.recipe-grid-rating-indicator');
          const [gridStackBounds, gridContentBounds] = await Promise.all([
            gridStack.boundingBox(),
            gridContent.boundingBox(),
          ]);
          const gridRatingBounds = fixture.hasRating ? await gridRating.boundingBox() : null;
          await expect(card).toHaveCount(1);
          await expect(card).toHaveAttribute('data-stripe-cell', /^(odd|even)$/);
          await expect(gridStack).toHaveCSS('border-radius', '9999px');
          await expect(gridStack).toHaveCSS('min-height', '32px');
          await expect(gridStack).toHaveCSS('min-width', '32px');
          await expect(card.locator('.find-recipes-grid-metadata')).not.toContainText('Rating');
          await expect(markerStack.locator('svg')).toHaveCount(fixture.markerCount);
          await expect(gridRating).toHaveCount(fixture.hasRating ? 1 : 0);
          expect(gridStackBounds).not.toBeNull();
          expect(gridContentBounds).not.toBeNull();
          if (!gridStackBounds || !gridContentBounds) {
            throw new Error('Expected the Grid pill and its content to have measurable bounds.');
          }
          const [pillBackground, cardBackground] = await Promise.all([
            gridStack.evaluate((element) => getComputedStyle(element).backgroundColor),
            card.evaluate((element) => getComputedStyle(element).backgroundColor),
          ]);
          expect(pillBackground).not.toBe('rgba(0, 0, 0, 0)');
          expect(pillBackground).toBe(cardBackground);
          expect(gridStackBounds.width).toBe(32);
          expect(gridStackBounds.height).toBeGreaterThanOrEqual(32);
          expect(gridStackBounds.height).toBeCloseTo(gridContentBounds.height + 8, 0);
          expect(
            Math.abs(
              gridStackBounds.y +
                gridStackBounds.height / 2 -
                (gridContentBounds.y + gridContentBounds.height / 2),
            ),
          ).toBeLessThanOrEqual(1);
          expect(gridContentBounds.width).toBe(24);
          const signalBounds = await gridContent
            .locator('svg, .recipe-grid-rating-indicator')
            .evaluateAll((signals) =>
              signals.map((signal) => {
                const bounds = signal.getBoundingClientRect();
                return { y: bounds.y, height: bounds.height };
              }),
            );
          expect(signalBounds).toHaveLength(fixture.markerCount + (fixture.hasRating ? 1 : 0));
          expect(signalBounds.every(({ height }) => height === 16)).toBe(true);
          for (const [index, signal] of signalBounds.entries()) {
            const previousSignal = signalBounds[index - 1];
            if (previousSignal) {
              expect(signal.y - previousSignal.y).toBeCloseTo(21, 0);
            }
          }
          if (fixture.hasRating) {
            expect(gridRatingBounds).not.toBeNull();
            if (!gridRatingBounds) {
              throw new Error('Expected the Grid Rating to have measurable bounds.');
            }
            await expect(gridRating).toHaveCSS('width', '24px');
            await expect(gridRating).toHaveCSS('height', '16px');
          }
          if (fixture.name === recipeName) {
            await expect(markerStack).toHaveAttribute('aria-label', 'Starred, Hearted');
            await expect(gridRating.locator('.visually-hidden')).toHaveText('Rating ');
            await expect(gridRating).toHaveClass(/recipe-score-negative/);
            await expect(gridRating).toContainText('-3');
            await expect(gridRating).toHaveCSS('color', 'rgb(180, 62, 50)');
            expect(gridRatingBounds).not.toBeNull();
            if (!gridRatingBounds) {
              throw new Error('Expected the negative Grid Rating to have measurable bounds.');
            }
            const markerStackBounds = await markerStack.boundingBox();
            expect(markerStackBounds).not.toBeNull();
            if (!markerStackBounds) {
              throw new Error('Expected the Grid markers to have measurable bounds.');
            }
            expect(gridStackBounds.y).toBeLessThan(markerStackBounds.y);
            expect(gridStackBounds.y + gridStackBounds.height).toBeGreaterThan(
              markerStackBounds.y + markerStackBounds.height,
            );
            expect(gridRatingBounds.y).toBeGreaterThanOrEqual(
              markerStackBounds.y + markerStackBounds.height,
            );
          }
        }
      }
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes updates mobile metadata when columns are toggled @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: 'Mobile column visibility recipe',
      state: 'want_to_try',
      totalTime: 20,
      notes: '',
    });

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/recipes/find?sort=name&direction=asc&page=1&view=details');

    const recipeRow = page
      .locator('.find-recipes-list tbody tr')
      .filter({ has: page.getByRole('link', { name: 'Mobile column visibility recipe' }) });
    const metadata = recipeRow.locator('.find-recipes-mobile-metadata');
    const stateSegment = metadata.locator('[data-explorer-column="state"]');
    const stateOption = page.getByRole('checkbox', { name: 'State', exact: true });
    const totalTimeOption = page.getByRole('checkbox', { name: 'Total Time', exact: true });
    const columnsButton = page.getByRole('button', { name: 'Choose List columns' });

    await columnsButton.click();
    await stateOption.check();
    await totalTimeOption.check();
    await expect(stateSegment).toBeVisible();
    await expect
      .poll(() => metadata.evaluate((element) => (element as HTMLElement).innerText))
      .toBe('Recipe Tin ~ Want to try ~ 20 min');
    await stateOption.uncheck();
    await expect(stateSegment).toBeHidden();
    await expect
      .poll(() => metadata.evaluate((element) => (element as HTMLElement).innerText))
      .toBe('Recipe Tin ~ 20 min');
    await stateOption.check();
    await expect(stateSegment).toBeVisible();
    await expect
      .poll(() => metadata.evaluate((element) => (element as HTMLElement).innerText))
      .toBe('Recipe Tin ~ Want to try ~ 20 min');
    await page.keyboard.press('Escape');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find mobile column filter stays open while scrolling its values @e2e', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    for (let index = 1; index <= 10; index += 1) {
      await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
        name: `Scrollable column facet ${String(index).padStart(2, '0')}`,
        state: 'want_to_try',
        totalTime: null,
        notes: '',
      });
    }

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.setViewportSize({ width: 390, height: 576 });
    await page.goto('/recipes/find?view=details');

    const filterButton = page.getByRole('button', { name: 'Filter Name' });
    await expect(filterButton).toBeVisible();
    await filterButton.click();
    const values = page.getByRole('group', { name: 'Name values' });
    await expect(values).toBeVisible();
    const popover = page.locator('.recipe-column-filter-popover');
    const deselectAll = popover.getByRole('button', { name: 'Deselect all' });
    const apply = popover.getByRole('button', { name: 'Apply', exact: true });
    await expect(deselectAll).toBeVisible();
    await expect(apply).toBeVisible();
    const [popoverBounds, deselectAllBounds, applyBounds, popoverScrollMetrics] = await Promise.all(
      [
        popover.boundingBox(),
        deselectAll.boundingBox(),
        apply.boundingBox(),
        popover.evaluate((element) => {
          const menu = element as HTMLElement;
          return { clientHeight: menu.clientHeight, scrollHeight: menu.scrollHeight };
        }),
      ],
    );
    if (!popoverBounds || !deselectAllBounds || !applyBounds) {
      throw new Error('The mobile column-filter actions should be measurable.');
    }
    expect(Math.abs(deselectAllBounds.y - applyBounds.y)).toBeLessThanOrEqual(1);
    expect(deselectAllBounds.x + deselectAllBounds.width).toBeLessThanOrEqual(applyBounds.x);
    expect(popoverScrollMetrics.scrollHeight).toBeLessThanOrEqual(
      popoverScrollMetrics.clientHeight + 1,
    );
    expect(applyBounds.y).toBeGreaterThanOrEqual(popoverBounds.y);
    expect(applyBounds.y + applyBounds.height).toBeLessThanOrEqual(
      popoverBounds.y + popoverBounds.height + 1,
    );
    expect(applyBounds.y + applyBounds.height).toBeLessThanOrEqual(576);
    const initialScrollMetrics = await values.evaluate((element) => {
      const list = element as HTMLElement;
      return { clientHeight: list.clientHeight, scrollHeight: list.scrollHeight };
    });
    expect(initialScrollMetrics.scrollHeight).toBeGreaterThan(initialScrollMetrics.clientHeight);

    const valuesBounds = await values.boundingBox();
    if (!valuesBounds) {
      throw new Error('The mobile column-filter values should be measurable.');
    }
    await page.mouse.move(
      valuesBounds.x + valuesBounds.width / 2,
      valuesBounds.y + valuesBounds.height / 2,
    );
    await page.mouse.wheel(0, 180);
    await expect
      .poll(() => values.evaluate((element) => (element as HTMLElement).scrollTop))
      .toBeGreaterThan(0);
    await expect(page.locator('.recipe-column-filter-popover')).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find mobile column filters use a picker and Clear all preserves search @e2e', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const searchTerm = `mobile filter ${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const selectedRecipeName = `${searchTerm} target`;
    const otherRecipeName = `${searchTerm} other`;
    const formatIngredientName = (value: string) =>
      value.replace(/\b[a-z]/gu, (letter) => letter.toUpperCase());
    const targetIngredient = formatIngredientName(`${searchTerm} target ingredient`);
    const otherIngredient = formatIngredientName(`${searchTerm} other ingredient`);
    for (const [name, ingredient] of [
      [selectedRecipeName, targetIngredient],
      [otherRecipeName, otherIngredient],
    ]) {
      await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
        name,
        state: 'want_to_try',
        totalTime: null,
        notes: '',
        ingredients: [ingredient],
        mainIngredients: [ingredient],
      });
    }

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.setViewportSize({ width: 390, height: 844 });
    const params = new URLSearchParams({
      q: searchTerm,
      sort: 'name',
      direction: 'asc',
      page: '1',
      view: 'details',
    });
    await page.goto(`/recipes/find?${params}`);

    const filters = page.getByRole('navigation', { name: 'Filter recipe columns' });
    const columnPicker = filters.getByRole('combobox', { name: 'Column to filter' });
    const clearAll = page.getByRole('button', { name: 'Clear all filters' });
    const filterButton = filters.getByRole('button', { name: 'Filter Name' });
    const targetLink = page.getByRole('link', { name: selectedRecipeName });
    const otherLink = page.getByRole('link', { name: otherRecipeName });
    await expect(targetLink).toBeVisible();
    await expect(otherLink).toBeVisible();
    await expect(clearAll).toHaveCount(0);
    await expect(columnPicker).toBeVisible();

    const [controlRowBounds, filterButtonBounds, pickerBounds] = await Promise.all([
      filters.locator('.find-recipes-mobile-filter-controls').boundingBox(),
      filterButton.boundingBox(),
      columnPicker.boundingBox(),
    ]);
    expect(controlRowBounds).not.toBeNull();
    expect(filterButtonBounds).not.toBeNull();
    expect(pickerBounds).not.toBeNull();
    if (!controlRowBounds || !filterButtonBounds || !pickerBounds) {
      throw new Error('Expected the mobile filter controls to have measurable bounds.');
    }
    const controlCenters = [filterButtonBounds, pickerBounds].map(
      ({ y, height }) => y + height / 2,
    );
    expect(Math.max(...controlCenters) - Math.min(...controlCenters)).toBeLessThanOrEqual(1);
    expect(filterButtonBounds.x + filterButtonBounds.width).toBeLessThanOrEqual(pickerBounds.x);
    expect(pickerBounds.x + pickerBounds.width).toBeLessThanOrEqual(
      controlRowBounds.x + controlRowBounds.width + 1,
    );

    await filterButton.click();
    const nameValues = page.getByRole('group', { name: 'Name values' });
    await expect(nameValues.getByRole('checkbox', { name: selectedRecipeName })).toBeVisible();
    await filters.getByRole('button', { name: 'Deselect all' }).click();
    await nameValues.getByRole('checkbox', { name: selectedRecipeName }).check();
    await filters.getByRole('button', { name: 'Apply', exact: true }).click();

    await expect(targetLink).toBeVisible();
    await expect(otherLink).toHaveCount(0);

    await expect(clearAll).toBeVisible();
    const mobileFilterControls = filters.locator('.find-recipes-mobile-filter-controls');
    const mobileColumnPicklist = filters.locator('.find-recipes-mobile-filter-picklist');
    const [activeFilterRowBounds, mobileClearBounds, mobileFilterButtonBounds] = await Promise.all([
      mobileFilterControls.boundingBox(),
      clearAll.boundingBox(),
      page.locator('.find-recipes-mobile-filters .recipe-column-filter-trigger').boundingBox(),
    ]);
    if (!activeFilterRowBounds || !mobileClearBounds || !mobileFilterButtonBounds) {
      throw new Error('The active mobile Details clear action should be measurable.');
    }
    expect(mobileClearBounds.height).toBe(mobileFilterButtonBounds.height);
    await expect(clearAll).toHaveCSS(
      'border-top-color',
      await mobileColumnPicklist.evaluate((picklist) => getComputedStyle(picklist).borderTopColor),
    );
    expect(mobileClearBounds.x).toBeGreaterThan(activeFilterRowBounds.x);
    expect(mobileClearBounds.x + mobileClearBounds.width).toBeLessThanOrEqual(
      activeFilterRowBounds.x + activeFilterRowBounds.width + 1,
    );
    const listUrl = new URL(page.url());
    listUrl.searchParams.set('view', 'list');
    await page.goto(listUrl.toString());
    await expect(clearAll).toBeVisible();
    await expect(clearAll).toHaveCSS('height', '40px');
    await expect(page.locator('.recipe-explorer-view-controls button').first()).toHaveCSS(
      'height',
      '40px',
    );
    const gridUrl = new URL(page.url());
    gridUrl.searchParams.set('view', 'grid');
    await page.goto(gridUrl.toString());
    await expect(clearAll).toBeVisible();
    await expect(clearAll).toHaveCSS('height', '40px');
    await clearAll.click();

    await expect(targetLink).toBeVisible();
    await expect(otherLink).toBeVisible();
    const clearedUrl = new URL(page.url());
    expect(clearedUrl.searchParams.get('q')).toBe(searchTerm);
    expect(clearedUrl.searchParams.has('column_name')).toBe(false);
    expect(clearedUrl.searchParams.get('view')).toBe('grid');
    await expect(clearAll).toHaveCount(0);
    const detailsUrl = new URL(page.url());
    detailsUrl.searchParams.set('view', 'details');
    await page.goto(detailsUrl.toString());

    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await page.getByRole('checkbox', { name: 'Main Ingredients', exact: true }).check();
    await page.keyboard.press('Escape');
    await columnPicker.click();
    const mainIngredientsOption = page.getByRole('option', {
      name: 'Main Ingredients',
      exact: true,
    });
    await expect(mainIngredientsOption).toBeVisible();
    await mainIngredientsOption.click();
    const mainIngredientsFilter = filters.getByRole('button', {
      name: 'Filter Main Ingredients',
    });
    await mainIngredientsFilter.click();
    const mainIngredientsValues = page.getByRole('group', {
      name: 'Main Ingredients values',
    });
    await expect(
      mainIngredientsValues.getByRole('checkbox', { name: targetIngredient, exact: true }),
    ).toBeVisible();
    await filters.getByRole('button', { name: 'Deselect all' }).click();
    await mainIngredientsValues
      .getByRole('checkbox', { name: targetIngredient, exact: true })
      .check();
    await filters.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(targetLink).toBeVisible();
    await expect(otherLink).toHaveCount(0);
    expect(new URL(page.url()).searchParams.getAll('column_main_ingredients')).toContain(
      targetIngredient,
    );
    await page.reload();
    await expect(targetLink).toBeVisible();
    await expect(otherLink).toHaveCount(0);
    await expect(clearAll).toBeEnabled();
    await Promise.all([
      page.waitForURL((url) => !url.searchParams.has('column_main_ingredients')),
      clearAll.click(),
    ]);
    await expect(targetLink).toBeVisible();
    await expect(otherLink).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    const scoreFilter = JSON.stringify({ field: 'score', operator: 'greater_than', value: 1 });
    const desktopParams = new URLSearchParams({
      filter: scoreFilter,
      tab: 'query',
      sort: 'name',
      direction: 'asc',
      view: 'grid',
    });
    await page.goto(`/recipes/find?${desktopParams}`);
    await expect(clearAll).toBeVisible();
    await expect(clearAll).toHaveCSS('height', '40px');
    const toolbar = page.locator('.explorer-list-preferences-toolbar');
    const [toolbarBounds, clearBounds] = await Promise.all([
      toolbar.boundingBox(),
      clearAll.boundingBox(),
    ]);
    if (!toolbarBounds || !clearBounds) {
      throw new Error('The desktop clear-filter action should be measurable.');
    }
    expect(
      Math.abs(clearBounds.x + clearBounds.width - toolbarBounds.x - toolbarBounds.width),
    ).toBeLessThanOrEqual(1);
    await clearAll.hover();
    await expect(clearAll).toHaveCSS('background-color', 'rgb(237, 244, 233)');
    await expect(clearAll).toHaveCSS('color', 'rgb(56, 96, 68)');
    await Promise.all([
      page.waitForURL((url) => !url.searchParams.has('filter')),
      clearAll.click(),
    ]);
    const clearedDesktopUrl = new URL(page.url());
    expect(clearedDesktopUrl.searchParams.has('filter')).toBe(false);
    expect(clearedDesktopUrl.searchParams.get('tab')).toBe('query');
    expect(clearedDesktopUrl.searchParams.get('view')).toBe('grid');
    await expect(clearAll).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('List column preferences do not change recipe Grid cards @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const missingKeyWarnings: string[] = [];
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text().includes('Each child in a list should have a unique "key" prop')
    ) {
      missingKeyWarnings.push(message.text());
    }
  });

  try {
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: 'Grid preference isolation recipe',
      state: 'tried',
      totalTime: 20,
      notes: '',
    });

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/find?view=details');

    const nameResizeHandle = page.locator(
      '.find-recipes-list [data-explorer-resize-column="name"]',
    );
    await expect(nameResizeHandle).toBeVisible();
    await expect(nameResizeHandle).toHaveAttribute('aria-hidden', 'true');
    expect(await nameResizeHandle.evaluate((element) => (element as HTMLElement).tabIndex)).toBe(
      -1,
    );

    const cards = page.locator('.find-recipes-grid li');
    const metadata = cards.locator('.find-recipes-grid-metadata');
    await page.getByRole('button', { name: 'Switch to List view' }).click();
    await page.getByRole('button', { name: 'Switch to Grid view' }).click();
    await expect(cards).toHaveCount(1);
    await expect(metadata).toHaveText('Recipe Tin ~ Tried ~ 20 min');
    await expect(metadata).toHaveCSS('color', 'rgb(36, 40, 32)');

    await page.getByRole('button', { name: 'Switch to Details view' }).click();
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await page.getByRole('checkbox', { name: 'Publication', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'State', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Total Time', exact: true }).uncheck();
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      'name visibility score starred hearted',
    );

    await page.getByRole('button', { name: 'Switch to List view' }).click();
    await page.getByRole('button', { name: 'Switch to Grid view' }).click();
    await expect(cards).toHaveCount(1);
    await expect(metadata).toHaveText('Recipe Tin ~ Tried ~ 20 min');

    const tinResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id&publication_type=eq.collection`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    );
    expect(tinResponse.ok(), await tinResponse.text()).toBeTruthy();
    const [{ id: tinId }] = (await tinResponse.json()) as { id: string }[];
    await page.goto(`/publications/${tinId}?view=grid`);
    const tinMetadata = page.locator('.find-recipes-grid-metadata').first();
    await expect(tinMetadata).toHaveText('Tried ~ 20 min');
    await expect(tinMetadata).toHaveCSS('color', 'rgb(40, 36, 32)');
    expect(missingKeyWarnings).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes searches indexed sources and isolates accounts @e2e', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const user = await createTestUser(request);
  const otherUser = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: {
          p_name: 'Search Source Magazine',
          p_publication_type: 'magazine',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: null,
        },
      },
    );
    expect(publicationResponse.ok(), await publicationResponse.text()).toBeTruthy();
    const publicationId = (await publicationResponse.json()) as string;

    const cookTimeTypeResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&category=eq.time_type&value=eq.Cook`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    );
    const cookTimeTypeBody = await cookTimeTypeResponse.text();
    expect(cookTimeTypeResponse.ok(), cookTimeTypeBody).toBeTruthy();
    const [cookTimeType] = JSON.parse(cookTimeTypeBody) as { id: string }[];
    expect(cookTimeType).toBeDefined();
    const ingredientSetId = randomUUID();

    const recipeResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/save_recipe_with_time_entries`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: {
          p_recipe_id: null,
          p_expected_version: null,
          p_name: 'Searchable saffron rice',
          p_food_type_id: null,
          p_state: 'want_to_try',
          p_verdict_id: null,
          p_enthusiasm_id: null,
          p_occasion_details: null,
          p_reason: null,
          p_serves: null,
          p_notes_markdown: 'A distinctive cardamom notesearch marker.',
          p_meal_type_ids: [],
          p_cuisine_ids: [],
          p_equipment_ids: [],
          p_ingredient_rows: [
            {
              recipe_ingredient_id: randomUUID(),
              ingredient_set_id: ingredientSetId,
              ingredient_id: null,
              ingredient_name: 'Searchable coriander ingredient',
              is_main: true,
              detail: 'toasted source marker',
              preparation: '',
              measurements: [],
            },
          ],
          p_instruction_steps: [
            {
              id: randomUUID(),
              position: 0,
              content_markdown: 'Fold the toasted spice into the rice.',
              plain_text: 'Fold in the saffroninstruction marker.',
            },
          ],
          p_publication_id: publicationId,
          p_publication_page: '42',
          p_recipe_url: null,
          p_recipe_relationships: {
            site_listing: null,
            pairings: [],
            references: [
              {
                id: randomUUID(),
                reference_type: 'printed_citation',
                display_text: 'The Saffron Kitchen, page 42',
                linked_recipe_id: null,
                publication_id: null,
                url: null,
              },
            ],
          },
          p_tag_ids: [],
          p_ingredient_sets: [{ id: ingredientSetId, label: 'Main', position: 0 }],
          p_score: null,
          p_makes_quantity: null,
          p_makes_thing: null,
          p_nutrition_overrides: {},
          p_time_entries: [{ time_type_id: cookTimeType.id, minutes: 20, position: 0 }],
        },
      },
    );
    expect(recipeResponse.ok(), await recipeResponse.text()).toBeTruthy();

    const secondRecipeResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/save_recipe_with_time_entries`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: {
          p_recipe_id: null,
          p_expected_version: null,
          p_name: 'Apricot roast with a very long title that wraps on a narrow screen',
          p_food_type_id: null,
          p_state: 'tried',
          p_verdict_id: null,
          p_enthusiasm_id: null,
          p_occasion_details: null,
          p_reason: null,
          p_serves: null,
          p_notes_markdown: '',
          p_meal_type_ids: [],
          p_cuisine_ids: [],
          p_equipment_ids: [],
          p_ingredient_rows: [],
          p_instruction_steps: [],
          p_publication_id: publicationId,
          p_publication_page: null,
          p_recipe_url: 'https://source.example.test/apricot-roast',
          p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
          p_tag_ids: [],
          p_ingredient_sets: [{ id: randomUUID(), label: 'Main', position: 0 }],
          p_score: null,
          p_makes_quantity: null,
          p_makes_thing: null,
          p_nutrition_overrides: {},
          p_time_entries: [],
        },
      },
    );
    expect(secondRecipeResponse.ok(), await secondRecipeResponse.text()).toBeTruthy();

    for (const query of ['coriander ingredient', 'saffroninstruction marker']) {
      const searchResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: { p_query: query, p_limit: 50, p_offset: 0 },
      });
      expect(searchResponse.ok(), await searchResponse.text()).toBeTruthy();
      const searchResults = (await searchResponse.json()) as { recipe_name: string }[];
      expect(searchResults.map(({ recipe_name }) => recipe_name)).toContain(
        'Searchable saffron rice',
      );
    }

    const ingredientOptionsResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id,name`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    );
    expect(ingredientOptionsResponse.ok(), await ingredientOptionsResponse.text()).toBeTruthy();
    const ingredientOptions = (await ingredientOptionsResponse.json()) as {
      id: string;
      name: string;
    }[];
    expect(
      ingredientOptions.map(({ name }) => name),
      'Authenticated ingredient catalog response',
    ).toContain('Searchable Coriander Ingredient');
    const ingredientId = ingredientOptions.find(
      ({ name }) => name.toLowerCase() === 'searchable coriander ingredient',
    )?.id;
    expect(ingredientId).toBeTruthy();

    const ingredientFilter = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_query: null,
        p_filters: [{ field: 'ingredient', operator: 'contains_any', value: [ingredientId] }],
        p_sort_key: 'name',
        p_limit: 50,
        p_offset: 0,
      },
    });
    expect(ingredientFilter.ok(), await ingredientFilter.text()).toBeTruthy();
    expect(
      ((await ingredientFilter.json()) as { recipe_name: string }[]).map(
        ({ recipe_name }) => recipe_name,
      ),
    ).toEqual(['Searchable saffron rice']);

    const exactIngredientFilters = [
      {
        operator: 'is',
        value: [ingredientId],
        expectedNames: ['Searchable saffron rice'],
      },
      {
        operator: 'is',
        value: [ingredientId, 'unassigned-ingredient'],
        expectedNames: [],
      },
      {
        operator: 'is_not',
        value: [ingredientId],
        expectedNames: ['Apricot roast with a very long title that wraps on a narrow screen'],
      },
    ];
    for (const exactFilter of exactIngredientFilters) {
      const exactIngredientSearch = await request.post(
        `${config.apiUrl}/rest/v1/rpc/search_recipes`,
        {
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${user.accessToken}`,
          },
          data: {
            p_query: null,
            p_filters: [
              {
                field: 'ingredient',
                operator: exactFilter.operator,
                value: exactFilter.value,
              },
            ],
            p_sort_key: 'name',
            p_limit: 50,
            p_offset: 0,
          },
        },
      );
      expect(exactIngredientSearch.ok(), await exactIngredientSearch.text()).toBeTruthy();
      expect(
        ((await exactIngredientSearch.json()) as { recipe_name: string }[]).map(
          ({ recipe_name }) => recipe_name,
        ),
      ).toEqual(exactFilter.expectedNames);
    }

    const filteredSearch = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_query: 'saffron rice',
        p_filters: [
          { field: 'state', operator: 'in', value: ['want_to_try'] },
          { field: 'total_time_minutes', operator: 'between', value: 10, value_to: 30 },
        ],
        p_sort_key: 'total_time_minutes',
        p_sort_direction: 'asc',
        p_limit: 50,
        p_offset: 0,
      },
    });
    expect(filteredSearch.ok(), await filteredSearch.text()).toBeTruthy();
    expect(
      ((await filteredSearch.json()) as { recipe_name: string }[]).map(
        ({ recipe_name }) => recipe_name,
      ),
    ).toEqual(['Searchable saffron rice']);

    const sourceCases = [
      {
        field: 'publication_page',
        value: '42',
        expectedName: 'Searchable saffron rice',
        expectedFacet: [
          { facet_value: '42', facet_label: '42', recipe_count: 1 },
          { facet_value: '__blank__', facet_label: 'No page', recipe_count: 1 },
        ],
      },
      {
        field: 'recipe_url',
        value: 'https://source.example.test/apricot-roast',
        expectedName: 'Apricot roast with a very long title that wraps on a narrow screen',
        expectedFacet: [
          {
            facet_value: '__blank__',
            facet_label: 'No URL',
            recipe_count: 1,
          },
          {
            facet_value: 'https://source.example.test/apricot-roast',
            facet_label: 'https://source.example.test/apricot-roast',
            recipe_count: 1,
          },
        ],
      },
      {
        field: 'citation',
        value: 'The Saffron Kitchen, page 42',
        expectedName: 'Searchable saffron rice',
        expectedFacet: [
          {
            facet_value: '__blank__',
            facet_label: 'No citation',
            recipe_count: 1,
          },
          {
            facet_value: 'The Saffron Kitchen, page 42',
            facet_label: 'The Saffron Kitchen, page 42',
            recipe_count: 1,
          },
        ],
      },
    ] as const;

    for (const sourceCase of sourceCases) {
      const sourceFilter = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: {
          p_query: null,
          p_filters: [{ field: sourceCase.field, operator: 'in', value: [sourceCase.value] }],
          p_sort_key: 'name',
          p_limit: 50,
          p_offset: 0,
        },
      });
      expect(sourceFilter.ok(), await sourceFilter.text()).toBeTruthy();
      expect(
        ((await sourceFilter.json()) as { recipe_name: string }[]).map(
          ({ recipe_name }) => recipe_name,
        ),
      ).toEqual([sourceCase.expectedName]);

      const sourceFacets = await request.post(
        `${config.apiUrl}/rest/v1/rpc/recipe_search_facet_values`,
        {
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${user.accessToken}`,
          },
          data: { p_query: null, p_filters: [], p_facet_field: sourceCase.field },
        },
      );
      expect(sourceFacets.ok(), await sourceFacets.text()).toBeTruthy();
      expect(await sourceFacets.json()).toEqual(sourceCase.expectedFacet);
    }

    const firstPage = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_query: null,
        p_filters: [],
        p_sort_key: 'name',
        p_sort_direction: 'asc',
        p_limit: 1,
        p_offset: 0,
      },
    });
    expect(firstPage.ok(), await firstPage.text()).toBeTruthy();
    const firstPageResults = (await firstPage.json()) as {
      recipe_name: string;
      total_count: number;
    }[];
    expect(firstPageResults.map(({ recipe_name }) => recipe_name)).toEqual([
      'Apricot roast with a very long title that wraps on a narrow screen',
    ]);
    expect(firstPageResults[0]?.total_count).toBe(2);

    const secondPage = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_query: null,
        p_filters: [],
        p_sort_key: 'name',
        p_sort_direction: 'asc',
        p_limit: 1,
        p_offset: 1,
      },
    });
    expect(secondPage.ok(), await secondPage.text()).toBeTruthy();
    expect(
      ((await secondPage.json()) as { recipe_name: string }[]).map(
        ({ recipe_name }) => recipe_name,
      ),
    ).toEqual(['Searchable saffron rice']);

    const isolatedSearch = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${otherUser.accessToken}`,
      },
      data: { p_query: 'cardamom notesearch', p_limit: 50, p_offset: 0 },
    });
    expect(isolatedSearch.ok(), await isolatedSearch.text()).toBeTruthy();
    expect(await isolatedSearch.json()).toEqual([]);

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.goto('/publications');
    const searchLink = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Search' });
    await expect(searchLink).toBeVisible();
    const mainLinks = await page
      .getByRole('navigation', { name: 'Main navigation' })
      .locator('.private-nav-links a')
      .allTextContents();
    expect(mainLinks.indexOf('Search')).toBe(mainLinks.indexOf('Library') + 1);
    await searchLink.click();
    await expect(page).toHaveURL(/\/recipes\/find$/);
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', {
        name: 'Search',
      }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toBeVisible();
    await expect(page.getByText('YOUR COLLECTION', { exact: true })).toHaveCount(0);

    const searchTab = page.getByRole('tab', { name: 'Search' });
    const queryTab = page.getByRole('tab', { name: 'Query' });
    await queryTab.click();
    await expect(queryTab).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL((url) => url.searchParams.get('tab') === 'query');
    await searchTab.click();
    await expect(searchTab).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL((url) => url.searchParams.get('tab') === 'search');

    const searchInput = page.getByRole('searchbox', { name: 'Search recipes' });
    await searchInput.fill('cardamom notesearch');
    await expect(searchInput).toHaveValue('cardamom notesearch');
    await expect(searchInput).toHaveAttribute('name', 'q');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'cardamom notesearch');

    await expect(page.getByRole('link', { name: 'Searchable saffron rice' })).toBeVisible();
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.getByRole('button', { name: 'clear all', exact: true })).toHaveCount(0);
    await expect(searchTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Search' })).toBeVisible();
    await expect(page.getByRole('tabpanel', { name: 'Query' })).toBeHidden();
    await searchTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(queryTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveCount(0);
    await expect(page.getByRole('tabpanel', { name: 'Query' })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(searchTab).toHaveAttribute('aria-selected', 'true');
    const searchGeometry = await page.evaluate(() => {
      const searchInput = document.querySelector('#recipe-search');
      const searchButton = document.querySelector('.find-recipes-form-controls button');
      const controls = document.querySelector('.find-recipes-form-controls');
      const tabs = document.querySelector('.find-recipes-tabs');
      const searchPanel = document.querySelector('.find-recipes-tabpanel-search');
      if (!searchInput || !searchButton || !controls || !tabs || !searchPanel) return null;
      const inputBounds = searchInput.getBoundingClientRect();
      const buttonBounds = searchButton.getBoundingClientRect();
      const controlsBounds = controls.getBoundingClientRect();
      const tabsBounds = tabs.getBoundingClientRect();
      const searchPanelBounds = searchPanel.getBoundingClientRect();
      return {
        inputButtonGap: buttonBounds.left - inputBounds.right,
        tabPanelGap: searchPanelBounds.top - tabsBounds.bottom,
        searchHeight: inputBounds.height,
        buttonHeight: buttonBounds.height,
        controlsTop: controlsBounds.top,
      };
    });
    expect(searchGeometry).not.toBeNull();
    expect(searchGeometry?.inputButtonGap).toBe(18);
    expect(searchGeometry?.tabPanelGap).toBe(18);
    expect(searchGeometry?.buttonHeight).toBe(searchGeometry?.searchHeight);
    await queryTab.click();
    await page.getByRole('button', { name: 'Add rule' }).click();
    const initialRule = page.locator('.recipe-filter-row').first();
    await selectFilterOption(page, initialRule, 'Field', 'Publication Name');
    await initialRule.getByRole('combobox', { name: 'Operator' }).click();
    await expect(page.getByRole('option', { name: 'Is', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: "Isn't", exact: true })).toBeVisible();
    const selectedOperatorCheck = page
      .getByRole('option', { name: 'Is', exact: true })
      .locator('.single-picklist-check');
    await expect(selectedOperatorCheck).toHaveText('✓');
    await expect(selectedOperatorCheck).toHaveCSS('font-size', '16px');
    await expect(selectedOperatorCheck).toHaveCSS('border-radius', '0px');
    await page.keyboard.press('Escape');
    await initialRule.getByRole('button', { name: /^Value:/ }).click();
    await expect(
      page.getByRole('group', { name: 'Value options' }).getByRole('button', {
        name: 'Recipe Tin',
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await selectFilterOption(page, initialRule, 'Field', 'Name');
    await initialRule.getByRole('combobox', { name: 'Operator' }).click();
    await expect(page.getByRole('option', { name: 'Contains no', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: "Isn't Empty", exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await initialRule.getByLabel('Value').fill('saffron');
    await page.getByRole('button', { name: 'Add rule' }).click();
    const secondInitialRule = page.locator('.recipe-filter-row').nth(1);
    await selectFilterOption(page, secondInitialRule, 'Field', 'State');
    await selectFilterValue(page, secondInitialRule, 'Want to Try');
    await expect(secondInitialRule.locator('.recipe-filter-value-trigger')).toContainText(
      'Want to Try',
    );
    await searchTab.click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'clear all', exact: true })).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('');
    await queryTab.click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'clear all', exact: true })).toHaveCount(0);
    await searchTab.click();
    await expect(page.locator('#recipe-search')).toHaveValue('');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL((url) => {
      const params = new URL(url).searchParams;
      return (
        !params.has('q') && params.getAll('filter').length === 0 && params.get('tab') === 'search'
      );
    });
    await expect(page.getByText('2 recipes found')).toBeVisible();

    await queryTab.click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add rule' }).click();
    const independentRule = page.locator('.recipe-filter-row').first();
    await selectFilterOption(page, independentRule, 'Field', 'Name');
    await independentRule.getByLabel('Value').fill('saffron');
    await page.getByRole('button', { name: 'Add rule' }).click();
    const independentStateRule = page.locator('.recipe-filter-row').nth(1);
    await selectFilterOption(page, independentStateRule, 'Field', 'State');
    await selectFilterValue(page, independentStateRule, 'Want to Try');
    await page.getByRole('button', { name: 'clear all', exact: true }).click();
    await page.getByRole('button', { name: 'apply' }).click();
    await expect(page).toHaveURL((url) => {
      const searchParams = new URL(url).searchParams;
      return (
        !searchParams.has('q') &&
        searchParams.getAll('filter').length === 0 &&
        searchParams.get('tab') === 'query'
      );
    });
    await expect(page.getByText('2 recipes found')).toBeVisible();
    await searchTab.click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('2 recipes found')).toBeVisible();
    const secondRecipeRow = page.locator('.find-recipes-list tbody tr').nth(1);
    if ((page.viewportSize()?.width ?? 0) <= 720) {
      await expect(secondRecipeRow).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(secondRecipeRow.locator('td').first()).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
    } else {
      await expect(secondRecipeRow.locator('td').first()).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
    }

    if ((page.viewportSize()?.width ?? 0) > 700) {
      const nameFilterButton = page.getByRole('button', { name: 'Filter Name' });
      await nameFilterButton.scrollIntoViewIfNeeded();
      await nameFilterButton.click();
      await expect(nameFilterButton).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('group', { name: 'Name values' })).toBeVisible();
      await expect(page.getByLabel('Searchable saffron rice')).toBeChecked();
      await page
        .getByLabel('Apricot roast with a very long title that wraps on a narrow screen')
        .uncheck();
      await page
        .locator('.recipe-column-filter-popover')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect(page.getByText('1 recipe found')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Searchable saffron rice' })).toBeVisible();
      await expect(
        page.getByRole('link', {
          name: 'Apricot roast with a very long title that wraps on a narrow screen',
        }),
      ).toHaveCount(0);

      await page.getByRole('button', { name: 'Filter Name' }).click();
      await page.getByRole('button', { name: 'Deselect all' }).click();
      await page.getByRole('button', { name: 'Select all' }).click();
      await expect(
        page.getByLabel('Apricot roast with a very long title that wraps on a narrow screen'),
      ).toBeChecked();
      await expect(page.getByLabel('Searchable saffron rice')).toBeChecked();
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(page.getByText('2 recipes found')).toBeVisible();
    }

    await queryTab.click();
    await page.getByRole('button', { name: 'Add rule' }).click();
    const filterRows = page.locator('.recipe-filter-row');
    await expect(filterRows.nth(0).getByLabel('Field')).toBeFocused();
    await expect(filterRows.nth(0).locator('legend')).toHaveCount(0);
    await expect(filterRows.nth(0).getByLabel('Value')).toBeVisible();
    await expect(filterRows.nth(0).getByLabel('Value')).toBeDisabled();
    for (const labelClass of [
      '.recipe-filter-field-label',
      '.recipe-filter-operator-label',
      '.recipe-filter-value-label',
    ]) {
      await expect(filterRows.nth(0).locator(labelClass)).toHaveCSS('position', 'absolute');
      await expect(filterRows.nth(0).locator(labelClass)).toHaveCSS('clip-path', 'inset(50%)');
    }
    await selectFilterOption(page, filterRows.nth(0), 'Field', 'State');
    await selectFilterValue(page, filterRows.nth(0), 'Want to Try');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect(filterRows.nth(1).getByLabel('Field')).toBeFocused();
    await selectFilterOption(page, filterRows.nth(1), 'Field', 'Total Time');
    await selectFilterOption(page, filterRows.nth(1), 'Operator', 'Between');
    await filterRows.nth(1).getByLabel('Value').fill('10');
    await filterRows.nth(1).getByLabel('Through').fill('30');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await selectFilterOption(page, filterRows.nth(2), 'Field', 'Ingredient');
    await filterRows.nth(2).getByRole('combobox', { name: 'Operator' }).click();
    await expect(page.getByRole('option', { name: 'Is', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: "Isn't", exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Has', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Has Any', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: "Doesn't Have", exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await filterRows
      .nth(2)
      .getByRole('button', { name: /^Value:/ })
      .click();
    const ingredientValueOptions = page.getByRole('group', { name: 'Value options' });
    const valueOptionStyles = await ingredientValueOptions
      .getByText('Searchable Coriander Ingredient', { exact: true })
      .evaluate((element) => {
        const styles = getComputedStyle(element);
        return { fontSize: styles.fontSize, fontWeight: styles.fontWeight };
      });
    expect(valueOptionStyles).toEqual({ fontSize: '16px', fontWeight: '400' });
    await ingredientValueOptions
      .getByRole('button', { name: 'Searchable Coriander Ingredient' })
      .click();
    await page.keyboard.press('Escape');
    await page.mouse.move(0, 0);
    const lastRule = filterRows.nth(2);
    if ((page.viewportSize()?.width ?? 0) <= 700) {
      await lastRule.getByRole('button', { name: 'Expand filter 3' }).click();
      await expect(lastRule).toHaveAttribute('data-mobile-expanded', 'true');
    }
    const [
      ruleBounds,
      removeBounds,
      fieldBounds,
      operatorBounds,
      valueBounds,
      actionsBounds,
      addRuleBounds,
      clearAllBounds,
      applyBounds,
    ] = await Promise.all([
      lastRule.boundingBox(),
      lastRule.getByRole('button', { name: 'Remove filter 3' }).boundingBox(),
      lastRule.getByLabel('Field').boundingBox(),
      lastRule.getByLabel('Operator').boundingBox(),
      lastRule.getByRole('button', { name: /^Value:/ }).boundingBox(),
      page.locator('.recipe-filter-actions').boundingBox(),
      page.getByRole('button', { name: 'Add rule' }).boundingBox(),
      page.getByRole('button', { name: 'clear all', exact: true }).boundingBox(),
      page.getByRole('button', { name: 'apply', exact: true }).boundingBox(),
    ]);
    const [removeStrokeWidth, addRuleFontSize, rowBorder] = await Promise.all([
      lastRule
        .getByRole('button', { name: 'Remove filter 3' })
        .locator('svg')
        .getAttribute('stroke-width'),
      page
        .getByRole('button', { name: 'Add rule' })
        .evaluate((button) => getComputedStyle(button).fontSize),
      lastRule.evaluate((row) => getComputedStyle(row).borderTopWidth),
    ]);
    const [clearAllStyle, applyStyle] = await Promise.all([
      page.getByRole('button', { name: 'clear all', exact: true }).evaluate((button) => {
        const styles = getComputedStyle(button);
        return {
          backgroundColor: styles.backgroundColor,
          borderRadius: styles.borderRadius,
          color: styles.color,
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          fontStyle: styles.fontStyle,
          fontWeight: styles.fontWeight,
          height: styles.height,
        };
      }),
      page.getByRole('button', { name: 'apply', exact: true }).evaluate((button) => {
        const styles = getComputedStyle(button);
        return {
          backgroundColor: styles.backgroundColor,
          borderRadius: styles.borderRadius,
          color: styles.color,
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          fontStyle: styles.fontStyle,
          fontWeight: styles.fontWeight,
          height: styles.height,
        };
      }),
    ]);
    if (
      !ruleBounds ||
      !removeBounds ||
      !fieldBounds ||
      !operatorBounds ||
      !valueBounds ||
      !actionsBounds ||
      !addRuleBounds ||
      !clearAllBounds ||
      !applyBounds
    ) {
      throw new Error('The final query rule controls must be measurable.');
    }
    expect(removeBounds.x).toBeGreaterThanOrEqual(valueBounds.x + valueBounds.width);
    expect(Math.abs(addRuleBounds.y - clearAllBounds.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(clearAllBounds.y - applyBounds.y)).toBeLessThanOrEqual(1);
    expect(addRuleBounds.width).toBeLessThan(actionsBounds.width / 2);
    expect(
      Math.abs(applyBounds.x + applyBounds.width - actionsBounds.x - actionsBounds.width),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(addRuleBounds.x - actionsBounds.x)).toBeLessThanOrEqual(1);
    expect(clearAllBounds.x).toBeLessThan(applyBounds.x);
    expect(clearAllStyle.backgroundColor).toBe(applyStyle.color);
    expect(clearAllStyle.color).toBe(applyStyle.backgroundColor);
    expect(clearAllStyle.borderRadius).toBe(applyStyle.borderRadius);
    expect(clearAllStyle.fontFamily).toBe(applyStyle.fontFamily);
    expect(clearAllStyle.fontSize).toBe(applyStyle.fontSize);
    expect(applyStyle.fontStyle).toBe('italic');
    expect(applyStyle.fontFamily).toContain('Georgia');
    expect(clearAllStyle.fontStyle).toBe(applyStyle.fontStyle);
    expect(clearAllStyle.fontWeight).toBe(applyStyle.fontWeight);
    expect(clearAllStyle.height).toBe(applyStyle.height);
    await expect(page.getByRole('button', { name: 'apply', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'clear all', exact: true })).toHaveCSS(
      'text-decoration-line',
      'none',
    );
    expect(fieldBounds.height).toBe(36);
    expect(operatorBounds.height).toBe(36);
    expect(valueBounds.height).toBeGreaterThanOrEqual(36);
    const multiValueButton = lastRule.getByRole('button', {
      name: 'Value: Searchable Coriander Ingredient',
    });
    await expect(multiValueButton).toContainText('Searchable Coriander Ingredient');
    await expect(multiValueButton.locator('.recipe-picklist-trigger-label')).toHaveCSS(
      'white-space',
      'normal',
    );
    const controlsCenterY = valueBounds.y + valueBounds.height / 2;
    if ((page.viewportSize()?.width ?? 0) <= 700) {
      expect(
        Math.abs(removeBounds.y + removeBounds.height / 2 - controlsCenterY),
      ).toBeLessThanOrEqual(6);
    } else {
      expect(
        Math.abs(
          removeBounds.y + removeBounds.height / 2 - (fieldBounds.y + fieldBounds.height / 2),
        ),
      ).toBeLessThanOrEqual(2);
    }
    expect(removeStrokeWidth).toBe('1.35');
    expect(addRuleFontSize).toBe('16px');
    expect(rowBorder).toBe('0px');
    await page.getByRole('button', { name: 'Add rule' }).hover();
    await expect(page.getByRole('button', { name: 'Add rule' })).toHaveCSS(
      'text-decoration-line',
      'underline',
    );
    await page
      .getByRole('button', { name: /^Value:/ })
      .last()
      .press('Enter');
    const appliedUrl = new URL(page.url());
    expect(appliedUrl.searchParams.get('q')?.trim() ?? '').toBe('');
    expect(
      appliedUrl.searchParams.getAll('filter').some((value) => JSON.parse(value).field === 'state'),
    ).toBe(true);
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Searchable saffron rice' })).toBeVisible();
    await expect(page).not.toHaveURL((url) => url.searchParams.has('auto_select_columns'));

    const listColumnsButton = page.getByRole('button', { name: 'Choose List columns' });
    await listColumnsButton.click({ timeout: 5_000 });
    await expect(listColumnsButton).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('checkbox', { name: 'Date Added', exact: true }).check();
    await page.keyboard.press('Escape');
    if ((page.viewportSize()?.width ?? 0) > 720) {
      await page.getByRole('link', { name: 'Sort by Date Added ascending' }).click();
      await expect(page).toHaveURL(/sort=created_at/);
    } else {
      const sortedUrl = new URL(page.url());
      sortedUrl.searchParams.set('sort', 'created_at');
      sortedUrl.searchParams.set('direction', 'asc');
      await page.goto(sortedUrl.toString());
    }
    await expect(page.getByRole('button', { name: 'Switch to List view' })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to List view' }).click();
    await expect(page.locator('.recipe-explorer-simple-list')).toBeVisible();
    await expect(page.locator('.recipe-explorer-simple-list img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Switch to Grid view' }).click();
    await expect(page.locator('.find-recipes-grid')).toBeVisible();
    await expect(page.locator('.find-recipes-grid-metadata')).toHaveText(
      'Search Source Magazine ~ Want to try ~ 20 min',
    );
    await page.reload();
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.locator('.find-recipes-grid')).toBeVisible();
    await expect(page).toHaveURL((url) => {
      const params = new URL(url).searchParams;
      return (
        params.get('sort') === 'created_at' &&
        params.get('view') === 'grid' &&
        params.get('tab') === 'query' &&
        params.getAll('filter').length === 3
      );
    });
    await expect(page.getByRole('button', { name: 'Switch to Details view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Switch to Details view' }).click();

    for (const width of [352, 390]) {
      await page.setViewportSize({ width, height: 820 });
      await expect(page.locator('.find-recipes-mobile-filters')).toHaveCSS('display', 'flex');
      await expect(page.locator('.find-recipes-list thead')).toHaveCSS('display', 'none');
      await expect(page.locator('.find-recipes-mobile-label')).toHaveCount(0);
      await expect(page.locator('.find-recipes-mobile-metadata')).toHaveText(
        'Search Source Magazine ~ Want to try ~ 20 min',
      );
      const mobileListRowBackgrounds = await page
        .locator('.find-recipes-list tbody tr')
        .evaluateAll((rows) =>
          rows.slice(0, 2).map((row) => getComputedStyle(row).backgroundColor),
        );
      expect(mobileListRowBackgrounds[0]).not.toBe(mobileListRowBackgrounds[1]);
      await expect(page.locator('.find-recipes-list tbody tr').first()).toHaveCSS(
        'display',
        'flex',
      );
      const mobileRule = page.locator('.recipe-filter-row').last();
      const mobileControlBounds = await Promise.all([
        mobileRule.getByRole('combobox', { name: 'Field' }).boundingBox(),
        mobileRule.getByRole('combobox', { name: 'Operator' }).boundingBox(),
        mobileRule.getByRole('button', { name: /^Value:/ }).boundingBox(),
        mobileRule.getByRole('button', { name: 'Remove filter 3' }).boundingBox(),
      ]);
      expect(mobileControlBounds.every(Boolean)).toBeTruthy();
      const [mobileField, mobileOperator, mobileValue, mobileRemove] = mobileControlBounds;
      if (!mobileField || !mobileOperator || !mobileValue || !mobileRemove) {
        throw new Error('The mobile Query controls should be measurable.');
      }
      const mobileControlCenters = [mobileField, mobileOperator, mobileValue].map(
        ({ y, height }) => y + height / 2,
      );
      expect(
        Math.max(...mobileControlCenters) - Math.min(...mobileControlCenters),
      ).toBeLessThanOrEqual(1);
      const oneMillimeter = 96 / 25.4;
      expect(mobileOperator.x - mobileField.x - mobileField.width).toBeCloseTo(oneMillimeter, 1);
      expect(mobileValue.x - mobileOperator.x - mobileOperator.width).toBeCloseTo(oneMillimeter, 1);
      expect(mobileRemove.x - mobileValue.x - mobileValue.width).toBeCloseTo(oneMillimeter, 1);

      const betweenRule = page.locator('.recipe-filter-row').nth(1);
      const [betweenField, betweenOperator] = await Promise.all([
        betweenRule.getByRole('combobox', { name: 'Field' }).boundingBox(),
        betweenRule.getByRole('combobox', { name: 'Operator' }).boundingBox(),
      ]);
      if (!betweenField || !betweenOperator) {
        throw new Error('The mobile Between filter controls should be measurable.');
      }
      await expect(betweenRule.getByRole('combobox', { name: 'Operator' })).toContainText('Rng');
      await expect(betweenRule.getByRole('combobox', { name: 'Operator' })).toHaveAttribute(
        'title',
        'Between',
      );
      expect(betweenField.width).toBeGreaterThan(betweenOperator.width);

      const navItems = await page.locator('.private-nav').evaluate((nav) =>
        Array.from(
          nav.querySelectorAll<HTMLElement>(
            '.private-nav-links a, .private-nav-utility-link, .account-menu-trigger',
          ),
          (item) => {
            const { x, y, width: itemWidth, height: itemHeight } = item.getBoundingClientRect();
            return { x, y, width: itemWidth, height: itemHeight };
          },
        ),
      );
      expect(new Set(navItems.map(({ y }) => y)).size).toBe(1);
      expect(
        new Set(
          navItems.map(({ width: itemWidth, height: itemHeight }) => `${itemWidth}x${itemHeight}`),
        ),
      ).toEqual(new Set(['44x44']));
      const toolbarRows = await page
        .locator('.recipe-explorer-toolbar')
        .evaluate((toolbar) =>
          Array.from(
            toolbar.querySelectorAll<HTMLElement>(
              '.recipe-explorer-sort-picklist, .recipe-explorer-view-controls > a, .recipe-explorer-view-controls > button',
            ),
            (item) => item.getBoundingClientRect().y,
          ),
        );
      expect(toolbarRows.length).toBeGreaterThan(0);
      expect(new Set(toolbarRows).size).toBe(1);
      await expect(
        page.locator('.find-recipes-list tbody td[data-explorer-column="state"]'),
      ).toHaveCSS('white-space', 'normal');
      await expect(
        page.locator('.find-recipes-list tbody td[data-explorer-column="total_time_minutes"]'),
      ).toHaveCSS('white-space', 'normal');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBeTruthy();
      await page.keyboard.press('Escape');
    }

    await page.goto('/recipes/find?sort=name&direction=asc&page=1&view=grid');
    const gridCards = page.locator('.find-recipes-grid li');
    await expect(gridCards).toHaveCount(2);
    await expect(gridCards.first()).toHaveAttribute('data-stripe-cell', 'odd');
    await expect(gridCards.nth(1)).toHaveAttribute('data-stripe-cell', 'even');
    const gridCardBackgrounds = await page
      .locator('.find-recipes-grid li')
      .evaluateAll((cards) =>
        cards.slice(0, 2).map((card) => getComputedStyle(card).backgroundColor),
      );
    expect(gridCardBackgrounds[0]).not.toBe(gridCardBackgrounds[1]);
    await expect(page.locator('.find-recipes-grid li').first()).toHaveCSS(
      'box-shadow',
      'rgba(36, 40, 32, 0.18) 0px 4px 12px 0px',
    );
    const noTimeGridCard = page
      .locator('.find-recipes-grid li')
      .filter({ hasText: 'Apricot roast with a very long title that wraps on a narrow screen' });
    const gridCardHeights = await page
      .locator('.find-recipes-grid li')
      .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().height)));
    expect(new Set(gridCardHeights).size).toBeGreaterThan(1);
    await expect(noTimeGridCard.locator('.find-recipes-grid-metadata')).toHaveText(
      'Search Source Magazine ~ Tried',
    );
    const noImageTitleHeight = await noTimeGridCard
      .locator('strong')
      .evaluate((title) => title.getBoundingClientRect().height);
    expect(noImageTitleHeight).toBeGreaterThan(24);
    await page.goto('/recipes/find?sort=name&direction=asc&page=1&view=details');
    await expect(page.locator('.find-recipes-list thead')).toHaveCSS('display', 'none');
    await expect(page.locator('.find-recipes-mobile-link img')).toHaveCount(0);
    await expect(
      page.locator('.find-recipes-list tbody tr').first().locator('.find-recipes-mobile-metadata'),
    ).toHaveText('Search Source Magazine ~ Tried');
    const clippedTitle = page
      .locator('.find-recipes-mobile-title')
      .filter({ hasText: 'Apricot roast with a very long title that wraps on a narrow screen' })
      .first();
    await expect(clippedTitle).toHaveCSS('white-space', 'nowrap');
    await expect(clippedTitle).toHaveCSS('text-overflow', 'ellipsis');
    expect(
      await clippedTitle.evaluate((element) => {
        return element.scrollWidth > element.clientWidth;
      }),
    ).toBeTruthy();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();

    await page.setViewportSize({ width: 1280, height: 900 });
    const firstHeader = page.locator('.find-recipes-list thead th').first();
    await expect(firstHeader).toHaveCSS('font-size', '16px');
    await expect(firstHeader).toHaveCSS('text-transform', 'none');
    await expect(firstHeader).toHaveCSS('text-align', 'left');
    await expect(page.locator('.find-recipes-list')).toHaveCSS('display', 'grid');
    await expect(
      page.locator('.find-recipes-list tbody td[data-explorer-column="name"]').first(),
    ).toHaveCSS('white-space', 'nowrap');
    const firstColumnShare = await firstHeader.evaluate((header) => {
      const tableWidth = header.closest('table')?.getBoundingClientRect().width ?? 0;
      return header.getBoundingClientRect().width / tableWidth;
    });
    expect(firstColumnShare).toBeLessThanOrEqual(0.55);
    const columnStartOffsets = await page
      .locator('.find-recipes-list thead th:visible')
      .evaluateAll((headers) =>
        headers.flatMap((header) => {
          const column = header.getAttribute('data-explorer-column');
          if (column === 'score' || column === 'starred' || column === 'hearted') return [];
          const sortLink = header.querySelector('.recipe-list-sort-header');
          const cell = Array.from(
            header.closest('table')?.querySelectorAll('tbody tr:first-child td') ?? [],
          ).find((candidate) => candidate.getAttribute('data-explorer-column') === column);
          if (!sortLink || !cell) return [];
          const headerRange = document.createRange();
          headerRange.selectNodeContents(sortLink);
          const cellRange = document.createRange();
          cellRange.selectNodeContents(cell);
          return [
            {
              column,
              offset:
                headerRange.getBoundingClientRect().left - cellRange.getBoundingClientRect().left,
            },
          ];
        }),
      );
    expect(
      columnStartOffsets.every(({ offset }) => Number.isFinite(offset) && Math.abs(offset) < 2),
      JSON.stringify(columnStartOffsets),
    ).toBe(true);
    await expect(
      page.locator('.find-recipes-list tbody tr').first().locator('td').first(),
    ).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(
      page.locator('.find-recipes-list tbody tr').first().locator('td:first-child a'),
    ).toHaveCSS('font-weight', '400');
    await captureScreenshot(page, 'find-recipes-populated-list');
    await page.setViewportSize({ width: 390, height: 844 });
    await captureScreenshot(page, 'find-recipes-populated-list-mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Filter Publication' }).click();
    const filterOptionLabel = page
      .locator('.recipe-column-filter-popover .recipe-column-filter-option span')
      .first();
    await expect(filterOptionLabel).toHaveCSS('font-size', '16px');
    await expect(filterOptionLabel).toHaveCSS('text-transform', 'none');

    for (const index of [3, 4, 5, 6, 7, 8]) {
      await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
        name: `Grid stripe recipe ${index}`,
        state: 'want_to_try',
        totalTime: 10 + index,
        notes: '',
      });
    }

    await page.goto('/recipes/find?sort=name&direction=asc&page=1&view=grid');
    const desktopGridCards = page.locator('.find-recipes-grid li');
    await expect(desktopGridCards).toHaveCount(8);
    const desktopGridCardHeights = await desktopGridCards.evaluateAll((cards) =>
      cards.map((card) => Math.round(card.getBoundingClientRect().height)),
    );
    expect(new Set(desktopGridCardHeights).size).toBe(1);
    await expect(desktopGridCards.first()).toHaveCSS('height', '234px');
    await expect(desktopGridCards.first()).toHaveAttribute('data-stripe-cell', 'odd');
    await expect(desktopGridCards.nth(1)).toHaveAttribute('data-stripe-cell', 'even');
    const desktopGridStripeColors = await desktopGridCards.evaluateAll((cards) =>
      cards.slice(0, 2).map((card) => getComputedStyle(card).backgroundColor),
    );
    expect(desktopGridStripeColors[0]).not.toBe(desktopGridStripeColors[1]);
    await expect(desktopGridCards.first()).toHaveCSS(
      'box-shadow',
      'rgba(36, 40, 32, 0.18) 0px 4px 12px 0px',
    );

    async function checkGridRowStarts(
      columnCount: number,
      candidateWidths = [
        760, 800, 840, 880, 920, 960, 1000, 1040, 1080, 1120, 1160, 1200, 1240, 1280, 1360, 1500,
      ],
    ) {
      let matchedColumns = false;
      for (const width of candidateWidths) {
        await page.setViewportSize({ width, height: 900 });
        const actualColumns = await desktopGridCards.evaluateAll((cards) => {
          const firstTop = cards[0]?.getBoundingClientRect().top;
          if (firstTop === undefined) return 0;
          return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - firstTop) < 1)
            .length;
        });
        if (actualColumns !== columnCount) continue;
        matchedColumns = true;
        break;
      }

      expect(matchedColumns).toBe(true);
      const secondRowStart = desktopGridCards.nth(columnCount);
      const secondRowNextCard = desktopGridCards.nth(columnCount + 1);
      await expect(desktopGridCards.first()).toHaveAttribute('data-stripe-cell', 'odd');
      await expect(desktopGridCards.nth(1)).toHaveAttribute('data-stripe-cell', 'even');
      await expect(secondRowStart).toHaveAttribute('data-stripe-cell', 'even');
      await expect(secondRowNextCard).toHaveAttribute('data-stripe-cell', 'odd');
      const stripeColors = await Promise.all(
        [desktopGridCards.first(), desktopGridCards.nth(1), secondRowStart, secondRowNextCard].map(
          (card) => card.evaluate((element) => getComputedStyle(element).backgroundColor),
        ),
      );
      expect(stripeColors[0]).not.toBe(stripeColors[1]);
      expect(stripeColors[2]).toBe(stripeColors[1]);
      expect(stripeColors[3]).toBe(stripeColors[0]);
      await expect(desktopGridCards.first().locator('.find-recipes-grid-metadata')).toHaveCSS(
        'color',
        'rgb(36, 40, 32)',
      );
      await expect(desktopGridCards.nth(1).locator('.find-recipes-grid-metadata')).toHaveCSS(
        'color',
        'rgb(36, 40, 32)',
      );
      if (columnCount === 3) {
        await expect(desktopGridCards.nth(6)).toHaveAttribute('data-stripe-cell', 'odd');
        await expect(desktopGridCards.nth(7)).toHaveAttribute('data-stripe-cell', 'even');
        const thirdRowStripeColors = await Promise.all(
          [desktopGridCards.nth(6), desktopGridCards.nth(7)].map((card) =>
            card.evaluate((element) => getComputedStyle(element).backgroundColor),
          ),
        );
        expect(thirdRowStripeColors).toEqual(stripeColors.slice(0, 2));
      }
    }

    await checkGridRowStarts(3);
    await checkGridRowStarts(4);
    await checkGridRowStarts(5, [1414]);
    await checkGridRowStarts(5, [1440]);
    await checkGridRowStarts(5, [1920]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await captureScreenshot(page, 'find-recipes-populated-grid');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(desktopGridCards).toHaveCount(8);
    await captureScreenshot(page, 'find-recipes-populated-grid-mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
    await desktopGridCards.first().locator('a').hover();
    await expect(desktopGridCards.first().locator('strong')).toHaveCSS(
      'text-decoration-line',
      'underline',
    );

    const emptyQuery = `no-matching-recipe-${randomUUID()}`;
    await page.goto(
      `/recipes/find?q=${encodeURIComponent(emptyQuery)}&sort=name&direction=asc&view=list`,
    );
    await expect(page.getByText('0 recipes found')).toBeVisible();
    await expect(page.getByText('No recipes match these search criteria.')).toBeVisible();
    await captureScreenshot(page, 'find-recipes-empty-list');
    await page.setViewportSize({ width: 390, height: 844 });
    await captureScreenshot(page, 'find-recipes-empty-list-mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      `/recipes/find?q=${encodeURIComponent(emptyQuery)}&sort=name&direction=asc&view=grid`,
    );
    await expect(page.getByText('No recipes match these search criteria.')).toBeVisible();
    await captureScreenshot(page, 'find-recipes-empty-grid');
    await page.setViewportSize({ width: 390, height: 844 });
    await captureScreenshot(page, 'find-recipes-empty-grid-mobile');
  } finally {
    await Promise.all([deleteTestUser(request, user), deleteTestUser(request, otherUser)]);
  }
});

test('Find Recipes shows a recoverable query error and preserves filters @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const filter = JSON.stringify({ field: 'unsupported_field', operator: 'contains', value: 'x' });

  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.goto(`/recipes/find?filter=${encodeURIComponent(filter)}&tab=query&view=grid`);

    await expect(
      page.getByRole('alert').filter({ hasText: 'Unable to search recipes.' }),
    ).toHaveText('Unable to search recipes. Your query refinements are preserved. Try again.');
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Query' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.recipe-empty-state')).toHaveCount(0);
    await expect(page).toHaveURL((url) => {
      const params = new URL(url).searchParams;
      return !params.has('q') && params.get('filter') === filter && params.get('tab') === 'query';
    });
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes sorts Details headers, toggles direction, and vertically centers headings @e2e', async ({
  page,
  request,
}) => {
  test.skip(
    (page.viewportSize()?.width ?? 1280) <= 720,
    'Details table header sorting is desktop-only.',
  );
  test.setTimeout(90_000);
  const user = await createTestUser(request);

  try {
    const config = await getLocalSupabaseConfig();
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: 'Column sort Alpha',
      state: 'want_to_try',
      totalTime: 10,
      notes: '',
    });
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: 'Column sort Bravo',
      state: 'tried',
      totalTime: 20,
      notes: '',
    });
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.goto('/recipes/find?q=Column%20sort&sort=name&direction=asc&view=details');

    const table = page.locator('.find-recipes-list');
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(page.getByRole('combobox', { name: /Sort by/u })).toHaveCount(0);
    const firstRecipeName = () => rows.first().locator('.find-recipes-mobile-title').innerText();
    await expect.poll(firstRecipeName).toBe('Column sort Alpha');
    const headerOffsets = await table.locator('thead th:visible').evaluateAll((headers) =>
      headers.map((header) => {
        const content = header.querySelector('.recipe-list-column-heading');
        if (!content) throw new Error('Expected a recipe column heading.');
        const cellBounds = header.getBoundingClientRect();
        const contentBounds = content.getBoundingClientRect();
        return Math.abs(
          cellBounds.top + cellBounds.height / 2 - (contentBounds.top + contentBounds.height / 2),
        );
      }),
    );
    expect(headerOffsets.every((offset) => offset < 1.5)).toBe(true);

    await page.getByRole('link', { name: 'Sort by Name descending' }).click();
    await expect(page).toHaveURL(/sort=name.*direction=desc/u);
    await expect.poll(firstRecipeName).toBe('Column sort Bravo');
    await page.getByRole('link', { name: 'Sort by Name ascending' }).click();
    await expect(page).toHaveURL(/sort=name.*direction=asc/u);
    await expect.poll(firstRecipeName).toBe('Column sort Alpha');

    await page.getByRole('link', { name: 'Sort by Star ascending' }).click();
    await expect(page).toHaveURL(/sort=starred.*direction=asc/u);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Unable to search recipes.' }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Sort by Star descending' }).click();
    await expect(page).toHaveURL(/sort=starred.*direction=desc/u);
    await page.getByRole('link', { name: 'Sort by Heart ascending' }).click();
    await expect(page).toHaveURL(/sort=hearted.*direction=asc/u);
    await page.getByRole('link', { name: 'Sort by Rating ascending' }).click();
    await expect(page).toHaveURL(/sort=score.*direction=asc/u);

    await page.getByRole('button', { name: 'Choose List columns' }).click();
    const opinionColumn = page.getByRole('checkbox', { name: 'Opinion' });
    await opinionColumn.scrollIntoViewIfNeeded({ timeout: 5_000 });
    await opinionColumn.check({ timeout: 5_000 });
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      /(^|\s)opinion(\s|$)/u,
    );
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Sort by Opinion ascending' }).click();
    await expect(page).toHaveURL(/sort=opinion/u);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Unable to search recipes.' }),
    ).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipe search RPC honors typed filters, ranking, stable sorting, and page boundaries @e2e', async ({
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };

  const search = async (
    options: {
      query?: string | null;
      filters?: Record<string, unknown>[];
      sort?: string;
      direction?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    } = {},
  ) => {
    const response = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers,
      data: {
        p_query: options.query ?? null,
        p_filters: options.filters ?? [],
        p_sort_key: options.sort ?? null,
        p_sort_direction: options.direction ?? 'asc',
        p_limit: options.limit ?? 50,
        p_offset: options.offset ?? 0,
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()) as {
      recipe_name: string;
      rank: number;
      total_count: number;
    }[];
  };
  const names = async (options: Parameters<typeof search>[0] = {}) =>
    (await search(options)).map(({ recipe_name }) => recipe_name);

  try {
    const alphaName = 'Contract Alpha Rankmarker';
    const betaName = 'Contract Beta';
    const gammaName = 'Contract Gamma';
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: alphaName,
      state: 'want_to_try',
      totalTime: 10,
      notes: '',
      ingredients: ['Contract Ingredient A', 'Contract Ingredient B'],
    });
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: betaName,
      state: 'tried',
      totalTime: null,
      notes: 'Rankmarker body-only',
      ingredients: ['Contract Ingredient A', 'Contract Ingredient C'],
    });
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: gammaName,
      state: 'want_to_try',
      totalTime: 30,
      notes: '',
    });

    const ingredientResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id,name`,
      { headers },
    );
    expect(ingredientResponse.ok(), await ingredientResponse.text()).toBeTruthy();
    const ingredients = (await ingredientResponse.json()) as { id: string; name: string }[];
    const ingredientIds = new Map(ingredients.map(({ id, name }) => [name, id]));
    const ingredientA = ingredientIds.get('Contract Ingredient A');
    const ingredientB = ingredientIds.get('Contract Ingredient B');
    expect(ingredientA).toBeTruthy();
    expect(ingredientB).toBeTruthy();

    const textCases = [
      { operator: 'contains', value: 'CONTRACT', expected: [alphaName, betaName, gammaName] },
      { operator: 'does_not_contain', value: 'beta', expected: [alphaName, gammaName] },
      { operator: 'equals', value: alphaName.toLowerCase(), expected: [alphaName] },
      { operator: 'starts_with', value: 'contract beta', expected: [betaName] },
    ];
    for (const textCase of textCases) {
      expect(
        await names({
          sort: 'name',
          filters: [{ field: 'name', operator: textCase.operator, value: textCase.value }],
        }),
      ).toEqual(textCase.expected);
    }
    expect(
      await names({
        sort: 'name',
        filters: [{ field: 'notes_markdown', operator: 'is_empty' }],
      }),
    ).toEqual([alphaName, gammaName]);
    expect(
      await names({
        sort: 'name',
        filters: [{ field: 'notes_markdown', operator: 'is_not_empty' }],
      }),
    ).toEqual([betaName]);

    const setCases = [
      {
        operator: 'contains_any',
        value: [ingredientA, ingredientB],
        expected: [alphaName, betaName],
      },
      { operator: 'contains_all', value: [ingredientA, ingredientB], expected: [alphaName] },
      { operator: 'does_not_contain', value: [ingredientA], expected: [gammaName] },
      { operator: 'is', value: [ingredientA, ingredientB], expected: [alphaName] },
      { operator: 'is_not', value: [ingredientA, ingredientB], expected: [betaName, gammaName] },
    ];
    for (const setCase of setCases) {
      expect(
        await names({
          sort: 'name',
          filters: [{ field: 'ingredient', operator: setCase.operator, value: setCase.value }],
        }),
      ).toEqual(setCase.expected);
    }

    const numericCases = [
      { operator: 'equals', value: 10, expected: [alphaName] },
      { operator: 'not_equals', value: 10, expected: [betaName, gammaName] },
      { operator: 'greater_than', value: 10, expected: [gammaName] },
      { operator: 'less_than', value: 30, expected: [alphaName, betaName] },
      { operator: 'at_least', value: 30, expected: [gammaName] },
      { operator: 'at_most', value: 10, expected: [alphaName, betaName] },
      { operator: 'between', value: 10, value_to: 30, expected: [alphaName, gammaName] },
    ];
    for (const numericCase of numericCases) {
      expect(
        await names({
          sort: 'name',
          filters: [
            {
              field: 'total_time_minutes',
              operator: numericCase.operator,
              value: numericCase.value,
              ...(numericCase.value_to === undefined ? {} : { value_to: numericCase.value_to }),
            },
          ],
        }),
      ).toEqual(numericCase.expected);
    }
    expect(
      await names({
        sort: 'name',
        filters: [{ field: 'state', operator: 'not_in', value: ['tried'] }],
      }),
    ).toEqual([alphaName, gammaName]);

    const ranked = await search({ query: 'Rankmarker' });
    expect(ranked.map(({ recipe_name }) => recipe_name)).toEqual([alphaName, betaName]);
    expect(ranked[0]?.rank).toBeGreaterThan(ranked[1]?.rank ?? 0);

    expect(await names({ sort: 'total_time_minutes', direction: 'asc' })).toEqual([
      betaName,
      alphaName,
      gammaName,
    ]);
    expect(await names({ sort: 'total_time_minutes', direction: 'desc' })).toEqual([
      gammaName,
      alphaName,
      betaName,
    ]);
    const stablePages = await Promise.all(
      [0, 1, 2].map((offset) => search({ sort: 'state', limit: 1, offset })),
    );
    expect(stablePages.map(([recipe]) => recipe?.recipe_name)).toEqual([
      betaName,
      alphaName,
      gammaName,
    ]);
    expect(stablePages.flat().map(({ total_count }) => total_count)).toEqual([3, 3, 3]);
    expect(await search({ sort: 'state', limit: 1, offset: 3 })).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});
