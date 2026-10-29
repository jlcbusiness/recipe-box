import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(?:recipes|publications(?:\/[0-9a-f-]+)?)$/);
}

async function selectSinglePicklist(
  page: import('@playwright/test').Page,
  label: string,
  option: string,
) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('recipe time controls do not overlap the Pairings or Notes sections @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Recipe Tin', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recipe Tin' })).toBeVisible();
    await page.getByRole('link', { name: 'Add Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Add Recipe' })).toBeVisible();
    const calculateButton = page.getByRole('button', { name: 'Calculate total time' });
    const topSaveButton = page
      .locator('.recipe-form-save-row')
      .getByRole('button', { name: 'Save recipe', exact: true });
    const addRecipeButton = page
      .locator('.recipe-time-total-row')
      .getByRole('button', { name: 'Save new recipe from the Total Time row', exact: true });
    await expect(topSaveButton).toHaveText('Save');
    await expect(addRecipeButton).toHaveText('Save');
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 384, height: 915 },
    ]) {
      await page.setViewportSize(viewport);
      const calculateBounds = await calculateButton.boundingBox();
      const addRecipeBounds = await addRecipeButton.boundingBox();
      const totalRowBounds = await page.locator('.recipe-time-total-row').boundingBox();
      const pairingBounds = await page
        .locator('#recipe-form > fieldset')
        .filter({ has: page.getByText('Pairs With', { exact: true }) })
        .boundingBox();
      const notesBounds = await page
        .locator('#recipe-form > fieldset')
        .filter({ has: page.getByText('Notes', { exact: true }) })
        .boundingBox();

      expect(calculateBounds).not.toBeNull();
      expect(addRecipeBounds).not.toBeNull();
      expect(totalRowBounds).not.toBeNull();
      expect(pairingBounds).not.toBeNull();
      expect(notesBounds).not.toBeNull();
      expect(addRecipeBounds?.x).toBeGreaterThan(
        (calculateBounds?.x ?? 0) + (calculateBounds?.width ?? 0),
      );
      expect((addRecipeBounds?.x ?? 0) + (addRecipeBounds?.width ?? 0)).toBeCloseTo(
        (totalRowBounds?.x ?? 0) + (totalRowBounds?.width ?? 0),
        0,
      );
      expect(addRecipeBounds?.y).toBeLessThan(
        (calculateBounds?.y ?? 0) + (calculateBounds?.height ?? 0),
      );
      if (viewport.width === 384) {
        expect(pairingBounds?.y).toBeGreaterThanOrEqual(
          (calculateBounds?.y ?? 0) + (calculateBounds?.height ?? 0),
        );
        expect(notesBounds?.y).toBeGreaterThanOrEqual(
          (calculateBounds?.y ?? 0) + (calculateBounds?.height ?? 0),
        );
      }
    }

    await page.getByLabel('Name').fill('Quick add recipe test');
    await addRecipeButton.click();
    await expect(page.getByRole('heading', { name: 'Quick add recipe test' })).toBeVisible();

    await page.goto(`${page.url()}/edit`);
    const editTopSaveButton = page
      .locator('.recipe-form-save-row')
      .getByRole('button', { name: 'Save recipe', exact: true });
    const saveChangesButton = page
      .locator('.recipe-time-total-row')
      .getByRole('button', { name: 'Save changes from the Total Time row', exact: true });
    await expect(editTopSaveButton).toHaveText('Save');
    await expect(saveChangesButton).toHaveText('Save');
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 384, height: 915 },
    ]) {
      await page.setViewportSize(viewport);
      const [saveBounds, totalRowBounds] = await Promise.all([
        saveChangesButton.boundingBox(),
        page.locator('.recipe-time-total-row').boundingBox(),
      ]);
      expect(saveBounds).not.toBeNull();
      expect(totalRowBounds).not.toBeNull();
      expect((saveBounds?.x ?? 0) + (saveBounds?.width ?? 0)).toBeCloseTo(
        (totalRowBounds?.x ?? 0) + (totalRowBounds?.width ?? 0),
        0,
      );
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

test('private navigation links to Settings and keeps Units out of the nav @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);

    const privateNavigation = page.getByRole('navigation', { name: 'Main navigation' });
    const settingsLink = privateNavigation.getByRole('link', { name: 'Settings' });
    await expect(settingsLink).toBeVisible();
    await expect(privateNavigation.getByLabel('Units', { exact: true })).toHaveCount(0);
    const trashLink = page.getByRole('link', { name: 'Trash' });
    await expect(trashLink).toBeVisible();
    const utilityLabels = page.locator('.private-nav-utility-label');
    await expect(utilityLabels).toHaveCount(2);

    if (testInfo.project.name === 'Fold 6') {
      await expect(utilityLabels.nth(0)).toBeHidden();
      await expect(utilityLabels.nth(1)).toBeHidden();
      expect((await trashLink.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    } else {
      await expect(utilityLabels.nth(0)).toBeVisible();
      await expect(utilityLabels.nth(1)).toBeVisible();
      await page.evaluate(() => {
        const content = document.querySelector<HTMLElement>('.private-content');
        if (content) content.style.minHeight = '200vh';
        window.scrollTo(0, 300);
      });
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      expect((await privateNavigation.boundingBox())?.y).toBe(0);
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    const navigationA11y = await new AxeBuilder({ page }).analyze();
    expect(navigationA11y.violations).toEqual([]);

    await settingsLink.click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Personal preferences' })).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('an owner can create, view, edit, and reload a Recipe Tin recipe @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await expect(page.getByRole('link', { name: 'Workspace' })).toHaveCount(0);
    const trashNavLink = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', {
        name: 'Trash',
      });
    await expect(trashNavLink).toBeVisible();
    const trashNavBounds = await trashNavLink.boundingBox();
    const accountMenuBounds = await page.locator('.account-menu-trigger').boundingBox();
    if (testInfo.project.name === 'Fold 6') {
      expect((trashNavBounds?.x ?? 0) + (trashNavBounds?.width ?? 0)).toBeLessThan(
        accountMenuBounds?.x ?? 0,
      );
    } else {
      expect((trashNavBounds?.y ?? 0) + (trashNavBounds?.height ?? 0)).toBeLessThan(
        accountMenuBounds?.y ?? 0,
      );
    }
    await page.getByRole('link', { name: 'Recipe Tin' }).click();
    await expect(page.getByRole('heading', { name: 'Recipe Tin' })).toBeVisible();
    await expect(page.getByText('No recipes in this publication yet.')).toBeVisible();
    const addRecipeLink = page.getByRole('link', { name: 'Add Recipe' });
    const isMobile = (page.viewportSize()?.width ?? 1280) <= 720;
    await expect(addRecipeLink).toHaveCSS('background-color', 'rgb(96, 76, 56)');
    await addRecipeLink.hover();
    await expect(addRecipeLink).toHaveCSS(
      'background-color',
      isMobile ? 'rgb(40, 36, 32)' : 'rgb(96, 76, 56)',
    );
    if (testInfo.project.name === 'Fold 6') {
      expect(Math.round((await addRecipeLink.boundingBox())?.width ?? 0)).toBe(40);
    }
    await addRecipeLink.click();
    await expect(page.getByRole('heading', { name: 'Add Recipe' })).toBeVisible();
    const emptyIngredientPrompt =
      testInfo.project.name === 'Fold 6'
        ? page.locator('.recipe-ingredient-mobile-value .recipe-ingredient-empty-prompt')
        : page.locator('.recipe-ingredient-value-cell.is-empty .recipe-ingredient-empty-prompt');
    await expect(emptyIngredientPrompt).toHaveText('add ingredient');
    await expect(emptyIngredientPrompt).toHaveCSS('font-style', 'italic');
    await expect(emptyIngredientPrompt).toHaveCSS('text-align', 'left');
    expect(
      await emptyIngredientPrompt.evaluate((element) => getComputedStyle(element).fontFamily),
    ).toContain('Georgia');
    const titleFontSize = Number.parseFloat(
      await page
        .getByRole('heading', { name: 'Add Recipe' })
        .evaluate((element) => getComputedStyle(element).fontSize),
    );
    expect(titleFontSize).toBeGreaterThanOrEqual(21);
    expect(titleFontSize).toBeLessThanOrEqual(22);
    await expect(page.getByRole('main').getByRole('link', { name: 'Recipe Tin' })).toHaveCount(0);
    await page.getByLabel('Name').fill('Sunday tomato soup');
    await expect(page.getByLabel('State')).toBeVisible();
    await expect(page.locator('input[name="state"]')).toHaveValue('want_to_try');
    const nameBounds = await page.getByLabel('Name').boundingBox();
    const publicationBounds = await page
      .getByRole('combobox', { name: 'Publication' })
      .boundingBox();
    const stateBounds = await page.getByLabel('State').boundingBox();
    const foodTypeBounds = await page
      .getByRole('combobox', { name: 'Food Type', exact: true })
      .boundingBox();
    const enthusiasmBounds = await page
      .getByRole('combobox', { name: 'Enthusiasm', exact: true })
      .boundingBox();
    const stateEquipmentBounds = await page
      .getByRole('button', { name: 'Equipment: Select' })
      .boundingBox();
    if (
      !nameBounds ||
      !publicationBounds ||
      !stateBounds ||
      !foodTypeBounds ||
      !enthusiasmBounds ||
      !stateEquipmentBounds
    ) {
      throw new Error('Recipe metadata controls must have measurable bounds.');
    }
    const singlePicklistLabel = page.locator('.recipe-single-picklist > span').first();
    const multiPicklistLabel = page.getByRole('group', { name: 'Equipment' }).locator('legend');
    await expect(singlePicklistLabel).toHaveCSS('font-size', '13px');
    await expect(multiPicklistLabel).toHaveCSS('font-size', '13px');
    await expect(singlePicklistLabel).toHaveCSS('font-weight', '400');
    await expect(multiPicklistLabel).toHaveCSS('font-weight', '400');
    await expect(page.getByRole('combobox', { name: 'State', exact: true })).toHaveCSS(
      'font-weight',
      '400',
    );
    await expect(page.getByRole('button', { name: 'Meal Type: Select' })).toHaveCSS(
      'font-weight',
      '400',
    );
    expect(stateBounds.y).toBeGreaterThan(nameBounds.y);
    expect(publicationBounds.height).toBe(nameBounds.height);
    expect(stateBounds.height).toBe(nameBounds.height);
    if (testInfo.project.name === 'Fold 6') {
      expect(enthusiasmBounds.y).toBeGreaterThan(stateBounds.y);
    } else {
      expect(Math.abs(stateBounds.y - enthusiasmBounds.y)).toBeLessThanOrEqual(1);
    }
    expect(foodTypeBounds.y).toBeGreaterThan(stateBounds.y);
    const servesBounds = await page.getByLabel('Serves').boundingBox();
    expect(servesBounds?.height).toBe(stateBounds.height);
    await expect(page.getByLabel('Serves')).toHaveCSS('text-align', 'center');
    if (testInfo.project.name === 'Fold 6') {
      expect(servesBounds?.y).toBeGreaterThan(stateBounds.y);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        352,
      );
    } else {
      expect(Math.abs((servesBounds?.y ?? 0) - stateBounds.y)).toBeLessThanOrEqual(4);
      expect(Math.abs(stateEquipmentBounds.y - stateBounds.y)).toBeLessThanOrEqual(4);
      expect(stateEquipmentBounds.x).toBeGreaterThan(servesBounds?.x ?? 0);
    }
    await expect(page.getByLabel('Serves')).toHaveAttribute('name', 'serves');
    await expect(page.getByRole('combobox', { name: 'Enthusiasm', exact: true })).toContainText(
      'What am I feeling?',
    );
    expect(foodTypeBounds?.width).toBeLessThanOrEqual(220);
    expect(foodTypeBounds.height).toBe(nameBounds.height);
    const formBounds = await page.locator('.recipe-form').boundingBox();
    const notesBounds = await page.getByLabel('Notes (Markdown)').boundingBox();
    expect(Math.abs((notesBounds?.width ?? 0) - (formBounds?.width ?? 0))).toBeLessThanOrEqual(1);
    await expect(page.locator('.recipe-form-fields').first()).toHaveCSS('display', 'flex');
    await selectSinglePicklist(page, 'Food Type', 'Soup');
    await expect(page.getByRole('group', { name: 'Times (min)' })).toBeVisible();
    await expect(page.getByLabel('Serves')).toBeVisible();
    for (const integerInput of await page
      .locator('.recipe-form input[inputmode="numeric"]')
      .all()) {
      await expect(integerInput).toHaveCSS('text-align', 'center');
    }
    for (const integerLabel of await page
      .locator('.recipe-form label[for="serves"] > span, .recipe-form .recipe-time-field > span')
      .all()) {
      await expect(integerLabel).toHaveCSS('text-align', 'center');
    }
    const foodTypeAfterSelectionBounds = await page
      .getByRole('combobox', { name: 'Food Type', exact: true })
      .boundingBox();
    const stateAfterSelectionBounds = await page.getByLabel('State').boundingBox();
    if (!foodTypeAfterSelectionBounds || !stateAfterSelectionBounds) {
      throw new Error('Recipe metadata controls must have measurable bounds after selection.');
    }
    const mealTriggerBounds = await page
      .getByRole('button', { name: 'Meal Type: Select' })
      .boundingBox();
    const cuisineTriggerBounds = await page
      .getByRole('button', { name: 'Cuisine: Select' })
      .boundingBox();
    const equipmentTriggerBounds = await page
      .getByRole('button', { name: 'Equipment: Select' })
      .boundingBox();
    expect(mealTriggerBounds?.height).toBe(stateBounds.height);
    expect(cuisineTriggerBounds?.height).toBe(stateBounds.height);
    expect(equipmentTriggerBounds?.height).toBe(stateBounds.height);
    if (testInfo.project.name === 'Fold 6') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        352,
      );
    } else {
      expect(
        Math.abs((mealTriggerBounds?.y ?? 0) - foodTypeAfterSelectionBounds.y),
      ).toBeLessThanOrEqual(4);
      expect(
        Math.abs((cuisineTriggerBounds?.y ?? 0) - foodTypeAfterSelectionBounds.y),
      ).toBeLessThanOrEqual(4);
      expect(
        Math.abs((equipmentTriggerBounds?.y ?? 0) - stateAfterSelectionBounds.y),
      ).toBeLessThanOrEqual(4);
    }
    const prepBounds = await page.getByLabel('Prep time (minutes)').boundingBox();
    const mixingBounds = await page.getByLabel('Mixing time (minutes)').boundingBox();
    await expect(page.locator('.recipe-time-fields')).toHaveCSS('display', 'flex');
    expect(prepBounds?.width).toBeLessThanOrEqual(58);
    expect(prepBounds?.height).toBeLessThanOrEqual(40);
    if (prepBounds && mixingBounds) {
      expect(mixingBounds.x - prepBounds.x - prepBounds.width).toBeLessThanOrEqual(10);
    }

    const mealGroup = page.getByRole('group', { name: 'Meal Type' });
    await expect(mealGroup.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'Meal Type: Select' }).click();
    const dinnerOption = page.getByRole('button', { name: 'Dinner', exact: true });
    const mealMenuBounds = await page
      .getByRole('group', { name: 'Meal Type options' })
      .boundingBox();
    expect(mealMenuBounds?.width).toBeLessThanOrEqual(220);
    await dinnerOption.click();
    await expect(dinnerOption).toHaveAttribute('aria-pressed', 'true');
    await expect(dinnerOption).toHaveCSS('font-weight', '700');
    await expect(
      page
        .getByRole('button', { name: /Meal Type: Dinner/ })
        .locator('.recipe-picklist-trigger-label'),
    ).toHaveText(/✓\s*Dinner/);
    await expect(dinnerOption).toBeVisible();
    await page.getByRole('button', { name: 'Cuisine: Select' }).click();
    await page.getByRole('button', { name: 'Italian', exact: true }).click();
    await selectSinglePicklist(page, 'State', 'Want to Try');
    await selectSinglePicklist(page, 'Enthusiasm', 'Absolutely');
    await page.getByLabel('Serves').fill('1200');
    await page.getByLabel('Prep time (minutes)').fill('1015');
    await expect(page.getByLabel('Serves')).toHaveValue('1,200');
    await page.getByLabel('Mixing time (minutes)').fill('10');
    await expect(page.getByLabel('Prep time (minutes)')).toHaveValue('1,015');
    await page.getByLabel('Cook time (minutes)').fill('30');
    await page.getByLabel('Total time (minutes)').fill('999');
    expect(
      await page
        .getByLabel('Prep time (minutes)')
        .evaluate((element) => getComputedStyle(element).appearance),
    ).toBe('textfield');
    const componentTimeBottoms = await Promise.all(
      ['Prep', 'Mixing', 'Marinate', 'Chill', 'Freeze', 'Cook', 'Bake', 'Cooling', 'Rest'].map(
        async (label) => {
          const bounds = await page.getByLabel(`${label} time (minutes)`).boundingBox();
          return bounds ? bounds.y + bounds.height : 0;
        },
      ),
    );
    const totalTimeBounds = await page.getByLabel('Total time (minutes)').boundingBox();
    expect(Math.max(...componentTimeBottoms)).toBeLessThan(totalTimeBounds?.y ?? 0);
    const calculateButton = page.getByRole('button', { name: 'Calculate total time' });
    await expect(calculateButton).toHaveText('Σ');
    const totalRow = page.locator('.recipe-time-total-row');
    await expect(totalRow).toBeVisible();
    const calculateBounds = await calculateButton.boundingBox();
    if (testInfo.project.name === 'Fold 6') {
      expect(
        Math.abs(
          (calculateBounds?.y ?? 0) +
            (calculateBounds?.height ?? 0) / 2 -
            ((totalTimeBounds?.y ?? 0) + (totalTimeBounds?.height ?? 0) / 2),
        ),
      ).toBeLessThanOrEqual(1);
      expect(calculateBounds?.width).toBeGreaterThanOrEqual(48);
      expect(calculateBounds?.height).toBeGreaterThanOrEqual(48);
    } else {
      expect(calculateBounds?.y).toBe(totalTimeBounds?.y);
      expect(calculateBounds?.x).toBeGreaterThan(totalTimeBounds?.x ?? 0);
      expect(calculateBounds?.width).toBeLessThanOrEqual(34);
      expect(
        Math.abs((calculateBounds?.width ?? 0) - (calculateBounds?.height ?? 0)),
      ).toBeLessThanOrEqual(1);
    }
    const componentTimeGap =
      (mixingBounds?.x ?? 0) - ((prepBounds?.x ?? 0) + (prepBounds?.width ?? 0));
    const calculateGapBounds =
      testInfo.project.name === 'Fold 6'
        ? await calculateButton.locator('.recipe-calculate-icon').boundingBox()
        : calculateBounds;
    const totalButtonGap =
      (calculateGapBounds?.x ?? 0) - ((totalTimeBounds?.x ?? 0) + (totalTimeBounds?.width ?? 0));
    if (testInfo.project.name === 'Fold 6') {
      expect(componentTimeGap).toBeGreaterThanOrEqual(0);
      expect(componentTimeGap).toBeLessThanOrEqual(16);
      expect(totalButtonGap).toBeGreaterThanOrEqual(0);
      expect(totalButtonGap).toBeLessThanOrEqual(20);
    } else {
      expect(Math.abs(componentTimeGap - totalButtonGap)).toBeLessThanOrEqual(1);
    }
    await page.getByRole('button', { name: 'Equipment: Select' }).click();
    await page.getByRole('button', { name: 'Medium skillet', exact: true }).click();
    await page.getByLabel('Notes (Markdown)').fill('Add **fresh** basil at the end.');

    await expect(page.getByLabel('Total time (minutes)')).toHaveValue('999');
    await page.getByLabel('Cook time (minutes)').fill('31');
    await expect(page.getByLabel('Total time (minutes)')).toHaveValue('999');
    await page.getByRole('button', { name: 'Calculate total time' }).click();
    await expect(page.getByLabel('Total time (minutes)')).toHaveValue('1,056');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Sunday tomato soup' })).toBeVisible();
    await expect(page.locator('.recipe-serves-value')).toContainText('Serves 1,200');
    await expect(page.locator('.recipe-time-list dd')).toHaveText([
      '16 hr 55 min',
      '10 min',
      '31 min',
    ]);
    await expect(
      page
        .locator('.recipe-metadata:not(.recipe-time-list) dd')
        .filter({ hasText: '17 hr 36 min' }),
    ).toBeVisible();
    const detailsAfterPhotoFreeHeading = page.locator(
      '.recipe-summary-layout-with-detail-heading > .recipe-detail-section',
    );
    await expect(detailsAfterPhotoFreeHeading).toHaveCount(1);
    await expect(detailsAfterPhotoFreeHeading).toHaveCSS('margin-top', '0px');
    await page.setViewportSize({ width: 1600, height: 1000 });
    const desktopDetailHeadingBounds = await page.locator('.recipe-detail-heading').boundingBox();
    const desktopDetailsBounds = await detailsAfterPhotoFreeHeading.boundingBox();
    const desktopEditLink = page.getByRole('link', { name: 'Edit' });
    await expect(desktopEditLink.locator('svg')).toBeVisible();
    await expect(desktopEditLink).toHaveAttribute('title', 'Edit recipe');
    const desktopEditBounds = await desktopEditLink.boundingBox();
    const desktopTitleBounds = await page
      .getByRole('heading', { name: 'Sunday tomato soup' })
      .boundingBox();
    const desktopActionsBounds = await page.locator('.recipe-detail-heading-actions').boundingBox();
    const desktopTitleContentBounds = await page.locator('.recipe-detail-title').boundingBox();
    expect(desktopDetailHeadingBounds).not.toBeNull();
    expect(desktopDetailsBounds).not.toBeNull();
    expect(desktopEditBounds?.height).toBe(36);
    expect(desktopTitleBounds).not.toBeNull();
    expect(desktopActionsBounds).not.toBeNull();
    expect(desktopTitleContentBounds).not.toBeNull();
    if (
      desktopDetailHeadingBounds &&
      desktopDetailsBounds &&
      desktopActionsBounds &&
      desktopTitleContentBounds
    ) {
      expect(
        Math.abs(
          desktopDetailsBounds.y -
            (desktopDetailHeadingBounds.y + desktopDetailHeadingBounds.height) -
            8,
        ),
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(desktopActionsBounds.y - desktopTitleContentBounds.y)).toBeLessThanOrEqual(1);
      expect(desktopActionsBounds.x).toBeGreaterThanOrEqual(
        desktopTitleContentBounds.x + desktopTitleContentBounds.width,
      );
    }
    const detailTitleSize = Number.parseFloat(
      await page
        .getByRole('heading', { name: 'Sunday tomato soup' })
        .evaluate((element) => getComputedStyle(element).fontSize),
    );
    const sectionTitleSize = Number.parseFloat(
      await page
        .getByRole('heading', { name: 'Recipe details' })
        .evaluate((element) => getComputedStyle(element).fontSize),
    );
    expect(detailTitleSize).toBeGreaterThanOrEqual(21);
    expect(detailTitleSize).toBeLessThanOrEqual(22);
    expect(sectionTitleSize).toBeGreaterThanOrEqual(21);
    expect(sectionTitleSize).toBeLessThanOrEqual(22);
    expect(
      (await page.locator('.recipe-detail-section').first().boundingBox())?.width,
    ).toBeGreaterThanOrEqual(1000);
    await expect(page.getByRole('main').getByRole('link', { name: 'Recipe Tin' })).toBeVisible();
    await expect(page.locator('.recipe-attribution')).toContainText('In the Recipe Tin');
    const detailLabels = await page
      .locator('.recipe-metadata:not(.recipe-time-list) dt')
      .allTextContents();
    const detailMetadata = page.locator('.recipe-metadata:not(.recipe-time-list)').first();
    await expect(detailMetadata).toHaveCSS('display', 'flex');
    await expect(detailMetadata).toHaveCSS('flex-wrap', 'wrap');
    await expect(detailMetadata).toHaveCSS('row-gap', '11px');
    await expect(page.locator('.recipe-detail-classification')).toHaveCSS('margin-top', '11px');
    await expect(page.locator('.recipe-detail-times')).toHaveCSS('margin-top', '11px');
    await expect(page.locator('.recipe-time-list')).toHaveCSS('margin-top', '0px');
    await expect(page.locator('.recipe-time-list dt')).toHaveText(['Prep', 'Mixing', 'Cook']);
    const detailSectionBounds = await page.locator('.recipe-detail-section').first().boundingBox();
    const classificationBounds = await page.locator('.recipe-detail-classification').boundingBox();
    expect(
      Math.abs((classificationBounds?.width ?? 0) - (detailSectionBounds?.width ?? 0)),
    ).toBeLessThanOrEqual(1);
    expect(detailLabels).toEqual([
      'State',
      'Enthusiasm',
      'Serves',
      'Total time',
      'Equipment',
      'Food Type',
      'Meal Type',
      'Cuisine',
    ]);
    await expect(page.locator('.recipe-detail-classification dt')).toHaveText([
      'Food Type',
      'Meal Type',
      'Cuisine',
    ]);
    await expect(page.getByRole('heading', { name: 'Time Breakdown', exact: true })).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileDetailHeadingBounds = await page.locator('.recipe-detail-heading').boundingBox();
    const mobileDetailsBounds = await detailsAfterPhotoFreeHeading.boundingBox();
    const mobileSummaryTitleBounds = await page.locator('.recipe-detail-title').boundingBox();
    const mobileSummaryActionsBounds = await page
      .locator('.recipe-detail-heading-actions')
      .boundingBox();
    expect(mobileDetailHeadingBounds).not.toBeNull();
    expect(mobileDetailsBounds).not.toBeNull();
    expect(mobileSummaryTitleBounds).not.toBeNull();
    expect(mobileSummaryActionsBounds).not.toBeNull();
    if (
      mobileDetailHeadingBounds &&
      mobileDetailsBounds &&
      mobileSummaryTitleBounds &&
      mobileSummaryActionsBounds
    ) {
      expect(
        Math.abs(
          mobileDetailsBounds.y -
            (mobileDetailHeadingBounds.y + mobileDetailHeadingBounds.height) -
            8,
        ),
      ).toBeLessThanOrEqual(1);
      expect(mobileSummaryActionsBounds.y).toBeGreaterThanOrEqual(
        mobileSummaryTitleBounds.y + mobileSummaryTitleBounds.height,
      );
    }
    const timesSection = page.locator('.recipe-detail-times');
    const timesHeading = page.getByRole('heading', { name: 'Time Breakdown', exact: true });
    await expect(timesHeading).toBeVisible();
    await expect(timesHeading).toHaveCSS('font-size', '18px');
    await expect(timesHeading).toHaveCSS('color', 'rgb(4, 31, 85)');
    await expect(timesHeading).toHaveCSS('font-variant-caps', 'all-small-caps');
    await expect(timesSection).toHaveCSS('border-top-width', '1px');
    await expect(timesSection).toHaveCSS('border-top-style', 'solid');
    await expect(timesSection).toContainText('Prep');
    await expect(timesSection).not.toContainText('Total time');
    await expect(
      page.locator('.recipe-metadata:not(.recipe-time-list) dt').filter({ hasText: 'Total time' }),
    ).toHaveCount(1);
    await expect(page.getByText('Add fresh basil at the end.')).toBeVisible();
    await page.setViewportSize({ width: 1600, height: 1000 });

    const recipeId = new URL(page.url()).pathname.split('/').at(-1);
    expect(recipeId).toBeTruthy();
    const headers = {
      apikey: config.anonKey,
      Authorization: `Bearer ${user.accessToken}`,
    };
    const recipeResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,version,total_time_minutes,serves&id=eq.${recipeId}`,
      { headers },
    );
    expect(await recipeResponse.json()).toEqual([
      { id: recipeId, version: 1, total_time_minutes: 1056, serves: 1200 },
    ]);

    const createHistory = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,actor_user_id&record_id=eq.${recipeId}`,
      { headers },
    );
    expect(await createHistory.json()).toEqual([
      { event_type: 'recipe.created', actor_user_id: user.id },
    ]);

    await page.goto('/recipes');
    expect((await page.locator('.recipes-main').boundingBox())?.width).toBeGreaterThanOrEqual(1150);
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await page.getByRole('checkbox', { name: 'Opinion', exact: true }).check();
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await expect(page.getByRole('columnheader', { name: 'Opinion' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Last saved' })).toHaveCount(0);
    const recipeRow = page.getByRole('row', { name: /Sunday tomato soup/ });
    await expect(recipeRow).toContainText('Absolutely');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('columnheader', { name: 'Food Type' })).toBeHidden();
    await expect(page.getByRole('columnheader', { name: 'State' })).toBeHidden();
    await expect(recipeRow.locator('td:visible')).toHaveCount(4);
    await recipeRow.getByRole('link', { name: 'Sunday tomato soup' }).click();

    await expect(
      page.locator('.recipe-summary-layout-with-detail-heading > .recipe-detail-section'),
    ).toHaveCSS('margin-top', '0px');
    const mobileEditLink = page.getByRole('link', { name: 'Edit' });
    await expect(mobileEditLink.locator('svg')).toBeVisible();
    await expect(mobileEditLink).toHaveAttribute('title', 'Edit recipe');
    const mobileEditBounds = await mobileEditLink.boundingBox();
    const mobileActionsBounds = await page.locator('.recipe-detail-heading-actions').boundingBox();
    const mobileTitleContentBounds = await page.locator('.recipe-detail-title').boundingBox();
    const mobileHeadingBounds = await page.locator('.recipe-detail-heading').boundingBox();
    expect(mobileEditBounds?.height).toBe(36);
    expect(mobileActionsBounds).not.toBeNull();
    expect(mobileTitleContentBounds).not.toBeNull();
    expect(mobileHeadingBounds).not.toBeNull();
    if (mobileActionsBounds && mobileTitleContentBounds && mobileHeadingBounds) {
      expect(mobileActionsBounds.y).toBeGreaterThanOrEqual(
        mobileTitleContentBounds.y + mobileTitleContentBounds.height,
      );
      expect(mobileActionsBounds.x + mobileActionsBounds.width).toBeCloseTo(
        mobileHeadingBounds.x + mobileHeadingBounds.width,
        0,
      );
    }
    await expect(mobileEditLink).toHaveCSS('position', 'relative');
    await expect(mobileEditLink).toHaveCSS('height', '36px');
    const mobileEditHitArea = await mobileEditLink.evaluate((element) =>
      getComputedStyle(element, '::before'),
    );
    expect(mobileEditHitArea.position).toBe('absolute');
    expect(mobileEditHitArea.top).toBe('-8px');
    expect(mobileEditHitArea.bottom).toBe('-8px');
    await mobileEditLink.click();
    await expect(page.getByLabel('Serves')).toHaveValue('1,200');
    await expect(page.getByLabel('Prep time (minutes)')).toHaveValue('1,015');
    await expect(page.getByLabel('Mixing time (minutes)')).toHaveValue('10');
    await expect(page.getByLabel('Cook time (minutes)')).toHaveValue('31');
    await expect(page.getByLabel('Total time (minutes)')).toHaveValue('1,056');
    const mobileNameBounds = await page.getByLabel('Name').boundingBox();
    const mobilePublicationBounds = await page
      .getByRole('combobox', { name: 'Publication' })
      .boundingBox();
    const foodTypeTrigger = page.getByRole('combobox', { name: 'Food Type', exact: true });
    const foodTypeTriggerBounds = await foodTypeTrigger.boundingBox();
    const mealTypeTriggerBounds = await page
      .getByRole('button', { name: /Meal Type:/ })
      .boundingBox();
    expect(mobilePublicationBounds?.height).toBe(mobileNameBounds?.height);
    expect(foodTypeTriggerBounds?.height).toBe(mealTypeTriggerBounds?.height);
    expect(foodTypeTriggerBounds?.height).toBe(mobileNameBounds?.height);
    expect(
      Math.abs((foodTypeTriggerBounds?.y ?? 0) - (mealTypeTriggerBounds?.y ?? 0)),
    ).toBeLessThanOrEqual(1);
    const foodTypeLabelBounds = await page
      .locator('.recipe-single-picklist')
      .filter({ has: foodTypeTrigger })
      .locator(':scope > span:first-child')
      .boundingBox();
    const mealTypeLabel = page.getByRole('group', { name: 'Meal Type' }).locator('legend');
    const mealTypeLabelBounds = await mealTypeLabel.boundingBox();
    await expect(mealTypeLabel).toHaveCSS('font-size', '13px');
    expect(
      Math.abs((foodTypeLabelBounds?.y ?? 0) - (mealTypeLabelBounds?.y ?? 0)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((foodTypeLabelBounds?.height ?? 0) - (mealTypeLabelBounds?.height ?? 0)),
    ).toBeLessThanOrEqual(1);
    const mobileStateBounds = await page
      .getByRole('combobox', { name: 'State', exact: true })
      .boundingBox();
    const mobileServesBounds = await page.getByLabel('Serves').boundingBox();
    expect(mobileServesBounds?.height).toBe(mobileStateBounds?.height);
    await foodTypeTrigger.click();
    const foodTypeMenuBounds = await page.getByRole('listbox').boundingBox();
    expect(
      Math.abs((foodTypeMenuBounds?.x ?? 0) - (foodTypeTriggerBounds?.x ?? 0)),
    ).toBeLessThanOrEqual(1);
    await page.getByRole('option', { name: 'Soup', exact: true }).click();
    await selectSinglePicklist(page, 'State', 'Tried');
    await selectSinglePicklist(page, 'Verdict', 'Favorite');
    await page.getByLabel('Name').fill('Sunday tomato and basil soup');
    await page.getByLabel('Total time (minutes)').fill('70');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Sunday tomato and basil soup' })).toBeVisible();
    await page.goto('/recipes');
    await expect(page.getByRole('row', { name: /Sunday tomato and basil soup/ })).toContainText(
      'Favorite',
    );
    await page
      .getByRole('row', { name: /Sunday tomato and basil soup/ })
      .getByRole('link', { name: 'Sunday tomato and basil soup' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/recipes/${recipeId}$`));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sunday tomato and basil soup' })).toBeVisible();

    const updatedRecipe = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,version,total_time_minutes&id=eq.${recipeId}`,
      { headers },
    );
    expect(await updatedRecipe.json()).toEqual([
      { id: recipeId, version: 2, total_time_minutes: 70 },
    ]);
    const history = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,actor_user_id&record_id=eq.${recipeId}&order=created_at.asc`,
      { headers },
    );
    expect(await history.json()).toEqual([
      { event_type: 'recipe.created', actor_user_id: user.id },
      { event_type: 'recipe.updated', actor_user_id: user.id },
    ]);

    await page.getByRole('link', { name: 'Edit' }).click();
    await selectSinglePicklist(page, 'State', 'Will not try');
    await page.getByLabel('Reason').fill('Contains an ingredient I avoid.');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Sunday tomato and basil soup' })).toBeVisible();
    await expect(page.locator('.recipe-metadata').first()).toContainText('Will not try');
    await page.goto('/recipes');
    await expect(page.getByRole('row', { name: /Sunday tomato and basil soup/ })).toContainText(
      'Contains an ingredient I avoid.',
    );
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipe multiselect stays anchored and hides measurement text @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');

    const equipmentOptions = page.getByRole('group', { name: 'Equipment options' });
    await page.getByRole('button', { name: 'Equipment: Select' }).click();
    await expect(equipmentOptions).toBeVisible();
    const foodTypeTrigger = page.getByRole('combobox', { name: 'Food Type', exact: true });
    await foodTypeTrigger.focus();
    await page.keyboard.press('Enter');
    const foodTypeOptions = page.getByRole('listbox');
    await expect(foodTypeOptions).toHaveCount(1);
    await expect(equipmentOptions).toBeHidden();
    const mealTypeTrigger = page.getByRole('button', { name: 'Meal Type: Select' });
    await mealTypeTrigger.focus();
    await page.keyboard.press('Enter');
    const mealTypeOptions = page.getByRole('group', { name: 'Meal Type options' });
    await expect(mealTypeOptions).toBeVisible();
    await expect(foodTypeOptions).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(mealTypeOptions).toBeHidden();

    for (const label of ['Equipment', 'Meal Type', 'Cuisine']) {
      const measure = page
        .getByRole('group', { name: label })
        .locator('span[aria-hidden="true"]')
        .first();
      await expect(measure).toHaveCSS('visibility', 'hidden');
      await expect(measure).not.toBeVisible();
    }

    const mealTypeGroup = page.getByRole('group', { name: 'Meal Type' });
    const mealTypeLegend = mealTypeGroup.locator('legend');
    const mealTypeBefore = await mealTypeLegend.boundingBox();
    expect(mealTypeBefore).not.toBeNull();
    await page.getByRole('button', { name: 'Equipment: Select' }).click();
    const equipmentMenu = page.getByRole('group', { name: 'Equipment options' });
    await expect(equipmentMenu).toBeVisible();
    await expect(equipmentMenu).toHaveCSS('position', 'absolute');
    const firstEquipmentOption = equipmentMenu.getByRole('button').first();
    await expect(firstEquipmentOption).toHaveCSS('display', 'flex');
    await expect(firstEquipmentOption).toHaveCSS('text-align', 'left');
    const firstOptionLabel = (await firstEquipmentOption.innerText()).trim();
    await firstEquipmentOption.click();
    await expect(firstEquipmentOption).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('input[name="equipment_ids"]')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: `Equipment: ${firstOptionLabel}` }),
    ).toBeVisible();
    await firstEquipmentOption.click();
    await expect(firstEquipmentOption).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('input[name="equipment_ids"]')).toHaveCount(0);
    await firstEquipmentOption.focus();
    await page.keyboard.press('Space');
    await expect(firstEquipmentOption).toHaveAttribute('aria-pressed', 'true');
    await expect(equipmentMenu).toBeVisible();
    await expect(page.locator('input[name="equipment_ids"]')).toHaveCount(1);
    await page.keyboard.press('Space');
    await expect(firstEquipmentOption).toHaveAttribute('aria-pressed', 'false');
    await expect(equipmentMenu).toBeVisible();
    await expect(page.locator('input[name="equipment_ids"]')).toHaveCount(0);
    const equipmentTrigger = page.getByRole('button', { name: 'Equipment: Select' });
    await equipmentTrigger.click();
    await expect(equipmentMenu).toBeHidden();
    await equipmentTrigger.focus();
    await page.keyboard.press('Space');
    await expect(equipmentMenu).toBeVisible();
    await expect(firstEquipmentOption).toBeFocused();
    const secondEquipmentOption = equipmentMenu.getByRole('button').nth(1);
    await page.keyboard.press('ArrowDown');
    await expect(secondEquipmentOption).toBeFocused();
    await page.keyboard.press('Space');
    await expect(equipmentMenu).toBeVisible();
    await expect(secondEquipmentOption).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('input[name="equipment_ids"]')).toHaveCount(1);
    await page.keyboard.press('ArrowUp');
    await expect(firstEquipmentOption).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(secondEquipmentOption).toBeFocused();
    await page.keyboard.press('Space');
    await expect(secondEquipmentOption).toHaveAttribute('aria-pressed', 'false');
    await expect(equipmentMenu).toBeVisible();
    await expect(page.locator('input[name="equipment_ids"]')).toHaveCount(0);
    await firstEquipmentOption.focus();
    await page.keyboard.press('Space');
    await expect(firstEquipmentOption).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Enter');
    await expect(equipmentMenu).toBeHidden();
    await expect(page.locator('input[name="equipment_ids"]')).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: `Equipment: ${firstOptionLabel}` }),
    ).toBeVisible();
    await expect(page.locator('button[aria-controls="equipment-options"]')).toBeFocused();
    const mealTypeAfter = await mealTypeLegend.boundingBox();
    expect(mealTypeAfter).not.toBeNull();
    expect(Math.abs((mealTypeAfter?.y ?? 0) - (mealTypeBefore?.y ?? 0))).toBeLessThanOrEqual(1);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('clicking the next ingredient field preserves the selected row @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const ingredientResponse = await request.post(`${config.apiUrl}/rest/v1/ingredients`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      data: { account_id: user.id, name: 'Paprika' },
    });
    expect(ingredientResponse.ok(), await ingredientResponse.text()).toBeTruthy();

    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.setViewportSize({ width: 1024, height: 900 });
    await expect(page.locator('.recipe-ingredient-table thead th').first()).toHaveCSS(
      'vertical-align',
      'middle',
    );
    await page.getByLabel('Name').fill('Click between ingredient fields');
    await page
      .locator('.recipe-ingredient-value-cell[data-field="ingredientName"]')
      .first()
      .click();
    const ingredientInput = page.getByRole('combobox', { name: 'Ingredient, row 1' });
    await ingredientInput.fill('Paprika');
    await page.getByRole('option', { name: 'Paprika', exact: true }).click();
    await page.locator('.recipe-ingredient-value-cell[data-field="detail"]').first().click();

    const specificsInput = page.getByRole('textbox', { name: 'Specifics, row 1' });
    await expect(specificsInput).toBeFocused();
    await expect(
      page.locator('.recipe-ingredient-table tbody tr[data-row-id]').first(),
    ).toContainText('Paprika');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipes and history are isolated to their owning account @e2e', async ({ request }) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const ownerPicklistsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id,category,value,sort_order,is_protected&order=category.asc&order=sort_order.asc`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${owner.accessToken}` } },
    );
    const otherPicklistsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id,category,value,sort_order,is_protected&order=category.asc&order=sort_order.asc`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${other.accessToken}` } },
    );
    const ownerPicklists = (await ownerPicklistsResponse.json()) as Array<{
      id: string;
      category: string;
      value: string;
      sort_order: number;
      is_protected: boolean;
    }>;
    const otherPicklists = (await otherPicklistsResponse.json()) as typeof ownerPicklists;
    const expectedPicklistCounts = {
      cuisine: 8,
      enthusiasm: 6,
      equipment: 10,
      food_type: 12,
      informal_unit: 11,
      meal_type: 10,
      unmeasured_phrase: 5,
      verdict: 12,
    };
    const countByCategory = (values: Array<{ category: string }>) =>
      values.reduce<Record<string, number>>((counts, value) => {
        counts[value.category] = (counts[value.category] ?? 0) + 1;
        return counts;
      }, {});
    expect(countByCategory(ownerPicklists)).toEqual(expectedPicklistCounts);
    const seedEntries = (values: typeof ownerPicklists) =>
      values
        .map(({ category, value, sort_order, is_protected }) => ({
          category,
          value,
          sort_order,
          is_protected,
        }))
        .sort((left, right) =>
          `${left.category}:${left.value}`.localeCompare(`${right.category}:${right.value}`),
        );
    expect(seedEntries(ownerPicklists)).toEqual(seedEntries(otherPicklists));
    expect(ownerPicklists).toHaveLength(74);
    expect(ownerPicklists.every(({ id }) => !otherPicklists.some((value) => value.id === id))).toBe(
      true,
    );
    const otherPicklist = otherPicklists[0];
    const hiddenPicklistResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&id=eq.${otherPicklist.id}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${owner.accessToken}` } },
    );
    expect(await hiddenPicklistResponse.json()).toEqual([]);
    expect(
      ownerPicklists
        .filter(({ value }) => value === 'Specific occasion')
        .every(({ is_protected }) => is_protected),
    ).toBe(true);

    const insert = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${owner.accessToken}`,
      },
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'Owner-only fixture recipe',
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
        p_ingredient_rows: [],
        p_meal_type_ids: [],
        p_cuisine_ids: [],
        p_equipment_ids: [],
      },
    });
    expect(insert.ok()).toBeTruthy();
    const [{ id: recipeId }] = await insert.json();

    const directInsert = await request.post(`${config.apiUrl}/rest/v1/recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${owner.accessToken}`,
      },
      data: { account_id: owner.id, name: 'Bypass attempt', state: 'want_to_try' },
    });
    expect(directInsert.ok()).toBeFalsy();

    const ownerRecipes = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id&id=eq.${recipeId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${owner.accessToken}` } },
    );
    const otherRecipes = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id&id=eq.${recipeId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${other.accessToken}` } },
    );
    expect(await ownerRecipes.json()).toEqual([{ id: recipeId }]);
    expect(await otherRecipes.json()).toEqual([]);

    const crossAccountUpdate = await request.patch(
      `${config.apiUrl}/rest/v1/recipes?id=eq.${recipeId}`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${other.accessToken}`,
          Prefer: 'return=representation',
        },
        data: { name: 'Unauthorized edit', version: 2 },
      },
    );
    expect(await crossAccountUpdate.json()).toEqual([]);

    const ownerHistory = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,actor_user_id&record_id=eq.${recipeId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${owner.accessToken}` } },
    );
    const otherHistory = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,actor_user_id&record_id=eq.${recipeId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${other.accessToken}` } },
    );
    expect(await ownerHistory.json()).toEqual([
      { event_type: 'recipe.created', actor_user_id: owner.id },
    ]);
    expect(await otherHistory.json()).toEqual([]);
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});

