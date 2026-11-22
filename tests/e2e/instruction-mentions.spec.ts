import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { getRecipe } from '../../src/lib/recipes/data';
import {
  createTestUser,
  deleteTestUser,
  getLocalSupabaseConfig,
  type TestUser,
} from '../support/local-supabase';

const firstIngredientId = '11111111-1111-4111-8111-111111111111';
const secondIngredientId = '22222222-2222-4222-8222-222222222222';
const firstStepId = '33333333-3333-4333-8333-333333333333';
const secondStepId = '44444444-4444-4444-8444-444444444444';
const unknownIngredientId = '99999999-9999-4999-8999-999999999999';
const crossRecipeIngredientId = '55555555-5555-4555-8555-555555555555';
const crossRecipeStepId = '66666666-6666-4666-8666-666666666666';
const crossAccountIngredientId = '77777777-7777-4777-8777-777777777777';
const crossAccountStepId = '88888888-8888-4888-8888-888888888888';

function recipePayload(
  name: string,
  ingredientRows: unknown[],
  instructionSteps: unknown[],
  recipeId: string | null = null,
  expectedVersion: number | null = null,
) {
  return {
    p_recipe_id: recipeId,
    p_expected_version: expectedVersion,
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
    p_ingredient_rows: ingredientRows,
    p_instruction_steps: instructionSteps,
  };
}

function ingredientRow(
  id: string,
  name: string,
  amount?: number,
  unitCode = 'tbsp',
  measurementType: 'volume' | 'weight' = 'volume',
) {
  return {
    recipe_ingredient_id: id,
    ingredient_id: null,
    ingredient_name: name,
    is_main: false,
    detail: '',
    preparation: '',
    measurements: amount
      ? [
          {
            measurement_type: measurementType,
            amount_min: amount,
            amount_max: null,
            unit_code: unitCode,
            picklist_value_id: null,
          },
        ]
      : [],
  };
}

function instructionStep(id: string, position: number, content: string, plainText: string) {
  return { id, position, content_markdown: content, plain_text: plainText };
}

