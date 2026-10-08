import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getLocalSupabaseConfig,
  type LocalSupabaseConfig,
  type TestUser,
} from '../support/local-supabase';

test('Magazine recipes keep a free-text citation and online URL @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const recipeUrl = 'https://magazine.example.test/recipes/roasted-carrots';
  const citation = 'Winter issue, web edition, page 18';

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Library' }).click();
    await page.getByRole('link', { name: 'Add publication' }).click();
    await page.getByRole('radio', { name: 'Magazine' }).check();
    await page.getByLabel('Magazine name').fill('Seasonal Table');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Seasonal Table' })).toBeVisible();

    await page.getByRole('link', { name: 'Add Recipe' }).click();
    await page.getByLabel('Name').fill('Roasted carrots');
    await expect(page.getByLabel('Citation')).toBeVisible();
    await expect(page.getByLabel('Url')).toBeVisible();
    await page.getByLabel('Citation').fill(citation);
    await page.getByLabel('Url').fill(recipeUrl);
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Roasted carrots' })).toBeVisible();
    await expect(page.locator('.recipe-attribution')).toContainText(citation);
    await expect(page.locator('.recipe-attribution')).toContainText('Seasonal Table');

    const mobileUrlLink = page.getByRole('link', { name: 'View online' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(mobileUrlLink).toHaveAttribute('href', recipeUrl);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('link', { name: recipeUrl })).toHaveAttribute('href', recipeUrl);
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByLabel('Citation')).toHaveValue(citation);
    await expect(page.getByLabel('Url')).toHaveValue(recipeUrl);
    await page.setViewportSize({ width: 390, height: 844 });
    const publicationBounds = await page.getByLabel('Publication').boundingBox();
    const citationBounds = await page.getByLabel('Citation').boundingBox();
    const urlBounds = await page.getByLabel('Url').boundingBox();
    expect(publicationBounds).not.toBeNull();
    expect(citationBounds).not.toBeNull();
    expect(urlBounds).not.toBeNull();
    if (!publicationBounds || !citationBounds || !urlBounds) {
      throw new Error('Expected Magazine metadata controls to have layout bounds');
    }
    expect(publicationBounds.y).toBeCloseTo(citationBounds.y, 0);
    expect(urlBounds.y).toBeGreaterThan(citationBounds.y);
    await expectNoHorizontalOverflow(page);
    const recipeA11y = await new AxeBuilder({ page }).analyze();
    expect(recipeA11y.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

function ownerHeaders(config: LocalSupabaseConfig, user: TestUser) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/recipes$/);
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
}

function serviceHeaders(config: LocalSupabaseConfig) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Prefer: 'return=representation',
  };
}

