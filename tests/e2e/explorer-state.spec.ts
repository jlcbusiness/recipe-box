import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications(?:\?.*)?$/);
}

async function saveExplorerState(
  request: import('@playwright/test').APIRequestContext,
  config: Awaited<ReturnType<typeof getLocalSupabaseConfig>>,
  user: Awaited<ReturnType<typeof createTestUser>>,
  context: string,
  state: object,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/update_explorer_state`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${user.accessToken}`,
    },
    data: { p_context_key: context, p_state: state },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function createPublication(
  request: import('@playwright/test').APIRequestContext,
  config: Awaited<ReturnType<typeof getLocalSupabaseConfig>>,
  user: Awaited<ReturnType<typeof createTestUser>>,
  name: string,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/create_publication`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${user.accessToken}`,
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

test('Publication recipe preferences save Rating and marker widths @e2e', async ({ request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationId = await createPublication(request, config, user, 'Citation display test');
    const context = `publication-recipes:${publicationId}`;
    await saveExplorerState(request, config, user, context, {
      schema_version: 2,
      display_preferences: {
        visible_columns: [
          'publication',
          'publication_page',
          'state',
          'citation',
          'score',
          'starred',
          'hearted',
        ],
        column_widths: { citation: 180, score: 64, starred: 56, hearted: 56 },
      },
      column_filters: {
        publication_page: ['42'],
        citation: ['The test cookbook'],
      },
      filters: [{ field: 'citation', operator: 'contains', value: 'cookbook' }],
      sort: 'name',
      direction: 'asc',
      view: 'details',
    });

    const response = await request.get(
      `${config.apiUrl}/rest/v1/explorer_state?select=state&context_key=eq.${encodeURIComponent(context)}`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    );
    expect(response.ok(), await response.text()).toBeTruthy();
    const [saved] = (await response.json()) as { state: Record<string, unknown> }[];
    expect(saved.state).toMatchObject({
      schema_version: 2,
      display_preferences: {
        visible_columns: [
          'publication',
          'publication_page',
          'state',
          'citation',
          'score',
          'starred',
          'hearted',
        ],
        column_widths: { citation: 180, score: 64, starred: 56, hearted: 56 },
      },
      column_filters: {
        publication_page: ['42'],
        citation: ['The test cookbook'],
      },
      filters: [{ field: 'citation', operator: 'contains', value: 'cookbook' }],
      view: 'details',
    });
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Publication recipe details center Rating and marker columns @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const performanceErrors: string[] = [];
  page.on('pageerror', (error) => {
    if (/negative time stamp/i.test(error.message)) performanceErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && /negative time stamp/i.test(message.text())) {
      performanceErrors.push(message.text());
    }
  });

  try {
    const publicationId = await createPublication(
      request,
      config,
      user,
      'Rating and marker alignment',
    );
    const recipeResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/save_recipe_with_score`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: {
          p_recipe_id: null,
          p_expected_version: null,
          p_name: 'Column alignment fixture',
          p_food_type_id: null,
          p_state: 'tried',
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
          p_ingredient_sets: [{ id: randomUUID(), label: 'Main', position: 0 }],
          p_score: -3,
        },
      },
    );
    expect(recipeResponse.ok(), await recipeResponse.text()).toBeTruthy();
    const [recipe] = (await recipeResponse.json()) as { id: string; version: number }[];

    for (const [marker, expectedVersion] of [
      ['star', recipe.version],
      ['heart', recipe.version + 1],
    ] as const) {
      const markerResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/set_recipe_marker`, {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: {
          p_recipe_id: recipe.id,
          p_expected_version: expectedVersion,
          p_marker: marker,
          p_enabled: true,
        },
      });
      expect(markerResponse.ok(), await markerResponse.text()).toBeTruthy();
    }

    const context = `publication-recipes:${publicationId}`;
    await saveExplorerState(request, config, user, context, {
      schema_version: 2,
      display_preferences: {
        visible_columns: ['state', 'total_time_minutes', 'score', 'starred', 'hearted'],
        column_widths: { score: 120, starred: 80, hearted: 80 },
      },
      column_filters: {},
      filters: [],
      sort: 'name',
      direction: 'asc',
      view: 'details',
    });

    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/publications/${publicationId}?view=details`);

    const table = page.locator('.publication-recipe-list');
    const ratingHeader = table.locator('th[data-explorer-column="score"]');
    const starHeader = table.locator('th[data-explorer-column="starred"]');
    const heartHeader = table.locator('th[data-explorer-column="hearted"]');
    const recipeRow = table.locator('tbody tr');
    await expect(recipeRow).toHaveCount(1);
    await expect(ratingHeader).toContainText('Rtg');
    await expect(page.getByRole('link', { name: 'Column alignment fixture' })).toBeVisible();
    const [headerGeometry, cellGeometry] = await Promise.all([
      table.locator('thead th:visible').evaluateAll((cells) =>
        cells.map((cell) => {
          const { x, y, width } = cell.getBoundingClientRect();
          return { x, top: Math.round(y), width };
        }),
      ),
      recipeRow.locator('td:visible').evaluateAll((cells) =>
        cells.map((cell) => {
          const { x, y, width } = cell.getBoundingClientRect();
          return { x, top: Math.round(y), width };
        }),
      ),
    ]);
    expect(new Set(headerGeometry.map(({ top }) => top)).size).toBe(1);
    expect(new Set(cellGeometry.map(({ top }) => top)).size).toBe(1);
    expect(headerGeometry).toHaveLength(cellGeometry.length);
    for (const [index, header] of headerGeometry.entries()) {
      expect(Math.abs(header.x - cellGeometry[index].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(header.width - cellGeometry[index].width)).toBeLessThanOrEqual(1);
    }

    const columnsButton = page.getByRole('button', { name: 'Choose List columns' });
    await columnsButton.click();
    await expect(page.getByRole('checkbox', { name: 'Rating', exact: true })).toBeChecked();
    await page.keyboard.press('Escape');

    const expectCentered = async (cell: Locator, content: Locator) => {
      const [cellBounds, contentBounds, gap] = await Promise.all([
        cell.boundingBox(),
        content.boundingBox(),
        table.evaluate((element) => Number.parseFloat(getComputedStyle(element).columnGap)),
      ]);
      if (!cellBounds || !contentBounds) {
        throw new Error('Expected visible column content bounds.');
      }
      expect(
        Math.abs(
          cellBounds.x +
            cellBounds.width / 2 -
            gap / 2 -
            (contentBounds.x + contentBounds.width / 2),
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(
          cellBounds.y + cellBounds.height / 2 - (contentBounds.y + contentBounds.height / 2),
        ),
      ).toBeLessThanOrEqual(1);
    };
    const expectTrackCentered = async (column: string) => {
      const expectedTrackCenter = await table.evaluate((element, columnKey) => {
        const preferences = element.closest<HTMLElement>('.explorer-list-preferences');
        const visibleColumns = preferences?.dataset.visibleColumns?.split(' ') ?? [];
        const columnWidths = getComputedStyle(element)
          .gridTemplateColumns.trim()
          .split(/\s+/)
          .map(Number.parseFloat);
        const columnIndex = visibleColumns.indexOf(columnKey);
        if (columnIndex < 0 || columnWidths[columnIndex] === undefined) {
          throw new Error(`The ${columnKey} column must have a rendered grid track.`);
        }
        const gap = Number.parseFloat(getComputedStyle(element).columnGap) || 0;
        const offset = columnWidths
          .slice(0, columnIndex)
          .reduce((total, width) => total + width + gap, 0);
        return element.getBoundingClientRect().left + offset + columnWidths[columnIndex] / 2;
      }, column);
      for (const cell of [
        table.locator(`thead th[data-explorer-column="${column}"]`),
        recipeRow.locator(`td[data-explorer-column="${column}"]`),
      ]) {
        const bounds = await cell.boundingBox();
        if (!bounds) throw new Error(`Expected the ${column} column to be measurable.`);
        expect(Math.abs(bounds.x + bounds.width / 2 - expectedTrackCenter)).toBeLessThanOrEqual(1);
      }
    };

    const ratingCell = recipeRow.locator('td[data-explorer-column="score"]');
    const ratingText = await ratingCell.evaluate((cell) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const { x, y, width, height } = range.getBoundingClientRect();
      return { x, y, width, height };
    });
    const ratingCellBounds = await ratingCell.boundingBox();
    if (!ratingCellBounds) throw new Error('Expected the Rating cell bounds.');

    expect(
      Math.abs(
        ratingCellBounds.x +
          ratingCellBounds.width / 2 -
          (await table.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).columnGap),
          )) /
            2 -
          (ratingText.x + ratingText.width / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        ratingCellBounds.y + ratingCellBounds.height / 2 - (ratingText.y + ratingText.height / 2),
      ),
    ).toBeLessThanOrEqual(1);
    await expectCentered(ratingHeader, ratingHeader.locator('abbr'));
    await expectCentered(starHeader, starHeader.locator('.recipe-marker-column-heading'));
    await expectCentered(heartHeader, heartHeader.locator('.recipe-marker-column-heading'));
    await expectCentered(
      recipeRow.locator('td[data-explorer-column="starred"]'),
      recipeRow.locator('td[data-explorer-column="starred"] .recipe-marker-stamp'),
    );
    await expectCentered(
      recipeRow.locator('td[data-explorer-column="hearted"]'),
      recipeRow.locator('td[data-explorer-column="hearted"] .recipe-marker-stamp'),
    );
    for (const column of ['score', 'starred', 'hearted']) {
      await expectTrackCentered(column);
    }

    const [rowBounds, firstCellBounds, lastCellBounds, separator] = await Promise.all([
      recipeRow.boundingBox(),
      recipeRow.locator('td:visible').first().boundingBox(),
      recipeRow.locator('td:visible').last().boundingBox(),
      recipeRow.evaluate((row) => ({
        rowBorder: getComputedStyle(row).borderBottomWidth,
        cellBorders: [...row.querySelectorAll('td')].map(
          (cell) => getComputedStyle(cell).borderBottomWidth,
        ),
      })),
    ]);
    if (!rowBounds || !firstCellBounds || !lastCellBounds) {
      throw new Error('Expected row and visible cell bounds.');
    }
    expect(Math.abs(rowBounds.x - firstCellBounds.x)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(rowBounds.x + rowBounds.width - (lastCellBounds.x + lastCellBounds.width)),
    ).toBeLessThanOrEqual(1);
    await expect(table.locator('thead tr')).toHaveCSS('border-bottom-width', '1px');
    await expect(table.locator('thead th').first()).toHaveCSS('border-bottom-width', '0px');
    expect(separator.rowBorder).toBe('1px');
    expect(separator.cellBorders.every((border) => border === '0px')).toBeTruthy();

    for (const [column, minWidth] of [
      ['score', 64],
      ['starred', 56],
      ['hearted', 56],
    ] as const) {
      const header = table.locator(`th[data-explorer-column="${column}"]`);
      const handle = header.locator(`[data-explorer-resize-column="${column}"]`);
      const [headerBounds, handleBounds] = await Promise.all([
        header.boundingBox(),
        handle.boundingBox(),
      ]);
      if (!headerBounds || !handleBounds) {
        throw new Error(`Expected the ${column} column and resize handle to be measurable.`);
      }

      const startX = handleBounds.x + handleBounds.width / 2;
      expect(Math.abs(startX - (headerBounds.x + headerBounds.width))).toBeLessThanOrEqual(1);
      const centerY = handleBounds.y + handleBounds.height / 2;
      await page.mouse.move(startX, centerY);
      await page.mouse.down();
      await page.mouse.move(startX + minWidth - headerBounds.width, centerY, { steps: 6 });
      await page.mouse.up();
      await expect.poll(async () => (await header.boundingBox())?.width).toBe(minWidth);
    }

    await expect(page.locator('.explorer-list-preferences-error')).toHaveCount(0);
    await expect
      .poll(async () => {
        const response = await request.get(
          `${config.apiUrl}/rest/v1/explorer_state?select=state&context_key=eq.${encodeURIComponent(context)}`,
          {
            headers: {
              apikey: config.anonKey,
              Authorization: `Bearer ${user.accessToken}`,
            },
          },
        );
        expect(response.ok(), await response.text()).toBeTruthy();
        const [saved] = (await response.json()) as {
          state: { display_preferences: { column_widths: Record<string, number> } };
        }[];
        return saved?.state.display_preferences.column_widths;
      })
      .toMatchObject({ score: 64, starred: 56, hearted: 56 });

    await page.goto(`/publications/${publicationId}?sort=name&direction=asc&page=1&view=list`);
    const markerIndicators = page.locator(
      '.publication-recipe-simple-list .recipe-marker-indicators',
    );
    await expect(markerIndicators).toHaveCount(1);
    const markerPadding = await markerIndicators.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).paddingRight),
    );
    expect(markerPadding).toBeGreaterThanOrEqual(7.5);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/publications/${publicationId}?view=details`);
    const mobileRecipeRow = table.locator('tbody tr');
    const mobileTitleBounds = await mobileRecipeRow
      .locator('td[data-explorer-column="name"] .mobile-details-title-text')
      .boundingBox();
    const mobileTitleRowBounds = await mobileRecipeRow
      .locator('td[data-explorer-column="name"] .mobile-details-title-row')
      .boundingBox();
    const mobileMarkerGroupBounds = await mobileRecipeRow
      .locator('td[data-explorer-column="name"] .mobile-details-title-markers')
      .boundingBox();
    const mobileStarBounds = await mobileRecipeRow
      .locator(
        'td[data-explorer-column="name"] .mobile-details-title-markers [data-explorer-column="starred"] .recipe-marker-stamp',
      )
      .boundingBox();
    const mobileHeartBounds = await mobileRecipeRow
      .locator(
        'td[data-explorer-column="name"] .mobile-details-title-markers [data-explorer-column="hearted"] .recipe-marker-stamp',
      )
      .boundingBox();
    const mobileRatingCell = mobileRecipeRow.locator('td[data-explorer-column="score"]');
    const mobileRatingTextBounds = await mobileRatingCell.evaluate((cell) => {
      const range = document.createRange();
      range.selectNodeContents(cell);
      const { x, width } = range.getBoundingClientRect();
      return { x, width, cell: cell.getBoundingClientRect().toJSON() };
    });
    const toolbarContentBounds = await page
      .locator('.explorer-list-preferences-toolbar-content')
      .boundingBox();
    const viewControlsBounds = await page.locator('.recipe-explorer-view-controls').boundingBox();
    const markerFiltersBounds = await page.locator('.recipe-marker-filters').boundingBox();
    expect(mobileTitleBounds).not.toBeNull();
    expect(mobileTitleRowBounds).not.toBeNull();
    expect(mobileMarkerGroupBounds).not.toBeNull();
    expect(mobileStarBounds).not.toBeNull();
    expect(mobileHeartBounds).not.toBeNull();
    expect(mobileRatingCell).toHaveCSS('align-items', 'center');
    expect(toolbarContentBounds).not.toBeNull();
    expect(viewControlsBounds).not.toBeNull();
    expect(markerFiltersBounds).not.toBeNull();
    if (
      !mobileTitleBounds ||
      !mobileTitleRowBounds ||
      !mobileMarkerGroupBounds ||
      !mobileStarBounds ||
      !mobileHeartBounds ||
      !toolbarContentBounds ||
      !viewControlsBounds ||
      !markerFiltersBounds
    ) {
      throw new Error('Expected mobile publication recipe and toolbar geometry.');
    }
    await expect(mobileRecipeRow.locator('td[data-explorer-column="starred"]')).toBeHidden();
    await expect(mobileRecipeRow.locator('td[data-explorer-column="hearted"]')).toBeHidden();
    const titleCenterY = mobileTitleBounds.y + mobileTitleBounds.height / 2;
    const starCenterY = mobileStarBounds.y + mobileStarBounds.height / 2;
    const heartCenterY = mobileHeartBounds.y + mobileHeartBounds.height / 2;
    expect(Math.abs(titleCenterY - starCenterY)).toBeLessThanOrEqual(1);
    expect(Math.abs(titleCenterY - heartCenterY)).toBeLessThanOrEqual(1);
    expect(mobileStarBounds.x + mobileStarBounds.width).toBeLessThan(mobileHeartBounds.x);
    expect(
      Math.abs(
        mobileMarkerGroupBounds.x +
          mobileMarkerGroupBounds.width -
          (mobileTitleRowBounds.x + mobileTitleRowBounds.width),
      ),
    ).toBeLessThanOrEqual(8);
    expect(
      Math.abs(
        mobileRatingTextBounds.cell.x +
          mobileRatingTextBounds.cell.width / 2 -
          (mobileRatingTextBounds.x + mobileRatingTextBounds.width / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(markerFiltersBounds.y).toBeGreaterThanOrEqual(
      viewControlsBounds.y + viewControlsBounds.height,
    );
    expect(Math.abs(markerFiltersBounds.x - toolbarContentBounds.x)).toBeLessThanOrEqual(1);
    expect(performanceErrors).toEqual([]);

    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/publications/${publicationId}?view=grid`);
      const gridStack = page.locator('.recipe-grid-marker-indicators');
      const gridCard = page
        .locator('.find-recipes-grid li')
        .filter({ hasText: 'Column alignment fixture' });
      const gridContent = gridStack.locator('.recipe-grid-marker-content');
      const markerStack = gridStack.locator('.recipe-marker-indicators');
      const gridRating = gridStack.locator('.recipe-grid-rating-indicator');
      const [gridStackBounds, gridContentBounds, markerStackBounds, gridRatingBounds] =
        await Promise.all([
          gridStack.boundingBox(),
          gridContent.boundingBox(),
          markerStack.boundingBox(),
          gridRating.boundingBox(),
        ]);
      await expect(gridStack).toHaveCount(1);
      await expect(gridCard).toHaveCount(1);
      await expect(gridCard).toHaveAttribute('data-stripe-cell', /^(odd|even)$/);
      await expect(markerStack).toHaveAttribute('aria-label', 'Starred, Hearted');
      await expect(gridRating.locator('.visually-hidden')).toHaveText('Rating ');
      await expect(gridRating).toHaveClass(/recipe-score-negative/);
      await expect(gridRating).toContainText('-3');
      await expect(gridRating).toHaveCSS('color', 'rgb(180, 62, 50)');
      await expect(gridStack).toHaveCSS('border-radius', '9999px');
      await expect(gridStack).toHaveCSS('min-height', '32px');
      await expect(gridStack).toHaveCSS('min-width', '32px');
      await expect(page.locator('.find-recipes-grid-metadata')).not.toContainText('Rating');
      expect(gridStackBounds).not.toBeNull();
      expect(gridContentBounds).not.toBeNull();
      expect(markerStackBounds).not.toBeNull();
      expect(gridRatingBounds).not.toBeNull();
      if (!gridStackBounds || !gridContentBounds || !markerStackBounds || !gridRatingBounds) {
        throw new Error('Expected publication Grid markers and Rating to have measurable bounds.');
      }
      const [pillBackground, cardBackground] = await Promise.all([
        gridStack.evaluate((element) => getComputedStyle(element).backgroundColor),
        gridCard.evaluate((element) => getComputedStyle(element).backgroundColor),
      ]);
      expect(pillBackground).not.toBe('rgba(0, 0, 0, 0)');
      expect(pillBackground).toBe(cardBackground);
      expect(gridStackBounds.width).toBe(32);
      expect(gridStackBounds.height).toBeCloseTo(gridContentBounds.height + 8, 0);
      expect(gridStackBounds.height).toBeGreaterThanOrEqual(32);
      expect(
        Math.abs(
          gridStackBounds.y +
            gridStackBounds.height / 2 -
            (gridContentBounds.y + gridContentBounds.height / 2),
        ),
      ).toBeLessThanOrEqual(1);
      expect(gridRatingBounds.width).toBe(24);
      expect(gridRatingBounds.height).toBe(16);
      const signalBounds = await gridContent
        .locator('svg, .recipe-grid-rating-indicator')
        .evaluateAll((signals) =>
          signals.map((signal) => {
            const bounds = signal.getBoundingClientRect();
            return { y: bounds.y, height: bounds.height };
          }),
        );
      expect(signalBounds).toHaveLength(3);
      expect(signalBounds.every(({ height }) => height === 16)).toBe(true);
      for (const [index, signal] of signalBounds.entries()) {
        const previousSignal = signalBounds[index - 1];
        if (previousSignal) {
          expect(signal.y - previousSignal.y).toBeCloseTo(21, 0);
        }
      }
      expect(gridRatingBounds.y).toBeGreaterThanOrEqual(
        markerStackBounds.y + markerStackBounds.height,
      );
    }

    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of [
      `/publications/${publicationId}?view=list`,
      `/publications/${publicationId}?view=grid`,
      '/recipes/find?tab=search&view=list',
      '/recipes/find?tab=query&view=grid',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Choose List columns' })).toHaveCount(0);
      const finalViewButton = page.locator('.recipe-explorer-view-controls > :last-child');
      await expect(finalViewButton).toHaveCSS('border-right-width', '1px');
      await expect(finalViewButton).toHaveCSS('border-top-right-radius', '3px');
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

test('List column chooser supports keyboard operation on every explorer @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationId = await createPublication(request, config, user, 'Keyboard explorer book');
    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 1280, height: 900 });

    for (const path of [
      '/recipes/find?view=details',
      '/publications?view=list',
      `/publications/${publicationId}?view=details`,
    ]) {
      await page.goto(path);
      const trigger = page.getByRole('button', { name: 'Choose List columns' });
      const chooser = page.getByRole('group', { name: 'List columns' });
      await expect(trigger).toBeVisible();
      const resizeHandles = page.locator('[data-explorer-resize-column]');
      if (await resizeHandles.count()) {
        const resizeHandle = resizeHandles.first();
        await expect(resizeHandle).toHaveAttribute('aria-hidden', 'true');
        expect(await resizeHandle.evaluate((element) => (element as HTMLElement).tabIndex)).toBe(
          -1,
        );
      }
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(chooser).toBeVisible();
      const requiredName = chooser.getByRole('checkbox', { name: /^Name/ });
      await expect(requiredName).toBeChecked();
      await expect(requiredName).toBeDisabled();
      const accessibility = await new AxeBuilder({ page })
        .include('.explorer-list-preferences-popover')
        .analyze();
      expect(accessibility.violations).toEqual([]);

      const resetButton = chooser.getByRole('button', { name: 'Reset columns' });
      await page.keyboard.press('Tab');
      await expect(resetButton).toBeFocused();

      const optionalColumn = chooser.locator('input[type="checkbox"]:not(:disabled)').first();
      const wasChecked = await optionalColumn.isChecked();
      await page.keyboard.press('Tab');
      await expect(optionalColumn).toBeFocused();
      await page.keyboard.press('Space');
      await expect.poll(() => optionalColumn.isChecked()).toBe(!wasChecked);

      await page.keyboard.press('Escape');
      await expect(chooser).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Library column resizing supports pointer types, cancellation, and reload @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await createPublication(request, config, user, 'Resizable explorer publication');
    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/publications?view=list');

    const table = page.locator('.publication-explorer-table');
    const nameHeader = table.locator('thead th[data-explorer-column="name"]');
    const resizeHandle = nameHeader.locator('[data-explorer-resize-column="name"]');
    const root = page.locator('.explorer-list-preferences');
    await expect(nameHeader).toBeVisible();
    await expect(resizeHandle).toHaveAttribute('aria-hidden', 'true');
    expect(await resizeHandle.evaluate((element) => (element as HTMLElement).tabIndex)).toBe(-1);

    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 1,
    });
    const touchPoint = (id: number, x: number, y: number) => ({
      id,
      x,
      y,
      radiusX: 5,
      radiusY: 5,
      force: 1,
    });
    const handleBounds = await resizeHandle.boundingBox();
    if (!handleBounds) throw new Error('The Name resize handle must be visible.');
    const touchStartX = Math.round(handleBounds.x + handleBounds.width / 2);
    const touchStartY = Math.round(handleBounds.y + handleBounds.height / 2);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint(1, touchStartX, touchStartY)],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touchPoint(1, touchStartX + 32, touchStartY)],
    });
    await expect
      .poll(() => root.evaluate((element) => element.getAttribute('style')))
      .toContain('--explorer-column-width-name');
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect
      .poll(() =>
        root.evaluate((element) => element.style.getPropertyValue('--explorer-column-width-name')),
      )
      .toBe('');

    const readSavedNameWidth = async () => {
      const response = await request.get(
        `${config.apiUrl}/rest/v1/explorer_state?select=state&context_key=eq.publications`,
        {
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${user.accessToken}`,
          },
        },
      );
      expect(response.ok(), await response.text()).toBeTruthy();
      const rows = (await response.json()) as {
        state: { display_preferences?: { column_widths?: Record<string, number> } };
      }[];
      return rows[0]?.state.display_preferences?.column_widths?.name;
    };

    for (const pointerType of ['mouse', 'pen', 'touch'] as const) {
      const headerBounds = await nameHeader.boundingBox();
      const activeHandleBounds = await resizeHandle.boundingBox();
      if (!headerBounds || !activeHandleBounds) {
        throw new Error('The Name column and its resize handle must be visible.');
      }
      const startX = Math.round(activeHandleBounds.x + activeHandleBounds.width / 2);
      const startY = Math.round(activeHandleBounds.y + activeHandleBounds.height / 2);
      const rowPadding = await nameHeader.evaluate(
        (header) =>
          Number.parseFloat(getComputedStyle(header.parentElement ?? header).paddingLeft) || 0,
      );
      const expectedHeaderWidth = Math.round(headerBounds.width) + 24;
      const expectedSavedWidth = Math.round(headerBounds.width + rowPadding) + 24;

      if (pointerType === 'mouse') {
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 24, startY, { steps: 3 });
        await page.mouse.up();
      } else if (pointerType === 'pen') {
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: startX,
          y: startY,
          pointerType: 'pen',
        });
        await session.send('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: startX,
          y: startY,
          button: 'left',
          clickCount: 1,
          pointerType: 'pen',
        });
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: startX + 24,
          y: startY,
          button: 'left',
          pointerType: 'pen',
        });
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: startX + 24,
          y: startY,
          button: 'left',
          clickCount: 1,
          pointerType: 'pen',
        });
      } else {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [touchPoint(2, startX, startY)],
        });
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [touchPoint(2, startX + 24, startY)],
        });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }

      await expect.poll(readSavedNameWidth).toBe(expectedSavedWidth);
      await expect
        .poll(async () => Math.round((await nameHeader.boundingBox())?.width ?? 0))
        .toBe(expectedHeaderWidth);
      await page.reload();
      await expect
        .poll(async () => Math.round((await nameHeader.boundingBox())?.width ?? 0))
        .toBe(expectedHeaderWidth);
    }

    const resizeNameColumnToViewportEdge = async (targetX: number) => {
      const bounds = await resizeHandle.boundingBox();
      if (!bounds) throw new Error('The Name resize handle must be visible.');
      const startX = Math.round(bounds.x + bounds.width / 2);
      const startY = Math.round(bounds.y + bounds.height / 2);
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(targetX, startY, { steps: 3 });
      await page.mouse.up();
    };

    await resizeNameColumnToViewportEdge(0);
    await expect.poll(readSavedNameWidth).toBe(180);
    await expect
      .poll(() =>
        root.evaluate((element) => element.style.getPropertyValue('--explorer-column-width-name')),
      )
      .toBe('180px');
    await resizeNameColumnToViewportEdge(1279);
    await expect.poll(readSavedNameWidth).toBe(720);
    await expect
      .poll(() =>
        root.evaluate((element) => element.style.getPropertyValue('--explorer-column-width-name')),
      )
      .toBe('720px');

    await page.setViewportSize({ width: 719, height: 900 });
    await expect(page.locator('.publication-explorer-table-wrap')).toBeHidden();
    await expect(resizeHandle).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 721, height: 900 });
    await expect(nameHeader).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 850, height: 900 });
    await expect(nameHeader).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await session.detach();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes restores durable explorer state but not search or pagination @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const state = {
    schema_version: 1,
    column_filters: { state: ['tried'] },
    filters: [],
    sort: 'updated_at',
    direction: 'desc',
    view: 'grid',
  };

  try {
    await saveExplorerState(request, config, user, 'recipes-find', state);

    await signIn(page, user.email, user.password);
    await page.goto('/recipes/find?q=saffron&page=2');

    await expect(page).toHaveURL(
      /\/recipes\/find\?column_state=tried&sort=updated_at&direction=desc&view=grid$/,
    );
    await expect(page.getByRole('button', { name: 'Switch to Details view' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes persists a changed durable explorer state @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/find');
    await page.getByRole('button', { name: 'Switch to List view' }).click();
    await expect(page).toHaveURL(/view=list/);
    await page.getByRole('button', { name: 'Switch to Grid view' }).click();
    await expect(page).toHaveURL(/\/recipes\/find\?sort=name&direction=asc&page=1&view=grid/);

    await expect
      .poll(async () => {
        const response = await request.get(
          `${config.apiUrl}/rest/v1/explorer_state?select=state&context_key=eq.recipes-find`,
          {
            headers: {
              apikey: config.anonKey,
              Authorization: `Bearer ${user.accessToken}`,
            },
          },
        );
        const rows = (await response.json()) as { state: { view?: string } }[];
        return rows[0]?.state.view;
      })
      .toBe('grid');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes persists column visibility without changing the URL @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/find');
    const originalUrl = page.url();
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await page.getByRole('checkbox', { name: 'State', exact: true }).uncheck();

    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      'name publication visibility score starred hearted',
    );
    await expect(page).toHaveURL(originalUrl);

    await expect
      .poll(async () => {
        const response = await request.get(
          `${config.apiUrl}/rest/v1/explorer_state?select=state&context_key=eq.recipes-find`,
          {
            headers: {
              apikey: config.anonKey,
              Authorization: `Bearer ${user.accessToken}`,
            },
          },
        );
        const rows = (await response.json()) as {
          state: { display_preferences?: { visible_columns?: string[] } };
        }[];
        return rows[0]?.state.display_preferences?.visible_columns;
      })
      .toEqual(['publication', 'visibility', 'score', 'starred', 'hearted']);

    await page.reload();
    const reloadedParams = new URL(page.url()).searchParams;
    expect(reloadedParams.has('display_preferences')).toBe(false);
    expect(reloadedParams.has('visible_columns')).toBe(false);
    expect(reloadedParams.has('column_widths')).toBe(false);
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      'name publication visibility score starred hearted',
    );

    await saveExplorerState(request, config, user, 'recipes-find', {
      schema_version: 1,
      column_filters: {},
      filters: [],
      sort: 'updated_at',
      direction: 'desc',
      view: 'list',
    });
    await expect
      .poll(async () => {
        const response = await request.get(
          `${config.apiUrl}/rest/v1/explorer_state?select=state&context_key=eq.recipes-find`,
          {
            headers: {
              apikey: config.anonKey,
              Authorization: `Bearer ${user.accessToken}`,
            },
          },
        );
        const rows = (await response.json()) as { state: Record<string, unknown> }[];
        return rows[0]?.state;
      })
      .toMatchObject({
        schema_version: 2,
        sort: 'updated_at',
        display_preferences: {
          visible_columns: ['publication', 'visibility', 'score', 'starred', 'hearted'],
          column_widths: {},
        },
      });
  } finally {
    await deleteTestUser(request, user);
  }
});

