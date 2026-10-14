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
    await expect(page.getByRole('button', { name: 'Switch to List view' })).toBeVisible();

    await page.goto(`/publications/${secondPublicationId}`);
    await expect(page).toHaveURL(
      new RegExp(`/publications/${secondPublicationId}\\?sort=name&direction=asc&view=list$`),
    );
    await expect(page.getByRole('button', { name: 'Switch to Grid view' })).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});
