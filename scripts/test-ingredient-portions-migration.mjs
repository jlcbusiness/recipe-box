import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const migrationName = '20261115000000_add_ingredient_portions_and_size.sql';
const repositoryRoot = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), 'recipe-box-portions-migration-'));
const projectDirectory = join(temporaryRoot, 'project');
const supabaseDirectory = join(projectDirectory, 'supabase');
const projectId = `recipe-box-portions-${randomUUID().slice(0, 8)}`;
const supabaseCommand = resolve(
  repositoryRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'supabase.cmd' : 'supabase',
);
let supabaseStartAttempted = false;

function runSupabase(args, captureOutput = false) {
  const result = spawnSync(supabaseCommand, [...args, '--workdir', projectDirectory], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
  if (result.error || result.status !== 0) {
    const failure = result.error?.message ?? `exit code ${result.status}`;
    throw new Error(`supabase ${args[0]} failed (${failure})${output ? `: ${output}` : '.'}`);
  }
  if (!captureOutput && !['start', 'stop'].includes(args[0])) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  }
  return captureOutput ? result.stdout : '';
}

function canBind(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once('error', () => resolvePort(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolvePort(true)));
  });
}

async function findPortOffset(ports) {
  const firstOffset = 1000 + (process.pid % 2000);
  for (let offset = firstOffset; offset <= 6000; offset += 100) {
    if (Math.max(...ports) + offset > 65535) break;
    if ((await Promise.all(ports.map((port) => canBind(port + offset)))).every(Boolean)) {
      return offset;
    }
  }
  throw new Error('Could not find an isolated Supabase port range.');
}

async function configureProject() {
  const sourceConfig = resolve(repositoryRoot, 'supabase/config.toml');
  const sourceMigrations = resolve(repositoryRoot, 'supabase/migrations');
  const migrations = (await readdir(sourceMigrations))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const targetIndex = migrations.indexOf(migrationName);
  if (targetIndex < 1) throw new Error(`Could not find ${migrationName}.`);

  let config = await readFile(sourceConfig, 'utf8');
  const ports = [...config.matchAll(/^\s*(?:port|shadow_port)\s*=\s*(\d+)\s*$/gm)].map((match) =>
    Number(match[1]),
  );
  const offset = await findPortOffset(ports);
  config = config
    .replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${projectId}"`)
    .replace(
      /^(\s*port\s*=\s*)(\d+)(\s*)$/gm,
      (_line, prefix, port, suffix) => `${prefix}${Number(port) + offset}${suffix}`,
    )
    .replace(/(\[db\.seed\]\s*enabled\s*=\s*)true/, '$1false');

  await mkdir(join(supabaseDirectory, 'migrations'), { recursive: true });
  for (const migration of migrations.slice(0, targetIndex)) {
    await cp(join(sourceMigrations, migration), join(supabaseDirectory, 'migrations', migration));
  }
  await cp(resolve(repositoryRoot, 'supabase/templates'), join(supabaseDirectory, 'templates'), {
    recursive: true,
  });
  await cp(resolve(repositoryRoot, 'supabase/seed.sql'), join(supabaseDirectory, 'seed.sql'));
  await writeFile(join(supabaseDirectory, 'config.toml'), config);
  return { migrations, targetIndex, sourceMigrations };
}

function getSupabaseConfig() {
  const output = runSupabase(['status', '--output', 'env'], true);
  const values = new Map(
    output.split(/\r?\n/).flatMap((line) => {
      const separator = line.indexOf('=');
      return separator < 0
        ? []
        : [[line.slice(0, separator), line.slice(separator + 1).replace(/^"|"$/g, '')]];
    }),
  );
  const apiUrl = values.get('API_URL');
  const anonKey = values.get('ANON_KEY');
  const serviceRoleKey = values.get('SERVICE_ROLE_KEY');
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Could not read isolated Supabase credentials.');
  }
  return { apiUrl, anonKey, serviceRoleKey };
}

async function apiCall(url, { headers = {}, body, method = 'GET' } = {}) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${url} returned ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function apiAttempt(url, options = {}) {
  try {
    return { ok: true, value: await apiCall(url, options) };
  } catch (error) {
    return { ok: false, error };
  }
}

function serviceHeaders(config) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Prefer: 'return=representation',
  };
}

function ownerHeaders(config, owner) {
  return { apikey: config.anonKey, Authorization: `Bearer ${owner.accessToken}` };
}

