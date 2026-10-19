import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import { captureScreenshot } from '../support/capture-screenshot';
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
    await page.locator('.recipe-form').getByLabel('Name').fill('Roasted carrots');
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
  publicationType: 'book' | 'site' = 'book',
  siteUrl: string | null = null,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/create_publication`, {
    headers: ownerHeaders(config, user),
    data: {
      p_name: name,
      p_publication_type: publicationType,
      p_author: null,
      p_edition: null,
      p_isbn: null,
      p_retailer_url: null,
      p_issue: null,
      p_site_url: siteUrl,
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

function assignRecipes(
  assignments: {
    recipeId: string;
    publicationId: string;
    publicationPage?: string;
    recipeUrl?: string;
  }[],
) {
  const assignmentValues = assignments
    .map(({ recipeId, publicationId, publicationPage, recipeUrl }) => {
      const escapedPage = publicationPage?.replaceAll("'", "''");
      const escapedUrl = recipeUrl?.replaceAll("'", "''");
      return `('${recipeId}'::uuid, '${publicationId}'::uuid, ${escapedPage === undefined ? 'null::text' : `'${escapedPage}'::text`}, ${escapedUrl === undefined ? 'null::text' : `'${escapedUrl}'::text`})`;
    })
    .join(',\n');
  runLocalSqlCommand(`
    with recipe_lifecycle_context as materialized (
      select set_config('app.recipe_lifecycle_context', 'on', true)
    ), assignments(recipe_id, publication_id, publication_page, recipe_url) as (
      values ${assignmentValues}
    )
    update public.recipes as recipe
    set publication_id = assignments.publication_id,
        publication_page = assignments.publication_page,
      recipe_url = assignments.recipe_url
    from assignments, recipe_lifecycle_context
    where recipe.id = assignments.recipe_id;
  `);
}

function assignRecipe(recipeId: string, publicationId: string, publicationPage?: string) {
  assignRecipes([{ recipeId, publicationId, publicationPage }]);
}

function readRecipe(recipeId: string) {
  const [recipe] = runLocalSql<{
    id: string;
    publication_id: string | null;
    publication_page: string | null;
    recipe_url: string | null;
    trashed_at: string | null;
    version: number;
  }>(`
    select id, publication_id, publication_page, recipe_url, trashed_at, version
    from public.recipes
    where id = '${recipeId}'::uuid;
  `);
  if (!recipe) {
    throw new Error(`Test recipe ${recipeId} was not found.`);
  }
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
  try {
    const args = ['db', 'query', '--local'];
    if (process.env.SUPABASE_WORKDIR) {
      args.push('--workdir', process.env.SUPABASE_WORKDIR);
    }
    args.push('--output-format', 'json', sql);
    return execFileSync('supabase', args, {
      encoding: 'utf8',
    });
  } catch (error) {
    const commandError =
      error instanceof Error
        ? (error as Error & {
            stdout?: unknown;
            stderr?: unknown;
            status?: number | null;
            signal?: string | null;
          })
        : null;
    const stdout = String(commandError?.stdout ?? '').trim();
    const stderr = String(commandError?.stderr ?? '').trim();
    const diagnostic = [
      commandError?.status != null ? `Exit status: ${commandError.status}` : '',
      commandError?.signal ? `Signal: ${commandError.signal}` : '',
      stdout ? `stdout:\n${stdout}` : '',
      stderr ? `stderr:\n${stderr}` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, '$1[redacted]@')
      .replace(/((?:password|token|secret|apikey)=)[^\s&]+/gi, '$1[redacted]');
    throw new Error(diagnostic || 'Local Supabase SQL command failed without diagnostics.', {
      cause: error,
    });
  }
}

function runLocalSql<T>(sql: string): T[] {
  const output = runLocalSqlCommand(sql);
  const result = JSON.parse(output.slice(output.indexOf('{'))) as { rows: T[] };
  return result.rows;
}

test('publication updates are owner-scoped, versioned, and preserve recipe locations @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationId = await createPublication(request, config, owner, 'Original Cookbook');
    const recipe = await createRecipe(request, config, owner, 'Linked recipe');
    await assignRecipe(recipe.id, publicationId, '18-19');
    const [coverAsset] = runLocalSql<{ id: string }>(`
      with publication_lifecycle_context as materialized (
        select set_config('app.publication_lifecycle_context', 'on', true)
      ), inserted as (
        insert into public.media_assets (
          account_id, publication_id, asset_type, status, full_path, thumbnail_path,
          content_type, byte_size, width, height
        )
        select
          '${owner.id}', '${publicationId}', 'publication_cover', 'ready',
          'test/${publicationId}.webp', 'test/${publicationId}-thumb.webp',
          'image/webp', 1, 1, 1
        from publication_lifecycle_context
        returning id
      )
      select id from inserted;
    `);

    const updateResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
      headers: ownerHeaders(config, owner),
      data: {
        p_publication_id: publicationId,
        p_expected_version: 1,
        p_name: 'Updated Cookbook',
        p_author: 'A. Writer',
        p_edition: 'Second edition',
        p_isbn: '0306406152',
        p_retailer_url: 'https://books.example.test/updated',
        p_site_url: null,
      },
    });
    expect(updateResponse.ok(), await updateResponse.text()).toBeTruthy();
    expect(await updateResponse.json()).toEqual([{ id: publicationId, version: 2 }]);

    const publicationResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id,name,publication_type,author,edition,isbn,retailer_url,site_url,version&id=eq.${publicationId}`,
      { headers: serviceHeaders(config) },
    );
    expect(publicationResponse.ok(), await publicationResponse.text()).toBeTruthy();
    expect(await publicationResponse.json()).toEqual([
      {
        id: publicationId,
        name: 'Updated Cookbook',
        publication_type: 'book',
        author: 'A. Writer',
        edition: 'Second edition',
        isbn: '0306406152',
        retailer_url: 'https://books.example.test/updated',
        site_url: null,
        version: 2,
      },
    ]);
    expect(readRecipe(recipe.id)).toMatchObject({
      publication_id: publicationId,
      publication_page: '18-19',
      trashed_at: null,
    });

    const historyResponse = await request.get(
      `${config.apiUrl}/rest/v1/publication_history?select=event_type,before_data,after_data&record_id=eq.${publicationId}&order=created_at.asc`,
      { headers: serviceHeaders(config) },
    );
    expect(historyResponse.ok(), await historyResponse.text()).toBeTruthy();
    const initialHistory = (await historyResponse.json()) as {
      event_type: string;
      before_data: { name: string; version: number } | null;
      after_data: { name: string; version: number } | null;
    }[];
    expect(initialHistory.filter((event) => event.event_type === 'publication.updated')).toEqual([
      {
        event_type: 'publication.updated',
        before_data: expect.objectContaining({ name: 'Original Cookbook', version: 1 }),
        after_data: expect.objectContaining({ name: 'Updated Cookbook', version: 2 }),
      },
    ]);

    const coverResponse = await request.get(
      `${config.apiUrl}/rest/v1/media_assets?select=id,publication_id&publication_id=eq.${publicationId}&asset_type=eq.publication_cover&status=eq.ready`,
      { headers: serviceHeaders(config) },
    );
    expect(coverResponse.ok(), await coverResponse.text()).toBeTruthy();
    expect(await coverResponse.json()).toEqual([
      { id: coverAsset.id, publication_id: publicationId },
    ]);

    const unchangedSave = await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
      headers: ownerHeaders(config, owner),
      data: {
        p_publication_id: publicationId,
        p_expected_version: 2,
        p_name: 'Updated Cookbook',
        p_author: 'A. Writer',
        p_edition: 'Second edition',
        p_isbn: '0306406152',
        p_retailer_url: 'https://books.example.test/updated',
        p_site_url: null,
      },
    });
    expect(unchangedSave.ok(), await unchangedSave.text()).toBeTruthy();
    expect(await unchangedSave.json()).toEqual([{ id: publicationId, version: 3 }]);

    await expectErrorCode(
      await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
        headers: { apikey: config.anonKey },
        data: {
          p_publication_id: publicationId,
          p_expected_version: 3,
          p_name: 'Anonymous Update',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_site_url: null,
        },
      }),
      '42501',
    );
    await expectErrorCode(
      await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
        headers: ownerHeaders(config, owner),
        data: {
          p_publication_id: publicationId,
          p_expected_version: 3,
          p_name: 'Invalid URL',
          p_author: 'A. Writer',
          p_edition: 'Second edition',
          p_isbn: '0306406152',
          p_retailer_url: 'javascript:alert(1)',
          p_site_url: null,
        },
      }),
      '23514',
    );

    await expectErrorCode(
      await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
        headers: ownerHeaders(config, owner),
        data: {
          p_publication_id: publicationId,
          p_expected_version: 1,
          p_name: 'Stale Cookbook',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_site_url: null,
        },
      }),
      'PT409',
    );
    await expectErrorCode(
      await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
        headers: ownerHeaders(config, other),
        data: {
          p_publication_id: publicationId,
          p_expected_version: 3,
          p_name: 'Foreign Update',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_site_url: null,
        },
      }),
      'P0002',
    );

    const createMagazine = async (name: string) => {
      const response = await request.post(`${config.apiUrl}/rest/v1/rpc/create_publication`, {
        headers: ownerHeaders(config, owner),
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
    };
    const existingMagazineId = await createMagazine('Seasonal Table');
    const duplicateMagazineId = await createMagazine('Other Magazine');
    await expectErrorCode(
      await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
        headers: ownerHeaders(config, owner),
        data: {
          p_publication_id: duplicateMagazineId,
          p_expected_version: 1,
          p_name: '  seasonal table  ',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_site_url: null,
        },
      }),
      '23505',
    );
    expect(existingMagazineId).not.toBe(duplicateMagazineId);

    const trashedPublicationId = await createPublication(request, config, owner, 'Already trashed');
    const trashedResponse = await trashPublication(
      request,
      config,
      owner,
      trashedPublicationId,
      1,
      'delete',
    );
    expect(trashedResponse.ok(), await trashedResponse.text()).toBeTruthy();
    await expectErrorCode(
      await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
        headers: ownerHeaders(config, owner),
        data: {
          p_publication_id: trashedPublicationId,
          p_expected_version: 2,
          p_name: 'Restore by editing',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_site_url: null,
        },
      }),
      '55000',
    );

    const unchangedHistory = await request.get(
      `${config.apiUrl}/rest/v1/publication_history?select=event_type&record_id=eq.${publicationId}`,
      { headers: serviceHeaders(config) },
    );
    expect(unchangedHistory.ok(), await unchangedHistory.text()).toBeTruthy();
    const finalHistory = (await unchangedHistory.json()) as { event_type: string }[];
    expect(finalHistory.filter((event) => event.event_type === 'publication.updated')).toHaveLength(
      2,
    );
  } finally {
    await deleteTestUser(request, owner);
    await deleteTestUser(request, other);
  }
});

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
    const previouslyTrashedRecipe = await createRecipe(
      request,
      config,
      owner,
      'Previously trashed',
    );
    const tinRecipe = await createRecipe(request, config, owner, 'Recipe to unparent');
    const previouslyTrashedTinRecipe = await createRecipe(
      request,
      config,
      owner,
      'Previously trashed in publication moved to Tin',
    );
    const movedRecipe = await createRecipe(request, config, owner, 'Recipe to move');
    const invalidMoveRecipe = await createRecipe(request, config, owner, 'Recipe on invalid move');
    const recipeTinResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id&publication_type=eq.collection`,
      { headers: ownerHeaders(config, owner) },
    );
    expect(recipeTinResponse.ok(), await recipeTinResponse.text()).toBeTruthy();
    const [{ id: recipeTinId }] = (await recipeTinResponse.json()) as { id: string }[];

    assignRecipes([
      { recipeId: deleteRecipe.id, publicationId: deletePublicationId, publicationPage: '12' },
      {
        recipeId: previouslyTrashedRecipe.id,
        publicationId: deletePublicationId,
        publicationPage: '13',
      },
      { recipeId: tinRecipe.id, publicationId: tinPublicationId, publicationPage: '18' },
      {
        recipeId: previouslyTrashedTinRecipe.id,
        publicationId: tinPublicationId,
        publicationPage: '19',
      },
      { recipeId: movedRecipe.id, publicationId: movePublicationId, publicationPage: '22' },
      { recipeId: invalidMoveRecipe.id, publicationId: movePublicationId, publicationPage: '23' },
    ]);

    const previousTrashResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: previouslyTrashedRecipe.id, p_expected_version: 1 },
    });
    expect(previousTrashResponse.ok(), await previousTrashResponse.text()).toBeTruthy();
    const previousTinTrashResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/trash_recipe`,
      {
        headers: ownerHeaders(config, owner),
        data: { p_recipe_id: previouslyTrashedTinRecipe.id, p_expected_version: 1 },
      },
    );
    expect(previousTinTrashResponse.ok(), await previousTinTrashResponse.text()).toBeTruthy();

    await expectErrorCode(
      await trashPublication(request, config, other, deletePublicationId, 1, 'delete'),
      'P0002',
    );
    expect(() =>
      runLocalSqlCommand(`
        with owner_context as materialized (
          select set_config('request.jwt.claim.sub', '${owner.id}', true)
        )
        select public.trash_publication('${deletePublicationId}', 0, 'delete', null)
        from owner_context;
      `),
    ).toThrow('Publication version is stale.');
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
    expect(readRecipe(invalidMoveRecipe.id).publication_id).toBe(movePublicationId);

    const deleteResponse = await trashPublication(
      request,
      config,
      owner,
      deletePublicationId,
      1,
      'delete',
    );
    expect(deleteResponse.ok(), await deleteResponse.text()).toBeTruthy();
    const trashedRecipe = readRecipe(deleteRecipe.id);
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
    expect(readRecipe(tinRecipe.id)).toMatchObject({
      publication_id: recipeTinId,
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
    expect(readRecipe(movedRecipe.id)).toMatchObject({
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
    expect(readRecipe(deleteRecipe.id)).toMatchObject({
      publication_id: deletePublicationId,
      publication_page: '12',
      trashed_at: null,
      version: 3,
    });
    expect(readRecipe(previouslyTrashedRecipe.id)).toMatchObject({
      publication_id: deletePublicationId,
      trashed_at: expect.any(String),
      version: 2,
    });
    expect(() =>
      runLocalSqlCommand(`
        with owner_context as materialized (
          select set_config('request.jwt.claim.sub', '${owner.id}', true)
        )
        select public.restore_publication('${deletePublicationId}', 2)
        from owner_context;
      `),
    ).toThrow('Publication version is stale.');

    const tinRestoreResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/restore_publication`,
      {
        headers: ownerHeaders(config, owner),
        data: { p_publication_id: tinPublicationId, p_expected_version: 2 },
      },
    );
    expect(tinRestoreResponse.ok(), await tinRestoreResponse.text()).toBeTruthy();
    expect(readRecipe(tinRecipe.id)).toMatchObject({
      publication_id: tinPublicationId,
      publication_page: '18',
      trashed_at: null,
      version: 3,
    });
    expect(readRecipe(previouslyTrashedTinRecipe.id)).toMatchObject({
      publication_id: tinPublicationId,
      trashed_at: expect.any(String),
      version: 2,
    });

    const moveRestoreResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/restore_publication`,
      {
        headers: ownerHeaders(config, owner),
        data: { p_publication_id: movePublicationId, p_expected_version: 2 },
      },
    );
    expect(moveRestoreResponse.ok(), await moveRestoreResponse.text()).toBeTruthy();
    expect(readRecipe(movedRecipe.id)).toMatchObject({
      publication_id: destinationPublicationId,
      publication_page: '22',
      trashed_at: null,
      version: 2,
    });
    expect(readRecipe(invalidMoveRecipe.id)).toMatchObject({
      publication_id: destinationPublicationId,
      publication_page: '23',
      trashed_at: null,
      version: 2,
    });

    const publicationHistory = runLocalSql<{ event_type: string }>(`
      select event_type
      from public.publication_history
      where record_id = '${deletePublicationId}'::uuid
      order by created_at asc;
    `);
    expect(publicationHistory.map(({ event_type }) => event_type)).toEqual([
      'publication.created',
      'publication.trashed',
      'publication.restored',
    ]);
  } finally {
    await deleteTestUser(request, owner);
    await deleteTestUser(request, other);
  }
});

