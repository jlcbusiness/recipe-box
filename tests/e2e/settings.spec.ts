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
  await expect(page).toHaveURL(/\/publications$/);
}

test('Library stays visually distinct and shared picklists support type-ahead @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();

    const libraryLink = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Library' });
    const isMobile = (page.viewportSize()?.width ?? 0) <= 640;
    await expect(libraryLink).not.toHaveAttribute('aria-current');
    await expect(libraryLink).toHaveCSS('color', 'rgb(56, 96, 68)');
    if (isMobile) {
      await expect(libraryLink).toHaveCSS('border-color', 'rgb(56, 96, 68)');
    }

    const volumeSelect = page.getByRole('combobox', { name: 'Volume', exact: true });
    await volumeSelect.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await volumeSelect.press('m');
    const metricOption = page.getByRole('option', { name: 'Metric', exact: true });
    await expect(metricOption).toHaveClass(/is-active/);
    await expect(volumeSelect).toContainText('US customary');
    expect(await volumeSelect.getAttribute('aria-activedescendant')).toBe(
      await metricOption.getAttribute('id'),
    );

    const openPicklistA11y = await new AxeBuilder({ page }).analyze();
    expect(openPicklistA11y.violations).toEqual([]);
    await volumeSelect.press('Escape');
    await expect(volumeSelect).toBeFocused();
  } finally {
    await deleteTestUser(request, user);
  }
});

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
    const leftHand = page.getByRole('button', { name: 'Left', exact: true });
    const rightHand = page.getByRole('button', { name: 'Right', exact: true });
    await expect(page.getByRole('heading', { name: 'Recipe presentation' })).toHaveCount(0);
    const presentationSelect = page.getByRole('combobox', { name: 'View', exact: true });
    await expect(volumeSelect).toContainText('US customary');
    await expect(weightSelect).toContainText('US customary');
    await expect(presentationSelect).toContainText('Standard');
    if (testInfo.project.name === 'Fold 6') {
      await expect(rightHand).toHaveAttribute('aria-pressed', 'true');
      await expect(leftHand).toHaveAttribute('aria-pressed', 'false');
    } else {
      await expect(leftHand).toBeHidden();
      await expect(rightHand).toBeHidden();
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const volumeWidth = (await volumeSelect.boundingBox())?.width ?? 0;

    const picklistsSection = page.getByRole('region', { name: 'Picklists' });
    const sectionSpacing = await picklistsSection.evaluate((section) => {
      const heading = section.querySelector('h2');
      if (!heading) throw new Error('Expected the Picklists heading.');

      const ruleTop = section.getBoundingClientRect().top;
      return (
        heading.getBoundingClientRect().top -
        ruleTop -
        Number.parseFloat(getComputedStyle(section).borderTopWidth)
      );
    });
    await expect(page.getByRole('region', { name: 'Personal preferences' })).toHaveCSS(
      'padding-bottom',
      '28px',
    );
    expect(sectionSpacing).toBeCloseTo(8, 0);

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

    if (testInfo.project.name === 'Fold 6') {
      await leftHand.click();
      await expect(page.getByRole('status')).toHaveText('Saved.');
      await expect(leftHand).toHaveAttribute('aria-pressed', 'true');
      const handSaved = await request.get(
        `${config.apiUrl}/rest/v1/accounts?select=hand_preference&id=eq.${user.id}`,
        { headers },
      );
      expect(await handSaved.json()).toEqual([{ hand_preference: 'left' }]);
    }

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

      const handPreference = page.locator('.settings-hand-preference');
      const handToggle = page.locator('.settings-hand-toggle');
      const settingsBounds = await page.locator('.settings-main').boundingBox();
      const handPreferenceBounds = await handPreference.boundingBox();
      const handButtonBounds = await handToggle.getByRole('button').evaluateAll((buttons) =>
        buttons.map((button) => {
          const { left, right } = button.getBoundingClientRect();
          return { left, right };
        }),
      );
      const handButtonHeights = await handToggle
        .getByRole('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
      expect(handButtonHeights).toEqual([36, 36]);
      expect((handPreferenceBounds?.x ?? 0) + (handPreferenceBounds?.width ?? 0) / 2).toBeCloseTo(
        (settingsBounds?.x ?? 0) + (settingsBounds?.width ?? 0) / 2,
        0,
      );
      expect(handButtonBounds[1].left - handButtonBounds[0].right).toBeCloseTo(48, 0);

      const disclosureCenters = await Promise.all(
        ['Picklists', 'Ingredients', 'Edit tags', 'Trusted densities'].map((name) =>
          page
            .getByRole('button', { name, exact: true })
            .locator('svg')
            .evaluate((chevron) => {
              const bounds = chevron.getBoundingClientRect();
              return bounds.top + bounds.height / 2;
            }),
        ),
      );
      const [, ...remainingCenters] = disclosureCenters;
      const spacing = remainingCenters.map(
        (center, index) => center - (disclosureCenters[index] ?? 0),
      );
      expect(spacing[2]).toBeCloseTo(spacing[1] ?? 0, 0);
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
    const densitySection = page.getByRole('region', { name: 'Trusted densities' });
    const picklistsSection = page.getByRole('region', { name: 'Picklists' });
    const recipeColumnsSection = page.getByRole('region', { name: 'Recipe columns' });
    const tagsSection = page.getByRole('region', { name: 'Tags' });
    const accordionSections = [
      picklistsSection,
      recipeColumnsSection,
      section,
      tagsSection,
      densitySection,
    ];
    for (const accordionSection of accordionSections) {
      await expect(accordionSection).toHaveCSS('border-top-width', '1px');
      await expect(accordionSection).toHaveCSS('margin-top', '0px');
      await expect(accordionSection).toHaveCSS('padding-top', '8px');
      await expect(accordionSection).toHaveCSS('padding-bottom', '8px');
      await expect(accordionSection.locator('h2')).toHaveCSS('min-height', '44px');
    }
    const accordionSpacing = await Promise.all(
      accordionSections.map((accordionSection) =>
        accordionSection.evaluate((section) => {
          const heading = section.querySelector('h2');
          if (!heading) throw new Error('Expected an accordion heading.');
          const sectionBounds = section.getBoundingClientRect();
          const headingBounds = heading.getBoundingClientRect();
          const borderTop = Number.parseFloat(getComputedStyle(section).borderTopWidth);
          return {
            above: headingBounds.top - sectionBounds.top - borderTop,
            below: sectionBounds.bottom - headingBounds.bottom,
          };
        }),
      ),
    );
    for (const spacing of accordionSpacing) {
      expect(spacing.above).toBeCloseTo(spacing.below, 0);
    }
    await expect(recipeColumnsSection.getByRole('button', { name: 'Check None' })).toHaveCSS(
      'transform',
      'none',
    );
    await expect(page.getByRole('region', { name: 'Data management' })).toHaveCSS(
      'margin-top',
      '0px',
    );
    const toggle = section.getByRole('button', { name: 'Ingredients' });
    const picklistToggle = page.getByRole('button', { name: 'Picklists' });
    const tagToggle = page.getByRole('button', { name: 'Tags' });
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
      await expect(toggle.locator('span')).toHaveCSS('text-decoration-line', 'none');
      await expect(picklistToggle.locator('span')).toHaveCSS('text-decoration-line', 'none');
      await expect(tagToggle.locator('span')).toHaveCSS('text-decoration-line', 'none');
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

test('Settings recipe column order is saved and used by the Find column chooser @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/find');
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      'name publication state',
    );
    await page.getByRole('link', { name: 'Settings' }).click();

    const sectionToggle = page.getByRole('button', { name: 'Recipe columns' });
    await expect(sectionToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('list', { name: 'Recipe column order' })).toBeHidden();
    await sectionToggle.click();
    await expect(sectionToggle).toHaveAttribute('aria-expanded', 'true');
    const columnSection = page.getByRole('region', { name: 'Recipe columns' });
    const columnList = columnSection.getByRole('list', { name: 'Recipe column order' });
    await columnList.scrollIntoViewIfNeeded();
    await expect(page.locator('[data-recipe-column-row="opinion"]')).toHaveCount(1);
    for (const legacyColumn of ['enthusiasm', 'verdict', 'reason']) {
      await expect(page.locator(`[data-recipe-column-row="${legacyColumn}"]`)).toHaveCount(0);
    }
    const listRightPadding = await columnList.evaluate((list) =>
      Number.parseFloat(getComputedStyle(list).paddingRight),
    );
    expect(listRightPadding).toBeGreaterThanOrEqual(11);
    const eyeToScrollbarGap = await columnList.evaluate((list) => {
      const listElement = list as HTMLElement;
      const lastVisibilityButton = listElement.querySelector<HTMLElement>(
        '[data-recipe-column-row]:last-child button[aria-pressed]',
      );
      if (!lastVisibilityButton) throw new Error('Expected a visibility control in the last row.');
      const scrollbarWidth = listElement.offsetWidth - listElement.clientWidth;
      return (
        listElement.getBoundingClientRect().right -
        scrollbarWidth -
        lastVisibilityButton.getBoundingClientRect().right
      );
    });
    expect(eyeToScrollbarGap).toBeGreaterThanOrEqual(11);
    const headingBox = await sectionToggle.boundingBox();
    const listBox = await columnList.boundingBox();
    if (!headingBox || !listBox) throw new Error('Expected the expanded recipe column list.');
    const checkNoneBox = await columnSection
      .getByRole('button', { name: 'Check None' })
      .boundingBox();
    if (!checkNoneBox) throw new Error('Expected the Check None control beside the header.');
    expect(checkNoneBox.x).toBeGreaterThanOrEqual(headingBox.x + headingBox.width - 1);
    expect(
      Math.abs(checkNoneBox.y + checkNoneBox.height / 2 - (headingBox.y + headingBox.height / 2)),
    ).toBeLessThan(1);
    const listDimensions = await columnList.evaluate((list) => ({
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
    }));
    expect(listDimensions.clientHeight).toBeLessThanOrEqual(8 * 53);
    expect(listDimensions.scrollHeight).toBeGreaterThan(listDimensions.clientHeight);
    const idleHandle = columnList
      .locator('[data-recipe-column-row]')
      .nth(7)
      .getByRole('button', { name: /^Reorder/ });
    const idleHandleBox = await idleHandle.boundingBox();
    if (!idleHandleBox) throw new Error('Expected the last visible drag handle.');
    const idleScrollY = await page.evaluate(() => window.scrollY);
    await page.mouse.move(
      idleHandleBox.x + idleHandleBox.width / 2,
      idleHandleBox.y + idleHandleBox.height / 2,
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await columnList.evaluate((list) => list.scrollTop)).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(idleScrollY);
    const rowWidths = await columnList
      .locator('[data-recipe-column-row]')
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().width));
    expect(Math.max(...rowWidths) - Math.min(...rowWidths)).toBeLessThan(0.5);
    const urlRow = page.locator('[data-recipe-column-row="recipe_url"]');
    const dragBounds = await urlRow.getByRole('button', { name: 'Reorder URL' }).boundingBox();
    const eyeBounds = await urlRow
      .getByRole('button', { name: 'Show URL in recipe tables' })
      .boundingBox();
    if (!dragBounds || !eyeBounds)
      throw new Error('Expected URL row drag and visibility controls.');
    expect(eyeBounds.x).toBeGreaterThanOrEqual(dragBounds.x + dragBounds.width);
    await expect(page.getByRole('button', { name: 'Reorder URL' })).toHaveAttribute(
      'title',
      'Drag to reorder. Use Ctrl+Up or Ctrl+Down to move by keyboard.',
    );
    const settingsAccessibility = await new AxeBuilder({ page }).analyze();
    expect(settingsAccessibility.violations).toEqual([]);

    const publicationHandle = page.getByRole('button', { name: 'Reorder Publication' });
    const columnOrderStatus = page
      .getByRole('region', { name: 'Recipe columns' })
      .getByRole('status');
    await publicationHandle.press('Control+ArrowDown');
    await expect(columnOrderStatus).toHaveText('Publication moved to position 3.');
    await page.getByRole('button', { name: 'Reorder Name' }).press('Control+ArrowDown');
    await expect(columnOrderStatus).toHaveText('Name moved to position 2.');
    await page.reload();
    await expect(page.getByRole('list', { name: 'Recipe column order' })).toBeHidden();
    await page.getByRole('button', { name: 'Recipe columns' }).click();
    await expect(page.locator('[data-recipe-column-row="publication_page"]')).toHaveCount(1);
    await expect(page.locator('[data-recipe-column-row="publication_page"]')).toHaveAttribute(
      'data-recipe-column-row',
      'publication_page',
    );
    const orderedKeys = await page
      .locator('[data-recipe-column-row]')
      .evaluateAll((rows) =>
        rows.slice(0, 4).map((row) => row.getAttribute('data-recipe-column-row')),
      );
    expect(orderedKeys).toEqual(['publication_page', 'name', 'publication', 'recipe_url']);

    const urlLabel = page
      .locator('[data-recipe-column-row="recipe_url"]')
      .getByText('URL', { exact: true });
    const firstRow = page.locator('[data-recipe-column-row="publication_page"]');
    await columnList.scrollIntoViewIfNeeded();
    const sourceBox = await urlLabel.boundingBox();
    const targetBox = await firstRow.boundingBox();
    if (!sourceBox || !targetBox) throw new Error('Expected visible recipe column reorder rows.');
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(columnOrderStatus).toHaveText('URL moved to position 1.');
    await page.reload();
    const draggedOrder = await page
      .locator('[data-recipe-column-row]')
      .evaluateAll((rows) =>
        rows.slice(0, 4).map((row) => row.getAttribute('data-recipe-column-row')),
      );
    expect(draggedOrder).toEqual(['recipe_url', 'publication_page', 'name', 'publication']);

    await page.setViewportSize({ width: 900, height: 520 });
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Recipe columns' }).click();
    const firstHandle = page.getByRole('button', { name: 'Reorder Name' });
    const orderList = page.getByRole('list', { name: 'Recipe column order' });
    await orderList.scrollIntoViewIfNeeded();
    const firstHandleBox = await firstHandle.boundingBox();
    if (!firstHandleBox) throw new Error('Expected the first recipe column handle.');
    await page.mouse.move(
      firstHandleBox.x + firstHandleBox.width / 2,
      firstHandleBox.y + firstHandleBox.height / 2,
    );
    const initialScrollHeight = await orderList.evaluate((list) => list.scrollHeight);
    const initialPageScrollY = await page.evaluate(() => window.scrollY);
    await page.mouse.down();
    const orderListBox = await orderList.boundingBox();
    if (!orderListBox) throw new Error('Expected the scrollable recipe column list.');
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const pointerY = Math.min(orderListBox.y + orderListBox.height - 4, viewportHeight - 2);
    await page.mouse.move(orderListBox.x + orderListBox.width / 2, pointerY, { steps: 8 });
    await expect.poll(() => orderList.evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
    await expect
      .poll(() =>
        orderList.evaluate((list) => list.scrollTop + list.clientHeight >= list.scrollHeight - 1),
      )
      .toBe(true);
    expect(await orderList.evaluate((list) => list.scrollHeight)).toBe(initialScrollHeight);
    expect(await page.evaluate(() => window.scrollY)).toBe(initialPageScrollY);
    await page.keyboard.press('Escape');
    await page.mouse.up();

    const hidePublication = page.getByRole('button', {
      name: 'Hide Publication in recipe tables',
    });
    await hidePublication.click();
    const publicationRow = page.locator('[data-recipe-column-row="publication"]');
    await expect(publicationRow).toHaveAttribute('data-hidden', 'true');
    await expect(publicationRow.getByText('Publication', { exact: true })).toHaveCSS(
      'text-decoration-line',
      'line-through',
    );
    await expect(columnOrderStatus).toHaveText('Publication hidden from recipe tables.');
    await page.reload();
    await page.getByRole('button', { name: 'Recipe columns' }).click();
    await expect(
      page.getByRole('button', { name: 'Show Publication in recipe tables' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await page.goto('/recipes/find');
    const recipeListPreferences = page.locator('.explorer-list-preferences');
    await expect(recipeListPreferences).not.toHaveAttribute(
      'data-visible-columns',
      /(^|\s)publication(\s|$)/,
    );
    const chooser = page.getByRole('button', { name: 'Choose List columns' });
    await chooser.click();
    const chooserFieldset = page.getByRole('group', { name: 'List columns' });
    await expect(chooserFieldset.locator(':scope > button').first()).toHaveText('Reset columns');
    const nameCheckbox = page.getByRole('checkbox', { name: /Name/ });
    await expect(nameCheckbox).toBeChecked();
    await expect(nameCheckbox).toBeDisabled();
    const publicationCheckbox = page.getByRole('checkbox', { name: 'Publication' });
    await expect(publicationCheckbox).not.toBeChecked();
    await publicationCheckbox.check();
    await expect(recipeListPreferences).toHaveAttribute(
      'data-visible-columns',
      /(^|\s)publication(\s|$)/,
    );
    await page.getByRole('button', { name: 'Reset columns' }).click();
    await expect(publicationCheckbox).not.toBeChecked();
    await expect(recipeListPreferences).not.toHaveAttribute(
      'data-visible-columns',
      /(^|\s)publication(\s|$)/,
    );
    await expect(page.getByRole('checkbox', { name: 'URL', exact: true })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'State' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Total Time' })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Publication' })).not.toBeChecked();
    const chooserOrder = await page
      .locator('.explorer-list-preferences-popover')
      .evaluate((fieldset) =>
        Array.from(
          fieldset.querySelectorAll(
            ':scope > .explorer-list-preferences-required, :scope > .explorer-list-preferences-option',
          ),
        ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim()),
      );
    expect(chooserOrder.slice(0, 3)).toEqual(['URL', 'Page', 'NameAlways shown']);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Recipe columns' }).click();
    await page.getByRole('button', { name: 'Check None' }).click();
    await expect(page.locator('[data-recipe-column-row="total_time_minutes"]')).toHaveAttribute(
      'data-hidden',
      'true',
    );
    await expect(page.locator('[data-recipe-column-row="name"]')).not.toHaveAttribute(
      'data-hidden',
      'true',
    );
    await expect(columnOrderStatus).toHaveText('All optional recipe columns hidden.');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Settings redirects signed-out visitors to sign in @e2e', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('Email')).toBeVisible();
});