async function createPublication(
  request: APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  name: string,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/create_publication`, {
    headers: ownerHeaders(config, user),
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

async function createRecipe(
  request: APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  name: string,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
    headers: ownerHeaders(config, user),
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
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = (await response.json()) as { id: string; version: number }[];
  return recipe;
}

async function assignRecipe(
  request: APIRequestContext,
  config: LocalSupabaseConfig,
  recipeId: string,
  publicationId: string,
  publicationPage: string | null = null,
) {
  const response = await request.patch(`${config.apiUrl}/rest/v1/recipes?id=eq.${recipeId}`, {
    headers: serviceHeaders(config),
    data: { publication_id: publicationId, publication_page: publicationPage },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function readRecipe(
  request: APIRequestContext,
  config: LocalSupabaseConfig,
  recipeId: string,
) {
  const response = await request.get(
    `${config.apiUrl}/rest/v1/recipes?select=id,publication_id,publication_page,recipe_url,trashed_at,version&id=eq.${recipeId}`,
    { headers: serviceHeaders(config) },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = (await response.json()) as {
    id: string;
    publication_id: string | null;
    publication_page: string | null;
    recipe_url: string | null;
    trashed_at: string | null;
    version: number;
  }[];
  return recipe;
}

async function trashPublication(
  request: APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  publicationId: string,
  expectedVersion: number,
  recipeDisposition: 'delete' | 'recipe_tin' | 'another_publication',
  destinationPublicationId: string | null = null,
) {
  return request.post(`${config.apiUrl}/rest/v1/rpc/trash_publication`, {
    headers: ownerHeaders(config, user),
    data: {
      p_publication_id: publicationId,
      p_expected_version: expectedVersion,
      p_recipe_disposition: recipeDisposition,
      p_destination_publication_id: destinationPublicationId,
    },
  });
}

async function expectErrorCode(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
  code: string,
) {
  expect(response.ok()).toBe(false);
  const body = (await response.json()) as { code?: string };
  expect(body.code).toBe(code);
}

function runLocalSqlCommand(sql: string): string {
  return execFileSync('supabase', ['db', 'query', '--local', '--output-format', 'json', sql], {
    encoding: 'utf8',
  });
}

function runLocalSql<T>(sql: string): T[] {
  const output = runLocalSqlCommand(sql);
  const result = JSON.parse(output.slice(output.indexOf('{'))) as { rows: T[] };
  return result.rows;
}

test('publication lifecycle applies recipe disposition atomically and restores retained links @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const deletePublicationId = await createPublication(request, config, owner, 'Delete recipes');
    const tinPublicationId = await createPublication(request, config, owner, 'Move to Recipe Tin');
    const movePublicationId = await createPublication(request, config, owner, 'Move elsewhere');
    const destinationPublicationId = await createPublication(request, config, owner, 'Destination');
    const foreignPublicationId = await createPublication(request, config, other, 'Foreign');
    const deleteRecipe = await createRecipe(request, config, owner, 'Recipe to trash');
    const tinRecipe = await createRecipe(request, config, owner, 'Recipe to unparent');
    const movedRecipe = await createRecipe(request, config, owner, 'Recipe to move');
    const invalidMoveRecipe = await createRecipe(request, config, owner, 'Recipe on invalid move');

    await assignRecipe(request, config, deleteRecipe.id, deletePublicationId, '12');
    await assignRecipe(request, config, tinRecipe.id, tinPublicationId, '18');
    await assignRecipe(request, config, movedRecipe.id, movePublicationId, '22');
    await assignRecipe(request, config, invalidMoveRecipe.id, movePublicationId, '23');

    await expectErrorCode(
      await trashPublication(request, config, other, deletePublicationId, 1, 'delete'),
      'P0002',
    );
    await expectErrorCode(
      await trashPublication(request, config, owner, deletePublicationId, 0, 'delete'),
      '40001',
    );
    await expectErrorCode(
      await trashPublication(
        request,
        config,
        owner,
        movePublicationId,
        1,
        'another_publication',
        foreignPublicationId,
      ),
      'P0002',
    );
    expect((await readRecipe(request, config, invalidMoveRecipe.id)).publication_id).toBe(
      movePublicationId,
    );

    const deleteResponse = await trashPublication(
      request,
      config,
      owner,
      deletePublicationId,
      1,
      'delete',
    );
    expect(deleteResponse.ok(), await deleteResponse.text()).toBeTruthy();
    const trashedRecipe = await readRecipe(request, config, deleteRecipe.id);
    expect(trashedRecipe.publication_id).toBe(deletePublicationId);
    expect(trashedRecipe.trashed_at).not.toBeNull();
    expect(trashedRecipe.version).toBe(2);

    const ownerTrashResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/list_trashed_publications`,
      { headers: ownerHeaders(config, owner), data: {} },
    );
    expect(ownerTrashResponse.ok(), await ownerTrashResponse.text()).toBeTruthy();
    expect(await ownerTrashResponse.json()).toContainEqual(
      expect.objectContaining({
        id: deletePublicationId,
        name: 'Delete recipes',
        version: 2,
      }),
    );
    const foreignTrashResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/list_trashed_publications`,
      { headers: ownerHeaders(config, other), data: {} },
    );
    expect(foreignTrashResponse.ok(), await foreignTrashResponse.text()).toBeTruthy();
    expect(await foreignTrashResponse.json()).toEqual([]);

    const tinResponse = await trashPublication(
      request,
      config,
      owner,
      tinPublicationId,
      1,
      'recipe_tin',
    );
    expect(tinResponse.ok(), await tinResponse.text()).toBeTruthy();
    expect(await readRecipe(request, config, tinRecipe.id)).toMatchObject({
      publication_id: null,
      publication_page: null,
      recipe_url: null,
      trashed_at: null,
      version: 2,
    });

    const moveResponse = await trashPublication(
      request,
      config,
      owner,
      movePublicationId,
      1,
      'another_publication',
      destinationPublicationId,
    );
    expect(moveResponse.ok(), await moveResponse.text()).toBeTruthy();
    expect(await readRecipe(request, config, movedRecipe.id)).toMatchObject({
      publication_id: destinationPublicationId,
      publication_page: '22',
      recipe_url: null,
      trashed_at: null,
      version: 2,
    });

    const restoreResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/restore_publication`, {
      headers: ownerHeaders(config, owner),
      data: { p_publication_id: deletePublicationId, p_expected_version: 2 },
    });
    expect(restoreResponse.ok(), await restoreResponse.text()).toBeTruthy();
    await expectErrorCode(
      await request.post(`${config.apiUrl}/rest/v1/rpc/restore_publication`, {
        headers: ownerHeaders(config, owner),
        data: { p_publication_id: deletePublicationId, p_expected_version: 2 },
      }),
      '40001',
    );

    const recipeRestoreResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/restore_recipe`,
      {
        headers: ownerHeaders(config, owner),
        data: { p_recipe_id: deleteRecipe.id, p_expected_version: 2 },
      },
    );
    expect(recipeRestoreResponse.ok(), await recipeRestoreResponse.text()).toBeTruthy();
    expect(await readRecipe(request, config, deleteRecipe.id)).toMatchObject({
      publication_id: deletePublicationId,
      publication_page: '12',
      recipe_url: null,
      trashed_at: null,
      version: 3,
    });

    const publicationHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/publication_history?select=event_type&record_id=eq.${deletePublicationId}&order=created_at.asc`,
      { headers: serviceHeaders(config) },
    );
    expect(publicationHistoryResponse.ok(), await publicationHistoryResponse.text()).toBeTruthy();
    expect(
      ((await publicationHistoryResponse.json()) as { event_type: string }[]).map(
        ({ event_type }) => event_type,
      ),
    ).toEqual(['publication.created', 'publication.trashed', 'publication.restored']);
  } finally {
    await deleteTestUser(request, owner);
    await deleteTestUser(request, other);
  }
});

