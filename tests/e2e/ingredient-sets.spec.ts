import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import {
  createTestUser,
  deleteTestUser,
  getLocalSupabaseConfig,
  type LocalSupabaseConfig,
  type TestUser,
} from '../support/local-supabase';

function ownerHeaders(config: LocalSupabaseConfig, user: TestUser) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
}

function serviceHeaders(config: LocalSupabaseConfig) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Prefer: 'return=representation',
  };
}

async function dragRow(
  page: Page,
  source: Locator,
  target: Locator,
  useTouch = false,
  onPreview?: () => Promise<void>,
  onDrop?: () => Promise<void>,
) {
  await target.scrollIntoViewIfNeeded();
  const sourceBounds = await source.boundingBox();
  const targetBounds = await target.boundingBox();
  if (!sourceBounds || !targetBounds) {
    throw new Error('Ingredient drag source and target must be visible.');
  }
  const sourceX = sourceBounds.x + sourceBounds.width / 2;
  const sourceY = sourceBounds.y + sourceBounds.height / 2;
  const targetX = targetBounds.x + targetBounds.width / 2;
  const targetY = targetBounds.y + targetBounds.height / 2;
  if (useTouch) {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const touchPoint = (x: number, y: number) => ({
      id: 1,
      x,
      y,
      radiusX: 5,
      radiusY: 5,
      force: 1,
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint(sourceX, sourceY)],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touchPoint(targetX, targetY)],
    });
    await onPreview?.();
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await onDrop?.();
    await session.detach();
    return;
  }
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await onPreview?.();
  await page.mouse.up();
  await onDrop?.();
}

async function captureReorderGeometry(table: Locator) {
  return table
    .locator(
      'tbody tr[data-row-id], tbody tr.recipe-ingredient-set-divider, tbody tr[data-reorder-entry-id]',
    )
    .evaluateAll((rows) =>
      Object.fromEntries(
        rows.map((row) => {
          const element = row as HTMLElement;
          const id =
            element.dataset.reorderEntryId ??
            element.dataset.rowId ??
            `section-${element.dataset.ingredientSetId}`;
          return [id, element.getBoundingClientRect().top];
        }),
      ),
    );
}

async function captureReorderTransforms(table: Locator) {
  return table
    .locator(
      'tbody tr[data-row-id], tbody tr.recipe-ingredient-set-divider, tbody tr[data-reorder-entry-id]',
    )
    .evaluateAll((rows) =>
      Object.fromEntries(
        rows.map((row) => {
          const element = row as HTMLElement;
          const id =
            element.dataset.reorderEntryId ??
            element.dataset.rowId ??
            `section-${element.dataset.ingredientSetId}`;
          return [
            id,
            { transform: getComputedStyle(element).transform, state: element.dataset.reorderState },
          ];
        }),
      ),
    );
}

async function expectNoVerticalOverlap(table: Locator) {
  await waitForReorderAnimations(table);
  const bounds = await table.locator('tbody tr').evaluateAll((rows) =>
    rows
      .map((row) => {
        const rect = row.getBoundingClientRect();
        const element = row as HTMLElement;
        return {
          id: element.dataset.rowId ?? `section-${element.dataset.ingredientSetId}`,
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          state: element.dataset.reorderState,
          transform: getComputedStyle(element).transform,
        };
      })
      .filter(({ height }) => height > 0)
      .sort((left, right) => left.top - right.top),
  );
  expect(
    bounds.every(
      (row, index) => index === 0 || (bounds[index - 1]?.bottom ?? Infinity) <= row.top + 1,
    ),
    JSON.stringify(bounds),
  ).toBe(true);
}

async function expectReorderGeometryToMatch(table: Locator, expected: Record<string, number>) {
  await expect(table.locator('[data-reorder-state="dragging"]')).toHaveCount(0);
  const reducedMotion = await table
    .page()
    .evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (reducedMotion) {
    await waitForReorderAnimations(table);
    return;
  }
  await table
    .page()
    .evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const actual = await captureReorderGeometry(table);
  for (const [id, top] of Object.entries(expected)) {
    expect(actual[id], `${id} should remain measurable after release`).toBeDefined();
    const transforms = await captureReorderTransforms(table);
    expect(
      Math.abs((actual[id] ?? Number.POSITIVE_INFINITY) - top),
      `${id} preview=${top} release=${actual[id]} transform=${JSON.stringify(transforms[id])}`,
    ).toBeLessThanOrEqual(18);
  }
  await waitForReorderAnimations(table);
}

