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

test('Settings stages, searches, edits, and removes trusted ingredient densities @e2e @a11y @density', async ({
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
    const ingredientResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers,
        data: {
          p_action: 'add',
          p_expected_revision: 1,
          p_name: 'Trusted Bread Flour',
        },
      },
    );
    expect(ingredientResponse.ok(), await ingredientResponse.text()).toBeTruthy();
    const secondIngredientResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers,
        data: {
          p_action: 'add',
          p_expected_revision: 2,
          p_name: 'Trusted Whole Wheat',
        },
      },
    );
    expect(secondIngredientResponse.ok(), await secondIngredientResponse.text()).toBeTruthy();
    for (const [index, name] of [
      'Trusted Whole Barley',
      'Trusted Whole Rye',
      'Trusted Whole Spelt',
    ].entries()) {
      const response = await request.post(
        `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
        {
          headers,
          data: {
            p_action: 'add',
            p_expected_revision: index + 3,
            p_name: name,
          },
        },
      );
      expect(response.ok(), await response.text()).toBeTruthy();
    }

    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();
    const section = page.getByRole('region', { name: 'Trusted density' });
    const toggle = section.getByRole('button', { name: 'Trusted density', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const search = section.getByRole('searchbox', { name: 'Search trusted densities' });
    await search.focus();
    await expect(search).toHaveCSS('outline-style', 'solid');
    const searchLabel = section.locator('label').first();
    await expect(searchLabel).toHaveCSS('outline-style', 'none');
    await search.fill('Trusted Bread');
    const suggestedAdd = section.getByRole('button', {
      name: 'add density for Trusted Bread Flour',
    });
    await expect(suggestedAdd).toBeVisible();
    await suggestedAdd.click();
    const volumeAmount = section.getByRole('textbox', { name: 'Volume amount' });
    const volumeUnit = section.getByRole('combobox', { name: 'Volume unit' });
    const weightAmount = section.getByRole('textbox', { name: 'Weight amount' });
    const weightUnit = section.getByRole('combobox', { name: 'Weight unit' });
    await expect(volumeUnit).toContainText('cup');
    await expect(weightUnit).toContainText('g');
    await volumeAmount.fill('1');
    await volumeAmount.press('Enter');
    await expect(weightAmount).toBeFocused();
    await weightAmount.fill('120');
    await expect(section.getByText('0.507 g/mL')).toBeVisible();
    const saveDensity = section.getByRole('button', { name: 'Save trusted density' });
    const cancelDensity = section.getByRole('button', { name: 'Cancel density entry' });
    await expect(saveDensity).toHaveCSS('width', '32px');
    await expect(cancelDensity).toHaveCSS('width', '32px');
    if (testInfo.project.name === 'Fold 6') {
      const densityCenter = await section
        .getByText('0.507 g/mL', { exact: true })
        .evaluate((value) => {
          const bounds = value.getBoundingClientRect();
          return bounds.top + bounds.height / 2;
        });
      const actionsCenter = await saveDensity.locator('xpath=..').evaluate((actions) => {
        const bounds = actions.getBoundingClientRect();
        return bounds.top + bounds.height / 2;
      });
      expect(Math.abs(actionsCenter - densityCenter)).toBeLessThanOrEqual(4);
    }
    const stagedScreenshot = testInfo.outputPath('trusted-density-staged-editor.png');
    await page.screenshot({ path: stagedScreenshot, fullPage: true });
    await testInfo.attach('trusted-density-staged-editor', {
      path: stagedScreenshot,
      contentType: 'image/png',
    });
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    await saveDensity.click();
    await expect(section.getByRole('status')).toHaveText('Density saved.');
    const densityTable = section.getByRole('table', { name: 'Configured densities' });
    const tableViewport = densityTable.locator('xpath=..');
    await expect(tableViewport).toHaveCSS('max-height', '462px');
    await expect(tableViewport).toHaveCSS('overflow-x', 'auto');
    await expect(tableViewport).toHaveCSS('overflow-y', 'auto');
    if (testInfo.project.name !== 'Fold 6') {
      const tableHeaderHeight = await densityTable
        .locator('thead')
        .evaluate((header) => header.getBoundingClientRect().height);
      const densityRowHeight = await densityTable
        .locator('tbody tr')
        .first()
        .evaluate((row) => row.getBoundingClientRect().height);
      const maxViewportHeight = await tableViewport.evaluate((viewport) =>
        Number.parseFloat(getComputedStyle(viewport).maxHeight),
      );
      expect(maxViewportHeight).toBeGreaterThanOrEqual(tableHeaderHeight + densityRowHeight * 8);
    }
    const breadRow = densityTable.getByRole('row', { name: /Trusted Bread Flour/ });
    await expect(breadRow).toContainText('1 cup / 120 g - 0.507 g/mL');
    const fullEquation = breadRow.getByText('1 cup / 120 g - 0.507 g/mL', { exact: true });
    const finalDensity = breadRow.getByText('0.507 g/mL', { exact: true });
    if (testInfo.project.name === 'Fold 6') {
      await expect(fullEquation).toBeHidden();
      await expect(finalDensity).toBeVisible();
      const listTableFillsViewport = await densityTable.evaluate((table) => {
        const viewport = table.parentElement;
        return (
          viewport !== null &&
          Math.abs(table.getBoundingClientRect().width - viewport.clientWidth) <= 1
        );
      });
      expect(listTableFillsViewport).toBeTruthy();
      const rowDividerFillsViewport = await breadRow.evaluate((row) => {
        const table = row.closest('table');
        const styles = getComputedStyle(row);
        return (
          table !== null &&
          Math.abs(row.getBoundingClientRect().width - table.getBoundingClientRect().width) <= 1 &&
          styles.borderBottomWidth === '1px' &&
          styles.borderBottomStyle === 'solid'
        );
      });
      expect(rowDividerFillsViewport).toBeTruthy();
      const rowCells = breadRow.locator('th, td');
      const cellCenters = await rowCells.evaluateAll((cells) =>
        cells.map((cell) => {
          const rect = cell.getBoundingClientRect();
          return rect.top + rect.height / 2;
        }),
      );
      expect(cellCenters).toHaveLength(3);
      expect(Math.max(...cellCenters) - Math.min(...cellCenters)).toBeLessThanOrEqual(1);
      const ingredientButton = breadRow.getByRole('button', {
        name: 'Edit density for Trusted Bread Flour',
        exact: true,
      });
      await expect(ingredientButton).toHaveCSS('text-overflow', 'ellipsis');
      await expect(ingredientButton).toHaveCSS('white-space', 'nowrap');
      const equationFits = await breadRow
        .locator('td')
        .first()
        .evaluate((cell) => cell.scrollWidth <= cell.clientWidth);
      expect(equationFits).toBeTruthy();
      const densityActionGap = await breadRow.evaluate((row) => {
        const equationCell = row.querySelectorAll('td')[0];
        const actionCell = row.querySelectorAll('td')[1];
        const densityValue = equationCell?.querySelector('button');
        const removeButton = actionCell?.querySelector('button');
        if (!densityValue || !removeButton) {
          return Number.POSITIVE_INFINITY;
        }
        return (
          removeButton.getBoundingClientRect().left - densityValue.getBoundingClientRect().right
        );
      });
      expect(densityActionGap).toBeLessThanOrEqual(18);
      const removeDensity = breadRow.getByRole('button', {
        name: 'Remove density for Trusted Bread Flour',
      });
      await expect(removeDensity).toHaveCSS('width', '48px');
      await expect(removeDensity).toHaveCSS('height', '48px');
    } else {
      await expect(fullEquation).toBeVisible();
      await expect(finalDensity).toBeHidden();
    }
    const configuredScreenshot = testInfo.outputPath('trusted-density-configured-list.png');
    await page.screenshot({ path: configuredScreenshot, fullPage: true });
    await testInfo.attach('trusted-density-configured-list', {
      path: configuredScreenshot,
      contentType: 'image/png',
    });

    if (testInfo.project.name === 'Fold 6') {
      await finalDensity.click();
    } else {
      await breadRow
        .getByRole('button', { name: 'Edit density for Trusted Bread Flour', exact: true })
        .click();
    }
    if (testInfo.project.name === 'Fold 6') {
      const originalViewport = page.viewportSize();
      if (originalViewport) {
        await page.setViewportSize({ ...originalViewport, width: 272 });
      }
      await weightUnit.click();
      await page.getByRole('option', { name: 'kg', exact: true }).click();
      await weightAmount.fill('3000');
      const longDensity = section.getByText(/\d{5,}\.\d{2,3} g\/mL/);
      await expect(longDensity).toBeVisible();
      const resultFits = await longDensity.evaluate((value) => {
        const result = value.parentElement;
        return result !== null && result.scrollWidth <= result.clientWidth;
      });
      expect(resultFits).toBeTruthy();
      const longDensityScreenshot = testInfo.outputPath('trusted-density-long-mobile-editor.png');
      await page.screenshot({ path: longDensityScreenshot, fullPage: true });
      await testInfo.attach('trusted-density-long-mobile-editor', {
        path: longDensityScreenshot,
        contentType: 'image/png',
      });
      const editingTableFillsViewport = await densityTable.evaluate((table) => {
        const viewport = table.parentElement;
        return (
          viewport !== null &&
          Math.abs(table.getBoundingClientRect().width - viewport.clientWidth) <= 1
        );
      });
      expect(editingTableFillsViewport).toBeTruthy();
      const editorControlsFit = await breadRow.evaluate((row) => {
        const editorCell = row.querySelector('td');
        if (!editorCell) {
          return false;
        }
        const cellBounds = editorCell.getBoundingClientRect();
        const cellStyles = getComputedStyle(editorCell);
        const contentLeft = cellBounds.left + Number.parseFloat(cellStyles.paddingLeft);
        const contentRight = cellBounds.right - Number.parseFloat(cellStyles.paddingRight);
        const controls = editorCell.querySelectorAll('input, [role="combobox"]');
        return (
          controls.length === 4 &&
          Array.from(controls).every((control) => {
            const bounds = control.getBoundingClientRect();
            return bounds.left >= contentLeft - 1 && bounds.right <= contentRight + 1;
          })
        );
      });
      expect(editorControlsFit).toBeTruthy();
      const amountWidths = await Promise.all(
        [volumeAmount, weightAmount].map((amount) =>
          amount.evaluate((input) => input.getBoundingClientRect().width),
        ),
      );
      expect(Math.max(...amountWidths)).toBeLessThanOrEqual(72);
      await weightAmount.fill('120');
      await weightUnit.click();
      await page.getByRole('option', { name: 'g', exact: true }).click();
      if (originalViewport) {
        await page.setViewportSize(originalViewport);
      }
    }
    await expect(weightAmount).toHaveValue('120');
    if (testInfo.project.name === 'Fold 6') {
      const densityCenter = await breadRow
        .getByText('0.507 g/mL', { exact: true })
        .evaluate((value) => {
          const bounds = value.getBoundingClientRect();
          return bounds.top + bounds.height / 2;
        });
      const actionsCenter = await section
        .getByRole('button', { name: 'Cancel density edit' })
        .locator('xpath=..')
        .evaluate((actions) => {
          const bounds = actions.getBoundingClientRect();
          return bounds.top + bounds.height / 2;
        });
      expect(Math.abs(actionsCenter - densityCenter)).toBeLessThanOrEqual(4);
    }
    await expect(section.getByRole('button', { name: 'Save trusted density' })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Cancel density edit' })).toBeVisible();
    await weightAmount.fill('125');
    await section.getByRole('button', { name: 'Cancel density edit' }).click();
    await expect(breadRow).toContainText('1 cup / 120 g - 0.507 g/mL');

    await breadRow
      .getByRole('button', { name: 'Edit density for Trusted Bread Flour', exact: true })
      .click();
    await weightAmount.fill('125');
    await weightAmount.press('Escape');
    await expect(breadRow).toContainText('1 cup / 120 g - 0.507 g/mL');
    await expect(
      breadRow.getByRole('button', { name: 'Edit density for Trusted Bread Flour', exact: true }),
    ).toBeFocused();

    await breadRow
      .getByRole('button', { name: 'Edit density for Trusted Bread Flour', exact: true })
      .click();
    await volumeAmount.fill('1/2');
    await weightAmount.fill('62.5');
    await weightAmount.press('Enter');
    await expect(section.getByRole('status')).toHaveText('Density saved.');
    await expect(breadRow).toContainText('1/2 cup / 62.5 g - 0.528 g/mL');

    await search.fill('trusted');
    await expect(breadRow).toBeVisible();
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await search.fill('trusted');
    await section.getByRole('button', { name: 'Clear trusted density search' }).click();
    await expect(search).toHaveValue('');
    await search.fill('missing density');
    await expect(section.getByText('No trusted densities found.')).toBeVisible();
    await search.fill('');

    await section.getByRole('button', { name: 'add density', exact: true }).click();
    const ingredientSearch = section.getByRole('combobox', { name: 'Ingredient' });
    await ingredientSearch.fill('Trusted Whole Rye');
    await ingredientSearch.press('Enter');
    await volumeAmount.fill('1');
    await weightAmount.fill('100');
    await search.click();
    await expect(section.getByRole('group', { name: 'Add trusted density' })).toHaveCount(0);
    await expect(densityTable.getByRole('row', { name: /Trusted Whole Rye/ })).toHaveCount(0);

    await section.getByRole('button', { name: 'add density', exact: true }).click();
    const ingredientRow = section.getByRole('group', { name: 'Add trusted density' });
    await expect(section.getByRole('button', { name: 'add density', exact: true })).toHaveCount(0);
    const rowHeightBeforeSuggestions = await ingredientRow.evaluate(
      (row) => row.getBoundingClientRect().height,
    );
    await expect(section.getByRole('listbox')).toHaveCount(0);
    await expect(ingredientSearch).toHaveAttribute('aria-expanded', 'false');
    await ingredientSearch.fill('Trusted');
    const ingredientOptions = section.getByRole('listbox').getByRole('option');
    await expect(ingredientOptions).toHaveCount(3);
    await ingredientSearch.fill('Trusted Whole Wheat');
    await expect(
      page.getByRole('option', { name: 'Trusted Whole Wheat', exact: true }),
    ).toBeVisible();
    await expect(ingredientOptions).toHaveCount(1);
    const rowHeightWithSuggestions = await ingredientRow.evaluate(
      (row) => row.getBoundingClientRect().height,
    );
    expect(rowHeightWithSuggestions).toBe(rowHeightBeforeSuggestions);
    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    await ingredientSearch.press('Escape');
    await expect(ingredientSearch).toHaveValue('');
    await expect(section.getByRole('listbox')).toHaveCount(0);
    await ingredientSearch.press('Escape');
    await expect(ingredientRow).toHaveCount(0);
    await section.getByRole('button', { name: 'add density', exact: true }).click();
    await ingredientSearch.fill('No matching ingredient');
    await expect(section.getByRole('status')).toHaveText('Choose an existing ingredient.');
    await expect(section.getByRole('status')).toHaveClass(/errorStatus/);
    await ingredientSearch.fill('Trusted Whole Wheat');
    await expect(ingredientOptions).toHaveCount(1);
    await ingredientSearch.press('Enter');
    await expect(section.getByText('Trusted Whole Wheat', { exact: true })).toBeVisible();
    await volumeAmount.fill('1');
    await section.getByRole('button', { name: 'Save trusted density' }).click();
    await expect(section.getByRole('status')).toHaveText(
      'Enter positive finite amounts for both Volume and Weight.',
    );
    await expect(section.getByRole('status')).toHaveClass(/errorStatus/);
    await weightAmount.fill('125');
    await section.getByRole('button', { name: 'Save trusted density' }).click();
    await expect(section.getByRole('status')).toHaveText('Density saved.');
    const wheatRow = densityTable.getByRole('row', { name: /Trusted Whole Wheat/ });
    await expect(wheatRow).toContainText('1 cup / 125 g - 0.528 g/mL');
    if (testInfo.project.name === 'Fold 6') {
      const rowColumnLefts = await Promise.all(
        [breadRow, wheatRow].map((row) =>
          row
            .locator('th, td')
            .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().left)),
        ),
      );
      expect(rowColumnLefts[0]).toHaveLength(3);
      expect(rowColumnLefts[1]).toHaveLength(3);
      for (const columnIndex of [0, 1, 2]) {
        expect(
          Math.abs(rowColumnLefts[0][columnIndex] - rowColumnLefts[1][columnIndex]),
        ).toBeLessThanOrEqual(1);
      }
      const densityColumnSizing = await wheatRow
        .locator('td')
        .first()
        .evaluate((cell) => {
          const densityValue = Array.from(cell.querySelectorAll('span')).find(
            (span) => getComputedStyle(span).display !== 'none',
          );
          const cellBounds = cell.getBoundingClientRect();
          const valueBounds = densityValue?.getBoundingClientRect();
          const styles = getComputedStyle(cell);
          const horizontalPadding =
            Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight);
          return {
            cellWidth: cellBounds.width,
            expectedWidth: (valueBounds?.width ?? Number.POSITIVE_INFINITY) + horizontalPadding,
          };
        });
      expect(densityColumnSizing.cellWidth).toBeLessThanOrEqual(
        densityColumnSizing.expectedWidth + 3,
      );
    }
    const breadRowColor = await breadRow.evaluate((row) => getComputedStyle(row).backgroundColor);
    const wheatRowColor = await wheatRow.evaluate((row) => getComputedStyle(row).backgroundColor);
    expect(breadRowColor).not.toBe(wheatRowColor);

    await breadRow.getByRole('button', { name: 'Remove density for Trusted Bread Flour' }).click();
    const confirmation = section.getByRole('region', {
      name: 'Remove density for Trusted Bread Flour',
    });
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByText(/existing recipe amounts will remain unchanged/i),
    ).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(breadRow).toContainText('1/2 cup / 62.5 g - 0.528 g/mL');

    await breadRow.getByRole('button', { name: 'Remove density for Trusted Bread Flour' }).click();
    await section
      .getByRole('region', { name: 'Remove density for Trusted Bread Flour' })
      .getByRole('button', { name: 'Remove density' })
      .click();
    await expect(section.getByRole('status')).toHaveText('Density removed.');
    await expect(breadRow).toHaveCount(0);
    await expect(wheatRow).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipe editor derives the missing unit and preserves manual overrides @e2e @a11y @density', async ({
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
    const ingredientResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers,
        data: {
          p_action: 'add',
          p_expected_revision: 1,
          p_name: 'Trusted Density Flour',
        },
      },
    );
    expect(ingredientResponse.ok(), await ingredientResponse.text()).toBeTruthy();
    const lookupResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id&account_id=eq.${user.id}&name=eq.Trusted%20Density%20Flour`,
      { headers },
    );
    const [ingredient] = (await lookupResponse.json()) as { id: string }[];
    expect(ingredient?.id).toBeTruthy();
    const densityResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_density`,
      {
        headers,
        data: {
          p_action: 'set',
          p_expected_revision: 2,
          p_ingredient_id: ingredient.id,
          p_volume_amount: 1,
          p_volume_unit_code: 'cup',
          p_weight_amount: 120,
          p_weight_unit_code: 'g',
        },
      },
    );
    expect(densityResponse.ok(), await densityResponse.text()).toBeTruthy();
    const secondIngredientResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers,
        data: {
          p_action: 'add',
          p_expected_revision: 3,
          p_name: 'Trusted Density Rice',
        },
      },
    );
    expect(secondIngredientResponse.ok(), await secondIngredientResponse.text()).toBeTruthy();
    const secondLookupResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id&account_id=eq.${user.id}&name=eq.Trusted%20Density%20Rice`,
      { headers },
    );
    const [secondIngredient] = (await secondLookupResponse.json()) as { id: string }[];
    expect(secondIngredient?.id).toBeTruthy();
    const secondDensityResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_density`,
      {
        headers,
        data: {
          p_action: 'set',
          p_expected_revision: 4,
          p_ingredient_id: secondIngredient.id,
          p_volume_amount: 1,
          p_volume_unit_code: 'cup',
          p_weight_amount: 240,
          p_weight_unit_code: 'g',
        },
      },
    );
    expect(secondDensityResponse.ok(), await secondDensityResponse.text()).toBeTruthy();

    async function chooseUnit(label: string, value: string) {
      await page.getByRole('combobox', { name: label }).click();
      await page.getByRole('listbox').getByRole('option', { name: value, exact: true }).click();
    }

    async function derivedTextIconGap(label: string) {
      return page.getByRole('textbox', { name: label }).evaluate((input) => {
        const amountInput = input as HTMLInputElement;
        const indicator = amountInput.parentElement?.querySelector(
          '.recipe-measurement-derived-indicator',
        );
        const canvas = amountInput.ownerDocument.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!indicator || !context) return null;
        const style = getComputedStyle(amountInput);
        context.font = style.font;
        const bounds = amountInput.getBoundingClientRect();
        const textEnd =
          bounds.left +
          amountInput.clientLeft +
          Number.parseFloat(style.paddingLeft) +
          context.measureText(amountInput.value).width;
        return indicator.getBoundingClientRect().left - textEnd;
      });
    }

    async function changeDesktopIngredient(name: string) {
      const table = page.getByRole('table', { name: 'Recipe ingredients', exact: true });
      await table.locator('tbody tr').first().locator('[data-field="ingredientName"]').click();
      const ingredientInput = table.getByRole('combobox', { name: 'Ingredient, row 1' });
      await ingredientInput.fill(name);
      await page.getByRole('option', { name, exact: true }).click();
      await page.keyboard.press('Tab');
    }

    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Density derivation recipe');

    if (page.viewportSize()?.width && (page.viewportSize()?.width ?? 0) <= 760) {
      const mobileList = page.getByRole('table', {
        name: 'Recipe ingredients on mobile',
        exact: true,
      });
      await mobileList.getByRole('button', { name: 'Enter ingredient' }).click();
      const editor = page.getByRole('dialog', { name: 'Ingredient details' });
      const ingredientInput = editor.getByRole('combobox', { name: 'Ingredient', exact: true });
      await ingredientInput.fill('Trusted Density Flour');
      await page.getByRole('option', { name: 'Trusted Density Flour', exact: true }).click();
      const volumeAmount = editor.getByRole('textbox', { name: 'Volume amount, row 1' });
      const weightAmount = editor.getByRole('textbox', { name: 'Weight amount, row 1' });
      await weightAmount.fill('120');
      await expect(volumeAmount).toHaveValue('1');
      await expect(volumeAmount).toHaveCSS('text-align', 'left');
      await expect(editor.getByText('Derived from density')).toHaveClass('visually-hidden');
      const derivedIndicator = editor.locator('.recipe-measurement-derived-indicator');
      await expect(derivedIndicator).toBeVisible();
      const amountBounds = await volumeAmount.boundingBox();
      const indicatorBounds = await derivedIndicator.boundingBox();
      expect((indicatorBounds?.x ?? 0) + (indicatorBounds?.width ?? 0) / 2).toBeGreaterThan(
        (amountBounds?.x ?? 0) + (amountBounds?.width ?? 0) / 2,
      );
      expect((indicatorBounds?.x ?? 0) + (indicatorBounds?.width ?? 0)).toBeLessThanOrEqual(
        (amountBounds?.x ?? 0) + (amountBounds?.width ?? 0),
      );
      expect(
        Math.abs(
          (indicatorBounds?.y ?? 0) +
            (indicatorBounds?.height ?? 0) / 2 -
            ((amountBounds?.y ?? 0) + (amountBounds?.height ?? 0) / 2),
        ),
      ).toBeLessThanOrEqual(1);
      await volumeAmount.fill('');
      await volumeAmount.press('Tab');
      await expect(volumeAmount).toHaveValue('1');
      await volumeAmount.fill('1/7');
      await weightAmount.fill('');
      await weightAmount.press('Tab');
      await expect(weightAmount).toHaveValue('15');
      await expect(volumeAmount).toHaveValue('1/8');
      await volumeAmount.fill('1/8');
      await expect(weightAmount).toHaveValue('15');
      await expect(editor.getByText('Derived from density')).toHaveClass('visually-hidden');
      const derivedScreenshot = testInfo.outputPath('recipe-density-derived-mobile.png');
      await page.screenshot({ path: derivedScreenshot, fullPage: true });
      await testInfo.attach('recipe-density-derived-mobile', {
        path: derivedScreenshot,
        contentType: 'image/png',
      });
      const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
      expect(accessibility.violations).toEqual([]);
      await volumeAmount.fill('2/7');
      await volumeAmount.fill('1/4');
      await expect(weightAmount).toHaveValue('30');
      await chooseUnit('Volume unit, row 1', 'TBSP');
      await expect(weightAmount).toHaveValue('1.88');
      await chooseUnit('Volume unit, row 1', 'cup');
      await volumeAmount.fill('1/8');
      await chooseUnit('Weight unit, row 1', 'oz');
      await expect(weightAmount).toHaveValue('1/2');
      await chooseUnit('Weight unit, row 1', 'g');
      await expect(weightAmount).toHaveValue('15');
      await volumeAmount.fill('invalid');
      await expect(weightAmount).toHaveValue('');
      await expect(editor.getByText('Derived from density')).toHaveCount(0);
      await volumeAmount.fill('1/8');
      await expect(weightAmount).toHaveValue('15');
      await weightAmount.fill('150');
      await expect(editor.getByText('Derived from density')).toHaveCount(0);
      const overrideScreenshot = testInfo.outputPath('recipe-density-manual-override-mobile.png');
      await page.screenshot({ path: overrideScreenshot, fullPage: true });
      await testInfo.attach('recipe-density-manual-override-mobile', {
        path: overrideScreenshot,
        contentType: 'image/png',
      });
      await volumeAmount.fill('2/7');
      await expect(weightAmount).toHaveValue('150');
      await volumeAmount.fill('1/8');
      await weightAmount.fill('');
      await weightAmount.press('Tab');
      await expect(weightAmount).toHaveValue('15');
      await expect(editor.getByText('Derived from density')).toHaveClass('visually-hidden');
      await ingredientInput.fill('Trusted Density Rice');
      await page.getByRole('option', { name: 'Trusted Density Rice', exact: true }).click();
      await expect(weightAmount).toHaveValue('30');
      await weightAmount.fill('150');
      await ingredientInput.fill('Trusted Density Flour');
      await page.getByRole('option', { name: 'Trusted Density Flour', exact: true }).click();
      await expect(weightAmount).toHaveValue('150');
      await expect(editor.getByText('Derived from density')).toHaveCount(0);
      await weightAmount.fill('');
      await weightAmount.press('Tab');
      await expect(weightAmount).toHaveValue('15');
      await ingredientInput.fill('Trusted Density Rice');
      await page.getByRole('option', { name: 'Trusted Density Rice', exact: true }).click();
      await expect(weightAmount).toHaveValue('30');
      const shortWeightBounds = await weightAmount.boundingBox();
      await volumeAmount.fill('10000000');
      const longDerivedValue = await weightAmount.inputValue();
      expect(longDerivedValue.replace(/\D/g, '').length).toBeGreaterThanOrEqual(10);
      await expect(weightAmount).toHaveAttribute('size', '14');
      await expect(weightAmount).toHaveCSS('padding-right', '21px');
      const textIconGap = await derivedTextIconGap('Weight amount, row 1');
      expect(textIconGap).toBeGreaterThanOrEqual(3.5);
      expect(textIconGap).toBeLessThanOrEqual(6.5);
      const longAmountBounds = await weightAmount.boundingBox();
      const unitBounds = await editor
        .getByRole('combobox', { name: 'Weight unit, row 1' })
        .boundingBox();
      expect(longAmountBounds).not.toBeNull();
      expect(unitBounds).not.toBeNull();
      expect(
        Boolean(
          longAmountBounds &&
            unitBounds &&
            longAmountBounds.x < unitBounds.x + unitBounds.width &&
            longAmountBounds.x + longAmountBounds.width > unitBounds.x &&
            longAmountBounds.y < unitBounds.y + unitBounds.height &&
            longAmountBounds.y + longAmountBounds.height > unitBounds.y,
        ),
      ).toBe(false);
      expect(longAmountBounds?.width).toBeGreaterThan(shortWeightBounds?.width ?? 0);
      await volumeAmount.fill('1/7');
      await volumeAmount.fill('1/8');
      await expect(weightAmount).toHaveValue('30');
      await editor.getByRole('button', { name: 'Submit' }).click();
      await expect(mobileList).toContainText('30 g');
    } else {
      const table = page.getByRole('table', { name: 'Recipe ingredients', exact: true });
      await table.getByRole('cell', { name: 'Add ingredient row' }).click();
      const ingredientInput = page.getByRole('combobox', { name: 'Ingredient, row 1' });
      await ingredientInput.fill('Trusted Density Flour');
      await page.getByRole('option', { name: 'Trusted Density Flour', exact: true }).click();
      await page.keyboard.press('Tab');
      const volumeAmount = page.getByRole('textbox', { name: 'Volume amount, row 1' });
      const weightAmount = page.getByRole('textbox', { name: 'Weight amount, row 1' });
      await weightAmount.fill('120');
      await expect(volumeAmount).toHaveValue('1');
      await expect(volumeAmount).toHaveCSS('padding-right', '21px');
      await expect(page.getByText('Derived from density')).toHaveClass('visually-hidden');
      await expect(page.locator('.recipe-measurement-derived-indicator')).toBeVisible();
      await volumeAmount.fill('');
      await volumeAmount.press('Tab');
      await expect(volumeAmount).toHaveValue('1');
      await volumeAmount.fill('1/8');
      await weightAmount.fill('');
      await weightAmount.press('Tab');
      await expect(weightAmount).toHaveValue('15');
      await expect(volumeAmount).toHaveValue('1/8');
      await volumeAmount.fill('1/8');
      await expect(weightAmount).toHaveValue('15');
      await expect(page.getByText('Derived from density')).toHaveClass('visually-hidden');
      const derivedScreenshot = testInfo.outputPath('recipe-density-derived-desktop.png');
      await page.screenshot({ path: derivedScreenshot, fullPage: true });
      await testInfo.attach('recipe-density-derived-desktop', {
        path: derivedScreenshot,
        contentType: 'image/png',
      });
      const accessibility = await new AxeBuilder({ page })
        .include('.recipe-ingredient-editor')
        .analyze();
      expect(accessibility.violations).toEqual([]);
      await volumeAmount.fill('2/7');
      await volumeAmount.fill('1/4');
      await expect(weightAmount).toHaveValue('30');
      await chooseUnit('Volume unit, row 1', 'TBSP');
      await expect(weightAmount).toHaveValue('1.88');
      await chooseUnit('Volume unit, row 1', 'cup');
      await volumeAmount.fill('1/8');
      await chooseUnit('Weight unit, row 1', 'oz');
      await expect(weightAmount).toHaveValue('1/2');
      await chooseUnit('Weight unit, row 1', 'g');
      await expect(weightAmount).toHaveValue('15');
      await volumeAmount.fill('invalid');
      await expect(weightAmount).toHaveValue('');
      await expect(page.getByText('Derived from density')).toHaveCount(0);
      await volumeAmount.fill('1/8');
      await expect(weightAmount).toHaveValue('15');
      await weightAmount.fill('150');
      await expect(page.getByText('Derived from density')).toHaveCount(0);
      const overrideScreenshot = testInfo.outputPath('recipe-density-manual-override-desktop.png');
      await page.screenshot({ path: overrideScreenshot, fullPage: true });
      await testInfo.attach('recipe-density-manual-override-desktop', {
        path: overrideScreenshot,
        contentType: 'image/png',
      });
      await volumeAmount.fill('2/7');
      await expect(weightAmount).toHaveValue('150');
      await volumeAmount.fill('1/8');
      await weightAmount.fill('');
      await weightAmount.press('Tab');
      await expect(weightAmount).toHaveValue('15');
      await expect(page.getByText('Derived from density')).toHaveClass('visually-hidden');
      await changeDesktopIngredient('Trusted Density Rice');
      await expect(weightAmount).toHaveValue('30');
      await weightAmount.fill('150');
      await changeDesktopIngredient('Trusted Density Flour');
      await expect(weightAmount).toHaveValue('150');
      await expect(page.getByText('Derived from density')).toHaveCount(0);
      await weightAmount.fill('');
      await weightAmount.press('Tab');
      await expect(weightAmount).toHaveValue('15');
      await changeDesktopIngredient('Trusted Density Rice');
      await expect(weightAmount).toHaveValue('30');
      const shortWeightBounds = await weightAmount.boundingBox();
      await volumeAmount.fill('10000000');
      await expect(weightAmount).toHaveValue('2,400,000,000');
      await expect(weightAmount).toHaveAttribute('size', '14');
      await expect(weightAmount).toHaveCSS('padding-right', '21px');
      const textIconGap = await derivedTextIconGap('Weight amount, row 1');
      expect(textIconGap).toBeGreaterThanOrEqual(3.5);
      expect(textIconGap).toBeLessThanOrEqual(6.5);
      const longAmountBounds = await weightAmount.boundingBox();
      const unitBounds = await page
        .getByRole('combobox', { name: 'Weight unit, row 1' })
        .boundingBox();
      expect(longAmountBounds).not.toBeNull();
      expect(unitBounds).not.toBeNull();
      expect(
        Boolean(
          longAmountBounds &&
            unitBounds &&
            longAmountBounds.x < unitBounds.x + unitBounds.width &&
            longAmountBounds.x + longAmountBounds.width > unitBounds.x &&
            longAmountBounds.y < unitBounds.y + unitBounds.height &&
            longAmountBounds.y + longAmountBounds.height > unitBounds.y,
        ),
      ).toBe(false);
      expect(longAmountBounds?.width).toBeGreaterThan(shortWeightBounds?.width ?? 0);
      await volumeAmount.fill('1/7');
      await volumeAmount.fill('1/8');
      await expect(weightAmount).toHaveValue('30');
    }

    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Density derivation recipe' })).toBeVisible();
    const recipeId = new URL(page.url()).pathname.split('/').at(-1);
    expect(recipeId).toBeTruthy();
    const savedRowResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=id,ingredient_id&recipe_id=eq.${recipeId}`,
      { headers },
    );
    const [savedRow] = (await savedRowResponse.json()) as {
      id: string;
      ingredient_id: string | null;
    }[];
    expect(savedRow.ingredient_id).toBe(secondIngredient.id);
    const savedMeasurementsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=measurement_type,amount_min,amount_max,unit_code&recipe_ingredient_id=eq.${savedRow.id}`,
      { headers },
    );
    const savedMeasurements = await savedMeasurementsResponse.json();
    expect(savedMeasurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          measurement_type: 'volume',
          amount_min: 0.125,
          amount_max: null,
          unit_code: 'cup',
        }),
        expect.objectContaining({
          measurement_type: 'weight',
          amount_min: 30,
          amount_max: null,
          unit_code: 'g',
        }),
      ]),
    );
  } finally {
    await deleteTestUser(request, user);
  }
});