test('publication Trash purges retained recipes and history after 30 days @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  let publicationId: string | undefined;
  let publicationRestored = false;
  const restorePublicationForCleanup = async () => {
    if (!publicationId || publicationRestored) {
      return;
    }

    const response = await request.post(`${config.apiUrl}/rest/v1/rpc/restore_publication`, {
      headers: ownerHeaders(config, owner),
      data: { p_publication_id: publicationId, p_expected_version: 2 },
    });
    if (!response.ok()) {
      throw new Error(`Test publication restore failed: ${await response.text()}`);
    }
    publicationRestored = true;
  };

  try {
    publicationId = await createPublication(request, config, owner, 'Expired publication');
    const recipe = await createRecipe(request, config, owner, 'Expired publication recipe');
    await assignRecipe(request, config, recipe.id, publicationId);
    const trashResponse = await trashPublication(
      request,
      config,
      owner,
      publicationId,
      1,
      'delete',
    );
    expect(trashResponse.ok(), await trashResponse.text()).toBeTruthy();

    const trashedPublicationResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=trashed_at&id=eq.${publicationId}`,
      { headers: serviceHeaders(config) },
    );
    expect(trashedPublicationResponse.ok(), await trashedPublicationResponse.text()).toBeTruthy();
    const [trashedPublication] = (await trashedPublicationResponse.json()) as {
      trashed_at: string;
    }[];

    const fixtureRecords = [
      { table: 'publications', id: publicationId, recordColumn: 'id' },
      { table: 'recipes', id: recipe.id, recordColumn: 'id' },
      { table: 'publication_history', id: publicationId, recordColumn: 'record_id' },
      { table: 'recipe_history', id: recipe.id, recordColumn: 'record_id' },
    ];
    const fixtureRows = await Promise.all(
      fixtureRecords.map(async (record) => {
        const response = await request.get(
          `${config.apiUrl}/rest/v1/${record.table}?select=${record.recordColumn}&${record.recordColumn}=eq.${record.id}`,
          { headers: serviceHeaders(config) },
        );
        expect(response.ok(), await response.text()).toBeTruthy();
        const rows = (await response.json()) as unknown[];
        expect(
          rows.length,
          `Expected ${record.table} history/fixture rows before purge.`,
        ).toBeGreaterThan(0);
        return { record, rows };
      }),
    );

    runLocalSqlCommand(`do $purge_test$
declare
  purged_count integer;
begin
  begin
    perform public.purge_expired_publications(
      '${trashedPublication.trashed_at}'::timestamptz - interval '1 microsecond'
    );
    if not exists (select 1 from public.publications where id = '${publicationId}') then
      raise exception 'Publication was purged before reaching the retention cutoff.';
    end if;

    purged_count := public.purge_expired_publications(
      '${trashedPublication.trashed_at}'::timestamptz
    );
    if purged_count < 1 then
      raise exception 'Publication purge did not remove any records.';
    end if;
    if exists (select 1 from public.publications where id = '${publicationId}') then
      raise exception 'Expired publication was not purged.';
    end if;
    if exists (select 1 from public.recipes where id = '${recipe.id}') then
      raise exception 'Retained recipe was not purged with its publication.';
    end if;
    if exists (
      select 1 from public.publication_history where record_id = '${publicationId}'
    ) then
      raise exception 'Publication history was not purged.';
    end if;
    if exists (select 1 from public.recipe_history where record_id = '${recipe.id}') then
      raise exception 'Retained recipe history was not purged.';
    end if;
    raise exception 'rollback publication purge verification';
  exception when others then
    if sqlerrm <> 'rollback publication purge verification' then
      raise;
    end if;
  end;
end;
$purge_test$;`);

    for (const { record, rows: expectedRows } of fixtureRows) {
      const response = await request.get(
        `${config.apiUrl}/rest/v1/${record.table}?select=${record.recordColumn}&${record.recordColumn}=eq.${record.id}`,
        { headers: serviceHeaders(config) },
      );
      expect(response.ok(), await response.text()).toBeTruthy();
      expect(
        await response.json(),
        `Expected ${record.table} rows to remain after rollback.`,
      ).toHaveLength(expectedRows.length);
    }

    const cronJobs = runLocalSql<{ jobname: string; schedule: string; command: string }>(
      "select jobname, schedule, command from cron.job where jobname = 'publication-trash-purge-daily'",
    );
    expect(cronJobs).toHaveLength(1);
    expect(cronJobs[0].schedule).toBe('15 3 * * *');
    expect(cronJobs[0].command).toContain('public.purge_expired_publications');
    await restorePublicationForCleanup();
    await deleteTestUser(request, owner);
  } catch (error) {
    try {
      await restorePublicationForCleanup();
      await deleteTestUser(request, owner);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Publication purge assertions and test-user cleanup both failed.',
      );
    }
    throw error;
  }
});

test('empty publication deletion confirms without a recipe disposition @e2e @a11y', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationId = await createPublication(request, config, owner, 'Empty publication');
    await signIn(page, owner.email, owner.password);
    await page.goto(`/publications/${publicationId}`);
    await page.getByRole('button', { name: 'Delete publication' }).click();

    const dialog = page.getByRole('dialog', { name: 'Move publication to Trash?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('no active recipes to move');
    await expect(dialog.locator('.publication-delete-dispositions')).toHaveCount(0);
    await expect(dialog.locator('input[name="recipe_disposition"]')).toHaveValue('delete');
    await expect(dialog.getByRole('button', { name: 'Move to Trash' })).toBeEnabled();
    const dialogA11y = await new AxeBuilder({ page }).analyze();
    expect(dialogA11y.violations).toEqual([]);

    await dialog.getByRole('button', { name: 'Move to Trash' }).click();
    await expect(page).toHaveURL(/\/publications\?status=trashed$/);
    await expect(page.getByRole('status')).toContainText('moved to Trash');
  } finally {
    await deleteTestUser(request, owner);
  }
});

test('publication deletion requires a disposition and can be restored from Trash @e2e @a11y', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationId = await createPublication(request, config, owner, 'Trash source');
    const destinationId = await createPublication(request, config, owner, 'Trash destination');
    const recipe = await createRecipe(request, config, owner, 'Recipe in Trash source');
    await assignRecipe(request, config, recipe.id, publicationId);
    await signIn(page, owner.email, owner.password);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/publications/${publicationId}`);
    await expect(page.getByRole('heading', { name: 'Trash source' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(
      page.locator('.publication-detail-actions').getByRole('button', {
        name: 'Delete publication',
      }),
    ).toHaveCount(0);
    const deletePublicationButton = page
      .locator('.publication-delete-section')
      .getByRole('button', { name: 'Delete publication' });
    await expect(
      page.locator('.publication-delete-section').getByRole('button', {
        name: 'Delete publication',
      }),
    ).toBeVisible();
    await expect(deletePublicationButton).toHaveCSS('border-radius', '0px');
    await expect(deletePublicationButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await deletePublicationButton.hover();
    await expect(deletePublicationButton).toHaveCSS('background-color', 'rgb(180, 62, 50)');
    await expect(deletePublicationButton).toHaveCSS('color', 'rgb(255, 255, 255)');

    await deletePublicationButton.click();
    const dialog = page.getByRole('dialog', { name: 'Move publication to Trash?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Move to Trash' })).toBeDisabled();
    const dialogA11y = await new AxeBuilder({ page }).analyze();
    expect(dialogA11y.violations).toEqual([]);

    await dialog.getByRole('radio', { name: 'Move recipes to another publication' }).check();
    const destinationPicker = dialog.getByRole('button', { name: /Destination publication/ });
    await destinationPicker.click();
    const destinationOptions = dialog.getByRole('listbox', { name: 'Destination publication' });
    const optionBounds = await destinationOptions.boundingBox();
    if (!optionBounds) {
      throw new Error('Destination options must be visible.');
    }
    expect(optionBounds.x).toBeGreaterThanOrEqual(0);
    expect(optionBounds.y).toBeGreaterThanOrEqual(0);
    expect(optionBounds.x + optionBounds.width).toBeLessThanOrEqual(390);
    expect(optionBounds.y + optionBounds.height).toBeLessThanOrEqual(844);
    await destinationOptions.getByRole('option', { name: /Trash destination/ }).click();
    await expect(destinationPicker).toContainText('Trash destination');
    await expect(dialog.locator('input[name="destination_publication_id"]')).toHaveValue(
      destinationId,
    );
    await dialog.getByRole('button', { name: 'Move to Trash' }).click();

    await expect(page).toHaveURL(/\/publications\?status=trashed$/);
    await expect(page.getByRole('status')).toContainText('moved to Trash');
    runLocalSqlCommand(`do $trash_display_fixture$
begin
  perform set_config('app.publication_lifecycle_context', 'on', true);
  update public.publications
  set trashed_at = now() - interval '29 days'
  where id = '${publicationId}';
end;
$trash_display_fixture$;`);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('link', { name: 'View Trash' }).click();
    const trashedPublication = page.getByRole('row', { name: /Trash source/ });
    await expect(trashedPublication).toBeVisible();
    await expect(trashedPublication.getByRole('img', { name: 'Book' })).toBeVisible();
    const restoreButton = trashedPublication.getByRole('button', { name: 'Restore Trash source' });
    await expect(restoreButton).toHaveCSS('white-space', 'nowrap');
    await expect(restoreButton).toHaveCSS('text-decoration-line', 'none');
    await restoreButton.hover();
    await expect(restoreButton).toHaveCSS('text-decoration-line', 'underline');
    const trashDates = trashedPublication.locator('time');
    await expect(trashDates).toHaveCount(2);
    await expect(trashDates.nth(0)).toHaveCSS('white-space', 'nowrap');
    await expect(trashDates.nth(1)).toHaveClass(/recipe-trash-purge-urgent/);
    await expect(page.getByRole('columnheader', { name: 'Purge Date' }).first()).toBeVisible();
    const trashTableBounds = await page.locator('.recipe-trash-list').boundingBox();
    const trashContainerBounds = await page.locator('.recipe-trash-table-scroll').boundingBox();
    const purgeCellBounds = await trashedPublication.locator('td').nth(2).boundingBox();
    const purgeDateBounds = await trashDates.nth(1).boundingBox();
    if (!trashTableBounds || !trashContainerBounds || !purgeCellBounds || !purgeDateBounds) {
      throw new Error('Trash table and purge date must be measurable.');
    }
    expect(Math.abs(trashTableBounds.width - trashContainerBounds.width)).toBeLessThan(1);
    expect(purgeCellBounds.width - purgeDateBounds.width).toBeLessThan(12);
    const restoreButtonBounds = await restoreButton.boundingBox();
    const publicationCellBounds = await trashedPublication.locator('td').first().boundingBox();
    if (!restoreButtonBounds || !publicationCellBounds) {
      throw new Error('Restore action and publication cell must be measurable.');
    }
    expect(
      Math.abs(
        publicationCellBounds.x +
          publicationCellBounds.width -
          (restoreButtonBounds.x + restoreButtonBounds.width),
      ),
    ).toBeLessThan(16);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(trashedPublication.locator('td').first()).toHaveCSS('padding-left', '14px');
    await expect(trashedPublication.locator('td').first()).toHaveCSS('padding-right', '0px');
    const mobileRestoreBounds = await restoreButton.boundingBox();
    const mobileCellBounds = await trashedPublication.locator('td').first().boundingBox();
    if (!mobileRestoreBounds || !mobileCellBounds) {
      throw new Error('Mobile Restore action and publication cell must be measurable.');
    }
    expect(
      Math.abs(
        mobileCellBounds.x +
          mobileCellBounds.width -
          (mobileRestoreBounds.x + mobileRestoreBounds.width),
      ),
    ).toBeLessThan(1);
    await expect(trashedPublication.locator('.recipe-trash-publication-title')).toHaveCSS(
      'gap',
      '14px',
    );
    const trashA11y = await new AxeBuilder({ page }).analyze();
    expect(trashA11y.violations).toEqual([]);
    await expectNoHorizontalOverflow(page);

    await trashedPublication.getByRole('button', { name: 'Restore Trash source' }).click();
    await expect(page).toHaveURL(new RegExp(`/publications/${publicationId}$`));
    await expect(page.getByRole('heading', { name: 'Trash source' })).toBeVisible();

    const restoredPublicationResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id,account_id,trashed_at&id=eq.${publicationId}`,
      { headers: ownerHeaders(config, owner) },
    );
    expect(restoredPublicationResponse.ok(), await restoredPublicationResponse.text()).toBeTruthy();
    expect(await restoredPublicationResponse.json()).toEqual([
      { id: publicationId, account_id: owner.id, trashed_at: null },
    ]);

    await page.getByRole('link', { name: 'Add Recipe' }).click();
    await expect(page.locator('input[name="publication_id"]')).toHaveValue(publicationId);
    await page.getByLabel('Name').fill('Recipe in restored publication');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(
      page.getByRole('heading', { name: 'Recipe in restored publication' }),
    ).toBeVisible();
    const createdRecipeId = new URL(page.url()).pathname.split('/').at(-1);
    if (!createdRecipeId) {
      throw new Error('The created recipe URL must include its ID.');
    }
    expect(await readRecipe(request, config, createdRecipeId)).toMatchObject({
      publication_id: publicationId,
      trashed_at: null,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/publications/${publicationId}`);
    const mobilePublicationTable = page.locator('.publication-recipe-list');
    await expect(mobilePublicationTable).toBeVisible();
    const mobileAddRecipeBounds = await page
      .getByRole('link', { name: 'Add Recipe' })
      .boundingBox();
    const mobileRecipeDividerBounds = await page
      .locator('.publication-recipe-scroll')
      .boundingBox();
    const mobileLastRecipeBounds = await mobilePublicationTable
      .locator('tbody tr:last-child')
      .boundingBox();
    const mobileDeleteButtonBounds = await page
      .locator('.publication-delete-section')
      .getByRole('button', { name: 'Delete publication' })
      .boundingBox();
    if (
      !mobileAddRecipeBounds ||
      !mobileRecipeDividerBounds ||
      !mobileLastRecipeBounds ||
      !mobileDeleteButtonBounds
    ) {
      throw new Error('Mobile publication actions and dividers must be measurable.');
    }
    expect(mobileDeleteButtonBounds.height).toBe(mobileAddRecipeBounds.height);
    expect(Math.abs(mobileDeleteButtonBounds.width - mobileAddRecipeBounds.width)).toBeLessThan(1);
    const mobileAddRecipe = page.getByRole('link', { name: 'Add Recipe' });
    const mobileDeleteButton = page
      .locator('.publication-delete-section')
      .getByRole('button', { name: 'Delete publication' });
    await expect(mobileAddRecipe).toHaveCSS('justify-content', 'center');
    await expect(mobileDeleteButton).toHaveCSS(
      'font-size',
      await mobileAddRecipe.evaluate((element) => getComputedStyle(element).fontSize),
    );
    const mobileAddToDividerSpacing =
      mobileRecipeDividerBounds.y - mobileAddRecipeBounds.y - mobileAddRecipeBounds.height;
    const mobileDividerToDeleteSpacing =
      mobileDeleteButtonBounds.y - mobileLastRecipeBounds.y - mobileLastRecipeBounds.height;
    expect(Math.abs(mobileAddToDividerSpacing - mobileDividerToDeleteSpacing)).toBeLessThan(3);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/publications/${publicationId}`);
    const publicationRecipeTable = page.locator('.publication-recipe-list');
    await expect(publicationRecipeTable).toBeVisible();
    const publicationRecipeHorizontalSpacing = await publicationRecipeTable.evaluate((table) => {
      const styles = getComputedStyle(table);
      const columnGap = Number.parseFloat(styles.columnGap);
      const borderSpacing = Number.parseFloat(styles.borderSpacing);
      return columnGap + borderSpacing;
    });
    expect(Math.abs(publicationRecipeHorizontalSpacing - (4 * 96) / 25.4)).toBeLessThan(1);
    const publicationRecipeTableWidth = await publicationRecipeTable.evaluate(
      (table) => table.getBoundingClientRect().width,
    );
    const publicationRecipeTableContainerWidth = await page
      .locator('.publication-recipe-scroll')
      .evaluate((container) => container.getBoundingClientRect().width);
    expect(publicationRecipeTableWidth).toBeCloseTo(publicationRecipeTableContainerWidth, 1);
    const publicationRecipeTableRight = await publicationRecipeTable.evaluate(
      (table) => table.getBoundingClientRect().right,
    );
    const publicationRecipeLastCellRight = await publicationRecipeTable
      .locator('tbody tr:first-child td:last-child')
      .evaluate((cell) => cell.getBoundingClientRect().right);
    expect(publicationRecipeLastCellRight).toBeCloseTo(publicationRecipeTableRight, 1);
    await expect(page.locator('.publication-delete-section')).toHaveCSS('border-top-width', '0px');
    await expect(publicationRecipeTable.locator('tbody tr:last-child td').last()).toHaveCSS(
      'border-bottom-width',
      '1px',
    );
    const addRecipeBounds = await page.getByRole('link', { name: 'Add Recipe' }).boundingBox();
    const recipeDividerBounds = await page.locator('.publication-recipe-scroll').boundingBox();
    const lastRecipeBounds = await publicationRecipeTable
      .locator('tbody tr:last-child td')
      .last()
      .boundingBox();
    const deleteButtonBounds = await page
      .locator('.publication-delete-section')
      .getByRole('button', { name: 'Delete publication' })
      .boundingBox();
    if (!addRecipeBounds || !recipeDividerBounds || !lastRecipeBounds || !deleteButtonBounds) {
      throw new Error('Publication actions and recipe dividers must be measurable.');
    }
    expect(deleteButtonBounds.height).toBe(addRecipeBounds.height);
    const addToDividerSpacing = recipeDividerBounds.y - addRecipeBounds.y - addRecipeBounds.height;
    const dividerToDeleteSpacing =
      deleteButtonBounds.y - lastRecipeBounds.y - lastRecipeBounds.height;
    expect(Math.abs(addToDividerSpacing - dividerToDeleteSpacing)).toBeLessThan(3);
  } finally {
    await deleteTestUser(request, owner);
  }
});
