import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications$/);
}

async function expectPaneAdjacentToRow(
  pane: import('@playwright/test').Locator,
  row: import('@playwright/test').Locator,
) {
  const paneBounds = await pane.boundingBox();
  const rowBounds = await row.boundingBox();
  expect(paneBounds).not.toBeNull();
  expect(rowBounds).not.toBeNull();
  if (!paneBounds || !rowBounds) return;

  const gapBelow = paneBounds.y - (rowBounds.y + rowBounds.height);
  const gapAbove = rowBounds.y - (paneBounds.y + paneBounds.height);
  expect(
    Math.min(Math.abs(gapBelow - 8), Math.abs(gapAbove - 8)),
    JSON.stringify({ paneBounds, rowBounds, gapBelow, gapAbove }),
  ).toBeLessThan(4);
}

test('Settings manages recipe picklist values as an ordered list @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForLoadState('networkidle');

    const section = page.getByRole('region', { name: 'Picklists' });
    await expect(section).toBeVisible();
    const toggle = section.getByRole('button', { name: 'Picklists' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(section.getByRole('list')).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const category = section.getByRole('combobox', { name: 'Picklist category' });
    await expect(category).toContainText('Food Type');
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    const addValue = section.getByRole('textbox', { name: 'Add Food Type' });
    await addValue.fill('Weeknight Supper');
    await addValue.press('Enter');
    await expect(section.getByRole('button', { name: 'Edit Weeknight Supper' })).toBeVisible();
    await expect(section.getByRole('status')).toHaveText('Food Type added.');
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.body))
      .toBe(true);

    await section.getByRole('button', { name: 'Edit Weeknight Supper' }).click();
    await section
      .getByRole('textbox', { name: 'Rename Weeknight Supper' })
      .fill('Outside canceled');
    await page.getByRole('heading', { name: 'Settings' }).click();
    await expect(section.getByRole('button', { name: 'Edit Weeknight Supper' })).toBeVisible();
    await section.getByRole('button', { name: 'Edit Weeknight Supper' }).click();
    await section.getByRole('textbox', { name: 'Rename Weeknight Supper' }).fill('Back canceled');
    await page.goBack();
    await expect(section.getByRole('button', { name: 'Edit Weeknight Supper' })).toBeVisible();
    await section.getByRole('button', { name: 'Edit Weeknight Supper' }).click();
    const renameInput = section.getByRole('textbox', { name: 'Rename Weeknight Supper' });
    await renameInput.fill('Discarded name');
    await renameInput.press('Escape');
    await expect(section.getByRole('button', { name: 'Edit Weeknight Supper' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.body))
      .toBe(true);
    await section.getByRole('button', { name: 'Edit Weeknight Supper' }).click();
    await section.getByRole('textbox', { name: 'Rename Weeknight Supper' }).fill('Quick Supper');
    await section.getByRole('textbox', { name: 'Rename Weeknight Supper' }).press('Enter');
    await expect(section.getByRole('button', { name: 'Edit Quick Supper' })).toBeVisible();
    await expect(section.getByRole('status')).toHaveText('Food Type renamed.');

    const picklist = section.getByRole('list', { name: 'Food Type' });
    await picklist.scrollIntoViewIfNeeded();
    const initialListMetrics = await picklist.evaluate((list) => ({
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
    }));
    expect(initialListMetrics.clientHeight).toBeLessThanOrEqual(424);
    expect(initialListMetrics.scrollHeight).toBeGreaterThan(initialListMetrics.clientHeight);
    const idleHandle = picklist
      .locator('[data-picklist-row]')
      .nth(7)
      .getByRole('button', { name: /^Reorder/ });
    const idleHandleBounds = await idleHandle.boundingBox();
    if (!idleHandleBounds) throw new Error('Expected the last visible picklist drag handle.');
    const idleListScrollTop = await picklist.evaluate((list) => list.scrollTop);
    const idleWindowScrollY = await page.evaluate(() => window.scrollY);
    await page.mouse.move(
      idleHandleBounds.x + idleHandleBounds.width / 2,
      idleHandleBounds.y + idleHandleBounds.height / 2,
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await picklist.evaluate((list) => list.scrollTop)).toBe(idleListScrollTop);
    expect(await page.evaluate(() => window.scrollY)).toBe(idleWindowScrollY);

    const firstRow = section.locator('[data-picklist-row]').first();
    const firstReorder = firstRow.getByRole('button', { name: /^Reorder/ });
    const firstValue =
      (await firstRow.getByRole('button', { name: /^Edit/ }).textContent())?.trim() ?? '';
    const secondRow = section.locator('[data-picklist-row]').nth(1);
    const secondValue =
      (await secondRow.getByRole('button', { name: /^Edit/ }).textContent())?.trim() ?? '';
    await firstReorder.scrollIntoViewIfNeeded();
    const firstHandleBounds = await firstReorder.boundingBox();
    const listBounds = await picklist.boundingBox();
    if (!firstHandleBounds || !listBounds)
      throw new Error('Expected visible picklist bounds before drag scrolling.');
    const initialScrollHeight = await picklist.evaluate((list) => list.scrollHeight);
    const initialWindowScrollY = await page.evaluate(() => window.scrollY);
    await page.mouse.move(
      firstHandleBounds.x + firstHandleBounds.width / 2,
      firstHandleBounds.y + firstHandleBounds.height / 2,
    );
    await page.mouse.down();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const scrollPointerY = Math.min(listBounds.y + listBounds.height - 4, viewportHeight - 2);
    await page.mouse.move(listBounds.x + listBounds.width / 2, scrollPointerY, { steps: 8 });
    await expect.poll(() => picklist.evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
    await expect
      .poll(() =>
        picklist.evaluate((list) => list.scrollTop + list.clientHeight >= list.scrollHeight - 1),
      )
      .toBe(true);
    expect(await picklist.evaluate((list) => list.scrollHeight)).toBe(initialScrollHeight);
    expect(await page.evaluate(() => window.scrollY)).toBe(initialWindowScrollY);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await firstReorder.scrollIntoViewIfNeeded();
    const reorderBounds = await firstReorder.boundingBox();
    const secondRowBounds = await secondRow.boundingBox();
    expect(firstValue).not.toBe('');
    expect(secondValue).not.toBe('');
    expect(reorderBounds).not.toBeNull();
    expect(secondRowBounds).not.toBeNull();
    await page.mouse.move(
      (reorderBounds?.x ?? 0) + (reorderBounds?.width ?? 0) / 2,
      (reorderBounds?.y ?? 0) + (reorderBounds?.height ?? 0) / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      (secondRowBounds?.x ?? 0) + (secondRowBounds?.width ?? 0) / 2,
      (secondRowBounds?.y ?? 0) + (secondRowBounds?.height ?? 0) / 2,
      { steps: 8 },
    );
    const sourceTopAfterCrossing = await firstRow.evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    await page.mouse.move(
      (secondRowBounds?.x ?? 0) + (secondRowBounds?.width ?? 0) / 2,
      (secondRowBounds?.y ?? 0) + (secondRowBounds?.height ?? 0) / 2 + 8,
    );
    await expect
      .poll(async () =>
        firstRow.evaluate(
          (element, previousTop) => element.getBoundingClientRect().top - previousTop,
          sourceTopAfterCrossing,
        ),
      )
      .toBeGreaterThan(4);
    await page.mouse.up();
    await expect(
      section.locator('[data-picklist-row]').first().getByRole('button', { name: /^Edit/ }),
    ).toHaveText(secondValue);
    await expect(section.getByRole('status')).toHaveText(`${firstValue} moved down.`);
    const draggedReorder = section.getByRole('button', { name: `Reorder ${firstValue}` });
    await expect(draggedReorder).toBeFocused();

    await page.reload();
    const reloadedToggle = page.getByRole('button', { name: 'Picklists' });
    await expect(reloadedToggle).toHaveAttribute('aria-expanded', 'false');
    await reloadedToggle.click();
    await expect(
      section.locator('[data-picklist-row]').first().getByRole('button', { name: /^Edit/ }),
    ).toHaveText(secondValue);
    await expect(
      section.locator('[data-picklist-row]').nth(1).getByRole('button', { name: /^Edit/ }),
    ).toHaveText(firstValue);
    await draggedReorder.focus();
    await page.keyboard.press('Control+ArrowUp');
    await expect(section.getByRole('status')).toHaveText(`${firstValue} moved up.`);

    const valuesBeforeSort = await section
      .locator('[data-picklist-row] button[aria-label^="Edit"] > span:first-child')
      .allTextContents();
    page.once('dialog', (dialog) => dialog.dismiss());
    await section.getByRole('button', { name: 'Sort A–Z' }).click();
    await expect(
      section.locator('[data-picklist-row] button[aria-label^="Edit"] > span:first-child'),
    ).toHaveText(valuesBeforeSort);
    page.once('dialog', async (dialog) => dialog.accept());
    await section.getByRole('button', { name: 'Sort A–Z' }).click();
    await expect(section.getByRole('status')).toHaveText('Food Type sorted A–Z.');
    const sortedValues = await section
      .locator('[data-picklist-row] button[aria-label^="Edit"] > span:first-child')
      .allTextContents();
    expect(sortedValues).toEqual(
      [...sortedValues].sort((left, right) =>
        left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
      ),
    );

    const mergePane = page.getByRole('region', { name: 'Merge Food Type values' });
    await section.getByRole('button', { name: 'Merge Quick Supper' }).click();
    const viewport = page.viewportSize();
    if (viewport && viewport.width <= 760) {
      const selectedRow = section
        .getByRole('button', { name: 'Merge Quick Supper' })
        .locator('xpath=ancestor::li[@data-picklist-row]');
      const paneBounds = await mergePane.boundingBox();
      expect(paneBounds).not.toBeNull();
      expect(paneBounds?.width).toBeLessThan(viewport.width);
      expect(paneBounds?.height).toBeLessThan(viewport.height * 0.85);
      await expectPaneAdjacentToRow(mergePane, selectedRow);
    }
    await page.getByRole('heading', { name: 'Settings' }).click();
    await expect(mergePane).toHaveCount(0);
    await section.getByRole('button', { name: 'Merge Quick Supper' }).click();
    const counterpart = mergePane.getByRole('combobox', { name: 'Merge Quick Supper with' });
    await counterpart.click();
    const mergeMenu = page.getByRole('listbox');
    const casseroleOption = page.getByRole('option', { name: 'Casserole', exact: true });
    await expect(mergeMenu).toHaveCSS('background-color', 'rgb(255, 250, 245)');
    await expect(casseroleOption).toHaveCSS('color', 'rgb(52, 37, 27)');
    await casseroleOption.hover();
    await expect(casseroleOption).toHaveCSS('background-color', 'rgb(243, 223, 210)');
    await casseroleOption.click();
    await counterpart.click();
    await expect(
      page
        .getByRole('option', { name: 'Casserole', exact: true })
        .locator('.single-picklist-check'),
    ).toHaveCSS('color', 'rgb(140, 63, 29)');
    await casseroleOption.click();
    const keepChoices = mergePane.getByRole('group', { name: 'Keep as' });
    await expect(keepChoices.getByRole('button', { name: 'Casserole' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(keepChoices.getByRole('button', { name: 'Quick Supper' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    const mergeButton = mergePane.getByRole('button', { name: 'Merge', exact: true });
    await expect(mergeButton).toBeDisabled();
    await keepChoices.getByRole('button', { name: 'Casserole' }).click();
    await expect(keepChoices.getByRole('button', { name: 'Casserole' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(keepChoices.getByRole('button', { name: 'Quick Supper' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(keepChoices.getByRole('button', { name: 'Quick Supper' })).toHaveCSS(
      'color',
      'rgb(140, 63, 29)',
    );
    await expect(mergeButton).toHaveCSS('background-color', 'rgb(72, 32, 17)');
    await mergeButton.click();
    await expect(section.getByRole('button', { name: 'Edit Quick Supper' })).toHaveCount(0);
    await expect(section.getByRole('status')).toHaveText('Food Type values merged.');

    await addValue.fill('Temporary Food Type');
    await addValue.press('Enter');
    await expect(section.getByRole('button', { name: 'Edit Temporary Food Type' })).toBeVisible();
    await section.getByRole('button', { name: 'Delete Temporary Food Type' }).click();
    const deletePane = page.getByRole('region', { name: 'Delete Food Type value' });
    if (viewport && viewport.width <= 760) {
      const selectedRow = section
        .getByRole('button', { name: 'Delete Temporary Food Type' })
        .locator('xpath=ancestor::li[@data-picklist-row]');
      await expectPaneAdjacentToRow(deletePane, selectedRow);
    }
    await expect(deletePane.getByText(/Used by 0 recipes/)).toBeVisible();
    await expect(
      deletePane.getByText(
        'This value is not used by any recipes and can be deleted without a replacement.',
      ),
    ).toBeVisible();
    await expect(deletePane.getByRole('combobox', { name: 'Replace with' })).toHaveCount(0);
    await page.getByRole('heading', { name: 'Settings' }).click();
    await expect(deletePane).toHaveCount(0);
    await section.getByRole('button', { name: 'Delete Temporary Food Type' }).click();
    await deletePane.getByRole('button', { name: 'Delete value' }).click();
    await expect(section.getByRole('button', { name: 'Edit Temporary Food Type' })).toHaveCount(0);
    await expect(section.getByRole('status')).toHaveText('Food Type deleted.');

    await category.selectOption('unmeasured_phrase');
    const addPhrase = section.getByRole('textbox', { name: 'Add Unmeasured Phrase' });
    await addPhrase.fill('Unused measurement phrase');
    await addPhrase.press('Enter');
    await section.getByRole('button', { name: 'Delete Unused measurement phrase' }).click();
    const unusedMeasurementPane = page.getByRole('region', {
      name: 'Delete Unmeasured Phrase value',
    });
    await expect(unusedMeasurementPane.getByText('Used by 0 recipes.')).toBeVisible();
    await expect(
      unusedMeasurementPane.getByText(
        'This value is not used by any recipes and can be deleted without a replacement.',
      ),
    ).toBeVisible();
    await expect(unusedMeasurementPane.getByRole('button', { name: 'Delete value' })).toBeEnabled();
    await expect(unusedMeasurementPane.getByRole('combobox', { name: 'Replace with' })).toHaveCount(
      0,
    );
    await unusedMeasurementPane.getByRole('button', { name: 'Delete value' }).click();
    await expect(
      section.getByRole('button', { name: 'Edit Unused measurement phrase' }),
    ).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('picklist management is owner-scoped and keeps protected occasion semantics after rename @e2e', async ({
  page,
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
  const catalogUrl = `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id,category,value,display_value,is_protected`;
  const revisionsUrl = `${config.apiUrl}/rest/v1/recipe_picklist_revisions?select=category,revision`;
  const manageUrl = `${config.apiUrl}/rest/v1/rpc/manage_recipe_picklist`;

  try {
    const ownerCatalogResponse = await request.get(catalogUrl, { headers: ownerHeaders });
    expect(ownerCatalogResponse.ok()).toBeTruthy();
    const ownerCatalog = (await ownerCatalogResponse.json()) as {
      id: string;
      category: string;
      value: string;
      display_value: string;
      is_protected: boolean;
    }[];
    const revisionsResponse = await request.get(revisionsUrl, { headers: ownerHeaders });
    expect(revisionsResponse.ok()).toBeTruthy();
    const ownerRevisions = (await revisionsResponse.json()) as {
      category: string;
      revision: number;
    }[];
    const occasion = ownerCatalog.find(
      (item) =>
        item.category === 'enthusiasm' && item.is_protected && item.value === 'Specific occasion',
    );
    expect(occasion?.is_protected).toBe(true);
    expect(ownerCatalog.some((item) => item.category === 'food_type')).toBe(true);
    expect(ownerRevisions.find((item) => item.category === 'food_type')).toBeDefined();
    const foodTypeRevision = ownerRevisions.find((item) => item.category === 'food_type')?.revision;
    const mealTypeRevision = ownerRevisions.find((item) => item.category === 'meal_type')?.revision;
    const enthusiasmRevision = ownerRevisions.find(
      (item) => item.category === 'enthusiasm',
    )?.revision;
    const unmeasuredRevision = ownerRevisions.find(
      (item) => item.category === 'unmeasured_phrase',
    )?.revision;
    const requiredPhrases = ownerCatalog.filter(
      (item) => item.category === 'unmeasured_phrase' && !item.is_protected,
    );
    const optionalFoodType = ownerCatalog.find(
      (item) => item.category === 'food_type' && !item.is_protected,
    );
    const mealTypeValues = ownerCatalog.filter(
      (item) => item.category === 'meal_type' && !item.is_protected,
    );
    expect(requiredPhrases.length).toBeGreaterThan(1);
    expect(optionalFoodType).toBeDefined();
    expect(mealTypeValues.length).toBeGreaterThan(1);

    const directWrite = await request.post(`${config.apiUrl}/rest/v1/recipe_picklist_values`, {
      headers: { ...ownerHeaders, Prefer: 'return=representation' },
      data: { account_id: owner.id, category: 'food_type', value: 'Direct write' },
    });
    expect(directWrite.ok()).toBe(false);

    const addValue = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'add',
        p_category: 'food_type',
        p_expected_revision: foodTypeRevision,
        p_value_id: null,
        p_value: 'Noodle Bowl',
        p_ordered_ids: [],
        p_source_ids: [],
        p_target_id: null,
        p_replacement_id: null,
        p_clear_optional: false,
      },
    });
    expect(addValue.ok(), await addValue.text()).toBeTruthy();
    const foodTypeRevisionAfterAdd = (await addValue.json()) as number;

    const duplicateValue = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'add',
        p_category: 'food_type',
        p_expected_revision: foodTypeRevisionAfterAdd,
        p_value: '  noodle bowl  ',
        p_ordered_ids: [],
        p_source_ids: [],
        p_target_id: null,
        p_replacement_id: null,
        p_clear_optional: false,
      },
    });
    expect(duplicateValue.ok()).toBe(false);

    const staleWrite = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'add',
        p_category: 'food_type',
        p_expected_revision: foodTypeRevision,
        p_value: 'Stale write must not persist',
        p_ordered_ids: [],
        p_source_ids: [],
        p_target_id: null,
        p_replacement_id: null,
        p_clear_optional: false,
      },
    });
    expect(staleWrite.ok()).toBe(false);

    const otherCatalogResponse = await request.get(catalogUrl, { headers: otherHeaders });
    expect(otherCatalogResponse.ok()).toBeTruthy();
    const otherCatalog = (await otherCatalogResponse.json()) as { value: string }[];
    expect(otherCatalog.some((item) => item.value === 'Noodle Bowl')).toBe(false);

    const currentCatalogResponse = await request.get(catalogUrl, { headers: ownerHeaders });
    const currentCatalog = (await currentCatalogResponse.json()) as typeof ownerCatalog;
    const currentOccasion = currentCatalog.find((item) => item.id === occasion?.id);
    expect(currentOccasion).toBeDefined();

    const renameOccasion = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'rename',
        p_category: 'enthusiasm',
        p_expected_revision: enthusiasmRevision,
        p_value_id: currentOccasion?.id,
        p_value: 'For a special gathering',
        p_ordered_ids: [],
        p_source_ids: [],
        p_target_id: null,
        p_replacement_id: null,
        p_clear_optional: false,
      },
    });
    expect(renameOccasion.ok(), await renameOccasion.text()).toBeTruthy();

    const renamedCatalogResponse = await request.get(catalogUrl, { headers: ownerHeaders });
    const renamedCatalog = (await renamedCatalogResponse.json()) as typeof ownerCatalog;
    const renamedOccasion = renamedCatalog.find((item) => item.id === occasion?.id);
    expect(renamedOccasion?.display_value).toBe('For a special gathering');
    expect(renamedOccasion?.value).toBe('Specific occasion');

    await signIn(page, owner.email, owner.password);
    await page.goto('/recipes/new');
    await page.getByRole('combobox', { name: 'Enthusiasm', exact: true }).click();
    await page.getByRole('option', { name: 'For a special gathering', exact: true }).click();
    await expect(page.locator('input[name="enthusiasm_id"]')).toHaveValue(occasion?.id ?? '');
    await expect(page.getByLabel('Occasion Details')).toBeVisible();

    const occasionRecipe = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'Special gathering recipe',
        p_food_type_id: optionalFoodType?.id,
        p_state: 'want_to_try',
        p_verdict_id: null,
        p_enthusiasm_id: occasion?.id,
        p_occasion_details: 'Shared at a family celebration',
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
        p_meal_type_ids: [mealTypeValues[0].id],
        p_cuisine_ids: [],
        p_equipment_ids: [],
      },
    });
    expect(occasionRecipe.ok(), await occasionRecipe.text()).toBeTruthy();
    const [savedOccasionRecipe] = (await occasionRecipe.json()) as { id: string }[];
    const savedOccasionResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=food_type_id,enthusiasm_id,occasion_details,version&id=eq.${savedOccasionRecipe.id}`,
      { headers: ownerHeaders },
    );
    expect(await savedOccasionResponse.json()).toEqual([
      {
        food_type_id: optionalFoodType?.id,
        enthusiasm_id: occasion?.id,
        occasion_details: 'Shared at a family celebration',
        version: 1,
      },
    ]);

    await page.goto('/settings');
    const settingsSection = page.getByRole('region', { name: 'Picklists' });
    await settingsSection.getByRole('button', { name: 'Picklists' }).click();
    await settingsSection
      .getByRole('button', { name: `Delete ${optionalFoodType?.display_value}` })
      .click();
    const deleteFoodPane = page.getByRole('region', { name: 'Delete Food Type value' });
    await expect(deleteFoodPane.getByText('Used by 1 recipe.')).toBeVisible();
    await expect(
      deleteFoodPane.getByText(
        'Choose a replacement to preserve these recipe references, or clear the optional references.',
      ),
    ).toBeVisible();
    const replacementPicker = deleteFoodPane.getByRole('combobox', { name: 'Replace with' });
    await expect(replacementPicker).toBeVisible();
    await replacementPicker.click();
    await expect(page.getByRole('listbox').getByRole('option').first()).toBeVisible();
    await page.getByRole('heading', { name: 'Settings' }).click();
    await expect(deleteFoodPane).toHaveCount(0);
    await settingsSection
      .getByRole('button', { name: `Delete ${optionalFoodType?.display_value}` })
      .click();
    await deleteFoodPane
      .getByRole('checkbox', { name: 'Clear optional recipe references' })
      .check();
    await deleteFoodPane.getByRole('button', { name: 'Delete value' }).click();
    await expect(settingsSection.getByRole('status')).toHaveText('Food Type deleted.');

    const clearedRecipeResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=food_type_id,version&id=eq.${savedOccasionRecipe.id}`,
      { headers: ownerHeaders },
    );
    expect(await clearedRecipeResponse.json()).toEqual([{ food_type_id: null, version: 2 }]);

    const mergeMealType = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'merge',
        p_category: 'meal_type',
        p_expected_revision: mealTypeRevision,
        p_value_id: null,
        p_value: null,
        p_ordered_ids: [],
        p_source_ids: [mealTypeValues[0].id],
        p_target_id: mealTypeValues[1].id,
        p_replacement_id: null,
        p_clear_optional: false,
      },
    });
    expect(mergeMealType.ok(), await mergeMealType.text()).toBeTruthy();

    const updatedRecipeResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=food_type_id,version&id=eq.${savedOccasionRecipe.id}`,
      { headers: ownerHeaders },
    );
    expect(await updatedRecipeResponse.json()).toEqual([{ food_type_id: null, version: 3 }]);
    const updatedAssignmentsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_assignments?select=picklist_value_id&recipe_id=eq.${savedOccasionRecipe.id}`,
      { headers: ownerHeaders },
    );
    expect(await updatedAssignmentsResponse.json()).toEqual([
      { picklist_value_id: mealTypeValues[1].id },
    ]);

    const protectedDelete = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'delete',
        p_category: 'enthusiasm',
        p_expected_revision: await renameOccasion.json(),
        p_value_id: occasion?.id,
        p_value: null,
        p_ordered_ids: [],
        p_source_ids: [],
        p_target_id: null,
        p_replacement_id: null,
        p_clear_optional: false,
      },
    });
    expect(protectedDelete.ok()).toBe(false);

    const requiredPhrase = requiredPhrases[0];
    const replacementPhrase = requiredPhrases[1];
    const measurementRecipeIds: string[] = [];
    for (const name of ['First measurement fixture', 'Second measurement fixture']) {
      const createMeasurementRecipe = await request.post(
        `${config.apiUrl}/rest/v1/rpc/save_recipe`,
        {
          headers: ownerHeaders,
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
            p_ingredient_rows: [
              {
                ingredient_id: null,
                ingredient_name: `${name} ingredient`,
                is_main: true,
                detail: '',
                preparation: '',
                measurements: [
                  {
                    measurement_type: 'unmeasured',
                    amount_min: null,
                    amount_max: null,
                    unit_code: null,
                    picklist_value_id: requiredPhrase.id,
                  },
                ],
              },
            ],
          },
        },
      );
      expect(createMeasurementRecipe.ok(), await createMeasurementRecipe.text()).toBeTruthy();
      const [recipe] = (await createMeasurementRecipe.json()) as { id: string }[];
      measurementRecipeIds.push(recipe.id);
    }

    const clearRequiredPhrase = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'delete',
        p_category: 'unmeasured_phrase',
        p_expected_revision: unmeasuredRevision,
        p_value_id: requiredPhrase.id,
        p_value: null,
        p_ordered_ids: [],
        p_source_ids: [],
        p_target_id: null,
        p_replacement_id: null,
        p_clear_optional: true,
      },
    });
    expect(clearRequiredPhrase.ok()).toBe(false);

    const replaceRequiredPhrase = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'delete',
        p_category: 'unmeasured_phrase',
        p_expected_revision: unmeasuredRevision,
        p_value_id: requiredPhrase.id,
        p_value: null,
        p_ordered_ids: [],
        p_source_ids: [],
        p_target_id: null,
        p_replacement_id: replacementPhrase.id,
        p_clear_optional: false,
      },
    });
    expect(replaceRequiredPhrase.ok(), await replaceRequiredPhrase.text()).toBeTruthy();

    const recipeIngredientsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=id,recipe_id&recipe_id=in.(${measurementRecipeIds.join(',')})&order=recipe_id.asc`,
      { headers: ownerHeaders },
    );
    const recipeIngredients = (await recipeIngredientsResponse.json()) as {
      id: string;
      recipe_id: string;
    }[];
    const rewrittenMeasurementsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=recipe_ingredient_id,picklist_value_id&recipe_ingredient_id=in.(${recipeIngredients.map((row) => row.id).join(',')})`,
      { headers: ownerHeaders },
    );
    const rewrittenMeasurements = await rewrittenMeasurementsResponse.json();
    expect(rewrittenMeasurements).toHaveLength(2);
    expect(rewrittenMeasurements).toEqual(
      expect.arrayContaining(
        recipeIngredients.map((row) => ({
          recipe_ingredient_id: row.id,
          picklist_value_id: replacementPhrase.id,
        })),
      ),
    );

    const rewrittenRecipesResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,version&id=in.(${measurementRecipeIds.join(',')})&order=id.asc`,
      { headers: ownerHeaders },
    );
    expect(await rewrittenRecipesResponse.json()).toEqual(
      [...measurementRecipeIds].sort().map((id) => ({ id, version: 2 })),
    );
    const rewriteHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=record_id,event_type,before_data,after_data&record_id=in.(${measurementRecipeIds.join(',')})&event_type=eq.recipe.updated`,
      { headers: ownerHeaders },
    );
    const rewriteHistory = (await rewriteHistoryResponse.json()) as {
      record_id: string;
      before_data: { ingredients: { measurements: { picklist_value: string }[] }[] };
      after_data: { ingredients: { measurements: { picklist_value: string }[] }[] };
    }[];
    expect(rewriteHistory).toHaveLength(2);
    for (const history of rewriteHistory) {
      expect(history.before_data.ingredients[0].measurements[0].picklist_value).toBe(
        requiredPhrase.value,
      );
      expect(history.after_data.ingredients[0].measurements[0].picklist_value).toBe(
        replacementPhrase.value,
      );
    }
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});
