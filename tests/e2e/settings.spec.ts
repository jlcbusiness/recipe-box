import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function expectListScrollWindow(list: Locator) {
  await expect(list).toHaveCSS('max-height', '416px');
  await expect(list).toHaveCSS('overflow-y', 'auto');
  await expect(list).toHaveCSS('overscroll-behavior-y', 'contain');
  await expect(list).toHaveCSS('padding-left', '4px');
  await expect(list).toHaveCSS('padding-right', '4px');

  const dimensions = await list.evaluate((element) => {
    const row = element.querySelector(':scope > li');
    if (!row) throw new Error('Expected the list to contain a row.');
    const clones = Array.from({ length: 8 }, () => row.cloneNode(true));
    element.append(...clones);
    const result = { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight };
    clones.forEach((clone) => {
      element.removeChild(clone);
    });
    return result;
  });

  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
  expect(dimensions.clientHeight).toBeLessThanOrEqual(416);
}

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
    await expect(page.getByRole('heading', { name: 'Recipe presentation' })).toHaveCount(0);
    const presentationSelect = page.getByRole('combobox', { name: 'Ingredient view', exact: true });
    await expect(volumeSelect).toContainText('US customary');
    await expect(weightSelect).toContainText('US customary');
    await expect(presentationSelect).toContainText('Standard');
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const volumeWidth = (await volumeSelect.boundingBox())?.width ?? 0;

    const picklistsSection = page.getByRole('region', { name: 'Picklists' });
    const sectionSpacing = await picklistsSection.evaluate((section) => {
      const unitControls = Array.from(
        document.querySelectorAll<HTMLElement>('.settings-unit-picklist'),
      );
      const preferenceStatus = document.querySelector<HTMLElement>('.settings-unit-status');
      const heading = section.querySelector('h2');
      if (!heading || unitControls.length === 0 || !preferenceStatus) {
        throw new Error('Expected preference controls, status, and the Picklists heading.');
      }

      const ruleTop = section.getBoundingClientRect().top;
      return {
        beforeRule: ruleTop - preferenceStatus.getBoundingClientRect().bottom,
        afterRule:
          heading.getBoundingClientRect().top -
          ruleTop -
          Number.parseFloat(getComputedStyle(section).borderTopWidth),
      };
    });
    expect(sectionSpacing.beforeRule).toBeCloseTo(sectionSpacing.afterRule, 0);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    expect((await volumeSelect.boundingBox())?.height).toBe(36);
    expect((await weightSelect.boundingBox())?.height).toBe(36);
    expect((await presentationSelect.boundingBox())?.height).toBe(36);

    await presentationSelect.click();
    await page.getByRole('listbox').getByRole('option', { name: 'Ingredient-first' }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await expect(presentationSelect).toContainText('Ingredient-first');
    const presentationSaved = await request.get(
      `${config.apiUrl}/rest/v1/accounts?select=ingredient_presentation&id=eq.${user.id}`,
      { headers },
    );
    expect(await presentationSaved.json()).toEqual([
      { ingredient_presentation: 'ingredient_first' },
    ]);

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
      const presentationHitHeight = await presentationSelect.evaluate((trigger) =>
        Number.parseFloat(getComputedStyle(trigger, '::before').height),
      );
      expect(volumeHitHeight).toBeGreaterThanOrEqual(48);
      expect(weightHitHeight).toBeGreaterThanOrEqual(48);
      expect(presentationHitHeight).toBeGreaterThanOrEqual(48);
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

    const section = page.getByRole('region', { name: 'Ingredients' });
    await expect(section).toHaveCSS('border-top-width', '0px');
    await expect(section).toHaveCSS('margin-top', '28px');
    await expect(section).toHaveCSS('padding-top', '0px');
    const toggle = section.getByRole('button', { name: 'Ingredients' });
    const picklistToggle = page.getByRole('button', { name: 'Picklists' });
    const toggleChevron = toggle.locator('svg');
    const picklistChevron = picklistToggle.locator('svg');
    for (const disclosure of [toggle, picklistToggle]) {
      expect(
        await disclosure.evaluate((button) => {
          const chevron = button.querySelector('svg');
          const label = button.querySelector('span');
          return Boolean(
            chevron &&
              label &&
              chevron.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
          );
        }),
      ).toBe(true);
    }
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
    const category = page.getByRole('combobox', { name: 'Picklist category' });
    await page.keyboard.press('Tab');
    await category.focus();
    await expect
      .poll(() => category.evaluate((select) => select.matches(':focus-visible')))
      .toBe(true);
    await expect.poll(() => category.evaluate((select) => select.matches(':open'))).toBe(false);
    await page.keyboard.press('Escape');
    await expect(category).not.toBeFocused();
    const picklist = page.getByRole('list', { name: 'Food Type' });
    await expectListScrollWindow(picklist);
    await picklistToggle.click();
    await expect(picklistToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(picklistChevron).toHaveCSS('transform', 'none');

    const search = section.getByRole('textbox', { name: 'Search ingredients' });
    const ingredientCount = search.locator('xpath=../../following-sibling::span');
    await expect(ingredientCount).toHaveCSS('margin-left', '0px');
    const searchBarBounds = await search.locator('xpath=..').boundingBox();
    const ingredientListBounds = await section
      .getByRole('list', { name: 'Ingredients' })
      .boundingBox();
    expect(searchBarBounds?.x).toBe(ingredientListBounds?.x);
    await search.focus();
    await expect.poll(() => search.evaluate((input) => input.matches(':focus-visible'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(search).not.toBeFocused();
    await search.fill('szechuan pepper');
    const addSearchResult = section.getByRole('button', { name: 'add szechuan pepper' });
    await expect(addSearchResult.locator('xpath=..')).toHaveCSS('border-top-width', '1px');
    await expect(addSearchResult.locator('xpath=..')).toHaveCSS('border-bottom-width', '1px');
    await expect(addSearchResult.locator('xpath=..')).toHaveCSS(
      'border-top-color',
      'rgb(174, 184, 167)',
    );
    await addSearchResult.click();
    await expect(
      section.getByRole('button', { name: 'Edit Szechuan Pepper', exact: true }),
    ).toBeVisible();
    await expect(search).toHaveValue('szechuan pepper');
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(search).not.toBeFocused();
    await search.fill('szechuan');
    await section.getByRole('button', { name: 'Clear ingredient search' }).click();
    await expect(search).toHaveValue('');
    await search.fill('Enter-only herb');
    await search.press('Enter');
    await expect(section.getByRole('status')).toHaveText('Ingredient added.');
    await expect(section.getByRole('button', { name: /Edit Enter-only herb/i })).toBeVisible();
    await search.press('Escape');

    const addIngredient = section.getByRole('textbox', { name: 'Add ingredient' });
    await addIngredient.fill('Ginger');
    const addIngredientButton = section.getByRole('button', { name: /^Add /i });
    await expect(addIngredient).toHaveCSS('font-style', 'italic');
    await expect(addIngredient).toHaveCSS('font-size', '17px');
    await expect(addIngredientButton).toHaveAccessibleName('Add Ginger');
    await expect(addIngredientButton).toHaveText('');
    await addIngredientButton.click();
    await expect(section.getByRole('button', { name: 'Edit Ginger', exact: true })).toBeVisible();
    await addIngredient.fill('Cancelled');
    await addIngredient.press('Escape');
    await expect(addIngredient).toHaveValue('');
    await expect(addIngredient).not.toBeFocused();
    await expect(section.getByRole('button', { name: /^add /i })).toHaveCount(0);
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
    ).toHaveText(['Basil', 'Enter-Only Herb', 'Ginger', 'Rosemary', 'Szechuan Pepper', 'Thyme']);

    const ingredientList = section.getByRole('list', { name: 'Ingredients' });
    await expectListScrollWindow(ingredientList);

    await search.fill('gin ');
    await expect(section.getByRole('button', { name: 'Edit Ginger' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'add gin' })).toBeVisible();
    await section.getByRole('button', { name: 'add gin' }).click();
    await expect(section.getByRole('button', { name: 'Edit Gin', exact: true })).toBeVisible();
    await expect(search).toHaveValue('gin ');
    await section.getByRole('button', { name: 'Clear ingredient search' }).click();

    await search.fill('thy');
    await expect(section.getByRole('button', { name: 'Edit Thyme' })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Edit Basil' })).toHaveCount(0);
    await expect(addIngredient).toBeVisible();
    await addIngredient.fill('Parsley');
    await addIngredientButton.click();
    await expect(search).toHaveValue('thy');
    await expect(section.getByRole('button', { name: 'Edit Thyme' })).toBeVisible();
    await section.getByRole('button', { name: 'Clear ingredient search' }).click();

    await section.getByRole('button', { name: 'Edit Rosemary' }).click();
    const rename = section.getByRole('textbox', { name: 'Rename Rosemary' });
    await search.click();
    await expect(rename).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Edit Rosemary' })).toBeVisible();
    await section.getByRole('button', { name: 'Edit Rosemary' }).click();
    const activeRename = section.getByRole('textbox', { name: 'Rename Rosemary' });
    await activeRename.fill('fresh rosemary');
    await activeRename.press('Enter');
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
    await search.fill('Temporary');
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(deletePane).toBeVisible();
    await search.press('Escape');
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
