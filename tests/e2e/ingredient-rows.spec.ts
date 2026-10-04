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
}) => {
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
      page.locator('.recipe-ingredient-desktop button:not(.recipe-ingredient-drag-handle)'),
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
    await expect(grid.locator('[aria-label="Detail, row 1"]')).toBeFocused();
    await grid.locator('[aria-label="Ingredient, row 1"]').focus();
    await page.keyboard.press('Tab');
    const firstDetailCell = grid.locator('[aria-label="Detail, row 1"]');
    await expect(firstDetailCell).toBeFocused();
    await page.keyboard.press('f');
    const firstDetail = page.getByRole('textbox', { name: 'Detail, row 1' });
    await expect(firstDetail).toBeFocused();
    await expect(firstDetail).toHaveValue('f');
    await firstDetail.pressSequentially('resh');
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
    await grid.locator('[aria-label="Detail, row 1"]').click();
    const firstDetailEditor = page.getByRole('textbox', { name: 'Detail, row 1' });
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
    await grid.locator('[aria-label="Detail, row 2"]').click();
    const secondDetail = page.getByRole('textbox', { name: 'Detail, row 2' });
    await secondDetail.fill('ripe');
    await page.keyboard.press('Enter');
    await page.locator('[aria-label="Ingredient, row 2"]').focus();
    await page.keyboard.press('Control+ArrowUp');
    await expect(grid.getByRole('row').nth(1)).toContainText('Tomato');
    await page.keyboard.press('Control+ArrowDown');
    await expect(grid.getByRole('row').nth(2)).toContainText('Tomato');
    const dragHandle = page.getByRole('button', { name: 'Reorder ingredient row 1' });
    await dragHandle.dragTo(grid.getByRole('row').nth(2).getByRole('cell').first());
    await expect(grid.getByRole('row').nth(1)).toContainText('Tomato');
    await expect(grid.getByRole('row').nth(2)).toContainText('Basil');
    await page
      .getByRole('button', { name: 'Reorder ingredient row 2' })
      .dragTo(page.getByRole('button', { name: 'Reorder ingredient row 1' }));
    await expect(grid.getByRole('row').nth(1)).toContainText('Basil');
    await page
      .getByRole('button', { name: 'Reorder ingredient row 1' })
      .dragTo(page.getByRole('button', { name: 'Reorder ingredient row 2' }));
    await expect(grid.getByRole('row').nth(1)).toContainText('Tomato');

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
    await page.mouse.up();
    await expect(grid.getByRole('row').nth(1)).toContainText('Basil');
    await page
      .getByRole('button', { name: 'Reorder ingredient row 1' })
      .dragTo(page.getByRole('button', { name: 'Reorder ingredient row 2' }));
    await expect(grid.getByRole('row').nth(1)).toContainText('Tomato');

    const axeResults = await new AxeBuilder({ page })
      .include('.recipe-ingredient-editor')
      .analyze();
    expect(axeResults.violations).toEqual([]);

    const saveButton = page.getByRole('button', { name: 'Save recipe' });
    await saveButton.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Keyboard ingredient rows' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeVisible();
    await expect(page.locator('.recipe-ingredient-list')).toContainText('Ripe tomato');
    await expect(page.locator('.recipe-ingredient-list')).toContainText('Fresh basil, chopped');
    await page.getByRole('link', { name: 'Edit' }).click();
    const reloadedGrid = page.getByRole('table', { name: 'Recipe ingredients', exact: true });
    await expect(reloadedGrid.getByRole('row').nth(1)).toContainText('Tomato');
    await expect(reloadedGrid.getByRole('row').nth(2)).toContainText('Basil');
    await expect(reloadedGrid.locator('[aria-label="Detail, row 1"]')).toHaveText('ripe');
    await expect(reloadedGrid.locator('[aria-label="Preparation, row 1"]')).toHaveText('');
    await expect(reloadedGrid.locator('[aria-label="Detail, row 2"]')).toHaveText('fresh');
    await expect(reloadedGrid.locator('[aria-label="Preparation, row 2"]')).toHaveText('chopped');
    await expect(page.getByRole('checkbox', { name: 'Main, row 1' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Main, row 2' })).toBeChecked();
    const deleteBasil = page.getByRole('button', { name: 'Delete ingredient row 2' });
    await expect(deleteBasil).toHaveCSS('opacity', '0');
    await reloadedGrid.getByRole('row').nth(2).hover();
    await expect(deleteBasil).toHaveCSS('opacity', '1');
    await deleteBasil.click();
    await expect(reloadedGrid.getByRole('row')).toHaveCount(3);
    await expect(reloadedGrid).not.toContainText('Basil');
    await expect(reloadedGrid).toContainText('Tomato');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Keyboard ingredient rows' })).toBeVisible();
    await expect(page.locator('.recipe-ingredient-list')).not.toContainText('Basil');
    await expect(page.locator('.recipe-ingredient-list')).toContainText('Ripe tomato');
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
    expect(editorBounds?.y).toBeLessThan(triggerBounds?.y ?? 0);
    expect(editorBounds?.y).toBeGreaterThanOrEqual(0);
    expect((editorBounds?.y ?? 0) + (editorBounds?.height ?? 0)).toBeLessThanOrEqual(520);
    await page.getByLabel('Name').click();
    await expect(editor).toBeHidden();
    await enterIngredient.click();
    const ingredientInput = editor.getByRole('combobox', { name: 'Ingredient' });
    await expect(ingredientInput).not.toHaveAttribute('list', /.+/);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await ingredientInput.fill('Cheese');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.getByRole('option', { name: 'Add "Cheese"' }).click();
    await editor.getByRole('textbox', { name: 'Detail' }).fill('Yellow');
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

    await expect(mobileList).toContainText('Yellow cheese, diced');
    await expect(editor).toBeHidden();
    await mobileList.getByRole('button', { name: 'Enter ingredient' }).click();
    await editor.getByRole('combobox', { name: 'Ingredient' }).fill('Flour');
    await editor.getByRole('textbox', { name: 'Detail' }).fill('White');
    await editor.getByRole('combobox', { name: 'Preparation' }).fill('sifted');
    await editor.getByRole('button', { name: 'Submit' }).click();
    const sourceHandle = mobileList.getByRole('button', { name: 'Reorder ingredient row 1' });
    const destination = await mobileList.getByRole('row').nth(1).boundingBox();
    if (!destination) {
      throw new Error('The mobile destination row must be visible.');
    }
    await sourceHandle.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch' });
    await sourceHandle.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: destination.x + destination.width / 2,
      clientY: destination.y + destination.height / 2,
    });
    await expect(mobileList.getByRole('row').first()).toContainText('White flour, sifted');
    const deleteMobileIngredient = mobileList.getByRole('button', {
      name: 'Delete ingredient row 1',
    });
    await expect(deleteMobileIngredient).toBeVisible();
    await deleteMobileIngredient.click();
    await expect(mobileList).not.toContainText('White flour, sifted');
    await expect(mobileList).toContainText('Yellow cheese, diced');
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