async function waitForReorderAnimations(table: Locator) {
  await table.locator('tbody tr').evaluateAll(async (rows) => {
    await Promise.all(
      rows.flatMap((row) =>
        row.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
  });
}

async function exportData(
  page: Page,
  request: APIRequestContext,
  scope: { type: 'database' } | { type: 'publication' | 'recipe'; id: string },
) {
  const result = await page.evaluate(async (requestedScope) => {
    const response = await fetch('/api/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: requestedScope }),
    });
    return {
      status: response.status,
      body: (await response.json()) as { downloadUrl?: string; error?: string },
    };
  }, scope);
  expect(result.status, result.body.error).toBe(200);
  const download = await request.get(result.body.downloadUrl as string);
  expect(download.ok(), await download.text()).toBeTruthy();
  const files = unzipSync(new Uint8Array(await download.body()));
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as {
    schema_version: number;
    scope: { type: string; id?: string };
  };
  const data = JSON.parse(new TextDecoder().decode(files['data.json'])) as {
    schema_version: number;
    records: {
      recipe_ingredient_sets: Array<{
        id: string;
        recipe_id: string;
        label: string;
        position: number;
      }>;
    };
  };
  return { data, manifest };
}

async function saveRecipeWithSets(
  request: import('@playwright/test').APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  sets: Array<{ id: string; label: string; position: number }>,
  rows: Array<{
    id: string;
    setId: string;
    name: string;
    position: number;
  }>,
  publicationId: string,
) {
  const ingredientRows = rows.map((row) => ({
    recipe_ingredient_id: row.id,
    ingredient_id: null,
    ingredient_name: row.name,
    ingredient_set_id: row.setId,
    position: row.position,
    is_main: false,
    detail: '',
    preparation: '',
    measurements: [],
  }));
  const response = await request.post(
    `${config.apiUrl}/rest/v1/rpc/save_recipe_with_ingredient_sets`,
    {
      headers: ownerHeaders(config, user),
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'Weeknight curry',
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
        p_ingredient_rows: ingredientRows,
        p_instruction_steps: [
          {
            id: randomUUID(),
            position: 0,
            content_markdown: `Cook [[ingredient:${rows[0].id}|tomatoes]].`,
            plain_text: 'Cook tomatoes.',
          },
        ],
        p_publication_id: publicationId,
        p_publication_page: null,
        p_recipe_url: null,
        p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
        p_tag_ids: [],
        p_ingredient_sets: sets,
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = (await response.json()) as Array<{ id: string; version: number }>;
  return recipe;
}

test('ingredient sections stay simple across reader, editor, and public views @e2e @a11y', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const user = await createTestUser(request);
  const otherUser = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const sauceSetId = randomUUID();
  const fillingSetId = randomUUID();
  const sauceRowId = randomUUID();
  const extraSauceRowId = randomUUID();
  const fillingRowId = randomUUID();
  const listKeyWarnings: string[] = [];
  const hydrationWarnings: string[] = [];

  try {
    const publicationResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers: ownerHeaders(config, user),
        data: {
          p_name: 'Ingredient set export publication',
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
    expect(publicationResponse.ok(), await publicationResponse.text()).toBeTruthy();
    const publicationId = (await publicationResponse.json()) as string;
    const recipe = await saveRecipeWithSets(
      request,
      config,
      user,
      [
        { id: sauceSetId, label: 'For the sauce', position: 0 },
        { id: fillingSetId, label: 'For the filling', position: 1 },
      ],
      [
        { id: sauceRowId, setId: sauceSetId, name: 'Tomatoes', position: 0 },
        { id: fillingRowId, setId: fillingSetId, name: 'Onion', position: 1 },
        { id: extraSauceRowId, setId: sauceSetId, name: 'Garlic', position: 2 },
      ],
      publicationId,
    );
    const otherOwnerSets = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_sets?select=id&recipe_id=eq.${recipe.id}`,
      { headers: ownerHeaders(config, otherUser) },
    );
    expect(otherOwnerSets.ok(), await otherOwnerSets.text()).toBeTruthy();
    expect(await otherOwnerSets.json()).toEqual([]);

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/(?:recipes|publications(?:\/[0-9a-f-]+)?)$/);
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        message.text().includes('Each child in a list should have a unique "key" prop')
      ) {
        listKeyWarnings.push(message.text());
      }
    });

    await test.step('export sets in recipe, publication, and database bundles', async () => {
      const expectedSets = [
        {
          id: sauceSetId,
          recipe_id: recipe.id,
          label: 'For the sauce',
          position: 0,
        },
        {
          id: fillingSetId,
          recipe_id: recipe.id,
          label: 'For the filling',
          position: 1,
        },
      ];
      for (const scope of [
        { type: 'recipe' as const, id: recipe.id },
        { type: 'publication' as const, id: publicationId },
        { type: 'database' as const },
      ]) {
        const { data, manifest } = await exportData(page, request, scope);
        expect(manifest.scope).toEqual(scope);
        expect(manifest.schema_version).toBe(2);
        expect(data.schema_version).toBe(2);
        expect(
          data.records.recipe_ingredient_sets.filter((set) => set.recipe_id === recipe.id),
        ).toEqual(expectedSets);
      }
    });

    await test.step('render private grouped standard reader', async () => {
      await page.goto(`/recipes/${recipe.id}`);
      await expect(page.getByRole('heading', { name: 'For the sauce', level: 3 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'For the filling', level: 3 })).toBeVisible();
      expect(listKeyWarnings).toEqual([]);
      const ingredientRegion = page.getByRole('region', { name: 'Ingredients' });
      await expect(ingredientRegion.getByText('tomatoes', { exact: true })).toBeVisible();
      await expect(ingredientRegion.getByText('onion', { exact: true })).toBeVisible();
      const presentationToggle = page.getByRole('button', { name: /^Ingredient view:/u });
      const currentPresentation = await presentationToggle.getAttribute('aria-label');
      if (currentPresentation?.startsWith('Ingredient view: Ingredient-first.')) {
        await presentationToggle.click();
      }
      await expect(presentationToggle).toHaveAttribute(
        'aria-label',
        'Ingredient view: Standard. Activate for Ingredient-first.',
      );
      const standardSection = page
        .locator('.recipe-ingredient-list > li.recipe-ingredient-set-divider')
        .first();
      await expect(standardSection).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const standardSectionTitle = standardSection.locator('h3');
      const standardSectionPadding = await standardSection.evaluate((element) => {
        const style = getComputedStyle(element);
        return [Number.parseFloat(style.paddingTop), Number.parseFloat(style.paddingBottom)];
      });
      const expectedSectionPadding = await page.evaluate(() =>
        window.matchMedia('(max-width: 760px)').matches ? 11.34 : 7.56,
      );
      expect(standardSectionPadding[0]).toBeCloseTo(expectedSectionPadding, 1);
      expect(standardSectionPadding[1]).toBeCloseTo(expectedSectionPadding, 1);
      await expect(standardSectionTitle).toHaveCSS('font-style', 'italic');
      await expect(standardSectionTitle).toHaveCSS('text-transform', 'none');
      await expect(standardSectionTitle).toHaveCSS('padding-left', '0px');
      await expect(standardSectionTitle).toHaveCSS('position', 'relative');
      await expect(standardSectionTitle).toHaveCSS('text-align', 'center');
      expect(
        await standardSectionTitle.evaluate((element) => getComputedStyle(element).fontFamily),
      ).toContain('Georgia');
      expect(
        await standardSectionTitle.evaluate(
          (element) => getComputedStyle(element, '::before').borderTopStyle,
        ),
      ).toBe('solid');
      expect(
        await standardSectionTitle.evaluate(
          (element) => getComputedStyle(element, '::before').borderTopColor,
        ),
      ).toBe('rgb(174, 184, 167)');
      expect(
        await standardSectionTitle.evaluate(
          (element) => getComputedStyle(element, '::before').left,
        ),
      ).toBe('0px');
      expect(
        await standardSectionTitle.evaluate(
          (element) => getComputedStyle(element, '::after').borderTopStyle,
        ),
      ).toBe('solid');
      await expect
        .poll(
          () =>
            page.evaluate(async (expectedName) => {
              for (const cacheName of await caches.keys()) {
                if (!cacheName.startsWith('recipe-box-private-')) continue;
                const cache = await caches.open(cacheName);
                for (const cachedRequest of await cache.keys()) {
                  const response = await cache.match(cachedRequest);
                  if (response && (await response.clone().text()).includes(expectedName)) {
                    return true;
                  }
                }
              }
              return false;
            }, 'Weeknight curry'),
          { timeout: 10_000 },
        )
        .toBe(true);
      const startingViewport = page.viewportSize();
      if (!startingViewport) {
        throw new Error('The ingredient reader requires a measurable viewport.');
      }
      for (const width of [320, 375, 760, 761, 960, 1280]) {
        await page.setViewportSize({ width, height: startingViewport.height });
        const pageWidth = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth);
        await expect(page.getByRole('heading', { name: 'For the sauce', level: 3 })).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'For the filling', level: 3 }),
        ).toBeVisible();
      }
      await page.setViewportSize(startingViewport);
      await page.emulateMedia({ media: 'print' });
      await expect(page.getByRole('button', { name: /^Ingredient view:/u })).toBeHidden();
      await expect(page.getByRole('heading', { name: 'For the sauce', level: 3 })).toBeVisible();
      await page.emulateMedia({ media: null });
    });

    await test.step('preserve section dividers in the offline snapshot', async () => {
      await page.context().setOffline(true);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Offline recipes' })).toBeVisible();
      await page.getByRole('link', { name: 'Weeknight curry' }).click();
      await expect(page.getByRole('status')).toContainText('Offline copy');
      await expect(page.getByRole('heading', { name: 'For the sauce', level: 3 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'For the filling', level: 3 })).toBeVisible();
      await page.context().setOffline(false);
      await page.goto(`/recipes/${recipe.id}`);
      await expect(page.getByRole('heading', { name: 'Weeknight curry' })).toBeVisible();
    });

    await test.step('audit grouped standard reader', async () => {
      const readerAccessibility = await new AxeBuilder({ page }).analyze();
      expect(readerAccessibility.violations).toEqual([]);
    });

    await test.step('switch private reader to ingredient-first', async () => {
      const presentationToggle = page.getByRole('button', { name: /^Ingredient view:/u });
      const currentPresentation = await presentationToggle.getAttribute('aria-label');
      if (currentPresentation?.startsWith('Ingredient view: Ingredient-first.')) {
        await presentationToggle.click();
      }
      await expect(presentationToggle).toHaveAttribute(
        'aria-label',
        'Ingredient view: Standard. Activate for Ingredient-first.',
      );
      await presentationToggle.click();
      await expect(
        page.getByRole('button', {
          name: 'Ingredient view: Standard. Activate for Ingredient-first.',
        }),
      ).toHaveCount(0);
      const ingredientFirstTable = page.getByRole('table', { name: 'Recipe ingredients' });
      await expect(ingredientFirstTable).toBeVisible();
      await expect(ingredientFirstTable.locator('thead')).toHaveClass(/visually-hidden/u);
      await expect(ingredientFirstTable.getByRole('columnheader')).toHaveCount(4);
      await expect(page.getByRole('heading', { name: 'For the sauce', level: 3 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'For the filling', level: 3 })).toBeVisible();
      const tableSection = page
        .locator('.recipe-ingredient-first-table tr.recipe-ingredient-set-divider')
        .first();
      await expect(tableSection).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(tableSection.locator('th')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const tableSectionPadding = await tableSection.locator('th').evaluate((element) => {
        const style = getComputedStyle(element);
        return [Number.parseFloat(style.paddingTop), Number.parseFloat(style.paddingBottom)];
      });
      const expectedTableSectionPadding = await page.evaluate(() =>
        window.matchMedia('(max-width: 760px)').matches ? 11.34 : 7.56,
      );
      expect(tableSectionPadding[0]).toBeCloseTo(expectedTableSectionPadding, 1);
      expect(tableSectionPadding[1]).toBeCloseTo(expectedTableSectionPadding, 1);
      const tableSectionTitle = tableSection.locator('h3');
      await expect(tableSectionTitle).toHaveCSS('font-style', 'italic');
      await expect(tableSectionTitle).toHaveCSS('text-transform', 'none');
      await expect(tableSectionTitle).toHaveCSS('padding-left', '0px');
      await expect(tableSectionTitle).toHaveCSS('position', 'relative');
      await expect(tableSectionTitle).toHaveCSS('text-align', 'center');
      expect(
        await tableSectionTitle.evaluate(
          (element) => getComputedStyle(element, '::before').borderTopColor,
        ),
      ).toBe('rgb(174, 184, 167)');
      expect(
        await tableSectionTitle.evaluate((element) => getComputedStyle(element, '::before').left),
      ).toBe('0px');
      expect(
        await tableSectionTitle.evaluate(
          (element) => getComputedStyle(element, '::before').borderTopStyle,
        ),
      ).toBe('solid');
      const stripedIngredients = page.locator(
        '.recipe-ingredient-first-table tbody tr[data-ingredient-stripe]',
      );
      await expect(stripedIngredients).toHaveCount(3);
      await expect(stripedIngredients.nth(0)).toHaveAttribute('data-ingredient-stripe', 'odd');
      await expect(stripedIngredients.nth(1)).toHaveAttribute('data-ingredient-stripe', 'even');
      await expect(stripedIngredients.nth(2)).toHaveAttribute('data-ingredient-stripe', 'odd');
      await expect(stripedIngredients.nth(0).locator('th, td').first()).toHaveCSS(
        'background-color',
        'rgb(237, 244, 233)',
      );
      const unshadedBorders = await stripedIngredients
        .nth(1)
        .locator('th, td')
        .evaluateAll((cells) =>
          cells.map((cell) => ({
            top: getComputedStyle(cell).borderTopColor,
            bottom: getComputedStyle(cell).borderBottomColor,
            topWidth: getComputedStyle(cell).borderTopWidth,
            bottomWidth: getComputedStyle(cell).borderBottomWidth,
          })),
        );
      expect(
        unshadedBorders.every(
          ({ topWidth, bottomWidth }) => topWidth === '0px' && bottomWidth === '0px',
        ),
      ).toBe(true);
      const shadedBorders = await stripedIngredients
        .nth(0)
        .locator('th, td')
        .evaluateAll((cells) =>
          cells.map((cell) => ({
            top: getComputedStyle(cell).borderTopColor,
            bottom: getComputedStyle(cell).borderBottomColor,
          })),
        );
      expect(
        shadedBorders.every(
          ({ top, bottom }) => top === 'rgb(217, 223, 211)' && bottom === 'rgb(217, 223, 211)',
        ),
      ).toBe(true);
      await expect(stripedIngredients.nth(0).locator('th, td').first()).toHaveCSS(
        'border-top-color',
        'rgb(217, 223, 211)',
      );
      await expect(stripedIngredients.nth(0).locator('th, td').last()).toHaveCSS(
        'border-bottom-color',
        'rgb(217, 223, 211)',
      );
      await expect(stripedIngredients.nth(2).locator('th, td').first()).toHaveCSS(
        'background-color',
        'rgb(237, 244, 233)',
      );
    });

    const publicId = await test.step('create a linkable recipe ID', async () => {
      const privacyResponse = await request.post(
        `${config.apiUrl}/rest/v1/rpc/set_recipe_privacy`,
        {
          headers: ownerHeaders(config, user),
          data: {
            p_recipe_id: recipe.id,
            p_expected_version: recipe.version,
            p_is_private: false,
          },
          timeout: 10_000,
        },
      );
      expect(privacyResponse.ok(), await privacyResponse.text()).toBeTruthy();
      const publicIdResponse = await request.get(
        `${config.apiUrl}/rest/v1/recipes?select=public_id&id=eq.${recipe.id}`,
        { headers: ownerHeaders(config, user), timeout: 10_000 },
      );
      expect(publicIdResponse.ok(), await publicIdResponse.text()).toBeTruthy();
      const [{ public_id: id }] = (await publicIdResponse.json()) as Array<{
        public_id: string;
      }>;
      return id;
    });

    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('A tree hydrated')) {
        hydrationWarnings.push(message.text());
      }
    });
    await page.goto(`/recipes/${recipe.id}`);
    await expect(page.getByRole('heading', { name: 'For the sauce', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'For the filling', level: 3 })).toBeVisible();
    expect(hydrationWarnings).toEqual([]);

    await test.step('render grouped public recipe', async () => {
      await page.goto(`/r/${publicId}`, { timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'For the sauce', level: 3 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'For the filling', level: 3 })).toBeVisible();
      const publicHtml = await page.content();
      expect(publicHtml).not.toContain(sauceSetId);
      expect(publicHtml).not.toContain(fillingSetId);
    });

    await page.goto(`/recipes/${recipe.id}/edit`);
    await expect(page.getByRole('heading', { name: 'Edit Recipe' })).toBeVisible();
    expect(hydrationWarnings).toEqual([]);
    const originalViewport = page.viewportSize();
    if (!originalViewport) {
      throw new Error('The ingredient editor requires a measurable viewport.');
    }
    if (originalViewport.width > 900) {
      await page.setViewportSize({ width: 820, height: originalViewport.height });
      await expect(
        page.getByRole('table', { name: 'Recipe ingredients', exact: true }),
      ).toBeHidden();
      await expect(page.getByRole('table', { name: 'Recipe ingredients on mobile' })).toBeVisible();
      await page.setViewportSize(originalViewport);
    }
    const editorLayout =
      (page.viewportSize()?.width ?? 0) <= 900
        ? page.locator('.recipe-ingredient-mobile')
        : page.locator('.recipe-ingredient-desktop');
    const editorSectionHeading = editorLayout.locator('.recipe-ingredient-set-heading h2').first();
    await expect(editorSectionHeading).toHaveCSS('font-style', 'italic');
    await expect(editorSectionHeading).toHaveCSS('padding-left', '40px');
    await editorLayout
      .getByRole('button', { name: 'Edit section title for For the filling' })
      .click();
    const canceledSectionTitle = editorLayout.locator('input[aria-label="Section 2"]');
    await canceledSectionTitle.fill('Discard this title');
    await canceledSectionTitle.press('Escape');
    await expect(
      editorLayout.getByRole('button', { name: 'Edit section title for For the filling' }),
    ).toBeVisible();
    await expect(editorLayout.getByText('Discard this title', { exact: true })).toHaveCount(0);
    await editorLayout.getByRole('button', { name: 'add section', exact: true }).click();
    const firstAddedSection = editorLayout.locator('input[aria-label="Section 3"]');
    await expect(firstAddedSection).toBeFocused();
    await firstAddedSection.fill('For the garnish');
    await firstAddedSection.press('Enter');
    await editorLayout.getByRole('button', { name: 'Remove For the garnish section' }).click();
    await expect(
      editorLayout.getByRole('button', { name: 'Edit section title for For the filling' }),
    ).toBeFocused();
    await editorLayout.getByRole('button', { name: 'add section', exact: true }).click();
    const sectionTitle = editorLayout.locator('input[aria-label="Section 3"]');
    await expect(sectionTitle).toBeFocused();
    await sectionTitle.fill('For the garnish');
    await sectionTitle.press('Enter');
    await test.step(
      'reorder sections by keyboard and retain focus',
      async () => {
        const moveFillingUp = editorLayout.getByRole('button', {
          name: 'Move For the filling section up',
        });
        await moveFillingUp.focus();
        await expect(moveFillingUp).toBeFocused();
        await page.keyboard.press('Space');
        const fillingTitle = editorLayout.getByRole('button', {
          name: 'Edit section title for For the filling',
        });
        await expect(fillingTitle).toBeFocused();
      },
      { timeout: 10_000 },
    );
    await editorLayout
      .getByRole('button', { name: 'Edit section title for For the filling' })
      .click();
    const renamedSection = editorLayout.locator('input[aria-label="Section 1"]');
    await renamedSection.fill('For the curry');
    await renamedSection.press('Enter');

    await editorLayout
      .getByRole('button', { name: 'Edit section title for For the garnish' })
      .click();
    const duplicateSectionTitle = editorLayout.locator('input[aria-label="Section 3"]');
    await duplicateSectionTitle.fill('For the curry');
    await duplicateSectionTitle.press('Enter');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.locator('.recipe-ingredient-section [role="alert"]')).toHaveText(
      'Add a unique, non-empty label of 80 characters or fewer for each section.',
    );
    await expect(
      editorLayout.getByRole('button', { name: 'Edit section title for For the curry' }),
    ).toHaveCount(2);
    await editorLayout
      .getByRole('button', { name: 'Edit section title for For the curry' })
      .last()
      .click();
    await editorLayout.locator('input[aria-label="Section 3"]').fill('For the garnish');
    await editorLayout.locator('input[aria-label="Section 3"]').press('Enter');

    const isMobile = (page.viewportSize()?.width ?? 0) <= 900;
    const ingredientTable = page.locator(
      isMobile ? '.recipe-ingredient-mobile-list' : '.recipe-ingredient-table',
    );
    if (!isMobile) {
      const firstSauceRow = ingredientTable.locator(`tbody tr[data-row-id="${sauceRowId}"]`);
      const sauceHeader = ingredientTable.locator(
        `.recipe-ingredient-set-divider[data-ingredient-set-id="${sauceSetId}"]`,
      );
      const fillingDragHandle = page.locator(
        `.recipe-ingredient-control-rail .recipe-ingredient-rail-row[data-row-id="${fillingRowId}"] .recipe-ingredient-drag-handle`,
      );
      const fillingHandleBounds = await fillingDragHandle.boundingBox();
      const sauceTargetBounds = await sauceHeader.boundingBox();
      if (!fillingHandleBounds || !sauceTargetBounds) {
        throw new Error('Reordered ingredient sections must be visible for drag preview.');
      }
      await page.mouse.move(
        fillingHandleBounds.x + fillingHandleBounds.width / 2,
        fillingHandleBounds.y + fillingHandleBounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        sauceTargetBounds.x + sauceTargetBounds.width / 2,
        sauceTargetBounds.y + sauceTargetBounds.height / 2,
        { steps: 8 },
      );
      await waitForReorderAnimations(ingredientTable);
      await expect(firstSauceRow).not.toHaveAttribute('data-reorder-state');
      const sauceHeaderOffset = await sauceHeader.evaluate(
        (row) => new DOMMatrixReadOnly(getComputedStyle(row).transform).m42,
      );
      expect(sauceHeaderOffset).toBeLessThan(0);
      await fillingDragHandle.dispatchEvent('pointercancel', {
        pointerId: 1,
        pointerType: 'mouse',
      });
      await page.mouse.up();
      await expect(ingredientTable.locator('[data-reorder-state]')).toHaveCount(0);
    }
    const editorHeader = ingredientTable.locator('tbody tr.recipe-ingredient-set-divider').first();
    const editorIngredient = ingredientTable
      .locator(isMobile ? 'tbody tr.recipe-ingredient-mobile-row' : 'tbody tr[data-row-id]')
      .first();
    const editorHeaderBounds = await editorHeader.boundingBox();
    const editorIngredientBounds = await editorIngredient.boundingBox();
    expect(editorHeaderBounds).not.toBeNull();
    expect(editorIngredientBounds).not.toBeNull();
    expect(
      Math.abs((editorHeaderBounds?.height ?? 0) - (editorIngredientBounds?.height ?? 0)),
    ).toBeLessThanOrEqual(1);
    if (isMobile) {
      const tableBounds = await ingredientTable.boundingBox();
      const sectionBounds = await ingredientTable
        .locator('tr.recipe-ingredient-set-divider')
        .first()
        .boundingBox();
      expect(tableBounds).not.toBeNull();
      expect(sectionBounds).not.toBeNull();
      expect(Math.abs((sectionBounds?.width ?? 0) - (tableBounds?.width ?? 0))).toBeLessThanOrEqual(
        1,
      );
    }
    const tomatoRow = ingredientTable.locator(`tbody tr[data-row-id="${sauceRowId}"]`);
    const tomatoHandle = isMobile
      ? tomatoRow.locator('.recipe-ingredient-drag-handle')
      : page.locator(
          `.recipe-ingredient-control-rail .recipe-ingredient-rail-row[data-row-id="${sauceRowId}"] .recipe-ingredient-drag-handle`,
        );
    await tomatoHandle.focus();
    await page.keyboard.press('Control+ArrowUp');
    await expect(tomatoRow).toHaveAttribute('data-ingredient-set-id', fillingSetId);
    await waitForReorderAnimations(ingredientTable);

    const sauceSectionHeader = ingredientTable.locator(
      `.recipe-ingredient-set-divider[data-ingredient-set-id="${sauceSetId}"]`,
    );
    await sauceSectionHeader.scrollIntoViewIfNeeded();
    const sauceHeaderBounds = await sauceSectionHeader.boundingBox();
    if (!sauceHeaderBounds) {
      throw new Error('The sauce header drag preview must be measurable.');
    }
    let sauceHeaderPreview: Record<string, number> | null = null;
    await dragRow(
      page,
      tomatoHandle,
      sauceSectionHeader,
      isMobile,
      async () => {
        await expect(tomatoRow).toHaveAttribute('data-reorder-state', 'dragging');
        expect(
          await sauceSectionHeader.evaluate((header) => {
            const bounds = header.getBoundingClientRect();
            const hit = document.elementFromPoint(
              bounds.left + bounds.width / 2,
              bounds.top + bounds.height / 2,
            );
            return hit !== null && header.contains(hit);
          }),
        ).toBe(true);
        await expectNoVerticalOverlap(ingredientTable);
        await expect
          .poll(async () => {
            const sourceBounds = await tomatoRow.boundingBox();
            const expectedTop = sauceHeaderBounds.y;
            return sourceBounds ? Math.abs(sourceBounds.y - expectedTop) : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(2);
        await expect
          .poll(async () => {
            const headerBounds = await sauceSectionHeader.boundingBox();
            return headerBounds
              ? Math.abs(headerBounds.y - (sauceHeaderBounds.y - sauceHeaderBounds.height))
              : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(2);
        sauceHeaderPreview = await captureReorderGeometry(ingredientTable);
      },
      async () => {
        await expectReorderGeometryToMatch(ingredientTable, sauceHeaderPreview ?? {});
      },
    );
    await expect(tomatoRow).toHaveAttribute('data-ingredient-set-id', sauceSetId);
    const populatedSauceRows = ingredientTable
      .locator(`tbody tr[data-row-id][data-ingredient-set-id="${sauceSetId}"]`)
      .filter({ hasNot: page.locator('.recipe-ingredient-empty-prompt') });
    await expect(populatedSauceRows).toHaveCount(2);
    await expect(populatedSauceRows.nth(0)).toHaveAttribute('data-row-id', sauceRowId);
    await expect(populatedSauceRows.nth(1)).toHaveAttribute('data-row-id', extraSauceRowId);

    const fillingSectionHeader = ingredientTable.locator(
      `.recipe-ingredient-set-divider[data-ingredient-set-id="${fillingSetId}"]`,
    );
    const onionRow = ingredientTable.locator(`tbody tr[data-row-id="${fillingRowId}"]`);
    const fillingAddRowAtHeader = ingredientTable
      .locator(`tbody tr[data-ingredient-set-id="${fillingSetId}"]`)
      .filter({ has: page.locator('.recipe-ingredient-empty-prompt') });
    await fillingSectionHeader.scrollIntoViewIfNeeded();
    const fillingSourceStart = await tomatoRow.boundingBox();
    const fillingHeaderBounds = await fillingSectionHeader.boundingBox();
    const onionStart = await onionRow.boundingBox();
    const fillingAddAtHeaderStart = await fillingAddRowAtHeader.boundingBox();
    if (!fillingSourceStart || !fillingHeaderBounds || !onionStart || !fillingAddAtHeaderStart) {
      throw new Error('The filling header drag preview must be measurable.');
    }
    let fillingHeaderPreview: Record<string, number> | null = null;
    await dragRow(
      page,
      tomatoHandle,
      fillingSectionHeader,
      isMobile,
      async () => {
        await expect(tomatoRow).toHaveAttribute('data-reorder-state', 'dragging');
        await expect(onionRow).toHaveAttribute('data-reorder-state', 'displaced');
        await expect(fillingAddRowAtHeader).toHaveAttribute('data-reorder-state', 'displaced');
        await expect
          .poll(async () => {
            const sourceBounds = await tomatoRow.boundingBox();
            const expectedTop = fillingHeaderBounds.y + fillingHeaderBounds.height;
            return sourceBounds ? Math.abs(sourceBounds.y - expectedTop) : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(2);
        await expect
          .poll(async () => {
            const onionBounds = await onionRow.boundingBox();
            return onionBounds
              ? Math.abs(onionBounds.y - (onionStart.y + fillingSourceStart.height))
              : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(2);
        await expect
          .poll(async () => {
            const addBounds = await fillingAddRowAtHeader.boundingBox();
            return addBounds
              ? Math.abs(addBounds.y - (fillingAddAtHeaderStart.y + fillingSourceStart.height))
              : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(2);
        await expect
          .poll(async () => {
            const headerBounds = await fillingSectionHeader.boundingBox();
            return headerBounds
              ? Math.abs(headerBounds.y - fillingHeaderBounds.y)
              : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(2);
        await expectNoVerticalOverlap(ingredientTable);
        fillingHeaderPreview = await captureReorderGeometry(ingredientTable);
      },
      async () => {
        await expectReorderGeometryToMatch(ingredientTable, fillingHeaderPreview ?? {});
      },
    );
    await expect(tomatoRow).toHaveAttribute('data-ingredient-set-id', fillingSetId);

    const sauceAddRow = ingredientTable
      .locator(`tbody tr[data-ingredient-set-id="${sauceSetId}"]`)
      .filter({ has: page.locator('.recipe-ingredient-empty-prompt') });
    await expect(sauceAddRow).toHaveCount(1);
    await sauceAddRow.scrollIntoViewIfNeeded();
    const sauceAddSourceStart = await tomatoRow.boundingBox();
    const sauceAddStart = await sauceAddRow.boundingBox();
    if (!sauceAddSourceStart || !sauceAddStart) {
      throw new Error('The sauce add-row drag preview must be measurable.');
    }
    let sauceAddPreview: Record<string, number> | null = null;
    await dragRow(
      page,
      tomatoHandle,
      sauceAddRow,
      isMobile,
      async () => {
        await expect(tomatoRow).toHaveAttribute('data-reorder-state', 'dragging');
        await expect
          .poll(async () => {
            const sourceBounds = await tomatoRow.boundingBox();
            const expectedTop = sauceAddStart.y - sauceAddSourceStart.height;
            return sourceBounds ? Math.abs(sourceBounds.y - expectedTop) : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(2);
        await expect
          .poll(async () => {
            const addBounds = await sauceAddRow.boundingBox();
            return addBounds ? Math.abs(addBounds.y - sauceAddStart.y) : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(2);
        await expectNoVerticalOverlap(ingredientTable);
        sauceAddPreview = await captureReorderGeometry(ingredientTable);
      },
      async () => {
        await expectReorderGeometryToMatch(ingredientTable, sauceAddPreview ?? {});
      },
    );
    await expect(tomatoRow).toHaveAttribute('data-ingredient-set-id', sauceSetId);
    const finalSauceRows = ingredientTable
      .locator(`tbody tr[data-row-id][data-ingredient-set-id="${sauceSetId}"]`)
      .filter({ hasNot: page.locator('.recipe-ingredient-empty-prompt') });
    await expect(finalSauceRows).toHaveCount(2);
    await expect(finalSauceRows.nth(0)).toHaveAttribute('data-row-id', extraSauceRowId);
    await expect(finalSauceRows.nth(1)).toHaveAttribute('data-row-id', sauceRowId);

    const fillingAddRow = ingredientTable
      .locator(`tbody tr[data-ingredient-set-id="${fillingSetId}"]`)
      .filter({ has: page.locator('.recipe-ingredient-empty-prompt') });
    await fillingAddRow.scrollIntoViewIfNeeded();
    const fillingAddSourceStart = await tomatoRow.boundingBox();
    const fillingAddStart = await fillingAddRow.boundingBox();
    if (!fillingAddSourceStart || !fillingAddStart) {
      throw new Error('The filling add-row drag preview must be measurable.');
    }
    let fillingAddPreview: Record<string, number> | null = null;
    await dragRow(
      page,
      tomatoHandle,
      fillingAddRow,
      isMobile,
      async () => {
        await expect(tomatoRow).toHaveAttribute('data-reorder-state', 'dragging');
        await expect(fillingAddRow).toHaveAttribute('data-reorder-state', 'displaced');
        await expect
          .poll(async () => {
            const sourceBounds = await tomatoRow.boundingBox();
            const expectedTop = fillingAddStart.y;
            return sourceBounds ? Math.abs(sourceBounds.y - expectedTop) : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(2);
        await expect
          .poll(async () => {
            const addBounds = await fillingAddRow.boundingBox();
            return addBounds
              ? Math.abs(addBounds.y - (fillingAddStart.y + fillingAddStart.height))
              : Number.POSITIVE_INFINITY;
          })
          .toBeLessThanOrEqual(2);
        await expectNoVerticalOverlap(ingredientTable);
        fillingAddPreview = await captureReorderGeometry(ingredientTable);
      },
      async () => {
        await expectReorderGeometryToMatch(ingredientTable, fillingAddPreview ?? {});
      },
    );
    await expect(tomatoRow).toHaveAttribute('data-ingredient-set-id', fillingSetId);

    await page.getByRole('button', { name: 'Remove For the sauce section' }).click();
    const removalDialog = page.getByRole('dialog', { name: 'Remove section?' });
    await expect(removalDialog.getByLabel('Delete ingredients')).toBeVisible();
    await expect(removalDialog.getByLabel('Move ingredients to another section')).toBeVisible();
    await removalDialog.getByLabel('Move ingredients to another section').check();
    await removalDialog.getByLabel('Destination section').selectOption(fillingSetId);
    await removalDialog.getByRole('button', { name: 'Move and remove section' }).click();
    await expect(
      page.getByRole('button', { name: 'Edit section title for For the sauce' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page).toHaveURL(`/recipes/${recipe.id}`);
    await expect(
      page.getByRole('region', { name: 'Ingredients' }).getByText('tomatoes', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'For the curry', level: 3 })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'For the garnish', level: 3 })).toHaveCount(0);

    const savedSetsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_sets?select=id,label,position&recipe_id=eq.${recipe.id}&order=position`,
      { headers: ownerHeaders(config, user) },
    );
    expect(savedSetsResponse.ok(), await savedSetsResponse.text()).toBeTruthy();
    const savedSets = await savedSetsResponse.json();
    expect(savedSets).toEqual([
      { id: fillingSetId, label: 'For the curry', position: 0 },
      expect.objectContaining({ label: 'For the garnish', position: 1 }),
    ]);
    const savedRowsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=id,ingredient_set_id&recipe_id=eq.${recipe.id}&order=position`,
      { headers: ownerHeaders(config, user) },
    );
    expect(savedRowsResponse.ok(), await savedRowsResponse.text()).toBeTruthy();
    expect(await savedRowsResponse.json()).toEqual(
      expect.arrayContaining([
        { id: fillingRowId, ingredient_set_id: fillingSetId },
        { id: extraSauceRowId, ingredient_set_id: fillingSetId },
        { id: sauceRowId, ingredient_set_id: fillingSetId },
      ]),
    );
    const mentionResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_step_mentions?select=recipe_ingredient_id&recipe_id=eq.${recipe.id}`,
      { headers: ownerHeaders(config, user) },
    );
    expect(mentionResponse.ok(), await mentionResponse.text()).toBeTruthy();
    expect(await mentionResponse.json()).toEqual([{ recipe_ingredient_id: sauceRowId }]);

    const updatedHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=before_data,after_data&record_id=eq.${recipe.id}&event_type=eq.recipe.updated&order=created_at.desc&limit=1`,
      { headers: serviceHeaders(config) },
    );
    expect(updatedHistoryResponse.ok(), await updatedHistoryResponse.text()).toBeTruthy();
    const [updatedHistory] = (await updatedHistoryResponse.json()) as Array<{
      before_data: { ingredient_sets: unknown[] };
      after_data: { ingredient_sets: unknown[] };
    }>;
    expect(updatedHistory.before_data.ingredient_sets).toEqual([
      { id: sauceSetId, label: 'For the sauce', position: 0 },
      { id: fillingSetId, label: 'For the filling', position: 1 },
    ]);
    expect(updatedHistory.after_data.ingredient_sets).toEqual(savedSets);

    await page.goto(`/recipes/${recipe.id}/edit`);
    await editorLayout.getByRole('button', { name: 'add section', exact: true }).click();
    const unsavedSectionTitle = editorLayout.locator('input[aria-label="Section 3"]');
    await unsavedSectionTitle.fill('Discard on navigation');
    await unsavedSectionTitle.press('Enter');
    await page.goto(`/recipes/${recipe.id}`);
    await expect(page.getByRole('heading', { name: 'Discard on navigation' })).toHaveCount(0);
    await page.goto(`/recipes/${recipe.id}/edit`);
    await expect(page.getByRole('button', { name: /Discard on navigation/u })).toHaveCount(0);

    const updatedRecipeResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=version&id=eq.${recipe.id}`,
      { headers: ownerHeaders(config, user) },
    );
    expect(updatedRecipeResponse.ok(), await updatedRecipeResponse.text()).toBeTruthy();
    const [{ version }] = (await updatedRecipeResponse.json()) as Array<{ version: number }>;
    const trashResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, user),
      data: { p_recipe_id: recipe.id, p_expected_version: version },
    });
    expect(trashResponse.ok(), await trashResponse.text()).toBeTruthy();
    const restoreResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/restore_recipe`, {
      headers: ownerHeaders(config, user),
      data: { p_recipe_id: recipe.id, p_expected_version: version + 1 },
    });
    expect(restoreResponse.ok(), await restoreResponse.text()).toBeTruthy();
    const restoredSetsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_sets?select=id,label,position&recipe_id=eq.${recipe.id}&order=position`,
      { headers: ownerHeaders(config, user) },
    );
    expect(restoredSetsResponse.ok(), await restoredSetsResponse.text()).toBeTruthy();
    expect(await restoredSetsResponse.json()).toEqual(savedSets);

    await page.goto(`/recipes/${recipe.id}/edit`);
    await editorLayout.getByRole('button', { name: 'Remove For the garnish section' }).click();
    await expect(editorLayout.locator('.recipe-ingredient-set-heading')).toHaveCount(1);
    await expect(editorLayout.getByRole('button', { name: /Remove .* section/u })).toHaveCount(0);
    await page.goto(`/recipes/${recipe.id}`);
    await expect(page.getByRole('heading', { name: 'For the curry', level: 3 })).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Ingredients' }).getByText('tomatoes', { exact: true }),
    ).toBeVisible();

    const restoredRecipeVersionResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=version&id=eq.${recipe.id}`,
      { headers: ownerHeaders(config, user) },
    );
    expect(
      restoredRecipeVersionResponse.ok(),
      await restoredRecipeVersionResponse.text(),
    ).toBeTruthy();
    const [{ version: restoredRecipeVersion }] =
      (await restoredRecipeVersionResponse.json()) as Array<{
        version: number;
      }>;
    const trashBeforePurge = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, user),
      data: { p_recipe_id: recipe.id, p_expected_version: restoredRecipeVersion },
    });
    expect(trashBeforePurge.ok(), await trashBeforePurge.text()).toBeTruthy();
    const purgeRecipe = await request.post(`${config.apiUrl}/rest/v1/rpc/purge_trashed_item`, {
      headers: ownerHeaders(config, user),
      data: {
        p_item_type: 'recipe',
        p_item_id: recipe.id,
        p_expected_version: restoredRecipeVersion + 1,
        p_recipe_disposition: null,
      },
    });
    expect(purgeRecipe.ok(), await purgeRecipe.text()).toBeTruthy();
    const purgedSetsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_sets?select=id&recipe_id=eq.${recipe.id}`,
      { headers: serviceHeaders(config) },
    );
    expect(purgedSetsResponse.ok(), await purgedSetsResponse.text()).toBeTruthy();
    expect(await purgedSetsResponse.json()).toEqual([]);
    const purgedHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=id&record_id=eq.${recipe.id}`,
      { headers: serviceHeaders(config) },
    );
    expect(purgedHistoryResponse.ok(), await purgedHistoryResponse.text()).toBeTruthy();
    expect(await purgedHistoryResponse.json()).toEqual([]);
  } finally {
    await Promise.all([deleteTestUser(request, otherUser), deleteTestUser(request, user)]);
  }
});