test('List display preferences remain isolated by exact explorer context @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const firstPublicationId = await createPublication(
      request,
      config,
      user,
      'First preference book',
    );
    const secondPublicationId = await createPublication(
      request,
      config,
      user,
      'Second preference book',
    );
    await saveExplorerState(request, config, user, 'recipes-find', {
      schema_version: 2,
      display_preferences: {
        visible_columns: ['state'],
        column_widths: { name: 300, state: 120 },
      },
      filters: [],
      sort: 'name',
      direction: 'asc',
      view: 'details',
    });
    await saveExplorerState(request, config, user, 'publications', {
      schema_version: 2,
      display_preferences: {
        visible_columns: ['created_at'],
        column_widths: { name: 340, created_at: 160 },
      },
      filters: [],
      sort: 'name',
      direction: 'asc',
      view: 'list',
      type: 'all',
    });
    await saveExplorerState(request, config, user, `publication-recipes:${firstPublicationId}`, {
      schema_version: 2,
      display_preferences: {
        visible_columns: ['citation'],
        column_widths: { name: 360, citation: 240 },
      },
      filters: [],
      sort: 'name',
      direction: 'asc',
      view: 'details',
    });
    await saveExplorerState(request, config, user, `publication-recipes:${secondPublicationId}`, {
      schema_version: 2,
      display_preferences: {
        visible_columns: ['opinion'],
        column_widths: { name: 400, opinion: 200 },
      },
      filters: [],
      sort: 'name',
      direction: 'asc',
      view: 'details',
    });

    await signIn(page, user.email, user.password);
    for (const { path, visibleColumns, nameWidth } of [
      { path: '/recipes/find?view=details', visibleColumns: 'name state', nameWidth: 300 },
      { path: '/publications?view=list', visibleColumns: 'name created_at', nameWidth: 340 },
      {
        path: `/publications/${firstPublicationId}?view=details`,
        visibleColumns: 'name citation',
        nameWidth: 360,
      },
      {
        path: `/publications/${secondPublicationId}?view=details`,
        visibleColumns: 'name opinion',
        nameWidth: 400,
      },
    ]) {
      await page.goto(path);
      const preferences = page.locator('.explorer-list-preferences');
      await expect(preferences).toHaveAttribute('data-visible-columns', visibleColumns);
      await expect
        .poll(() =>
          preferences.evaluate((element) =>
            (element as HTMLElement).style.getPropertyValue('--explorer-column-width-name'),
          ),
        )
        .toBe(`${nameWidth}px`);

      await page.reload();
      await expect(preferences).toHaveAttribute('data-visible-columns', visibleColumns);
      await expect
        .poll(() =>
          preferences.evaluate((element) =>
            (element as HTMLElement).style.getPropertyValue('--explorer-column-width-name'),
          ),
        )
        .toBe(`${nameWidth}px`);
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes keeps column changes usable when saving fails and retries @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/find');
    await page.route('**/recipes/find*', async (route) => {
      const actionRequest = route.request();
      if (actionRequest.method() === 'POST' && actionRequest.headers()['next-action']) {
        await route.abort();
        return;
      }
      await route.continue();
    });

    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await page.getByRole('checkbox', { name: 'State', exact: true }).uncheck();
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      'name publication visibility score starred hearted',
    );
    await expect(page.locator('.explorer-list-preferences-error')).toHaveText(
      'Explorer display preferences could not be saved.',
    );

    await page.unroute('**/recipes/find*');
    await page.getByRole('checkbox', { name: 'State', exact: true }).check();
    await expect
      .poll(async () => {
        const response = await request.get(
          `${config.apiUrl}/rest/v1/explorer_state?select=state&context_key=eq.recipes-find`,
          {
            headers: {
              apikey: config.anonKey,
              Authorization: `Bearer ${user.accessToken}`,
            },
          },
        );
        const rows = (await response.json()) as {
          state: { display_preferences?: { visible_columns?: string[] } };
        }[];
        return rows[0]?.state.display_preferences?.visible_columns;
      })
      .toContain('state');
    await expect(page.locator('.explorer-list-preferences-error')).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes exposes all recipe columns beside the view controls @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/find?view=details');

    const columnButton = page.getByRole('button', { name: 'Choose List columns' });
    const viewButton = page.getByRole('button', { name: 'Switch to List view' });
    const columnButtonBox = await columnButton.boundingBox();
    const viewButtonBox = await viewButton.boundingBox();
    expect(columnButtonBox).not.toBeNull();
    expect(viewButtonBox).not.toBeNull();
    expect(Math.abs((columnButtonBox?.y ?? 0) - (viewButtonBox?.y ?? 0))).toBeLessThanOrEqual(4);
    expect(columnButtonBox?.x).toBeGreaterThan(viewButtonBox?.x ?? 0);

    await columnButton.click();
    for (const field of [
      'Main Ingredients',
      'Date Added',
      'Date Changed',
      'Cook Time',
      'Pairs With',
    ]) {
      await expect(page.getByRole('checkbox', { name: field })).toBeVisible();
    }
    await page.getByRole('checkbox', { name: 'Pairs With' }).check();
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      /pairs_with/,
    );

    await expect
      .poll(async () => {
        const response = await request.get(
          `${config.apiUrl}/rest/v1/explorer_state?select=state&context_key=eq.recipes-find`,
          {
            headers: {
              apikey: config.anonKey,
              Authorization: `Bearer ${user.accessToken}`,
            },
          },
        );
        const rows = (await response.json()) as {
          state: { display_preferences?: { visible_columns?: string[] } };
        }[];
        return rows[0]?.state.display_preferences?.visible_columns;
      })
      .toContain('pairs_with');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Library restores its own explorer state without restoring transient search @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await saveExplorerState(request, config, user, 'publications', {
      schema_version: 1,
      filters: [],
      sort: 'author',
      direction: 'desc',
      view: 'list',
      type: 'book',
    });

    await signIn(page, user.email, user.password);
    await page.goto('/publications?q=old-search&page=2');

    await expect(page).toHaveURL(/\/publications\?type=book&sort=author&direction=desc&view=list$/);
    await expect(page.getByRole('button', { name: 'Type: Books' })).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Library publications remain visible in mobile list view @e2e', async ({ page, request }) => {
  test.skip((page.viewportSize()?.width ?? 1280) > 720, 'Mobile list layout only.');
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const publicationName = 'Mobile Explorer Publication';

  try {
    await createPublication(request, config, user, publicationName);
    await saveExplorerState(request, config, user, 'publications', {
      schema_version: 2,
      display_preferences: { visible_columns: ['created_at'], column_widths: {} },
      filters: [],
      sort: 'name',
      direction: 'asc',
      view: 'list',
      type: 'all',
    });
    await signIn(page, user.email, user.password);
    await page.goto('/publications?view=list');

    await expect(page.locator('.publication-explorer-table-wrap')).toBeHidden();
    await expect(page.locator('.publication-explorer-mobile-list')).toBeVisible();
    await expect(page.getByRole('link', { name: publicationName })).toBeVisible();
    const dateAdded = page
      .locator('.publication-explorer-mobile-metadata [data-explorer-column="created_at"]')
      .first();
    await expect(dateAdded).toBeVisible();

    await page.getByRole('button', { name: 'Choose List columns' }).click();
    const dateAddedOption = page.getByRole('checkbox', { name: 'Date Added', exact: true });
    await expect(dateAddedOption).toBeChecked();
    await dateAddedOption.uncheck();
    await expect(dateAdded).toBeHidden();
    await dateAddedOption.check();
    await expect(dateAdded).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('publication recipe mobile filters follow visible columns @e2e', async ({ page, request }) => {
  test.skip((page.viewportSize()?.width ?? 1280) > 720, 'Mobile explorer layout only.');
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationId = await createPublication(
      request,
      config,
      user,
      'Mobile recipe column preferences',
    );
    await saveExplorerState(request, config, user, `publication-recipes:${publicationId}`, {
      schema_version: 2,
      display_preferences: {
        visible_columns: ['state', 'total_time_minutes'],
        column_widths: {},
      },
      column_filters: {},
      filters: [],
      sort: 'name',
      direction: 'asc',
      view: 'details',
    });

    await signIn(page, user.email, user.password);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/publications/${publicationId}?view=details`);

    const toolbarContentBounds = await page
      .locator('.explorer-list-preferences-toolbar-content')
      .boundingBox();
    const viewControlsBounds = await page.locator('.recipe-explorer-view-controls').boundingBox();
    const markerFiltersBounds = await page.locator('.recipe-marker-filters').boundingBox();
    const mobileActionsBounds = await page.locator('.publication-mobile-actions').boundingBox();
    const toolbarBounds = await page.locator('.explorer-list-preferences-toolbar').boundingBox();
    const columnControlsBounds = await page
      .locator('.explorer-list-preferences-controls')
      .boundingBox();
    const columnButton = page.getByRole('button', { name: 'Choose List columns' });
    expect(toolbarContentBounds).not.toBeNull();
    expect(viewControlsBounds).not.toBeNull();
    expect(markerFiltersBounds).not.toBeNull();
    expect(mobileActionsBounds).not.toBeNull();
    expect(toolbarBounds).not.toBeNull();
    expect(columnControlsBounds).not.toBeNull();
    await expect(columnButton).toHaveCSS('border-left-width', '1px');
    if (
      !toolbarContentBounds ||
      !viewControlsBounds ||
      !markerFiltersBounds ||
      !mobileActionsBounds ||
      !toolbarBounds ||
      !columnControlsBounds
    ) {
      throw new Error('Expected publication mobile toolbar geometry.');
    }
    expect(markerFiltersBounds.y).toBeGreaterThanOrEqual(
      viewControlsBounds.y + viewControlsBounds.height,
    );
    expect(Math.abs(markerFiltersBounds.x - toolbarContentBounds.x)).toBeLessThanOrEqual(1);
    expect(columnControlsBounds.x).toBeGreaterThanOrEqual(
      toolbarContentBounds.x + toolbarContentBounds.width - 1,
    );
    expect(
      Math.abs(columnControlsBounds.x - (viewControlsBounds.x + viewControlsBounds.width)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        mobileActionsBounds.y +
          mobileActionsBounds.height / 2 -
          (viewControlsBounds.y + viewControlsBounds.height / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(mobileActionsBounds.x).toBeGreaterThanOrEqual(
      columnControlsBounds.x + columnControlsBounds.width - 1,
    );
    expect(viewControlsBounds.y + viewControlsBounds.height).toBeLessThan(markerFiltersBounds.y);
    expect(
      Math.abs(
        mobileActionsBounds.x + mobileActionsBounds.width - (toolbarBounds.x + toolbarBounds.width),
      ),
    ).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 352, height: 844 });
    const narrowToolbarContentBounds = await page
      .locator('.explorer-list-preferences-toolbar-content')
      .boundingBox();
    const narrowViewControlsBounds = await page
      .locator('.recipe-explorer-view-controls')
      .boundingBox();
    const narrowColumnControlsBounds = await page
      .locator('.explorer-list-preferences-controls')
      .boundingBox();
    const narrowColumnButton = page.getByRole('button', { name: 'Choose List columns' });
    const narrowMarkerFiltersBounds = await page.locator('.recipe-marker-filters').boundingBox();
    const narrowMobileActionsBounds = await page
      .locator('.publication-mobile-actions')
      .boundingBox();
    const narrowToolbarBounds = await page
      .locator('.explorer-list-preferences-toolbar')
      .boundingBox();
    expect(narrowToolbarContentBounds).not.toBeNull();
    expect(narrowViewControlsBounds).not.toBeNull();
    expect(narrowColumnControlsBounds).not.toBeNull();
    expect(narrowMarkerFiltersBounds).not.toBeNull();
    expect(narrowMobileActionsBounds).not.toBeNull();
    expect(narrowToolbarBounds).not.toBeNull();
    if (
      !narrowToolbarContentBounds ||
      !narrowViewControlsBounds ||
      !narrowColumnControlsBounds ||
      !narrowMarkerFiltersBounds ||
      !narrowMobileActionsBounds ||
      !narrowToolbarBounds
    ) {
      throw new Error('Expected narrow publication mobile toolbar geometry.');
    }
    await expect(narrowColumnButton).toHaveCSS('border-left-width', '1px');
    expect(
      Math.abs(
        narrowMobileActionsBounds.y +
          narrowMobileActionsBounds.height / 2 -
          (narrowViewControlsBounds.y + narrowViewControlsBounds.height / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(narrowMobileActionsBounds.x).toBeGreaterThanOrEqual(
      narrowColumnControlsBounds.x + narrowColumnControlsBounds.width - 1,
    );
    expect(narrowColumnControlsBounds.x).toBeGreaterThanOrEqual(
      narrowToolbarContentBounds.x + narrowToolbarContentBounds.width - 1,
    );
    expect(
      Math.abs(
        narrowColumnControlsBounds.x -
          (narrowViewControlsBounds.x + narrowViewControlsBounds.width),
      ),
    ).toBeLessThanOrEqual(1);
    expect(narrowMobileActionsBounds.x + narrowMobileActionsBounds.width).toBeLessThanOrEqual(
      narrowToolbarBounds.x + narrowToolbarBounds.width + 1,
    );
    expect(narrowMarkerFiltersBounds.y).toBeGreaterThanOrEqual(
      Math.max(
        narrowViewControlsBounds.y + narrowViewControlsBounds.height,
        narrowMobileActionsBounds.y + narrowMobileActionsBounds.height,
      ),
    );
    expect(
      Math.abs(narrowMarkerFiltersBounds.x - narrowToolbarContentBounds.x),
    ).toBeLessThanOrEqual(1);

    const mobileColumnFilters = page.getByRole('navigation', {
      name: 'Filter publication recipe columns',
    });
    const opinionFilter = mobileColumnFilters.getByRole('button', { name: 'Filter Opinion' });
    await expect(opinionFilter).toBeHidden();
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    const opinionColumn = page.getByRole('checkbox', { name: 'Opinion', exact: true });
    await opinionColumn.check();
    await expect(opinionFilter).toBeVisible();
    await opinionColumn.uncheck();
    await expect(opinionFilter).toBeHidden();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('publication recipe explorers restore only their route-owned state @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const firstPublicationId = await createPublication(
      request,
      config,
      user,
      'First Explorer Book',
    );
    const secondPublicationId = await createPublication(
      request,
      config,
      user,
      'Second Explorer Book',
    );
    await saveExplorerState(request, config, user, `publication-recipes:${firstPublicationId}`, {
      schema_version: 1,
      filters: [],
      sort: 'updated_at',
      direction: 'desc',
      view: 'grid',
    });
    await saveExplorerState(request, config, user, `publication-recipes:${secondPublicationId}`, {
      schema_version: 1,
      filters: [],
      sort: 'name',
      direction: 'asc',
      view: 'list',
    });

    await signIn(page, user.email, user.password);
    await page.goto(`/publications/${firstPublicationId}?q=old-search&page=2`);
    await expect(page).toHaveURL(
      new RegExp(`/publications/${firstPublicationId}\\?sort=updated_at&direction=desc&view=grid$`),
    );
    const viewControls = page.getByRole('group', { name: 'Sort and view controls' });
    const viewControlBounds = await viewControls.locator('button, a').evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height, right } = element.getBoundingClientRect();
        return { x, y, width, height, right };
      }),
    );
    expect(viewControlBounds).toHaveLength(3);
    for (const bounds of viewControlBounds) {
      expect(bounds.width).toBe(40);
      expect(bounds.height).toBe(40);
    }
    expect(viewControlBounds[1].x - viewControlBounds[0].right).toBe(0);
    expect(viewControlBounds[2].x - viewControlBounds[1].right).toBe(0);
    const mobileActions = page.locator('.publication-mobile-actions');
    if (await mobileActions.isVisible()) {
      const viewBounds = await viewControls.boundingBox();
      const actionBounds = await mobileActions.boundingBox();
      expect(viewBounds).not.toBeNull();
      expect(actionBounds).not.toBeNull();
      expect((viewBounds?.x ?? 0) + (viewBounds?.width ?? 0)).toBeLessThanOrEqual(
        actionBounds?.x ?? 0,
      );
    }
    await expect(page.getByRole('button', { name: 'Switch to Details view' })).toBeVisible();

    await page.goto(`/publications/${secondPublicationId}`);
    await expect(page).toHaveURL(
      new RegExp(`/publications/${secondPublicationId}\\?sort=name&direction=asc&view=list$`),
    );
    await expect(page.getByRole('button', { name: 'Switch to Grid view' })).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});
