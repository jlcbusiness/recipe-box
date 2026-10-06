import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
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
  await expect(page).toHaveURL(/\/recipes$/);
}

async function dragByPointer(page: Page, source: Locator, target: Locator) {
  const sourceRowId = await source.evaluate(
    (element) => element.closest<HTMLElement>('[data-row-id]')?.dataset.rowId,
  );
  const targetRowId = await target.evaluate(
    (element) => element.closest<HTMLElement>('[data-row-id]')?.dataset.rowId,
  );
  const sourceBounds = await source.boundingBox();
  const targetBounds = await target.boundingBox();
  if (!sourceRowId || !targetRowId || !sourceBounds || !targetBounds) {
    throw new Error('Both pointer drag targets must be visible.');
  }
  const rows = page.locator('.recipe-ingredient-table tbody tr[data-row-id]');
  const rowIds = await rows.evaluateAll((elements) =>
    elements
      .map((element) => element.getAttribute('data-row-id'))
      .filter((rowId): rowId is string => rowId !== null),
  );
  const sourceIndex = rowIds.indexOf(sourceRowId);
  const targetIndex = rowIds.indexOf(targetRowId);
  const sourceRow = page.locator(`.recipe-ingredient-table tbody tr[data-row-id="${sourceRowId}"]`);
  const sourceRowBounds = await sourceRow.boundingBox();
  if (sourceIndex < 0 || targetIndex < 0 || !sourceRowBounds) {
    throw new Error('Both pointer drag targets must belong to visible ingredient rows.');
  }
  const displacedIds =
    sourceIndex < targetIndex
      ? rowIds.slice(sourceIndex + 1, targetIndex + 1)
      : rowIds.slice(targetIndex, sourceIndex);
  const initialTops = new Map(
    await Promise.all(
      displacedIds.map(async (rowId) => {
        const bounds = await rows
          .filter({ has: page.locator(`[data-row-id="${rowId}"]`) })
          .boundingBox();
        if (!bounds) {
          throw new Error('Displaced ingredient rows must be visible before dragging.');
        }
        return [rowId, bounds.y] as const;
      }),
    ),
  );

  await page.mouse.move(
    sourceBounds.x + sourceBounds.width / 2,
    sourceBounds.y + sourceBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBounds.x + targetBounds.width / 2,
    targetBounds.y + targetBounds.height / 2,
    { steps: 8 },
  );
  await expect(sourceRow).toHaveAttribute('data-reorder-state', 'dragging');
  const expectedDisplacement = (sourceIndex < targetIndex ? -1 : 1) * sourceRowBounds.height;
  await expect
    .poll(async () => {
      const differences = await Promise.all(
        displacedIds.map(async (rowId) => {
          const bounds = await page
            .locator(`.recipe-ingredient-table tbody tr[data-row-id="${rowId}"]`)
            .boundingBox();
          return bounds
            ? Math.abs(bounds.y - (initialTops.get(rowId) ?? bounds.y) - expectedDisplacement)
            : Number.POSITIVE_INFINITY;
        }),
      );
      return Math.max(...differences);
    })
    .toBeLessThanOrEqual(2);
  const previewTops = new Map(
    await Promise.all(
      displacedIds.map(async (rowId) => {
        const bounds = await page
          .locator(`.recipe-ingredient-table tbody tr[data-row-id="${rowId}"]`)
          .boundingBox();
        if (!bounds) {
          throw new Error('Displaced ingredient rows must remain visible while dragging.');
        }
        return [rowId, bounds.y] as const;
      }),
    ),
  );
  const sourcePreviewTop = (await sourceRow.boundingBox())?.y;
  expect(sourcePreviewTop).toBeDefined();
  await page.mouse.up();
  await expect(sourceRow).toHaveCSS('transform', 'none');
  for (const [rowId, previewTop] of previewTops) {
    const displacedRow = page.locator(`.recipe-ingredient-table tbody tr[data-row-id="${rowId}"]`);
    await expect(displacedRow).toHaveCSS('transform', 'none');
    const finalTop = (await displacedRow.boundingBox())?.y;
    expect(finalTop).toBeDefined();
    expect(Math.abs((finalTop ?? 0) - previewTop)).toBeLessThanOrEqual(2);
  }
  const finalSourceTop = (await sourceRow.boundingBox())?.y;
  expect(finalSourceTop).toBeDefined();
  expect(Math.abs((finalSourceTop ?? 0) - (sourcePreviewTop ?? 0))).toBeLessThanOrEqual(2);
}

