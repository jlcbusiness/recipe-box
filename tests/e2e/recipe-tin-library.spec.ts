import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}

async function expectBreadcrumbPath(page: import('@playwright/test').Page, labels: string[]) {
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb.getByRole('link')).toHaveText(labels.slice(0, -1));
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(labels[labels.length - 1]);
  await expect(breadcrumb.getByRole('link')).toHaveCount(labels.length - 1);
  await expect(breadcrumb.locator('.private-breadcrumb-separator')).toHaveText(
    Array.from({ length: labels.length - 1 }, () => '>'),
  );
  const ancestorColor = await breadcrumb
    .getByRole('link')
    .first()
    .evaluate((element) => getComputedStyle(element).color);
  await expect(breadcrumb.locator('.private-breadcrumb-separator').first()).toHaveCSS(
    'color',
    ancestorColor,
  );
}

async function expectBreadcrumbAncestry(page: import('@playwright/test').Page, labels: string[]) {
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(breadcrumb.getByRole('link')).toHaveText(labels);
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveCount(0);
  await expect(breadcrumb.locator('.private-breadcrumb-separator')).toHaveText(
    Array.from({ length: labels.length - 1 }, () => '>'),
  );
  const ancestorColor = await breadcrumb
    .getByRole('link')
    .first()
    .evaluate((element) => getComputedStyle(element).color);
  await expect(breadcrumb.locator('.private-breadcrumb-separator').first()).toHaveCSS(
    'color',
    ancestorColor,
  );
}

async function expectNoBreadcrumb(page: import('@playwright/test').Page) {
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
}

async function expectBreadcrumbAlignedWithHeading(
  page: import('@playwright/test').Page,
  headingName: string,
) {
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  const firstLink = breadcrumb.getByRole('link').first();
  const heading = page.getByRole('heading', { name: headingName, level: 1 });
  const [breadcrumbBox, firstLinkBox, headingBox] = await Promise.all([
    breadcrumb.boundingBox(),
    firstLink.boundingBox(),
    heading.boundingBox(),
  ]);
  if (!breadcrumbBox || !firstLinkBox || !headingBox) {
    throw new Error('Expected breadcrumb and heading geometry');
  }
  expect(Math.abs(firstLinkBox.x - headingBox.x)).toBeLessThanOrEqual(1);
  expect(headingBox.y - (breadcrumbBox.y + breadcrumbBox.height)).toBeLessThanOrEqual(16);
}

async function expectRecipeActionsAlignedWithBreadcrumb(page: import('@playwright/test').Page) {
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
  const actions = page.locator('.recipe-detail-heading-actions');
  const [breadcrumbBox, actionsBox] = await Promise.all([
    breadcrumb.boundingBox(),
    actions.boundingBox(),
  ]);
  if (!breadcrumbBox || !actionsBox) throw new Error('Expected recipe header geometry');
  const breadcrumbCenter = breadcrumbBox.y + breadcrumbBox.height / 2;
  const actionsCenter = actionsBox.y + actionsBox.height / 2;
  expect(Math.abs(breadcrumbCenter - actionsCenter)).toBeLessThanOrEqual(3);
}

async function expectRecipeSectionDividerCloseToHeading(page: import('@playwright/test').Page) {
  const heading = page.locator('.recipe-detail-heading');
  const firstSection = page.locator('.recipe-summary-layout > .recipe-detail-section').first();
  const [headingBox, sectionBox] = await Promise.all([
    heading.boundingBox(),
    firstSection.boundingBox(),
  ]);
  if (!headingBox || !sectionBox) throw new Error('Expected recipe heading and section geometry');
  expect(sectionBox.y - (headingBox.y + headingBox.height)).toBeLessThanOrEqual(10);
}

async function createBook(
  request: import('@playwright/test').APIRequestContext,
  config: Awaited<ReturnType<typeof getLocalSupabaseConfig>>,
  accessToken: string,
  name: string,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/create_publication`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      p_name: name,
      p_publication_type: 'book',
      p_author: null,
      p_edition: null,
      p_isbn: null,
      p_retailer_url: null,
      p_issue: null,
      p_site_url: null,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as string;
}

async function createMagazine(
  request: import('@playwright/test').APIRequestContext,
  config: Awaited<ReturnType<typeof getLocalSupabaseConfig>>,
  accessToken: string,
  name: string,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/create_publication`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      p_name: name,
      p_publication_type: 'magazine',
      p_author: null,
      p_edition: null,
      p_isbn: null,
      p_retailer_url: null,
      p_issue: null,
      p_site_url: null,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as string;
}

