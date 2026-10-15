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
    await expect(page.getByRole('button', { name: 'Switch to List view' })).toBeVisible();
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
          visible_columns: ['state'],
          column_widths: {},
        },
      });
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
    await page.goto('/recipes/find?view=list');

    const columnButton = page.getByRole('button', { name: 'Choose List columns' });
    const viewButton = page.getByRole('button', { name: 'Switch to Grid view' });
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