test('publication restore retains a Site recipe URL after moving it to Recipe Tin @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const recipeUrl = 'https://site.example.test/recipes/roasted-carrots';

  try {
    const sitePublicationId = await createPublication(
      request,
      config,
      owner,
      'Recipe source site',
      'site',
      'https://site.example.test',
    );
    const recipe = await createRecipe(request, config, owner, 'Recipe with online source');
    const recipeTinResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id&publication_type=eq.collection`,
      { headers: ownerHeaders(config, owner) },
    );
    expect(recipeTinResponse.ok(), await recipeTinResponse.text()).toBeTruthy();
    const [{ id: recipeTinId }] = (await recipeTinResponse.json()) as { id: string }[];

    assignRecipes([{ recipeId: recipe.id, publicationId: sitePublicationId, recipeUrl }]);
    const trashResponse = await trashPublication(
      request,
      config,
      owner,
      sitePublicationId,
      1,
      'recipe_tin',
    );
    expect(trashResponse.ok(), await trashResponse.text()).toBeTruthy();
    expect(readRecipe(recipe.id)).toMatchObject({
      publication_id: recipeTinId,
      recipe_url: null,
      version: 2,
    });

    const restoreResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/restore_publication`, {
      headers: ownerHeaders(config, owner),
      data: { p_publication_id: sitePublicationId, p_expected_version: 2 },
    });
    expect(restoreResponse.ok(), await restoreResponse.text()).toBeTruthy();
    expect(readRecipe(recipe.id)).toMatchObject({
      publication_id: sitePublicationId,
      publication_page: null,
      recipe_url: recipeUrl,
      trashed_at: null,
      version: 3,
    });
  } finally {
    await deleteTestUser(request, owner);
  }
});

