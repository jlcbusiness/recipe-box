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

test('Settings owns unit preferences without a navigation Units menu @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };

  try {
    await signIn(page, user.email, user.password);
    const privateNavigation = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(privateNavigation.getByLabel('Units', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Personal preferences' })).toBeVisible();
    await expect(page.locator('.units-menu-panel')).toHaveCount(0);
    const settingsWidth = (await page.locator('.settings-main').boundingBox())?.width ?? 0;
    expect(settingsWidth).toBeGreaterThan((page.viewportSize()?.width ?? 0) * 0.75);

    const volumeSelect = page.getByRole('combobox', { name: 'Volume', exact: true });
    const weightSelect = page.getByRole('combobox', { name: 'Weight', exact: true });
    await expect(volumeSelect).toContainText('US customary');
    await expect(weightSelect).toContainText('US customary');
    const volumeWidth = (await volumeSelect.boundingBox())?.width ?? 0;

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    expect((await volumeSelect.boundingBox())?.height).toBe(36);
    expect((await weightSelect.boundingBox())?.height).toBe(36);

    await volumeSelect.focus();
    await page.keyboard.press('Tab');
    await expect(weightSelect).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(volumeSelect).toBeFocused();
    await expect(volumeSelect).toHaveCSS('outline-style', 'solid');

    if (testInfo.project.name === 'Fold 6') {
      const volumeHitHeight = await volumeSelect.evaluate((trigger) =>
        Number.parseFloat(getComputedStyle(trigger, '::before').height),
      );
      const weightHitHeight = await weightSelect.evaluate((trigger) =>
        Number.parseFloat(getComputedStyle(trigger, '::before').height),
      );
      expect(volumeHitHeight).toBeGreaterThanOrEqual(48);
      expect(weightHitHeight).toBeGreaterThanOrEqual(48);
    }

    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await expect(volumeSelect).toContainText('Metric');
    await expect(weightSelect).toContainText('US customary');
    expect((await volumeSelect.boundingBox())?.width).toBeCloseTo(volumeWidth, 0);

    const volumeSaved = await request.get(
      `${config.apiUrl}/rest/v1/accounts?select=volume_system,weight_system&id=eq.${user.id}`,
      { headers },
    );
    expect(await volumeSaved.json()).toEqual([
      { volume_system: 'metric', weight_system: 'us_customary' },
    ]);

    await weightSelect.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Saved.');
    const bothSaved = await request.get(
      `${config.apiUrl}/rest/v1/accounts?select=volume_system,weight_system&id=eq.${user.id}`,
      { headers },
    );
    expect(await bothSaved.json()).toEqual([{ volume_system: 'metric', weight_system: 'metric' }]);

    await expect(volumeSelect).toContainText('Metric');
    await expect(weightSelect).toContainText('Metric');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Settings manages the ingredient catalog with accessible inline controls @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();

    const section = page.getByRole('region', { name: 'Ingredient catalog' });
    const toggle = section.getByRole('button', { name: 'Ingredient catalog' });
    const picklistToggle = page.getByRole('button', { name: 'Edit picklists' });
    const toggleChevron = toggle.locator('svg');
    const picklistChevron = picklistToggle.locator('svg');
    if (testInfo.project.name === 'Fold 6') {
      await expect(toggle.locator('span')).toHaveCSS('text-decoration-line', 'underline');
      await expect(picklistToggle.locator('span')).toHaveCSS('text-decoration-line', 'underline');
    } else {
      await picklistToggle.hover();
      await expect(picklistToggle.locator('span')).toHaveCSS('text-decoration-line', 'underline');
      await toggle.hover();
      await expect(toggle.locator('span')).toHaveCSS('text-decoration-line', 'underline');
    }
    await expect(toggle).toHaveCSS('text-decoration-line', 'none');
    await expect(picklistToggle).toHaveCSS('text-decoration-line', 'none');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggleChevron).toHaveCSS('transform', 'none');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggleChevron).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggleChevron).toHaveCSS('transform', 'none');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggleChevron).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');

    await expect(picklistToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(picklistChevron).toHaveCSS('transform', 'none');
    await picklistToggle.click();
    await expect(picklistToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(picklistChevron).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
    await picklistToggle.click();
    await expect(picklistToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(picklistChevron).toHaveCSS('transform', 'none');

    const search = section.getByRole('searchbox', { name: 'Search ingredients' });
    const searchBarBounds = await search.locator('xpath=..').boundingBox();
    const ingredientListBounds = await section
      .getByRole('list', { name: 'Ingredients' })
      .boundingBox();
    expect(searchBarBounds?.x).toBe(ingredientListBounds?.x);
    await search.fill('szechuan pepper');
    await section.getByRole('button', { name: 'Add “szechuan pepper”' }).click();
    await expect(
      section.getByRole('button', { name: 'Edit Szechuan Pepper', exact: true }),
    ).toBeVisible();
    await expect(search).toHaveValue('szechuan pepper');
    await section.getByRole('button', { name: 'Clear ingredient search' }).click();
    await expect(search).toHaveValue('');

    const addIngredient = section.getByRole('textbox', { name: 'Add ingredient' });
    await addIngredient.fill('Ginger');
    const addIngredientButton = section.getByRole('button', {
      name: 'Add ingredient',
      exact: true,
    });
    await expect(addIngredientButton).toHaveText('');
    await addIngredientButton.click();
    await expect(section.getByRole('button', { name: 'Edit Ginger', exact: true })).toBeVisible();
    await addIngredient.fill('rosemary');
    await addIngredientButton.click();
    await expect(section.getByRole('button', { name: 'Edit Rosemary', exact: true })).toBeVisible();
    const status = section.getByRole('status');
    await expect(status).toHaveText('Ingredient added.');
    await expect(status).toHaveCSS('text-align', 'right');

    await addIngredient.fill('Thyme');
    await addIngredientButton.click();
    await expect(section.getByRole('button', { name: 'Edit Thyme' })).toBeVisible();
    await addIngredient.fill('Basil');
    await addIngredientButton.click();
    await expect(
      section.getByRole('list', { name: 'Ingredients' }).getByRole('button', { name: /^Edit / }),
    ).toHaveText(['Basil', 'Ginger', 'Rosemary', 'Szechuan Pepper', 'Thyme']);

    await search.fill('gin ');
    await expect(section.getByRole('button', { name: 'Edit Ginger' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Add “gin”' })).toBeVisible();
    await section.getByRole('button', { name: 'Add “gin”' }).click();
    await expect(section.getByRole('button', { name: 'Edit Gin', exact: true })).toBeVisible();
    await expect(search).toHaveValue('gin ');
    await section.getByRole('button', { name: 'Clear ingredient search' }).click();

    await search.fill('thy');
    await expect(section.getByRole('button', { name: 'Edit Thyme' })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Edit Basil' })).toHaveCount(0);
    await expect(
      section.getByRole('button', { name: 'Add ingredient', exact: true }),
    ).toBeVisible();
    await addIngredient.fill('Parsley');
    await addIngredientButton.click();
    await expect(search).toHaveValue('thy');
    await expect(section.getByRole('button', { name: 'Edit Thyme' })).toBeVisible();
    await section.getByRole('button', { name: 'Clear ingredient search' }).click();

    await section.getByRole('button', { name: 'Edit Rosemary' }).click();
    const rename = section.getByRole('textbox', { name: 'Rename Rosemary' });
    await rename.fill('fresh rosemary');
    await rename.press('Enter');
    await expect(
      section.getByRole('button', { name: 'Edit Fresh Rosemary', exact: true }),
    ).toBeVisible();
    await expect(section.getByRole('status')).toHaveText('Ingredient renamed.');
    await expect(section.getByRole('button', { name: /^Sort ingredients/ })).toHaveCount(0);
    await expect(section.getByRole('button', { name: /^Reorder / })).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    await section.getByRole('button', { name: 'Merge Fresh Rosemary' }).click();
    const mergePane = section.getByRole('region', { name: 'Merge Fresh Rosemary' });
    await expect(mergePane).toBeVisible();
    if (testInfo.project.name === 'Fold 6') {
      const mergeRow = section
        .getByRole('button', { name: 'Merge Fresh Rosemary' })
        .locator('xpath=../..');
      const rowBounds = await mergeRow.boundingBox();
      const paneBounds = await mergePane.boundingBox();
      const paneIsAbove =
        rowBounds !== null &&
        paneBounds !== null &&
        paneBounds.y + paneBounds.height <= rowBounds.y;
      const paneIsBelow =
        rowBounds !== null && paneBounds !== null && paneBounds.y >= rowBounds.y + rowBounds.height;
      expect(paneIsAbove || paneIsBelow).toBe(true);
    }
    const replacement = mergePane.getByRole('combobox', {
      name: 'Merge Fresh Rosemary with',
    });
    const mergeButton = mergePane.getByRole('button', { name: 'Merge', exact: true });
    const keepThyme = mergePane.getByRole('button', { name: 'Thyme', exact: true });
    const keepBasil = mergePane.getByRole('button', { name: 'Basil', exact: true });
    const keepFreshRosemary = mergePane.getByRole('button', {
      name: 'Fresh Rosemary',
      exact: true,
    });
    await expect(mergeButton).toBeDisabled();
    await expect(keepFreshRosemary).toBeDisabled();
    await replacement.click();
    await page.getByRole('option', { name: 'Thyme', exact: true }).click();
    await keepThyme.click();
    await expect(keepThyme).toHaveAttribute('aria-pressed', 'true');
    await expect(keepFreshRosemary).toHaveAttribute('aria-pressed', 'false');
    await keepFreshRosemary.click();
    await expect(keepFreshRosemary).toHaveAttribute('aria-pressed', 'true');
    await expect(keepThyme).toHaveAttribute('aria-pressed', 'false');
    await replacement.click();
    await page.getByRole('option', { name: 'Basil', exact: true }).click();
    await expect(keepFreshRosemary).toHaveAttribute('aria-pressed', 'false');
    await expect(keepBasil).toHaveAttribute('aria-pressed', 'false');
    await expect(mergeButton).toBeDisabled();
    await replacement.click();
    await page.getByRole('option', { name: 'Thyme', exact: true }).click();
    await keepFreshRosemary.click();
    await mergeButton.click();
    await expect(section.getByRole('button', { name: 'Edit Thyme' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Edit Fresh Rosemary' })).toBeVisible();
    await expect(section.getByRole('status')).toHaveText('Ingredients merged.');

    await section.getByRole('button', { name: 'Merge Basil' }).click();
    const counterpartMergePane = section.getByRole('region', { name: 'Merge Basil' });
    const counterpartPicklist = counterpartMergePane.getByRole('combobox', {
      name: 'Merge Basil with',
    });
    await counterpartPicklist.click();
    await page.getByRole('option', { name: 'Ginger', exact: true }).click();
    const keepGinger = counterpartMergePane.getByRole('button', {
      name: 'Ginger',
      exact: true,
    });
    await keepGinger.click();
    await expect(keepGinger).toHaveAttribute('aria-pressed', 'true');
    await counterpartMergePane.getByRole('button', { name: 'Merge', exact: true }).click();
    await expect(section.getByRole('button', { name: 'Edit Basil' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Edit Ginger' })).toBeVisible();

    await addIngredient.fill('Temporary herb');
    await addIngredient.press('Enter');
    await section.getByRole('button', { name: 'Delete Temporary herb' }).click();
    const deletePane = section.getByRole('region', { name: 'Delete Temporary herb' });
    await expect(deletePane.getByText('Used by 0 recipes.')).toBeVisible();
    if (testInfo.project.name === 'Fold 6') {
      const deleteRow = section
        .getByRole('button', { name: 'Delete Temporary herb' })
        .locator('xpath=../..');
      const rowBounds = await deleteRow.boundingBox();
      const paneBounds = await deletePane.boundingBox();
      const paneIsAbove =
        rowBounds !== null &&
        paneBounds !== null &&
        paneBounds.y + paneBounds.height <= rowBounds.y;
      const paneIsBelow =
        rowBounds !== null && paneBounds !== null && paneBounds.y >= rowBounds.y + rowBounds.height;
      expect(paneIsAbove || paneIsBelow).toBe(true);
    }
    await expect(deletePane.getByRole('combobox', { name: 'Replace with' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(deletePane).toHaveCount(0);
    const deleteTemporaryHerb = section.getByRole('button', { name: 'Delete Temporary herb' });
    await expect(deleteTemporaryHerb).toBeFocused();
    await deleteTemporaryHerb.click();
    await deletePane.getByRole('button', { name: 'Delete ingredient' }).click();
    await expect(section.getByRole('button', { name: 'Edit Temporary herb' })).toHaveCount(0);

    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Settings redirects signed-out visitors to sign in @e2e', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('Email')).toBeVisible();
});
