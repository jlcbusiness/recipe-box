import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const migrationName = '20261101160000_recipe_tin_library_entry.sql';
const repositoryRoot = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), 'recipe-box-recipe-tin-migration-'));
const projectDirectory = join(temporaryRoot, 'project');
const supabaseDirectory = join(projectDirectory, 'supabase');
const projectId = `recipe-box-tin-migration-${randomUUID().slice(0, 8)}`;
let startAttempted = false;

function runSupabase(args, captureOutput = false) {
  const result = spawnSync('supabase', [...args, '--workdir', projectDirectory], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) {
    const output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`supabase ${args[0]} failed${output ? `: ${output}` : '.'}`);
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
    const available = await Promise.all(ports.map((port) => canBind(port + offset)));
    if (available.every(Boolean)) return offset;
  }
  throw new Error('Could not find an available port range for the isolated Supabase project.');
}

async function configureTemporaryProject() {
  const sourceConfigPath = resolve(repositoryRoot, 'supabase/config.toml');
  const sourceMigrationsDirectory = resolve(repositoryRoot, 'supabase/migrations');
  const migrationFiles = [...(await readdir(sourceMigrationsDirectory))]
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const targetIndex = migrationFiles.indexOf(migrationName);
  if (targetIndex < 1) {
    throw new Error(`Could not find ${migrationName} in the repository migration list.`);
  }

  let config = await readFile(sourceConfigPath, 'utf8');
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
  for (const migration of migrationFiles.slice(0, targetIndex)) {
    await cp(
      join(sourceMigrationsDirectory, migration),
      join(supabaseDirectory, 'migrations', migration),
    );
  }
  await cp(resolve(repositoryRoot, 'supabase/templates'), join(supabaseDirectory, 'templates'), {
    recursive: true,
  });
  await cp(resolve(repositoryRoot, 'supabase/seed.sql'), join(supabaseDirectory, 'seed.sql'));
  await writeFile(join(supabaseDirectory, 'config.toml'), config);
  return migrationFiles;
}

function getSupabaseKeys() {
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
    throw new Error('Could not read credentials for the isolated Supabase project.');
  }
  return { apiUrl, anonKey, serviceRoleKey };
}

async function apiJson(url, { headers = {}, body, method = 'GET' } = {}) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${url} returned ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function apiAttempt(url, { headers = {}, body, method = 'GET' } = {}) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function apiHeaders(anonKey, accessToken) {
  return { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
}

async function createOwner(apiUrl, anonKey) {
  const response = await apiJson(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey },
    body: {
      email: `recipe-tin-migration-${randomUUID()}@example.test`,
      password: 'local-migration-test-42',
    },
  });
  if (!response.user?.id || !response.access_token) {
    throw new Error('Local Auth did not return a test user and access token.');
  }
  return { id: response.user.id, accessToken: response.access_token };
}

async function rpc(apiUrl, anonKey, owner, name, body) {
  return apiJson(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: apiHeaders(anonKey, owner.accessToken),
    body,
  });
}

function recipePayload(name, publicationId = null, publicationPage = null, recipeUrl = null) {
  return {
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
    p_publication_id: publicationId,
    p_publication_page: publicationPage,
    p_recipe_url: recipeUrl,
    p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
    p_tag_ids: [],
  };
}

async function createRecipe(apiUrl, anonKey, owner, name, payload = recipePayload(name)) {
  const [recipe] = await rpc(apiUrl, anonKey, owner, 'save_recipe_with_relationships', payload);
  if (!recipe?.id) throw new Error(`Could not create recipe fixture ${name}.`);
  return recipe;
}

async function selectRows(apiUrl, anonKey, owner, table, query) {
  return apiJson(`${apiUrl}/rest/v1/${table}?${query}`, {
    headers: apiHeaders(anonKey, owner.accessToken),
  });
}

async function expectTin(apiUrl, anonKey, owner) {
  const tins = await selectRows(
    apiUrl,
    anonKey,
    owner,
    'publications',
    'select=id,account_id,name,publication_type,trashed_at&publication_type=eq.collection',
  );
  assert.equal(tins.length, 1);
  assert.deepEqual(tins[0], {
    id: tins[0].id,
    account_id: owner.id,
    name: 'Recipe Tin',
    publication_type: 'collection',
    trashed_at: null,
  });
  return tins[0].id;
}

