import { execFileSync } from 'node:child_process';
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

function serviceHeaders(config: LocalSupabaseConfig) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Prefer: 'return=representation',
  };
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
  const [recipe] = await response.json();
  return recipe as { id: string; version: number };
}

async function insertServiceRow(
  request: APIRequestContext,
  config: LocalSupabaseConfig,
  table: string,
  row: Record<string, unknown>,
) {
  const response = await request.post(`${config.apiUrl}/rest/v1/${table}`, {
    headers: serviceHeaders(config),
    data: row,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function expectErrorCode(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
  code: string,
) {
  expect(response.ok()).toBe(false);
  const body = (await response.json()) as { code?: string };
  expect(body.code).toBe(code);
}

function runLocalSql<T>(sql: string): T[] {
  const output = execFileSync(
    'supabase',
    ['db', 'query', '--local', '--output-format', 'json', sql],
    { encoding: 'utf8' },
  );
  const result = JSON.parse(output.slice(output.indexOf('{'))) as { rows: T[] };
  return result.rows;
}

test('lifecycle RPCs enforce ownership, versions, state, and history @e2e', async ({ request }) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  let recipeId: string | null = null;

  try {
    const recipe = await createRecipe(request, config, owner, 'Lifecycle API fixture');
    recipeId = recipe.id;
    const ingredientInsert = await insertServiceRow(request, config, 'ingredients', {
      account_id: owner.id,
      name: 'Lifecycle flour',
    });
    const [{ id: ingredientId }] = ingredientInsert;
    const recipeIngredientInsert = await insertServiceRow(request, config, 'recipe_ingredients', {
      account_id: owner.id,
      recipe_id: recipe.id,
      ingredient_id: ingredientId,
      position: 0,
      is_main: true,
      detail: 'bread flour',
      preparation: 'sifted',
    });
    const [{ id: recipeIngredientId }] = recipeIngredientInsert;
    const measurementInsert = await insertServiceRow(
      request,
      config,
      'recipe_ingredient_measurements',
      {
        account_id: owner.id,
        recipe_ingredient_id: recipeIngredientId,
        position: 0,
        measurement_type: 'volume',
        amount_min: 2,
        unit_code: 'cup',
      },
    );
    const [{ id: measurementId }] = measurementInsert;
    const stepId = randomUUID();
    await insertServiceRow(request, config, 'recipe_steps', {
      id: stepId,
      account_id: owner.id,
      recipe_id: recipe.id,
      position: 0,
      content_markdown: `Mix [[ingredient:${recipeIngredientId}|Lifecycle flour]].`,
      plain_text: 'Mix Lifecycle flour.',
    });
    const mentionRowsBefore = await request.get(
      `${config.apiUrl}/rest/v1/recipe_step_mentions?select=id,recipe_step_id,recipe_ingredient_id,position&recipe_id=eq.${recipe.id}`,
      { headers: ownerHeaders(config, owner) },
    );
    const mentionsBefore = await mentionRowsBefore.json();
    expect(mentionsBefore).toHaveLength(1);

    const foreignTrash = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, other),
      data: { p_recipe_id: recipe.id, p_expected_version: 1 },
    });
    await expectErrorCode(foreignTrash, 'P0002');

    const staleTrash = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: recipe.id, p_expected_version: 0 },
    });
    await expectErrorCode(staleTrash, '40001');

    const trashed = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: recipe.id, p_expected_version: 1 },
    });
    expect(trashed.ok(), await trashed.text()).toBeTruthy();

    const hiddenRecipe = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id&id=eq.${recipe.id}`,
      { headers: ownerHeaders(config, owner) },
    );
    expect(await hiddenRecipe.json()).toEqual([]);
    const trashList = await request.post(`${config.apiUrl}/rest/v1/rpc/list_trashed_recipes`, {
      headers: ownerHeaders(config, owner),
      data: {},
    });
    expect(trashList.ok(), await trashList.text()).toBeTruthy();
    expect(await trashList.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: recipe.id, name: 'Lifecycle API fixture' }),
      ]),
    );
    const hiddenIngredients = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=id&recipe_id=eq.${recipe.id}`,
      { headers: ownerHeaders(config, owner) },
    );
    expect(await hiddenIngredients.json()).toEqual([]);

    const trashEventsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${recipe.id}&order=created_at.asc`,
      { headers: serviceHeaders(config) },
    );
    const trashEvents = await trashEventsResponse.json();
    expect(trashEvents.map((event: { event_type: string }) => event.event_type)).toEqual([
      'recipe.created',
      'recipe.trashed',
    ]);
    expect(trashEvents[1].before_data.trashed_at).toBeNull();
    expect(trashEvents[1].after_data.trashed_at).not.toBeNull();

    const staleSave = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: ownerHeaders(config, owner),
      data: {
        p_recipe_id: recipe.id,
        p_expected_version: 2,
        p_name: 'Must remain trashed',
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
    await expectErrorCode(staleSave, 'P0002');

    const duplicateTrash = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: recipe.id, p_expected_version: 2 },
    });
    await expectErrorCode(duplicateTrash, '55000');

    const staleRestore = await request.post(`${config.apiUrl}/rest/v1/rpc/restore_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: recipe.id, p_expected_version: 1 },
    });
    await expectErrorCode(staleRestore, '40001');

    const restored = await request.post(`${config.apiUrl}/rest/v1/rpc/restore_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: recipe.id, p_expected_version: 2 },
    });
    expect(restored.ok(), await restored.text()).toBeTruthy();

    const recipeRows = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,version,trashed_at&id=eq.${recipe.id}`,
      { headers: ownerHeaders(config, owner) },
    );
    expect(await recipeRows.json()).toEqual([{ id: recipe.id, version: 3, trashed_at: null }]);

    const recipeIngredientRows = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredients?select=id,position,ingredient_id&recipe_id=eq.${recipe.id}&order=position.asc`,
      { headers: ownerHeaders(config, owner) },
    );
    expect(await recipeIngredientRows.json()).toEqual([
      { id: recipeIngredientId, position: 0, ingredient_id: ingredientId },
    ]);
    const measurementRows = await request.get(
      `${config.apiUrl}/rest/v1/recipe_ingredient_measurements?select=id,recipe_ingredient_id,position&recipe_ingredient_id=eq.${recipeIngredientId}&order=position.asc`,
      { headers: ownerHeaders(config, owner) },
    );
    expect(await measurementRows.json()).toEqual([
      { id: measurementId, recipe_ingredient_id: recipeIngredientId, position: 0 },
    ]);
    const stepRows = await request.get(
      `${config.apiUrl}/rest/v1/recipe_steps?select=id,position&recipe_id=eq.${recipe.id}&order=position.asc`,
      { headers: ownerHeaders(config, owner) },
    );
    expect(await stepRows.json()).toEqual([{ id: stepId, position: 0 }]);
    const mentionRowsAfter = await request.get(
      `${config.apiUrl}/rest/v1/recipe_step_mentions?select=id,recipe_step_id,recipe_ingredient_id,position&recipe_id=eq.${recipe.id}&order=position.asc`,
      { headers: ownerHeaders(config, owner) },
    );
    expect(await mentionRowsAfter.json()).toEqual(mentionsBefore);

    const allEventsResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type&record_id=eq.${recipe.id}&order=created_at.asc`,
      { headers: ownerHeaders(config, owner) },
    );
    const allEvents = await allEventsResponse.json();
    expect(allEvents.map((event: { event_type: string }) => event.event_type)).toEqual([
      'recipe.created',
      'recipe.trashed',
      'recipe.restored',
    ]);
  } finally {
    if (recipeId) {
      await request.delete(`${config.apiUrl}/rest/v1/recipe_history?record_id=eq.${recipeId}`, {
        headers: serviceHeaders(config),
      });
      await request.delete(`${config.apiUrl}/rest/v1/recipes?id=eq.${recipeId}`, {
        headers: serviceHeaders(config),
      });
    }
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});