async function createRecipe(
  request: import('@playwright/test').APIRequestContext,
  config: Awaited<ReturnType<typeof getLocalSupabaseConfig>>,
  accessToken: string,
  publicationId: string,
  name = 'Recipe Tin attribution recipe',
  publicationPage: string | null = null,
  recipeUrl: string | null = null,
) {
  const response = await request.post(
    `${config.apiUrl}/rest/v1/rpc/save_recipe_with_relationships`,
    {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
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
        p_ingredient_rows: [],
        p_instruction_steps: [],
        p_publication_id: publicationId,
        p_publication_page: publicationPage,
        p_recipe_url: recipeUrl,
        p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
        p_tag_ids: [],
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = (await response.json()) as { id: string }[];
  return recipe.id;
}

test('private recipe detail shows its parent path without repeating publication attribution @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const tinResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id&publication_type=eq.collection`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    );
    expect(tinResponse.ok(), await tinResponse.text()).toBeTruthy();
    const [{ id: tinId }] = (await tinResponse.json()) as { id: string }[];
    const publicationName = 'Breadcrumb Magazine';
    const publicationId = await createMagazine(request, config, user.accessToken, publicationName);
    const tinRecipeName = 'Tin breadcrumb recipe';
    const bookRecipeName = 'Book breadcrumb recipe';
    const recipeUrl = 'https://example.test/breadcrumb-recipe';
    const tinRecipeId = await createRecipe(request, config, user.accessToken, tinId, tinRecipeName);
    const bookRecipeId = await createRecipe(
      request,
      config,
      user.accessToken,
      publicationId,
      bookRecipeName,
      '12',
      recipeUrl,
    );

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByLabel('Email')).toHaveCount(0);

    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });

    await page.goto(`/recipes/${tinRecipeId}`);
    await expect(breadcrumb).toBeVisible();
    await expectBreadcrumbAncestry(page, ['Library', 'Recipe Tin']);
    await expect(breadcrumb.getByRole('link', { name: 'Library', exact: true })).toHaveAttribute(
      'href',
      '/publications',
    );
    await expect(breadcrumb.getByRole('link', { name: 'Recipe Tin', exact: true })).toHaveAttribute(
      'href',
      `/publications/${tinId}`,
    );
    await expect(breadcrumb.getByRole('link', { name: tinRecipeName, exact: true })).toHaveCount(0);
    await expect(page.locator('.recipe-attribution')).toHaveCount(0);
    await expectBreadcrumbAlignedWithHeading(page, tinRecipeName);
    if ((page.viewportSize()?.width ?? 0) >= 761) {
      await expectRecipeActionsAlignedWithBreadcrumb(page);
      await expectRecipeSectionDividerCloseToHeading(page);
    }

    await page.setViewportSize({ width: 384, height: 915 });
    await expectNoHorizontalOverflow(page);
    await page.goto(`/recipes/${bookRecipeId}`);
    await expectBreadcrumbAncestry(page, ['Library', publicationName]);
    await expectBreadcrumbAlignedWithHeading(page, bookRecipeName);
    await expect(
      breadcrumb.getByRole('link', { name: publicationName, exact: true }),
    ).toHaveAttribute('href', `/publications/${publicationId}`);
    await expect(page.locator('.recipe-attribution')).toContainText('12');
    await expect(page.locator('.recipe-attribution')).not.toContainText('·');
    await expect(page.locator('.recipe-attribution')).not.toContainText(publicationName);
    await expect(page.locator('.recipe-attribution .recipe-source-link')).toHaveAttribute(
      'href',
      recipeUrl,
    );
    await expectNoHorizontalOverflow(page);
    const publicationLink = breadcrumb.getByRole('link', {
      name: publicationName,
      exact: true,
    });
    expect((await publicationLink.boundingBox())?.height).toBeGreaterThanOrEqual(48);
    const recipeAccessibility = await new AxeBuilder({ page }).analyze();
    expect(recipeAccessibility.violations).toEqual([]);
    const libraryLink = breadcrumb.getByRole('link', { name: 'Library', exact: true });
    await libraryLink.focus();
    await page.keyboard.press('Tab');
    await expect(publicationLink).toBeFocused();
    await expect(publicationLink).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/publications/${publicationId}`);
    await expect(page.getByRole('heading', { name: publicationName, level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Add Recipe breadcrumbs replace the eyebrow beside the title @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByLabel('Email')).toHaveCount(0);

    await page.goto('/recipes/new');
    await expectBreadcrumbAncestry(page, ['Library', 'Recipe Tin']);
    await expectBreadcrumbAlignedWithHeading(page, 'Add Recipe');
    await expect(page.getByText('ADD TO YOUR COLLECTION', { exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('private nested pages use their parent path and direct destinations stay breadcrumb-free @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationName = 'Nested Route Cookbook';
    const publicationId = await createBook(request, config, user.accessToken, publicationName);
    const recipeName = 'Nested route recipe';
    const recipeId = await createRecipe(
      request,
      config,
      user.accessToken,
      publicationId,
      recipeName,
    );

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByLabel('Email')).toHaveCount(0);

    await page.goto(`/publications/${publicationId}/history`);
    await expectBreadcrumbPath(page, ['Library', publicationName, 'History']);
    await expectBreadcrumbAlignedWithHeading(page, `History: ${publicationName}`);

    await page.goto(`/recipes/${recipeId}/history`);
    await expectBreadcrumbPath(page, ['Library', publicationName, recipeName, 'History']);
    await expectBreadcrumbAlignedWithHeading(page, `History: ${recipeName}`);

    await page.goto(`/recipes/${recipeId}/edit`);
    await expectBreadcrumbAncestry(page, ['Library', publicationName, recipeName]);
    await expectBreadcrumbAlignedWithHeading(page, 'Edit Recipe');

    await page.goto(`/recipes/new?publication=${publicationId}`);
    await expectBreadcrumbAncestry(page, ['Library', publicationName]);
    await expectBreadcrumbAlignedWithHeading(page, 'Add Recipe');

    await page.goto('/recipes/new');
    await expectBreadcrumbAncestry(page, ['Library', 'Recipe Tin']);
    await expectBreadcrumbAlignedWithHeading(page, 'Add Recipe');

    for (const route of [
      '/publications',
      '/publications/new',
      '/recipes/find',
      '/recipes/trash',
      '/help',
      '/settings?tab=recipe-data',
      '/account/username',
      '/account/app-data',
    ]) {
      await page.goto(route);
      await expectNoBreadcrumb(page);
      if (route === '/account/app-data') {
        await expect(page.getByRole('heading', { name: 'App data', level: 1 })).toBeVisible();
      }
      if (route === '/settings?tab=recipe-data') {
        await expect(page.getByRole('tab', { name: 'Recipe data' })).toHaveAttribute(
          'aria-selected',
          'true',
        );
      }
    }

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Recipe Tin stays first after Library sorting and remains type-filterable @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const tinResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id&publication_type=eq.collection`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    );
    expect(tinResponse.ok(), await tinResponse.text()).toBeTruthy();
    const [{ id: tinId }] = (await tinResponse.json()) as { id: string }[];
    const tinRecipeId = await createRecipe(request, config, user.accessToken, tinId);

    await createBook(request, config, user.accessToken, 'Aardvark Cookbook');
    await createBook(request, config, user.accessToken, 'Zebra Cookbook');

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByLabel('Email')).toHaveCount(0);
    const initialViewport = page.viewportSize();
    if (!initialViewport) throw new Error('Expected a configured browser viewport');
    await page.setViewportSize({ width: 352, height: 864 });
    const privateShell = page.locator('.private-shell');
    const initialHand = await privateShell.getAttribute('data-hand');
    const assertMobileOrder = async (hand: 'left' | 'right', selectors: string[]) => {
      await privateShell.evaluate((element, nextHand) => {
        element.setAttribute('data-hand', nextHand);
      }, hand);
      const positions = await Promise.all(
        selectors.map((selector) =>
          page.locator(selector).evaluate((element) => element.getBoundingClientRect().x),
        ),
      );
      expect(positions).toEqual(
        [...positions].sort((firstPosition, secondPosition) => firstPosition - secondPosition),
      );
    };
    await assertMobileOrder('right', [
      '.private-nav-utility-link[href="/help"]',
      '.private-nav-links a[href="/recipes/trash"]',
      '.private-nav-utility-link[href="/settings"]',
      '.private-nav-links a[href="/publications"]',
      '.private-nav-links a[href="/recipes/find"]',
      '.account-menu-trigger',
    ]);
    await assertMobileOrder('left', [
      '.private-nav-utility-link[href="/help"]',
      '.account-menu-trigger',
      '.private-nav-links a[href="/recipes/find"]',
      '.private-nav-links a[href="/publications"]',
      '.private-nav-utility-link[href="/settings"]',
      '.private-nav-links a[href="/recipes/trash"]',
    ]);
    await privateShell.evaluate((element, hand) => {
      element.setAttribute('data-hand', hand ?? 'right');
    }, initialHand);
    await page.setViewportSize(initialViewport);
    await page.goto(`/recipes/${tinRecipeId}`);
    const recipeTinTheme = page.locator('main.recipe-tin-theme');
    await expect(recipeTinTheme).toHaveCount(1);
    const printAction = page.getByRole('button', {
      name: initialViewport.width <= 720 ? 'Download' : 'Print',
    });
    const editAction = page.getByRole('link', { name: 'Edit' });
    await expect(printAction).toHaveCSS('background-color', 'rgb(96, 76, 56)');
    await expect(printAction).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(printAction).toHaveCSS('border-color', 'rgb(154, 107, 63)');
    await expect(editAction).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(editAction).toHaveCSS('color', 'rgb(40, 36, 32)');
    await expect(editAction).toHaveCSS('border-color', 'rgb(96, 76, 56)');
    const recipeTinPalette = await recipeTinTheme.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        paper: styles.getPropertyValue('--paper').trim(),
        leaf: styles.getPropertyValue('--leaf').trim(),
        wash: styles.getPropertyValue('--tin-wash').trim(),
      };
    });
    expect(recipeTinPalette).toEqual({
      paper: '#fffdf6',
      leaf: '#604c38',
      wash: '#f4efe9',
    });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 253, 246)');
    await expect(
      page
        .getByRole('navigation', { name: 'Breadcrumb' })
        .getByRole('link', { name: 'Recipe Tin', exact: true }),
    ).toHaveAttribute('href', `/publications/${tinId}`);
    await expect(page.locator('.recipe-attribution')).toHaveCount(0);
    await page.goto(`/recipes/${tinRecipeId}/edit`);
    const tinEditTheme = page.locator('main.recipe-tin-theme');
    await expect(tinEditTheme).toHaveCount(1);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 253, 246)');
    await expect(tinEditTheme).toHaveCSS('color', 'rgb(40, 36, 32)');
    await page.goto('/publications?sort=name&direction=desc&view=list');

    const resultLinks =
      (page.viewportSize()?.width ?? 1280) <= 720
        ? page.locator('.publication-explorer-mobile-list .publication-explorer-mobile-link')
        : page.locator('.publication-explorer-table tbody tr td a');

    await expect(resultLinks).toHaveCount(3);
    await expect(resultLinks.nth(0)).toHaveText('Recipe Tin');
    await expect(resultLinks.nth(1)).toHaveText('Zebra Cookbook');
    await expect(resultLinks.nth(2)).toHaveText('Aardvark Cookbook');
    const libraryA11y = await new AxeBuilder({ page }).analyze();
    expect(libraryA11y.violations).toEqual([]);
    await expectNoHorizontalOverflow(page);

    await page.goto('/publications?sort=name&direction=asc&view=list');
    await expect(resultLinks).toHaveCount(3);
    await expect(resultLinks.nth(0)).toHaveText('Recipe Tin');
    await expect(resultLinks.nth(1)).toHaveText('Aardvark Cookbook');
    await expect(resultLinks.nth(2)).toHaveText('Zebra Cookbook');

    await page.goto('/publications?type=book&sort=name&direction=desc&view=list');
    await expect(resultLinks).toHaveCount(2);
    await expect(resultLinks.nth(0)).toHaveText('Zebra Cookbook');
    await expect(resultLinks.filter({ hasText: 'Recipe Tin' })).toHaveCount(0);

    await page.goto('/publications?type=collection&view=grid');
    const tinGridLink = page.getByRole('link', { name: 'Recipe Tin', exact: true });
    const tinCard = page.locator('.publication-explorer-card-collection');
    await expect(tinGridLink).toBeVisible();
    await expect(tinCard).toHaveCSS('background-color', 'rgb(255, 249, 231)');
    await expect(tinCard).toHaveCSS('border-color', 'rgb(154, 107, 63)');
    const tinImage = tinGridLink.getByRole('img', { name: 'Recipe Tin', exact: true });
    await expect(tinImage).toBeVisible();
    await expect(tinImage).toHaveAttribute('src', /recipe-tin-3e1f5f0d8f3a\.webp/);
    const tinImageBounds = await tinImage.boundingBox();
    const tinCoverBounds = await tinGridLink.locator('.publication-cover').boundingBox();
    const tinCopy = tinGridLink.locator('.publication-list-copy');
    const tinCopyBounds = await tinCopy.boundingBox();
    const tinTitleBounds = await tinGridLink.locator('.publication-list-title').boundingBox();
    await expect(tinCopy).toHaveCSS('margin-left', '11.34px');
    expect(tinImageBounds).not.toBeNull();
    expect(tinCoverBounds).not.toBeNull();
    expect(tinCopyBounds).not.toBeNull();
    expect(tinTitleBounds).not.toBeNull();
    if (!tinImageBounds || !tinCoverBounds || !tinCopyBounds || !tinTitleBounds) {
      throw new Error('Expected the Recipe Tin cover and Library text to be visible');
    }

    expect(
      Math.abs(
        tinCoverBounds.y + tinCoverBounds.height / 2 - tinCopyBounds.y - tinCopyBounds.height / 2,
      ),
    ).toBeLessThanOrEqual(1);
    expect(tinImageBounds.x + tinImageBounds.width).toBeLessThan(tinTitleBounds.x);

    await page.goto(`/publications/${tinId}`);
    await expect(page.locator('main.recipe-tin-theme')).toHaveCount(1);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 249, 231)');
    await expect(page.getByRole('heading', { name: 'Recipe Tin', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    const viewportWidth = page.viewportSize()?.width ?? 1280;
    const isMobile = viewportWidth <= 720;
    const addRecipeLink = isMobile
      ? page.locator('.publication-mobile-add')
      : page.locator('.publication-detail-heading .publication-new-recipe');
    await expect(addRecipeLink).toBeVisible();
    const sortButton = page.locator('.recipe-explorer-sort-picklist');
    await expect(sortButton).toHaveCount(0);
    if (isMobile) {
      await expect(addRecipeLink).toHaveAttribute('aria-label', 'Add Recipe');
      const toolbarControlStyles = await page
        .locator(
          '.recipe-explorer-toolbar .recipe-explorer-sort-picklist, .recipe-explorer-toolbar .recipe-explorer-trigger, .explorer-list-preferences-trigger',
        )
        .evaluateAll((elements) =>
          elements.map((element) => {
            const styles = getComputedStyle(element);
            return {
              backgroundColor: styles.backgroundColor,
              borderTopColor: styles.borderTopColor,
              borderRightColor: styles.borderRightColor,
              borderBottomColor: styles.borderBottomColor,
            };
          }),
        );
      expect(toolbarControlStyles).toEqual(
        Array(2).fill({
          backgroundColor: 'rgb(255, 252, 241)',
          borderTopColor: 'rgb(154, 107, 63)',
          borderRightColor: 'rgb(154, 107, 63)',
          borderBottomColor: 'rgb(154, 107, 63)',
        }),
      );
      await expect(addRecipeLink).toHaveCSS('background-color', 'rgb(96, 76, 56)');
      await expect(addRecipeLink).toHaveCSS('color', 'rgb(255, 249, 231)');
      await expect(addRecipeLink).toHaveCSS('border-color', 'rgb(96, 76, 56)');
      const addRecipeBounds = await addRecipeLink.boundingBox();
      const columnsButton = page.getByRole('button', { name: 'Choose List columns' });
      await expect(columnsButton).toBeVisible();
      const columnsButtonBounds = await columnsButton.boundingBox();
      const viewControlsBounds = await page.locator('.recipe-explorer-view-controls').boundingBox();
      expect(addRecipeBounds).not.toBeNull();
      expect(columnsButtonBounds).not.toBeNull();
      expect(viewControlsBounds).not.toBeNull();
      if (!addRecipeBounds) throw new Error('Expected the Add Recipe action to be visible');
      if (!columnsButtonBounds) throw new Error('Expected List columns controls to be visible');
      if (!viewControlsBounds) throw new Error('Expected explorer view controls to be visible');
      expect(Math.round(addRecipeBounds.width)).toBe(40);
      expect(Math.round(addRecipeBounds.height)).toBe(40);
      expect(columnsButtonBounds.x + columnsButtonBounds.width).toBeLessThan(addRecipeBounds.x);
      const gapAfterViewControls =
        columnsButtonBounds.x - (viewControlsBounds.x + viewControlsBounds.width);
      expect(gapAfterViewControls).toBeGreaterThanOrEqual(-1);
      expect(gapAfterViewControls).toBeLessThanOrEqual(1);
      expect(columnsButtonBounds.width).toBe(40);
      expect(columnsButtonBounds.height).toBe(40);
      if (Math.abs(columnsButtonBounds.y - addRecipeBounds.y) <= 1) {
        expect(addRecipeBounds.x).toBeGreaterThanOrEqual(
          columnsButtonBounds.x + columnsButtonBounds.width,
        );
      } else {
        expect(addRecipeBounds.y).toBeGreaterThanOrEqual(
          columnsButtonBounds.y + columnsButtonBounds.height,
        );
      }
      expect(addRecipeBounds.x + addRecipeBounds.width).toBeLessThanOrEqual(
        page.viewportSize()?.width ?? 0,
      );

      const [toolbarContent, toolbarControls, toolbarFilters, toolbarActions] = await Promise.all([
        page.locator('.explorer-list-preferences-toolbar-content').boundingBox(),
        page.locator('.explorer-list-preferences-controls').boundingBox(),
        page.locator('.recipe-marker-filters').boundingBox(),
        page.locator('.publication-mobile-actions').boundingBox(),
      ]);
      if (!toolbarContent || !toolbarControls || !toolbarFilters || !toolbarActions) {
        throw new Error('Expected toolbar item bounds');
      }
      expect(toolbarFilters.y).toBeGreaterThanOrEqual(toolbarContent.y + toolbarContent.height);
      expect(toolbarActions.y).toBeCloseTo(toolbarControls.y, 0);

      const toolbarBounds = await page
        .locator('.explorer-list-preferences-toolbar:has(.publication-mobile-add)')
        .boundingBox();
      const actionGroupBounds = await page.locator('.publication-mobile-actions').boundingBox();
      expect(toolbarBounds).not.toBeNull();
      expect(actionGroupBounds).not.toBeNull();
      if (!toolbarBounds || !actionGroupBounds) {
        throw new Error('Expected the toolbar and mobile action group to be visible');
      }
      expect(Math.abs(toolbarFilters.x - toolbarBounds.x)).toBeLessThanOrEqual(1);
      const chooserOverlapsActions =
        columnsButtonBounds.x < actionGroupBounds.x + actionGroupBounds.width &&
        columnsButtonBounds.x + columnsButtonBounds.width > actionGroupBounds.x &&
        columnsButtonBounds.y < actionGroupBounds.y + actionGroupBounds.height &&
        columnsButtonBounds.y + columnsButtonBounds.height > actionGroupBounds.y;
      expect(chooserOverlapsActions).toBe(false);
      expect(
        Math.abs(
          toolbarBounds.x + toolbarBounds.width - actionGroupBounds.x - actionGroupBounds.width,
        ),
      ).toBeLessThanOrEqual(1);

      await columnsButton.click();
      const columnsPane = page.locator('.explorer-list-preferences-popover');
      await expect(columnsPane).toBeVisible();
      const columnsPaneBounds = await columnsPane.boundingBox();
      expect(columnsPaneBounds).not.toBeNull();
      if (!columnsPaneBounds) throw new Error('Expected the List columns pane to be visible');
      expect(columnsPaneBounds.x).toBeGreaterThanOrEqual(0);
      expect(columnsPaneBounds.x + columnsPaneBounds.width).toBeLessThanOrEqual(
        page.viewportSize()?.width ?? 0,
      );
    }
    const tinDetailA11y = await new AxeBuilder({ page }).analyze();
    expect(tinDetailA11y.violations).toEqual([]);
    await expectNoHorizontalOverflow(page);

    await page.goto('/recipes/new');
    await expect(page.locator('input[name="publication_id"]')).toHaveValue(tinId);
    await expect(page.getByRole('combobox', { name: 'Publication' })).toHaveValue('Recipe Tin');

    await page.goto('/recipes');
    await expect(page).toHaveURL(new RegExp(`/publications/${tinId}$`));
  } finally {
    await deleteTestUser(request, user);
  }
});