async function main() {
  const migrationFiles = await configureTemporaryProject();
  const targetIndex = migrationFiles.indexOf(migrationName);
  startAttempted = true;
  runSupabase(['start', '--yes']);
  runSupabase(['migration', 'up', '--local']);

  const { apiUrl, anonKey, serviceRoleKey } = getSupabaseKeys();
  const existingOwner = await createOwner(apiUrl, anonKey);
  const secondOwner = await createOwner(apiUrl, anonKey);
  const oldRecipe = await createRecipe(apiUrl, anonKey, existingOwner, 'Legacy tin recipe');
  const oldHistory = await selectRows(
    apiUrl,
    anonKey,
    existingOwner,
    'recipe_history',
    `select=id,event_type,before_data,after_data&record_id=eq.${oldRecipe.id}&order=created_at.asc,id.asc`,
  );
  const oldRow = await selectRows(
    apiUrl,
    anonKey,
    existingOwner,
    'recipes',
    `select=id,version,publication_id,publication_page,recipe_url&id=eq.${oldRecipe.id}`,
  );
  assert.equal(oldRow[0]?.publication_id, null);

  for (const migration of migrationFiles.slice(targetIndex)) {
    await cp(
      join(resolve(repositoryRoot, 'supabase/migrations'), migration),
      join(supabaseDirectory, 'migrations', migration),
    );
  }
  runSupabase(['migration', 'up', '--local']);

  const existingTinId = await expectTin(apiUrl, anonKey, existingOwner);
  const secondTinId = await expectTin(apiUrl, anonKey, secondOwner);
  assert.notEqual(existingTinId, secondTinId);

  const migratedRows = await selectRows(
    apiUrl,
    anonKey,
    existingOwner,
    'recipes',
    `select=id,version,publication_id,publication_page,recipe_url&id=eq.${oldRecipe.id}`,
  );
  assert.deepEqual(migratedRows, [
    {
      id: oldRecipe.id,
      version: oldRow[0].version,
      publication_id: existingTinId,
      publication_page: null,
      recipe_url: null,
    },
  ]);
  assert.deepEqual(
    await selectRows(
      apiUrl,
      anonKey,
      existingOwner,
      'recipe_history',
      `select=id,event_type,before_data,after_data&record_id=eq.${oldRecipe.id}&order=created_at.asc,id.asc`,
    ),
    oldHistory,
  );

  const otherOwnerTin = await apiAttempt(
    `${apiUrl}/rest/v1/publications?select=id&id=eq.${secondTinId}`,
    { headers: apiHeaders(anonKey, existingOwner.accessToken) },
  );
  assert.equal(otherOwnerTin.ok, true);
  assert.deepEqual(JSON.parse(otherOwnerTin.text), []);

  const newOwner = await createOwner(apiUrl, anonKey);
  const newTinId = await expectTin(apiUrl, anonKey, newOwner);
  const newRecipe = await createRecipe(apiUrl, anonKey, newOwner, 'Default tin recipe');
  const newRecipeRow = await selectRows(
    apiUrl,
    anonKey,
    newOwner,
    'recipes',
    `select=publication_id,publication_page,recipe_url&id=eq.${newRecipe.id}`,
  );
  assert.deepEqual(newRecipeRow, [
    { publication_id: newTinId, publication_page: null, recipe_url: null },
  ]);

  const sourcePublicationId = await rpc(apiUrl, anonKey, newOwner, 'create_publication', {
    p_name: 'Recipe Tin disposition source',
    p_publication_type: 'book',
    p_author: null,
    p_edition: null,
    p_isbn: null,
    p_retailer_url: null,
    p_issue: null,
    p_site_url: null,
    p_tag_ids: [],
  });
  assert.equal(typeof sourcePublicationId, 'string');
  const sourceRecipe = await createRecipe(
    apiUrl,
    anonKey,
    newOwner,
    'Recipe moved from a trashed publication',
    recipePayload('Recipe moved from a trashed publication', sourcePublicationId, 'p. 12'),
  );
  const [sourcePublication] = await selectRows(
    apiUrl,
    anonKey,
    newOwner,
    'publications',
    `select=id,version&id=eq.${sourcePublicationId}`,
  );
  const [trashedPublication] = await rpc(apiUrl, anonKey, newOwner, 'trash_publication', {
    p_publication_id: sourcePublicationId,
    p_expected_version: sourcePublication.version,
    p_recipe_disposition: 'recipe_tin',
    p_destination_publication_id: null,
  });
  assert.equal(trashedPublication.id, sourcePublicationId);
  assert.deepEqual(
    await selectRows(
      apiUrl,
      anonKey,
      newOwner,
      'recipes',
      `select=publication_id,publication_page,recipe_url&id=eq.${sourceRecipe.id}`,
    ),
    [{ publication_id: newTinId, publication_page: null, recipe_url: null }],
  );

  const tinCreation = await apiAttempt(`${apiUrl}/rest/v1/rpc/create_publication`, {
    method: 'POST',
    headers: apiHeaders(anonKey, newOwner.accessToken),
    body: {
      p_name: 'Another Recipe Tin',
      p_publication_type: 'collection',
      p_author: null,
      p_edition: null,
      p_isbn: null,
      p_retailer_url: null,
      p_issue: null,
      p_site_url: null,
      p_tag_ids: [],
    },
  });
  assert.equal(tinCreation.ok, false);

  const duplicateTin = await apiAttempt(`${apiUrl}/rest/v1/publications`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=minimal',
    },
    body: {
      account_id: newOwner.id,
      name: 'Duplicate Recipe Tin',
      publication_type: 'collection',
    },
  });
  assert.equal(duplicateTin.ok, false);

  const forbiddenLocation = await apiAttempt(
    `${apiUrl}/rest/v1/rpc/save_recipe_with_relationships`,
    {
      method: 'POST',
      headers: apiHeaders(anonKey, newOwner.accessToken),
      body: recipePayload('Invalid tin location', newTinId, 'p. 3'),
    },
  );
  assert.equal(forbiddenLocation.ok, false);

  console.log(
    'Recipe Tin migration, provisioning, isolation, and default-assignment checks passed.',
  );
}

try {
  await main();
} finally {
  if (startAttempted) {
    try {
      runSupabase(['stop', '--no-backup']);
    } catch {
      // Cleanup is best-effort for this uniquely named temporary project.
    }
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
