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

test('Publication recipe display preferences save Citation widths and detail filters @e2e', async ({
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationId = await createPublication(request, config, user, 'Citation display test');
    const context = `publication-recipes:${publicationId}`;
    await saveExplorerState(request, config, user, context, {
      schema_version: 2,
      display_preferences: {
        visible_columns: ['publication', 'publication_page', 'state', 'citation'],
        column_widths: { citation: 180 },
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
        visible_columns: ['publication', 'publication_page', 'state', 'citation'],
        column_widths: { citation: 180 },
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
    await page.getByRole('checkbox', { name: 'Publication' }).uncheck();

    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      'name state total_time_minutes',
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
      .toEqual(['state', 'total_time_minutes']);

    await page.reload();
    const reloadedParams = new URL(page.url()).searchParams;
    expect(reloadedParams.has('display_preferences')).toBe(false);
    expect(reloadedParams.has('visible_columns')).toBe(false);
    expect(reloadedParams.has('column_widths')).toBe(false);
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      'name state total_time_minutes',
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
          visible_columns: ['state', 'total_time_minutes'],
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
    await page.getByRole('checkbox', { name: 'Publication' }).uncheck();
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      'name state total_time_minutes',
    );
    await expect(page.locator('.explorer-list-preferences-error')).toHaveText(
      'Explorer display preferences could not be saved.',
    );

    await page.unroute('**/recipes/find*');
    await page.getByRole('checkbox', { name: 'Publication' }).check();
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
      .toContain('publication');
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
    expect(Math.abs((columnButtonBox?.y ?? 0) - (viewButtonBox?.y ?? 0))).toBeLessThanOrEqual(2);
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