test('deleting an owner with a trashed recipe clears its lifecycle actor @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  let recipeId: string | null = null;
  let ownerDeleted = false;

  try {
    const recipe = await createRecipe(request, config, owner, 'Auth deletion fixture');
    recipeId = recipe.id;
    const trash = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, owner),
      data: { p_recipe_id: recipe.id, p_expected_version: 1 },
    });
    expect(trash.ok(), await trash.text()).toBeTruthy();

    const deletion = await request.delete(`${config.apiUrl}/auth/v1/admin/users/${owner.id}`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    });
    expect(deletion.ok(), await deletion.text()).toBeTruthy();
    ownerDeleted = true;
  } finally {
    if (!ownerDeleted && recipeId) {
      await request.delete(`${config.apiUrl}/rest/v1/recipe_history?record_id=eq.${recipeId}`, {
        headers: serviceHeaders(config),
      });
      await request.delete(`${config.apiUrl}/rest/v1/recipes?id=eq.${recipeId}`, {
        headers: serviceHeaders(config),
      });
      await deleteTestUser(request, owner);
    }
  }
});

test('purge removes recipes at and before its cutoff and installs one daily Cron job @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const otherOwner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const cutoff = '2000-02-03T04:05:06.000Z';
  const older = await createRecipe(request, config, owner, 'Older trashed recipe');
  const exact = await createRecipe(request, config, owner, 'Boundary trashed recipe');
  const newer = await createRecipe(request, config, owner, 'Newer trashed recipe');
  const active = await createRecipe(request, config, owner, 'Active recipe');
  const otherActive = await createRecipe(request, config, otherOwner, 'Other active recipe');
  const restoredOther = await createRecipe(request, config, otherOwner, 'Other restored recipe');

  try {
    const otherTrash = await request.post(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers: ownerHeaders(config, otherOwner),
      data: { p_recipe_id: restoredOther.id, p_expected_version: 1 },
    });
    expect(otherTrash.ok(), await otherTrash.text()).toBeTruthy();
    const otherRestore = await request.post(`${config.apiUrl}/rest/v1/rpc/restore_recipe`, {
      headers: ownerHeaders(config, otherOwner),
      data: { p_recipe_id: restoredOther.id, p_expected_version: 2 },
    });
    expect(otherRestore.ok(), await otherRestore.text()).toBeTruthy();

    const ingredientInsert = await insertServiceRow(request, config, 'ingredients', {
      account_id: owner.id,
      name: 'Purge fixture flour',
    });
    const [{ id: ingredientId }] = ingredientInsert;
    const recipeIngredientInsert = await insertServiceRow(request, config, 'recipe_ingredients', {
      account_id: owner.id,
      recipe_id: exact.id,
      ingredient_id: ingredientId,
      position: 0,
      is_main: true,
      detail: '',
      preparation: '',
    });
    const [{ id: recipeIngredientId }] = recipeIngredientInsert;
    const measurementInsert = await insertServiceRow(
      request,
      config,
      'recipe_ingredient_measurements',
      {
        account_id: owner.id,
        recipe_ingredient_id: recipeIngredientId,
        position: 0,
        measurement_type: 'volume',
        amount_min: 1,
        unit_code: 'cup',
      },
    );
    expect(measurementInsert).toHaveLength(1);
    const purgeStepId = randomUUID();
    await insertServiceRow(request, config, 'recipe_steps', {
      id: purgeStepId,
      account_id: owner.id,
      recipe_id: exact.id,
      position: 0,
      content_markdown: `Use [[ingredient:${recipeIngredientId}|Purge fixture flour]].`,
      plain_text: 'Use Purge fixture flour.',
    });

    const timestampFixtures = runLocalSql<{ id: string }>(`
      with lifecycle_context as materialized (
        select set_config('app.recipe_lifecycle_context', 'on', true)
      ), fixtures(id, trashed_at, trashed_by_user_id) as (
        values
          ('${older.id}'::uuid, '2000-02-03T04:05:05.999Z'::timestamptz, '${owner.id}'::uuid),
          ('${exact.id}'::uuid, '${cutoff}'::timestamptz, '${owner.id}'::uuid),
          ('${newer.id}'::uuid, '2000-02-03T04:05:06.001Z'::timestamptz, '${owner.id}'::uuid)
      )
      update public.recipes as recipe
      set trashed_at = fixtures.trashed_at,
          trashed_by_user_id = fixtures.trashed_by_user_id
      from fixtures, lifecycle_context
      where recipe.id = fixtures.id
      returning recipe.id
    `);
    expect(timestampFixtures).toHaveLength(3);

    const purgeResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/purge_expired_recipes`, {
      headers: serviceHeaders(config),
      data: { p_cutoff: cutoff },
    });
    expect(purgeResponse.ok(), await purgeResponse.text()).toBeTruthy();

    const ownerHeadersForApi = ownerHeaders(config, owner);
    for (const recipe of [older, exact]) {
      const rows = await request.get(
        `${config.apiUrl}/rest/v1/recipes?select=id&id=eq.${recipe.id}`,
        { headers: ownerHeadersForApi },
      );
      expect(await rows.json()).toEqual([]);
      const history = await request.get(
        `${config.apiUrl}/rest/v1/recipe_history?select=id&record_id=eq.${recipe.id}`,
        { headers: ownerHeadersForApi },
      );
      expect(await history.json()).toEqual([]);
    }
    for (const [table, filter] of [
      ['recipe_ingredients', `recipe_id=eq.${exact.id}`],
      ['recipe_steps', `recipe_id=eq.${exact.id}`],
      ['recipe_step_mentions', `recipe_id=eq.${exact.id}`],
      ['recipe_ingredient_measurements', `recipe_ingredient_id=eq.${recipeIngredientId}`],
    ]) {
      const childRows = await request.get(`${config.apiUrl}/rest/v1/${table}?select=id&${filter}`, {
        headers: serviceHeaders(config),
      });
      expect(await childRows.json()).toEqual([]);
    }

    const activeRows = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,trashed_at&id=in.(${newer.id},${active.id})`,
      { headers: ownerHeadersForApi },
    );
    expect(await activeRows.json()).toEqual([{ id: active.id, trashed_at: null }]);
    const retainedTrashedRows = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,trashed_at&id=eq.${newer.id}`,
      { headers: serviceHeaders(config) },
    );
    const [retainedTrashed] = await retainedTrashedRows.json();
    expect(retainedTrashed.id).toBe(newer.id);
    expect(Date.parse(retainedTrashed.trashed_at)).toBe(Date.parse('2000-02-03T04:05:06.001Z'));
    const otherOwnerRows = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id,trashed_at&id=in.(${otherActive.id},${restoredOther.id})`,
      { headers: ownerHeaders(config, otherOwner) },
    );
    expect((await otherOwnerRows.json()).map((recipe: { id: string }) => recipe.id).sort()).toEqual(
      [otherActive.id, restoredOther.id].sort(),
    );

    const cronJobs = runLocalSql<{ jobname: string; schedule: string; command: string }>(
      "select jobname, schedule, command from cron.job where jobname = 'recipe-trash-purge-daily'",
    );
    expect(cronJobs).toHaveLength(1);
    expect(cronJobs[0].schedule).toBe('0 3 * * *');
    expect(cronJobs[0].command).toContain('public.purge_expired_recipes');
  } finally {
    const fixtureIds = [older.id, exact.id, newer.id, active.id, otherActive.id, restoredOther.id];
    const fixtureFilter = `in.(${fixtureIds.join(',')})`;
    await request.delete(`${config.apiUrl}/rest/v1/recipe_history?record_id=${fixtureFilter}`, {
      headers: serviceHeaders(config),
    });
    await request.delete(`${config.apiUrl}/rest/v1/recipes?id=${fixtureFilter}`, {
      headers: serviceHeaders(config),
    });
    await deleteTestUser(request, otherOwner);
    await deleteTestUser(request, owner);
  }
});
