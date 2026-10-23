import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

function recipePayload(name: string, ingredientRows: unknown[]) {
  return {
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
    p_ingredient_rows: ingredientRows,
  };
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(?:recipes|publications(?:\/[0-9a-f-]+)?)$/);
}

test('measurement saves are owner-scoped, validated, and included in history @e2e @measurements', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const ownerHeaders = {
    apikey: config.anonKey,
    Authorization: `Bearer ${owner.accessToken}`,
  };
  const otherHeaders = {
    apikey: config.anonKey,
    Authorization: `Bearer ${other.accessToken}`,
  };

  try {
    const picklistsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id,category,value&account_id=eq.${owner.id}&category=in.(informal_unit,unmeasured_phrase)`,
      { headers: ownerHeaders },
    );
    expect(picklistsResponse.ok()).toBeTruthy();
    const picklists = (await picklistsResponse.json()) as {
      id: string;
      category: string;
      value: string;
    }[];
    const bunchId = picklists.find(
      (option) => option.category === 'informal_unit' && option.value === 'Bunch',
    )?.id;
    const tasteId = picklists.find(
      (option) => option.category === 'unmeasured_phrase' && option.value === 'To taste',
    )?.id;
    expect(bunchId).toBeTruthy();
    expect(tasteId).toBeTruthy();
    const otherPicklistsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&account_id=eq.${other.id}&category=eq.informal_unit&value=eq.Bunch`,
      { headers: otherHeaders },
    );
    expect(otherPicklistsResponse.ok()).toBeTruthy();
    const [otherBunch] = (await otherPicklistsResponse.json()) as { id: string }[];
    expect(otherBunch).toBeTruthy();

    const ingredientRows = [
      {
        ingredient_id: null,
        ingredient_name: 'Flour',
        is_main: true,
        detail: 'all-purpose',
        preparation: 'sifted',
        measurements: [
          {
            measurement_type: 'volume',
            amount_min: 1.5,
            amount_max: null,
            unit_code: 'cup',
            picklist_value_id: null,
          },
          {
            measurement_type: 'weight',
            amount_min: 120,
            amount_max: null,
            unit_code: 'g',
            picklist_value_id: null,
          },
        ],
      },
      {
        ingredient_id: null,
        ingredient_name: 'Eggs',
        is_main: false,
        detail: '',
        preparation: '',
        measurements: [
          {
            measurement_type: 'count',
            amount_min: 2,
            amount_max: 3,
            unit_code: null,
            picklist_value_id: null,
          },
        ],
      },
      {
        ingredient_id: null,
        ingredient_name: 'Cilantro',
        is_main: false,
        detail: '',
        preparation: '',
        measurements: [
          {
            measurement_type: 'informal',
            amount_min: 1,
            amount_max: null,
            unit_code: null,
            picklist_value_id: bunchId,
          },
        ],
      },
      {
        ingredient_id: null,
        ingredient_name: 'Salt',
        is_main: false,
        detail: '',
        preparation: '',
        measurements: [
          {
            measurement_type: 'unmeasured',
            amount_min: null,
            amount_max: null,
            unit_code: null,
            picklist_value_id: tasteId,
          },
        ],
      },
    ];
    const createResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: recipePayload('Measurement fixture', ingredientRows),
    });
    const createError = createResponse.ok() ? '' : await createResponse.text();
    expect(createResponse.ok(), `Recipe save failed: ${createError}`).toBeTruthy();
    const [created] = (await createResponse.json()) as { id: string; version: number }[];

    const rowResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=id,position&recipe_id=eq.${created.id}&order=position.asc`,
      { headers: ownerHeaders },
    );
    const recipeRows = (await rowResponse.json()) as { id: string; position: number }[];
    const measurementRowsUrl = `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=recipe_ingredient_id,position,measurement_type,amount_min,amount_max,unit_code,picklist_value_id&recipe_ingredient_id=in.(${recipeRows.map((row) => row.id).join(',')})&order=recipe_ingredient_id.asc,position.asc`;
    const allMeasurements = await request.get(measurementRowsUrl, { headers: ownerHeaders });
    const initialMeasurements = await allMeasurements.json();
    expect(initialMeasurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurement_type: 'volume',
          amount_min: 1.5,
          amount_max: null,
          unit_code: 'cup',
        }),
        expect.objectContaining({
          measurement_type: 'weight',
          amount_min: 120,
          unit_code: 'g',
        }),
        expect.objectContaining({
          measurement_type: 'count',
          amount_min: 2,
          amount_max: 3,
          unit_code: null,
        }),
        expect.objectContaining({
          measurement_type: 'informal',
          picklist_value_id: bunchId,
        }),
        expect.objectContaining({
          measurement_type: 'unmeasured',
          picklist_value_id: tasteId,
        }),
      ]),
    );

    const unauthorizedRead = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=id&recipe_ingredient_id=in.(${recipeRows.map((row) => row.id).join(',')})`,
      { headers: otherHeaders },
    );
    expect(await unauthorizedRead.json()).toEqual([]);
    const directWrite = await request.post(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements`,
      {
        headers: ownerHeaders,
        data: {
          account_id: owner.id,
          recipe_ingredient_id: recipeRows[0].id,
          position: 2,
          measurement_type: 'volume',
          amount_min: 1,
          unit_code: 'cup',
        },
      },
    );
    expect(directWrite.ok()).toBeFalsy();

    const invalidRows = [
      {
        name: 'invalid unit',
        rows: [
          {
            ...ingredientRows[0],
            measurements: [{ ...ingredientRows[0].measurements[0], unit_code: 'bushel' }],
          },
        ],
      },
      {
        name: 'missing picklist value',
        rows: [
          {
            ...ingredientRows[2],
            measurements: [{ ...ingredientRows[2].measurements[0], picklist_value_id: null }],
          },
        ],
      },
      {
        name: 'missing required amount',
        rows: [
          {
            ...ingredientRows[0],
            measurements: [{ ...ingredientRows[0].measurements[0], amount_min: null }],
          },
        ],
      },
      {
        name: 'cross-account picklist reference',
        rows: [
          {
            ...ingredientRows[2],
            measurements: [
              { ...ingredientRows[2].measurements[0], picklist_value_id: otherBunch?.id ?? '' },
            ],
          },
        ],
      },
      {
        name: 'duplicate type',
        rows: [
          {
            ...ingredientRows[0],
            measurements: [
              ingredientRows[0].measurements[0],
              { ...ingredientRows[0].measurements[0], amount_min: 2 },
            ],
          },
        ],
      },
      {
        name: 'unsupported pair',
        rows: [
          {
            ...ingredientRows[0],
            measurements: [
              ingredientRows[0].measurements[0],
              {
                measurement_type: 'count',
                amount_min: 2,
                amount_max: null,
                unit_code: null,
                picklist_value_id: null,
              },
            ],
          },
        ],
      },
      {
        name: 'reversed range',
        rows: [
          {
            ...ingredientRows[1],
            measurements: [{ ...ingredientRows[1].measurements[0], amount_min: 3, amount_max: 2 }],
          },
        ],
      },
      ...['NaN', 'Infinity', '-Infinity'].map((amount_min) => ({
        name: `non-finite lower bound ${amount_min}`,
        rows: [
          {
            ...ingredientRows[0],
            measurements: [{ ...ingredientRows[0].measurements[0], amount_min }],
          },
        ],
      })),
      ...['NaN', 'Infinity', '-Infinity'].map((amount_max) => ({
        name: `non-finite upper bound ${amount_max}`,
        rows: [
          {
            ...ingredientRows[0],
            measurements: [{ ...ingredientRows[0].measurements[0], amount_min: 1, amount_max }],
          },
        ],
      })),
    ];

    for (const invalidCase of invalidRows) {
      const invalidSave = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
        headers: ownerHeaders,
        data: {
          ...recipePayload('Must roll back', invalidCase.rows),
          p_recipe_id: created.id,
          p_expected_version: 1,
        },
      });
      const invalidSaveError = invalidSave.ok() ? '' : await invalidSave.text();
      expect(invalidSave.ok(), `${invalidCase.name}: ${invalidSaveError}`).toBeFalsy();
      const savedRecipe = await request.get(
        `${config.apiUrl}/rest/v1/recipes?select=name,version&id=eq.${created.id}`,
        { headers: ownerHeaders },
      );
      expect(await savedRecipe.json()).toEqual([{ name: 'Measurement fixture', version: 1 }]);
      const unchangedRows = await request.get(
        `${config.apiUrl}/rest/v1/recipe_ingredients?select=id,position&recipe_id=eq.${created.id}&order=position.asc`,
        { headers: ownerHeaders },
      );
      expect(await unchangedRows.json()).toEqual(recipeRows);
      const unchangedMeasurements = await request.get(measurementRowsUrl, {
        headers: ownerHeaders,
      });
      expect(await unchangedMeasurements.json()).toEqual(initialMeasurements);
    }
    const historyResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${created.id}&order=created_at.asc`,
      { headers: ownerHeaders },
    );
    const history = await historyResponse.json();
    expect(history).toHaveLength(1);
    expect(history[0].after_data.ingredients[0].measurements).toHaveLength(2);
    expect(history[0].after_data.ingredients[0].measurements[0]).toMatchObject({
      measurement_type: 'volume',
      amount_min: 1.5,
      unit_code: 'cup',
    });

    const updatedIngredientRows = ingredientRows.map((row, index) =>
      index === 0
        ? {
            ...row,
            measurements: [{ ...row.measurements[0], amount_min: 2 }, row.measurements[1]],
          }
        : row,
    );
    const updateResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: {
        ...recipePayload('Measurement fixture edited', updatedIngredientRows),
        p_recipe_id: created.id,
        p_expected_version: 1,
      },
    });
    const updateError = updateResponse.ok() ? '' : await updateResponse.text();
    expect(updateResponse.ok(), `Recipe update failed: ${updateError}`).toBeTruthy();

    const updatedHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${created.id}&order=created_at.asc`,
      { headers: ownerHeaders },
    );
    const updatedHistory = await updatedHistoryResponse.json();
    expect(updatedHistory).toHaveLength(2);
    expect(updatedHistory[1].before_data.ingredients[0].measurements[0]).toMatchObject({
      measurement_type: 'volume',
      amount_min: 1.5,
      unit_code: 'cup',
    });
    expect(updatedHistory[1].after_data.ingredients[0].measurements[0]).toMatchObject({
      measurement_type: 'volume',
      amount_min: 2,
      unit_code: 'cup',
    });
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});

test('preparation choices reveal inline divided portions and cubed Size @e2e @a11y @measurements', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 902, height: 900 });
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Preparation controls recipe');

    const grid = page.getByRole('table', { name: 'Recipe ingredients', exact: true });
    const clickPreparationWhitespace = async (rowNumber: number) => {
      const cell = grid.locator(`[aria-label="Preparation, row ${rowNumber}"]`);
      const point = await cell.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const x = bounds.right - 4;
        const y = bounds.top + bounds.height / 2;
        return { x, y, hitsCell: document.elementFromPoint(x, y) === element };
      });
      expect(point.hitsCell).toBe(true);
      await page.mouse.click(point.x, point.y);
      await expect(
        page.getByRole('combobox', { name: `Preparation, row ${rowNumber}` }),
      ).toHaveCount(0);
      await expect(page.getByRole('listbox')).toHaveCount(0);
    };

    await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
    const salt = page.getByRole('combobox', { name: 'Ingredient, row 1' });
    await salt.fill('Salt');
    await salt.press('Enter');
    await salt.press('Enter');
    await page.getByRole('textbox', { name: 'Volume amount, row 1' }).fill('1');
    await page.getByRole('combobox', { name: 'Volume unit, row 1' }).click();
    await page.getByRole('listbox').getByRole('option', { name: 'cup', exact: true }).click();
    const weightUnit = grid.locator('.recipe-measurement-weight-trigger');
    await expect(weightUnit).toBeVisible();
    const weightUnitRightEdge = await weightUnit.evaluate((unit) => {
      const preparationCell = unit.closest('tr')?.querySelector('td:nth-last-child(2)');
      if (!preparationCell) return null;
      const unitBounds = unit.getBoundingClientRect();
      const preparationBounds = preparationCell.getBoundingClientRect();
      const preparationContentLeft =
        preparationBounds.left + Number.parseFloat(getComputedStyle(preparationCell).paddingLeft);
      return {
        clearsPreparation: unitBounds.right <= preparationContentLeft,
        edgeIsTopmost:
          document.elementFromPoint(
            unitBounds.right - 1,
            unitBounds.top + unitBounds.height / 2,
          ) === unit,
        unitRight: unitBounds.right,
        preparationContentLeft,
      };
    });
    expect(weightUnitRightEdge).toEqual({
      clearsPreparation: true,
      edgeIsTopmost: true,
      unitRight: expect.any(Number),
      preparationContentLeft: expect.any(Number),
    });

    const saltPreparationCell = grid.getByRole('cell', { name: 'Preparation, row 1' });
    await saltPreparationCell.click();
    const saltPreparation = page.getByRole('combobox', { name: 'Preparation, row 1' });
    await saltPreparation.fill('divided');
    const dividedInputBounds = await saltPreparation.evaluate((input) => {
      const preparationInput = input as HTMLInputElement;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const controls = preparationInput
        .closest('.recipe-preparation-editor')
        ?.querySelector('.recipe-preparation-controls');
      if (!context || !controls) return null;
      const inputBounds = preparationInput.getBoundingClientRect();
      const controlsBounds = controls.getBoundingClientRect();
      const style = getComputedStyle(preparationInput);
      context.font = style.font;
      const textWidth = context.measureText(preparationInput.value).width;
      return {
        extraWidth: inputBounds.width - textWidth,
        clickX: inputBounds.left + Number.parseFloat(style.paddingLeft) + textWidth + 8,
        clickY: inputBounds.top + inputBounds.height / 2,
        beforeControls:
          inputBounds.left + Number.parseFloat(style.paddingLeft) + textWidth + 8 <
          controlsBounds.left,
      };
    });
    expect(dividedInputBounds).not.toBeNull();
    expect(dividedInputBounds?.extraWidth).toBeLessThanOrEqual(10);
    expect(dividedInputBounds?.beforeControls).toBe(true);
    if (!dividedInputBounds) throw new Error('Preparation controls were not rendered.');
    await page.mouse.click(dividedInputBounds.clickX, dividedInputBounds.clickY);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await saltPreparation.focus();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.getByRole('option', { name: 'divided', exact: true }).click();
    await saltPreparation.press('Enter');
    await clickPreparationWhitespace(1);

    const firstPortion = page.getByRole('textbox', { name: 'First portion, row 1' });
    await expect(firstPortion).toBeVisible();
    await expect(firstPortion).toHaveValue('');
    await expect(firstPortion).not.toHaveAttribute('placeholder', /.+/);
    await expect(firstPortion).toHaveCSS('width', '48px');
    await expect(firstPortion).toHaveCSS('height', '30px');
    await expect(firstPortion).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(page.getByRole('group', { name: 'Portion controls, row 1' })).toHaveCSS(
      'border-top-width',
      '0px',
    );
    await expect(page.getByRole('group', { name: 'Portion controls, row 1' })).toHaveCSS(
      'padding-top',
      '0px',
    );
    await expect(firstPortion).toHaveCSS('text-align', 'center');
    await expect(saltPreparationCell).toContainText('cup');
    await expect(page.getByRole('checkbox', { name: 'Divide ingredient row 1' })).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Second portion, row 1' })).toBeEmpty();
    await expect(saltPreparationCell.locator('.recipe-portion-separator')).toHaveText(':');
    await expect(saltPreparationCell.locator('.recipe-portion-separator')).toHaveCSS(
      'font-size',
      '12px',
    );
    await expect(saltPreparationCell.locator('.recipe-portion-separator')).toHaveCSS(
      'font-weight',
      '700',
    );
    const portionUnitAndSeparatorCenters = await saltPreparationCell
      .locator('.recipe-portion-editor')
      .evaluate((editor) =>
        ['.recipe-preparation-unit', '.recipe-portion-separator'].map((selector) => {
          const bounds = editor.querySelector(selector)?.getBoundingClientRect();
          return bounds ? bounds.top + bounds.height / 2 : Number.NaN;
        }),
      );
    expect(portionUnitAndSeparatorCenters[0]).toBeDefined();
    expect(portionUnitAndSeparatorCenters[1]).toBeDefined();
    expect(
      Math.abs(portionUnitAndSeparatorCenters[0] - portionUnitAndSeparatorCenters[1]),
    ).toBeLessThanOrEqual(1);
    const portionUnitAndRemainderStyles = await saltPreparationCell
      .locator('.recipe-portion-editor')
      .evaluate((editor) =>
        ['.recipe-preparation-unit', '.recipe-portion-remainder'].map((selector) => {
          const element = editor.querySelector(selector);
          if (!element) return null;
          const style = getComputedStyle(element);
          return {
            color: style.color,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
          };
        }),
      );
    expect(portionUnitAndRemainderStyles[0]).not.toBeNull();
    expect(portionUnitAndRemainderStyles[0]).toEqual(portionUnitAndRemainderStyles[1]);
    const dividedSpacing = await saltPreparationCell
      .locator('.recipe-preparation-editor')
      .evaluate((editor) => {
        const preparation = editor.querySelector('.recipe-ingredient-cell-value');
        const controls = editor.querySelector('.recipe-preparation-controls');
        const amount = editor.querySelector('.recipe-portion-input');
        const unit = editor.querySelector('.recipe-preparation-unit');
        if (!preparation || !controls || !amount || !unit) {
          return { preparationGap: Number.NaN, amountUnitGap: Number.NaN };
        }
        return {
          preparationGap:
            controls.getBoundingClientRect().left - preparation.getBoundingClientRect().right,
          amountUnitGap: unit.getBoundingClientRect().left - amount.getBoundingClientRect().right,
        };
      });
    const cssPixelsPerMillimeter = 96 / 25.4;
    expect(dividedSpacing.preparationGap).toBeCloseTo(3 * cssPixelsPerMillimeter, 1);
    expect(dividedSpacing.amountUnitGap).toBeCloseTo(2 * cssPixelsPerMillimeter, 1);
    const portionPreparationTops = await saltPreparationCell
      .locator('.recipe-preparation-editor')
      .evaluate((editor) =>
        Array.from(editor.children).map((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top + bounds.height / 2;
        }),
      );
    expect(portionPreparationTops).toHaveLength(2);
    await expect(
      saltPreparationCell.locator('.recipe-preparation-editor > .recipe-ingredient-cell-value'),
    ).toBeVisible();
    expect(
      await saltPreparationCell
        .locator('.recipe-preparation-editor > .recipe-ingredient-cell-value')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    expect(
      Math.max(...portionPreparationTops) - Math.min(...portionPreparationTops),
    ).toBeLessThanOrEqual(1);
    await firstPortion.fill('1/3');
    await expect(page.getByRole('status', { name: 'Second portion, row 1' })).toHaveText('⅔ cup');
    await firstPortion.fill('2/3');
    await expect(page.getByRole('status', { name: 'Second portion, row 1' })).toHaveText('⅓ cup');
    await page.getByRole('textbox', { name: 'Volume amount, row 1' }).fill('2');
    await firstPortion.fill('1/3');
    const remainder = page.getByRole('status', { name: 'Second portion, row 1' });
    await expect(remainder).toHaveText('1 ⅔ cup');
    const remainderFontSizes = await remainder.evaluate((element) => {
      const fraction = element.querySelector('.recipe-portion-fraction');
      if (!fraction) return null;
      return {
        base: getComputedStyle(element).fontSize,
        fraction: getComputedStyle(fraction).fontSize,
      };
    });
    expect(remainderFontSizes).not.toBeNull();
    expect(Number.parseFloat(remainderFontSizes?.fraction ?? '')).toBeCloseTo(
      Number.parseFloat(remainderFontSizes?.base ?? '') + (2 * 96) / 72,
      1,
    );
    await page.getByRole('textbox', { name: 'Volume amount, row 1' }).fill('1');
    await firstPortion.fill('2/3');

    await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
    const carrot = page.getByRole('combobox', { name: 'Ingredient, row 2' });
    await carrot.fill('Carrot');
    await carrot.press('Enter');
    await carrot.press('Enter');
    await page.getByRole('combobox', { name: 'Ingredient type, row 2' }).click();
    await page.getByRole('listbox').getByRole('option', { name: 'Count', exact: true }).click();
    await page.getByRole('textbox', { name: 'Count amount, row 2' }).fill('2');
    const carrotPreparationCell = grid.locator('[aria-label="Preparation, row 2"]');
    await carrotPreparationCell.click();
    const carrotPreparation = page.getByRole('combobox', { name: 'Preparation, row 2' });
    await carrotPreparation.fill('cubed');
    const cubedInputExtraWidth = await carrotPreparation.evaluate((input) => {
      const preparationInput = input as HTMLInputElement;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return Number.NaN;
      context.font = getComputedStyle(preparationInput).font;
      return (
        preparationInput.getBoundingClientRect().width -
        context.measureText(preparationInput.value).width
      );
    });
    expect(cubedInputExtraWidth).toBeLessThanOrEqual(10);
    await page.getByRole('option', { name: 'cubed', exact: true }).click();
    await carrotPreparation.press('Enter');
    await clickPreparationWhitespace(2);

    const size = page.getByRole('textbox', { name: 'Size, row 2' });
    const sizeUnitIn = page.getByRole('button', {
      name: 'Size unit, row 2: in. Activate to switch to cm',
    });
    await expect(size).toBeVisible();
    await expect(size).not.toHaveAttribute('placeholder', /.+/);
    await expect(size).toHaveCSS('width', '48px');
    await expect(size).toHaveCSS('height', '30px');
    await expect(size).toHaveCSS('text-align', 'center');
    await expect(sizeUnitIn).toHaveText('in');
    await expect(sizeUnitIn).toHaveCSS('height', '30px');
    const sizeUnitFontDifference = await carrotPreparationCell
      .locator('.recipe-preparation-editor')
      .evaluate((editor) => {
        const unit = editor.querySelector('.recipe-inline-size-unit');
        const preparation = editor.querySelector('.recipe-ingredient-cell-value');
        if (!unit || !preparation) return Number.NaN;
        return (
          Number.parseFloat(getComputedStyle(preparation).fontSize) -
          Number.parseFloat(getComputedStyle(unit).fontSize)
        );
      });
    expect(sizeUnitFontDifference).toBeCloseTo((2 * 96) / 72, 1);
    await expect(sizeUnitIn).toHaveCSS('text-decoration-line', 'underline');
    const sizePreparationTops = await carrotPreparationCell
      .locator('.recipe-preparation-editor')
      .evaluate((editor) =>
        Array.from(editor.children).map((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top + bounds.height / 2;
        }),
      );
    expect(sizePreparationTops).toHaveLength(2);
    expect(Math.max(...sizePreparationTops) - Math.min(...sizePreparationTops)).toBeLessThanOrEqual(
      1,
    );
    const cubedSpacing = await carrotPreparationCell
      .locator('.recipe-preparation-editor')
      .evaluate((editor) => {
        const preparation = editor.querySelector('.recipe-ingredient-cell-value');
        const controls = editor.querySelector('.recipe-preparation-controls');
        const size = editor.querySelector('.recipe-inline-size-input');
        const unit = editor.querySelector('.recipe-inline-size-unit');
        if (!preparation || !controls || !size || !unit) {
          return { preparationGap: Number.NaN, sizeUnitGap: Number.NaN };
        }
        return {
          preparationGap:
            controls.getBoundingClientRect().left - preparation.getBoundingClientRect().right,
          sizeUnitGap: unit.getBoundingClientRect().left - size.getBoundingClientRect().right,
        };
      });
    expect(cubedSpacing.preparationGap).toBeCloseTo(3 * cssPixelsPerMillimeter, 1);
    expect(cubedSpacing.sizeUnitGap).toBeCloseTo(2 * cssPixelsPerMillimeter, 1);
    await sizeUnitIn.click();
    const sizeUnitCm = page.getByRole('button', {
      name: 'Size unit, row 2: cm. Activate to switch to in',
    });
    await expect(sizeUnitCm).toHaveText('cm');
    await size.fill('0.5');
    await expect(size).toHaveValue('0.5');
    await expect(sizeUnitCm).toBeVisible();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Preparation controls recipe' })).toBeVisible();
    const ingredientList = page.locator('.recipe-ingredient-list');
    await expect(ingredientList).toContainText('1 cup salt, divided ⅔ : ⅓');
    await expect(ingredientList).not.toContainText('1st');
    await expect(ingredientList).not.toContainText('2nd');
    await expect(ingredientList).toContainText('cubed 0.5 cm');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners enter, view, edit, and reload measurements on desktop and mobile @e2e @a11y @measurements', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto('/settings');
    await page.getByRole('combobox', { name: 'Weight' }).click();
    await page.getByRole('listbox').getByRole('option', { name: 'US customary' }).click();
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Measured recipe');
    const grid = page.getByRole('table', { name: 'Recipe ingredients', exact: true });
    const amountHeader = grid.getByRole('columnheader', { name: 'Amount', exact: true });
    await expect(amountHeader).toHaveAttribute('colspan', '2');
    await expect(amountHeader).toHaveCSS('text-align', 'left');
    await expect(grid.getByRole('columnheader', { name: 'Type', exact: true })).toHaveCount(0);
    await expect(grid.getByRole('columnheader', { name: 'Amt', exact: true })).toHaveCount(0);
    await expect(grid.getByRole('columnheader', { name: 'Unit', exact: true })).toHaveCount(0);
    await expect(
      grid
        .locator('thead tr')
        .first()
        .locator('th')
        .evaluateAll((headers) => headers.slice(0, 4).map((header) => header.textContent?.trim())),
    ).resolves.toEqual(['Ingredient', 'Specifics', 'Amount', 'Preparation']);
    async function chooseMeasurementOption(label: string, value: string) {
      await page.getByRole('combobox', { name: label }).click();
      await page.getByRole('listbox').getByRole('option', { name: value, exact: true }).click();
    }

    async function addIngredientRow(
      row: number,
      name: string,
      type: 'units' | 'count' | 'informal' | 'judgment',
      quantity: string,
      unitValue: string,
    ) {
      await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
      const ingredientInput = page.getByRole('combobox', { name: `Ingredient, row ${row}` });
      await ingredientInput.fill(name);
      await ingredientInput.press('Enter');
      await ingredientInput.press('Enter');
      const typePicker = page.getByRole('combobox', { name: `Ingredient type, row ${row}` });
      const typeLabel = {
        units: 'Unit',
        count: 'Count',
        informal: 'Things',
        judgment: 'Feel',
      }[type];
      if (row === 1) {
        await typePicker.click();
        await expect(page.getByRole('listbox').getByRole('option')).toHaveText([
          'Unit',
          'Count',
          'Things',
          'Feel',
        ]);
        await typePicker.press('Escape');
      }
      await chooseMeasurementOption(`Ingredient type, row ${row}`, typeLabel);
      await expect(typePicker).toHaveText(typeLabel);
      if (type === 'units') {
        const volumeAmount = page.getByRole('textbox', { name: `Volume amount, row ${row}` });
        await expect(volumeAmount).toHaveAttribute('size', '2');
        await expect(volumeAmount).toHaveCSS('text-align', 'center');
        await expect
          .poll(() =>
            grid
              .locator('tbody tr[data-row-id]')
              .nth(row - 1)
              .locator('.recipe-measurement-slash')
              .textContent(),
          )
          .toBe('/');
        if (quantity) {
          await volumeAmount.fill(quantity);
        }
        if (unitValue) {
          const volumeUnit = page.getByRole('combobox', { name: `Volume unit, row ${row}` });
          await chooseMeasurementOption(`Volume unit, row ${row}`, unitValue);
          await expect
            .poll(() => volumeUnit.evaluate((select) => select.getBoundingClientRect().width))
            .toBeLessThanOrEqual(90);
        }
      } else if (type === 'informal') {
        await page.getByRole('textbox', { name: `Informal amount, row ${row}` }).fill(quantity);
        const unitPicker = page.getByRole('combobox', { name: `Informal unit, row ${row}` });
        await unitPicker.click();
        await page.getByRole('listbox').getByRole('option', { name: unitValue }).click();
      } else if (type === 'judgment') {
        const phrasePicker = page.getByRole('combobox', { name: `Judgment phrase, row ${row}` });
        await phrasePicker.click();
        await page.getByRole('listbox').getByRole('option', { name: unitValue }).click();
      } else {
        await page.getByRole('textbox', { name: `Count amount, row ${row}` }).fill(quantity);
      }
    }

    await addIngredientRow(1, 'Flour', 'units', '1 1/2', 'cup');
    await expect(grid.locator('tbody tr[data-row-id]').first().locator('td')).toHaveCount(6);
    await expect(grid.locator('tbody tr[data-row-id]').first().locator('td').nth(0)).toHaveCSS(
      'height',
      '48px',
    );
    await page.getByRole('textbox', { name: 'Weight amount, row 1' }).fill('120');
    await chooseMeasurementOption('Weight unit, row 1', 'g');
    const volumeUnitWidth = await page
      .getByRole('combobox', { name: 'Volume unit, row 1' })
      .evaluate((select) => select.getBoundingClientRect().width);
    const weightUnitWidth = await page
      .getByRole('combobox', { name: 'Weight unit, row 1' })
      .evaluate((select) => select.getBoundingClientRect().width);
    expect(volumeUnitWidth).toBeLessThanOrEqual(50);
    expect(weightUnitWidth).toBeLessThanOrEqual(36);
    expect(volumeUnitWidth).toBeGreaterThan(weightUnitWidth);
    await expect(page.getByRole('combobox', { name: 'Weight unit, row 1' })).toHaveCSS(
      'padding-left',
      '6px',
    );
    expect(
      await page
        .getByRole('combobox', { name: 'Ingredient type, row 1' })
        .evaluate((select) => select.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(80);
    await addIngredientRow(2, 'Milk', 'units', '1', 'cup');
    await addIngredientRow(3, 'Butter', 'units', '', '');
    await page.getByRole('textbox', { name: 'Weight amount, row 3' }).fill('4');
    await chooseMeasurementOption('Weight unit, row 3', 'oz');
    await addIngredientRow(4, 'Eggs', 'count', '2-3', '');
    await expect(page.getByRole('textbox', { name: 'Count amount, row 4' })).toHaveCSS(
      'text-align',
      'center',
    );
    await expect(page.getByRole('textbox', { name: 'Weight amount, row 4' })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Weight unit, row 4' })).toHaveCount(0);
    await addIngredientRow(5, 'Cilantro', 'informal', '2', 'Bunch');
    await expect(page.getByRole('combobox', { name: 'Ingredient type, row 5' })).toHaveText(
      'Things',
    );
    await expect(page.getByRole('combobox', { name: 'Informal unit, row 5' })).toHaveText('Bunch');
    await expect(page.getByRole('textbox', { name: 'Weight amount, row 5' })).toHaveCount(0);
    await addIngredientRow(6, 'Salt', 'judgment', '', 'To taste');
    await expect(page.getByRole('combobox', { name: 'Ingredient type, row 6' })).toHaveText('Feel');
    await expect(page.getByRole('combobox', { name: 'Judgment phrase, row 6' })).toHaveText(
      'To taste',
    );
    await expect(page.getByRole('textbox', { name: 'Count amount, row 6' })).toHaveCount(0);

    const firstDesktopRow = grid.locator('tbody tr[data-row-id]').first();
    const initialTypeBounds = await firstDesktopRow
      .getByRole('combobox', { name: 'Ingredient type, row 1' })
      .boundingBox();
    const initialAmountBounds = await firstDesktopRow
      .getByRole('textbox', { name: 'Volume amount, row 1' })
      .boundingBox();
    expect(initialTypeBounds).not.toBeNull();
    expect(initialAmountBounds).not.toBeNull();
    expect(
      (initialAmountBounds?.x ?? 0) -
        ((initialTypeBounds?.x ?? 0) + (initialTypeBounds?.width ?? 0)),
    ).toBeLessThanOrEqual(9);

    await page.setViewportSize({ width: 901, height: 900 });
    const desktopEditor = page.locator('.recipe-ingredient-desktop');
    await expect
      .poll(() => desktopEditor.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(0);
    const typeFieldBounds = await firstDesktopRow
      .getByRole('combobox', { name: 'Ingredient type, row 1' })
      .boundingBox();
    const firstAmountBounds = await firstDesktopRow
      .getByRole('textbox', { name: 'Volume amount, row 1' })
      .boundingBox();
    const thingsTypePicker = grid.getByRole('combobox', { name: 'Ingredient type, row 5' });
    const thingsPickerWidth = await thingsTypePicker.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas text measurement is unavailable.');
      }
      context.font = styles.font;
      return {
        actual: bounds.width,
        expected:
          context.measureText('Things').width +
          Number.parseFloat(styles.paddingLeft) +
          Number.parseFloat(styles.paddingRight) +
          Number.parseFloat(styles.borderLeftWidth) +
          Number.parseFloat(styles.borderRightWidth) +
          96 / 25.4,
      };
    });
    expect(typeFieldBounds).not.toBeNull();
    expect(firstAmountBounds).not.toBeNull();
    expect(Math.abs(thingsPickerWidth.actual - thingsPickerWidth.expected)).toBeLessThanOrEqual(2);
    expect(
      (firstAmountBounds?.x ?? 0) - ((typeFieldBounds?.x ?? 0) + (typeFieldBounds?.width ?? 0)),
    ).toBeLessThanOrEqual(9);
    await expect(
      grid.locator('tbody tr[data-row-id]').first().locator('.recipe-measurement-desktop-fields'),
    ).toHaveCSS('flex-wrap', 'nowrap');

    const volumeAmount = page.getByRole('textbox', { name: 'Volume amount, row 1' });
    await volumeAmount.fill('1200');
    await page.getByRole('textbox', { name: 'Weight amount, row 1' }).focus();
    await expect(volumeAmount).toHaveValue('1,200');
    await volumeAmount.fill('Infinity');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(volumeAmount).toHaveAttribute('aria-invalid', 'true');
    await expect(grid.locator('.recipe-measurement-error[role="alert"]')).toContainText(
      'Enter a positive whole number, decimal, fraction, mixed number, or range.',
    );
    await volumeAmount.fill('1200');
    await expect(page.getByRole('button', { name: 'Save recipe' })).toBeVisible();
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Measured recipe' })).toBeVisible();
    await expect(page.getByText('1,200 cups / 4 ¼ oz flour', { exact: true })).toBeVisible();
    await expect(page.getByText('1 cup milk', { exact: true })).toBeVisible();
    await expect(page.getByText('4 oz butter', { exact: true })).toBeVisible();
    await expect(page.getByText('2-3 eggs', { exact: true })).toBeVisible();
    await expect(page.getByText('2 bunches cilantro', { exact: true })).toBeVisible();
    await expect(page.getByText('salt to taste', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 500 });
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByRole('button', { name: /Edit 1,200 cups \/ 120 g flour/ }).click();
    await expect(page.getByRole('dialog', { name: 'Ingredient details' })).toBeVisible();
    const mobilePane = page.getByRole('dialog', { name: 'Ingredient details' });
    await expect(
      mobilePane.locator(':scope > .recipe-mobile-picker-field > span, :scope > label > span'),
    ).toHaveText(['Ingredient', 'Specifics', 'Amount', 'Preparation']);
    const overflowingFields = await mobilePane.evaluate((element) => {
      const paneBounds = element.getBoundingClientRect();
      const contentRight =
        paneBounds.right - Number.parseFloat(getComputedStyle(element).paddingRight);
      return Array.from(element.querySelectorAll('input, button.ingredient-cell-input, fieldset'))
        .filter((field) => field.getBoundingClientRect().right > contentRight + 1)
        .map((field) => ({
          className: field.className,
          right: field.getBoundingClientRect().right,
        }));
    });
    expect(overflowingFields).toEqual([]);
    const ingredientPicker = page.getByRole('combobox', { name: 'Ingredient', exact: true });
    await expect(ingredientPicker).toBeFocused();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await ingredientPicker.click();
    const ingredientOptions = page.getByRole('listbox');
    await expect(ingredientOptions).toHaveClass(/ingredient-cell-options/);
    await ingredientOptions.getByRole('option', { name: 'Flour', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Ingredient type, row 1' })).toHaveText('Unit');
    await expect(page.getByRole('combobox', { name: 'Ingredient type, row 1' })).toHaveCSS(
      'font-weight',
      '400',
    );
    await expect(page.getByRole('combobox', { name: 'Volume unit, row 1' })).toHaveCSS(
      'font-weight',
      '400',
    );
    await expect(page.locator('.recipe-measurement-editor')).toHaveCSS('border-top-width', '0px');
    await expect(page.locator('.recipe-measurement-dimension').first()).toHaveCSS('gap', '8px');
    await expect(page.getByRole('textbox', { name: 'Volume amount, row 1' })).toHaveValue('1,200');
    await expect(page.getByRole('textbox', { name: 'Volume amount, row 1' })).toHaveCSS(
      'text-align',
      'center',
    );
    await expect(page.getByRole('textbox', { name: 'Weight amount, row 1' })).toHaveValue('120');
    await expect(page.getByRole('combobox', { name: 'Volume unit, row 1' })).toHaveCSS(
      'height',
      '34px',
    );
    await expect(page.getByRole('combobox', { name: 'Volume unit, row 1' })).toHaveCSS(
      'height',
      await page
        .getByRole('textbox', { name: 'Volume amount, row 1' })
        .evaluate((element) => getComputedStyle(element).height),
    );
    await expect(page.getByRole('textbox', { name: 'Volume amount, row 1' })).toHaveCSS(
      'height',
      '34px',
    );
    await expect(page.getByRole('textbox', { name: 'Volume amount, row 1' })).toHaveCSS(
      'padding',
      '5px 3.5px',
    );
    const mobileCategoryPicker = page.getByRole('combobox', {
      name: 'Ingredient type, row 1',
    });
    await mobileCategoryPicker.click();
    const mobileTypeMenu = page.getByRole('listbox');
    await expect(mobileTypeMenu.getByRole('option')).toHaveText([
      'Unit',
      'Count',
      'Things',
      'Feel',
    ]);
    const mobileTypeMenuBounds = await mobileTypeMenu.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { bottom: bounds.bottom, top: bounds.top };
    });
    expect(mobileTypeMenuBounds.top).toBeGreaterThanOrEqual(0);
    expect(mobileTypeMenuBounds.bottom).toBeLessThanOrEqual(500);
    await mobileTypeMenu.getByRole('option', { name: 'Things', exact: true }).click();
    const thingPicker = page.getByRole('combobox', { name: 'Informal unit, row 1' });
    await thingPicker.click();
    const mobilePicklist = page.getByRole('listbox');
    await expect(mobilePicklist).toHaveClass(/ingredient-cell-options/);
    await expect(mobilePicklist.getByRole('option', { name: 'Bunch' })).toHaveClass(
      /ingredient-cell-option/,
    );
    const mobilePicklistBounds = await mobilePicklist.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { bottom: bounds.bottom, top: bounds.top };
    });
    expect(mobilePicklistBounds.top).toBeGreaterThanOrEqual(0);
    expect(mobilePicklistBounds.bottom).toBeLessThanOrEqual(500);
    await mobilePicklist.getByRole('option', { name: 'Bunch' }).click();
    const thingsType = page.getByRole('combobox', { name: 'Ingredient type, row 1' });
    const thingsAmount = page.getByRole('textbox', { name: 'Informal amount, row 1' });
    const thingsUnit = page.getByRole('combobox', { name: 'Informal unit, row 1' });
    await expect(thingsAmount).toHaveAttribute('size', '2');
    const thingsAmountWidth = await thingsAmount.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(thingsAmountWidth).toBeLessThanOrEqual(36);
    const thingsFieldCenters = await Promise.all(
      [thingsType, thingsAmount, thingsUnit].map((field) =>
        field.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top + bounds.height / 2;
        }),
      ),
    );
    expect(Math.max(...thingsFieldCenters) - Math.min(...thingsFieldCenters)).toBeLessThanOrEqual(
      1,
    );
    await chooseMeasurementOption('Ingredient type, row 1', 'Count');
    const countAmount = page.getByRole('textbox', { name: 'Count amount, row 1' });
    await expect(countAmount).toHaveAttribute('size', '2');
    const countType = page.getByRole('combobox', { name: 'Ingredient type, row 1' });
    const countFieldCenters = await Promise.all(
      [countType, countAmount].map((field) =>
        field.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top + bounds.height / 2;
        }),
      ),
    );
    expect(Math.max(...countFieldCenters) - Math.min(...countFieldCenters)).toBeLessThanOrEqual(1);
    await chooseMeasurementOption('Ingredient type, row 1', 'Unit');
    const volumeUnitPicker = page.getByRole('combobox', { name: 'Volume unit, row 1' });
    await volumeUnitPicker.click();
    const mobileUnitMenu = page.getByRole('listbox');
    await expect(mobileUnitMenu.locator('.ingredient-cell-option-group').first()).toHaveText('US');
    await expect(mobileUnitMenu.locator('.ingredient-cell-option-group').first()).toHaveCSS(
      'text-decoration-line',
      'underline',
    );
    await expect(mobileUnitMenu.locator('.ingredient-cell-option-group').first()).toHaveCSS(
      'text-decoration-color',
      'rgb(108, 103, 95)',
    );
    await expect(mobileUnitMenu.getByRole('option', { name: 'cup', exact: true })).toBeVisible();
    const mobileUnitMenuBounds = await mobileUnitMenu.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { bottom: bounds.bottom, top: bounds.top };
    });
    expect(mobileUnitMenuBounds.top).toBeGreaterThanOrEqual(0);
    expect(mobileUnitMenuBounds.bottom).toBeLessThanOrEqual(500);
    await volumeUnitPicker.press('End');
    await expect(mobileUnitMenu.getByRole('option', { name: 'L', exact: true })).toHaveClass(
      /is-active/,
    );
    await volumeUnitPicker.press('Space');
    await expect(volumeUnitPicker).toHaveText('L');
    await volumeUnitPicker.click();
    await volumeUnitPicker.press('Home');
    await expect(mobileUnitMenu.getByRole('option', { name: 'tsp', exact: true })).toHaveClass(
      /is-active/,
    );
    await volumeUnitPicker.press('Space');
    await expect(volumeUnitPicker).toHaveText('tsp');
    await volumeUnitPicker.click();
    await mobileUnitMenu.getByRole('option', { name: 'cup', exact: true }).click();
    await expect(volumeUnitPicker).toHaveText('cup');
    await volumeUnitPicker.click();
    await volumeUnitPicker.press('ArrowDown');
    await expect(mobileUnitMenu.getByRole('option', { name: 'pt', exact: true })).toHaveClass(
      /is-active/,
    );
    await volumeUnitPicker.press('Enter');
    await expect(volumeUnitPicker).toHaveText('pt');
    await volumeUnitPicker.click();
    await volumeUnitPicker.press('ArrowUp');
    await expect(mobileUnitMenu.getByRole('option', { name: 'cup', exact: true })).toHaveClass(
      /is-active/,
    );
    await volumeUnitPicker.press('Enter');
    await expect(volumeUnitPicker).toHaveText('cup');
    const mobilePopoverBounds = await page
      .getByRole('dialog', { name: 'Ingredient details' })
      .evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { bottom: bounds.bottom, top: bounds.top };
      });
    expect(mobilePopoverBounds.top).toBeGreaterThanOrEqual(0);
    expect(mobilePopoverBounds.bottom).toBeLessThanOrEqual(500);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('ingredient amount and amount-type controls support Arrow open-and-advance, Tab accept, and two-Enter commit without submitting the recipe form @e2e @measurements', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Keyboard amount entry recipe');

    if (testInfo.project.name === 'Fold 6') {
      const mobileList = page.getByRole('table', {
        name: 'Recipe ingredients on mobile',
        exact: true,
      });
      await mobileList.getByRole('button', { name: 'Enter ingredient' }).click();
      const popover = page.getByRole('dialog', { name: 'Ingredient details' });
      const ingredientInput = popover.getByRole('combobox', { name: 'Ingredient', exact: true });
      await ingredientInput.fill('Garlic');
      await ingredientInput.press('Enter');
      await expect(popover).toBeVisible();
      await expect(ingredientInput).toHaveValue('Garlic');

      const typePicker = popover.getByRole('combobox', { name: 'Ingredient type, row 1' });
      await typePicker.focus();
      await page.keyboard.press('ArrowDown');
      await expect(
        page.getByRole('listbox').getByRole('option', { name: 'Count', exact: true }),
      ).toHaveClass(/is-active/);
      await page.keyboard.press('Tab');
      await expect(typePicker).toHaveText('Count');
      const countAmount = popover.getByRole('textbox', { name: 'Count amount, row 1' });
      await expect(countAmount).toBeFocused();
      await countAmount.fill('1200');
      await countAmount.press('Enter');
      await expect(popover).toBeHidden();
      await expect(page).toHaveURL(/\/recipes\/new$/);

      await mobileList.getByRole('button', { name: 'Enter ingredient' }).click();
      const secondIngredient = popover.getByRole('combobox', { name: 'Ingredient', exact: true });
      await secondIngredient.fill('Sugar');
      await secondIngredient.press('Enter');
      const volumeAmount = popover.getByRole('textbox', { name: 'Volume amount, row 2' });
      await volumeAmount.fill('1 1/2');
      const volumeUnit = popover.getByRole('combobox', { name: 'Volume unit, row 2' });
      await volumeUnit.focus();
      await page.keyboard.press('ArrowUp');
      await expect(
        page.getByRole('listbox').getByRole('option', { name: 'fl oz', exact: true }),
      ).toHaveClass(/is-active/);
      await page.keyboard.press('Enter');
      await expect(popover).toBeVisible();
      await expect(volumeUnit).toHaveText('fl oz');
      await page.keyboard.press('Enter');
      await expect(popover).toBeHidden();
      await expect(page).toHaveURL(/\/recipes\/new$/);

      await page.getByRole('button', { name: 'Save recipe' }).click();
      await expect(
        page.getByRole('heading', { name: 'Keyboard amount entry recipe' }),
      ).toBeVisible();
      await expect(page.getByRole('table', { name: 'Recipe ingredients' })).toContainText('1,200');
      await expect(page.getByRole('table', { name: 'Recipe ingredients' })).toContainText(
        '1 ½ fl oz',
      );
      return;
    }

    await page.setViewportSize({ width: 1024, height: 900 });
    const grid = page.getByRole('table', { name: 'Recipe ingredients', exact: true });

    await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
    const firstIngredient = page.getByRole('combobox', { name: 'Ingredient, row 1' });
    await firstIngredient.fill('Garlic');
    await firstIngredient.press('Tab');
    await expect(grid.locator('[aria-label="Specifics, row 1"]')).toBeFocused();
    await page.keyboard.press('Tab');

    const firstTypePicker = page.getByRole('combobox', { name: 'Ingredient type, row 1' });
    await expect(firstTypePicker).toBeFocused();
    await expect(firstTypePicker).toHaveText('Unit');

    await page.keyboard.press('ArrowDown');
    const typeListbox = page.getByRole('listbox');
    await expect(typeListbox).toBeVisible();
    await expect(typeListbox.getByRole('option', { name: 'Count', exact: true })).toHaveClass(
      /is-active/,
    );
    await page.keyboard.press('ArrowDown');
    await expect(typeListbox.getByRole('option', { name: 'Things', exact: true })).toHaveClass(
      /is-active/,
    );
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(firstTypePicker).toHaveText('Things');
    await expect(firstTypePicker).toBeFocused();
    await expect(page).toHaveURL(/\/recipes\/new$/);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/recipes\/new$/);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(grid.getByRole('cell', { name: 'Add ingredient row' })).toBeFocused();

    await firstTypePicker.focus();
    await page.keyboard.press('ArrowUp');
    await expect(
      page.getByRole('listbox').getByRole('option', { name: 'Count', exact: true }),
    ).toHaveClass(/is-active/);
    await page.keyboard.press('Tab');
    await expect(firstTypePicker).toHaveText('Count');
    const countAmount = page.getByRole('textbox', { name: 'Count amount, row 1' });
    await expect(countAmount).toBeFocused();
    await countAmount.fill('1200');
    await countAmount.press('Enter');
    await expect(page).toHaveURL(/\/recipes\/new$/);
    await expect(countAmount).toHaveValue('1,200');
    await expect(grid.getByRole('cell', { name: 'Add ingredient row' })).toBeFocused();

    await page.keyboard.press('s');
    const secondIngredient = page.getByRole('combobox', { name: 'Ingredient, row 2' });
    await expect(secondIngredient).toBeFocused();
    await secondIngredient.pressSequentially('ugar');
    await secondIngredient.press('Enter');
    await expect(secondIngredient).toHaveValue('sugar');
    await secondIngredient.press('Enter');
    await expect(page).toHaveURL(/\/recipes\/new$/);
    await expect(grid.getByRole('cell', { name: 'Add ingredient row' })).toBeFocused();

    const volumeAmountRow2 = page.getByRole('textbox', { name: 'Volume amount, row 2' });
    await volumeAmountRow2.fill('1 1/2');
    await volumeAmountRow2.press('Tab');
    const volumeUnitRow2 = page.getByRole('combobox', { name: 'Volume unit, row 2' });
    await expect(volumeUnitRow2).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(
      page.getByRole('listbox').getByRole('option', { name: 'fl oz', exact: true }),
    ).toHaveClass(/is-active/);
    await page.keyboard.press('Enter');
    await expect(volumeUnitRow2).toHaveText('fl oz');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/recipes\/new$/);
    await expect(grid.getByRole('cell', { name: 'Add ingredient row' })).toBeFocused();

    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Keyboard amount entry recipe' })).toBeVisible();
    await expect(page.getByText('1,200 garlic', { exact: true })).toBeVisible();
    await expect(page.getByText('1 ½ fl oz sugar', { exact: true })).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});