function headers(user: TestUser, apiKey: string) {
  return { apikey: apiKey, Authorization: `Bearer ${user.accessToken}` };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('whole and Things ingredient mentions preserve reader amounts @e2e @instructions', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const ingredientId = randomUUID();
  const customaryIngredientId = randomUUID();
  const thingsIngredientId = randomUUID();
  const ingredientSetId = randomUUID();
  const stepId = randomUUID();

  try {
    const picklistsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_picklist_values?select=id&account_id=eq.${owner.id}&category=eq.informal_unit&value=eq.Bunch`,
      { headers: headers(owner, config.anonKey) },
    );
    expect(picklistsResponse.ok(), await picklistsResponse.text()).toBeTruthy();
    const [{ id: bunchId }] = (await picklistsResponse.json()) as { id: string }[];

    const preferenceResponse = await request.patch(
      `${config.apiUrl}/rest/v1/accounts?id=eq.${owner.id}`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
        data: { volume_system: 'us_customary', weight_system: 'metric' },
      },
    );
    expect(preferenceResponse.ok(), await preferenceResponse.text()).toBeTruthy();
    const wholeMarker = `[[ingredient:${ingredientId}|butter-main-whole]]`;
    const thingsMarker = `[[ingredient:${thingsIngredientId}|parsley]]`;
    const createdResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/save_recipe_with_ingredient_sets`,
      {
        headers: headers(owner, config.anonKey),
        data: {
          ...recipePayload(
            'Whole ingredient mention recipe',
            [
              {
                ...ingredientRow(ingredientId, 'Butter', 8, 'g', 'weight'),
                ingredient_set_id: ingredientSetId,
                position: 0,
                portion_one_ratio: 0.25,
              },
              {
                ...ingredientRow(customaryIngredientId, 'Olive oil', 8, 'cup'),
                ingredient_set_id: ingredientSetId,
                position: 1,
                portion_one_ratio: 0.25,
              },
              {
                ...ingredientRow(thingsIngredientId, 'Parsley'),
                ingredient_set_id: ingredientSetId,
                position: 2,
                measurements: [
                  {
                    measurement_type: 'informal',
                    amount_min: 1,
                    amount_max: null,
                    unit_code: null,
                    picklist_value_id: bunchId,
                  },
                ],
              },
            ],
            [
              instructionStep(
                stepId,
                0,
                `Use ${wholeMarker}. Add ${thingsMarker}.`,
                'Use #butter-main-whole. Add #parsley.',
              ),
            ],
          ),
          p_publication_id: null,
          p_publication_page: null,
          p_recipe_url: null,
          p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
          p_tag_ids: [],
          p_ingredient_sets: [{ id: ingredientSetId, label: 'Main', position: 0 }],
        },
      },
    );
    expect(createdResponse.ok(), await createdResponse.text()).toBeTruthy();
    const [{ id: recipeId }] = await createdResponse.json();
    const savedIngredientResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=recipe_id,portion_one_ratio&id=eq.${ingredientId}`,
      { headers: headers(owner, config.anonKey) },
    );
    expect(await savedIngredientResponse.json()).toEqual([
      { recipe_id: recipeId, portion_one_ratio: 0.25 },
    ]);
    const readerClient = createClient(config.apiUrl, config.anonKey, {
      global: { headers: { Authorization: `Bearer ${owner.accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const loadedRecipe = await getRecipe(readerClient, recipeId);
    expect(loadedRecipe?.ingredients[0]?.portion_one_ratio).toBe(0.25);

    await signIn(page, owner.email, owner.password);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await page.goto(`/recipes/${recipeId}`);
    const presentation = page.getByRole('button', { name: /^Ingredient view:/ });
    const isMobile = (page.viewportSize()?.width ?? 1280) <= 760;
    if (isMobile) {
      await expect(page.locator('.recipe-reading-ingredient_first')).toBeVisible();
    } else {
      if ((await presentation.getAttribute('title'))?.startsWith('Ingredient view: Standard;')) {
        await presentation.click();
      }
      await expect(presentation).toHaveAttribute(
        'title',
        'Ingredient view: Ingredient-first; next Standard',
      );
    }
    const row = page.getByRole('row', { name: /butter/iu });
    const customaryRow = page.getByRole('row', { name: /olive oil/iu });
    if (isMobile) {
      await expect(row.locator('.recipe-reader-mobile-divide-note')).toContainText('divide 1 : 3');
      await expect(customaryRow.locator('.recipe-reader-mobile-divide-note')).toContainText(
        'divide 2 : 6',
      );
    } else {
      await expect(row.locator('.recipe-ingredient-column-divide')).toContainText('divided 1 : 3');
      await expect(customaryRow.locator('.recipe-ingredient-column-divide')).toContainText(
        'divided 2 : 6',
      );
    }
    await presentation.click();
    await expect(presentation).toHaveAttribute(
      'title',
      'Ingredient view: Standard; next Ingredient-first',
    );
    const standardList = page.locator('.recipe-ingredient-list');
    const butterListItem = standardList.locator('li').filter({ hasText: /butter/iu });
    const customaryListItem = standardList.locator('li').filter({ hasText: /olive oil/iu });
    await expect(butterListItem).toContainText('divided 1 : 3');
    await expect(customaryListItem).toContainText('divided 2 : 6');
    await page.emulateMedia({ media: 'print' });
    await expect(butterListItem).toContainText('divided 1 : 3');
    await expect(customaryListItem).toContainText('divided 2 : 6');
    await page.emulateMedia({ media: 'screen' });

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    const mentions = page.locator('.recipe-instruction-mention');
    await expect(mentions).toHaveCount(2);
    await mentions.nth(0).hover();
    await expect(page.getByRole('tooltip')).toHaveText('8 g');
    await mentions.nth(1).hover();
    await expect(page.getByRole('tooltip')).toHaveText('1 bunch');
  } finally {
    await deleteTestUser(request, owner);
  }
});