test('Trash supports confirmed per-item and all-item purges @e2e @a11y', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const recipe = await createRecipe(request, config, owner, 'Recipe to permanently delete');
    const trashRecipeResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: recipe.id, p_expected_version: recipe.version },
    });
    expect(trashRecipeResponse.ok(), await trashRecipeResponse.text()).toBeTruthy();
    const otherRecipe = await createRecipe(request, config, other, 'Other account trash recipe');
    const trashOtherRecipeResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/trash_recipe`,
      {
        headers: ownerHeaders(config, other),
        data: { p_recipe_id: otherRecipe.id, p_expected_version: otherRecipe.version },
      },
    );
    expect(trashOtherRecipeResponse.ok(), await trashOtherRecipeResponse.text()).toBeTruthy();

    await expectErrorCode(
      await request.post(`${config.apiUrl}/rest/v1/rpc/purge_trashed_item`, {
        headers: ownerHeaders(config, other),
        data: {
          p_item_type: 'recipe',
          p_item_id: recipe.id,
          p_expected_version: 2,
          p_recipe_disposition: null,
        },
      }),
      'P0002',
    );
    expect(() =>
      runLocalSqlCommand(`
        with owner_context as materialized (
          select set_config('request.jwt.claim.sub', '${owner.id}', true)
        )
        select public.purge_trashed_item('recipe', '${recipe.id}', 1, null)
        from owner_context;
      `),
    ).toThrow('Trash item version is stale.');

    const publicationId = await createPublication(request, config, owner, 'Publication to clear');
    const trashPublicationResponse = await trashPublication(
      request,
      config,
      owner,
      publicationId,
      1,
      'delete',
    );
    expect(trashPublicationResponse.ok(), await trashPublicationResponse.text()).toBeTruthy();

    await signIn(page, owner.email, owner.password);
    await page.goto('/recipes/trash');
    const recipeRow = page.getByRole('row', { name: /Recipe to permanently delete/ });
    await expect(recipeRow).toBeVisible();
    await expect(page.getByRole('row', { name: /Other account trash recipe/ })).toHaveCount(0);
    await recipeRow.hover();
    await recipeRow.getByRole('button', { name: 'Purge Recipe to permanently delete' }).click();

    const recipeDialog = page.getByRole('dialog', {
      name: 'Permanently delete Recipe to permanently delete?',
    });
    await expect(recipeDialog).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await recipeDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(recipeDialog).not.toBeVisible();
    await expect(recipeRow).toBeVisible();

    await recipeRow.getByRole('button', { name: 'Purge Recipe to permanently delete' }).click();
    await page
      .getByRole('dialog', { name: 'Permanently delete Recipe to permanently delete?' })
      .getByRole('button', { name: 'Permanently delete' })
      .click();
    await expect(page).toHaveURL(/\/recipes\/trash\?status=purged$/);
    await expect(page.getByRole('status')).toContainText('permanently deleted');
    await expect(page.getByRole('row', { name: /Recipe to permanently delete/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Purge all' }).click();
    const purgeAllDialog = page.getByRole('dialog', { name: 'Permanently delete all Trash?' });
    await expect(purgeAllDialog).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await purgeAllDialog.getByRole('button', { name: 'Purge all' }).click();
    await expect(page).toHaveURL(/\/recipes\/trash\?status=purged-all$/);
    await expect(page.getByRole('status')).toContainText('permanently cleared');
    await expect(page.getByText('Trash is empty.')).toBeVisible();
    const otherRecipeResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/list_trashed_recipes`,
      { headers: ownerHeaders(config, other), data: {} },
    );
    expect(otherRecipeResponse.ok(), await otherRecipeResponse.text()).toBeTruthy();
    expect(await otherRecipeResponse.json()).toContainEqual(
      expect.objectContaining({ id: otherRecipe.id }),
    );
    const purgeOtherRecipeResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/purge_trashed_item`,
      {
        headers: ownerHeaders(config, other),
        data: {
          p_item_type: 'recipe',
          p_item_id: otherRecipe.id,
          p_expected_version: 2,
          p_recipe_disposition: null,
        },
      },
    );
    expect(purgeOtherRecipeResponse.ok(), await purgeOtherRecipeResponse.text()).toBeTruthy();
  } finally {
    await deleteTestUser(request, owner);
    await deleteTestUser(request, other);
  }
});

test('publication purge applies the selected recipe disposition @e2e @a11y', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const [{ id: recipeTinId }] = runLocalSql<{ id: string }>(`
    select id
    from public.publications
    where account_id = '${owner.id}'::uuid
      and publication_type = 'collection';
  `);
  const choices = [
    { value: 'all', label: /Every recipe from this publication/, expectedCount: 0 },
    {
      value: 'deleted_with_publication',
      label: /Only recipes moved to Trash with it/,
      expectedCount: 1,
    },
    { value: 'keep', label: /Keep all recipes/, expectedCount: 2 },
  ] as const;

  try {
    await signIn(page, owner.email, owner.password);

    for (const choice of choices) {
      const publicationName = `Purge disposition ${choice.value} ${randomUUID()}`;
      const publicationId = await createPublication(request, config, owner, publicationName);
      const cascadeRecipe = await createRecipe(
        request,
        config,
        owner,
        `${publicationName} cascade recipe`,
      );
      const previouslyTrashedRecipe = await createRecipe(
        request,
        config,
        owner,
        `${publicationName} previously trashed recipe`,
      );
      assignRecipes([
        { recipeId: cascadeRecipe.id, publicationId },
        { recipeId: previouslyTrashedRecipe.id, publicationId },
      ]);

      const trashRecipeResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
        headers: ownerHeaders(config, owner),
        data: { p_recipe_id: previouslyTrashedRecipe.id, p_expected_version: 1 },
      });
      expect(trashRecipeResponse.ok(), await trashRecipeResponse.text()).toBeTruthy();
      const trashPublicationResponse = await trashPublication(
        request,
        config,
        owner,
        publicationId,
        1,
        'delete',
      );
      expect(trashPublicationResponse.ok(), await trashPublicationResponse.text()).toBeTruthy();

      await page.goto('/recipes/trash');
      const publicationRow = page
        .getByRole('table', { name: 'Trashed publications' })
        .getByRole('row', { name: new RegExp(publicationName) });
      await expect(publicationRow).toBeVisible();
      await publicationRow.hover();
      await publicationRow.getByRole('button', { name: `Purge ${publicationName}` }).click();

      const dialog = page.getByRole('dialog', {
        name: `Permanently delete ${publicationName}?`,
      });
      await expect(dialog.getByRole('radio')).toHaveCount(3);
      await expect(dialog.getByRole('button', { name: 'Permanently delete' })).toBeDisabled();
      await dialog.getByRole('radio', { name: choice.label }).check();
      await dialog.getByRole('button', { name: 'Permanently delete' }).click();
      await expect(page).toHaveURL(/\/recipes\/trash\?status=purged$/);

      const remainingRecipes = runLocalSql<{
        id: string;
        publication_id: string | null;
        publication_trash_id: string | null;
        trashed_at: string | null;
      }>(`
        select id, publication_id, publication_trash_id, trashed_at
        from public.recipes
        where id in ('${cascadeRecipe.id}'::uuid, '${previouslyTrashedRecipe.id}'::uuid)
        order by id;
      `);
      expect(remainingRecipes).toHaveLength(choice.expectedCount);
      if (choice.value === 'all') {
        expect(remainingRecipes).toEqual([]);
      } else {
        expect(
          remainingRecipes.every(
            (recipe) =>
              recipe.publication_id === recipeTinId &&
              recipe.publication_trash_id === null &&
              recipe.trashed_at !== null,
          ),
        ).toBe(true);
      }
    }
  } finally {
    await deleteTestUser(request, owner);
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
    await assignRecipe(recipe.id, publicationId);
    const trashResponse = await trashPublication(
      request,
      config,
      owner,
      publicationId,
      1,
      'delete',
    );
    expect(trashResponse.ok(), await trashResponse.text()).toBeTruthy();

    const [trashedPublication] = runLocalSql<{
      trashed_at: string;
    }>(`
      select trashed_at
      from public.publications
      where id = '${publicationId}'::uuid;
    `);
    if (!trashedPublication) {
      throw new Error('The trashed publication fixture was not found.');
    }

    const fixtureRecords = [
      { table: 'publications', id: publicationId, recordColumn: 'id' },
      { table: 'recipes', id: recipe.id, recordColumn: 'id' },
      { table: 'publication_history', id: publicationId, recordColumn: 'record_id' },
      { table: 'recipe_history', id: recipe.id, recordColumn: 'record_id' },
    ];
    const fixtureRows = fixtureRecords.map((record) => {
      const [row] = runLocalSql<{ count: number }>(`
        select count(*)::integer as count
        from public.${record.table}
        where ${record.recordColumn} = '${record.id}'::uuid;
      `);
      expect(
        row.count,
        `Expected ${record.table} history/fixture rows before purge.`,
      ).toBeGreaterThan(0);
      return { record, count: row.count };
    });

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

    for (const { record, count: expectedCount } of fixtureRows) {
      const [row] = runLocalSql<{ count: number }>(`
        select count(*)::integer as count
        from public.${record.table}
        where ${record.recordColumn} = '${record.id}'::uuid;
      `);
      expect(row.count, `Expected ${record.table} rows to remain after rollback.`).toBe(
        expectedCount,
      );
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
    await page.getByRole('button', { name: 'Edit publication' }).click();
    await page
      .getByRole('dialog', { name: 'Edit publication' })
      .getByRole('button', { name: 'Delete' })
      .click();

    const dialog = page.getByRole('dialog', { name: 'Move publication to Trash?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('no active recipes to move');
    await expect(dialog.locator('.publication-delete-dispositions')).toHaveCount(0);
    await expect(dialog.locator('input[name="recipe_disposition"]')).toHaveValue('delete');
    await expect(dialog.getByRole('button', { name: 'Move' })).toBeEnabled();
    const dialogA11y = await new AxeBuilder({ page }).analyze();
    expect(dialogA11y.violations).toEqual([]);

    await dialog.getByRole('button', { name: 'Move' }).click();
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
    await assignRecipe(recipe.id, publicationId);
    await signIn(page, owner.email, owner.password);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/publications/${publicationId}`);
    await expect(page.getByRole('heading', { name: 'Trash source' })).toBeVisible();
    await expect(page.locator('#publication-recipe-search')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Query refinements' })).toHaveCount(0);
    await expect(page.locator('.publication-recipe-list')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(
      page.locator('.publication-detail-actions').getByRole('button', {
        name: 'Delete',
      }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit publication' }).click();
    const editDialog = page.getByRole('dialog', { name: 'Edit publication' });
    const deletePublicationButton = editDialog.getByRole('button', {
      name: 'Delete',
    });
    await expect(deletePublicationButton).toBeVisible();
    await expect(deletePublicationButton).toHaveCSS('border-radius', '0px');
    await expect(deletePublicationButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await deletePublicationButton.hover();
    await expect(deletePublicationButton).toHaveCSS('background-color', 'rgb(180, 62, 50)');
    await expect(deletePublicationButton).toHaveCSS('color', 'rgb(255, 255, 255)');

    await deletePublicationButton.click();
    const dialog = page.getByRole('dialog', { name: 'Move publication to Trash?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Move' })).toBeDisabled();
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
    await dialog.getByRole('button', { name: 'Move' }).click();

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
    expect(readRecipe(createdRecipeId)).toMatchObject({
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
    const mobileEditButtonBounds = await page
      .getByRole('button', { name: 'Edit publication' })
      .boundingBox();
    const mobileDetailActionsBounds = await page
      .locator('.publication-detail-actions')
      .boundingBox();
    if (!mobileAddRecipeBounds || !mobileEditButtonBounds || !mobileDetailActionsBounds) {
      throw new Error('Mobile publication actions must be measurable.');
    }
    expect(mobileAddRecipeBounds.width).toBeLessThan(160);
    expect(mobileAddRecipeBounds.y).toBeCloseTo(mobileEditButtonBounds.y, 0);
    expect(mobileEditButtonBounds.x).toBeCloseTo(mobileDetailActionsBounds.x, 0);
    expect(mobileAddRecipeBounds.x + mobileAddRecipeBounds.width).toBeCloseTo(
      mobileDetailActionsBounds.x + mobileDetailActionsBounds.width,
      0,
    );
    const mobileControls = page.locator(
      '.publication-detail-mobile-controls .recipe-explorer-toolbar > :not(legend)',
    );
    await expect(mobileControls).toHaveCount(3);
    const mobileControlRows = await mobileControls.evaluateAll((controls) =>
      controls.map((control) => control.getBoundingClientRect().y),
    );
    expect(mobileControlRows.every((row) => Math.abs(row - mobileControlRows[0]) < 1)).toBe(true);
    expect(mobileControlRows[0]).toBeGreaterThanOrEqual(mobileDetailActionsBounds.y);
    expect(mobileControlRows[0]).toBeLessThan(
      mobileDetailActionsBounds.y + mobileDetailActionsBounds.height,
    );
    await expect(
      page.locator('.publication-recipe-explorer > .recipe-explorer-toolbar'),
    ).toBeHidden();

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
    await expect(publicationRecipeTable.locator('tbody tr:last-child td').last()).toHaveCSS(
      'border-bottom-width',
      '1px',
    );
    const addRecipeBounds = await page.getByRole('link', { name: 'Add Recipe' }).boundingBox();
    const detailActionsBounds = await page.locator('.publication-detail-actions').boundingBox();
    if (!addRecipeBounds || !detailActionsBounds) {
      throw new Error('Publication actions must be measurable.');
    }
    expect(addRecipeBounds.width).toBeLessThan(160);
    expect(addRecipeBounds.x + addRecipeBounds.width).toBeCloseTo(
      detailActionsBounds.x + detailActionsBounds.width,
      0,
    );
  } finally {
    await deleteTestUser(request, owner);
  }
});

test('publication recipe list stays scoped and omits global search controls @e2e', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationId = await createPublication(request, config, owner, 'Scoped search source');
    const otherPublicationId = await createPublication(
      request,
      config,
      owner,
      'Out-of-scope search source',
    );
    const scopedRecipe = await createRecipe(request, config, owner, 'ScopeSignal lemon cake');
    const otherRecipe = await createRecipe(request, config, owner, 'ScopeSignal lemon soup');
    const noPhotoRecipe = await createRecipe(request, config, owner, 'ScopeSignal lemon tart');
    await assignRecipe(scopedRecipe.id, publicationId);
    await assignRecipe(otherRecipe.id, otherPublicationId);

    await signIn(page, owner.email, owner.password);
    await page.goto(`/publications/${publicationId}`);
    await expect(page.getByRole('tab', { name: 'Search', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Query', exact: true })).toHaveCount(0);
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'ScopeSignal lemon cake' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'ScopeSignal lemon soup' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Filter Name' }).click();
    await page.getByRole('button', { name: 'Deselect all' }).click();
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page).toHaveURL(/column_name=__none__/);
    await expect(page.getByText('No recipes match these column filters.')).toBeVisible();
    await page.goto(`/publications/${publicationId}`);

    await assignRecipe(noPhotoRecipe.id, publicationId);
    await page.goto(`/recipes/${scopedRecipe.id}/edit`);
    await page.getByRole('button', { name: 'Manage recipe photos' }).click();
    const photoDialog = page.getByRole('dialog', { name: 'Manage recipe photos' });
    const recipePhoto = await sharp({
      create: {
        width: 32,
        height: 24,
        channels: 3,
        background: { r: 126, g: 154, b: 116 },
      },
    })
      .png()
      .toBuffer();
    await photoDialog.getByLabel('Upload from device').setInputFiles({
      name: 'scoped-recipe.png',
      mimeType: 'image/png',
      buffer: recipePhoto,
    });
    await expect(photoDialog.locator('.recipe-photo-grid-item')).toHaveCount(1);
    await photoDialog.getByRole('button', { name: 'Done' }).click();

    await page.goto(`/publications/${publicationId}`);
    await page.getByRole('button', { name: 'Switch to List view' }).click();
    await expect(page).toHaveURL(new RegExp(`/publications/${publicationId}[?][^#]*view=list`));
    await expect(page.locator('.publication-recipe-simple-list li')).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'ScopeSignal lemon cake' })).toHaveCSS(
      'font-weight',
      '400',
    );
    await expect(page.getByRole('link', { name: 'ScopeSignal lemon cake' })).toHaveCSS(
      'color',
      'rgb(36, 40, 32)',
    );
    await expect(page.getByRole('button', { name: 'Filter Name' })).toHaveCount(0);
    await page.goto(`/publications/${publicationId}?sort=name&view=list&column_name=__none__`);
    await expect(page.locator('.publication-recipe-simple-list li')).toHaveCount(2);

    await page.goto(`/publications/${publicationId}?sort=name&view=grid`);
    const scopedPhotoCard = page
      .locator('.find-recipes-grid li')
      .filter({ hasText: 'ScopeSignal lemon cake' });
    const scopedNoPhotoCard = page
      .locator('.find-recipes-grid li')
      .filter({ hasText: 'ScopeSignal lemon tart' });
    await expect(page.locator('.find-recipes-grid li')).toHaveCount(2);
    await expect(scopedPhotoCard).toHaveAttribute('data-stripe-cell', 'odd');
    await expect(scopedNoPhotoCard).toHaveAttribute('data-stripe-cell', 'even');
    await expect(scopedPhotoCard.locator('.find-recipes-card-image')).toBeVisible();
    await expect(scopedPhotoCard.locator('.find-recipes-card-image')).toHaveCSS(
      'object-fit',
      'contain',
    );
    await expect(scopedNoPhotoCard.locator('img')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'ScopeSignal lemon soup' })).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    await captureScreenshot(page, 'publication-scoped-recipe-grid');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.find-recipes-grid li')).toHaveCount(2);
    await captureScreenshot(page, 'publication-scoped-recipe-grid-mobile');
  } finally {
    await deleteTestUser(request, owner);
  }
});
