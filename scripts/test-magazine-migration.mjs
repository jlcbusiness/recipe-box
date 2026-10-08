import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const migrationName = '20261024080000_magazine_titles_and_recipe_locations.sql';
const repositoryRoot = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), 'recipe-box-magazine-migration-'));
const projectDirectory = join(temporaryRoot, 'project');
const supabaseDirectory = join(projectDirectory, 'supabase');
const projectId = `recipe-box-migration-${randomUUID().slice(0, 8)}`;
let startAttempted = false;

function runSupabase(args, captureOutput = false) {
  const result = spawnSync('supabase', [...args, '--workdir', projectDirectory], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) {
    throw new Error(
      `supabase ${args[0]} failed${result.stderr ? `: ${result.stderr.trim()}` : '.'}`,
    );
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
    if (Math.max(...ports) + offset > 65535) {
      break;
    }
    const available = await Promise.all(ports.map((port) => canBind(port + offset)));
    if (available.every(Boolean)) {
      return offset;
    }
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

function apiHeaders(anonKey, accessToken) {
  return { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
}

function serviceHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: 'return=representation',
  };
}

async function createOwner(apiUrl, anonKey) {
  const response = await apiJson(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey },
    body: {
      email: `magazine-migration-${randomUUID()}@example.test`,
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

async function createPublication(apiUrl, anonKey, owner, name, type, issue = null) {
  return rpc(apiUrl, anonKey, owner, 'create_publication', {
    p_name: name,
    p_publication_type: type,
    p_author: null,
    p_edition: null,
    p_isbn: null,
    p_retailer_url: null,
    p_issue: issue,
    p_site_url: type === 'site' ? `https://${name.toLowerCase().replaceAll(' ', '-')}.test` : null,
  });
}

async function createLegacyRecipe(
  apiUrl,
  anonKey,
  owner,
  name,
  publicationId,
  recipeUrl,
  siteListing,
) {
  const [recipe] = await rpc(apiUrl, anonKey, owner, 'save_recipe_with_publication', {
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
    p_publication_page: null,
    p_recipe_url: recipeUrl,
    p_recipe_relationships: {
      site_listing: siteListing,
      pairings: [],
      references: [],
    },
  });
  return recipe;
}

async function selectRows(apiUrl, anonKey, owner, table, query) {
  return apiJson(`${apiUrl}/rest/v1/${table}?${query}`, {
    headers: apiHeaders(anonKey, owner.accessToken),
  });
}

async function readHistory(apiUrl, anonKey, owner, table, ids) {
  return selectRows(
    apiUrl,
    anonKey,
    owner,
    table,
    `select=id,account_id,record_id,event_type,before_data,after_data&record_id=in.(${ids.join(',')})&order=id.asc`,
  );
}

async function verifyMigration(apiUrl, anonKey, owner, otherOwner, fixtures) {
  const {
    recipeOne,
    recipeTwo,
    siteRecipe,
    magazineOne,
    magazineTwo,
    site,
    otherMagazine,
    referenceId,
    deletedMagazineId,
    survivingMagazine,
  } = fixtures;
  const ownerHeaders = apiHeaders(anonKey, owner.accessToken);
  const recipes = await selectRows(
    apiUrl,
    anonKey,
    owner,
    'recipes',
    `select=id,account_id,publication_id,publication_page,recipe_url&id=in.(${[recipeOne.id, recipeTwo.id, siteRecipe.id].join(',')})&order=id.asc`,
  );
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  assert.deepEqual(recipeById.get(recipeOne.id), {
    id: recipeOne.id,
    account_id: owner.id,
    publication_id: survivingMagazine.id,
    publication_page: 'Vol. 8, Issue 2 (Spring 2025)',
    recipe_url: 'https://kitchen-site.test/spring-tart',
  });
  assert.deepEqual(recipeById.get(recipeTwo.id), {
    id: recipeTwo.id,
    account_id: owner.id,
    publication_id: survivingMagazine.id,
    publication_page: 'Vol. 8, Issue 3 (Summer 2025)',
    recipe_url: 'https://kitchen-site.test/summer-tart',
  });
  assert.deepEqual(recipeById.get(siteRecipe.id), {
    id: siteRecipe.id,
    account_id: owner.id,
    publication_id: site,
    publication_page: null,
    recipe_url: 'https://kitchen-site.test/bean-salad',
  });

  const deletedMagazine = await selectRows(
    apiUrl,
    anonKey,
    owner,
    'publications',
    `select=id&id=eq.${deletedMagazineId}`,
  );
  assert.deepEqual(deletedMagazine, []);
  const otherOwnerMagazine = await selectRows(
    apiUrl,
    anonKey,
    otherOwner,
    'publications',
    `select=id,account_id&id=eq.${otherMagazine}`,
  );
  assert.deepEqual(otherOwnerMagazine, [{ id: otherMagazine, account_id: otherOwner.id }]);

  const reference = await selectRows(
    apiUrl,
    anonKey,
    owner,
    'recipe_references',
    `select=id,account_id,publication_id,display_text&id=eq.${referenceId}`,
  );
  assert.deepEqual(reference, [
    {
      id: referenceId,
      account_id: owner.id,
      publication_id: survivingMagazine.id,
      display_text: survivingMagazine.name,
    },
  ]);

  const siteListings = await apiJson(
    `${apiUrl}/rest/v1/recipe_site_listings?select=recipe_id&recipe_id=in.(${recipeOne.id},${recipeTwo.id})`,
    { headers: ownerHeaders },
  );
  assert.deepEqual(siteListings, []);

  const [recipeHistoryBefore, publicationHistoryBefore] = fixtures.history;
  assert.deepEqual(
    await readHistory(apiUrl, anonKey, owner, 'recipe_history', [recipeOne.id, recipeTwo.id]),
    recipeHistoryBefore,
  );
  assert.deepEqual(
    await readHistory(apiUrl, anonKey, owner, 'publication_history', [magazineOne, magazineTwo]),
    publicationHistoryBefore,
  );

  const survivingMagazineRows = await selectRows(
    apiUrl,
    anonKey,
    owner,
    'publications',
    `select=id,name,publication_type&id=eq.${survivingMagazine.id}`,
  );
  assert.deepEqual(survivingMagazineRows, [
    {
      id: survivingMagazine.id,
      name: survivingMagazine.name,
      publication_type: 'magazine',
    },
  ]);
}

async function main() {
  const migrationFiles = await configureTemporaryProject();
  const targetIndex = migrationFiles.indexOf(migrationName);
  if (targetIndex < 1) {
    throw new Error(`Could not find ${migrationName} in the staged migration list.`);
  }

  startAttempted = true;
  runSupabase(['start', '--yes']);
  runSupabase(['migration', 'up', '--local']);

  const { apiUrl, anonKey, serviceRoleKey } = getSupabaseKeys();
  const owner = await createOwner(apiUrl, anonKey);
  const otherOwner = await createOwner(apiUrl, anonKey);
  const magazineOne = await createPublication(
    apiUrl,
    anonKey,
    owner,
    'Seasonal Table',
    'magazine',
    'Vol. 8, Issue 2 (Spring 2025)',
  );
  const magazineTwo = await createPublication(
    apiUrl,
    anonKey,
    owner,
    'seasonal table',
    'magazine',
    'Vol. 8, Issue 3 (Summer 2025)',
  );
  const site = await createPublication(apiUrl, anonKey, owner, 'Kitchen Site', 'site');
  const otherMagazine = await createPublication(
    apiUrl,
    anonKey,
    otherOwner,
    'Seasonal Table',
    'magazine',
    'March 2025',
  );
  const legacyMagazineRows = await selectRows(
    apiUrl,
    anonKey,
    owner,
    'publications',
    `select=id,name,created_at&id=in.(${magazineOne},${magazineTwo})&order=created_at.asc,id.asc`,
  );
  assert.equal(legacyMagazineRows.length, 2);
  const survivingMagazine = legacyMagazineRows[0];
  const deletedMagazineId = legacyMagazineRows[1].id;
  const recipeOne = await createLegacyRecipe(
    apiUrl,
    anonKey,
    owner,
    'Spring tart',
    magazineOne,
    null,
    {
      site_publication_id: site,
      recipe_url: 'https://kitchen-site.test/spring-tart',
    },
  );
  const recipeTwo = await createLegacyRecipe(
    apiUrl,
    anonKey,
    owner,
    'Summer tart',
    magazineTwo,
    null,
    { site_publication_id: site, recipe_url: 'https://kitchen-site.test/summer-tart' },
  );
  const siteRecipe = await createLegacyRecipe(
    apiUrl,
    anonKey,
    owner,
    'Bean salad',
    site,
    'https://kitchen-site.test/bean-salad',
    null,
  );

  const referenceResponse = await apiJson(`${apiUrl}/rest/v1/recipe_references`, {
    method: 'POST',
    headers: serviceHeaders(serviceRoleKey),
    body: {
      account_id: owner.id,
      recipe_id: recipeTwo.id,
      reference_type: 'publication',
      publication_id: magazineTwo,
      display_text: 'seasonal table',
      position: 0,
    },
  });
  const referenceId = referenceResponse[0]?.id;
  if (!referenceId) {
    throw new Error('Could not create the legacy Magazine reference fixture.');
  }

  const fixtureRecipeIds = [recipeOne.id, recipeTwo.id];
  const fixtureMagazineIds = [magazineOne, magazineTwo];
  const history = [
    await readHistory(apiUrl, anonKey, owner, 'recipe_history', fixtureRecipeIds),
    await readHistory(apiUrl, anonKey, owner, 'publication_history', fixtureMagazineIds),
  ];

  for (const migration of migrationFiles.slice(targetIndex)) {
    await cp(
      join(resolve(repositoryRoot, 'supabase/migrations'), migration),
      join(supabaseDirectory, 'migrations', migration),
    );
  }
  runSupabase(['migration', 'up', '--local']);

  await verifyMigration(apiUrl, anonKey, owner, otherOwner, {
    recipeOne,
    recipeTwo,
    siteRecipe,
    magazineOne,
    magazineTwo,
    site,
    otherMagazine,
    referenceId,
    deletedMagazineId,
    survivingMagazine,
    history,
  });

  console.log('Magazine legacy-data migration checks passed.');
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