test('recipe saves preserve conditional data and reject stale versions atomically @e2e', async ({
  request,
}) => {
  const user = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };

  try {
    const specificOccasionResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&category=eq.enthusiasm&value=eq.${encodeURIComponent('Specific occasion')}`,
      { headers },
    );
    const dinnerResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&category=eq.meal_type&value=eq.Dinner`,
      { headers },
    );
    const favoriteResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&category=eq.verdict&value=eq.Favorite`,
      { headers },
    );
    const otherDinnerResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&category=eq.meal_type&value=eq.Dinner`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${other.accessToken}`,
        },
      },
    );
    const [{ id: enthusiasmId }] = await specificOccasionResponse.json();
    const [{ id: dinnerId }] = await dinnerResponse.json();
    const [{ id: favoriteId }] = await favoriteResponse.json();
    const [{ id: otherDinnerId }] = await otherDinnerResponse.json();
    const payload: Record<string, unknown> = {
      p_recipe_id: null,
      p_expected_version: null,
      p_name: 'Sunday dinner recipe',
      p_food_type_id: null,
      p_state: 'want_to_try',
      p_verdict_id: null,
      p_enthusiasm_id: enthusiasmId,
      p_occasion_details: 'For Sunday dinner',
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
      p_meal_type_ids: [dinnerId],
      p_cuisine_ids: [],
      p_equipment_ids: [],
    };
    const save = (overrides: Record<string, unknown>) =>
      request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
        headers,
        data: { ...payload, ...overrides },
      });

    const create = await save({});
    expect(create.ok(), await create.text()).toBeTruthy();
    const [created] = await create.json();
    expect(created.version).toBe(1);

    const fractionalServes = await save({ p_serves: 1.5 });
    expect(fractionalServes.ok()).toBeFalsy();

    const recipeId = created.id as string;
    const recipeResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,name,enthusiasm_id,occasion_details,version&id=eq.${recipeId}`,
      { headers },
    );
    expect(await recipeResponse.json()).toEqual([
      {
        id: recipeId,
        name: 'Sunday dinner recipe',
        enthusiasm_id: enthusiasmId,
        occasion_details: 'For Sunday dinner',
        version: 1,
      },
    ]);

    const update = await save({
      p_recipe_id: recipeId,
      p_expected_version: 1,
      p_name: 'Updated Sunday dinner recipe',
      p_state: 'tried',
      p_verdict_id: favoriteId,
      p_enthusiasm_id: null,
      p_occasion_details: null,
    });
    expect(update.ok()).toBeTruthy();

    const staleUpdate = await save({
      p_recipe_id: recipeId,
      p_expected_version: 1,
      p_name: 'Stale recipe edit',
      p_meal_type_ids: [],
    });
    expect((await staleUpdate.json()).code).toBe('PT409');

    const invalidAssociationUpdate = await save({
      p_recipe_id: recipeId,
      p_expected_version: 2,
      p_name: 'Invalid association edit',
      p_meal_type_ids: [otherDinnerId],
    });
    expect((await invalidAssociationUpdate.json()).code).toBe('23503');

    const currentRecipe = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=name,state,verdict_id,version&id=eq.${recipeId}`,
      { headers },
    );
    expect(await currentRecipe.json()).toEqual([
      { name: 'Updated Sunday dinner recipe', state: 'tried', verdict_id: favoriteId, version: 2 },
    ]);
    const assignments = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_assignments?select=picklist_value_id&recipe_id=eq.${recipeId}`,
      { headers },
    );
    expect(await assignments.json()).toEqual([{ picklist_value_id: dinnerId }]);
    const history = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,actor_user_id,before_data,after_data&record_id=eq.${recipeId}&order=created_at.asc`,
      { headers },
    );
    const historyRows = await history.json();
    expect(historyRows).toHaveLength(2);
    expect(historyRows[0]).toMatchObject({
      event_type: 'recipe.created',
      actor_user_id: user.id,
      before_data: null,
      after_data: {
        name: 'Sunday dinner recipe',
        version: 1,
        occasion_details: 'For Sunday dinner',
      },
    });
    expect(historyRows[1]).toMatchObject({
      event_type: 'recipe.updated',
      actor_user_id: user.id,
      before_data: { name: 'Sunday dinner recipe', version: 1 },
      after_data: {
        name: 'Updated Sunday dinner recipe',
        state: 'tried',
        verdict_id: favoriteId,
        version: 2,
      },
    });
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, user);
  }
});

test('State controls conditional fields and clears old draft values @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('A recipe under consideration');
    const statePicklist = page.getByRole('combobox', { name: 'State', exact: true });
    await expect(statePicklist).toBeVisible();
    await statePicklist.click();
    await expect(page.getByRole('listbox')).toHaveCount(1);
    await page.getByRole('combobox', { name: 'Food Type', exact: true }).click();
    await expect(page.getByRole('listbox')).toHaveCount(1);
    await page.getByRole('option', { name: 'Soup', exact: true }).click();
    await expect(page.locator('input[name="food_type_id"]')).not.toHaveValue('');
    await selectSinglePicklist(page, 'State', 'Want to Try');
    await expect(page.getByLabel('Enthusiasm')).toBeVisible();
    await expect(page.getByLabel('Verdict')).toBeHidden();
    await expect(page.getByLabel('Reason')).toBeHidden();

    await selectSinglePicklist(page, 'Enthusiasm', 'Specific occasion');
    await expect(page.getByLabel('Occasion Details')).toBeVisible();
    await expect(page.getByLabel('Occasion Details')).toHaveAttribute('type', 'text');
    const occasionDetailsBounds = await page.getByLabel('Occasion Details').boundingBox();
    const enthusiasmBounds = await page
      .getByRole('combobox', { name: 'Enthusiasm', exact: true })
      .boundingBox();
    expect(occasionDetailsBounds).not.toBeNull();
    expect(enthusiasmBounds).not.toBeNull();
    expect(
      Math.abs((occasionDetailsBounds?.height ?? 0) - (enthusiasmBounds?.height ?? 0)),
    ).toBeLessThanOrEqual(1);
    await page.getByLabel('Occasion Details').fill('Sunday dinner');
    await selectSinglePicklist(page, 'Enthusiasm', 'Absolutely');
    await expect(page.getByLabel('Occasion Details')).toBeHidden();
    await selectSinglePicklist(page, 'Enthusiasm', 'Specific occasion');
    await expect(page.getByLabel('Occasion Details')).toBeVisible();
    await expect(page.getByLabel('Occasion Details')).toHaveValue('');
    await page.getByLabel('Occasion Details').fill('Sunday dinner');

    await selectSinglePicklist(page, 'State', 'Tried');
    await expect(page.getByLabel('Verdict')).toBeVisible();
    await expect(page.getByLabel('Enthusiasm')).toBeHidden();
    await expect(page.getByLabel('Occasion Details')).toBeHidden();
    await expect(page.getByLabel('Reason')).toBeHidden();
    await selectSinglePicklist(page, 'Verdict', 'Favorite');

    await selectSinglePicklist(page, 'State', 'Will not try');
    await expect(page.getByLabel('Reason')).toBeVisible();
    await expect(page.getByLabel('Verdict')).toBeHidden();
    await page.getByLabel('Reason').fill('Contains an ingredient I avoid.');
    await expect(page.getByLabel('Reason')).toHaveAttribute('type', 'text');
    await selectSinglePicklist(page, 'State', 'Tried');
    await page.getByRole('combobox', { name: 'Verdict', exact: true }).click();
    const verdictOptions = await page.getByRole('listbox').getByRole('option').allTextContents();
    const specificOccasionIndex = verdictOptions.indexOf('Specific occasion');
    expect(verdictOptions.slice(specificOccasionIndex, specificOccasionIndex + 3)).toEqual([
      'Specific occasion',
      'Once-a-year-rich',
      'So-so',
    ]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('stale recipe versions are rejected without overwriting the first save @e2e', async ({
  browser,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    const firstPage = await browser.newPage();
    await signIn(firstPage, user.email, user.password);
    await firstPage.goto('/recipes/new');
    await firstPage.getByLabel('Name').fill('Concurrent edit soup');
    await selectSinglePicklist(firstPage, 'State', 'Want to Try');
    await firstPage.getByRole('button', { name: 'Save recipe' }).click();
    await expect(firstPage.getByRole('heading', { name: 'Concurrent edit soup' })).toBeVisible();
    const detailPath = new URL(firstPage.url()).pathname;

    await firstPage.getByRole('link', { name: 'Edit' }).click();
    const secondPage = await browser.newPage();
    await signIn(secondPage, user.email, user.password);
    await secondPage.goto(`${detailPath}/edit`);

    await firstPage.getByLabel('Name').fill('First writer wins');
    await firstPage.getByRole('button', { name: 'Save recipe' }).click();
    await expect(firstPage.getByRole('heading', { name: 'First writer wins' })).toBeVisible();

    await secondPage.getByLabel('Name').fill('Stale writer must not win');
    await secondPage.getByRole('button', { name: 'Save recipe' }).click();
    await expect(
      secondPage.getByText('This recipe changed in another session. Reload before saving again.', {
        exact: true,
      }),
    ).toBeVisible();
    await secondPage.reload();
    await expect(secondPage.getByLabel('Name')).toHaveValue('First writer wins');

    await firstPage.close();
    await secondPage.close();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Recipe Tin list and editor are accessible on desktop and mobile @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes');
    const listA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(listA11y.violations).toEqual([]);

    await page.getByRole('link', { name: 'Add Recipe' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const prepInputBounds = await page.getByLabel('Prep time (minutes)').boundingBox();
    const prepTouchRowBounds = await page.locator('.recipe-time-field').first().boundingBox();
    expect(prepInputBounds?.height).toBeLessThanOrEqual(36);
    expect(prepTouchRowBounds?.height).toBeGreaterThanOrEqual(48);
    const mealTriggerBounds = await page
      .getByRole('button', { name: 'Meal Type: Select' })
      .boundingBox();
    const nameFieldBounds = await page.getByLabel('Name').boundingBox();
    const publicationFieldBounds = await page
      .getByRole('combobox', { name: 'Publication' })
      .boundingBox();
    expect(mealTriggerBounds?.height).toBe(nameFieldBounds?.height);
    expect(publicationFieldBounds?.height).toBe(nameFieldBounds?.height);
    const totalInputBounds = await page.getByLabel('Total time (minutes)').boundingBox();
    const calculateButton = page.getByRole('button', { name: 'Calculate total time' });
    const calculateButtonBounds = await calculateButton.boundingBox();
    const calculateIconBounds = await calculateButton
      .locator('.recipe-calculate-icon')
      .boundingBox();
    expect(calculateButtonBounds?.width).toBeGreaterThanOrEqual(48);
    expect(calculateButtonBounds?.height).toBeGreaterThanOrEqual(48);
    expect(calculateIconBounds?.width).toBe(30);
    expect(calculateIconBounds?.height).toBe(30);
    expect(
      Math.abs(
        (calculateIconBounds?.y ?? 0) +
          (calculateIconBounds?.height ?? 0) / 2 -
          ((totalInputBounds?.y ?? 0) + (totalInputBounds?.height ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(10);
    await page.getByRole('button', { name: 'Meal Type: Select' }).click();
    const mealOptionBounds = await page
      .getByRole('button', { name: 'Dinner', exact: true })
      .boundingBox();
    expect(mealOptionBounds?.height).toBe(mealTriggerBounds?.height);
    const multiPicklistA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(multiPicklistA11y.violations).toEqual([]);
    await page.keyboard.press('Escape');
    const editorA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(editorA11y.violations).toEqual([]);

    await page.getByLabel('Name').fill('Accessible recipe');
    await selectSinglePicklist(page, 'State', 'Will not try');
    const reasonBounds = await page.getByLabel('Reason').boundingBox();
    const stateTriggerBounds = await page
      .getByRole('combobox', { name: 'State', exact: true })
      .boundingBox();
    expect(reasonBounds?.height).toBe(stateTriggerBounds?.height);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Accessible recipe' })).toBeVisible();
    for (const width of [1280, 1600, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const isMobileOutput = width <= 640;
      const outputAction = page.getByRole('button', {
        name: isMobileOutput ? 'Download' : 'Print & Download',
      });
      await expect(outputAction).toHaveAttribute(
        'title',
        isMobileOutput ? 'Download' : 'Print & Download',
      );
      await expect(
        outputAction.locator(`svg.lucide-${isMobileOutput ? 'download' : 'printer'}`),
      ).toBeVisible();
      const editBounds = await page.getByRole('link', { name: 'Edit' }).boundingBox();
      const printBounds = await outputAction.boundingBox();
      expect(editBounds?.height).toBe(printBounds?.height);
      expect(editBounds?.width).toBe(printBounds?.width);
      expect(editBounds?.x).toBeGreaterThan(printBounds?.x ?? 0);
      expect(
        await page
          .getByRole('link', { name: 'Edit' })
          .evaluate((element) => getComputedStyle(element).borderRadius),
      ).toBe(await outputAction.evaluate((element) => getComputedStyle(element).borderRadius));
    }
    const detailA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(detailA11y.violations).toEqual([]);

    await page.getByRole('link', { name: 'Edit' }).click();
    const editA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(editA11y.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipe edit swaps Save and Delete actions across desktop and mobile @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 352, height: 844 });
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Cancel alignment recipe');
    await selectSinglePicklist(page, 'State', 'Want to Try');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Cancel alignment recipe' })).toBeVisible();
    await page.getByRole('link', { name: 'Edit' }).click();

    await expect(page.locator('.recipe-name-field > span')).toHaveCSS('font-weight', '400');
    await expect(page.locator('.recipe-single-picklist > span:first-child').first()).toHaveCSS(
      'font-weight',
      '400',
    );
    await expect(
      page.locator('.recipe-classification-fields > fieldset > legend').first(),
    ).toHaveCSS('font-weight', '400');

    const cancelLink = page.getByRole('link', { name: 'Cancel', exact: true });
    const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
    const saveRecipeButton = page.getByRole('button', { name: 'Save recipe' });
    const saveRow = page.locator('.recipe-form-save-row');
    const [
      cancelBounds,
      deleteBounds,
      saveBounds,
      saveRowBounds,
      classificationBounds,
      cuisineBounds,
      foodTypeBounds,
      mealTypeBounds,
    ] = await Promise.all([
      cancelLink.boundingBox(),
      deleteButton.boundingBox(),
      saveRecipeButton.boundingBox(),
      saveRow.boundingBox(),
      page.locator('.recipe-classification-fields').boundingBox(),
      page.getByRole('button', { name: 'Cuisine: Select' }).boundingBox(),
      page.locator('.recipe-classification-fields .recipe-picklist-trigger').nth(0).boundingBox(),
      page.locator('.recipe-classification-fields .recipe-picklist-trigger').nth(1).boundingBox(),
    ]);
    expect(cancelBounds).not.toBeNull();
    expect(deleteBounds).not.toBeNull();
    expect(saveBounds).not.toBeNull();
    expect(saveRowBounds).not.toBeNull();
    expect(classificationBounds).not.toBeNull();
    expect(cuisineBounds).not.toBeNull();
    expect(foodTypeBounds).not.toBeNull();
    expect(mealTypeBounds).not.toBeNull();
    expect(
      (mealTypeBounds?.x ?? 0) - ((foodTypeBounds?.x ?? 0) + (foodTypeBounds?.width ?? 0)),
    ).toBeCloseTo(8, 0);
    expect((mealTypeBounds?.x ?? 0) + (mealTypeBounds?.width ?? 0)).toBeCloseTo(
      (saveBounds?.x ?? 0) + (saveBounds?.width ?? 0),
      1,
    );
    expect(
      Math.abs(
        (saveBounds?.x ?? 0) +
          (saveBounds?.width ?? 0) -
          ((classificationBounds?.x ?? 0) + (classificationBounds?.width ?? 0)),
      ),
    ).toBeLessThanOrEqual(1);
    expect((saveBounds?.y ?? 0) + (saveBounds?.height ?? 0)).toBeCloseTo(
      (cuisineBounds?.y ?? 0) + (cuisineBounds?.height ?? 0),
      1,
    );
    expect(saveBounds?.y).toBeLessThan(cancelBounds?.y ?? 0);
    expect(deleteBounds?.width).toBe(cancelBounds?.width);
    expect(deleteBounds?.height).toBe(cancelBounds?.height);
    await expect(cancelLink).toHaveCSS('text-align', 'center');
    await expect(cancelLink).toHaveCSS('justify-content', 'center');
    await expect(deleteButton).toHaveCSS('border-color', 'rgb(180, 62, 50)');
    await deleteButton.hover();
    await expect(deleteButton).toHaveCSS('background-color', 'rgb(180, 62, 50)');
    await expect(deleteButton).toHaveCSS('color', 'rgb(255, 255, 255)');

    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopSaveBounds = await saveRecipeButton.boundingBox();
    const desktopSaveRowBounds = await page.locator('.recipe-form-save-row').boundingBox();
    const desktopClassificationBounds = await page
      .locator('.recipe-classification-fields')
      .boundingBox();
    const desktopCuisineBounds = await page
      .getByRole('button', { name: 'Cuisine: Select' })
      .boundingBox();
    expect(desktopSaveBounds).not.toBeNull();
    expect(desktopSaveRowBounds).not.toBeNull();
    expect(desktopClassificationBounds).not.toBeNull();
    expect(desktopCuisineBounds).not.toBeNull();
    expect(
      Math.abs(
        (desktopSaveBounds?.x ?? 0) +
          (desktopSaveBounds?.width ?? 0) -
          ((desktopSaveRowBounds?.x ?? 0) + (desktopSaveRowBounds?.width ?? 0)),
      ),
    ).toBeLessThanOrEqual(1);
    expect((desktopSaveBounds?.y ?? 0) + (desktopSaveBounds?.height ?? 0)).toBeCloseTo(
      (desktopCuisineBounds?.y ?? 0) + (desktopCuisineBounds?.height ?? 0),
      1,
    );
    expect((desktopSaveRowBounds?.x ?? 0) + (desktopSaveRowBounds?.width ?? 0)).toBeCloseTo(
      (desktopClassificationBounds?.x ?? 0) + (desktopClassificationBounds?.width ?? 0),
      1,
    );
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners can mark instruction durations with typed delimiters @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Lemon lentils');
    await expect(page.getByRole('button', { name: 'Mark duration' })).toHaveCount(0);
    const instruction = page.getByPlaceholder('Add instruction…');
    await instruction.fill("Simmer for =10 minutes= at F!400 until it's !medium high!!");
    const step = page.getByRole('textbox', { name: 'Instruction step 1' });
    await expect(step).toHaveValue("Simmer for =10 minutes= at F!400 until it's !medium high!!");
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Lemon lentils' })).toBeVisible();
    await expect(page.locator('.recipe-instruction-duration > span')).toHaveText('10 minutes');
    const temperatureText = page.locator('.recipe-instruction-temperature > span').first();
    const stoveHeatText = page.locator('.recipe-instruction-temperature > span').nth(1);
    await expect(temperatureText).toHaveText('400°F');
    await expect(stoveHeatText).toHaveText('medium high');
    await expect(page.locator('.recipe-instruction-list')).toContainText("until it's medium high!");
    const recipeId = new URL(page.url()).pathname.split('/').at(-1);
    if (!recipeId) {
      throw new Error('The saved recipe URL must include its ID.');
    }

    await page.emulateMedia({ media: 'print' });
    const durationText = page.locator('.recipe-instruction-duration > span');
    await expect(durationText).toHaveCSS('color', 'rgb(159, 82, 0)');

    await page.emulateMedia({ media: 'screen' });
    await page.goto('/settings');
    await selectSinglePicklist(page, 'Temperature', 'Celsius');
    await expect(page.getByRole('status')).toHaveText('Saved.');
    const omitPrintColors = page.getByLabel('Omit instruction emphasis when printing');
    await omitPrintColors.check();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    const savedTemperatureAfterPrintPreference = await request.get(
      `${config.apiUrl}/rest/v1/accounts?select=temperature_system&id=eq.${user.id}`,
      { headers },
    );
    expect(await savedTemperatureAfterPrintPreference.json()).toEqual([
      { temperature_system: 'celsius' },
    ]);
    await page.goto(`/recipes/${recipeId}/edit`);
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      "Simmer for =10 minutes= at F!400 until it's !medium high!!",
    );
    await page.goto(`/recipes/${recipeId}`);
    await expect(temperatureText).toHaveText('205°C');
    await expect(stoveHeatText).toHaveText('medium high');
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.recipes-main')).toHaveClass(/no-print-emphasis-colors/);
    await expect(temperatureText).toHaveText('205°C');
    await expect(stoveHeatText).toHaveText('medium high');
    const colors = await durationText.evaluate((element) => ({
      text: getComputedStyle(element).color,
      parent: getComputedStyle(element.parentElement!).color,
    }));
    expect(colors.text).toBe(colors.parent);

    await page.emulateMedia({ media: 'screen' });
    await page.goto('/settings');
    await page.getByRole('checkbox', { name: 'Turn off all emphasis' }).check();
    await expect(page.getByRole('status')).toHaveText('All instruction emphasis turned off.');
    await page.goto(`/recipes/${recipeId}`);
    const uncoloredEmphasis = page.locator(
      '.recipe-instruction-temperature, .recipe-instruction-duration',
    );
    await expect(uncoloredEmphasis).toHaveCount(3);
    const neutralStyles = await uncoloredEmphasis.evaluateAll((elements) =>
      elements.map((element) => {
        const parent = element.parentElement;
        return {
          color: getComputedStyle(element).color,
          fontWeight: getComputedStyle(element).fontWeight,
          parentColor: parent ? getComputedStyle(parent).color : null,
          parentFontWeight: parent ? getComputedStyle(parent).fontWeight : null,
          hasNoEmphasisClass: element.classList.contains('is-unemphasized'),
        };
      }),
    );
    expect(
      neutralStyles.every(
        ({ color, fontWeight, parentColor, parentFontWeight, hasNoEmphasisClass }) =>
          hasNoEmphasisClass && color === parentColor && fontWeight === parentFontWeight,
      ),
    ).toBe(true);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners can save and reload ordered Markdown instruction steps @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Braised chickpeas');
    await expect(page.getByRole('group', { name: 'Instructions' })).toBeVisible();
    const firstInstruction = page.getByRole('textbox', { name: 'Instruction step 1' });
    const initialHeight = (await firstInstruction.boundingBox())?.height ?? 0;
    await firstInstruction.fill(
      'Add the drained chickpeas and stir until each one is coated. '.repeat(8),
    );
    await expect
      .poll(() => firstInstruction.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(initialHeight);
    await firstInstruction.fill('Warm the oil and add **garlic**.');
    await expect(page.getByPlaceholder('Add instruction…')).toBeVisible();
    const instructionDraft = page.getByPlaceholder('Add instruction…');
    await instructionDraft.click();
    await instructionDraft.pressSequentially('Stir in chickpeas and simmer.');
    await expect(page.getByRole('textbox', { name: 'Instruction step 2' })).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    await page.getByRole('textbox', { name: 'Instruction step 2' }).press('Escape');
    await expect(instructionDraft).toBeVisible();
    await expect(page.locator('.recipe-instruction-edit-step')).toHaveCount(2);
    await instructionDraft.pressSequentially('Stir in chickpeas and simmer.');
    await expect(page.getByRole('textbox', { name: 'Instruction step 2' })).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    const typedInstructionBox = await page
      .getByRole('textbox', { name: 'Instruction step 2' })
      .boundingBox();
    expect(typedInstructionBox?.width).toBeGreaterThan(120);
    expect(typedInstructionBox?.height).toBeLessThan(100);
    await expect(page.locator('.recipe-instruction-edit-step')).toHaveCount(3);
    await page.getByRole('textbox', { name: 'Instruction step 2' }).press('Enter');
    const thirdInstruction = page.getByRole('textbox', { name: 'Instruction step 3' });
    await expect(thirdInstruction).toBeFocused();
    await thirdInstruction.pressSequentially('Finish with lemon.');
    await expect(thirdInstruction).toHaveValue('Finish with lemon.');
    await expect(page.locator('.recipe-instruction-edit-step')).toHaveCount(4);
    const fourthDraft = page.getByPlaceholder('Add instruction…');
    await fourthDraft.fill('Let everything rest.');
    await expect(page.getByRole('textbox', { name: 'Instruction step 4' })).toHaveValue(
      'Let everything rest.',
    );
    await expect(page.locator('.recipe-instruction-edit-step')).toHaveCount(5);
    const instructionRows = page.locator('.recipe-instruction-edit-step');
    const firstDragHandle = page.getByRole('button', { name: 'Reorder instruction step 1' });
    const firstDragHandleBox = await firstDragHandle.boundingBox();
    const firstStepId = await instructionRows.nth(0).getAttribute('data-instruction-step-id');
    const secondStepId = await instructionRows.nth(1).getAttribute('data-instruction-step-id');
    const firstStepTop = (await instructionRows.nth(0).boundingBox())?.y;
    const secondInstructionRowBox = await instructionRows.nth(1).boundingBox();
    if (!firstDragHandleBox || !secondInstructionRowBox) {
      throw new Error('Instruction rows are missing drag targets.');
    }
    if (!firstStepId || !secondStepId || firstStepTop === undefined) {
      throw new Error('Instruction rows must have stable IDs and positions.');
    }
    const stableFirstStep = page.locator(
      `.recipe-instruction-edit-step[data-instruction-step-id="${firstStepId}"]`,
    );
    const stableSecondStep = page.locator(
      `.recipe-instruction-edit-step[data-instruction-step-id="${secondStepId}"]`,
    );
    const idleInstructionA11y = await new AxeBuilder({ page })
      .include('.recipe-instruction-editor')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(idleInstructionA11y.violations).toEqual([]);
    await page.mouse.move(
      firstDragHandleBox.x + firstDragHandleBox.width / 2,
      firstDragHandleBox.y + firstDragHandleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      secondInstructionRowBox.x + secondInstructionRowBox.width / 2,
      secondInstructionRowBox.y + secondInstructionRowBox.height / 2,
      { steps: 4 },
    );
    await expect(page.locator('.recipe-instruction-edit-step').nth(0)).toHaveAttribute(
      'data-reorder-state',
      'dragging',
    );
    await expect
      .poll(() =>
        page
          .locator('.recipe-instruction-edit-step[data-reorder-state="dragging"]')
          .evaluate((row) => getComputedStyle(row).transform),
      )
      .not.toBe('none');
    await expect(page.locator('.recipe-instruction-edit-step').nth(1)).toHaveAttribute(
      'data-reorder-state',
      'displaced',
    );
    const draggingInstructionA11y = await new AxeBuilder({ page })
      .include('.recipe-instruction-editor')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(draggingInstructionA11y.violations).toEqual([]);
    await expect(
      page.locator('.recipe-instruction-edit-step[data-reorder-state="dragging"]'),
    ).toHaveCount(1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() =>
        page
          .locator('.recipe-instruction-edit-step[data-reorder-state="displaced"]')
          .evaluate((row) => getComputedStyle(row).transitionDuration),
      )
      .toBe('0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect
      .poll(async () => {
        const bounds = await stableSecondStep.boundingBox();
        return bounds ? Math.abs(bounds.y - firstStepTop) : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(2);
    const firstPreviewTop = (await stableFirstStep.boundingBox())?.y;
    const secondPreviewTop = (await stableSecondStep.boundingBox())?.y;
    expect(firstPreviewTop).toBeDefined();
    expect(secondPreviewTop).toBeDefined();
    await page.mouse.up();
    const firstReleasedTop = (await stableFirstStep.boundingBox())?.y;
    const secondReleasedTop = (await stableSecondStep.boundingBox())?.y;
    expect(firstReleasedTop).toBeDefined();
    expect(secondReleasedTop).toBeDefined();
    expect(Math.abs((firstReleasedTop ?? 0) - (firstPreviewTop ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.abs((secondReleasedTop ?? 0) - (secondPreviewTop ?? 0))).toBeLessThanOrEqual(2);
    await expect(stableFirstStep).toHaveCSS('transform', 'none');
    await expect(stableSecondStep).toHaveCSS('transform', 'none');
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    await expect(instructionRows.nth(0).locator('.recipe-instruction-step-number')).toHaveText('1');
    await expect(instructionRows.nth(0).getByRole('textbox')).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    await expect(instructionRows.nth(1).locator('.recipe-instruction-step-number')).toHaveText('2');
    await expect(instructionRows.nth(1).getByRole('textbox')).toHaveValue(
      'Warm the oil and add **garlic**.',
    );
    const droppedInstructionA11y = await new AxeBuilder({ page })
      .include('.recipe-instruction-editor')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(droppedInstructionA11y.violations).toEqual([]);
    await page.getByRole('textbox', { name: 'Instruction step 1' }).press('Control+ArrowDown');
    await expect(page.locator('.recipe-instruction-editor [aria-live="polite"]')).toHaveText(
      'Instruction step moved to position 2.',
    );
    await page.getByRole('textbox', { name: 'Instruction step 2' }).press('Control+ArrowUp');
    await expect(page.locator('.recipe-instruction-editor [aria-live="polite"]')).toHaveText(
      'Instruction step moved to position 1.',
    );
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    await expect(page.getByRole('textbox', { name: 'Instruction step 2' })).toHaveValue(
      'Warm the oil and add **garlic**.',
    );
    const dragInstructionAndCheckContinuity = async (sourceIndex: number, targetIndex: number) => {
      const sourceRow = instructionRows.nth(sourceIndex);
      const targetRow = instructionRows.nth(targetIndex);
      const sourceId = await sourceRow.getAttribute('data-instruction-step-id');
      const targetId = await targetRow.getAttribute('data-instruction-step-id');
      const sourceHandle = sourceRow.getByRole('button', {
        name: `Reorder instruction step ${sourceIndex + 1}`,
      });
      const handleBounds = await sourceHandle.boundingBox();
      const sourceBounds = await sourceRow.boundingBox();
      const targetBounds = await targetRow.boundingBox();
      if (!sourceId || !targetId || !handleBounds || !sourceBounds || !targetBounds) {
        throw new Error('Instruction rows must be visible for multi-row reordering.');
      }
      const stableSource = page.locator(
        `.recipe-instruction-edit-step[data-instruction-step-id="${sourceId}"]`,
      );
      const displacedIds =
        sourceIndex < targetIndex
          ? Array.from({ length: targetIndex - sourceIndex }, (_, index) => sourceIndex + index + 1)
          : Array.from({ length: sourceIndex - targetIndex }, (_, index) => targetIndex + index);
      const originalTops = new Map(
        await Promise.all(
          displacedIds.map(async (index) => {
            const row = instructionRows.nth(index);
            const id = await row.getAttribute('data-instruction-step-id');
            const bounds = await row.boundingBox();
            if (!id || !bounds) {
              throw new Error('Displaced instruction rows must have stable positions.');
            }
            return [id, bounds.y] as const;
          }),
        ),
      );
      await page.mouse.move(
        handleBounds.x + handleBounds.width / 2,
        handleBounds.y + handleBounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        targetBounds.x + targetBounds.width / 2,
        targetBounds.y + targetBounds.height / 2,
        { steps: 8 },
      );
      await expect(
        page.locator('.recipe-instruction-edit-step[data-reorder-state="displaced"]'),
      ).toHaveCount(Math.abs(targetIndex - sourceIndex));
      const expectedDisplacement = (sourceIndex < targetIndex ? -1 : 1) * sourceBounds.height;
      await expect
        .poll(async () => {
          const differences = await Promise.all(
            Array.from(originalTops, async ([id, top]) => {
              const bounds = await page
                .locator(`.recipe-instruction-edit-step[data-instruction-step-id="${id}"]`)
                .boundingBox();
              return bounds
                ? Math.abs(bounds.y - top - expectedDisplacement)
                : Number.POSITIVE_INFINITY;
            }),
          );
          return Math.max(...differences);
        })
        .toBeLessThanOrEqual(2);
      const previewTops = new Map(
        await Promise.all(
          Array.from(originalTops.keys(), async (id) => {
            const bounds = await page
              .locator(`.recipe-instruction-edit-step[data-instruction-step-id="${id}"]`)
              .boundingBox();
            if (!bounds) {
              throw new Error('Displaced instruction rows must remain visible while dragging.');
            }
            return [id, bounds.y] as const;
          }),
        ),
      );
      const sourcePreviewTop = (await stableSource.boundingBox())?.y;
      expect(sourcePreviewTop).toBeDefined();
      await page.mouse.up();
      const sourceReleasedTop = (await stableSource.boundingBox())?.y;
      expect(sourceReleasedTop).toBeDefined();
      expect(Math.abs((sourceReleasedTop ?? 0) - (sourcePreviewTop ?? 0))).toBeLessThanOrEqual(2);
      for (const [id, previewTop] of previewTops) {
        const releasedTop = (
          await page
            .locator(`.recipe-instruction-edit-step[data-instruction-step-id="${id}"]`)
            .boundingBox()
        )?.y;
        expect(releasedTop).toBeDefined();
        expect(Math.abs((releasedTop ?? 0) - previewTop)).toBeLessThanOrEqual(2);
      }
      await expect(stableSource).toHaveCSS('transform', 'none');
      for (const id of previewTops.keys()) {
        const displaced = page.locator(
          `.recipe-instruction-edit-step[data-instruction-step-id="${id}"]`,
        );
        await expect(displaced).toHaveCSS('transform', 'none');
      }
    };

    await dragInstructionAndCheckContinuity(3, 0);
    await dragInstructionAndCheckContinuity(0, 3);
    const firstStepBeforeCancel = await instructionRows.nth(0).getByRole('textbox').inputValue();
    const cancelHandle = await page
      .getByRole('button', { name: 'Reorder instruction step 1' })
      .boundingBox();
    const cancelTarget = await instructionRows.nth(2).boundingBox();
    if (!cancelHandle || !cancelTarget) {
      throw new Error('Instruction rows must be visible for cancellation.');
    }
    await page.mouse.move(
      cancelHandle.x + cancelHandle.width / 2,
      cancelHandle.y + cancelHandle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cancelTarget.x + cancelTarget.width / 2,
      cancelTarget.y + cancelTarget.height / 2,
      { steps: 4 },
    );
    await expect(
      page.locator('.recipe-instruction-edit-step[data-reorder-state="displaced"]'),
    ).toHaveCount(2);
    await page
      .getByRole('button', { name: 'Reorder instruction step 1' })
      .dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
    await page.mouse.up();
    await expect(page.locator('.recipe-instruction-edit-step[data-reorder-state]')).toHaveCount(0);
    await expect(instructionRows.nth(0).getByRole('textbox')).toHaveValue(firstStepBeforeCancel);
    const escapeDragHandle = page.getByRole('button', { name: 'Reorder instruction step 1' });
    const escapeHandle = await escapeDragHandle.boundingBox();
    const escapeTarget = await instructionRows.nth(2).boundingBox();
    if (!escapeHandle || !escapeTarget) {
      throw new Error('Instruction rows must be visible for Escape cancellation.');
    }
    await escapeDragHandle.focus();
    await page.mouse.move(
      escapeHandle.x + escapeHandle.width / 2,
      escapeHandle.y + escapeHandle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      escapeTarget.x + escapeTarget.width / 2,
      escapeTarget.y + escapeTarget.height / 2,
      { steps: 4 },
    );
    await escapeDragHandle.press('Escape');
    await expect(page.locator('.recipe-instruction-edit-step[data-reorder-state]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reorder instruction step 1' })).toBeFocused();
    await page.mouse.up();
    await expect(instructionRows.nth(0).getByRole('textbox')).toHaveValue(firstStepBeforeCancel);
    const thirdInstructionRow = page
      .locator('.recipe-instruction-edit-step')
      .filter({ has: page.getByRole('textbox', { name: 'Instruction step 3' }) });
    const removeThirdInstruction = page.getByRole('button', {
      name: 'Remove instruction step 3',
    });
    await page.mouse.move(0, 0);
    await expect(removeThirdInstruction).toHaveCSS(
      'opacity',
      testInfo.project.name === 'Fold 6' ? '1' : '0',
    );
    await thirdInstructionRow.hover();
    await expect(removeThirdInstruction).toHaveCSS('opacity', '1');
    await removeThirdInstruction.click();
    await page.getByPlaceholder('Add instruction…').fill('Finish with lemon.');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible();
    const steps = page.locator('.recipe-instruction-list > li');
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toHaveText('Stir in chickpeas and simmer.');
    await expect(steps.nth(1)).toContainText('Warm the oil and add garlic.');
    await expect(steps.nth(1).locator('strong')).toHaveText('garlic');
    await expect(steps.nth(2)).toHaveText('Let everything rest.');
    await expect(steps.nth(3)).toHaveText('Finish with lemon.');

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Stir in chickpeas and simmer.',
    );
    await expect(page.getByRole('textbox', { name: 'Instruction step 2' })).toHaveValue(
      'Warm the oil and add **garlic**.',
    );
    await expect(page.getByRole('textbox', { name: 'Instruction step 3' })).toHaveValue(
      'Let everything rest.',
    );
    await expect(page.getByRole('textbox', { name: 'Instruction step 4' })).toHaveValue(
      'Finish with lemon.',
    );
    const persistedFirstInstruction = page.getByRole('textbox', {
      name: 'Instruction step 1',
    });
    await persistedFirstInstruction.fill('Discard this accidental change.');
    await persistedFirstInstruction.press('Escape');
    await expect(persistedFirstInstruction).toHaveValue('Stir in chickpeas and simmer.');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners can create an ingredient mention from an instruction # query @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Iron skillet vegetables');
    const instruction = page.getByPlaceholder('Add instruction…');
    await instruction.pressSequentially('## Heat\n\nAdd #iron');
    const suggestions = page.getByRole('listbox', { name: 'Ingredient suggestions' });
    await expect(suggestions).toBeVisible();
    await expect(suggestions.getByRole('option')).toHaveText('Create ingredient “iron”');
    const focusedInstruction = page.locator('.recipe-instruction-textarea:focus');
    await page.keyboard.press('Enter');
    await expect(focusedInstruction).toHaveValue('Add #iron');
    await focusedInstruction.fill(
      `${await focusedInstruction.inputValue()} with **care**.\n\n- Stir gently`,
    );
    await expect(page.getByRole('table', { name: 'Recipe ingredients' })).toContainText('iron');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible();
    await expect(
      page.locator('.recipe-instruction-list > li').first().getByRole('heading', { name: 'Heat' }),
    ).toBeVisible();
    const renderedMentionInstruction = page
      .locator('.recipe-instruction-list > li')
      .filter({ has: page.locator('.recipe-instruction-mention') });
    await expect(renderedMentionInstruction.locator('.recipe-instruction-mention')).toHaveText(
      'iron',
    );
    await expect(renderedMentionInstruction.locator('strong')).toHaveText('care');
    await expect(renderedMentionInstruction.locator('ul > li')).toHaveText('Stir gently');
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeVisible();
    await expect(page.locator('.recipe-ingredient-list, .recipe-ingredient-table')).toContainText(
      'iron',
    );
    const ironMention = page.getByRole('button', { name: 'iron', exact: true });
    await ironMention.focus();
    await expect(page.getByRole('tooltip')).toHaveText('No amount listed');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden();
    await expect(ironMention).toBeFocused();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('divided ingredient suggestions insert stable references to each portion @e2e @instructions', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Divided ingredient references');

    let rowId: string | null;
    if ((page.viewportSize()?.width ?? 1280) <= 900) {
      const mobileGrid = page.getByRole('table', {
        name: 'Recipe ingredients on mobile',
        exact: true,
      });
      await mobileGrid.getByRole('button', { name: 'Enter ingredient' }).click();
      const editor = page.getByRole('dialog', { name: 'Ingredient details' });
      const carrot = editor.getByRole('combobox', { name: 'Ingredient', exact: true });
      await carrot.fill('Carrot');
      await page.getByRole('option', { name: 'Add "Carrot"', exact: true }).click();
      await editor.getByRole('combobox', { name: 'Ingredient type, row 1' }).click();
      await page.getByRole('option', { name: 'Count', exact: true }).click();
      await editor.getByRole('textbox', { name: 'Count amount, row 1' }).fill('4');

      const preparation = editor.getByRole('combobox', { name: 'Preparation', exact: true });
      await preparation.fill('divided');
      await page.getByRole('option', { name: 'divided', exact: true }).click();
      await editor.getByRole('textbox', { name: 'First portion, row 1' }).fill('1');
      await editor.getByRole('button', { name: 'Submit' }).click();
      rowId = await mobileGrid
        .locator('.recipe-ingredient-mobile-row')
        .filter({ hasText: 'Carrot' })
        .getAttribute('data-row-id');
    } else {
      const grid = page.getByRole('table', { name: 'Recipe ingredients', exact: true });
      await grid.getByRole('cell', { name: 'Add ingredient row' }).click();
      const carrot = page.getByRole('combobox', { name: 'Ingredient, row 1' });
      await carrot.fill('Carrot');
      await carrot.press('Enter');
      await carrot.press('Enter');
      await page.getByRole('combobox', { name: 'Ingredient type, row 1' }).click();
      await page.getByRole('option', { name: 'Count', exact: true }).click();
      await page.getByRole('textbox', { name: 'Count amount, row 1' }).fill('4');

      await grid.getByRole('cell', { name: 'Preparation, row 1' }).click();
      const preparation = page.getByRole('combobox', { name: 'Preparation, row 1' });
      await preparation.fill('divided');
      await page.getByRole('option', { name: 'divided', exact: true }).click();
      await preparation.press('Enter');
      await page.getByRole('textbox', { name: 'First portion, row 1' }).fill('1');

      rowId = await grid
        .locator('tbody tr[data-row-id]')
        .filter({ hasText: 'Carrot' })
        .getAttribute('data-row-id');
    }
    expect(rowId).toBeTruthy();

    const instructionInput = page.getByPlaceholder('Add instruction…');
    await instructionInput.pressSequentially('Use #');
    const instruction = page.getByRole('textbox', { name: 'Instruction step 1' });
    const suggestions = page.getByRole('listbox', { name: 'Ingredient suggestions' });
    const options = suggestions.getByRole('option');
    await expect(options).toHaveCount(2);
    const optionLabels = await options.allTextContents();
    expect(optionLabels[0]).not.toBe(optionLabels[1]);
    expect(optionLabels.every((label) => !label.includes('Main'))).toBe(true);
    await options.nth(0).click();
    await expect(instruction).toHaveValue('Use #carrot-main-1');

    await instruction.pressSequentially(' and #');
    await expect(options).toHaveCount(2);
    await options.nth(1).click();
    await expect(instruction).toHaveValue('Use #carrot-main-1 and #carrot-main-2');

    await page.getByRole('button', { name: 'Save recipe' }).click();
    const renderedInstruction = page.locator('.recipe-instruction-list > li').first();
    await expect(renderedInstruction).toHaveText('Use carrot and carrot');
    await expect(renderedInstruction.getByRole('button', { name: 'carrot' })).toHaveCount(2);
    const recipeId = new URL(page.url()).pathname.match(/^\/recipes\/([^/]+)$/)?.[1];
    expect(recipeId).toBeTruthy();
    const mentionsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_step_mentions?select=recipe_ingredient_id,portion_ordinal&recipe_id=eq.${recipeId}&order=position.asc`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    );
    expect(mentionsResponse.ok(), await mentionsResponse.text()).toBe(true);
    expect(await mentionsResponse.json()).toEqual([
      { recipe_ingredient_id: rowId, portion_ordinal: 1 },
      { recipe_ingredient_id: rowId, portion_ordinal: 2 },
    ]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('instruction mentions search the ingredient catalog and render as sentence-aware links @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const catalogIngredient = await request.post(`${config.apiUrl}/rest/v1/ingredients`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      data: { account_id: user.id, name: 'Bread' },
    });
    expect(catalogIngredient.ok(), await catalogIngredient.text()).toBeTruthy();

    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Catalog mention behavior');
    await page.getByPlaceholder('Add instruction…').fill('#');
    const firstStep = page.getByRole('textbox', { name: 'Instruction step 1' });
    const suggestions = page.getByRole('listbox', { name: 'Ingredient suggestions' });
    await expect(suggestions).toHaveCount(0);
    await firstStep.fill('bread');
    await firstStep.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 0));
    await firstStep.pressSequentially('#');
    await expect(firstStep).toHaveValue('#bread');
    await expect(suggestions.getByRole('option')).toHaveText('Bread');
    await expect(suggestions.getByRole('option', { name: /^Create ingredient/ })).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(firstStep).toHaveValue('#bread');

    await firstStep.fill('Add #bread');
    await expect(suggestions.getByRole('option')).toHaveText('Bread');
    await expect(suggestions.getByRole('option', { name: /^Create ingredient/ })).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(firstStep).toHaveValue('Add #bread-main');
    await firstStep.pressSequentially(' with [the mixing guide](example.test/mixing).');

    await firstStep.press('Enter');
    await page.getByRole('textbox', { name: 'Instruction step 2' }).fill('#');
    const secondStep = page.getByRole('textbox', { name: 'Instruction step 2' });
    await expect(suggestions.getByRole('option')).toHaveText('Bread');
    await expect(suggestions.getByRole('option', { name: /^Create ingredient/ })).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(secondStep).toHaveValue('#bread-main');

    await secondStep.press('Enter');
    const thirdStep = page.getByRole('textbox', { name: 'Instruction step 3' });
    await thirdStep.fill('Add #miso');
    await expect(
      suggestions.getByRole('option', { name: 'Create ingredient “miso”' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(thirdStep).toHaveValue('Add #miso');

    await page.getByRole('button', { name: 'Save recipe' }).click();
    const steps = page.locator('.recipe-instruction-list > li');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toContainText('Add bread with the mixing guide.');
    const guideLink = steps.nth(0).getByRole('link', { name: 'the mixing guide' });
    await expect(guideLink).toHaveAttribute('href', 'https://example.test/mixing');
    await expect(guideLink).toHaveCSS('color', 'rgb(23, 74, 120)');
    await guideLink.hover();
    await expect(guideLink).toHaveCSS('text-decoration-line', 'underline');
    await expect(steps.nth(1)).toHaveText('Bread');
    await expect(steps.nth(2)).toHaveText('Add #miso');

    await page.route('https://example.test/mixing', (route) =>
      route.fulfill({ body: '<title>External guide</title>', contentType: 'text/html' }),
    );
    await guideLink.click();
    await expect(page).toHaveURL('https://example.test/mixing');
    await expect(page).toHaveTitle('External guide');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('multi-word instruction mentions replace the full phrase and use sentence case @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const catalogIngredient = await request.post(`${config.apiUrl}/rest/v1/ingredients`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      data: { account_id: user.id, name: 'Garlic Cloves' },
    });
    expect(catalogIngredient.ok(), await catalogIngredient.text()).toBeTruthy();

    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Multi-word mention behavior');
    await page.getByPlaceholder('Add instruction…').fill('Add garlic cloves before serving.');
    const instruction = page.getByRole('textbox', { name: 'Instruction step 1' });
    await instruction.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(4, 4));
    await instruction.pressSequentially('#');
    const suggestions = page.getByRole('listbox', { name: 'Ingredient suggestions' });
    await expect(suggestions.getByRole('option', { name: 'Garlic Cloves' })).toBeVisible();
    await suggestions.getByRole('option', { name: 'Garlic Cloves' }).click();
    await expect(instruction).toHaveValue('Add #garlic-cloves before serving.');

    await page.getByRole('button', { name: 'Save recipe' }).click();
    const renderedInstruction = page.locator('.recipe-instruction-list > li').first();
    await expect(renderedInstruction).toHaveText('Add garlic cloves before serving.');
    await expect(renderedInstruction.getByRole('button', { name: 'garlic cloves' })).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('mobile users can tap an instruction ingredient suggestion @e2e', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'Fold 6',
    'Touch selection is exercised in the Fold 6 project.',
  );

  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const catalogIngredient = await request.post(`${config.apiUrl}/rest/v1/ingredients`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      data: { account_id: user.id, name: 'Paprika' },
    });
    expect(catalogIngredient.ok(), await catalogIngredient.text()).toBeTruthy();

    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Touch-selected ingredient');
    const instruction = page.getByPlaceholder('Add instruction…');
    await instruction.tap();
    await instruction.pressSequentially('Add #paprika');

    const suggestion = page.getByRole('option', { name: 'Paprika' });
    await expect(suggestion).toBeVisible();
    await suggestion.tap();
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Add #paprika',
    );
    await expect(page.getByRole('table', { name: 'Recipe ingredients' })).toContainText('paprika');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Ctrl+. inserts a degree symbol at the instruction caret @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Oven temperature');
    await page.getByPlaceholder('Add instruction…').fill('Bake at 350F.');
    const instruction = page.getByRole('textbox', { name: 'Instruction step 1' });
    await instruction.evaluate((element: HTMLTextAreaElement) => {
      const insertionPoint = element.value.indexOf('F');
      element.setSelectionRange(insertionPoint, insertionPoint);
    });
    await instruction.press('Control+.');
    await expect(instruction).toHaveValue('Bake at 350°F.');

    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.locator('.recipe-instruction-list > li')).toHaveText('Bake at 350°F.');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('instruction mention suggestions stay in the viewport and Escape preserves literal text @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Responsive mention suggestions');
    await page.setViewportSize({ width: 352, height: 844 });
    const instruction = page.getByPlaceholder('Add instruction…');
    await instruction.pressSequentially('Add #iron');
    const suggestions = page.getByRole('listbox', { name: 'Ingredient suggestions' });
    await expect(suggestions).toBeVisible();

    for (const viewportWidth of [352, 390]) {
      if (viewportWidth === 390) {
        await page.keyboard.press('Escape');
        await page.reload();
        await page.getByLabel('Name').fill('Responsive mention suggestions');
        await page.setViewportSize({ width: viewportWidth, height: 844 });
        await page.getByPlaceholder('Add instruction…').pressSequentially('Add #iron');
        await expect(suggestions).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewportWidth,
      );
      const suggestionBounds = await suggestions.boundingBox();
      expect(suggestionBounds?.x).toBeGreaterThanOrEqual(0);
      expect((suggestionBounds?.x ?? 0) + (suggestionBounds?.width ?? 0)).toBeLessThanOrEqual(
        viewportWidth,
      );
    }

    await page.keyboard.press('Escape');
    await expect(suggestions).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Add #iron',
    );
    await expect(page.getByRole('table', { name: 'Recipe ingredients' })).not.toContainText('iron');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners confirm before removing an ingredient referenced by instructions @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('Linked ingredient removal');
    await page.getByPlaceholder('Add instruction…').pressSequentially('Heat #iron');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await page.getByRole('link', { name: 'Edit' }).click();

    const ingredientGrid = page.getByRole('table', { name: 'Recipe ingredients' });
    const deleteIngredient = page.getByRole('button', { name: 'Delete ingredient row 1' });
    await ingredientGrid.getByRole('row').nth(1).hover();
    await deleteIngredient.click();
    const confirmation = page.getByRole('dialog', { name: 'Remove ingredient?' });
    await expect(confirmation).toContainText('ordinary # text');
    const dialogA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(dialogA11y.violations).toEqual([]);
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(deleteIngredient).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Heat #iron',
    );
    await expect(ingredientGrid).toContainText(/iron/i);

    await deleteIngredient.click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(ingredientGrid).toContainText(/iron/i);

    await ingredientGrid.getByRole('row').nth(1).hover();
    await deleteIngredient.click();
    await confirmation.getByRole('button', { name: 'Remove ingredient' }).click();
    await expect(ingredientGrid).not.toContainText(/iron/i);
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      'Heat #iron',
    );
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.locator('.recipe-instruction-list > li')).toHaveText('Heat #iron');
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('trashing a publication recipe returns to its publication @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Library' }).click();
    await page.getByRole('link', { name: 'Add publication' }).click();
    await page.getByRole('radio', { name: 'Book' }).check();
    await page.getByLabel('Name').fill('Publication to keep open');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Publication to keep open' })).toBeVisible();
    const publicationId = new URL(page.url()).pathname.split('/').at(-1);
    if (!publicationId) {
      throw new Error('The publication URL must include its ID.');
    }

    await page.getByRole('link', { name: 'Add Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Add Recipe' })).toBeVisible();
    await page.locator('.recipe-form').getByLabel('Name').fill('Recipe to trash from publication');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(
      page.getByRole('heading', { name: 'Recipe to trash from publication' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Move recipe to Trash?' })
      .getByRole('button', { name: 'Move to Trash' })
      .click();

    await expect(page).toHaveURL(`/publications/${publicationId}?status=trashed`);
    await expect(page.getByRole('heading', { name: 'Publication to keep open' })).toBeVisible();
    await expect(page.locator('.recipe-status-message')).toContainText('Recipe moved to Trash.');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners can move a recipe to Trash and restore it @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Recipe Tin' }).click();
    await page.getByRole('link', { name: 'Add Recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Add Recipe' })).toBeVisible();
    await page.getByLabel('Name').fill('A recipe to restore');
    await page.getByLabel('Notes (Markdown)').fill('Keep these notes after restoration.');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'A recipe to restore' })).toBeVisible();
    const recipeId = new URL(page.url()).pathname.split('/').at(-1);
    if (!recipeId) {
      throw new Error('The saved recipe route must include its stable ID.');
    }

    const deleteRecipe = page.getByRole('button', { name: 'Delete', exact: true });
    await expect(page.getByRole('button', { name: 'Delete recipe' })).toHaveCount(0);
    const detailA11y = await new AxeBuilder({ page }).analyze();
    expect(detailA11y.violations).toEqual([]);
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();
    await expect(deleteRecipe).toBeVisible({ timeout: 1_000 });
    const backToView = page.getByRole('link', { name: 'Back to view' });
    await expect(backToView.locator('svg')).toBeVisible();
    await expect(backToView).toHaveAttribute('title', 'Back to view');
    const editHeadingBounds = await page.locator('.recipe-edit-heading').boundingBox();
    const backToViewBounds = await backToView.boundingBox();
    const deleteBounds = await deleteRecipe.boundingBox();
    await expect(backToView).toHaveCSS('width', '48px');
    await expect(backToView).toHaveCSS('height', '48px');
    await expect(backToView.locator('svg')).toHaveAttribute('width', '24');
    expect(backToViewBounds?.x).toBeGreaterThan((editHeadingBounds?.x ?? 0) + 200);
    expect(deleteBounds?.y).toBeGreaterThanOrEqual(
      (editHeadingBounds?.y ?? 0) + (editHeadingBounds?.height ?? 0),
    );
    if (testInfo.project.name !== 'Fold 6') {
      await deleteRecipe.hover();
      await expect(deleteRecipe).toHaveCSS('background-color', 'rgb(180, 62, 50)');
      await expect(deleteRecipe).toHaveCSS('color', 'rgb(255, 255, 255)');
    }
    await deleteRecipe.click();
    const confirmation = page.getByRole('dialog', { name: 'Move recipe to Trash?' });
    await expect(confirmation).toContainText('30 days');
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
    const dialogA11y = await new AxeBuilder({ page }).analyze();
    expect(dialogA11y.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();

    await deleteRecipe.click();
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to view' }).click();
    await expect(page.getByRole('heading', { name: 'A recipe to restore' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Move recipe to Trash?' })
      .getByRole('button', { name: 'Move to Trash' })
      .click();
    await expect(page).toHaveURL(/\/publications\/[0-9a-f-]+\?status=trashed$/);
    await expect(page.locator('.recipe-status-message')).toContainText('Recipe moved to Trash');
    expect((await page.request.get(`/recipes/${recipeId}`)).status()).toBe(404);
    expect((await page.request.get(`/recipes/${recipeId}/edit`)).status()).toBe(404);
    await page.goto(`/recipes/${recipeId}`);
    await expect(page.getByRole('heading', { name: 'Recipe not found' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Recipes' }).click();
    await page.getByRole('link', { name: 'Trash', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();
    const trashedRow = page.getByRole('row', { name: /A recipe to restore/ });
    await expect(trashedRow).toBeVisible();
    await expect(trashedRow.locator('td').nth(1)).not.toBeEmpty();
    await expect(trashedRow.locator('td').nth(2)).not.toBeEmpty();
    const populatedTrashA11y = await new AxeBuilder({ page }).analyze();
    expect(populatedTrashA11y.violations).toEqual([]);

    const restoreButton = trashedRow.getByRole('button', { name: 'Restore A recipe to restore' });
    if (testInfo.project.name !== 'Fold 6') {
      await expect(restoreButton).toHaveCSS('opacity', '0');
      await trashedRow.hover();
      await expect(restoreButton).toHaveCSS('opacity', '1');
      await restoreButton.focus();
    }
    for (const width of [352, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await expect(restoreButton).toHaveCSS('opacity', '1');
    }
    if (testInfo.project.name === 'Fold 6') {
      const restoreBounds = await page
        .getByRole('button', { name: 'Restore A recipe to restore' })
        .boundingBox();
      expect(restoreBounds?.height).toBeGreaterThanOrEqual(48);
    }
    await page.getByRole('button', { name: 'Restore A recipe to restore' }).click();

    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'A recipe to restore' })).toBeVisible();
    await expect(page.getByText('Keep these notes after restoration.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Keep these notes after restoration.')).toBeVisible();
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();
    const editDeleteButton = page.getByRole('button', { name: 'Delete', exact: true });
    await expect(editDeleteButton).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(editDeleteButton).toHaveCSS('color', 'rgb(180, 62, 50)');
    await expect(editDeleteButton).toHaveCSS('border-radius', '3px');
    await expect(backToView).toBeVisible();
    await expect(page.getByLabel('Notes (Markdown)')).toHaveValue(
      'Keep these notes after restoration.',
    );
    await page.getByRole('link', { name: 'Back to view' }).click();
    await expect(page.getByRole('heading', { name: 'A recipe to restore' })).toBeVisible();
    await page.getByRole('link', { name: 'Recipe Tin', exact: true }).click();
    await expect(page.getByRole('link', { name: 'A recipe to restore' })).toBeVisible();
    await page.getByRole('link', { name: 'Trash', exact: true }).click();
    await expect(
      page.getByText('Trash is empty. Deleted recipes and publications appear here.'),
    ).toBeVisible();
    const emptyTrashA11y = await new AxeBuilder({ page }).analyze();
    expect(emptyTrashA11y.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('instruction mention popups follow reader scale and unit overrides @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const ingredientRowId = randomUUID();
  const sugarRowId = randomUUID();
  const ironRowId = randomUUID();
  const syrupRowId = randomUUID();
  const butterRowId = randomUUID();
  const stepId = randomUUID();

  try {
    await signIn(page, user.email, user.password);
    const phraseResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id,value&account_id=eq.${user.id}&category=eq.unmeasured_phrase`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    );
    expect(phraseResponse.ok(), await phraseResponse.text()).toBeTruthy();
    const phrases = (await phraseResponse.json()) as { id: string; value: string }[];
    const garnishPhraseId = phrases.find((phrase) => phrase.value === 'For garnish')?.id;
    expect(garnishPhraseId).toBeTruthy();
    const saved = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'Ingredient amount popup',
        p_food_type_id: null,
        p_state: 'want_to_try',
        p_verdict_id: null,
        p_enthusiasm_id: null,
        p_occasion_details: null,
        p_reason: null,
        p_serves: 4,
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
            recipe_ingredient_id: ingredientRowId,
            ingredient_id: null,
            ingredient_name: 'Flour',
            is_main: true,
            detail: '',
            preparation: '',
            measurements: [
              {
                measurement_type: 'volume',
                amount_min: 1.5,
                amount_max: null,
                unit_code: 'cup',
                picklist_value_id: null,
              },
            ],
          },
          {
            recipe_ingredient_id: sugarRowId,
            ingredient_id: null,
            ingredient_name: 'Sugar',
            is_main: false,
            detail: '',
            preparation: '',
            measurements: [
              {
                measurement_type: 'volume',
                amount_min: 0.625,
                amount_max: null,
                unit_code: 'cup',
                picklist_value_id: null,
              },
            ],
          },
          {
            recipe_ingredient_id: ironRowId,
            ingredient_id: null,
            ingredient_name: 'Iron',
            is_main: false,
            detail: '',
            preparation: '',
            measurements: [
              {
                measurement_type: 'unmeasured',
                amount_min: null,
                amount_max: null,
                unit_code: null,
                picklist_value_id: garnishPhraseId,
              },
            ],
          },
          {
            recipe_ingredient_id: syrupRowId,
            ingredient_id: null,
            ingredient_name: 'Syrup',
            is_main: false,
            detail: '',
            preparation: '',
            measurements: [
              {
                measurement_type: 'volume',
                amount_min: 1 / 8,
                amount_max: null,
                unit_code: 'gal',
                picklist_value_id: null,
              },
            ],
          },
          {
            recipe_ingredient_id: butterRowId,
            ingredient_id: null,
            ingredient_name: 'Butter',
            is_main: false,
            detail: '',
            preparation: '',
            measurements: [
              {
                measurement_type: 'volume',
                amount_min: 1 / 16,
                amount_max: null,
                unit_code: 'cup',
                picklist_value_id: null,
              },
            ],
          },
        ],
        p_instruction_steps: [
          {
            id: stepId,
            position: 0,
            content_markdown: `Mix [[ingredient:${ingredientRowId}|flour]], [[ingredient:${sugarRowId}|sugar]], and [[ingredient:${ironRowId}|iron]].`,
            plain_text: 'Mix flour, sugar, and iron.',
          },
        ],
      },
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();

    const recipeId = (await saved.json())[0].id as string;
    await page.goto(`/recipes/${recipeId}`);
    const rowHalfGlyph = page.locator(
      '.recipe-ingredient-table .recipe-fraction-glyph[data-fraction="½"]:visible, .recipe-ingredient-list .recipe-fraction-glyph[data-fraction="½"]:visible',
    );
    await expect(rowHalfGlyph).toBeVisible();
    const readRowHalfOffset = () =>
      rowHalfGlyph.evaluate((element) => {
        const transform = getComputedStyle(element).transform;
        return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
      });
    await expect.poll(readRowHalfOffset).toBeGreaterThan(0);
    const rowFiveEighthGlyph = page.locator(
      '.recipe-ingredient-table .recipe-fraction-glyph[data-fraction="⅝"]:visible, .recipe-ingredient-list .recipe-fraction-glyph[data-fraction="⅝"]:visible',
    );
    await expect(rowFiveEighthGlyph).toBeVisible();
    const rowFiveEighthOffset = await rowFiveEighthGlyph.evaluate(
      (element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m42,
    );
    expect(rowFiveEighthOffset).toBeGreaterThan(-1);
    expect(rowFiveEighthOffset).toBeLessThan(0);
    const flourMention = page.getByRole('button', { name: 'flour', exact: true });
    const sugarMention = page.getByRole('button', { name: 'sugar', exact: true });
    const ironMention = page.getByRole('button', { name: 'iron', exact: true });
    const amountPopup = page.getByRole('tooltip');
    await flourMention.hover();
    await expect(amountPopup).toHaveText('1 ½ cups');
    await expect(amountPopup).toBeInViewport();
    await expect(amountPopup).toHaveAttribute('data-placement', 'above');
    const popupBounds = await amountPopup.boundingBox();
    const mentionBounds = await flourMention.boundingBox();
    expect(popupBounds && mentionBounds).not.toBeNull();
    if (popupBounds && mentionBounds) {
      expect(popupBounds.y + popupBounds.height).toBeLessThanOrEqual(mentionBounds.y);
    }
    const fractionSizing = await page
      .locator('.recipe-fraction-glyph')
      .first()
      .evaluate((element) => ({
        fraction: Number.parseFloat(getComputedStyle(element).fontSize),
        surrounding: Number.parseFloat(getComputedStyle(element.parentElement!).fontSize),
        verticalAlign: getComputedStyle(element).verticalAlign,
      }));
    expect(fractionSizing.fraction).toBeGreaterThan(fractionSizing.surrounding);
    expect(fractionSizing.verticalAlign).toBe('middle');
    const popupFraction = amountPopup.locator('.recipe-fraction-glyph');
    await expect(popupFraction).toHaveAttribute('data-fraction', '½');
    const popupFractionMetrics = await popupFraction.evaluate((element) => {
      const adjacentText = element.nextSibling;
      if (!adjacentText || adjacentText.nodeType !== Node.TEXT_NODE) {
        throw new Error('Expected amount text immediately after the fraction glyph.');
      }
      const textRange = document.createRange();
      textRange.selectNodeContents(adjacentText);
      const textBounds = textRange.getBoundingClientRect();
      const glyphBounds = element.getBoundingClientRect();
      return {
        fractionFontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        surroundingFontSize: Number.parseFloat(
          getComputedStyle(element.parentElement ?? element).fontSize,
        ),
        verticalAlign: getComputedStyle(element).verticalAlign,
        centerOffset:
          glyphBounds.top + glyphBounds.height / 2 - (textBounds.top + textBounds.height / 2),
        transformY: new DOMMatrixReadOnly(getComputedStyle(element).transform).m42,
      };
    });
    expect(popupFractionMetrics.fractionFontSize).toBeGreaterThan(
      popupFractionMetrics.surroundingFontSize,
    );
    expect(popupFractionMetrics.verticalAlign).toBe('middle');
    expect(Math.abs(popupFractionMetrics.centerOffset)).toBeLessThanOrEqual(0.5);
    expect(popupFractionMetrics.transformY).toBeCloseTo(-0.75, 1);
    await sugarMention.hover();
    await expect(amountPopup).toHaveText('⅝ cup');
    const popupFiveEighthOffset = await amountPopup
      .locator('.recipe-fraction-glyph[data-fraction="⅝"]')
      .evaluate((element) => {
        return new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;
      });
    expect(popupFiveEighthOffset).toBeLessThan(-1.5);
    await ironMention.hover();
    await expect(amountPopup).toHaveText('for garnish');
    await expect(amountPopup).toHaveCSS('border-radius', '0px');
    await expect(amountPopup.getByRole('button')).toHaveCount(0);
    await expect(amountPopup.getByRole('tooltip')).toHaveCount(0);
    const popupA11y = await new AxeBuilder({ page }).analyze();
    expect(popupA11y.violations).toEqual([]);

    await page.mouse.move(0, 0);
    await expect(amountPopup).toBeHidden();
    await flourMention.focus();
    await page.keyboard.press('Escape');
    await expect(amountPopup).toBeHidden();
    await expect(flourMention).toBeFocused();
    await flourMention.click();
    await expect(amountPopup).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(amountPopup).toBeVisible();
    await page.getByRole('heading', { name: 'Ingredients' }).click();
    await expect(amountPopup).toBeHidden();

    if (testInfo.project.name === 'Fold 6') {
      await flourMention.tap();
      await expect(amountPopup).toBeVisible();
      await expect(amountPopup).toBeInViewport();
      await flourMention.tap();
      await expect(amountPopup).toBeHidden();
    }

    await page.getByRole('button', { name: 'Scale recipe' }).click();
    const scalePane = page.getByRole('dialog', { name: 'Scale recipe' });
    await scalePane.getByLabel('To').fill('1');
    await scalePane.getByRole('button', { name: 'Submit' }).click();
    const quarterScaleIngredients = page.locator(
      '.recipe-ingredient-table tr, .recipe-ingredient-list li',
    );
    await expect(quarterScaleIngredients.filter({ hasText: 'Syrup' })).toContainText('½ cup');
    await expect(quarterScaleIngredients.filter({ hasText: 'Butter' })).toContainText('¾ tsp');
    await expect(quarterScaleIngredients.filter({ hasText: 'Butter' })).toBeVisible();

    await page.getByRole('button', { name: 'Scale recipe' }).click();
    await scalePane.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByText('Serves 4', { exact: true })).toBeVisible();
    await scalePane.getByLabel('To').fill('8');
    await scalePane.getByRole('button', { name: 'Submit' }).click();
    await flourMention.hover();
    await expect(amountPopup).toHaveText('3 cups');
    await page.mouse.move(0, 0);
    await page.getByRole('combobox', { name: 'Change Flour volume unit' }).click();
    await page.getByRole('option', { name: 'TBSP' }).click();
    await flourMention.hover();
    await expect(amountPopup).toHaveText('48 TBSP');
    const ingredientContent = page.locator('.recipe-ingredient-list, .recipe-ingredient-table');
    await expect(ingredientContent).toContainText('48 TBSP');
    await expect(ingredientContent).toContainText('flour');

    await page.emulateMedia({ media: 'print' });
    await expect(amountPopup).toBeHidden();
    await expect(page.locator('.recipe-instruction-mention')).toHaveText([
      'flour',
      'sugar',
      'iron',
    ]);
    await expect(ingredientContent).toContainText('48 TBSP');
    await expect(ingredientContent).toContainText('flour');
    await page.emulateMedia({ media: 'screen' });
    await page.getByRole('link', { name: 'Edit' }).click();
    if (testInfo.project.name === 'Fold 6') {
      await page.getByRole('button', { name: 'Edit 1 ½ cups flour' }).click();
    }
    const quantityInput = page.getByRole('textbox', { name: 'Volume amount, row 1' });
    await expect(quantityInput).toHaveValue('1 1/2');
    await quantityInput.fill('1 1/2');
    await quantityInput.press('Tab');
    await expect(quantityInput).toHaveValue('1 1/2');

    const storedMeasurement = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=amount_min,amount_max,unit_code&recipe_ingredient_id=eq.${ingredientRowId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${user.accessToken}` } },
    );
    expect(await storedMeasurement.json()).toEqual([
      { amount_min: 1.5, amount_max: null, unit_code: 'cup' },
    ]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipe detail print matches the active presentation @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const serviceHeaders = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  };
  const privateDetailsPreferenceUrl = `${config.apiUrl}/rest/v1/accounts?select=include_private_details_in_private_print&id=eq.${user.id}`;
  const ingredientRowId = randomUUID();
  const saltRowId = randomUUID();
  const stepId = randomUUID();

  try {
    const saved = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'A recipe to print',
        p_food_type_id: null,
        p_state: 'want_to_try',
        p_verdict_id: null,
        p_enthusiasm_id: null,
        p_occasion_details: null,
        p_reason: null,
        p_serves: 4,
        p_prep_time_minutes: 15,
        p_mixing_time_minutes: null,
        p_marinate_time_minutes: null,
        p_chill_time_minutes: null,
        p_freeze_time_minutes: null,
        p_cook_time_minutes: 30,
        p_bake_time_minutes: null,
        p_cooling_time_minutes: null,
        p_rest_time_minutes: null,
        p_total_time_minutes: 45,
        p_notes_markdown: 'Serve warm.',
        p_meal_type_ids: [],
        p_cuisine_ids: [],
        p_equipment_ids: [],
        p_ingredient_rows: [
          {
            recipe_ingredient_id: ingredientRowId,
            ingredient_id: null,
            ingredient_name: 'Flour',
            is_main: true,
            detail: 'All-purpose',
            preparation: 'Sifted',
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
            recipe_ingredient_id: saltRowId,
            ingredient_id: null,
            ingredient_name: 'Salt',
            is_main: false,
            detail: '',
            preparation: '',
            measurements: [
              {
                measurement_type: 'volume',
                amount_min: 1 / 8,
                amount_max: null,
                unit_code: 'tsp',
                picklist_value_id: null,
              },
            ],
          },
        ],
        p_instruction_steps: [
          {
            id: stepId,
            position: 0,
            content_markdown: `Mix [[ingredient:${ingredientRowId}|flour]].`,
            plain_text: 'Mix flour.',
          },
        ],
      },
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();

    await signIn(page, user.email, user.password);
    await page.goto('/settings');
    await expect(page.getByRole('region', { name: 'Personal preferences' })).toBeVisible();
    const volumePicker = page.getByRole('combobox', { name: 'Volume' });
    const weightPicker = page.getByRole('combobox', { name: 'Weight' });
    await expect(volumePicker).toContainText('US customary');
    await expect(weightPicker).toContainText('US customary');
    const repeatIngredientsPreference = page.getByRole('checkbox', {
      name: 'Repeat ingredients on each page in print and downloads',
    });
    const privateDetailsPreference = page.getByRole('checkbox', {
      name: 'Include private-only details in print and downloads',
    });
    await expect(repeatIngredientsPreference).toBeChecked();
    await expect(privateDetailsPreference).not.toBeChecked();
    await privateDetailsPreference.check();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await expect
      .poll(async () => {
        const response = await request.get(privateDetailsPreferenceUrl, {
          headers: serviceHeaders,
        });
        return (await response.json())[0]?.include_private_details_in_private_print;
      })
      .toBe(true);
    await page.reload();
    await expect(privateDetailsPreference).toBeChecked();
    await privateDetailsPreference.uncheck();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await expect
      .poll(async () => {
        const response = await request.get(privateDetailsPreferenceUrl, {
          headers: serviceHeaders,
        });
        return (await response.json())[0]?.include_private_details_in_private_print;
      })
      .toBe(false);
    await repeatIngredientsPreference.uncheck();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await volumePicker.click();
    const volumeOptions = page.getByRole('listbox').getByRole('option');
    await expect(volumeOptions).toHaveCount(2);
    await expect(volumeOptions.nth(0)).toHaveAccessibleName('US customary');
    await expect(volumeOptions.nth(1)).toHaveAccessibleName('Metric');
    await page.getByRole('listbox').getByRole('option', { name: 'Metric', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await expect(volumePicker).toContainText('Metric');
    await page.addInitScript(() => {
      window.print = () => {
        window.top?.document.documentElement.setAttribute('data-print-requested', 'true');
      };
    });
    await page.goto(`/recipes/${(await saved.json())[0].id}`);
    await expect(page.getByRole('heading', { name: 'A recipe to print' })).toBeVisible();
    const presentationButton = page.getByRole('button', { name: /^Ingredient view:/ });
    const initialPresentation =
      testInfo.project.name === 'Fold 6' ? 'Ingredient-first' : 'Standard';
    await expect(presentationButton).toHaveAttribute(
      'title',
      `Ingredient view: ${initialPresentation}; next ${initialPresentation === 'Standard' ? 'Ingredient-first' : 'Standard'}`,
    );
    if (initialPresentation === 'Ingredient-first') {
      await presentationButton.click();
    }
    await expect(presentationButton).toHaveAttribute(
      'title',
      'Ingredient view: Standard; next Ingredient-first',
    );
    await expect(page.locator('.recipe-reader-subtitle')).toHaveText('standard, order entered');
    const outputButton = page.getByRole('button', { name: 'Print & Download' });
    const settingsButton = page.getByRole('button', { name: 'Page settings' });
    await expect(outputButton).toBeVisible();
    await settingsButton.click();
    const settingsPanel = page.getByRole('dialog', { name: 'Page settings' });
    await expect(settingsPanel).toBeVisible();
    const settingsPanelBox = await settingsPanel.boundingBox();
    const viewport = page.viewportSize();
    if (!settingsPanelBox || !viewport) {
      throw new Error('Expected the page settings menu and viewport to have layout bounds.');
    }
    expect(settingsPanelBox.x).toBeGreaterThanOrEqual(0);
    expect(settingsPanelBox.x + settingsPanelBox.width).toBeLessThanOrEqual(viewport.width);
    const pageRepeatIngredients = page.getByRole('checkbox', {
      name: 'Repeat ingredients on each page',
    });
    await expect(pageRepeatIngredients).not.toBeChecked();
    await pageRepeatIngredients.check();
    await page.reload();
    await settingsButton.click();
    await expect(
      page.getByRole('checkbox', { name: 'Repeat ingredients on each page' }),
    ).not.toBeChecked();
    const pagePrivateDetails = page.getByRole('checkbox', {
      name: 'Include private-only details',
    });
    await expect(pagePrivateDetails).not.toBeChecked();
    await page.keyboard.press('Escape');

    const defaultHtmlDownloadPromise = page.waitForEvent('download');
    await outputButton.click();
    const outputMenu = page.getByRole('menu', { name: 'Print and download actions' });
    await expect(outputMenu).toBeVisible();
    const outputMenuBox = await outputMenu.boundingBox();
    if (!outputMenuBox) {
      throw new Error('Expected the print and download menu to have layout bounds.');
    }
    expect(outputMenuBox.x).toBeGreaterThanOrEqual(0);
    expect(outputMenuBox.x + outputMenuBox.width).toBeLessThanOrEqual(viewport.width);
    await page.getByRole('menuitem', { name: 'Download HTML' }).click();
    const defaultHtmlDownload = await defaultHtmlDownloadPromise;
    const defaultHtmlPath = await defaultHtmlDownload.path();
    if (!defaultHtmlPath)
      throw new Error('Expected the default HTML download to have a file path.');
    const defaultHtml = await readFile(defaultHtmlPath, 'utf8');
    expect(defaultHtml.replace(/<!--[\s\S]*?-->/g, '')).toContain('Serves 4');
    expect(defaultHtml).not.toContain('Want to try');
    expect(defaultHtml).not.toContain('Serve warm.');

    await settingsButton.click();
    await pagePrivateDetails.check();
    await page.keyboard.press('Escape');
    const privateHtmlDownloadPromise = page.waitForEvent('download');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Download HTML' }).click();
    const privateHtmlDownload = await privateHtmlDownloadPromise;
    const privateHtmlPath = await privateHtmlDownload.path();
    if (!privateHtmlPath)
      throw new Error('Expected the private HTML download to have a file path.');
    const privateHtml = await readFile(privateHtmlPath, 'utf8');
    expect(privateHtml).toContain('Want to try');
    expect(privateHtml).toContain('Serve warm.');

    await page.reload();
    await settingsButton.click();
    await expect(
      page.getByRole('checkbox', { name: 'Include private-only details' }),
    ).not.toBeChecked();
    await page.keyboard.press('Escape');
    if (initialPresentation === 'Ingredient-first') {
      await presentationButton.click();
      await expect(presentationButton).toHaveAttribute(
        'title',
        'Ingredient view: Standard; next Ingredient-first',
      );
    }
    const printIngredient = page.locator('.recipe-ingredient-list li').first();
    const flourMention = page.getByRole('button', { name: 'flour', exact: true });
    const amountPopup = page.getByRole('tooltip');
    const ingredientText = '354.88 ml / 4 ¼ oz all-purpose flour, sifted';
    const scaledIngredientText = '709.76 ml / 8.47 oz all-purpose flour, sifted';
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(ingredientText);
    const saltUnitPicker = page.getByRole('combobox', { name: 'Change Salt volume unit' });
    await expect(saltUnitPicker.locator('.recipe-reader-unit-label')).toHaveCSS(
      'text-decoration-line',
      'underline',
    );
    await saltUnitPicker.click();
    await page.getByRole('option', { name: 'tsp', exact: true }).click();
    const saltIngredient = page.locator('.recipe-ingredient-list li').nth(1);
    await expect(saltIngredient.locator('.recipe-ingredient-name')).toHaveText('⅛ tsp salt');
    await saltUnitPicker.click();
    await page.getByRole('option', { name: 'TBSP', exact: true }).click();
    await saltUnitPicker.click();
    await page.getByRole('option', { name: 'tsp', exact: true }).click();
    await expect(saltIngredient.locator('.recipe-ingredient-name')).toHaveText('⅛ tsp salt');
    await expect(page.getByText('Serves 4', { exact: true })).toBeVisible();
    const scaleButton = page.getByRole('button', { name: 'Scale recipe' });
    await expect(scaleButton).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(scaleButton).toHaveCSS('border-top-width', '1px');
    await expect(scaleButton).toHaveCSS('border-radius', '6px');
    await expect(scaleButton).toHaveCSS('width', '36px');
    await expect(scaleButton).toHaveCSS('height', '36px');
    const readerSortButton = page.getByRole('button', { name: /^Sort ingredients:/ });
    const screenLockButton = page.getByRole('switch', { name: 'Cook mode' });
    expect(
      await scaleButton.evaluate((button) => button.closest('.recipe-reader-controls')),
    ).not.toBe(null);
    await expect(page.locator('.recipe-serves-value .recipe-scale-button')).toHaveCount(0);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(screenLockButton).toBeVisible();
      const toolbarBounds = await Promise.all(
        [readerSortButton, presentationButton, scaleButton, screenLockButton].map((button) =>
          button.boundingBox(),
        ),
      );
      const controlsBounds = await page.locator('.recipe-reader-controls').boundingBox();
      expect(toolbarBounds.every(Boolean)).toBe(true);
      expect(controlsBounds).not.toBeNull();
      const [sortBounds, presentationBounds, scaleBounds, screenLockBounds] = toolbarBounds;
      if (sortBounds && presentationBounds && scaleBounds && screenLockBounds && controlsBounds) {
        expect(sortBounds.x + sortBounds.width).toBeLessThanOrEqual(presentationBounds.x);
        expect(presentationBounds.x + presentationBounds.width).toBeLessThanOrEqual(scaleBounds.x);
        expect(scaleBounds.x + scaleBounds.width).toBeLessThanOrEqual(screenLockBounds.x);
        for (const bounds of toolbarBounds) {
          if (bounds) expect(Math.abs(bounds.y - sortBounds.y)).toBeLessThanOrEqual(1);
        }
        expect(
          Math.abs(
            screenLockBounds.x + screenLockBounds.width - (controlsBounds.x + controlsBounds.width),
          ),
        ).toBeLessThanOrEqual(1);
      }
      if (width > 760) {
        const [navigationBounds, settingsBounds, contentBounds, summaryBounds, readerBounds] =
          await Promise.all([
            page.locator('.private-nav').boundingBox(),
            page.getByRole('link', { name: 'Settings' }).boundingBox(),
            page.locator('.private-content-wide main.recipes-main').boundingBox(),
            page.locator('.recipe-summary-layout').boundingBox(),
            page.locator('.recipe-reading-layout').boundingBox(),
          ]);
        if (
          !navigationBounds ||
          !settingsBounds ||
          !contentBounds ||
          !summaryBounds ||
          !readerBounds
        ) {
          throw new Error('Expected private navigation and recipe reading layout bounds.');
        }
        expect(navigationBounds.width).toBeLessThan(220);
        expect(settingsBounds.x + settingsBounds.width).toBeLessThanOrEqual(
          navigationBounds.x + navigationBounds.width,
        );
        for (const bounds of [summaryBounds, readerBounds]) {
          expect(bounds.x).toBeCloseTo(contentBounds.x, 1);
          expect(bounds.width).toBeCloseTo(contentBounds.width, 0);
        }
      }
      const stateValueBounds = await page
        .locator('.recipe-metadata > div')
        .first()
        .locator('dd')
        .boundingBox();
      const servesTextBounds = await page
        .locator('.recipe-serves-value > span:first-child')
        .boundingBox();
      const scaleIconBounds = await page
        .locator('.recipe-reader-controls .recipe-scale-button svg')
        .boundingBox();
      const scaleButtonBounds = await scaleButton.boundingBox();
      expect(stateValueBounds).not.toBeNull();
      expect(servesTextBounds).not.toBeNull();
      expect(scaleIconBounds).not.toBeNull();
      expect(scaleButtonBounds).not.toBeNull();
      expect(
        Math.abs(
          (stateValueBounds?.y ?? 0) +
            (stateValueBounds?.height ?? 0) / 2 -
            ((servesTextBounds?.y ?? 0) + (servesTextBounds?.height ?? 0) / 2),
        ),
      ).toBeLessThanOrEqual(2);
      if (scaleButtonBounds && scaleIconBounds) {
        expect(
          Math.abs(
            scaleButtonBounds.x +
              scaleButtonBounds.width / 2 -
              (scaleIconBounds.x + scaleIconBounds.width / 2),
          ),
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(
            scaleButtonBounds.y +
              scaleButtonBounds.height / 2 -
              (scaleIconBounds.y + scaleIconBounds.height / 2),
          ),
        ).toBeLessThanOrEqual(1);
      }
      if (width === 390) {
        const wakeLockButton = page.getByRole('switch', { name: 'Cook mode' });
        const wakeLockBounds = await wakeLockButton.boundingBox();
        expect(wakeLockBounds).not.toBeNull();
        if (scaleButtonBounds && wakeLockBounds) {
          expect(scaleButtonBounds.x + scaleButtonBounds.width).toBeLessThanOrEqual(
            wakeLockBounds.x,
          );
        }
      }
    }
    await page.getByRole('button', { name: 'Scale recipe' }).click();
    const scalePane = page.getByRole('dialog', { name: 'Scale recipe' });
    await expect(scalePane).toBeVisible();
    await expect(scalePane).toHaveCSS('overflow-x', 'hidden');
    await expect(scalePane.getByRole('heading', { name: 'Scale recipe' })).toBeHidden();
    await expect(scalePane.getByRole('button', { name: 'Reset' })).toHaveCount(0);
    await scalePane.getByLabel('To').fill('8');
    await scalePane.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Serves 8', { exact: true })).toBeVisible();
    await flourMention.hover();
    await expect(amountPopup).toHaveText('709.76 ml / 8.47 oz');
    await page.mouse.move(0, 0);
    await expect(amountPopup).toBeHidden();
    await scaleButton.click();
    const scaleBounds = await scalePane.getByRole('combobox', { name: 'Scale' }).boundingBox();
    const countBounds = await scalePane.getByLabel('To').boundingBox();
    const scaleInput = scalePane.getByLabel('To');
    const closeBounds = await scalePane
      .getByRole('button', { name: 'Close scaling' })
      .boundingBox();
    const closeIconBounds = await scalePane
      .getByRole('button', { name: 'Close scaling' })
      .locator('svg')
      .boundingBox();
    const scaleLabelBounds = await scalePane
      .locator('.recipe-scaling-field > span')
      .first()
      .boundingBox();
    expect(
      scaleBounds && countBounds && closeBounds && closeIconBounds && scaleLabelBounds,
    ).toBeTruthy();
    await expect(scaleInput).toHaveCSS('appearance', 'textfield');
    await expect(scaleInput).toHaveCSS('text-align', 'center');
    if (scaleBounds && countBounds && closeBounds && closeIconBounds && scaleLabelBounds) {
      expect(scaleBounds.x).toBeLessThan(closeBounds.x);
      expect(
        Math.abs(
          closeIconBounds.y +
            closeIconBounds.height / 2 -
            (scaleLabelBounds.y + scaleLabelBounds.height / 2),
        ),
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(countBounds.x - (scaleBounds.x + scaleBounds.width) - (3 * 96) / 25.4),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(closeIconBounds.x + closeIconBounds.width - (countBounds.x + countBounds.width)),
      ).toBeLessThanOrEqual(1);
      await scalePane.getByLabel('To').click({
        position: { x: countBounds.width - 2, y: countBounds.height / 2 },
      });
      await expect(scalePane.getByLabel('To')).toBeFocused();
    }
    const actionBounds = await scalePane.locator('.recipe-scaling-actions').boundingBox();
    const resetBounds = await scalePane.getByRole('button', { name: 'Reset' }).boundingBox();
    const submitBounds = await scalePane.getByRole('button', { name: 'Submit' }).boundingBox();
    const resetPadding = await scalePane
      .getByRole('button', { name: 'Reset' })
      .evaluate((button) => {
        const styles = getComputedStyle(button);
        return [styles.paddingTop, styles.paddingRight, styles.paddingBottom, styles.paddingLeft];
      });
    const submitPadding = await scalePane
      .getByRole('button', { name: 'Submit' })
      .evaluate((button) => {
        const styles = getComputedStyle(button);
        return [styles.paddingTop, styles.paddingRight, styles.paddingBottom, styles.paddingLeft];
      });
    expect(actionBounds && resetBounds && submitBounds && closeBounds).toBeTruthy();
    expect(resetPadding).toEqual(['4px', '10px', '4px', '10px']);
    expect(submitPadding).toEqual(['4px', '10px', '4px', '10px']);
    await expect(scalePane.getByRole('button', { name: 'Reset' })).toHaveCSS('height', '36px');
    await expect(scalePane.getByRole('button', { name: 'Submit' })).toHaveCSS('height', '36px');
    await expect(scalePane.getByRole('button', { name: 'Reset' })).toHaveCSS(
      'border-radius',
      '6px',
    );
    await expect(scalePane.getByRole('button', { name: 'Submit' })).toHaveCSS(
      'border-radius',
      '6px',
    );
    const submitButton = scalePane.getByRole('button', { name: 'Submit' });
    await expect(submitButton).toHaveCSS(
      'background-color',
      await submitButton.evaluate((button) => getComputedStyle(button).borderTopColor),
    );
    await expect(scalePane.getByRole('button', { name: 'Submit' })).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    if (actionBounds && resetBounds && submitBounds && closeBounds && closeIconBounds) {
      expect(Math.abs(actionBounds.x - resetBounds.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(resetBounds.width - submitBounds.width)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(submitBounds.x - (resetBounds.x + resetBounds.width) - (3 * 96) / 25.4),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(closeIconBounds.x + closeIconBounds.width - submitBounds.x - submitBounds.width),
      ).toBeLessThanOrEqual(1);
    }
    await scalePane.getByLabel('To').fill('9');
    await page.keyboard.press('Escape');
    await expect(scalePane).toBeHidden();
    await expect(page.getByText('Serves 8', { exact: true })).toBeVisible();
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(
      scaledIngredientText,
    );
    await page.getByRole('button', { name: 'Scale recipe' }).click();
    await scalePane.getByLabel('To').fill('0');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(scalePane.getByRole('alert')).toContainText('positive whole serving count');
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(
      scaledIngredientText,
    );
    await scalePane.getByLabel('To').fill('8');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Serves 8', { exact: true })).toBeVisible();
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(
      '709.76 ml / 8.47 oz all-purpose flour, sifted',
    );

    await page.getByRole('button', { name: 'Scale recipe' }).click();
    const scaleMode = page.getByRole('combobox', { name: 'Scale' });
    await scaleMode.click();
    const scaleMenu = page.getByRole('listbox');
    await expect(scaleMenu).toBeInViewport({ ratio: 1 });
    expect((await scaleMenu.boundingBox())?.width).toBeLessThan(200);
    expect(await scaleMenu.evaluate((menu) => menu.scrollWidth <= menu.clientWidth)).toBe(true);
    expect(
      await scaleMenu
        .locator('.recipe-reader-picklist-option')
        .evaluateAll((options) =>
          options.every((option) => option.scrollWidth <= option.clientWidth),
        ),
    ).toBe(true);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(scaleMode).toContainText('Multiply');
    await expect(scalePane.getByLabel('By')).toBeFocused();
    await expect(scalePane.getByLabel('By')).toHaveValue('2');
    await scalePane.getByLabel('By').fill('2.5');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Serves 10', { exact: true })).toBeVisible();
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(
      '887.21 ml / 10.58 oz all-purpose flour, sifted',
    );

    await page.getByRole('button', { name: 'Scale recipe' }).click();
    await page.getByRole('combobox', { name: 'Scale' }).click();
    await page.getByRole('option', { name: 'Divide' }).click();
    await scalePane.getByLabel('By').fill('2');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Serves 2', { exact: true })).toBeVisible();
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(
      '177.44 ml / 2 ⅛ oz all-purpose flour, sifted',
    );
    await page.getByRole('combobox', { name: 'Change Flour volume unit' }).click();
    const unitMenu = page.getByRole('listbox');
    await expect(unitMenu).toBeInViewport({ ratio: 1 });
    expect((await unitMenu.boundingBox())?.width).toBeLessThan(240);
    expect(await unitMenu.evaluate((menu) => menu.scrollWidth <= menu.clientWidth)).toBe(true);
    expect(
      await unitMenu
        .locator('.recipe-reader-picklist-option')
        .evaluateAll((options) =>
          options.every((option) => option.scrollWidth <= option.clientWidth),
        ),
    ).toBe(true);
    await expect(unitMenu.getByText('US', { exact: true })).toBeVisible();
    const initialUnitMenuWidth = await unitMenu.evaluate(
      (menu) => menu.getBoundingClientRect().width,
    );
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await expect
      .poll(() => unitMenu.evaluate((menu) => menu.getBoundingClientRect().width))
      .toBe(initialUnitMenuWidth);
    await page.getByRole('option', { name: 'TBSP' }).click();
    await page.getByRole('combobox', { name: 'Change Flour weight unit' }).click();
    const weightMenu = page.getByRole('listbox');
    await expect(weightMenu.getByRole('option', { name: 'kg' })).toBeVisible();
    expect(
      await weightMenu
        .locator('.recipe-reader-picklist-option')
        .evaluateAll((options) =>
          options.every((option) => option.scrollWidth <= option.clientWidth),
        ),
    ).toBe(true);
    await page.getByRole('option', { name: 'kg' }).click();
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(
      '12 TBSP / 0.06 kg all-purpose flour, sifted',
    );
    await flourMention.hover();
    await expect(amountPopup).toHaveText('12 TBSP / 0.06 kg');
    await page.mouse.move(0, 0);
    await expect(amountPopup).toBeHidden();
    const activeIngredientText = '12 TBSP / 2 ⅛ oz all-purpose flour, sifted';
    const readerA11y = await new AxeBuilder({ page }).analyze();
    expect(readerA11y.violations).toEqual([]);
    if (testInfo.project.name === 'Fold 6') {
      const readerControls = page.locator(
        '.recipe-scale-button, .recipe-reader-picklist-trigger, .recipe-scaling-pane input, .recipe-scaling-actions button',
      );
      for (const control of await readerControls.all()) {
        expect((await control.boundingBox())?.height).toBe(36);
      }
      for (const unitTrigger of await page.locator('.recipe-reader-unit-trigger').all()) {
        await expect(unitTrigger.locator('.recipe-reader-unit-label')).toHaveCSS(
          'text-decoration-line',
          'underline',
        );
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    await page.getByRole('button', { name: 'Scale recipe' }).click();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(scalePane.getByRole('button', { name: 'Reset' })).toHaveCount(0);
    await expect(page.getByText('Serves 4', { exact: true })).toBeVisible();
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(ingredientText);
    await page.getByRole('button', { name: 'Close scaling' }).click();

    await page.getByRole('button', { name: 'Scale recipe' }).click();
    await page.getByRole('combobox', { name: 'Scale' }).click();
    await page.getByRole('option', { name: 'Divide' }).click();
    await expect(scalePane.getByLabel('By')).toHaveValue('2');
    await scalePane.getByLabel('By').fill('2');
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.getByRole('combobox', { name: 'Change Flour volume unit' }).click();
    await page.getByRole('option', { name: 'TBSP' }).click();
    await expect(printIngredient.locator('.recipe-ingredient-name')).toHaveText(
      activeIngredientText,
    );
    await page.getByRole('combobox', { name: 'Change Salt volume unit' }).click();
    await page.getByRole('option', { name: 'tsp', exact: true }).click();
    await expect(saltIngredient.locator('.recipe-ingredient-name')).toHaveText('pinch salt');
    await expect(page.getByText('Mix flour.')).toBeVisible();
    await presentationButton.click();
    await expect(presentationButton).toHaveAttribute(
      'title',
      'Ingredient view: Ingredient-first; next Standard',
    );
    const printedIngredientRow = page.locator('.recipe-ingredient-table tbody tr').first();
    await expect(printedIngredientRow.locator('th')).toContainText('flour');
    const printedSpecifics = printedIngredientRow.locator('.recipe-reader-specifics');
    await expect(printedSpecifics).toHaveText('all-purpose');
    await expect(printedSpecifics).toHaveCSS('text-transform', 'none');
    const printedIngredientCells = printedIngredientRow.locator('td');
    await expect(printedIngredientCells).toHaveCount(3);
    await expect(printedIngredientCells.nth(0)).toContainText('12 TBSP');
    await expect(printedIngredientCells.nth(1)).toContainText('2 ⅛ oz');
    await outputButton.click();
    await page.getByRole('menuitem', { name: 'Print', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');
    await expect(page.locator('.recipe-output-feedback-success')).toHaveText('Print request sent.');
    await expect(outputButton).toBeEnabled();
    const printFrame = page.locator('iframe[title="Recipe print document"]');
    await expect(printFrame).toHaveCount(1);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await expect(printFrame).toHaveCount(0);
    await settingsButton.click();
    await expect(settingsPanel).toBeVisible();
    await page.keyboard.press('Escape');

    await page.emulateMedia({ media: 'print' });
    await expect(outputButton).toBeHidden();
    await expect(settingsButton).toBeHidden();
    await expect(page.getByRole('link', { name: 'Edit' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Scale recipe' })).toBeHidden();
    await expect(page.getByRole('combobox', { name: 'Change Flour volume unit' })).toBeVisible();
    await expect(presentationButton).toBeHidden();
    await expect(page.locator('.recipe-ingredient-table')).toBeVisible();
    await expect(page.locator('.recipe-ingredient-list')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'A recipe to print' })).toBeVisible();
    await expect(page.getByText('Serve warm.')).toBeVisible();
    await expect(page.getByText('Mix flour.')).toBeVisible();
    await expect(printedIngredientRow.locator('th')).toContainText('flour');
    await expect(printedIngredientCells.nth(0)).toContainText('12 TBSP');
    await expect(printedIngredientCells.nth(1)).toContainText('2 ⅛ oz');
    await expect(page.locator('.recipe-detail-section').first()).toHaveCSS('break-inside', 'avoid');
    const pdf = await page.pdf();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(1_000);
    const pdfDocument = await getDocument({ data: new Uint8Array(pdf) }).promise;
    const printedPageSize = await pdfDocument
      .getPage(1)
      .then((pdfPage) => pdfPage.getViewport({ scale: 1 }));
    expect(printedPageSize.width).toBeGreaterThan(printedPageSize.height);
    const pdfPages = await Promise.all(
      Array.from({ length: pdfDocument.numPages }, async (_page, index) => {
        const page = await pdfDocument.getPage(index + 1);
        const content = await page.getTextContent();
        return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      }),
    );
    const pdfText = pdfPages.join('\n').replace(/\s+/gu, ' ').trim();
    expect(pdfText).toContain('Serves 2');
    expect(pdfText).toContain('12 TBSP');
    expect(pdfText).toContain('2 ⅛ oz');
    expect(pdfText).toContain('pinch');
    expect(pdfText).not.toContain('Submit');
    expect(pdfText).not.toContain('Reset');

    const storedMeasurement = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=amount_min,amount_max,unit_code&recipe_ingredient_id=eq.${ingredientRowId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${user.accessToken}` } },
    );
    expect(await storedMeasurement.json()).toEqual([
      { amount_min: 1.5, amount_max: null, unit_code: 'cup' },
      { amount_min: 120, amount_max: null, unit_code: 'g' },
    ]);
    const storedSaltMeasurement = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=amount_min,amount_max,unit_code&recipe_ingredient_id=eq.${saltRowId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${user.accessToken}` } },
    );
    expect(await storedSaltMeasurement.json()).toEqual([
      { amount_min: 1 / 8, amount_max: null, unit_code: 'tsp' },
    ]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('reader controls and cook mode stay usable at narrow widths @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const saltRowId = randomUUID();
  const chickenRowId = randomUUID();

  try {
    const saved = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'Reader polish acceptance',
        p_food_type_id: null,
        p_state: 'want_to_try',
        p_verdict_id: null,
        p_enthusiasm_id: null,
        p_occasion_details: null,
        p_reason: null,
        p_serves: 2,
        p_prep_time_minutes: 65,
        p_mixing_time_minutes: null,
        p_marinate_time_minutes: null,
        p_chill_time_minutes: null,
        p_freeze_time_minutes: null,
        p_cook_time_minutes: null,
        p_bake_time_minutes: null,
        p_cooling_time_minutes: null,
        p_rest_time_minutes: null,
        p_total_time_minutes: 70,
        p_notes_markdown: '',
        p_meal_type_ids: [],
        p_cuisine_ids: [],
        p_equipment_ids: [],
        p_ingredient_rows: [
          {
            recipe_ingredient_id: saltRowId,
            ingredient_id: null,
            ingredient_name: 'Salt',
            is_main: false,
            detail: '',
            preparation: '',
            measurements: [
              {
                measurement_type: 'volume',
                amount_min: 1 / 16,
                amount_max: null,
                unit_code: 'tsp',
                picklist_value_id: null,
              },
            ],
          },
          {
            recipe_ingredient_id: chickenRowId,
            ingredient_id: null,
            ingredient_name: 'Chicken thighs',
            is_main: false,
            detail: '',
            preparation: '',
            measurements: [
              {
                measurement_type: 'weight',
                amount_min: 226.8,
                amount_max: null,
                unit_code: 'g',
                picklist_value_id: null,
              },
            ],
          },
        ],
        p_instruction_steps: [],
      },
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const [{ id: recipeId }] = await saved.json();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: async () => ({
            addEventListener: () => {},
            release: async () => {},
          }),
        },
      });
    });
    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/recipes/${recipeId}`);
    await expect(page.getByRole('heading', { name: 'Reader polish acceptance' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Time Breakdown' })).toBeHidden();
    await expect(page.locator('.recipe-detail-times')).toContainText('1 hr 5 min');
    await expect(page.locator('.recipe-metadata:not(.recipe-time-list)')).toContainText(
      '1 hr 10 min',
    );

    const ingredientsHeading = page.getByRole('heading', { name: 'Ingredients' });
    const titleBounds = await page.locator('.recipe-reader-title').boundingBox();
    const controls = page.locator('.recipe-reader-controls');
    const headingBounds = await ingredientsHeading.boundingBox();
    const controlsBounds = await controls.boundingBox();
    expect(titleBounds).not.toBeNull();
    expect(headingBounds).not.toBeNull();
    expect(controlsBounds).not.toBeNull();
    if (titleBounds && controlsBounds) {
      expect(controlsBounds.x - (titleBounds.x + titleBounds.width)).toBeLessThanOrEqual(12);
    }

    const unitPicker = page.getByRole('combobox', { name: 'Change Salt volume unit' });
    const saltUnitLabel = unitPicker.locator('.recipe-reader-unit-label');
    await expect(unitPicker).toHaveCSS('text-decoration-line', 'none');
    await expect(saltUnitLabel).toHaveCSS('text-decoration-line', 'underline');
    await expect(saltUnitLabel).toHaveCSS('text-decoration-skip-ink', 'none');
    await expect(saltUnitLabel).toHaveCSS('text-decoration-thickness', '1px');
    await expect(saltUnitLabel).toHaveCSS('text-underline-offset', '4px');
    await expect(page.locator('.recipe-ingredient-list')).toContainText('pinch salt');
    await unitPicker.focus();
    await page.keyboard.press('Enter');
    const unitListbox = page.getByRole('listbox');
    await expect(unitListbox).toBeVisible();
    await unitListbox.getByRole('option', { name: 'TBSP' }).click();
    await expect(page.locator('.recipe-ingredient-list')).toContainText('0.02 TBSP salt');
    await unitPicker.click();
    await page.getByRole('option', { name: 'tsp', exact: true }).click();
    await expect(page.locator('.recipe-ingredient-list')).toContainText('pinch salt');

    await page.setViewportSize({ width: 360, height: 844 });
    await expect(page.getByRole('heading', { name: 'Time Breakdown' })).toBeVisible();
    const mobileHeadingBounds = await page
      .getByRole('heading', { name: 'Ingredients', exact: true })
      .boundingBox();
    const mobileTitleBounds = await page.locator('.recipe-reader-title').boundingBox();
    const mobileSortBounds = await page
      .getByRole('button', { name: /^Sort ingredients:/ })
      .boundingBox();
    const mobileLastControlBounds = await page
      .locator('.recipe-reader-controls > :last-child')
      .boundingBox();
    expect(mobileHeadingBounds).not.toBeNull();
    expect(mobileTitleBounds).not.toBeNull();
    expect(mobileSortBounds).not.toBeNull();
    expect(mobileLastControlBounds).not.toBeNull();
    if (mobileHeadingBounds && mobileSortBounds) {
      const sortButtonCenter = mobileSortBounds.y + mobileSortBounds.height / 2;
      const headingCenter = mobileHeadingBounds.y + mobileHeadingBounds.height / 2;
      if (Math.abs(sortButtonCenter - headingCenter) <= 1) {
        const headingGap = mobileSortBounds.x - (mobileHeadingBounds.x + mobileHeadingBounds.width);
        expect(headingGap).toBeGreaterThanOrEqual(0);
        expect(headingGap).toBeLessThanOrEqual(12);
      } else if (mobileTitleBounds && mobileLastControlBounds) {
        const titleRight = mobileTitleBounds.x + mobileTitleBounds.width;
        const controlsRight = mobileLastControlBounds.x + mobileLastControlBounds.width;
        expect(Math.abs(controlsRight - titleRight)).toBeLessThanOrEqual(1);
      }
    }
    await page
      .getByRole('button', { name: /Ingredient view:.*Activate for Ingredient-first/ })
      .click();
    await page.getByRole('switch', { name: 'Cook mode' }).click();
    const ingredientFirstTable = page.locator('.recipe-ingredient-table');
    await expect(ingredientFirstTable).toBeVisible();
    const ingredientRegionBounds = await page
      .getByRole('region', { name: 'Ingredients', exact: true })
      .boundingBox();
    const cookModeTableBounds = await ingredientFirstTable.boundingBox();
    expect(ingredientRegionBounds).not.toBeNull();
    expect(cookModeTableBounds).not.toBeNull();
    if (ingredientRegionBounds && cookModeTableBounds) {
      expect(Math.abs(cookModeTableBounds.x - ingredientRegionBounds.x)).toBeLessThanOrEqual(1);
    }
    const checkbox = page.getByRole('checkbox', { name: 'Mark Salt complete' });
    const checkboxTarget = page.locator('.recipe-cook-checkbox').first();
    const checkboxCell = page.locator('.recipe-cook-checkbox-cell').first();
    const checkboxBounds = await checkbox.boundingBox();
    const checkboxTargetBounds = await checkboxTarget.boundingBox();
    const checkboxCellBounds = await checkboxCell.boundingBox();
    const ingredientNameBounds = await ingredientFirstTable
      .locator('tbody tr')
      .first()
      .locator('th')
      .boundingBox();
    expect(checkboxBounds).not.toBeNull();
    expect(checkboxTargetBounds?.height).toBeGreaterThanOrEqual(48);
    expect(checkboxTargetBounds?.width).toBe(32);
    expect(checkboxCellBounds).not.toBeNull();
    expect(checkboxCellBounds?.width).toBe(32);
    expect(ingredientNameBounds).not.toBeNull();
    if (checkboxBounds && checkboxTargetBounds && checkboxCellBounds && ingredientNameBounds) {
      const gapToIngredient = ingredientNameBounds.x - (checkboxBounds.x + checkboxBounds.width);
      expect(Math.abs(checkboxBounds.x - checkboxTargetBounds.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(checkboxTargetBounds.x - checkboxCellBounds.x)).toBeLessThanOrEqual(1);
      expect(gapToIngredient).toBeLessThanOrEqual(20);
    }
    const volumeLineHeightRatio = await unitPicker.evaluate((element) => {
      const cell = element.closest('td');
      if (!cell) throw new Error('Expected the volume picker to be inside a table cell.');
      const styles = getComputedStyle(cell);
      return Number.parseFloat(styles.lineHeight) / Number.parseFloat(styles.fontSize);
    });
    expect((await unitPicker.boundingBox())?.height).toBeLessThanOrEqual(32);
    const mobileWeightPicker = page.getByRole('combobox', {
      name: 'Change Chicken thighs weight unit',
    });
    const weightLineHeightRatio = await mobileWeightPicker.evaluate((element) => {
      const cell = element.closest('td');
      if (!cell) throw new Error('Expected the weight picker to be inside a table cell.');
      const styles = getComputedStyle(cell);
      return Number.parseFloat(styles.lineHeight) / Number.parseFloat(styles.fontSize);
    });
    expect((await mobileWeightPicker.boundingBox())?.height).toBeLessThanOrEqual(32);
    expect(volumeLineHeightRatio).toBeGreaterThanOrEqual(1.2);
    expect(volumeLineHeightRatio).toBeLessThanOrEqual(1.3);
    expect(weightLineHeightRatio).toBeGreaterThanOrEqual(1.2);
    expect(weightLineHeightRatio).toBeLessThanOrEqual(1.3);
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await checkboxTarget.boundingBox())?.height).toBeGreaterThanOrEqual(48);
    const narrowHeadingBounds = await page
      .getByRole('heading', { name: 'Ingredients', exact: true })
      .boundingBox();
    const narrowTitleBounds = await page.locator('.recipe-reader-title').boundingBox();
    const narrowControlsBounds = await page.locator('.recipe-reader-controls').boundingBox();
    const narrowSortBounds = await page
      .getByRole('button', { name: /^Sort ingredients:/ })
      .boundingBox();
    const narrowScaleBounds = await page
      .getByRole('button', { name: 'Scale recipe' })
      .boundingBox();
    const narrowLockBounds = await page.getByRole('switch', { name: 'Cook mode' }).boundingBox();
    expect(narrowHeadingBounds).not.toBeNull();
    expect(narrowTitleBounds).not.toBeNull();
    expect(narrowControlsBounds).not.toBeNull();
    expect(narrowSortBounds).not.toBeNull();
    expect(narrowScaleBounds).not.toBeNull();
    expect(narrowLockBounds).not.toBeNull();
    if (
      narrowTitleBounds &&
      narrowControlsBounds &&
      narrowSortBounds &&
      narrowScaleBounds &&
      narrowLockBounds
    ) {
      const titleRight = narrowTitleBounds.x + narrowTitleBounds.width;
      const controlsRight = narrowControlsBounds.x + narrowControlsBounds.width;
      expect(Math.abs(controlsRight - titleRight)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(narrowLockBounds.x - (narrowScaleBounds.x + narrowScaleBounds.width) - 4),
      ).toBeLessThanOrEqual(1);
    }

    const gramUnitPicker = page.getByRole('combobox', {
      name: 'Change Chicken thighs weight unit',
    });
    await gramUnitPicker.click();
    await page.getByRole('option', { name: 'g', exact: true }).click();
    await expect(gramUnitPicker).toHaveText('g');
    await expect(gramUnitPicker).toHaveCSS('text-decoration-line', 'none');
    const gramUnitLabel = gramUnitPicker.locator('.recipe-reader-unit-label');
    await expect(gramUnitLabel).toHaveText('g');
    await expect(gramUnitLabel).toHaveCSS('text-decoration-line', 'underline');
    await expect(gramUnitLabel).toHaveCSS('text-decoration-skip-ink', 'none');
    await expect(gramUnitLabel).toHaveCSS('text-decoration-thickness', '1px');
    await expect(gramUnitLabel).toHaveCSS('text-underline-offset', '4px');

    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('switch', { name: 'Cook mode' })).toBeHidden();
    await expect(page.locator('.recipe-ingredient-table')).toContainText('pinch');
    await expect(page.locator('.recipe-detail-times')).toContainText('1 hr 5 min');
    await expect(page.locator('.recipe-metadata:not(.recipe-time-list)')).toContainText(
      '1 hr 10 min',
    );

    const storedMeasurement = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=amount_min,amount_max,unit_code&recipe_ingredient_id=eq.${saltRowId}`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${user.accessToken}` } },
    );
    expect(await storedMeasurement.json()).toEqual([
      { amount_min: 1 / 16, amount_max: null, unit_code: 'tsp' },
    ]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipe reader sorts transiently and cooks without changing saved rows @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const flourId = randomUUID();
  const saltId = randomUUID();
  const sugarId = randomUUID();
  const stepId = randomUUID();

  try {
    const saved = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'A recipe for reader views',
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
            recipe_ingredient_id: flourId,
            ingredient_id: null,
            ingredient_name: 'Flour',
            is_main: true,
            detail: '',
            preparation: '',
            measurements: [],
          },
          {
            recipe_ingredient_id: saltId,
            ingredient_id: null,
            ingredient_name: 'Salt',
            is_main: false,
            detail: '',
            preparation: 'finely ground, then portioned',
            measurements: [],
          },
          {
            recipe_ingredient_id: sugarId,
            ingredient_id: null,
            ingredient_name: 'Sugar',
            is_main: false,
            detail: '',
            preparation: '',
            measurements: [],
          },
        ],
        p_instruction_steps: [
          {
            id: stepId,
            position: 0,
            content_markdown: `Add [[ingredient:${sugarId}|sugar]], then [[ingredient:${flourId}|flour]].`,
            plain_text: 'Add sugar, then flour.',
          },
        ],
      },
    });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    const [{ id: recipeId }] = await saved.json();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: async () => ({
            addEventListener: () => {},
            release: async () => {},
          }),
        },
      });
    });
    await signIn(page, user.email, user.password);
    await page.goto(`/recipes/${recipeId}`);
    await expect(page.getByRole('heading', { name: 'A recipe for reader views' })).toBeVisible();

    const presentation = page.getByRole('button', { name: /^Ingredient view:/ });
    const isMobileProject = testInfo.project.name === 'Fold 6';
    const initialPresentation = isMobileProject ? 'Ingredient-first' : 'Standard';
    await expect(presentation).toHaveAttribute(
      'title',
      `Ingredient view: ${initialPresentation}; next ${initialPresentation === 'Standard' ? 'Ingredient-first' : 'Standard'}`,
    );
    await expect(presentation).toHaveCSS('width', '36px');
    await expect(presentation).toHaveCSS('height', '36px');
    await expect(presentation).toHaveCSS('border-radius', '6px');
    const initialPresentationIcon = await presentation.locator('svg').getAttribute('class');
    const presentationBounds = await presentation.boundingBox();
    const presentationIconBounds = await presentation.locator('svg').boundingBox();
    expect(presentationBounds).not.toBeNull();
    expect(presentationIconBounds).not.toBeNull();
    if (presentationBounds && presentationIconBounds) {
      expect(
        Math.abs(
          presentationBounds.x +
            presentationBounds.width / 2 -
            (presentationIconBounds.x + presentationIconBounds.width / 2),
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          presentationBounds.y +
            presentationBounds.height / 2 -
            (presentationIconBounds.y + presentationIconBounds.height / 2),
        ),
      ).toBeLessThanOrEqual(1);
    }
    const initialAccessibility = await new AxeBuilder({ page }).analyze();
    expect(initialAccessibility.violations).toEqual([]);

    await presentation.focus();
    await page.keyboard.press('Enter');
    await expect(presentation).toHaveAttribute(
      'title',
      `Ingredient view: ${isMobileProject ? 'Standard' : 'Ingredient-first'}; next ${initialPresentation}`,
    );
    await expect(presentation.locator('svg')).not.toHaveClass(initialPresentationIcon ?? '');
    await expect(page.locator('.recipe-reader-subtitle')).toHaveText(
      `${isMobileProject ? 'standard' : 'first'}, order entered`,
    );
    const readerSummary = page.locator('.recipe-reader-title > h2 + .recipe-reader-subtitle');
    await expect(readerSummary).toHaveText(
      `${isMobileProject ? 'standard' : 'first'}, order entered`,
    );

    await page.setViewportSize({ width: 1280, height: 900 });
    const measureIngredientColumn = () =>
      page.getByRole('region', { name: 'Ingredients', exact: true }).evaluate((section) => {
        const title = section.querySelector('.recipe-reader-title');
        const controls = section.querySelector('.recipe-reader-controls');
        const heading = section.querySelector('.recipe-reader-heading-main');
        if (
          !(title instanceof HTMLElement) ||
          !(controls instanceof HTMLElement) ||
          !(heading instanceof HTMLElement)
        ) {
          throw new Error('Expected the Ingredients heading and toolbar.');
        }

        const table = section.querySelector('.recipe-ingredient-first-table');
        let rowContentWidth: number;
        if (table instanceof HTMLTableElement) {
          const scrollArea = section.querySelector('.recipe-ingredient-first-table-scroll');
          if (!(scrollArea instanceof HTMLElement)) {
            throw new Error('Expected the Ingredient-first table scroll area.');
          }
          const measuringTable = table.cloneNode(true) as HTMLTableElement;
          Object.assign(measuringTable.style, {
            position: 'fixed',
            left: '-10000px',
            top: '0',
            visibility: 'hidden',
            width: 'max-content',
            maxWidth: 'none',
            tableLayout: 'auto',
          });
          scrollArea.append(measuringTable);
          rowContentWidth = measuringTable.getBoundingClientRect().width;
          measuringTable.remove();
        } else {
          const list = section.querySelector('.recipe-ingredient-list');
          if (!(list instanceof HTMLOListElement)) {
            throw new Error('Expected the Standard ingredient list.');
          }
          const rows = [
            ...list.querySelectorAll(':scope > li:not(.recipe-ingredient-set-divider)'),
          ];
          rowContentWidth = Math.max(
            ...rows.map((row) => {
              const measuringRow = row.cloneNode(true) as HTMLLIElement;
              Object.assign(measuringRow.style, {
                position: 'fixed',
                left: '-10000px',
                top: '0',
                visibility: 'hidden',
                width: 'max-content',
                maxWidth: 'none',
              });
              list.append(measuringRow);
              const width = measuringRow.getBoundingClientRect().width;
              measuringRow.remove();
              return width;
            }),
          );
        }

        const millimetersToPixels = 96 / 25.4;
        const headingWidth =
          title.getBoundingClientRect().width +
          controls.getBoundingClientRect().width +
          Number.parseFloat(getComputedStyle(heading).columnGap);
        return {
          actualWidth: section.getBoundingClientRect().width,
          rowContentWidth,
          headingWidth,
          expectedWidth: Math.max(
            rowContentWidth + millimetersToPixels,
            headingWidth + 4 * millimetersToPixels,
          ),
        };
      });
    const measureIngredientContentOffset = () =>
      page.getByRole('region', { name: 'Ingredients', exact: true }).evaluate((section) => {
        const heading = section.querySelector('.recipe-reader-heading');
        const content = section.querySelector(
          '.recipe-ingredient-first-table-scroll, .recipe-ingredient-list',
        );
        if (!(heading instanceof HTMLElement) || !(content instanceof HTMLElement)) {
          throw new Error('Expected the Ingredients heading and presentation content.');
        }
        return content.getBoundingClientRect().top - heading.getBoundingClientRect().bottom;
      });
    const assertNoHorizontalOverflowAt = async (width: number) => {
      await page.setViewportSize({ width, height: 900 });
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(documentWidth).toBeLessThanOrEqual(width);
    };
    const readerTitleBounds = await page.locator('.recipe-reader-title').boundingBox();
    const readerControlsBounds = await page.locator('.recipe-reader-controls').boundingBox();
    expect(readerTitleBounds).not.toBeNull();
    expect(readerControlsBounds).not.toBeNull();
    if (readerTitleBounds && readerControlsBounds) {
      expect(
        readerControlsBounds.x - (readerTitleBounds.x + readerTitleBounds.width),
      ).toBeLessThanOrEqual(12);
      expect(Math.abs(readerControlsBounds.y - readerTitleBounds.y)).toBeLessThanOrEqual(1);
    }
    await expect(readerSummary).toHaveCSS('margin-top', '0px');
    await expect(readerSummary).toHaveCSS('margin-bottom', '0px');
    if (isMobileProject) await presentation.click();
    await expect(page.locator('.recipe-reading-ingredient_first')).toHaveCSS('display', 'grid');
    const ingredientColumnBounds = await page
      .getByRole('region', { name: 'Ingredients', exact: true })
      .boundingBox();
    const instructionsColumnBounds = await page
      .getByRole('region', { name: 'Instructions' })
      .boundingBox();
    expect(ingredientColumnBounds).not.toBeNull();
    expect(instructionsColumnBounds).not.toBeNull();
    const ingredientFirstSizing = await measureIngredientColumn();
    expect(
      Math.abs(ingredientFirstSizing.actualWidth - ingredientFirstSizing.expectedWidth),
      `Expected ${ingredientFirstSizing.expectedWidth}px from table ${ingredientFirstSizing.rowContentWidth}px and heading ${ingredientFirstSizing.headingWidth}px, received ${ingredientFirstSizing.actualWidth}px.`,
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(await measureIngredientContentOffset())).toBeLessThanOrEqual(1);
    if (ingredientColumnBounds && instructionsColumnBounds) {
      expect(ingredientColumnBounds.width).toBeLessThan(instructionsColumnBounds.width);
      expect(instructionsColumnBounds.x).toBeGreaterThan(
        ingredientColumnBounds.x + ingredientColumnBounds.width / 2,
      );
    }
    for (const width of [761, 900]) {
      await assertNoHorizontalOverflowAt(width);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await presentation.click();
    await expect(page.locator('.recipe-reading-standard')).toHaveCSS('display', 'grid');
    const standardSizing = await measureIngredientColumn();
    expect(
      Math.abs(standardSizing.actualWidth - standardSizing.expectedWidth),
      `Expected ${standardSizing.expectedWidth}px from row ${standardSizing.rowContentWidth}px and heading ${standardSizing.headingWidth}px, received ${standardSizing.actualWidth}px.`,
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(await measureIngredientContentOffset())).toBeLessThanOrEqual(1);
    for (const width of [761, 900]) {
      await assertNoHorizontalOverflowAt(width);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.recipe-reading-standard')).toHaveCSS('display', 'grid');
    await page.emulateMedia({ media: 'screen' });
    await page.screenshot({
      path: testInfo.outputPath('reader-standard-desktop.png'),
      fullPage: true,
    });
    await presentation.click();
    await expect(page.getByRole('table', { name: 'Recipe ingredients' })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('reader-ingredient-first-desktop.png'),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await presentation.click();
    await expect(page.locator('.recipe-reading-layout')).toHaveCSS('display', 'block');
    await expect(page.locator('.recipe-reading-standard')).toHaveCSS('display', 'block');
    expect(Math.abs(await measureIngredientContentOffset())).toBeLessThanOrEqual(1);
    const mobileStandardIngredients = await page
      .getByRole('region', { name: 'Ingredients', exact: true })
      .boundingBox();
    const mobileStandardInstructions = await page
      .getByRole('region', { name: 'Instructions' })
      .boundingBox();
    expect(mobileStandardIngredients).not.toBeNull();
    expect(mobileStandardInstructions).not.toBeNull();
    if (mobileStandardIngredients && mobileStandardInstructions) {
      expect(mobileStandardInstructions.y).toBeGreaterThanOrEqual(
        mobileStandardIngredients.y + mobileStandardIngredients.height,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath('reader-standard-mobile.png'),
      fullPage: true,
    });
    await presentation.click();
    await expect(page.locator('.recipe-reading-ingredient_first')).toHaveCSS('display', 'block');
    expect(Math.abs(await measureIngredientContentOffset())).toBeLessThanOrEqual(1);
    const mobileFirstIngredients = await page
      .getByRole('region', { name: 'Ingredients', exact: true })
      .boundingBox();
    const mobileFirstInstructions = await page
      .getByRole('region', { name: 'Instructions' })
      .boundingBox();
    expect(mobileFirstIngredients).not.toBeNull();
    expect(mobileFirstInstructions).not.toBeNull();
    if (mobileFirstIngredients && mobileFirstInstructions) {
      expect(mobileFirstInstructions.y).toBeGreaterThanOrEqual(
        mobileFirstIngredients.y + mobileFirstIngredients.height,
      );
    }
    const table = page.getByRole('table', { name: 'Recipe ingredients' });
    await expect(table.locator('.recipe-reader-label-mobile')).toHaveText(['Vol', 'Wt', 'Prep']);
    const mobileTableBounds = await table.boundingBox();
    const mobileIngredientColumnBounds = await page
      .getByRole('region', { name: 'Ingredients', exact: true })
      .boundingBox();
    expect(mobileTableBounds).not.toBeNull();
    expect(mobileIngredientColumnBounds).not.toBeNull();
    if (mobileTableBounds && mobileIngredientColumnBounds) {
      expect(Math.abs(mobileTableBounds.x - mobileIngredientColumnBounds.x)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(mobileTableBounds.width - mobileIngredientColumnBounds.width),
      ).toBeLessThanOrEqual(1);
    }
    const mobileIngredientsHeading = await page
      .getByRole('heading', { name: 'Ingredients', exact: true })
      .boundingBox();
    const mobileSubtitle = await readerSummary.boundingBox();
    const mobileControls = await page.locator('.recipe-reader-controls').boundingBox();
    expect(mobileIngredientsHeading).not.toBeNull();
    expect(mobileSubtitle).not.toBeNull();
    expect(mobileControls).not.toBeNull();
    if (mobileIngredientsHeading && mobileSubtitle && mobileControls) {
      expect(mobileSubtitle.y).toBeGreaterThanOrEqual(
        mobileIngredientsHeading.y + mobileIngredientsHeading.height,
      );
      expect(mobileControls.y).toBeGreaterThanOrEqual(mobileSubtitle.y + mobileSubtitle.height);
    }
    const mobileCellSpacing = await table
      .locator('tbody td')
      .first()
      .evaluate((cell) => {
        const style = getComputedStyle(cell);
        return {
          left: Number.parseFloat(style.paddingLeft),
          right: Number.parseFloat(style.paddingRight),
          alignment: style.textAlign,
        };
      });
    expect(mobileCellSpacing.left).toBe(0);
    expect(mobileCellSpacing.right).toBeLessThanOrEqual(96 / 25.4 + 0.1);
    expect(mobileCellSpacing.alignment).toBe('left');
    await page.screenshot({
      path: testInfo.outputPath('reader-ingredient-first-mobile.png'),
      fullPage: true,
    });

    const ingredientNames = table.locator('tbody th[scope="row"] .recipe-reader-table-name');
    const sort = page.getByRole('button', { name: /^Sort ingredients:/ });
    const direction = page.locator('.recipe-sort-direction');
    const directionBoundsBefore = await direction.boundingBox();
    const sortBoundsBefore = await sort.boundingBox();
    const presentationBoundsBefore = await presentation.boundingBox();
    const isNarrowViewport = (page.viewportSize()?.width ?? 0) <= 760;
    expect(directionBoundsBefore).toBeNull();
    await expect(direction).toHaveCSS('display', 'none');
    expect(sortBoundsBefore).not.toBeNull();
    expect(presentationBoundsBefore).not.toBeNull();
    const expectReaderControlsGap = async () => {
      const titleBounds = await page.locator('.recipe-reader-title').boundingBox();
      const controlsBounds = await page.locator('.recipe-reader-controls').boundingBox();
      expect(titleBounds).not.toBeNull();
      expect(controlsBounds).not.toBeNull();
      if (titleBounds && controlsBounds) {
        const gap = isNarrowViewport
          ? controlsBounds.y - (titleBounds.y + titleBounds.height)
          : controlsBounds.x - (titleBounds.x + titleBounds.width);
        expect(Math.abs(gap - 12)).toBeLessThanOrEqual(1);
      }
    };
    await expectReaderControlsGap();
    await expect(sort).toHaveAttribute(
      'title',
      'Sort: Order Entered; next Appears in Instructions',
    );
    await expect(sort).toHaveCSS('width', '36px');
    await expect(sort).toHaveCSS('height', '36px');
    const scaleButton = page.getByRole('button', { name: 'Scale recipe' });
    const sortIcons = new Set<string>();
    sortIcons.add((await sort.locator('svg').getAttribute('class')) ?? '');
    await sort.click();
    await expect(sort).toHaveAttribute('title', 'Sort: Appears in Instructions; next Alphabetical');
    sortIcons.add((await sort.locator('svg').getAttribute('class')) ?? '');
    await expect(ingredientNames).toHaveText(['sugar', 'flour', 'salt']);
    await sort.click();
    await expect(sort).toHaveAttribute('title', 'Sort: Alphabetical; next By Size');
    sortIcons.add((await sort.locator('svg').getAttribute('class')) ?? '');
    await expect(page.locator('.recipe-reader-subtitle')).toHaveText('first, alphabetical');
    await expect(direction).toHaveCSS('visibility', 'visible');
    await expect(sort.locator('svg')).toHaveClass(/lucide-arrow-down-a-z/);
    const directionBoundsAfter = await direction.boundingBox();
    const sortBoundsAfter = await sort.boundingBox();
    const presentationBoundsAfter = await presentation.boundingBox();
    expect(directionBoundsAfter).not.toBeNull();
    expect(sortBoundsAfter).not.toBeNull();
    expect(presentationBoundsAfter).not.toBeNull();
    await expectReaderControlsGap();
    if (directionBoundsAfter && sortBoundsAfter && presentationBoundsAfter) {
      expect(directionBoundsAfter.x).toBeLessThan(sortBoundsAfter.x);
      expect(sortBoundsAfter.x).toBeLessThan(presentationBoundsAfter.x);
    }
    await expect(ingredientNames).toHaveText(['flour', 'salt', 'sugar']);
    const ascendingButton = page.getByRole('button', { name: 'Sort ascending' });
    await expect(ascendingButton).toHaveCSS('width', '36px');
    await expect(ascendingButton).toHaveCSS('height', '36px');
    const ascendingIcon = await ascendingButton.locator('svg').getAttribute('class');
    await ascendingButton.click();
    const descendingButton = page.getByRole('button', { name: 'Sort descending' });
    await expect(descendingButton.locator('svg')).not.toHaveClass(ascendingIcon ?? '');
    await expect(ingredientNames).toHaveText(['sugar', 'salt', 'flour']);
    await sort.click();
    await expect(sort).toHaveAttribute('title', 'Sort: By Size; next Order Entered');
    sortIcons.add((await sort.locator('svg').getAttribute('class')) ?? '');
    await expect(sort.locator('svg')).toHaveClass(/lucide-hash/);
    await expect(page.locator('.recipe-reader-subtitle')).toHaveText('first, by size');
    await expectReaderControlsGap();
    await sort.click();
    await expect(sort).toHaveAttribute(
      'title',
      'Sort: Order Entered; next Appears in Instructions',
    );
    sortIcons.add((await sort.locator('svg').getAttribute('class')) ?? '');
    expect(sortIcons.size).toBe(4);
    await expect(ingredientNames).toHaveText(['flour', 'salt', 'sugar']);

    const storedRows = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=id,position&recipe_id=eq.${recipeId}&order=position.asc`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${user.accessToken}` } },
    );
    expect(await storedRows.json()).toEqual([
      { id: flourId, position: 0 },
      { id: saltId, position: 1 },
      { id: sugarId, position: 2 },
    ]);

    const cookMode = page.getByRole('switch', { name: 'Cook mode' });
    await expect(cookMode).toBeVisible();
    await expect(cookMode.locator('svg.lucide-laptop')).toBeVisible();
    await expect(cookMode.locator('svg.lucide-lock-keyhole')).toBeVisible();
    await expect(cookMode).toHaveCSS('width', '36px');
    await expect(cookMode).toHaveCSS('height', '36px');
    const cookModeBounds = await cookMode.boundingBox();
    const toolbarScaleBounds = await scaleButton.boundingBox();
    const toolbarSortBounds = await sort.boundingBox();
    const toolbarPresentationBounds = await presentation.boundingBox();
    const cookPresentationBounds = await presentation.boundingBox();
    expect(cookModeBounds).not.toBeNull();
    expect(toolbarScaleBounds).not.toBeNull();
    expect(toolbarSortBounds).not.toBeNull();
    expect(toolbarPresentationBounds).not.toBeNull();
    expect(cookPresentationBounds).not.toBeNull();
    if (
      cookModeBounds &&
      toolbarScaleBounds &&
      toolbarSortBounds &&
      toolbarPresentationBounds &&
      cookPresentationBounds
    ) {
      expect(toolbarSortBounds.x + toolbarSortBounds.width).toBeLessThanOrEqual(
        toolbarPresentationBounds.x,
      );
      expect(toolbarPresentationBounds.x + toolbarPresentationBounds.width).toBeLessThanOrEqual(
        toolbarScaleBounds.x,
      );
      expect(toolbarScaleBounds.x + toolbarScaleBounds.width).toBeLessThanOrEqual(cookModeBounds.x);
    }
    await cookMode.click();
    await expect(page.locator('.recipe-reader-subtitle')).toHaveText(
      'first, order entered, screen lock on',
    );
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(table.locator('thead tr > td[aria-hidden="true"]')).toHaveCount(1);
    await expect(table.getByRole('columnheader')).toHaveCount(4);
    const headerRowHeight = await table
      .locator('thead tr')
      .evaluate((row) => row.getBoundingClientRect().height);
    expect(headerRowHeight).toBeLessThan(48);
    const flourCheck = page.getByRole('checkbox', { name: 'Mark Flour complete' });
    const firstIngredientRow = table.locator('tbody tr').first();
    const firstIngredientRowHeight = await firstIngredientRow.evaluate(
      (row) => row.getBoundingClientRect().height,
    );
    expect(firstIngredientRowHeight).toBeLessThan(56);
    await expect(firstIngredientRow.locator('th')).toHaveCSS('vertical-align', 'middle');
    await expect(firstIngredientRow.locator('td').last()).toHaveCSS('vertical-align', 'middle');
    await expect(
      firstIngredientRow.locator('td').first().locator('.recipe-cook-checkbox'),
    ).toHaveCount(1);
    await expect(firstIngredientRow.locator('th .recipe-cook-checkbox')).toHaveCount(0);
    const checkboxBounds = await flourCheck.boundingBox();
    expect(checkboxBounds?.width).toBeGreaterThanOrEqual(13);
    expect(checkboxBounds?.width).toBeLessThanOrEqual(14);
    expect(checkboxBounds?.height).toBeGreaterThanOrEqual(13);
    expect(checkboxBounds?.height).toBeLessThanOrEqual(14);
    const checkTarget = page.locator('.recipe-cook-checkbox').first();
    expect((await checkTarget.boundingBox())?.height).toBeGreaterThanOrEqual(48);
    await flourCheck.check();
    await expect(flourCheck).toBeChecked();
    await expect(table.locator('tbody tr').filter({ has: flourCheck })).toHaveAttribute(
      'data-checked',
      'true',
    );
    await page.screenshot({
      path: testInfo.outputPath('reader-cook-mode-mobile.png'),
      fullPage: true,
    });
    const tableTopBeforeWarning = (await table.boundingBox())?.y;
    await cookMode.click();
    await expect(cookMode).toHaveAttribute('aria-checked', 'false');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request: async () => Promise.reject(new Error('blocked')) },
      });
    });
    await cookMode.click();
    const wakeWarning = page.getByRole('status');
    await expect(wakeWarning).toHaveText(
      'Screen may turn off because wake lock could not be acquired.',
    );
    await expect(wakeWarning).toHaveCSS('position', 'absolute');
    const tableTopAfterWarning = (await table.boundingBox())?.y;
    expect(tableTopBeforeWarning).not.toBeUndefined();
    expect(tableTopAfterWarning).toBe(tableTopBeforeWarning);
    const cookAccessibility = await new AxeBuilder({ page }).analyze();
    expect(cookAccessibility.violations).toEqual([]);
    await page.getByRole('button', { name: 'Dismiss screen lock warning' }).click();
    await expect(wakeWarning).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopCheckboxBounds = await flourCheck.boundingBox();
    expect(desktopCheckboxBounds?.width).toBeGreaterThanOrEqual(13);
    expect(desktopCheckboxBounds?.width).toBeLessThanOrEqual(14);
    expect(desktopCheckboxBounds?.height).toBeGreaterThanOrEqual(13);
    expect(desktopCheckboxBounds?.height).toBeLessThanOrEqual(14);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('reader-cook-mode-desktop.png'),
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.emulateMedia({ media: 'print' });
    await expect(cookMode).toBeHidden();
    await expect(flourCheck).toBeHidden();
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr').filter({ hasText: 'flour' })).toHaveCSS(
      'text-decoration-line',
      'none',
    );
  } finally {
    await deleteTestUser(request, user);
  }
});

test('owners can create Equipment, Food Type, Meal Type, and Cuisine values in the recipe editor and author unordered instruction lists @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill('DLC 25 editor workflow recipe');

    const foodTypeTrigger = page.getByRole('combobox', { name: 'Food Type', exact: true });
    await foodTypeTrigger.click();
    const addFoodTypeInput = page.getByRole('textbox', { name: 'Add Food Type' });
    await expect(addFoodTypeInput).toBeVisible();
    await addFoodTypeInput.fill('Unconfirmed food type');
    await addFoodTypeInput.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await foodTypeTrigger.click();
    await expect(page.getByRole('option', { name: 'Unconfirmed food type' })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Add Food Type' }).fill('  Savory   Galette  ');
    await page.getByRole('textbox', { name: 'Add Food Type' }).press('Enter');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(foodTypeTrigger).toContainText('Savory Galette');
    await expect(page).toHaveURL(/\/recipes\/new$/);

    await page.getByRole('button', { name: 'Equipment: Select' }).click();
    const equipmentMenu = page.getByRole('group', { name: 'Equipment options' });
    const addEquipmentInput = equipmentMenu.getByRole('textbox', { name: 'Add Equipment' });
    await addEquipmentInput.fill('Carbon steel wok');
    await addEquipmentInput.press('Enter');
    const wokOption = equipmentMenu.getByRole('button', { name: 'Carbon steel wok', exact: true });
    await expect(wokOption).toHaveAttribute('aria-pressed', 'true');
    await addEquipmentInput.fill('  carbon   STEEL wok ');
    await equipmentMenu.getByRole('button', { name: 'Add Equipment' }).click();
    await expect(
      equipmentMenu.getByRole('button', { name: 'Carbon steel wok', exact: true }),
    ).toHaveCount(1);
    const openMenuA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(openMenuA11y.violations).toEqual([]);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Meal Type: Select' }).click();
    const mealTypeMenu = page.getByRole('group', { name: 'Meal Type options' });
    await mealTypeMenu.getByRole('textbox', { name: 'Add Meal Type' }).fill('Late night');
    await mealTypeMenu.getByRole('button', { name: 'Add Meal Type' }).click();
    await expect(
      mealTypeMenu.getByRole('button', { name: 'Late night', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Cuisine: Select' }).click();
    const cuisineMenu = page.getByRole('group', { name: 'Cuisine options' });
    await cuisineMenu.getByRole('textbox', { name: 'Add Cuisine' }).fill('Peruvian Nikkei');
    await cuisineMenu.getByRole('textbox', { name: 'Add Cuisine' }).press('Enter');
    await expect(
      cuisineMenu.getByRole('button', { name: 'Peruvian Nikkei', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');

    const instructionDraft = page.getByPlaceholder('Add instruction…');
    await instructionDraft.click();
    await instructionDraft.pressSequentially('Prep the aromatics:');
    const firstStep = page.getByRole('textbox', { name: 'Instruction step 1' });
    await firstStep.press('Shift+Enter');
    await firstStep.pressSequentially('- Mince #garlic');
    const suggestions = page.getByRole('listbox', { name: 'Ingredient suggestions' });
    await expect(
      suggestions.getByRole('option', { name: 'Create ingredient “garlic”' }),
    ).toBeVisible();
    await firstStep.press('Enter');
    await expect(firstStep).toHaveValue(/- Mince #garlic/);
    await firstStep.press('Enter');
    await expect(page.locator('.recipe-instruction-edit-step')).toHaveCount(2);
    await expect(firstStep).toHaveValue(/Prep the aromatics:\n- Mince #garlic\n- $/);
    await firstStep.pressSequentially('Dice **onion**');
    await firstStep.press('Enter');
    await expect(firstStep).toHaveValue(
      /Prep the aromatics:\n- Mince #garlic\n- Dice \*\*onion\*\*\n- $/,
    );
    await firstStep.press('Enter');
    await expect(firstStep).toHaveValue(
      /Prep the aromatics:\n- Mince #garlic\n- Dice \*\*onion\*\*\n$/,
    );

    await expect(page).toHaveURL(/\/recipes\/new$/);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(
      page.getByRole('heading', { name: 'DLC 25 editor workflow recipe' }),
    ).toBeVisible();
    await expect(page.locator('.recipe-metadata').first()).toContainText('Carbon steel wok');
    await expect(page.locator('.recipe-detail-classification')).toContainText('Savory Galette');
    await expect(page.locator('.recipe-detail-classification')).toContainText('Late night');
    await expect(page.locator('.recipe-detail-classification')).toContainText('Peruvian Nikkei');

    const stepItem = page.locator('.recipe-instruction-list > li').first();
    await expect(stepItem.locator('p')).toHaveText('Prep the aromatics:');
    const unorderedList = stepItem.locator('ul');
    await expect(unorderedList).toBeVisible();
    await expect(unorderedList).toHaveCSS('list-style-type', 'disc');
    expect(
      await unorderedList.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).paddingLeft),
      ),
    ).toBeGreaterThanOrEqual(16);
    await expect(unorderedList.locator('li')).toHaveCount(2);
    await expect(unorderedList.locator('li').nth(0)).toContainText('Mince garlic');
    await expect(unorderedList.locator('li').nth(1).locator('strong')).toHaveText('onion');

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByRole('combobox', { name: 'Food Type', exact: true })).toContainText(
      'Savory Galette',
    );
    await expect(page.getByRole('button', { name: /Equipment:.*Carbon steel wok/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Meal Type:.*Late night/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cuisine:.*Peruvian Nikkei/ })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Instruction step 1' })).toHaveValue(
      /Prep the aromatics:\n- Mince #garlic\n- Dice \*\*onion\*\*$/,
    );
  } finally {
    await deleteTestUser(request, user);
  }
});
