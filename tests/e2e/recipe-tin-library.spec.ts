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

async function createTinRecipe(
  request: import('@playwright/test').APIRequestContext,
  config: Awaited<ReturnType<typeof getLocalSupabaseConfig>>,
  accessToken: string,
  publicationId: string,
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
        p_name: 'Recipe Tin attribution recipe',
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
        p_publication_page: null,
        p_recipe_url: null,
        p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
        p_tag_ids: [],
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = (await response.json()) as { id: string }[];
  return recipe.id;
}

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
    const tinRecipeId = await createTinRecipe(request, config, user.accessToken, tinId);

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
      '.private-nav-utility-link[href="/recipes/trash"]',
      '.private-nav-utility-link[href="/settings"]',
      '.private-nav-links a[href="/publications"]',
      '.private-nav-links a[href="/recipes/find"]',
      '.account-menu-trigger',
    ]);
    await assertMobileOrder('left', [
      '.account-menu-trigger',
      '.private-nav-links a[href="/recipes/find"]',
      '.private-nav-links a[href="/publications"]',
      '.private-nav-utility-link[href="/settings"]',
      '.private-nav-utility-link[href="/recipes/trash"]',
    ]);
    await privateShell.evaluate((element, hand) => {
      element.setAttribute('data-hand', hand ?? 'right');
    }, initialHand);
    await page.setViewportSize(initialViewport);
    await page.goto(`/recipes/${tinRecipeId}`);
    const recipeTinTheme = page.locator('main.recipe-tin-theme');
    await expect(recipeTinTheme).toHaveCount(1);
    const printAction = page.getByRole('button', { name: 'Print' });
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
    await expect(page.locator('.recipe-attribution')).toContainText('In the Recipe Tin');
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
    const isMobile = (page.viewportSize()?.width ?? 1280) <= 720;
    const addRecipeLink = isMobile
      ? page.locator('.publication-mobile-add')
      : page.locator('.publication-detail-heading .publication-new-recipe');
    await expect(addRecipeLink).toBeVisible();
    const sortButton = page.locator('.recipe-explorer-sort-picklist');
    await sortButton.click();
    const selectedSortOption = page.locator('.single-picklist-option[aria-selected="true"]');
    await expect(selectedSortOption).toHaveCSS('background-color', 'rgb(244, 239, 233)');
    await expect(selectedSortOption).toHaveCSS('color', 'rgb(96, 76, 56)');
    await sortButton.click();
    if (isMobile) {
      await expect(addRecipeLink).toHaveText('Add');
      const toolbarControlStyles = await page
        .locator(
          '.recipe-explorer-toolbar .recipe-explorer-sort-picklist, .recipe-explorer-toolbar .recipe-explorer-trigger, .explorer-list-preferences-trigger',
        )
        .evaluateAll((elements) =>
          elements.map((element) => {
            const styles = getComputedStyle(element);
            return {
              backgroundColor: styles.backgroundColor,
              borderColor: styles.borderColor,
            };
          }),
        );
      expect(toolbarControlStyles).toEqual(
        Array(4).fill({
          backgroundColor: 'rgb(255, 252, 241)',
          borderColor: 'rgb(154, 107, 63)',
        }),
      );
      await expect(addRecipeLink).toHaveCSS('background-color', 'rgb(96, 76, 56)');
      await expect(addRecipeLink).toHaveCSS('color', 'rgb(255, 249, 231)');
      await expect(addRecipeLink).toHaveCSS('border-color', 'rgb(96, 76, 56)');
      const addRecipeBounds = await addRecipeLink.boundingBox();
      const columnsButton = page.getByRole('button', { name: 'Choose List columns' });
      await expect(columnsButton).toBeVisible();
      const columnsButtonBounds = await columnsButton.boundingBox();
      expect(addRecipeBounds).not.toBeNull();
      expect(columnsButtonBounds).not.toBeNull();
      if (!addRecipeBounds) throw new Error('Expected the Add Recipe action to be visible');
      if (!columnsButtonBounds) throw new Error('Expected List columns controls to be visible');
      expect(addRecipeBounds.width).toBeGreaterThan(48);
      expect(columnsButtonBounds.x + columnsButtonBounds.width).toBeLessThan(addRecipeBounds.x);
      expect(Math.abs(columnsButtonBounds.y - addRecipeBounds.y)).toBeLessThanOrEqual(1);
      expect(addRecipeBounds.x + addRecipeBounds.width).toBeLessThanOrEqual(
        page.viewportSize()?.width ?? 0,
      );

      const toolbarItemBounds = await page
        .locator(
          '.recipe-explorer-control-sort, .recipe-explorer-toolbar > .recipe-explorer-trigger, .explorer-list-preferences-trigger, .publication-mobile-add',
        )
        .evaluateAll((elements) =>
          elements.map((element) => {
            const bounds = element.getBoundingClientRect();
            return { x: bounds.x, width: bounds.width };
          }),
        );
      expect(toolbarItemBounds).toHaveLength(5);
      const toolbarGaps = toolbarItemBounds.slice(1).map((bounds, index) => {
        const previousBounds = toolbarItemBounds[index];
        if (!previousBounds) throw new Error('Expected toolbar item bounds');
        return bounds.x - previousBounds.x - previousBounds.width;
      });
      for (const gap of toolbarGaps.slice(1)) {
        expect(Math.abs(gap - toolbarGaps[0])).toBeLessThanOrEqual(1);
      }

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
