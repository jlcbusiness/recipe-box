import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { exportTableNames } from '../../src/lib/exports/rules';
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
  };
}

function emptyRecords() {
  return Object.fromEntries(exportTableNames.map((table) => [table, []]));
}

async function commitImport(
  request: import('@playwright/test').APIRequestContext,
  config: LocalSupabaseConfig,
  payload: Record<string, unknown>,
  headers = serviceHeaders(config),
) {
  try {
    return await request.post(`${config.apiUrl}/rest/v1/rpc/commit_database_import`, {
      headers,
      data: payload,
      timeout: 10_000,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('The database import RPC timed out.');
    }
    throw error;
  }
}

async function selectRows(
  request: import('@playwright/test').APIRequestContext,
  config: LocalSupabaseConfig,
  table: string,
  query: string,
  headers = serviceHeaders(config),
) {
  const response = await request.get(`${config.apiUrl}/rest/v1/${table}?${query}`, {
    headers,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test('database import commit is privileged, versioned, history-aware, and atomic @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const publicationId = randomUUID();
  const recipeId = randomUUID();
  const ingredientId = randomUUID();
  const recipeIngredientId = randomUUID();
  const stepId = randomUUID();
  const latePublicationId = randomUUID();
  const trashedPublicationId = randomUUID();
  const trashedRecipeId = randomUUID();
  const createdAt = new Date().toISOString();
  const mediaAssetId = randomUUID();
  const records = {
    ...emptyRecords(),
    media_assets: [
      {
        id: mediaAssetId,
        recipe_id: recipeId,
        publication_id: null,
        asset_type: 'recipe_photo',
        status: 'ready',
        full_path: `images/${mediaAssetId}/full.webp`,
        thumbnail_path: `images/${mediaAssetId}/thumbnail.webp`,
        content_type: 'image/webp',
        description: 'Imported image',
        position: 0,
        is_primary: true,
        byte_size: 32,
        width: 10,
        height: 10,
        created_at: createdAt,
      },
    ],
    publications: [
      {
        id: publicationId,
        publication_type: 'book',
        name: 'Atomic import publication',
        author: null,
        edition: null,
        isbn: null,
        retailer_url: null,
        site_url: null,
        created_at: createdAt,
      },
    ],
    recipes: [
      {
        id: recipeId,
        name: 'Atomic import recipe',
        food_type_id: null,
        state: 'want_to_try',
        verdict_id: null,
        enthusiasm_id: null,
        occasion_details: null,
        reason: null,
        serves: null,
        prep_time_minutes: null,
        mixing_time_minutes: null,
        marinate_time_minutes: null,
        chill_time_minutes: null,
        freeze_time_minutes: null,
        cook_time_minutes: null,
        bake_time_minutes: null,
        cooling_time_minutes: null,
        rest_time_minutes: null,
        total_time_minutes: null,
        notes_markdown: '',
        is_private: true,
        created_at: createdAt,
        publication_id: publicationId,
        publication_page: null,
        recipe_url: null,
      },
    ],
    ingredients: [
      {
        id: ingredientId,
        name: 'Atomic import ingredient',
        sort_order: 0,
        created_at: createdAt,
      },
    ],
    recipe_ingredients: [
      {
        id: recipeIngredientId,
        recipe_id: recipeId,
        ingredient_id: ingredientId,
        position: 0,
        is_main: true,
        detail: '',
        preparation: '',
      },
    ],
    recipe_steps: [
      {
        id: stepId,
        recipe_id: recipeId,
        position: 0,
        content_markdown: `Use [[ingredient:${recipeIngredientId}|Atomic import ingredient]].`,
        plain_text: 'Use Atomic import ingredient.',
      },
    ],
  };
  const mediaPaths = [
    `${owner.id}/assets/${mediaAssetId}/full.webp`,
    `${owner.id}/assets/${mediaAssetId}/thumb.webp`,
  ];
  const basePayload = {
    p_account_id: owner.id,
    p_account_preferences: {},
    p_expected_versions: [],
    p_replace_recipe_ids: [],
    p_replace_publication_ids: [],
  };

  try {
    for (const [index, path] of mediaPaths.entries()) {
      const storageUpload = await request.post(
        `${config.apiUrl}/storage/v1/object/recipe-media/${path}`,
        {
          headers: { ...serviceHeaders(config), 'Content-Type': 'image/webp' },
          data: Buffer.from(index === 0 ? 'full image bytes' : 'thumbnail bytes'),
        },
      );
      expect(storageUpload.ok(), await storageUpload.text()).toBeTruthy();
    }
    const clientAttempt = await commitImport(
      request,
      config,
      { ...basePayload, p_records: records },
      ownerHeaders(config, owner),
    );
    expect(clientAttempt.ok()).toBe(false);

    const created = await commitImport(request, config, {
      ...basePayload,
      p_records: records,
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    await expect(created.json()).resolves.toMatchObject({ recipes: 1, publications: 1 });
    expect(
      await selectRows(
        request,
        config,
        'recipe_step_mentions',
        `select=recipe_ingredient_id&recipe_step_id=eq.${stepId}`,
        ownerHeaders(config, owner),
      ),
    ).toEqual([{ recipe_ingredient_id: recipeIngredientId }]);
    expect(
      await selectRows(
        request,
        config,
        'media_assets',
        `select=id,status,full_path,thumbnail_path&id=eq.${mediaAssetId}`,
        ownerHeaders(config, owner),
      ),
    ).toEqual([
      {
        id: mediaAssetId,
        status: 'ready',
        full_path: mediaPaths[0],
        thumbnail_path: mediaPaths[1],
      },
    ]);

    const rootVersions = [
      { kind: 'publication', incomingId: publicationId, targetId: publicationId, version: 1 },
      { kind: 'recipe', incomingId: recipeId, targetId: recipeId, version: 1 },
    ];
    const replacementRecords = {
      ...records,
      ingredients: [],
      publications: [{ ...records.publications[0], name: 'Replaced import publication' }],
      recipes: [{ ...records.recipes[0], name: 'Replaced import recipe' }],
    };
    const replaced = await commitImport(request, config, {
      ...basePayload,
      p_records: replacementRecords,
      p_expected_versions: rootVersions,
      p_replace_recipe_ids: [recipeId],
      p_replace_publication_ids: [publicationId],
    });
    expect(replaced.ok(), await replaced.text()).toBeTruthy();

    const recipeRows = await selectRows(
      request,
      config,
      'recipes',
      `select=id,name,version,is_private&id=eq.${recipeId}`,
      ownerHeaders(config, owner),
    );
    expect(recipeRows).toEqual([
      { id: recipeId, name: 'Replaced import recipe', version: 2, is_private: true },
    ]);
    const recipeHistory = await selectRows(
      request,
      config,
      'recipe_history',
      `select=event_type&record_id=eq.${recipeId}`,
      ownerHeaders(config, owner),
    );
    expect(recipeHistory.map((event: { event_type: string }) => event.event_type)).toEqual(
      expect.arrayContaining(['recipe.created', 'recipe.updated']),
    );
    const publicationHistory = await selectRows(
      request,
      config,
      'publication_history',
      `select=event_type&record_id=eq.${publicationId}`,
      ownerHeaders(config, owner),
    );
    expect(publicationHistory.map((event: { event_type: string }) => event.event_type)).toEqual(
      expect.arrayContaining(['publication.created', 'publication.updated']),
    );

    expect(
      await selectRows(
        request,
        config,
        'media_deletion_queue',
        `select=object_path&object_path=in.(${mediaPaths.join(',')})`,
      ),
    ).toEqual(mediaPaths.map((object_path) => ({ object_path })));
    const stale = await commitImport(request, config, {
      ...basePayload,
      p_records: emptyRecords(),
      p_expected_versions: rootVersions,
    });
    expect(stale.ok()).toBe(false);

    const lateFailure = await commitImport(request, config, {
      ...basePayload,
      p_account_preferences: { volume_system: 'not-a-system' },
      p_records: {
        ...emptyRecords(),
        publications: [
          {
            id: latePublicationId,
            publication_type: 'book',
            name: 'Must roll back',
            author: null,
            edition: null,
            isbn: null,
            retailer_url: null,
            site_url: null,
            created_at: createdAt,
          },
        ],
      },
    });
    expect(lateFailure.ok()).toBe(false);
    expect(
      await selectRows(
        request,
        config,
        'publications',
        `select=id&id=eq.${latePublicationId}`,
        ownerHeaders(config, owner),
      ),
    ).toEqual([]);

    const trashedImport = await commitImport(request, config, {
      ...basePayload,
      p_records: {
        ...emptyRecords(),
        publications: [
          {
            id: trashedPublicationId,
            publication_type: 'book',
            name: 'Imported trashed publication',
            author: null,
            edition: null,
            isbn: null,
            retailer_url: null,
            site_url: null,
            created_at: createdAt,
            trashed_at: createdAt,
          },
        ],
        recipes: [
          {
            ...records.recipes[0],
            id: trashedRecipeId,
            name: 'Imported trashed recipe',
            publication_id: trashedPublicationId,
            trashed_at: createdAt,
          },
        ],
      },
    });
    expect(trashedImport.ok(), await trashedImport.text()).toBeTruthy();
    const trashedRecipes = await request.post(`${config.apiUrl}/rest/v1/rpc/list_trashed_recipes`, {
      headers: ownerHeaders(config, owner),
      data: {},
    });
    expect(trashedRecipes.ok(), await trashedRecipes.text()).toBeTruthy();
    expect(await trashedRecipes.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: trashedRecipeId })]),
    );
    const trashedPublications = await request.post(
      `${config.apiUrl}/rest/v1/rpc/list_trashed_publications`,
      { headers: ownerHeaders(config, owner), data: {} },
    );
    expect(trashedPublications.ok(), await trashedPublications.text()).toBeTruthy();
    expect(await trashedPublications.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: trashedPublicationId })]),
    );
  } finally {
    try {
      await request.post(`${config.apiUrl}/rest/v1/rpc/restore_publication`, {
        headers: ownerHeaders(config, owner),
        data: { p_publication_id: trashedPublicationId, p_expected_version: 2 },
      });
      await request.post(`${config.apiUrl}/rest/v1/rpc/restore_recipe`, {
        headers: ownerHeaders(config, owner),
        data: { p_recipe_id: trashedRecipeId, p_expected_version: 2 },
      });
      const storageCleanup = await request.delete(
        `${config.apiUrl}/storage/v1/object/recipe-media`,
        { headers: serviceHeaders(config), data: { prefixes: mediaPaths }, timeout: 5000 },
      );
      expect(storageCleanup.ok(), await storageCleanup.text()).toBeTruthy();
    } finally {
      await deleteTestUser(request, owner);
    }
  }
});
