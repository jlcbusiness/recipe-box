import { expect, test } from '@playwright/test';
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

function ingredientRow(id: string, name: string, amount?: number) {
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
            measurement_type: 'volume',
            amount_min: amount,
            amount_max: null,
            unit_code: 'tbsp',
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
      { position: 0, recipe_ingredient_id: firstIngredientId },
      { position: 1, recipe_ingredient_id: firstIngredientId },
      { position: 2, recipe_ingredient_id: secondIngredientId },
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
      { position: 0, recipe_ingredient_id: secondIngredientId },
    ]);
    expect(updateHistory[1].before_data.steps[0].mentions).toEqual([
      { position: 0, recipe_ingredient_id: firstIngredientId },
      { position: 1, recipe_ingredient_id: firstIngredientId },
      { position: 2, recipe_ingredient_id: secondIngredientId },
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
    expect((await staleVersion.json()).code).toBe('40001');

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
