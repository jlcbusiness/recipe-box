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

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}

test('an owner can create a publication, assign a recipe, and return it to the Recipe Tin @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Library' }).click();
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    const addPublicationLink = page.getByRole('link', { name: 'Add publication' });
    await expect(addPublicationLink).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await addPublicationLink.hover();
    await expect(addPublicationLink).toHaveCSS('background-color', 'rgb(56, 96, 68)');
    if (testInfo.project.name === 'Fold 6') {
      const libraryHeading = await page.getByRole('heading', { name: 'Library' }).boundingBox();
      const addPublicationBounds = await addPublicationLink.boundingBox();
      expect(addPublicationBounds?.x).toBeGreaterThanOrEqual(
        (libraryHeading?.x ?? 0) + (libraryHeading?.width ?? 0),
      );
      expect(
        Math.abs(
          (addPublicationBounds?.y ?? 0) +
            (addPublicationBounds?.height ?? 0) -
            ((libraryHeading?.y ?? 0) + (libraryHeading?.height ?? 0)),
        ),
      ).toBeLessThan(4);
    }
    await addPublicationLink.click();
    const savePublication = page.getByRole('button', { name: 'Save', exact: true });
    const cancelPublication = page.getByRole('link', { name: 'Cancel', exact: true });
    const [saveBounds, cancelBounds] = await Promise.all([
      savePublication.boundingBox(),
      cancelPublication.boundingBox(),
    ]);
    expect(saveBounds).not.toBeNull();
    expect(cancelBounds).not.toBeNull();
    expect(cancelBounds?.y).toBe(saveBounds?.y);
    expect(cancelBounds?.height).toBe(saveBounds?.height);
    await page.getByRole('radio', { name: 'Book' }).check();
    await expect(page.locator('.publication-type-choice input[type="radio"]:checked')).toHaveCSS(
      'opacity',
      '0',
    );
    await expect(page.locator('.publication-type-choice label:has(input:checked)')).toHaveCSS(
      'background-color',
      'rgb(56, 96, 68)',
    );
    await page.getByLabel('Name').fill('The Home Cook');
    await page.getByLabel('Author').fill('Mira Stone');
    await page.getByLabel('Edition').fill('Second edition');
    const [nameBounds, authorBounds, editionBounds, isbnBounds, retailerBounds] = await Promise.all(
      [
        page.getByLabel('Name').boundingBox(),
        page.getByLabel('Author').boundingBox(),
        page.getByLabel('Edition').boundingBox(),
        page.getByLabel('ISBN').boundingBox(),
        page.getByLabel('Retailer URL').boundingBox(),
      ],
    );
    expect(authorBounds?.width).toBeLessThan(nameBounds?.width ?? 0);
    expect(editionBounds?.width).toBeLessThan(authorBounds?.width ?? 0);
    expect(isbnBounds?.width).toBeLessThan(editionBounds?.width ?? 0);
    expect(retailerBounds?.width).toBe(nameBounds?.width);
    if (test.info().project.name === 'chromium') {
      expect(editionBounds?.y).toBe(authorBounds?.y);
      expect(isbnBounds?.y).toBe(authorBounds?.y);
    }
    await expect(page.getByText('ISBN-13 begins with 978 or 979.')).toBeVisible();
    await page.getByLabel('ISBN').fill('9780306406157');
    await expect(page.getByLabel('ISBN')).toHaveValue('978-0-306-40615-7');
    await page.getByLabel('ISBN').fill('0-306-40615-3');
    await expect(page.getByLabel('ISBN')).toHaveValue('0-306-40615-3');
    await page.getByLabel('Retailer URL').fill('www.books.example.test/home-cook');
    await savePublication.click();
    await expect(page.locator('.publication-form').getByRole('alert')).toContainText(
      'valid ISBN-10 or ISBN-13',
    );
    await page.getByLabel('ISBN').fill('0306406152');
    await expect(page.getByLabel('ISBN')).toHaveValue('0-306-40615-2');
    await savePublication.click();
    await expect(page.getByRole('heading', { name: 'The Home Cook' })).toBeVisible();
    const publicationId = new URL(page.url()).pathname.split('/').at(-1);
    const publicationRecord = await request.get(
      `${apiUrl}/rest/v1/publications?select=isbn,retailer_url&id=eq.${publicationId}`,
      {
        headers: { apikey: anonKey, Authorization: `Bearer ${user.accessToken}` },
      },
    );
    expect(await publicationRecord.json()).toEqual([
      { isbn: '0306406152', retailer_url: 'https://www.books.example.test/home-cook' },
    ]);
    await expect(page.locator('.publication-cover-book')).toBeVisible();
    await expect(page.getByText('No recipes in this publication yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to Library' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Recipe Tin' }).click();
    const addRecipeLink = page.getByRole('link', { name: 'Add Recipe' });
    await expect(addRecipeLink).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await addRecipeLink.hover();
    await expect(addRecipeLink).toHaveCSS('background-color', 'rgb(56, 96, 68)');
    await addRecipeLink.click();
    await page.getByLabel('Name').fill('Roasted tomato soup');
    const publicationPicker = page.getByRole('combobox', { name: 'Publication' });
    await expect(publicationPicker).toHaveValue('Recipe Tin');
    await publicationPicker.focus();
    await expect(page.getByRole('option', { name: /The Home Cook/ })).toBeVisible();
    await publicationPicker.fill('The Home');
    const addPublicationOption = page.getByRole('option', { name: 'Add "The Home"' });
    const matchingPublicationOption = page.getByRole('option', { name: /The Home Cook/ });
    const publicationOptionFontSize = await matchingPublicationOption.evaluate(
      (element) => getComputedStyle(element).fontSize,
    );
    await expect(addPublicationOption).toHaveCSS('font-size', publicationOptionFontSize);
    await publicationPicker.fill('The Home Cook');
    await publicationPicker.press('ArrowDown');
    await publicationPicker.press('Enter');
    await expect(publicationPicker).toHaveValue('The Home Cook');
    const pageField = page.getByLabel('Page(s)');
    const publicationBounds = await publicationPicker.boundingBox();
    const pageFieldBounds = await pageField.boundingBox();
    expect(pageFieldBounds?.y).toBe(publicationBounds?.y);
    expect(pageFieldBounds?.width).toBeLessThanOrEqual(55);
    await pageField.fill('717-718');
    expect((await pageField.boundingBox())?.width).toBeGreaterThan(pageFieldBounds?.width ?? 0);
    await pageField.fill('142-145');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Roasted tomato soup' })).toBeVisible();
    const recipeUrl = page.url();
    const recipeLink = page.getByRole('link', { name: 'The Home Cook' });
    await expect(recipeLink).toBeVisible();
    const attribution = page.locator('.recipe-detail-title > .recipe-attribution');
    await expect(attribution).toContainText('p. 142-145');
    await expect(attribution.locator('cite')).toHaveCSS('font-style', 'italic');
    await recipeLink.click();
    await expect(page.getByRole('heading', { name: 'The Home Cook' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Roasted tomato soup' })).toBeVisible();
    if (test.info().project.name === 'Fold 6') {
      await expect(page.locator('.publication-recipe-list td[data-label="State"]')).toBeVisible();
      await expect(
        page.locator('.publication-recipe-list td[data-label="Meal Type"]'),
      ).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    if (test.info().project.name === 'Fold 6') {
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalOverflow(page);
    }

    await page.getByRole('link', { name: 'Recipe Tin' }).click();
    await expect(page.getByRole('link', { name: 'Roasted tomato soup' })).toHaveCount(0);
    await page.goto(recipeUrl.replace('/publications/', '/recipes/'));
    await page.getByRole('link', { name: 'Edit' }).click();
    const editPublicationPicker = page.getByRole('combobox', { name: 'Publication' });
    await editPublicationPicker.fill('Recipe Tin');
    await page.getByRole('option', { name: 'Recipe Tin', exact: true }).click();
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Roasted tomato soup' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'The Home Cook' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Recipe Tin' }).click();
    await expect(page.getByRole('link', { name: 'Roasted tomato soup' })).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('publication records and creation history stay private to their owner @e2e', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const otherOwner = await createTestUser(request);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();

  try {
    const foreignPublicationResponse = await request.post(
      `${apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${otherOwner.accessToken}`,
        },
        data: {
          p_name: 'Other Account Cookbook',
          p_publication_type: 'book',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: null,
        },
      },
    );
    expect(foreignPublicationResponse.ok()).toBe(true);
    const foreignPublicationId = await foreignPublicationResponse.json();
    expect(typeof foreignPublicationId).toBe('string');

    await signIn(page, owner.email, owner.password);
    await page.getByRole('link', { name: 'Library' }).click();
    await page.getByRole('link', { name: 'Add publication' }).click();
    await page.getByRole('radio', { name: 'Book' }).check();
    await page.getByLabel('Name').fill('Private Cookbook');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Private Cookbook' })).toBeVisible();

    const publicationId = new URL(page.url()).pathname.split('/').at(-1);
    expect(publicationId).toBeTruthy();
    const historyUrl = new URL(`${apiUrl}/rest/v1/publication_history`);
    historyUrl.searchParams.set('select', 'id,event_type,after_data');
    historyUrl.searchParams.set('record_id', `eq.${publicationId}`);
    const ownerHistoryResponse = await request.get(historyUrl.toString(), {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${owner.accessToken}`,
      },
    });
    expect(ownerHistoryResponse.ok()).toBe(true);
    const ownerHistory = await ownerHistoryResponse.json();
    expect(ownerHistory).toHaveLength(1);
    expect(ownerHistory[0].event_type).toBe('publication.created');
    expect(ownerHistory[0].after_data.name).toBe('Private Cookbook');

    const publicationUrl = new URL(`${apiUrl}/rest/v1/publications`);
    publicationUrl.searchParams.set('select', 'id');
    publicationUrl.searchParams.set('id', `eq.${publicationId}`);
    const otherPublicationResponse = await request.get(publicationUrl.toString(), {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${otherOwner.accessToken}`,
      },
    });
    expect(otherPublicationResponse.ok()).toBe(true);
    expect(await otherPublicationResponse.json()).toEqual([]);

    const otherHistoryResponse = await request.get(historyUrl.toString(), {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${otherOwner.accessToken}`,
      },
    });
    expect(otherHistoryResponse.ok()).toBe(true);
    expect(await otherHistoryResponse.json()).toEqual([]);

    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Other Account Cookbook' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Recipe Tin' }).click();
    await page.getByRole('link', { name: 'Add Recipe' }).click();
    await page.getByLabel('Name').fill('Rejected foreign assignment');
    await page.locator('input[name="publication_id"]').evaluate((input, value) => {
      (input as HTMLInputElement).value = value;
    }, foreignPublicationId);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.locator('.recipe-form').getByRole('alert')).toContainText(
      'This recipe is no longer available.',
    );
    await expect(page).toHaveURL(/\/recipes\/new$/);
  } finally {
    await deleteTestUser(request, otherOwner);
    await deleteTestUser(request, owner);
  }
});

test('publication forms show only the fields for their selected type @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Library' }).click();
    await page.getByRole('link', { name: 'Add publication' }).click();

    await page.getByRole('radio', { name: 'Magazine Issue' }).check();
    await page.getByLabel('Name').fill('Bon Appetit');
    await page.getByLabel('Issue / edition / date').fill('October 2024');
    await expect(page.getByLabel('Author')).toHaveCount(0);
    await expect(page.getByLabel('Site URL')).toHaveCount(0);
    const magazineA11y = await new AxeBuilder({ page }).analyze();
    expect(magazineA11y.violations).toEqual([]);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bon Appetit' })).toBeVisible();
    await expect(page.locator('.publication-cover-magazine')).toBeVisible();
    await expect(page.locator('.publication-detail-meta')).toContainText('October 2024');
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await page.getByRole('link', { name: 'Add publication' }).click();
    await page.getByRole('radio', { name: 'Site' }).check();
    await page.getByLabel('Name').fill('Example Cooking');
    await page.getByLabel('Site URL').fill('https://cooking.example.test');
    await expect(page.getByLabel('Author')).toHaveCount(0);
    await expect(page.getByLabel('Issue / edition / date')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Example Cooking' })).toBeVisible();
    await expect(page.locator('.publication-cover-site')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('inline publication creation preserves the unsaved recipe draft @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Recipe Tin' }).click();
    await page.getByRole('link', { name: 'Add Recipe' }).click();
    await page.getByLabel('Name').fill('Lemon olive-oil cake');
    await page.getByLabel('Notes (Markdown)').fill('Keep the **zest** with the sugar.');

    const publicationPicker = page.getByRole('combobox', { name: 'Publication' });
    await expect(publicationPicker).toHaveValue('Recipe Tin');
    await publicationPicker.fill('Unmatched source');
    await page.getByLabel('Name').click();
    await expect(publicationPicker).toHaveValue('Recipe Tin');
    await expect(page.locator('input[name="publication_id"]')).toHaveValue('');
    await publicationPicker.fill('Test Kitchen');
    const addPublicationOption = page.getByRole('option', { name: 'Add "Test Kitchen"' });
    await expect(addPublicationOption).toHaveCSS('text-decoration-line', 'none');
    await expect(addPublicationOption).toHaveCSS('color', 'rgb(36, 40, 32)');
    await addPublicationOption.hover();
    await expect(addPublicationOption).toHaveCSS('background-color', 'rgb(237, 244, 233)');
    await page.getByRole('option', { name: 'Add "Test Kitchen"' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add publication' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Name')).toHaveValue('Test Kitchen');
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('option', { name: 'Add "Test Kitchen"' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('Name')).toHaveValue('Lemon olive-oil cake');
    await expect(page.getByLabel('Notes (Markdown)')).toHaveValue(
      'Keep the **zest** with the sugar.',
    );

    await page.getByRole('option', { name: 'Add "Test Kitchen"' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: 'Site' }).check();
    await dialog.getByLabel('Name').fill('Test Kitchen');
    await dialog.getByLabel('Site URL').fill('www.kitchen.example.test');
    const dialogA11y = await new AxeBuilder({ page })
      .include('#publication-create-dialog')
      .analyze();
    expect(dialogA11y.violations).toEqual([]);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('Name')).toHaveValue('Lemon olive-oil cake');
    await expect(page.getByLabel('Notes (Markdown)')).toHaveValue(
      'Keep the **zest** with the sugar.',
    );
    await expect(page.getByLabel('Url')).toBeVisible();
    await page.getByLabel('Url').fill('www.kitchen.example.test/lemon-cake');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Lemon olive-oil cake' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Test Kitchen' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'https://www.kitchen.example.test/lemon-cake' }),
    ).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});