test('instruction mention rows stay ordered, owner-scoped, and atomic across recipe saves @e2e @instructions', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const ownerHeaders = headers(owner, config.anonKey);
  const otherHeaders = headers(other, config.anonKey);
  const firstMarker = `[[ingredient:${firstIngredientId}|ginger]]`;
  const secondMarker = `[[ingredient:${secondIngredientId}|salt]]`;
  let recipeId = '';

  try {
    const createdResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: recipePayload(
        'Mention persistence fixture',
        [ingredientRow(firstIngredientId, 'Ginger', 1), ingredientRow(secondIngredientId, 'Salt')],
        [
          instructionStep(
            firstStepId,
            0,
            `Add ${firstMarker}, then ${firstMarker} and ${secondMarker}.`,
            'Add #ginger, then #ginger and #salt.',
          ),
          instructionStep(secondStepId, 1, 'Stir gently.', 'Stir gently.'),
        ],
      ),
    });
    expect(createdResponse.ok(), await createdResponse.text()).toBeTruthy();
    [{ id: recipeId }] = await createdResponse.json();

    const mentionsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_step_mentions?select=recipe_step_id,recipe_ingredient_id,position&recipe_step_id=eq.${firstStepId}&order=position.asc`,
      { headers: ownerHeaders },
    );
    expect(await mentionsResponse.json()).toEqual([
      { recipe_step_id: firstStepId, recipe_ingredient_id: firstIngredientId, position: 0 },
      { recipe_step_id: firstStepId, recipe_ingredient_id: firstIngredientId, position: 1 },
      { recipe_step_id: firstStepId, recipe_ingredient_id: secondIngredientId, position: 2 },
    ]);

    const creationHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,after_data&record_id=eq.${recipeId}`,
      { headers: ownerHeaders },
    );
    const [creationHistory] = await creationHistoryResponse.json();
    expect(creationHistory.after_data.steps[0].mentions).toEqual([
      { position: 0, recipe_ingredient_id: firstIngredientId, portion_ordinal: null },
      { position: 1, recipe_ingredient_id: firstIngredientId, portion_ordinal: null },
      { position: 2, recipe_ingredient_id: secondIngredientId, portion_ordinal: null },
    ]);

    const directMentionWrite = await request.post(`${config.apiUrl}/rest/v1/recipe_step_mentions`, {
      headers: { ...ownerHeaders, Prefer: 'return=representation' },
      data: {
        account_id: owner.id,
        recipe_id: recipeId,
        recipe_step_id: firstStepId,
        recipe_ingredient_id: firstIngredientId,
        position: 3,
      },
    });
    expect(directMentionWrite.ok()).toBeFalsy();

    const hiddenMentions = await request.get(
      `${config.apiUrl}/rest/v1/recipe_step_mentions?select=recipe_step_id&recipe_step_id=eq.${firstStepId}`,
      { headers: otherHeaders },
    );
    expect(await hiddenMentions.json()).toEqual([]);

    const crossRecipeTarget = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: recipePayload(
        'Cross-recipe mention target',
        [ingredientRow(crossRecipeIngredientId, 'Pepper')],
        [instructionStep(crossRecipeStepId, 0, `Use ${firstMarker}.`, 'Use #ginger.')],
      ),
    });
    expect(crossRecipeTarget.ok()).toBeFalsy();

    const crossAccountTarget = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: otherHeaders,
      data: recipePayload(
        'Cross-account mention target',
        [ingredientRow(crossAccountIngredientId, 'Pepper')],
        [instructionStep(crossAccountStepId, 0, `Use ${firstMarker}.`, 'Use #ginger.')],
      ),
    });
    expect(crossAccountTarget.ok()).toBeFalsy();

    const reorderedResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: recipePayload(
        'Mention persistence reordered',
        [ingredientRow(secondIngredientId, 'Salt'), ingredientRow(firstIngredientId, 'Ginger', 1)],
        [
          instructionStep(firstStepId, 0, `Add ${secondMarker}.`, 'Add #salt.'),
          instructionStep(secondStepId, 1, 'Stir gently.', 'Stir gently.'),
        ],
        recipeId,
        1,
      ),
    });
    expect(reorderedResponse.ok(), await reorderedResponse.text()).toBeTruthy();

    const savedRowsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=id,position&recipe_id=eq.${recipeId}&order=position.asc`,
      { headers: ownerHeaders },
    );
    expect(await savedRowsResponse.json()).toEqual([
      { id: secondIngredientId, position: 0 },
      { id: firstIngredientId, position: 1 },
    ]);

    const savedMeasurements = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=recipe_ingredient_id,measurement_type,amount_min&recipe_ingredient_id=eq.${firstIngredientId}`,
      { headers: ownerHeaders },
    );
    expect(await savedMeasurements.json()).toEqual([
      { recipe_ingredient_id: firstIngredientId, measurement_type: 'volume', amount_min: 1 },
    ]);

    const updateHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${recipeId}&order=created_at.asc`,
      { headers: ownerHeaders },
    );
    const updateHistory = await updateHistoryResponse.json();
    expect(updateHistory).toHaveLength(2);
    expect(updateHistory[1].after_data.steps[0].mentions).toEqual([
      { position: 0, recipe_ingredient_id: secondIngredientId, portion_ordinal: null },
    ]);
    expect(updateHistory[1].before_data.steps[0].mentions).toEqual([
      { position: 0, recipe_ingredient_id: firstIngredientId, portion_ordinal: null },
      { position: 1, recipe_ingredient_id: firstIngredientId, portion_ordinal: null },
      { position: 2, recipe_ingredient_id: secondIngredientId, portion_ordinal: null },
    ]);

    const referencedRowDeletion = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: recipePayload(
        'Referenced ingredient removal must roll back',
        [ingredientRow(firstIngredientId, 'Ginger', 1)],
        [instructionStep(firstStepId, 0, `Use ${secondMarker}.`, 'Use #salt.')],
        recipeId,
        2,
      ),
    });
    expect(referencedRowDeletion.ok()).toBeFalsy();

    const invalidReference = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: recipePayload(
        'Must roll back unknown mention',
        [ingredientRow(firstIngredientId, 'Ginger', 1), ingredientRow(secondIngredientId, 'Salt')],
        [
          instructionStep(
            firstStepId,
            0,
            `Use [[ingredient:${unknownIngredientId}|unknown]].`,
            'Use #unknown.',
          ),
        ],
        recipeId,
        2,
      ),
    });
    expect(invalidReference.ok()).toBeFalsy();

    const malformedMarker = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: recipePayload(
        'Must roll back malformed mention',
        [ingredientRow(firstIngredientId, 'Ginger', 1), ingredientRow(secondIngredientId, 'Salt')],
        [instructionStep(firstStepId, 0, 'Use [[ingredient:not-a-uuid|ginger]].', 'Use #ginger.')],
        recipeId,
        2,
      ),
    });
    expect(malformedMarker.ok()).toBeFalsy();

    const staleVersion = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders,
      data: recipePayload(
        'Stale update must roll back',
        [
          ingredientRow(firstIngredientId, 'Ginger renamed', 1),
          ingredientRow(secondIngredientId, 'Salt'),
        ],
        [instructionStep(firstStepId, 0, `Use ${firstMarker}.`, 'Use #ginger.')],
        recipeId,
        1,
      ),
    });
    expect((await staleVersion.json()).code).toBe('PT409');

    const recipeResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=name,version&id=eq.${recipeId}`,
      { headers: ownerHeaders },
    );
    expect(await recipeResponse.json()).toEqual([
      { name: 'Mention persistence reordered', version: 2 },
    ]);
    const finalMentionsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_step_mentions?select=recipe_step_id,recipe_ingredient_id,position&recipe_step_id=eq.${firstStepId}&order=position.asc`,
      { headers: ownerHeaders },
    );
    expect(await finalMentionsResponse.json()).toEqual([
      { recipe_step_id: firstStepId, recipe_ingredient_id: secondIngredientId, position: 0 },
    ]);
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});