test('ingredient rows are owner-scoped, ordered, and atomic @e2e @ingredientRows', async ({
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
    const rows = [
      {
        ingredient_id: null,
        ingredient_name: 'Basil',
        is_main: true,
        detail: 'fresh',
        preparation: 'chopped',
      },
      {
        ingredient_id: null,
        ingredient_name: 'Sea salt',
        is_main: false,
        detail: '',
        preparation: 'to taste',
      },
    ];
    const createResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: recipePayload('Ingredient row fixture', rows),
    });
    expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
    const [created] = await createResponse.json();

    const ingredientsResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id,name&account_id=eq.${owner.id}&order=name.asc`,
      { headers: ownerHeaders },
    );
    const ingredients = await ingredientsResponse.json();
    expect(ingredients.map((ingredient: { name: string }) => ingredient.name)).toEqual([
      'Basil',
      'Sea salt',
    ]);
    const basil = ingredients.find((ingredient: { name: string }) => ingredient.name === 'Basil');

    const rowsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=position,ingredient_id,is_main,detail,preparation&recipe_id=eq.${created.id}&order=position.asc`,
      { headers: ownerHeaders },
    );
    expect(await rowsResponse.json()).toEqual([
      {
        position: 0,
        ingredient_id: basil.id,
        is_main: true,
        detail: 'fresh',
        preparation: 'chopped',
      },
      {
        position: 1,
        ingredient_id: ingredients[1].id,
        is_main: false,
        detail: '',
        preparation: 'to taste',
      },
    ]);

    const duplicateNameSave = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: recipePayload('Second ingredient recipe', [
        {
          ingredient_id: null,
          ingredient_name: '  basil  ',
          is_main: false,
          detail: '',
          preparation: '',
        },
      ]),
    });
    expect(duplicateNameSave.ok(), await duplicateNameSave.text()).toBeTruthy();
    const ownerIngredients = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id,name&account_id=eq.${owner.id}`,
      { headers: ownerHeaders },
    );
    expect(await ownerIngredients.json()).toHaveLength(2);

    const hiddenIngredient = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id&id=eq.${basil.id}`,
      { headers: otherHeaders },
    );
    expect(await hiddenIngredient.json()).toEqual([]);
    const hiddenRows = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=position&recipe_id=eq.${created.id}`,
      { headers: otherHeaders },
    );
    expect(await hiddenRows.json()).toEqual([]);

    const directIngredientInsert = await request.post(`${config.apiUrl}/rest/v1/ingredients`, {
      headers: ownerHeaders,
      data: { account_id: owner.id, name: 'Direct write attempt' },
    });
    expect(directIngredientInsert.ok()).toBeFalsy();
    const directRecipeIngredientInsert = await request.post(
      `${config.apiUrl}/rest/v1/recipe_ingredients`,
      {
        headers: ownerHeaders,
        data: {
          account_id: owner.id,
          recipe_id: created.id,
          ingredient_id: basil.id,
          position: 2,
          is_main: false,
          detail: '',
          preparation: '',
        },
      },
    );
    expect(directRecipeIngredientInsert.ok()).toBeFalsy();
    const crossAccountSave = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: otherHeaders,
      data: recipePayload('Cross-account ingredient attempt', [
        {
          ingredient_id: basil.id,
          ingredient_name: null,
          is_main: false,
          detail: '',
          preparation: '',
        },
      ]),
    });
    expect(crossAccountSave.ok()).toBeFalsy();

    const updateResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: {
        ...recipePayload('Updated ingredient row fixture', [...rows].reverse()),
        p_recipe_id: created.id,
        p_expected_version: 1,
      },
    });
    expect(updateResponse.ok(), await updateResponse.text()).toBeTruthy();

    const staleResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: {
        ...recipePayload('Stale ingredient row fixture', [
          {
            ingredient_id: null,
            ingredient_name: 'Must not be created',
            is_main: false,
            detail: '',
            preparation: '',
          },
        ]),
        p_recipe_id: created.id,
        p_expected_version: 1,
      },
    });
    expect((await staleResponse.json()).code).toBe('40001');
    const staleIngredientQuery = new URLSearchParams({
      select: 'id',
      account_id: `eq.${owner.id}`,
      name: 'eq.Must not be created',
    });
    const staleIngredientCheck = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?${staleIngredientQuery}`,
      { headers: ownerHeaders },
    );
    expect(await staleIngredientCheck.json()).toEqual([]);

    const savedRecipe = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=name,version&id=eq.${created.id}`,
      { headers: ownerHeaders },
    );
    expect(await savedRecipe.json()).toEqual([
      { name: 'Updated ingredient row fixture', version: 2 },
    ]);
    const savedRows = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=position,ingredient_id&recipe_id=eq.${created.id}&order=position.asc`,
      { headers: ownerHeaders },
    );
    expect(await savedRows.json()).toEqual([
      { position: 0, ingredient_id: ingredients[1].id },
      { position: 1, ingredient_id: basil.id },
    ]);
    const rollbackCheck = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id&id=eq.${basil.id}`,
      { headers: ownerHeaders },
    );
    expect(await rollbackCheck.json()).toHaveLength(1);

    const historyResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${created.id}&order=created_at.asc`,
      { headers: ownerHeaders },
    );
    const history = await historyResponse.json();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      event_type: 'recipe.created',
      before_data: null,
      after_data: {
        ingredients: [
          { name: 'Basil', is_main: true, detail: 'fresh', preparation: 'chopped' },
          { name: 'Sea salt', is_main: false, detail: '', preparation: 'to taste' },
        ],
      },
    });
    expect(history[1].before_data.ingredients).toHaveLength(2);
    expect(history[1].after_data.ingredients[0].name).toBe('Sea salt');
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});