async function createOwner(config) {
  const result = await apiCall(`${config.apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: config.anonKey },
    body: {
      email: `portions-${randomUUID()}@example.test`,
      password: 'isolated-portions-test-42',
    },
  });
  assert.ok(result.user?.id && result.access_token);
  return { id: result.user.id, accessToken: result.access_token };
}

async function createRecipe(config, owner) {
  const [recipe] = await apiCall(`${config.apiUrl}/rest/v1/rpc/save_recipe_with_relationships`, {
    method: 'POST',
    headers: ownerHeaders(config, owner),
    body: {
      p_recipe_id: null,
      p_expected_version: null,
      p_name: 'Migration fixture',
      p_food_type_id: null,
      p_state: 'want_to_try',
      p_verdict_id: null,
      p_enthusiasm_id: null,
      p_occasion_details: null,
      p_reason: null,
      p_serves: 4,
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
      p_publication_id: null,
      p_publication_page: null,
      p_recipe_url: null,
      p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
      p_tag_ids: [],
    },
  });
  assert.ok(recipe?.id);
  return recipe;
}

async function runMigrationTest() {
  const { migrations, targetIndex, sourceMigrations } = await configureProject();
  supabaseStartAttempted = true;
  runSupabase(['start', '--yes']);
  runSupabase(['migration', 'up', '--local']);

  const config = getSupabaseConfig();
  const owner = await createOwner(config);
  const recipe = await createRecipe(config, owner);
  const service = serviceHeaders(config);
  const [set] = await apiCall(
    `${config.apiUrl}/rest/v1/recipe_ingredient_sets?select=id&recipe_id=eq.${recipe.id}`,
    { headers: service },
  );
  const [ingredient] = await apiCall(`${config.apiUrl}/rest/v1/ingredients`, {
    method: 'POST',
    headers: service,
    body: { account_id: owner.id, name: 'Repeated migration ingredient' },
  });

  for (const position of [0, 1]) {
    await apiCall(`${config.apiUrl}/rest/v1/recipe_ingredients`, {
      method: 'POST',
      headers: service,
      body: {
        account_id: owner.id,
        recipe_id: recipe.id,
        ingredient_id: ingredient.id,
        ingredient_set_id: set.id,
        position,
        is_main: false,
        detail: '',
        preparation: '',
      },
    });
  }
  await apiCall(`${config.apiUrl}/rest/v1/rpc/trash_recipe`, {
    method: 'POST',
    headers: ownerHeaders(config, owner),
    body: { p_recipe_id: recipe.id, p_expected_version: recipe.version },
  });

  const migrationPath = join(sourceMigrations, migrationName);
  await cp(migrationPath, join(supabaseDirectory, 'migrations', migrationName));
  for (const migration of migrations.slice(targetIndex + 1)) {
    await cp(join(sourceMigrations, migration), join(supabaseDirectory, 'migrations', migration));
  }
  const preflight = spawnSync(
    supabaseCommand,
    ['migration', 'up', '--local', '--workdir', projectDirectory],
    {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  assert.notEqual(preflight.status, 0, 'duplicate preflight unexpectedly succeeded');
  assert.match(`${preflight.stdout}\n${preflight.stderr}`, /Resolve repeated ingredients/u);

  const unappliedColumn = await apiAttempt(
    `${config.apiUrl}/rest/v1/recipe_ingredients?select=portion_one_ratio&limit=1`,
    { headers: service },
  );
  assert.equal(unappliedColumn.ok, false, 'failed preflight changed the schema');

  await apiCall(
    `${config.apiUrl}/rest/v1/recipe_ingredients?recipe_id=eq.${recipe.id}&position=eq.1`,
    { method: 'DELETE', headers: service },
  );
  runSupabase(['migration', 'up', '--local']);

  const migratedRows = await apiCall(
    `${config.apiUrl}/rest/v1/recipe_ingredients?select=id,portion_one_ratio,size_value,size_unit&recipe_id=eq.${recipe.id}`,
    { headers: service },
  );
  assert.equal(migratedRows.length, 1);
  assert.deepEqual(
    {
      portion_one_ratio: migratedRows[0].portion_one_ratio,
      size_value: migratedRows[0].size_value,
      size_unit: migratedRows[0].size_unit,
    },
    { portion_one_ratio: null, size_value: null, size_unit: null },
  );

  const [secondSet] = await apiCall(`${config.apiUrl}/rest/v1/recipe_ingredient_sets`, {
    method: 'POST',
    headers: service,
    body: { account_id: owner.id, recipe_id: recipe.id, label: 'Sauce', position: 1 },
  });
  const [otherSetRow] = await apiCall(`${config.apiUrl}/rest/v1/recipe_ingredients`, {
    method: 'POST',
    headers: service,
    body: {
      account_id: owner.id,
      recipe_id: recipe.id,
      ingredient_id: ingredient.id,
      ingredient_set_id: secondSet.id,
      position: 1,
      is_main: false,
      detail: '',
      preparation: '',
    },
  });
  assert.ok(otherSetRow.id, 'same ingredient in another set should be accepted');

  const sameSetDuplicate = await apiAttempt(`${config.apiUrl}/rest/v1/recipe_ingredients`, {
    method: 'POST',
    headers: service,
    body: {
      account_id: owner.id,
      recipe_id: recipe.id,
      ingredient_id: ingredient.id,
      ingredient_set_id: set.id,
      position: 2,
      is_main: false,
      detail: '',
      preparation: '',
    },
  });
  assert.equal(sameSetDuplicate.ok, false, 'same-set duplicate should be rejected');

  const invalidSize = await apiAttempt(
    `${config.apiUrl}/rest/v1/recipe_ingredients?id=eq.${migratedRows[0].id}`,
    { method: 'PATCH', headers: service, body: { size_value: 2, size_unit: 'in' } },
  );
  assert.equal(invalidSize.ok, false, 'Size should require cubed preparation');

  const invalidRatio = await apiAttempt(
    `${config.apiUrl}/rest/v1/recipe_ingredients?id=eq.${otherSetRow.id}`,
    { method: 'PATCH', headers: service, body: { portion_one_ratio: 0.5 } },
  );
  assert.equal(invalidRatio.ok, false, 'division without a scalar measurement should fail');

  const savedStepId = randomUUID();
  const savedRowIds = [randomUUID(), randomUUID()];
  const savedSetIds = [randomUUID(), randomUUID()];
  const savePayload = {
    p_recipe_id: null,
    p_expected_version: null,
    p_name: 'Portion save fixture',
    p_food_type_id: null,
    p_state: 'want_to_try',
    p_verdict_id: null,
    p_enthusiasm_id: null,
    p_occasion_details: null,
    p_reason: null,
    p_serves: 4,
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
    p_ingredient_rows: savedRowIds.map((id, index) => ({
      recipe_ingredient_id: id,
      ingredient_set_id: savedSetIds[index],
      ingredient_id: ingredient.id,
      ingredient_name: null,
      is_main: false,
      detail: '',
      preparation: 'cubed',
      portion_one_ratio: index === 0 ? 0.25 : 0.5,
      size_value: index === 0 ? 1.5 : 2.5,
      size_unit: index === 0 ? 'in' : 'cm',
      measurements: [
        {
          measurement_type: 'count',
          amount_min: index === 0 ? 4 : 8,
          amount_max: null,
          unit_code: null,
          picklist_value_id: null,
        },
      ],
    })),
    p_instruction_steps: [
      {
        id: savedStepId,
        position: 0,
        content_markdown: `Use [[ingredient:${savedRowIds[0]}:2|repeated-migration-ingredient-main-2]] and [[ingredient:${savedRowIds[0]}|repeated-migration-ingredient-main]].`,
        plain_text:
          'Use #repeated-migration-ingredient-main-2 and #repeated-migration-ingredient-main.',
      },
    ],
    p_publication_id: null,
    p_publication_page: null,
    p_recipe_url: null,
    p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
    p_tag_ids: [],
    p_ingredient_sets: [
      { id: savedSetIds[0], label: 'Main', position: 0 },
      { id: savedSetIds[1], label: 'Sauce', position: 1 },
    ],
  };
  const saveResult = await apiCall(
    `${config.apiUrl}/rest/v1/rpc/save_recipe_with_ingredient_sets`,
    {
      method: 'POST',
      headers: ownerHeaders(config, owner),
      body: savePayload,
    },
  );
  const savedRecipeId = saveResult[0].id;
  assert.ok(savedRecipeId);

  const savedRows = await apiCall(
    `${config.apiUrl}/rest/v1/recipe_ingredients?select=id,ingredient_set_id,portion_one_ratio,size_value,size_unit&recipe_id=eq.${savedRecipeId}&order=position`,
    { headers: service },
  );
  assert.deepEqual(
    savedRows.map(({ portion_one_ratio, size_value, size_unit }) => ({
      portion_one_ratio,
      size_value,
      size_unit,
    })),
    [
      { portion_one_ratio: 0.25, size_value: 1.5, size_unit: 'in' },
      { portion_one_ratio: 0.5, size_value: 2.5, size_unit: 'cm' },
    ],
  );
  assert.deepEqual(
    savedRows.map((row) => row.ingredient_set_id),
    savedSetIds,
  );

  const savedMentions = await apiCall(
    `${config.apiUrl}/rest/v1/recipe_step_mentions?select=recipe_ingredient_id,portion_ordinal&recipe_id=eq.${savedRecipeId}`,
    { headers: service },
  );
  assert.deepEqual(savedMentions, [
    { recipe_ingredient_id: savedRowIds[0], portion_ordinal: 2 },
    { recipe_ingredient_id: savedRowIds[0], portion_ordinal: null },
  ]);

  const history = await apiCall(
    `${config.apiUrl}/rest/v1/recipe_history?select=before_data,after_data&record_id=eq.${savedRecipeId}&order=created_at.asc,id.asc`,
    { headers: service },
  );
  assert.equal(history[0].after_data.ingredients[0].portion_one_ratio, 0.25);
  assert.equal(history[0].after_data.ingredients[1].size_unit, 'cm');
  assert.equal(history[0].after_data.steps[0].mentions[0].portion_ordinal, 2);

  const updatePayload = {
    ...savePayload,
    p_recipe_id: savedRecipeId,
    p_expected_version: saveResult[0].version,
    p_name: 'Updated portion fixture',
    p_ingredient_rows: savePayload.p_ingredient_rows.map((row, index) => ({
      ...row,
      portion_one_ratio: index === 0 ? 0.75 : 0.25,
    })),
  };
  await apiCall(`${config.apiUrl}/rest/v1/rpc/save_recipe_with_ingredient_sets`, {
    method: 'POST',
    headers: ownerHeaders(config, owner),
    body: updatePayload,
  });
  const updatedHistory = await apiCall(
    `${config.apiUrl}/rest/v1/recipe_history?select=before_data,after_data&record_id=eq.${savedRecipeId}&order=created_at.asc,id.asc`,
    { headers: service },
  );
  assert.equal(updatedHistory.length, 2);
  assert.equal(updatedHistory[1].before_data.ingredients[0].portion_one_ratio, 0.25);
  assert.equal(updatedHistory[1].before_data.ingredients[1].size_unit, 'cm');
  assert.equal(updatedHistory[1].after_data.ingredients[0].portion_one_ratio, 0.75);

  const invalidPortionMention = await apiAttempt(`${config.apiUrl}/rest/v1/recipe_steps`, {
    method: 'POST',
    headers: service,
    body: {
      id: randomUUID(),
      account_id: owner.id,
      recipe_id: recipe.id,
      position: 0,
      content_markdown: `Use [[ingredient:${otherSetRow.id}:1|unsplit-row-1]].`,
      plain_text: 'Use #unsplit-row-1.',
    },
  });
  assert.equal(invalidPortionMention.ok, false, 'unsplit rows must reject portion markers');

  await apiCall(`${config.apiUrl}/rest/v1/recipe_ingredient_measurements`, {
    method: 'POST',
    headers: service,
    body: {
      account_id: owner.id,
      recipe_ingredient_id: otherSetRow.id,
      position: 0,
      measurement_type: 'count',
      amount_min: 4,
      amount_max: null,
      unit_code: null,
      picklist_value_id: null,
    },
  });
  await apiCall(`${config.apiUrl}/rest/v1/recipe_ingredients?id=eq.${otherSetRow.id}`, {
    method: 'PATCH',
    headers: service,
    body: { portion_one_ratio: 0.5 },
  });
  await apiCall(`${config.apiUrl}/rest/v1/recipe_ingredients?id=eq.${otherSetRow.id}`, {
    method: 'PATCH',
    headers: service,
    body: { preparation: 'cubed', size_value: 2.5, size_unit: 'cm' },
  });

  console.log('Ingredient portion migration preflight and database constraints passed.');
}

try {
  await runMigrationTest();
} finally {
  if (supabaseStartAttempted) {
    try {
      runSupabase(['stop', '--no-backup']);
    } catch {
      // Cleanup is best-effort for this uniquely named temporary project.
    }
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
