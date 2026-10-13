import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, test } from '@playwright/test';
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

async function searchRecipe(
  request: APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  query: string,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
    headers: ownerHeaders(config, user),
    data: { p_query: query, p_limit: 50, p_offset: 0 },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { recipe_id: string; recipe_name: string }[];
}

async function getCatalogRevision(
  request: APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  catalog: 'ingredient' | 'tag',
) {
  const table = catalog === 'ingredient' ? 'ingredient_catalog_revisions' : 'tag_catalog_revisions';
  const response = await request.get(`${config.apiUrl}/rest/v1/${table}?select=revision`, {
    headers: ownerHeaders(config, user),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const [row] = (await response.json()) as { revision: number }[];
  expect(row).toBeDefined();
  return row.revision;
}

async function getRecipeVersion(
  request: APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  recipeId: string,
) {
  const response = await request.get(
    `${config.apiUrl}/rest/v1/recipes?select=version&id=eq.${recipeId}`,
    { headers: ownerHeaders(config, user) },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = (await response.json()) as { version: number }[];
  expect(recipe).toBeDefined();
  return recipe.version;
}

test('recipe search documents refresh after searchable source changes @e2e', async ({
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const ingredientRowId = randomUUID();
  const instructionStepId = randomUUID();
  let recipeId: string | undefined;

  async function saveRecipe({
    recipeName,
    notes,
    ingredientName,
    instructionText,
    expectedVersion,
    publicationId,
    tagIds,
  }: {
    recipeName: string;
    notes: string;
    ingredientName: string;
    instructionText: string;
    expectedVersion: number | null;
    publicationId: string;
    tagIds: string[];
  }) {
    const response = await request.post(
      `${config.apiUrl}/rest/v1/rpc/save_recipe_with_relationships`,
      {
        headers: ownerHeaders(config, user),
        data: {
          p_recipe_id: recipeId ?? null,
          p_expected_version: expectedVersion,
          p_name: recipeName,
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
          p_notes_markdown: notes,
          p_meal_type_ids: [],
          p_cuisine_ids: [],
          p_equipment_ids: [],
          p_ingredient_rows: [
            {
              recipe_ingredient_id: ingredientRowId,
              ingredient_id: null,
              ingredient_name: ingredientName,
              is_main: true,
              detail: '',
              preparation: '',
              measurements: [],
            },
          ],
          p_instruction_steps: [
            {
              id: instructionStepId,
              position: 0,
              content_markdown: instructionText,
              plain_text: instructionText,
            },
          ],
          p_publication_id: publicationId,
          p_publication_page: null,
          p_recipe_url: null,
          p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
          p_tag_ids: tagIds,
        },
      },
    );
    expect(response.ok(), await response.text()).toBeTruthy();
    const [saved] = (await response.json()) as { id: string; version: number }[];
    recipeId = saved.id;
    return saved;
  }

  try {
    const publicationResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers: ownerHeaders(config, user),
        data: {
          p_name: 'Zqpublicationold',
          p_publication_type: 'book',
          p_author: 'Zqauthorold',
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: null,
          p_tag_ids: [],
        },
      },
    );
    expect(publicationResponse.ok(), await publicationResponse.text()).toBeTruthy();
    const publicationId = (await publicationResponse.json()) as string;

    const tagRevision = await getCatalogRevision(request, config, user, 'tag');
    const tagResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/manage_tag_catalog`, {
      headers: ownerHeaders(config, user),
      data: {
        p_action: 'add',
        p_expected_revision: tagRevision,
        p_tag_id: null,
        p_name: 'Zqtagold',
        p_replacement_id: null,
      },
    });
    expect(tagResponse.ok(), await tagResponse.text()).toBeTruthy();
    const tagCatalogResponse = await request.get(`${config.apiUrl}/rest/v1/tags?select=id,name`, {
      headers: ownerHeaders(config, user),
    });
    expect(tagCatalogResponse.ok(), await tagCatalogResponse.text()).toBeTruthy();
    const tags = (await tagCatalogResponse.json()) as { id: string; name: string }[];
    const tagId = tags.find(({ name }) => name === 'Zqtagold')?.id;
    expect(tagId).toBeTruthy();

    const savedRecipe = await saveRecipe({
      recipeName: 'Zqrecipeold',
      notes: 'Zqnotesold',
      ingredientName: 'Zqingredientold',
      instructionText: 'Zqinstructionold',
      expectedVersion: null,
      publicationId,
      tagIds: [tagId as string],
    });

    for (const marker of [
      'Zqrecipeold',
      'Zqnotesold',
      'Zqingredientold',
      'Zqinstructionold',
      'Zqpublicationold',
      'Zqauthorold',
      'Zqtagold',
    ]) {
      await expect(searchRecipe(request, config, user, marker)).resolves.toHaveLength(1);
    }

    await saveRecipe({
      recipeName: 'Zqrecipenew',
      notes: 'Zqnotesnew',
      ingredientName: 'Zqingredientold',
      instructionText: 'Zqinstructionold',
      expectedVersion: savedRecipe.version,
      publicationId,
      tagIds: [tagId as string],
    });
    await expect(searchRecipe(request, config, user, 'Zqrecipeold')).resolves.toHaveLength(0);
    await expect(searchRecipe(request, config, user, 'Zqrecipenew')).resolves.toHaveLength(1);
    await expect(searchRecipe(request, config, user, 'Zqnotesold')).resolves.toHaveLength(0);
    await expect(searchRecipe(request, config, user, 'Zqnotesnew')).resolves.toHaveLength(1);

    const ingredientResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=ingredient_id&recipe_id=eq.${recipeId}`,
      { headers: ownerHeaders(config, user) },
    );
    expect(ingredientResponse.ok(), await ingredientResponse.text()).toBeTruthy();
    const [{ ingredient_id: ingredientId }] = (await ingredientResponse.json()) as {
      ingredient_id: string;
    }[];
    const ingredientRevision = await getCatalogRevision(request, config, user, 'ingredient');
    const renameIngredient = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers: ownerHeaders(config, user),
        data: {
          p_action: 'rename',
          p_expected_revision: ingredientRevision,
          p_ingredient_id: ingredientId,
          p_name: 'Zqingredientnew',
          p_ordered_ids: null,
          p_replacement_id: null,
        },
      },
    );
    expect(renameIngredient.ok(), await renameIngredient.text()).toBeTruthy();
    await expect(searchRecipe(request, config, user, 'Zqingredientold')).resolves.toHaveLength(0);
    await expect(searchRecipe(request, config, user, 'Zqingredientnew')).resolves.toHaveLength(1);

    await saveRecipe({
      recipeName: 'Zqrecipenew',
      notes: 'Zqnotesnew',
      ingredientName: 'Zqingredientnew',
      instructionText: 'Zqinstructionnew',
      expectedVersion: await getRecipeVersion(request, config, user, recipeId as string),
      publicationId,
      tagIds: [tagId as string],
    });
    await expect(searchRecipe(request, config, user, 'Zqinstructionold')).resolves.toHaveLength(0);
    await expect(searchRecipe(request, config, user, 'Zqinstructionnew')).resolves.toHaveLength(1);

    const renamePublication = await request.post(
      `${config.apiUrl}/rest/v1/rpc/update_publication`,
      {
        headers: ownerHeaders(config, user),
        data: {
          p_publication_id: publicationId,
          p_expected_version: 1,
          p_name: 'Zqpublicationnew',
          p_author: 'Zqauthornew',
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_site_url: null,
          p_tag_ids: [],
        },
      },
    );
    expect(renamePublication.ok(), await renamePublication.text()).toBeTruthy();
    await expect(searchRecipe(request, config, user, 'Zqpublicationold')).resolves.toHaveLength(0);
    await expect(searchRecipe(request, config, user, 'Zqpublicationnew')).resolves.toHaveLength(1);
    await expect(searchRecipe(request, config, user, 'Zqauthorold')).resolves.toHaveLength(0);
    await expect(searchRecipe(request, config, user, 'Zqauthornew')).resolves.toHaveLength(1);

    const currentTagRevision = await getCatalogRevision(request, config, user, 'tag');
    const renameTag = await request.post(`${config.apiUrl}/rest/v1/rpc/manage_tag_catalog`, {
      headers: ownerHeaders(config, user),
      data: {
        p_action: 'rename',
        p_expected_revision: currentTagRevision,
        p_tag_id: tagId,
        p_name: 'Zqtagnew',
        p_replacement_id: null,
      },
    });
    expect(renameTag.ok(), await renameTag.text()).toBeTruthy();
    await expect(searchRecipe(request, config, user, 'Zqtagold')).resolves.toHaveLength(0);
    await expect(searchRecipe(request, config, user, 'Zqtagnew')).resolves.toHaveLength(1);

    const trashRecipe = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, user),
      data: {
        p_recipe_id: recipeId,
        p_expected_version: await getRecipeVersion(request, config, user, recipeId as string),
      },
    });
    expect(trashRecipe.ok(), await trashRecipe.text()).toBeTruthy();
    await expect(searchRecipe(request, config, user, 'Zqrecipenew')).resolves.toHaveLength(0);
  } finally {
    await deleteTestUser(request, user);
  }
});