test('desktop rows reorder by pointer and Ctrl+Arrow and reload @e2e @a11y @ingredientRows', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'Fold 6',
    'The desktop ingredient table is hidden on Fold 6.',
  );
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Keyboard ingredient rows');
    const grid = page.getByRole('table', { name: 'Recipe ingredients', exact: true });
    await expect(grid).toBeVisible();
    await expect(grid.getByRole('row')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Add ingredient row' })).toHaveCount(0);
    await expect(
      page.locator(
        '.recipe-ingredient-desktop button:not(.recipe-ingredient-drag-handle):not(.recipe-measurement-picklist-trigger)',
      ),
    ).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Main, row 1' })).toBeDisabled();
    expect(
      (await page.locator('.recipe-ingredient-drag-handle').first().boundingBox())?.width,
    ).toBe(12);
    const mainCheckboxBounds = await page
      .getByRole('checkbox', { name: 'Main, row 1' })
      .boundingBox();
    expect(mainCheckboxBounds?.width).toBeLessThanOrEqual(18);
    expect(mainCheckboxBounds?.height).toBeLessThanOrEqual(18);
    await expect(grid.getByRole('combobox', { name: 'Ingredient, row 1' })).toHaveCount(0);

    await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
    const firstIngredient = page.getByRole('combobox', { name: 'Ingredient, row 1' });
    await expect(firstIngredient).toHaveAttribute('type', 'text');
    await expect(firstIngredient).not.toHaveAttribute('list', /.+/);
    await expect(page.getByRole('option', { name: /^Add / })).toHaveCount(0);
    expect((await firstIngredient.boundingBox())?.height).toBeLessThanOrEqual(30);
    await firstIngredient.fill('Basil');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(firstIngredient).toHaveAttribute('aria-controls', /.+/);
    const ingredientMenu = page.locator('.ingredient-cell-options');
    const menuBounds = await ingredientMenu.boundingBox();
    const ingredientBounds = await firstIngredient.boundingBox();
    expect(menuBounds?.y).toBeLessThan(ingredientBounds?.y ?? 0);
    expect(Math.abs((menuBounds?.x ?? 0) - (ingredientBounds?.x ?? 0))).toBeLessThanOrEqual(1);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(grid.getByRole('row')).toHaveCount(3);
    await expect(grid.getByRole('row').nth(1)).toContainText('Basil');
    await expect(grid.locator('[aria-label="Specifics, row 1"]')).toBeFocused();
    await grid.locator('[aria-label="Ingredient, row 1"]').focus();
    await page.keyboard.press('Tab');
    const firstDetailCell = grid.locator('[aria-label="Specifics, row 1"]');
    await expect(firstDetailCell).toBeFocused();
    await page.keyboard.press('f');
    const firstDetail = page.getByRole('textbox', { name: 'Specifics, row 1' });
    await expect(firstDetail).toBeFocused();
    await expect(firstDetail).toHaveValue('f');
    await firstDetail.pressSequentially('resh');
    await page.keyboard.press('Tab');
    const firstTypePicker = page.getByRole('combobox', { name: 'Ingredient type, row 1' });
    await expect(firstTypePicker).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Volume amount, row 1' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Volume unit, row 1' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Weight amount, row 1' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Weight unit, row 1' })).toBeFocused();
    await page.keyboard.press('Tab');
    const firstPreparationCell = grid.locator('[aria-label="Preparation, row 1"]');
    await expect(firstPreparationCell).toBeFocused();
    await page.keyboard.press('c');
    const keyboardPreparation = page.getByRole('combobox', { name: 'Preparation, row 1' });
    await expect(keyboardPreparation).toBeFocused();
    await expect(keyboardPreparation).toHaveValue('c');
    await keyboardPreparation.pressSequentially('hop');
    await expect(page.getByRole('option', { name: 'chopped', exact: true })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(keyboardPreparation).toHaveValue('chopped');
    await expect(keyboardPreparation).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(grid.locator('[aria-label="Preparation, row 1"]')).toHaveText('chopped');
    await grid.locator('[aria-label="Preparation, row 1"]').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(grid.locator('[aria-label="Preparation, row 1"]')).toHaveText('crushed');
    await expect(grid.getByRole('cell', { name: 'Add ingredient row' })).toBeFocused();

    const mainCheckbox = page.getByRole('checkbox', { name: 'Main, row 1' });
    await mainCheckbox.focus();
    await page.keyboard.press('Space');
    await grid.locator('[aria-label="Specifics, row 1"]').click();
    const firstDetailEditor = page.getByRole('textbox', { name: 'Specifics, row 1' });
    await firstDetailEditor.fill('fresh');
    await page.keyboard.press('Enter');
    await grid.locator('[aria-label="Preparation, row 1"]').click();
    const firstPreparation = page.getByRole('combobox', { name: 'Preparation, row 1' });
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option', { name: 'chopped', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: /^Add / })).toHaveCount(0);
    await firstPreparation.fill('chop');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option', { name: 'Add "chop"' })).toBeVisible();
    await page.getByRole('option', { name: 'chopped', exact: true }).click();
    await expect(firstPreparation).toHaveValue('chopped');
    await page.keyboard.press('Enter');
    await expect(firstPreparation).toHaveCount(0);
    await expect(grid.locator('[aria-label="Preparation, row 1"]')).toHaveText('chopped');

    await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
    const secondIngredient = page.getByRole('combobox', { name: 'Ingredient, row 2' });
    await secondIngredient.fill('Tomato');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(secondIngredient).toHaveValue('Tomato');
    await expect(grid.getByRole('row')).toHaveCount(3);
    await page.keyboard.press('Enter');
    await expect(grid.getByRole('row')).toHaveCount(4);
    await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
    const thirdIngredient = page.getByRole('combobox', { name: 'Ingredient, row 3' });
    await thirdIngredient.fill('Onion');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(thirdIngredient).toHaveValue('Onion');
    await page.keyboard.press('Enter');
    await expect(grid.getByRole('row')).toHaveCount(5);
    await grid.locator('[aria-label="Specifics, row 2"]').click();
    const secondDetail = page.getByRole('textbox', { name: 'Specifics, row 2' });
    await secondDetail.fill('ripe');
    await page.keyboard.press('Enter');
    await page.locator('[aria-label="Ingredient, row 2"]').focus();
    await page.keyboard.press('Control+ArrowUp');
    await expect(page.locator('.recipe-ingredient-editor [aria-live="polite"]')).toHaveText(
      'Tomato moved to row 1.',
    );
    await expect(grid.getByRole('row').nth(1)).toContainText('Tomato');
    await page.keyboard.press('Control+ArrowDown');
    await expect(page.locator('.recipe-ingredient-editor [aria-live="polite"]')).toHaveText(
      'Tomato moved to row 2.',
    );
    await expect(grid.getByRole('row').nth(2)).toContainText('Tomato');
    const dragHandle = page.getByRole('button', { name: 'Reorder ingredient row 1' });
    await dragByPointer(page, dragHandle, grid.getByRole('row').nth(2).getByRole('cell').first());
    await expect(grid.getByRole('row').nth(1)).toContainText('Tomato');
    await expect(grid.getByRole('row').nth(2)).toContainText('Basil');
    await dragByPointer(
      page,
      page.getByRole('button', { name: 'Reorder ingredient row 2' }),
      page.getByRole('button', { name: 'Reorder ingredient row 1' }),
    );
    await expect(grid.getByRole('row').nth(1)).toContainText('Basil');
    await dragByPointer(
      page,
      page.getByRole('button', { name: 'Reorder ingredient row 1' }),
      page.getByRole('button', { name: 'Reorder ingredient row 2' }),
    );
    await expect(grid.getByRole('row').nth(1)).toContainText('Tomato');
    const idleA11y = await new AxeBuilder({ page })
      .include('.recipe-ingredient-editor')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(idleA11y.violations).toEqual([]);

    const scrollSourceRow = grid.locator('tbody tr[data-row-id]').nth(0);
    const scrollTargetRow = grid.locator('tbody tr[data-row-id]').nth(2);
    const scrollSourceId = await scrollSourceRow.getAttribute('data-row-id');
    const scrollTargetId = await scrollTargetRow.getAttribute('data-row-id');
    const scrollSourceBounds = await scrollSourceRow.boundingBox();
    const scrollTargetBounds = await scrollTargetRow.boundingBox();
    const scrollSourceHandle = page.getByRole('button', { name: 'Reorder ingredient row 1' });
    const scrollHandleBounds = await scrollSourceHandle.boundingBox();
    if (
      !scrollSourceId ||
      !scrollTargetId ||
      !scrollSourceBounds ||
      !scrollTargetBounds ||
      !scrollHandleBounds
    ) {
      throw new Error('Ingredient rows must be visible for scroll-during-drag coverage.');
    }
    const scrollSource = page.locator(
      `.recipe-ingredient-table tbody tr[data-row-id="${scrollSourceId}"]`,
    );
    const scrollTarget = page.locator(
      `.recipe-ingredient-table tbody tr[data-row-id="${scrollTargetId}"]`,
    );
    const dragStartX = scrollHandleBounds.x + scrollHandleBounds.width / 2;
    const dragStartY = scrollHandleBounds.y + scrollHandleBounds.height / 2;
    const targetDocumentY = scrollTargetBounds.y + scrollTargetBounds.height / 2;
    const initialScrollY = await page.evaluate(() => window.scrollY);
    const scrollDistance = Math.max(8, Math.round((targetDocumentY - dragStartY) / 2));
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.evaluate((distance) => {
      window.scrollTo({ top: window.scrollY + distance, behavior: 'instant' });
    }, scrollDistance);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBe(initialScrollY + scrollDistance);
    const scrolledTargetBounds = await scrollTarget.boundingBox();
    if (!scrolledTargetBounds) {
      throw new Error('The ingredient drop target must remain visible after scrolling.');
    }
    const scrolledPointerY = scrolledTargetBounds.y + scrolledTargetBounds.height / 2;
    await page.mouse.move(dragStartX, scrolledPointerY, { steps: 4 });
    await expect(scrollSource).toHaveAttribute('data-reorder-state', 'dragging');
    await expect(scrollTarget).toHaveAttribute('data-reorder-state', 'displaced');
    await expect
      .poll(async () => {
        const bounds = await scrollSource.boundingBox();
        return bounds
          ? Math.abs(bounds.y - (scrollSourceBounds.y + scrolledPointerY - dragStartY))
          : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(2);
    await page.mouse.up();
    await expect(scrollSource).toHaveCSS('transform', 'none');
    await expect(grid.locator('tbody tr[data-row-id]').nth(2)).toHaveAttribute(
      'data-row-id',
      scrollSourceId,
    );
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), initialScrollY);
    await dragByPointer(
      page,
      page.getByRole('button', { name: 'Reorder ingredient row 3' }),
      page.getByRole('button', { name: 'Reorder ingredient row 1' }),
    );
    await expect(grid.locator('tbody tr[data-row-id]').nth(0)).toHaveAttribute(
      'data-row-id',
      scrollSourceId,
    );

    const mouseSource = await page
      .getByRole('button', { name: 'Reorder ingredient row 1' })
      .boundingBox();
    const mouseTarget = await page
      .getByRole('button', { name: 'Reorder ingredient row 2' })
      .boundingBox();
    if (!mouseSource || !mouseTarget) {
      throw new Error('Both desktop drag handles must be visible.');
    }
    await page.mouse.move(
      mouseSource.x + mouseSource.width / 2,
      mouseSource.y + mouseSource.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      mouseTarget.x + mouseTarget.width / 2,
      mouseTarget.y + mouseTarget.height / 2,
      { steps: 12 },
    );
    await expect(grid.locator('tbody tr[data-row-id]').nth(0)).toHaveAttribute(
      'data-reorder-state',
      'dragging',
    );
    await expect
      .poll(() =>
        grid
          .locator('tbody tr[data-reorder-state="dragging"]')
          .evaluate((row) => getComputedStyle(row).transform),
      )
      .not.toBe('none');
    await expect(grid.locator('tbody tr[data-row-id]').nth(1)).toHaveAttribute(
      'data-reorder-state',
      'displaced',
    );
    await expect(
      page.locator(
        '.recipe-ingredient-desktop .recipe-ingredient-rail-row[data-reorder-state="dragging"]',
      ),
    ).toHaveCount(1);
    await expect(
      page.locator(
        '.recipe-ingredient-desktop .recipe-ingredient-rail-row[data-reorder-state="displaced"]',
      ),
    ).toHaveCount(1);
    const draggingA11y = await new AxeBuilder({ page })
      .include('.recipe-ingredient-editor')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(draggingA11y.violations).toEqual([]);
    await expect(grid.locator('tbody tr[data-reorder-state="dragging"]')).toHaveCount(1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() =>
        grid
          .locator('tbody tr[data-reorder-state="displaced"]')
          .evaluate((row) => getComputedStyle(row).transitionDuration),
      )
      .toBe('0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.mouse.up();
    await expect(grid.getByRole('row').nth(1)).toContainText('Basil');
    const droppedA11y = await new AxeBuilder({ page })
      .include('.recipe-ingredient-editor')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(droppedA11y.violations).toEqual([]);
    await dragByPointer(
      page,
      page.getByRole('button', { name: 'Reorder ingredient row 1' }),
      page.getByRole('button', { name: 'Reorder ingredient row 2' }),
    );
    await expect(grid.getByRole('row').nth(1)).toContainText('Tomato');

    const firstRowIdBeforeCancel = await grid
      .locator('tbody tr[data-row-id]')
      .nth(0)
      .getAttribute('data-row-id');
    const cancelSource = await page
      .getByRole('button', { name: 'Reorder ingredient row 1' })
      .boundingBox();
    const cancelTarget = await page
      .getByRole('button', { name: 'Reorder ingredient row 3' })
      .boundingBox();
    if (!cancelSource || !cancelTarget) {
      throw new Error('Both ingredient drag handles must be visible for cancellation.');
    }
    await page.mouse.move(
      cancelSource.x + cancelSource.width / 2,
      cancelSource.y + cancelSource.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cancelTarget.x + cancelTarget.width / 2,
      cancelTarget.y + cancelTarget.height / 2,
      { steps: 4 },
    );
    await expect(grid.locator('tbody tr[data-reorder-state="displaced"]')).toHaveCount(2);
    await page
      .getByRole('button', { name: 'Reorder ingredient row 1' })
      .dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
    await page.mouse.up();
    await expect(grid.locator('[data-reorder-state]')).toHaveCount(0);
    await expect(grid.locator('tbody tr[data-row-id]').nth(0)).toHaveAttribute(
      'data-row-id',
      firstRowIdBeforeCancel ?? '',
    );

    const axeResults = await new AxeBuilder({ page })
      .include('.recipe-ingredient-editor')
      .analyze();
    expect(axeResults.violations).toEqual([]);

    const saveButton = page.getByRole('button', { name: 'Save recipe' });
    await saveButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Keyboard ingredient rows' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeVisible();
    await expect(page.locator('.recipe-ingredient-list')).toContainText('ripe tomato');
    await expect(page.locator('.recipe-ingredient-list')).toContainText('fresh basil, chopped');
    await expect(page.locator('.recipe-ingredient-list')).toContainText('onion');
    await page.getByRole('link', { name: 'Edit' }).click();
    const reloadedGrid = page.getByRole('table', { name: 'Recipe ingredients', exact: true });
    await expect(reloadedGrid.getByRole('row').nth(1)).toContainText('Tomato');
    await expect(reloadedGrid.getByRole('row').nth(2)).toContainText('Basil');
    await expect(reloadedGrid.getByRole('row').nth(3)).toContainText('Onion');
    await expect(reloadedGrid.locator('[aria-label="Specifics, row 1"]')).toHaveText('ripe');
    await expect(reloadedGrid.locator('[aria-label="Preparation, row 1"]')).toHaveText('');
    await expect(reloadedGrid.locator('[aria-label="Specifics, row 2"]')).toHaveText('fresh');
    await expect(reloadedGrid.locator('[aria-label="Preparation, row 2"]')).toHaveText('chopped');
    await expect(page.getByRole('checkbox', { name: 'Main, row 1' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Main, row 2' })).toBeChecked();
    const deleteBasil = page.getByRole('button', { name: 'Delete ingredient row 2' });
    await expect(deleteBasil).toHaveCSS('opacity', '0');
    await reloadedGrid.getByRole('row').nth(2).hover();
    await expect(deleteBasil).toHaveCSS('opacity', '1');
    await expect(deleteBasil).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await deleteBasil.focus();
    await expect(deleteBasil).toHaveCSS('background-color', 'rgb(180, 62, 50)');
    await deleteBasil.hover();
    await expect(deleteBasil).toHaveCSS('width', '32px');
    await expect(deleteBasil).toHaveCSS('background-color', 'rgb(180, 62, 50)');
    await expect(deleteBasil).toHaveCSS('color', 'rgb(255, 255, 255)');
    await deleteBasil.click();
    await expect(reloadedGrid.getByRole('row')).toHaveCount(4);
    await expect(reloadedGrid).not.toContainText('Basil');
    await expect(reloadedGrid).toContainText('Tomato');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Keyboard ingredient rows' })).toBeVisible();
    await expect(page.locator('.recipe-ingredient-list')).not.toContainText('Basil');
    await expect(page.locator('.recipe-ingredient-list')).toContainText('ripe tomato');
    await expect(page.locator('.recipe-ingredient-list')).toContainText('onion');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('mobile ingredient entry uses a compact row popover @e2e @a11y @ingredientRows', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 390, height: 520 });
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Mobile ingredient rows');
    const mobileList = page.getByRole('table', {
      name: 'Recipe ingredients on mobile',
      exact: true,
    });
    await expect(mobileList).toBeVisible();
    const idleMobileA11y = await new AxeBuilder({ page })
      .include('.recipe-ingredient-mobile')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(idleMobileA11y.violations).toEqual([]);
    expect(
      (await mobileList.locator('.recipe-ingredient-drag-handle').first().boundingBox())?.width,
    ).toBe(24);
    await expect(page.locator('.recipe-state-fields')).toHaveCSS('row-gap', '6px');
    await expect(page.locator('.recipe-time-fields')).toHaveCSS('row-gap', '8px');
    await expect(page.getByRole('table', { name: 'Recipe ingredients', exact: true })).toBeHidden();

    await page.evaluate(() => {
      const trigger = document.querySelector('[aria-label="Enter ingredient"]');
      if (trigger) {
        window.scrollTo(
          0,
          window.scrollY + trigger.getBoundingClientRect().bottom - window.innerHeight + 8,
        );
      }
    });
    const enterIngredient = mobileList.getByRole('button', { name: 'Enter ingredient' });
    await enterIngredient.click();
    const editor = page.getByRole('dialog', { name: 'Ingredient details' });
    await expect(editor).toBeVisible();
    await expect(editor).toHaveClass(/recipe-ingredient-mobile-popover/);
    await expect(page.getByRole('dialog', { name: 'Ingredient details' })).toHaveCount(1);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    const editorBounds = await editor.boundingBox();
    const triggerBounds = await enterIngredient.boundingBox();
    expect(editorBounds).not.toBeNull();
    expect(triggerBounds).not.toBeNull();
    expect(editorBounds?.width).toBe(334);
    expect(editorBounds?.y).toBeLessThan(triggerBounds?.y ?? 0);
    expect(editorBounds?.y).toBeGreaterThanOrEqual(0);
    expect((editorBounds?.y ?? 0) + (editorBounds?.height ?? 0)).toBeLessThanOrEqual(520);
    await editor.getByRole('combobox', { name: 'Ingredient type, row 1' }).click();
    await page.getByRole('option', { name: 'Unit', exact: true }).click();
    const mobileAmountFields = [
      editor.getByRole('combobox', { name: 'Ingredient type, row 1' }),
      editor.getByRole('textbox', { name: 'Volume amount, row 1' }),
      editor.getByRole('combobox', { name: 'Volume unit, row 1' }),
      editor.getByRole('textbox', { name: 'Weight amount, row 1' }),
      editor.getByRole('combobox', { name: 'Weight unit, row 1' }),
    ];
    await editor.getByRole('textbox', { name: 'Volume amount, row 1' }).fill('1 1/2');
    await editor.getByRole('textbox', { name: 'Weight amount, row 1' }).fill('1 1/2');
    const amountFieldCenters = await Promise.all(
      mobileAmountFields.map((field) =>
        field.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top + bounds.height / 2;
        }),
      ),
    );
    expect(Math.max(...amountFieldCenters) - Math.min(...amountFieldCenters)).toBeLessThanOrEqual(
      1,
    );
    await page.getByLabel('Name').click();
    await expect(editor).toBeHidden();
    await enterIngredient.click();
    const ingredientInput = editor.getByRole('combobox', { name: 'Ingredient', exact: true });
    await expect(ingredientInput).not.toHaveAttribute('list', /.+/);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await ingredientInput.fill('Cheese');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.getByRole('option', { name: 'Add "Cheese"' }).click();
    await editor.getByRole('textbox', { name: 'Specifics' }).fill('Yellow');
    const preparation = editor.getByRole('combobox', { name: 'Preparation' });
    await expect(preparation).not.toHaveAttribute('list', /.+/);
    await preparation.focus();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option', { name: 'chopped', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: /^Add / })).toHaveCount(0);
    await preparation.fill('dic');
    await expect(page.getByRole('listbox')).toBeVisible();
    const preparationOption = page.getByRole('option', { name: 'diced', exact: true });
    const optionBounds = await preparationOption.boundingBox();
    expect(optionBounds?.x).toBeGreaterThanOrEqual(0);
    expect((optionBounds?.x ?? 0) + (optionBounds?.width ?? 0)).toBeLessThanOrEqual(390);
    expect(optionBounds?.y).toBeGreaterThanOrEqual(0);
    expect((optionBounds?.y ?? 0) + (optionBounds?.height ?? 0)).toBeLessThanOrEqual(520);
    await preparationOption.click();
    await expect(preparation).toHaveValue('diced');
    await editor.getByRole('button', { name: 'Submit' }).click();

    await expect(mobileList).toContainText('yellow cheese, diced');
    await expect(editor).toBeHidden();
    const mobileDelete = mobileList.getByRole('button', { name: 'Delete ingredient row 1' });
    await mobileDelete.hover();
    await expect(mobileDelete).toHaveCSS('background-color', 'rgb(180, 62, 50)');
    await expect(mobileDelete).toHaveCSS('color', 'rgb(255, 255, 255)');
    await mobileList.getByRole('button', { name: 'Enter ingredient' }).click();
    await editor.getByRole('combobox', { name: 'Ingredient', exact: true }).fill('Flour');
    await editor
      .getByRole('textbox', { name: 'Specifics' })
      .fill('White flour, stone-ground and finely milled for pastry baking');
    await editor.getByRole('combobox', { name: 'Preparation' }).fill('sifted');
    await editor.getByRole('button', { name: 'Submit' }).click();
    const sourceHandle = mobileList.getByRole('button', { name: 'Reorder ingredient row 1' });
    const sourceRowId = await sourceHandle.evaluate((handle) =>
      handle.closest('tr')?.getAttribute('data-row-id'),
    );
    if (!sourceRowId) {
      throw new Error('The source ingredient row must have a stable id.');
    }
    const sourceRow = mobileList.locator(
      `.recipe-ingredient-mobile-row[data-row-id="${sourceRowId}"]`,
    );
    const sourceRowBounds = await sourceRow.boundingBox();
    const sourceHandleBounds = await sourceHandle.boundingBox();
    const destination = await mobileList.getByRole('row').nth(1).boundingBox();
    if (!sourceRowBounds || !sourceHandleBounds || !destination) {
      throw new Error('The mobile drag targets must be visible.');
    }
    expect(destination.height - sourceRowBounds.height).toBeGreaterThan(12);
    const touchSession = await page.context().newCDPSession(page);
    await touchSession.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    const touchPoint = (id: number, x: number, y: number) => ({
      id,
      x,
      y,
      radiusX: 5,
      radiusY: 5,
      force: 1,
    });
    const sourceX = sourceHandleBounds.x + sourceHandleBounds.width / 2;
    const sourceY = sourceHandleBounds.y + sourceHandleBounds.height / 2;
    const targetX = destination.x + destination.width / 2;
    const targetY = destination.y + destination.height / 2;
    await touchSession.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint(1, sourceX, sourceY)],
    });
    await touchSession.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touchPoint(1, targetX, targetY)],
    });
    await expect(mobileList.locator('.recipe-ingredient-mobile-row').first()).toHaveAttribute(
      'data-reorder-state',
      'dragging',
    );
    await expect(mobileList.locator('.recipe-ingredient-mobile-row').nth(1)).toHaveAttribute(
      'data-reorder-state',
      'displaced',
    );
    const draggingMobileA11y = await new AxeBuilder({ page })
      .include('.recipe-ingredient-mobile')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(draggingMobileA11y.violations).toEqual([]);
    await expect(
      mobileList.locator('.recipe-ingredient-mobile-row[data-reorder-state="dragging"]'),
    ).toHaveCount(1);
    await expect(sourceRow.locator('.recipe-ingredient-mobile-cell')).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    const displacedRow = mobileList.locator(
      '.recipe-ingredient-mobile-row[data-reorder-state="displaced"]',
    );
    const displacedRowId = await displacedRow.getAttribute('data-row-id');
    if (!displacedRowId) {
      throw new Error('The displaced ingredient row must have a stable id.');
    }
    const stableDisplacedRow = mobileList.locator(
      `.recipe-ingredient-mobile-row[data-row-id="${displacedRowId}"]`,
    );
    await expect
      .poll(async () => {
        const sourceBounds = await sourceRow.boundingBox();
        const displacedBounds = await displacedRow.boundingBox();
        return sourceBounds && displacedBounds
          ? Math.abs(sourceBounds.y - (displacedBounds.y + displacedBounds.height))
          : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(2);
    await expect(sourceRow.locator('.recipe-ingredient-rail-row')).toHaveCSS('transform', 'none');
    await expect(displacedRow.locator('.recipe-ingredient-rail-row')).toHaveCSS(
      'transform',
      'none',
    );
    const previewTop = (await sourceRow.boundingBox())?.y;
    const displacedPreviewTop = (await stableDisplacedRow.boundingBox())?.y;
    expect(previewTop).toBeDefined();
    expect(displacedPreviewTop).toBeDefined();
    await touchSession.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    const releasedTop = (await sourceRow.boundingBox())?.y;
    const displacedReleasedTop = (await stableDisplacedRow.boundingBox())?.y;
    expect(releasedTop).toBeDefined();
    expect(displacedReleasedTop).toBeDefined();
    expect(Math.abs((releasedTop ?? 0) - (previewTop ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((displacedReleasedTop ?? 0) - (displacedPreviewTop ?? 0))).toBeLessThanOrEqual(
      2,
    );
    await expect(sourceRow).not.toHaveAttribute('data-reorder-state', 'settling');
    await expect(mobileList.getByRole('row').first()).toContainText(
      'white flour, stone-ground and finely milled for pastry baking flour, sifted',
    );
    await expect(mobileList.getByRole('row').nth(1)).toContainText('yellow cheese, diced');
    await expect(sourceRow).toHaveCSS('transform', 'none');
    await expect(stableDisplacedRow).toHaveCSS('transform', 'none');
    const finalSourceBounds = await sourceRow.boundingBox();
    const finalDisplacedBounds = await stableDisplacedRow.boundingBox();
    const finalFirstBounds = await mobileList.getByRole('row').first().boundingBox();
    expect(finalSourceBounds).not.toBeNull();
    expect(finalDisplacedBounds).not.toBeNull();
    expect(finalFirstBounds).not.toBeNull();
    expect(
      Math.abs((finalDisplacedBounds?.y ?? 0) - (displacedPreviewTop ?? 0)),
    ).toBeLessThanOrEqual(2);
    expect(
      Math.abs(
        (finalSourceBounds?.y ?? 0) -
          ((finalFirstBounds?.y ?? 0) + (finalFirstBounds?.height ?? 0)),
      ),
    ).toBeLessThanOrEqual(2);
    await expect(mobileList.getByRole('row').first()).toHaveCSS('transform', 'none');
    await expect(
      mobileList
        .locator('.recipe-ingredient-mobile-row')
        .first()
        .locator('.recipe-ingredient-rail-row'),
    ).toHaveCSS('transform', 'none');
    const droppedMobileA11y = await new AxeBuilder({ page })
      .include('.recipe-ingredient-mobile')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(droppedMobileA11y.violations).toEqual([]);
    const cancelSourceBounds = await sourceHandle.boundingBox();
    const cancelTargetBounds = await mobileList.getByRole('row').nth(1).boundingBox();
    if (!cancelSourceBounds || !cancelTargetBounds) {
      throw new Error('The mobile rows must be visible for touch cancellation.');
    }
    await touchSession.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        touchPoint(
          2,
          cancelSourceBounds.x + cancelSourceBounds.width / 2,
          cancelSourceBounds.y + cancelSourceBounds.height / 2,
        ),
      ],
    });
    await touchSession.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        touchPoint(
          2,
          cancelTargetBounds.x + cancelTargetBounds.width / 2,
          cancelTargetBounds.y + cancelTargetBounds.height / 2,
        ),
      ],
    });
    await expect(mobileList.locator('.recipe-ingredient-mobile-row').first()).toHaveAttribute(
      'data-reorder-state',
      'dragging',
    );
    await expect(mobileList.locator('.recipe-ingredient-mobile-row').nth(1)).toHaveAttribute(
      'data-reorder-state',
      'displaced',
    );
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect(mobileList.locator('[data-reorder-state]')).toHaveCount(0);
    await expect(mobileList.getByRole('row').first()).toContainText(
      'white flour, stone-ground and finely milled for pastry baking flour, sifted',
    );

    for (const ingredientName of ['Pepper', 'Salt']) {
      await mobileList.getByRole('button', { name: 'Enter ingredient' }).click();
      await editor.getByRole('combobox', { name: 'Ingredient', exact: true }).fill(ingredientName);
      await page.getByRole('option', { name: `Add "${ingredientName}"` }).click();
      await editor.getByRole('button', { name: 'Submit' }).click();
    }

    const verifyTouchReorder = async (
      sourceIndex: number,
      targetIndex: number,
      touchId: number,
    ) => {
      const rows = mobileList.locator('.recipe-ingredient-mobile-row');
      const source = rows.nth(sourceIndex);
      const target = rows.nth(targetIndex);
      const sourceRowId = await source.getAttribute('data-row-id');
      if (!sourceRowId) {
        throw new Error('The source ingredient row must have a stable id.');
      }
      const stableSource = mobileList.locator(
        `.recipe-ingredient-mobile-row[data-row-id="${sourceRowId}"]`,
      );
      const sourceHandle = stableSource.getByRole('button', {
        name: `Reorder ingredient row ${sourceIndex + 1}`,
      });
      const sourceHandleBounds = await sourceHandle.boundingBox();
      const sourceRowBounds = await source.boundingBox();
      const targetBounds = await target.boundingBox();
      if (!sourceHandleBounds || !sourceRowBounds || !targetBounds) {
        throw new Error('The multi-row touch reorder targets must be visible.');
      }

      const affectedIndices =
        sourceIndex < targetIndex
          ? Array.from({ length: targetIndex - sourceIndex }, (_, index) => sourceIndex + index + 1)
          : Array.from({ length: sourceIndex - targetIndex }, (_, index) => targetIndex + index);
      const originalTops = new Map(
        await Promise.all(
          affectedIndices.map(async (index) => {
            const row = rows.nth(index);
            const rowId = await row.getAttribute('data-row-id');
            const bounds = await row.boundingBox();
            if (!rowId || !bounds) {
              throw new Error('Each displaced ingredient row must have a stable position.');
            }
            return [rowId, bounds.y] as const;
          }),
        ),
      );
      const displacedRows = mobileList.locator(
        '.recipe-ingredient-mobile-row[data-reorder-state="displaced"]',
      );
      const expectedDisplacedCount = Math.abs(targetIndex - sourceIndex);
      await touchSession.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          touchPoint(
            touchId,
            sourceHandleBounds.x + sourceHandleBounds.width / 2,
            sourceHandleBounds.y + sourceHandleBounds.height / 2,
          ),
        ],
      });
      await touchSession.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          touchPoint(
            touchId,
            targetBounds.x + targetBounds.width / 2,
            targetBounds.y + targetBounds.height / 2,
          ),
        ],
      });
      await expect(displacedRows).toHaveCount(expectedDisplacedCount);
      const displacedIds = await displacedRows.evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute('data-row-id'))
          .filter((rowId): rowId is string => rowId !== null),
      );
      const expectedDisplacement = (sourceIndex < targetIndex ? -1 : 1) * sourceRowBounds.height;
      await expect
        .poll(async () => {
          const differences = await Promise.all(
            displacedIds.map(async (rowId) => {
              const bounds = await mobileList
                .locator(`.recipe-ingredient-mobile-row[data-row-id="${rowId}"]`)
                .boundingBox();
              return bounds
                ? Math.abs(bounds.y - (originalTops.get(rowId) ?? bounds.y) - expectedDisplacement)
                : Number.POSITIVE_INFINITY;
            }),
          );
          return Math.max(...differences);
        })
        .toBeLessThanOrEqual(2);
      const previewTops = new Map(
        await Promise.all(
          displacedIds.map(async (rowId) => {
            const bounds = await mobileList
              .locator(`.recipe-ingredient-mobile-row[data-row-id="${rowId}"]`)
              .boundingBox();
            if (!bounds) {
              throw new Error('Each displaced ingredient row must remain visible.');
            }
            return [rowId, bounds.y] as const;
          }),
        ),
      );
      const sourceTop = (await stableSource.boundingBox())?.y;
      expect(sourceTop).toBeDefined();

      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect(stableSource).toHaveCSS('transform', 'none');
      for (const [rowId, previewTop] of previewTops) {
        const displaced = mobileList.locator(
          `.recipe-ingredient-mobile-row[data-row-id="${rowId}"]`,
        );
        await expect(displaced).toHaveCSS('transform', 'none');
        const finalTop = (await displaced.boundingBox())?.y;
        expect(finalTop).toBeDefined();
        expect(Math.abs((finalTop ?? 0) - previewTop)).toBeLessThanOrEqual(2);
      }
      const finalSourceTop = (await stableSource.boundingBox())?.y;
      expect(finalSourceTop).toBeDefined();
      expect(Math.abs((finalSourceTop ?? 0) - (sourceTop ?? 0))).toBeLessThanOrEqual(2);
    };

    await verifyTouchReorder(0, 3, 3);
    await verifyTouchReorder(3, 0, 4);
    await expect(mobileList.getByRole('row').first()).toContainText(
      'white flour, stone-ground and finely milled for pastry baking flour, sifted',
    );
    await touchSession.detach();
    const deleteMobileIngredient = mobileList.getByRole('button', {
      name: 'Delete ingredient row 1',
    });
    await expect(deleteMobileIngredient).toBeVisible();
    await deleteMobileIngredient.click();
    await expect(mobileList).not.toContainText(
      'white flour, stone-ground and finely milled for pastry baking flour, sifted',
    );
    await expect(mobileList).toContainText('yellow cheese, diced');
    const axeResults = await new AxeBuilder({ page })
      .include('.recipe-ingredient-mobile')
      .analyze();
    expect(axeResults.violations).toEqual([]);
    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
  } finally {
    await deleteTestUser(request, user);
  }
});
