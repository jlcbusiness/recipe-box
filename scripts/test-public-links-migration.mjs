import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const migrationName = '20261106000000_public_recipe_links_and_privacy.sql';
const repositoryRoot = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), 'recipe-box-public-links-'));
const projectDirectory = join(temporaryRoot, 'project');
const supabaseDirectory = join(projectDirectory, 'supabase');
const projectId = `recipe-box-public-links-${randomUUID().slice(0, 8)}`;
const nextDistDirectory = '.next-public-links';
let supabaseStartAttempted = false;
let nextServer;
let originalNextEnv;

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
    if ((await Promise.all(ports.map((port) => canBind(port + offset)))).every(Boolean)) {
      return offset;
    }
  }
  throw new Error('Could not find an isolated Supabase port range.');
}

async function findPort(start) {
  for (let port = start; port < start + 100; port += 1) {
    if (await canBind(port)) return port;
  }
  throw new Error('Could not find a port for the isolated Next server.');
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
  await mkdir(join(supabaseDirectory, 'tests'), { recursive: true });
  await cp(
    resolve(repositoryRoot, 'supabase/tests/auth_provider_guard.test.sql'),
    join(supabaseDirectory, 'tests/auth_provider_guard.test.sql'),
  );
  await cp(
    resolve(repositoryRoot, 'supabase/tests/export_service_role_access.test.sql'),
    join(supabaseDirectory, 'tests/export_service_role_access.test.sql'),
  );
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
  if (!response.ok) {
    throw new Error(`${method} ${url} returned ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function apiAttempt(url, options = {}) {
  try {
    return { ok: true, value: await apiCall(url, options) };
  } catch (error) {
    return { ok: false, error };
  }
}

function ownerHeaders(config, owner) {
  return { apikey: config.anonKey, Authorization: `Bearer ${owner.accessToken}` };
}

function serviceHeaders(config) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Prefer: 'return=representation',
  };
}

async function createOwner(config) {
  const result = await apiCall(`${config.apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: config.anonKey },
    body: {
      email: `public-links-${randomUUID()}@example.test`,
      password: 'isolated-public-links-42',
    },
  });
  assert.ok(result.user?.id && result.access_token);
  return { id: result.user.id, accessToken: result.access_token };
}

