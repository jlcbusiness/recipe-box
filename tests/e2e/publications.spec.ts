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

test('Library Explorer defaults to Grid on desktop and exposes compact control picklists @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();

  try {
    const publicationResponse = await request.post(`${apiUrl}/rest/v1/rpc/create_publication`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_name: 'Explorer Cookbook',
        p_publication_type: 'book',
        p_author: 'A. Writer',
        p_edition: 'First edition',
        p_isbn: null,
        p_retailer_url: 'https://books.example.test/explorer',
        p_issue: null,
        p_site_url: null,
      },
    });
    expect(publicationResponse.ok()).toBe(true);
    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.getByRole('link', { name: 'Library' }).click();

    const typeTrigger = page.getByRole('button', { name: 'Type: All' });
    await expect(typeTrigger).toBeVisible();
    await expect(typeTrigger.locator('.publication-type-icon-all')).toBeVisible();
    const typeTriggerWidth = await typeTrigger.evaluate(
      (trigger) => trigger.getBoundingClientRect().width,
    );
    await typeTrigger.click();
    const typeOptions = page.getByRole('group', { name: 'Publication type options' });
    await expect(typeOptions.getByRole('button', { name: 'Books', exact: true })).toBeVisible();
    await typeOptions.getByRole('button', { name: 'Sites', exact: true }).click();
    const sitesTrigger = page.getByRole('button', { name: 'Type: Sites' });
    await expect(sitesTrigger.locator('.publication-type-icon-site')).toBeVisible();
    await expect(sitesTrigger).toHaveJSProperty('offsetWidth', typeTriggerWidth);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'Publication type options' })).toHaveCount(0);
    await expect(sitesTrigger).toBeFocused();
    await sitesTrigger.click();
    await page
      .getByRole('group', { name: 'Publication type options' })
      .getByRole('button', { name: 'All', exact: true })
      .click();

    await page.getByRole('button', { name: 'Type: All' }).click();
    await page.getByRole('heading', { name: 'Library' }).click();
    await expect(page.getByRole('group', { name: 'Publication type options' })).toHaveCount(0);

    const viewTrigger = page.getByRole('button', { name: 'Switch to List view' });
    await expect(viewTrigger.locator('svg')).toBeVisible();
    const expectViewAfterSortDirection = async () => {
      const controlBounds = await page
        .locator('.publication-explorer-toolbar > .publication-explorer-control')
        .evaluateAll((controls) =>
          controls.map((control) => {
            const bounds = control.getBoundingClientRect();
            const controlName = Array.from(control.classList).find((className) =>
              className.startsWith('publication-explorer-control-'),
            );
            return { controlName, x: bounds.x, y: bounds.y };
          }),
        );
      expect(controlBounds.map((control) => control.controlName)).toEqual([
        'publication-explorer-control-type',
        'publication-explorer-control-sort',
        'publication-explorer-control-sort-direction',
        'publication-explorer-control-view',
      ]);
      expect(controlBounds[3].x).toBeGreaterThan(controlBounds[2].x);
      expect(controlBounds[3].y).toBe(controlBounds[2].y);
    };
    await expectViewAfterSortDirection();
    await expect(page.locator('.publication-explorer-grid')).toBeVisible();
    await viewTrigger.click();
    const publicationTable = page.locator('.publication-explorer-table');
    await expect(publicationTable).toBeVisible();
    await expect(publicationTable).toHaveCSS('display', 'grid');
    const publicationColumnGap = await publicationTable.evaluate((table) =>
      Number.parseFloat(getComputedStyle(table).columnGap),
    );
    expect(publicationColumnGap).toBeCloseTo((3 * 96) / 25.4, 1);
    const publicationColumnCount = await publicationTable.evaluate(
      (table) => getComputedStyle(table).gridTemplateColumns.split(' ').length,
    );
    expect(publicationColumnCount).toBe(4);
    const publicationTableWidth = await publicationTable.evaluate(
      (table) => table.getBoundingClientRect().width,
    );
    const publicationTableContainerWidth = await page
      .locator('.publication-explorer-table-wrap')
      .evaluate((container) => container.getBoundingClientRect().width);
    expect(publicationTableWidth).toBeCloseTo(publicationTableContainerWidth, 1);
    const publicationTableRight = await publicationTable.evaluate(
      (table) => table.getBoundingClientRect().right,
    );
    const publicationLastCellRight = await publicationTable
      .locator('tbody tr:first-child td:last-child')
      .evaluate((cell) => cell.getBoundingClientRect().right);
    expect(publicationLastCellRight).toBeCloseTo(publicationTableRight, 1);
    await page.getByRole('button', { name: 'Switch to Grid view' }).click();
    await expect(page.locator('.publication-explorer-grid')).toBeVisible();
    await page.getByRole('button', { name: 'Switch to List view' }).click();

    const sortTrigger = page.getByRole('button', { name: 'Sort by Name' });
    await expect(sortTrigger.locator('svg')).toBeVisible();
    await sortTrigger.click();
    const sortOptions = page.getByRole('group', { name: 'Sort options' });
    await expect(
      sortOptions.getByRole('button', { name: 'Date Changed', exact: true }),
    ).toBeVisible();
    await sortOptions.getByRole('button', { name: 'Date Added', exact: true }).click();

    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Type' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Author' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Issue / Edition' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Recipes' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Date Added' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Date Changed' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Explorer Cookbook' })).toHaveAttribute(
      'href',
      /\/publications\//,
    );
    const explorerCookbookRow = page.getByRole('row', { name: /Explorer Cookbook/ });
    await expect(explorerCookbookRow.getByRole('img', { name: 'Book' })).toBeVisible();
    await expect(explorerCookbookRow.locator('td').last()).toHaveCSS('text-align', 'center');
    await expect(page.getByRole('complementary', { name: 'Publication preview' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Type: All' }).click();
    await page
      .getByRole('group', { name: 'Publication type options' })
      .getByRole('button', { name: 'Sites', exact: true })
      .click();
    await expect(page.getByText('No publications match this filter.')).toBeVisible();
    await page.getByRole('button', { name: 'Type: Sites' }).click();
    await page
      .getByRole('group', { name: 'Publication type options' })
      .getByRole('button', { name: 'All', exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expectViewAfterSortDirection();
    await expect(page.locator('.publication-explorer-mobile-list')).toBeVisible();
    await expect(page.locator('.publication-explorer-table')).toBeHidden();
    const triggerSizes = await page
      .locator('.publication-explorer-trigger')
      .evaluateAll((triggers) =>
        triggers.map((trigger) => {
          const { width, height } = trigger.getBoundingClientRect();
          return { width, height };
        }),
      );
    expect(triggerSizes).toHaveLength(4);
    expect(triggerSizes.every(({ width, height }) => width >= 48 && height >= 48)).toBe(true);
    await page.getByRole('button', { name: 'Type: All' }).click();
    const menuOptionSizes = await page
      .getByRole('group', { name: 'Publication type options' })
      .getByRole('button')
      .evaluateAll((options) => options.map((option) => option.getBoundingClientRect().height));
    expect(menuOptionSizes.every((height) => height >= 48)).toBe(true);
    await page.keyboard.press('Escape');
    const mobileTitle = page.getByRole('link', { name: 'Explorer Cookbook' });
    await expect(mobileTitle).toHaveCSS('white-space', 'nowrap');
    await expect(mobileTitle).toHaveCSS('text-overflow', 'ellipsis');
    await expectNoHorizontalOverflow(page);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Library Explorer filters, sorts, and shows compact publication metadata @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const { apiUrl, anonKey, serviceRoleKey } = await getLocalSupabaseConfig();
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
  const fixtures = [
    {
      name: 'Zebra Cookbook for an Exceptionally Long Collection Name That Must Truncate',
      type: 'book',
      author: 'Zed Writer',
      edition: 'Second edition',
      issue: null,
      retailerUrl: 'https://books.example.test/zebra',
      siteUrl: null,
    },
    {
      name: 'Apple Cookbook',
      type: 'book',
      author: 'Amy Writer, Alexandra Elizabeth Cooks and Writes for Busy Families Around the World',
      edition: 'First edition',
      issue: null,
      retailerUrl: 'https://books.example.test/apple',
      siteUrl: null,
    },
    {
      name: 'Midnight Magazine',
      type: 'magazine',
      author: null,
      edition: null,
      issue: 'December issue',
      retailerUrl: null,
      siteUrl: null,
    },
    {
      name: 'Cooks Online',
      type: 'site',
      author: null,
      edition: null,
      issue: null,
      retailerUrl: null,
      siteUrl: 'https://cooks.example.test',
    },
  ];
  const publicationIds = new Map<string, string>();

  try {
    for (const publication of fixtures) {
      const response = await request.post(`${apiUrl}/rest/v1/rpc/create_publication`, {
        headers,
        data: {
          p_name: publication.name,
          p_publication_type: publication.type,
          p_author: publication.author,
          p_edition: publication.edition,
          p_isbn: null,
          p_retailer_url: publication.retailerUrl,
          p_issue: publication.issue,
          p_site_url: publication.siteUrl,
        },
      });
      expect(response.ok()).toBe(true);
      publicationIds.set(publication.name, (await response.json()) as string);
    }

    const zebraName = 'Zebra Cookbook for an Exceptionally Long Collection Name That Must Truncate';
    const zebraPublicationId = publicationIds.get(zebraName);
    expect(zebraPublicationId).toBeTruthy();
    const publicationUpdate = await request.patch(
      `${apiUrl}/rest/v1/publications?id=eq.${zebraPublicationId}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Prefer: 'return=representation',
        },
        data: { name: zebraName },
      },
    );
    expect(publicationUpdate.ok()).toBe(true);
    const updatedZebra = (await publicationUpdate.json())[0] as {
      created_at: string;
      updated_at: string;
    };
    expect(Date.parse(updatedZebra.updated_at)).toBeGreaterThan(
      Date.parse(updatedZebra.created_at),
    );

    const publicationResponse = await request.get(
      `${apiUrl}/rest/v1/publications?select=name,created_at,updated_at`,
      { headers },
    );
    expect(publicationResponse.ok()).toBe(true);
    const publicationDates = (await publicationResponse.json()) as {
      name: string;
      created_at: string;
      updated_at: string;
    }[];
    const dateAscending = [...publicationDates]
      .sort(
        (left, right) =>
          Date.parse(left.created_at) - Date.parse(right.created_at) ||
          left.name.localeCompare(right.name),
      )
      .map(({ name }) => name);
    const dateDescending = [...publicationDates]
      .sort(
        (left, right) =>
          Date.parse(right.created_at) - Date.parse(left.created_at) ||
          left.name.localeCompare(right.name),
      )
      .map(({ name }) => name);
    const changedAscending = [...publicationDates]
      .sort(
        (left, right) =>
          Date.parse(left.updated_at) - Date.parse(right.updated_at) ||
          left.name.localeCompare(right.name),
      )
      .map(({ name }) => name);
    const changedDescending = [...publicationDates]
      .sort(
        (left, right) =>
          Date.parse(right.updated_at) - Date.parse(left.updated_at) ||
          left.name.localeCompare(right.name),
      )
      .map(({ name }) => name);

    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 1024, height: 900 });

    const createRecipe = async (name: string) => {
      await page.getByRole('link', { name: 'Recipe Tin', exact: true }).click();
      await page.getByRole('link', { name: 'Add Recipe' }).click();
      await page.getByLabel('Name').fill(name);
      const publicationPicker = page.getByRole('combobox', { name: 'Publication' });
      await publicationPicker.fill('Apple Cookbook');
      await page.getByRole('option', { name: /Apple Cookbook/ }).click();
      await page.getByRole('button', { name: 'Save recipe' }).click();
      await expect(page.getByRole('heading', { name })).toBeVisible();
      return new URL(page.url()).pathname.split('/').at(-1) ?? '';
    };

    await page.getByRole('link', { name: 'Recipe Tin', exact: true }).click();
    const activeRecipeId = await createRecipe('Active explorer recipe');
    const trashedRecipeId = await createRecipe('Trashed explorer recipe');
    const trashResponse = await request.post(`${apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers,
      data: { p_recipe_id: trashedRecipeId, p_expected_version: 1 },
    });
    expect(trashResponse.ok()).toBe(true);
    expect(activeRecipeId).not.toBe(trashedRecipeId);

    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(page.locator('.publication-explorer-grid')).toBeVisible();
    await page.getByRole('button', { name: 'Switch to List view' }).click();
    const getNames = () =>
      page.locator('.publication-explorer-table tbody tr > td:first-child a').allTextContents();
    const appleRow = page.getByRole('row', { name: /Apple Cookbook/ });
    await expect(appleRow.locator('td').nth(3)).toHaveText('1');

    const chooseFilter = async (label: string) => {
      await page.getByRole('button', { name: /^Type:/ }).click();
      await page
        .getByRole('group', { name: 'Publication type options' })
        .getByRole('button', { name: label, exact: true })
        .click();
    };
    await chooseFilter('Books');
    await expect(page.getByRole('button', { name: 'Type: Books' })).toBeVisible();
    expect(await getNames()).toEqual(['Apple Cookbook', zebraName]);
    await chooseFilter('Magazines');
    expect(await getNames()).toEqual(['Midnight Magazine']);
    await chooseFilter('Sites');
    expect(await getNames()).toEqual(['Cooks Online']);
    await chooseFilter('All');

    await page.setViewportSize({ width: 721, height: 900 });
    const publicationTableWrap = page.locator('.publication-explorer-table-wrap');
    const publicationTableDimensions = await publicationTableWrap.evaluate((element) => {
      const table = element.querySelector('table');
      return {
        containerWidth: element.clientWidth,
        containerScrollWidth: element.scrollWidth,
        tableWidth: table?.clientWidth,
        tableScrollWidth: table?.scrollWidth,
        columns: Array.from(table?.querySelectorAll('thead th') ?? []).map((header) => ({
          label: header.textContent,
          width: header.getBoundingClientRect().width,
        })),
      };
    });
    expect(
      publicationTableDimensions.containerScrollWidth,
      JSON.stringify(publicationTableDimensions),
    ).toBeLessThanOrEqual(publicationTableDimensions.containerWidth);
    const appleAuthorCell = appleRow.locator('[data-label="Author"]');
    const authorValueList = appleAuthorCell.locator('.publication-comma-values');
    await expect(authorValueList).toHaveCSS('display', 'flex');
    await expect(authorValueList).toHaveCSS('flex-wrap', 'wrap');
    const authorNames = appleAuthorCell.locator('.publication-list-author-name');
    await expect(authorNames).toHaveCount(2);
    expect(
      await authorNames.evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).whiteSpace === 'normal'),
      ),
    ).toBe(true);
    const authorPositions = await authorNames.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().top),
    );
    expect(authorPositions[1]).toBeGreaterThan(authorPositions[0]);
    await expect(appleRow.locator('[data-label="Name"]')).toHaveCSS('text-overflow', 'ellipsis');
    await expect(appleRow.locator('[data-label="Name"]')).toHaveCSS('overflow', 'hidden');

    const chooseSort = async (label: string) => {
      const sortOptions = page.getByRole('group', { name: 'Sort options' });
      if (!(await sortOptions.isVisible())) {
        await page.getByRole('button', { name: /^Sort by/ }).click();
      }
      await sortOptions.getByRole('button', { name: label, exact: true }).click();
    };
    const chooseSortDirection = async (direction: 'Ascending' | 'Descending') => {
      const action = direction === 'Ascending' ? 'Sort ascending' : 'Sort descending';
      await page.getByRole('button', { name: action, exact: true }).click();
    };
    const assertSort = async (
      label: string,
      ascendingNames: string[],
      descendingNames: string[],
    ) => {
      await chooseSort(label);
      expect(await getNames()).toEqual(ascendingNames);
      await chooseSortDirection('Descending');
      expect(await getNames()).toEqual(descendingNames);
      await chooseSortDirection('Ascending');
    };

    await assertSort(
      'Name',
      ['Apple Cookbook', 'Cooks Online', 'Midnight Magazine', zebraName],
      [zebraName, 'Midnight Magazine', 'Cooks Online', 'Apple Cookbook'],
    );
    await assertSort(
      'Type',
      ['Apple Cookbook', zebraName, 'Midnight Magazine', 'Cooks Online'],
      ['Cooks Online', 'Midnight Magazine', 'Apple Cookbook', zebraName],
    );
    await assertSort(
      'Author',
      ['Apple Cookbook', zebraName, 'Cooks Online', 'Midnight Magazine'],
      [zebraName, 'Apple Cookbook', 'Cooks Online', 'Midnight Magazine'],
    );
    await assertSort(
      'Issue / Edition',
      ['Midnight Magazine', 'Apple Cookbook', zebraName, 'Cooks Online'],
      [zebraName, 'Apple Cookbook', 'Midnight Magazine', 'Cooks Online'],
    );
    await assertSort(
      'Recipe count',
      ['Cooks Online', 'Midnight Magazine', zebraName, 'Apple Cookbook'],
      ['Apple Cookbook', 'Cooks Online', 'Midnight Magazine', zebraName],
    );
    await assertSort('Date Added', dateAscending, dateDescending);
    await assertSort('Date Changed', changedAscending, changedDescending);

    const gridTrigger = page.getByRole('button', { name: 'Switch to Grid view' });
    await gridTrigger.click();
    await expect(page.locator('.publication-explorer-grid > li')).toHaveCount(4);
    const appleCard = page
      .locator('.publication-explorer-card')
      .filter({ hasText: 'Apple Cookbook' });
    await expect(page.getByRole('link', { name: 'Apple Cookbook' })).toHaveAttribute(
      'title',
      /^Book\nAuthor: Amy Writer, Alexandra Elizabeth Cooks and Writes for Busy Families Around the World\nEdition: First edition\nRecipes: 1\nDate Added: .+\nDate Changed: .+$/,
    );
    const appleAuthors = appleCard.locator('.publication-grid-authors');
    await expect(appleAuthors).toContainText('Amy Writer');
    await expect(appleAuthors).toContainText('Alexandra Elizabeth Cooks');
    await expect(appleAuthors.locator('.publication-grid-author-break')).toHaveCount(1);
    await expect(appleCard).not.toContainText('Book by');
    await expect(appleCard).toContainText('1 recipe');
    const magazineCard = page
      .locator('.publication-explorer-card')
      .filter({ hasText: 'Midnight Magazine' });
    const magazineCover = magazineCard.locator('.publication-cover-magazine');
    await expect(magazineCover).toHaveCSS('border-top-color', 'rgb(155, 63, 50)');
    await expect(magazineCover).toHaveCSS('color', 'rgb(155, 63, 50)');
    await expect(magazineCover).toHaveCSS('font-weight', '700');
    await expect(magazineCover.locator('.publication-cover-issue')).toHaveCSS('font-size', '8px');
    const siteLink = page.getByRole('link', { name: 'Cooks Online' });
    await expect(siteLink).toHaveAttribute(
      'title',
      /\nRecipes: 0\nDate Added: .+\nDate Changed: .+/,
    );
    const siteDesktopCover = await siteLink.locator('.publication-cover-site').evaluate((cover) => {
      const { top, height } = cover.getBoundingClientRect();
      return { top, height };
    });
    const bookDesktopCover = await appleCard
      .locator('.publication-cover-book')
      .evaluate((cover) => {
        const { top, height } = cover.getBoundingClientRect();
        return { top, height };
      });
    const siteDesktopLink = await siteLink.evaluate((link) => {
      const { top, height } = link.getBoundingClientRect();
      return { top, height };
    });
    const siteDesktopTitleTop = await siteLink
      .locator('.publication-list-title')
      .evaluate((title) => title.getBoundingClientRect().top);
    const bookDesktopTitleTop = await appleCard
      .locator('.publication-list-title')
      .evaluate((title) => title.getBoundingClientRect().top);
    expect(siteDesktopCover.top - siteDesktopLink.top).toBe(
      (siteDesktopLink.height - siteDesktopCover.height) / 2 - 1,
    );
    expect(siteDesktopTitleTop - siteDesktopCover.top).toBe(
      bookDesktopTitleTop - bookDesktopCover.top,
    );
    await page.setViewportSize({ width: 721, height: 900 });
    expect(
      await appleCard.evaluate((card) => card.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(220);
    await page.setViewportSize({ width: 1024, height: 900 });
    const gridA11y = await new AxeBuilder({ page }).analyze();
    expect(gridA11y.violations).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    const siteCard = page.locator('.publication-explorer-card').filter({ hasText: 'Cooks Online' });
    const bookCoverWidth = await appleCard
      .locator('.publication-cover-book')
      .evaluate((cover) => cover.getBoundingClientRect().width);
    const siteCoverWidth = await siteCard
      .locator('.publication-cover-site')
      .evaluate((cover) => cover.getBoundingClientRect().width);
    expect(siteCoverWidth).toBe(bookCoverWidth);
    expect(bookCoverWidth).toBe(48);
    const siteMobileCover = await siteCard.locator('.publication-cover-site').evaluate((cover) => {
      const { top, height } = cover.getBoundingClientRect();
      return { top, height };
    });
    const siteMobileLink = await siteCard
      .locator('.publication-explorer-card-link')
      .evaluate((link) => {
        const { top, height } = link.getBoundingClientRect();
        return { top, height };
      });
    const bookMobileCover = await appleCard.locator('.publication-cover-book').evaluate((cover) => {
      const { top, height } = cover.getBoundingClientRect();
      return { top, height };
    });
    const siteMobileTitleTop = await siteCard
      .locator('.publication-list-title')
      .evaluate((title) => title.getBoundingClientRect().top);
    const bookMobileTitleTop = await appleCard
      .locator('.publication-list-title')
      .evaluate((title) => title.getBoundingClientRect().top);
    expect(siteMobileCover.top - siteMobileLink.top).toBe(
      (siteMobileLink.height - siteMobileCover.height) / 2 - 1,
    );
    expect(siteMobileTitleTop - siteMobileCover.top).toBe(bookMobileTitleTop - bookMobileCover.top);
    const mobileTitle = appleCard.locator('.publication-list-title');
    await expect(mobileTitle).toHaveCSS('white-space', 'nowrap');
    await expect(mobileTitle).toHaveCSS('text-overflow', 'ellipsis');
    const mobileAuthors = appleCard.locator('.publication-grid-authors');
    await expect(mobileAuthors).toHaveCSS('white-space', 'nowrap');
    await expect(mobileAuthors).toHaveCSS('text-overflow', 'ellipsis');
    const zebraTitle = page
      .locator('.publication-explorer-card')
      .filter({ hasText: 'Zebra Cookbook' })
      .locator('.publication-list-title');
    expect(await zebraTitle.evaluate((title) => title.scrollWidth > title.clientWidth)).toBe(true);
    expect(
      await mobileAuthors.evaluate((authors) => authors.scrollWidth > authors.clientWidth),
    ).toBe(true);

    await page.setViewportSize({ width: 1024, height: 900 });
    const listTrigger = page.getByRole('button', { name: 'Switch to List view' });
    await listTrigger.click();
    const listA11y = await new AxeBuilder({ page }).analyze();
    expect(listA11y.violations).toEqual([]);
    const mobileList = page.locator('.publication-explorer-mobile-list');
    for (const width of [352, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(mobileList).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Library Explorer keeps its empty state accessible on mobile @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('link', { name: 'Library' }).click();
    await expect(page.getByText('No publications yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch to Grid view' })).toBeVisible();
    const emptyA11y = await new AxeBuilder({ page }).analyze();
    expect(emptyA11y.violations).toEqual([]);
    await page.getByRole('button', { name: 'Switch to Grid view' }).click();
    await expect(page.getByText('No publications yet.')).toBeVisible();
    const emptyGridA11y = await new AxeBuilder({ page }).analyze();
    expect(emptyGridA11y.violations).toEqual([]);
    for (const width of [352, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expectNoHorizontalOverflow(page);
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

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
    await expect(
      page.locator('.publication-recipe-list thead th').allTextContents(),
    ).resolves.toEqual([
      'Name',
      'State',
      'Opinion',
      'Meal Type',
      'Food Type',
      'Time',
      'Page or URL',
    ]);
    if (test.info().project.name === 'chromium') {
      await page.setViewportSize({ width: 768, height: 900 });
      const publicationTable = page.locator('.publication-recipe-list');
      const publicationScroll = page.locator('.publication-recipe-scroll');
      await expect(publicationTable).toHaveCSS('display', 'grid');
      expect(
        await publicationScroll.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
    }
    const mobilePublicationRow = page.locator('.publication-recipe-list tbody tr').first();
    for (const width of [352, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator('.publication-recipe-list thead')).toBeHidden();
      await expect(mobilePublicationRow).toHaveCSS('display', 'flex');
      await expect(mobilePublicationRow).toHaveCSS('flex-wrap', 'wrap');
      await expect(mobilePublicationRow.locator('[data-label="Name"]')).toHaveCSS(
        'flex-basis',
        '100%',
      );
      const stateBounds = await mobilePublicationRow.locator('[data-label="State"]').boundingBox();
      const mobileOpinion = mobilePublicationRow.locator('[data-label="Opinion"]');
      await expect(mobileOpinion).toHaveCSS('flex-direction', 'column');
      expect(
        await mobileOpinion.evaluate((cell) => getComputedStyle(cell, '::before').display),
      ).toBe('block');
      const opinionBounds = await mobileOpinion.boundingBox();
      if (!stateBounds || !opinionBounds) {
        throw new Error('Mobile recipe metadata must be measurable.');
      }
      expect(Math.abs(stateBounds.y - opinionBounds.y)).toBeLessThan(1);
      expect(opinionBounds.x).toBeGreaterThan(stateBounds.x);
      await expect(mobilePublicationRow.locator('[data-label="Time"]')).toBeVisible();
      await expect(mobilePublicationRow.locator('[data-label="Total Time"]')).toHaveCount(0);
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

test('publication recipe URLs show the host on desktop and truncate on mobile @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    const sitePublicationResponse = await request.post(`${apiUrl}/rest/v1/rpc/create_publication`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${user.accessToken}` },
      data: {
        p_name: 'Recipe Journal',
        p_publication_type: 'site',
        p_author: null,
        p_edition: null,
        p_isbn: null,
        p_retailer_url: null,
        p_issue: null,
        p_site_url: 'https://recipes.example.org',
      },
    });
    expect(sitePublicationResponse.ok(), await sitePublicationResponse.text()).toBeTruthy();
    const sitePublicationId = (await sitePublicationResponse.json()) as string;
    const externalRecipeUrl =
      'https://www.recipes.example.org/desserts/an-extraordinarily-long-recipe-name?source=library';

    await page.goto(`/recipes/new?publication=${sitePublicationId}`);
    await page.getByLabel('Name').fill('Recipe URL display');
    await page.getByLabel('Url').fill(externalRecipeUrl);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Recipe URL display' })).toBeVisible();
    const recipeDetailPath = new URL(page.url()).pathname;
    const sourceRecipeLink = page.locator('.recipe-attribution .recipe-source-link');
    await expect(sourceRecipeLink).toHaveAttribute('href', externalRecipeUrl);
    await expect(sourceRecipeLink).toHaveCSS('color', 'rgb(120, 59, 48)');
    await expect(page.getByRole('link', { name: 'Recipe Journal' })).toHaveCSS(
      'color',
      'rgb(56, 96, 68)',
    );

    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(recipeDetailPath);
    const desktopSourceLink = page.locator('.recipe-attribution .recipe-source-link');
    const desktopPublicationLink = page.locator('.recipe-attribution > a').first();
    await expect(desktopPublicationLink).toHaveCSS('text-decoration-line', 'none');
    await desktopPublicationLink.hover();
    await expect(desktopPublicationLink).toHaveCSS('text-decoration-line', 'underline');
    await expect(desktopSourceLink).toHaveCSS('color', 'rgb(120, 59, 48)');
    await expect(desktopSourceLink).toHaveCSS('text-decoration-line', 'none');
    await desktopSourceLink.hover();
    await expect(desktopSourceLink).toHaveCSS('text-decoration-line', 'underline');
    await page.goto(`/publications/${sitePublicationId}`);
    const recipeUrlLink = page.locator('[data-label="Page or URL"] a');
    await expect(recipeUrlLink).toHaveAttribute('href', externalRecipeUrl);
    await expect(recipeUrlLink.locator('.publication-recipe-url-host')).toHaveText(
      'recipes.example.org',
    );
    await expect(recipeUrlLink.locator('.publication-recipe-url-full')).toHaveCSS(
      'display',
      'none',
    );
    await expect(page.locator('[data-label="Page or URL"]')).toHaveCSS('white-space', 'nowrap');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(recipeUrlLink.locator('.publication-recipe-url-host')).toHaveCSS(
      'display',
      'none',
    );
    const mobileRecipeUrl = recipeUrlLink.locator('.publication-recipe-url-full');
    await expect(mobileRecipeUrl).toHaveText(externalRecipeUrl);
    await expect(recipeUrlLink).toHaveCSS('text-overflow', 'ellipsis');
    await expect(recipeUrlLink).toHaveCSS('white-space', 'nowrap');
    expect(await recipeUrlLink.evaluate((link) => link.scrollWidth > link.clientWidth)).toBe(true);
    await expectNoHorizontalOverflow(page);
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
