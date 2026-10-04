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
  await expect(page).toHaveURL(/\/app$/);
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
    const allMeasurements = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=recipe_ingredient_id,position,measurement_type,amount_min,amount_max,unit_code,picklist_value_id&recipe_ingredient_id=in.(${recipeRows.map((row) => row.id).join(',')})&order=recipe_ingredient_id.asc,position.asc`,
      { headers: ownerHeaders },
    );
    expect(await allMeasurements.json()).toEqual(
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
    }
    const historyResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${created.id}`,
      { headers: ownerHeaders },
    );
    const history = await historyResponse.json();
    expect(history).toHaveLength(1);
    expect(history[0].after_data.ingredients[0].measurements).toHaveLength(2);
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});

test('owners enter, view, edit, and reload measurements on desktop and mobile @e2e @a11y @measurements', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Measured recipe');
    const grid = page.getByRole('table', { name: 'Recipe ingredients', exact: true });

    async function addIngredientRow(
      row: number,
      name: string,
      type: 'volume' | 'weight' | 'count' | 'informal' | 'unmeasured',
      quantity: string,
      unitValue: string,
    ) {
      await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
      const ingredientInput = page.getByRole('combobox', { name: `Ingredient, row ${row}` });
      await ingredientInput.fill(name);
      await ingredientInput.press('Enter');
      await ingredientInput.press('Enter');
      await page.getByRole('button', { name: `Add measurement, row ${row}` }).click();
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      const measurementType = page.getByRole('radio', {
        name: `${typeLabel}, row ${row}, measurement 1`,
      });
      if (type === 'count') {
        await measurementType.focus();
        await measurementType.press('Space');
      } else {
        await measurementType.locator('..').click();
      }
      await expect(measurementType).toBeChecked();
      if (quantity) {
        await page
          .getByRole('textbox', { name: `Amount, row ${row}, measurement 1` })
          .fill(quantity);
      }
      if (type === 'volume' || type === 'weight') {
        await page
          .getByRole('combobox', { name: `Measurement unit, row ${row}, measurement 1` })
          .selectOption(unitValue);
      } else if (type === 'informal') {
        await page
          .getByRole('combobox', { name: `Informal unit, row ${row}, measurement 1` })
          .selectOption({ label: unitValue });
      } else if (type === 'unmeasured') {
        await page
          .getByRole('combobox', { name: `Unmeasured phrase, row ${row}, measurement 1` })
          .selectOption({ label: unitValue });
      }
    }

    await addIngredientRow(1, 'Flour', 'volume', '1 1/2', 'cup');
    await page.getByRole('button', { name: 'Add measurement, row 1' }).click();
    const weightRadio = page.getByRole('radio', { name: 'Weight, row 1, measurement 2' });
    await weightRadio.locator('..').click();
    await expect(weightRadio).toBeChecked();
    await page.getByRole('textbox', { name: 'Amount, row 1, measurement 2' }).fill('120');
    await page
      .getByRole('combobox', { name: 'Measurement unit, row 1, measurement 2' })
      .selectOption('g');
    await addIngredientRow(2, 'Eggs', 'count', '2-3', '');
    await addIngredientRow(3, 'Cilantro', 'informal', '1', 'Bunch');
    await addIngredientRow(4, 'Salt', 'unmeasured', '', 'To taste');

    await expect(page.getByRole('button', { name: 'Save recipe' })).toBeVisible();
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Measured recipe' })).toBeVisible();
    await expect(page.getByText('1 1/2 cup / 120 g flour', { exact: true })).toBeVisible();
    await expect(page.getByText('2-3 eggs', { exact: true })).toBeVisible();
    await expect(page.getByText('1 bunch cilantro', { exact: true })).toBeVisible();
    await expect(page.getByText('salt to taste', { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByRole('button', { name: /Edit 1 1\/2 cup \/ 120 g flour/ }).click();
    await expect(page.getByRole('dialog', { name: 'Ingredient details' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Amount, row 1, measurement 1' })).toHaveValue(
      '1 1/2',
    );
    await expect(page.getByRole('textbox', { name: 'Amount, row 1, measurement 2' })).toHaveValue(
      '120',
    );
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});