async function createRecipe(config, owner, name) {
  const [recipe] = await apiCall(`${config.apiUrl}/rest/v1/rpc/save_recipe_with_relationships`, {
    method: 'POST',
    headers: ownerHeaders(config, owner),
    body: {
      p_recipe_id: null,
      p_expected_version: null,
      p_name: name,
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

async function startNextServer(config, port) {
  originalNextEnv = await readFile(join(repositoryRoot, 'next-env.d.ts'), 'utf8');
  const serverEnvironment = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: config.apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
    SIGNUP_MODE: 'open',
    CRON_SECRET: 'public-links-isolated-test',
    NEXT_DIST_DIR: nextDistDirectory,
  };
  const buildResult = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    cwd: repositoryRoot,
    env: serverEnvironment,
    stdio: 'inherit',
  });
  if (buildResult.error || buildResult.status !== 0) {
    throw new Error('Isolated public-link production build failed.');
  }

  nextServer = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--port', String(port)],
    {
      cwd: repositoryRoot,
      env: serverEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  await new Promise((resolveReady, rejectReady) => {
    let output = '';
    const timeout = setTimeout(
      () => rejectReady(new Error(`Next server did not start: ${output}`)),
      120_000,
    );
    const onData = (chunk) => {
      output = `${output}${chunk}`.slice(-8000);
      process.stdout.write(chunk);
      if (/Ready in|ready in/iu.test(output)) {
        clearTimeout(timeout);
        resolveReady();
      }
    };
    nextServer.stdout.on('data', onData);
    nextServer.stderr.on('data', onData);
    nextServer.once('error', (error) => {
      clearTimeout(timeout);
      rejectReady(error);
    });
    nextServer.once('close', (code) => {
      clearTimeout(timeout);
      rejectReady(new Error(`Next server exited with ${code}: ${output}`));
    });
  });
}

async function verifyMigrationAndRunBrowserTests() {
  const { migrations, targetIndex, sourceMigrations } = await configureProject();
  supabaseStartAttempted = true;
  runSupabase(['start', '--yes']);
  runSupabase(['migration', 'up', '--local']);

  const config = getSupabaseConfig();
  const owner = await createOwner(config);
  const legacyRecipe = await createRecipe(config, owner, 'Backfilled public recipe');
  const historyBefore = await apiCall(
    `${config.apiUrl}/rest/v1/recipe_history?select=id,event_type,after_data&record_id=eq.${legacyRecipe.id}&order=created_at.asc,id.asc`,
    { headers: serviceHeaders(config) },
  );

  await cp(
    join(sourceMigrations, migrationName),
    join(supabaseDirectory, 'migrations', migrationName),
  );
  for (const migration of migrations.slice(targetIndex + 1)) {
    await cp(join(sourceMigrations, migration), join(supabaseDirectory, 'migrations', migration));
  }
  runSupabase(['migration', 'up', '--local']);
  runSupabase(['test', 'db', '--local', 'supabase/tests/auth_provider_guard.test.sql']);
  runSupabase(['test', 'db', '--local', 'supabase/tests/export_service_role_access.test.sql']);

  const bootstrapEmail = `bootstrap-${randomUUID()}@example.test`;
  const bootstrap = spawnSync(
    process.execPath,
    [resolve(repositoryRoot, 'scripts/bootstrap-first-admin.mjs'), bootstrapEmail],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3001',
        NEXT_PUBLIC_SUPABASE_URL: config.apiUrl,
        SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  assert.match(
    bootstrap.stdout,
    new RegExp(`First administrator invitation sent to ${bootstrapEmail}`),
  );

  const bootstrapUsers = await apiCall(
    `${config.apiUrl}/auth/v1/admin/users?page=1&per_page=1000`,
    {
      headers: serviceHeaders(config),
    },
  );
  const bootstrapUser = bootstrapUsers.users.find((user) => user.email === bootstrapEmail);
  assert.ok(bootstrapUser);
  assert.equal(bootstrapUser.app_metadata.invitation_pending, true);
  assert.equal(bootstrapUser.app_metadata.sign_in_method, 'email_password');
  const bootstrapAccount = await apiCall(
    `${config.apiUrl}/rest/v1/accounts?select=id,is_admin,is_owner,sign_in_method&id=eq.${bootstrapUser.id}`,
    { headers: serviceHeaders(config) },
  );
  assert.deepEqual(bootstrapAccount, [
    { id: bootstrapUser.id, is_admin: true, is_owner: true, sign_in_method: 'email_password' },
  ]);

  const repeatedBootstrap = spawnSync(
    process.execPath,
    [resolve(repositoryRoot, 'scripts/bootstrap-first-admin.mjs'), `second-${bootstrapEmail}`],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3001',
        NEXT_PUBLIC_SUPABASE_URL: config.apiUrl,
        SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  assert.notEqual(repeatedBootstrap.status, 0);
  assert.match(repeatedBootstrap.stderr, /administrator already exists/u);

  const legacyRows = await apiCall(
    `${config.apiUrl}/rest/v1/recipes?select=id,public_id,is_private&id=eq.${legacyRecipe.id}`,
    { headers: ownerHeaders(config, owner) },
  );
  assert.equal(legacyRows.length, 1);
  assert.ok(legacyRows[0].public_id);
  assert.notEqual(legacyRows[0].public_id, legacyRecipe.id);
  assert.equal(legacyRows[0].is_private, false);
  const historyAfter = await apiCall(
    `${config.apiUrl}/rest/v1/recipe_history?select=id,event_type,after_data&record_id=eq.${legacyRecipe.id}&order=created_at.asc,id.asc`,
    { headers: serviceHeaders(config) },
  );
  assert.deepEqual(historyAfter, historyBefore);

  const clientChosenId = randomUUID();
  const insertedRows = await apiCall(`${config.apiUrl}/rest/v1/recipes`, {
    method: 'POST',
    headers: {
      ...serviceHeaders(config),
      Prefer: 'return=representation',
    },
    body: {
      account_id: owner.id,
      name: 'Client-chosen ID is ignored',
      state: 'want_to_try',
      public_id: clientChosenId,
    },
  });
  assert.equal(insertedRows.length, 1);
  assert.ok(insertedRows[0].public_id);
  assert.notEqual(insertedRows[0].public_id, clientChosenId);
  assert.notEqual(insertedRows[0].public_id, legacyRows[0].public_id);

  const privacyAttempt = await apiCall(`${config.apiUrl}/rest/v1/rpc/set_recipe_privacy`, {
    method: 'POST',
    headers: ownerHeaders(config, owner),
    body: {
      p_recipe_id: insertedRows[0].id,
      p_expected_version: insertedRows[0].version,
      p_is_private: true,
    },
  });
  assert.equal(privacyAttempt[0].is_private, true);
  const stalePrivacy = await apiAttempt(`${config.apiUrl}/rest/v1/rpc/set_recipe_privacy`, {
    method: 'POST',
    headers: ownerHeaders(config, owner),
    body: {
      p_recipe_id: insertedRows[0].id,
      p_expected_version: insertedRows[0].version,
      p_is_private: false,
    },
  });
  assert.equal(stalePrivacy.ok, false);

  for (const table of ['recipes', 'purged_recipe_public_ids']) {
    const anonymousRead = await apiAttempt(
      `${config.apiUrl}/rest/v1/${table}?select=public_id&limit=1`,
      { headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` } },
    );
    assert.ok(
      !anonymousRead.ok || (Array.isArray(anonymousRead.value) && anonymousRead.value.length === 0),
      `anon unexpectedly read rows from ${table}`,
    );
  }

  const port = await findPort(3200);
  await startNextServer(config, port);
  const browserResult = spawnSync(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      'tests/e2e/public-recipes.spec.ts',
      '--project=chromium',
      '--project=Fold 6',
      '--workers=1',
      '--grep',
      '@e2e|@a11y',
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        PLAYWRIGHT_BASE_URL: `http://localhost:${port}`,
        SUPABASE_WORKDIR: supabaseDirectory,
        NEXT_PUBLIC_SUPABASE_URL: config.apiUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
        SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
      },
      stdio: 'inherit',
    },
  );
  if (browserResult.error || browserResult.status !== 0) {
    throw new Error('Isolated public-link browser acceptance failed.');
  }
  console.log('Public ID backfill, privacy/RLS guards, tombstones, and browser acceptance passed.');
}

try {
  await verifyMigrationAndRunBrowserTests();
} finally {
  if (nextServer && nextServer.exitCode === null) {
    nextServer.kill('SIGTERM');
    await new Promise((resolveClose) => nextServer.once('close', resolveClose));
  }
  if (originalNextEnv !== undefined) {
    await writeFile(join(repositoryRoot, 'next-env.d.ts'), originalNextEnv);
  }
  await rm(join(repositoryRoot, nextDistDirectory), { recursive: true, force: true });
  if (supabaseStartAttempted) {
    try {
      runSupabase(['stop', '--no-backup']);
    } catch {
      // Cleanup is best-effort for this uniquely named temporary project.
    }
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
