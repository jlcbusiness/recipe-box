import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const migrationName = '20261211000000_hide_makes_by_default.sql';
const repositoryRoot = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), 'recipe-box-dlc12-migration-'));
const projectDirectory = join(temporaryRoot, 'project');
const supabaseDirectory = join(projectDirectory, 'supabase');
const projectId = `recipe-box-dlc12-${randomUUID().slice(0, 8)}`;
const runFullBrowserAcceptance = process.argv.includes('--full-browser');
const browserFileArgument = process.argv.find((argument) => argument.startsWith('--browser-file='));
const browserFile = browserFileArgument?.slice('--browser-file='.length);
const browserGrepArgument = process.argv.find((argument) => argument.startsWith('--browser-grep='));
const browserGrep = browserGrepArgument?.slice('--browser-grep='.length);
const supabaseCommand = resolve(
  repositoryRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'supabase.cmd' : 'supabase',
);
const playwrightCommand = resolve(
  repositoryRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
);
let supabaseStartAttempted = false;

function runSupabase(args) {
  const result = spawnSync(supabaseCommand, [...args, '--workdir', projectDirectory], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.error || result.status !== 0) {
    const failure = result.error?.message ?? `exit code ${result.status}`;
    throw new Error(`supabase ${args[0]} failed (${failure})${output ? `:\n${output}` : '.'}`);
  }
  return output;
}

function runBrowserTests(mailpitUrl) {
  const browserArguments = runFullBrowserAcceptance
    ? ['test', '--grep', '@e2e|@a11y', '--workers=1']
    : browserGrep
      ? ['test', '--grep', browserGrep, '--workers=1']
      : browserFile
        ? ['test', browserFile, '--workers=1']
        : ['test', 'tests/e2e/nutrition.spec.ts', '--grep', '@nutrition', '--workers=1'];
  const result = spawnSync(playwrightCommand, browserArguments, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      SUPABASE_WORKDIR: projectDirectory,
      LOCAL_SUPABASE_MAILPIT_URL: mailpitUrl,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    const failure = result.error?.message ?? `exit code ${result.status}`;
    throw new Error(`Browser acceptance tests failed (${failure}).`);
  }
}

function getSupabaseCredentials() {
  const values = new Map(
    runSupabase(['status', '--output', 'env'])
      .split(/\r?\n/)
      .flatMap((line) => {
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
  if (!response.ok) throw new Error(`${method} ${new URL(url).pathname} failed: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function createOwner(apiUrl, anonKey) {
  const result = await apiCall(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey },
    body: {
      email: `nutrition-${randomUUID()}@example.test`,
      password: `Nutrition-test-${randomUUID()}-42`,
    },
  });
  if (!result.user?.id || !result.access_token) {
    throw new Error('Could not create an isolated nutrition test owner.');
  }
  return {
    id: result.user.id,
    headers: { apikey: anonKey, Authorization: `Bearer ${result.access_token}` },
  };
}

async function verifyNutritionRpcAndAccess() {
  const { apiUrl, anonKey, serviceRoleKey } = getSupabaseCredentials();
  const owner = await createOwner(apiUrl, anonKey);
  const otherOwner = await createOwner(apiUrl, anonKey);
  const informalUnits = await apiCall(
    `${apiUrl}/rest/v1/recipe_picklist_values?select=value&account_id=eq.${owner.id}&category=eq.informal_unit`,
    { headers: owner.headers },
  );
  assert.ok(informalUnits.some(({ value }) => value === 'Bunch'));
  assert.ok(
    informalUnits.every(({ value }) => value.toLocaleLowerCase() !== 'pinch'),
    'Pinch is removed from the default informal-unit picklist',
  );
  assert.ok(
    informalUnits.some(({ value }) => value.toLocaleLowerCase() === 'dash'),
    'Dash remains unchanged because its migration is out of scope',
  );
  const ingredientName = `Nutrition ${randomUUID()}`;
  const revision = await apiCall(`${apiUrl}/rest/v1/rpc/manage_ingredient_catalog`, {
    method: 'POST',
    headers: owner.headers,
    body: {
      p_action: 'add',
      p_expected_revision: 1,
      p_name: ingredientName,
    },
  });
  const ingredients = await apiCall(
    `${apiUrl}/rest/v1/ingredients?select=id,name,account_id&limit=1000`,
    {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    },
  );
  const ingredient = ingredients.find(
    (row) =>
      row.account_id === owner.id &&
      row.name.toLocaleLowerCase() === ingredientName.toLocaleLowerCase(),
  );
  const ingredientId = ingredient?.id;
  if (!ingredientId) {
    throw new Error(
      `Could not create the isolated ingredient fixture (revision ${revision}, rows ${JSON.stringify(
        ingredients.map(({ name, account_id }) => ({ name, account_id })),
      )}, owner ${owner.id}, expected ${ingredientName}).`,
    );
  }

  const profileRevision = await apiCall(`${apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`, {
    method: 'POST',
    headers: owner.headers,
    body: {
      p_action: 'profile_set',
      p_expected_revision: revision,
      p_ingredient_id: ingredientId,
      p_profile: {
        servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
        nutrients: { calories: 360, protein: 12 },
      },
      p_equivalent: null,
    },
  });
  const profilePath =
    `/rest/v1/ingredient_nutrition_profiles?select=ingredient_id,serving_size_amount,nutrients` +
    `&ingredient_id=eq.${ingredientId}`;
  const profile = await apiCall(`${apiUrl}${profilePath}`, { headers: owner.headers });
  assert.deepEqual(profile, [
    {
      ingredient_id: ingredientId,
      serving_size_amount: 1,
      nutrients: { calories: 360, protein: 12 },
    },
  ]);
  assert.deepEqual(await apiCall(`${apiUrl}${profilePath}`, { headers: otherOwner.headers }), []);
  const equivalentPath =
    `/rest/v1/ingredient_measure_equivalents?select=ingredient_id,measurement_type,volume_amount,volume_unit_code,weight_amount,weight_unit_code` +
    `&ingredient_id=eq.${ingredientId}`;
  assert.deepEqual(await apiCall(`${apiUrl}${equivalentPath}`, { headers: owner.headers }), []);
  assert.deepEqual(
    await apiCall(`${apiUrl}${equivalentPath}`, { headers: otherOwner.headers }),
    [],
  );

  const directWrite = await fetch(`${apiUrl}/rest/v1/ingredient_nutrition_profiles`, {
    method: 'POST',
    headers: {
      ...owner.headers,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      account_id: owner.id,
      ingredient_id: ingredientId,
      serving_size_amount: 1,
      serving_size_dimension: 'volume',
      serving_size_unit_code: 'cup',
      nutrients: { calories: 1 },
    }),
  });
  assert.equal(
    directWrite.ok,
    false,
    'authenticated users cannot directly write nutrition profiles',
  );

  const directEquivalentWrite = await fetch(`${apiUrl}/rest/v1/ingredient_measure_equivalents`, {
    method: 'POST',
    headers: {
      ...owner.headers,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      account_id: owner.id,
      ingredient_id: ingredientId,
      measurement_type: 'count',
      volume_amount: 1,
      volume_unit_code: 'cup',
    }),
  });
  assert.equal(
    directEquivalentWrite.ok,
    false,
    'authenticated users cannot directly write ingredient measure equivalents',
  );

  const staleProfileWrite = await fetch(`${apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`, {
    method: 'POST',
    headers: { ...owner.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_action: 'profile_set',
      p_expected_revision: revision,
      p_ingredient_id: ingredientId,
      p_profile: {
        servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
        nutrients: { calories: 1 },
      },
      p_equivalent: null,
    }),
  });
  assert.equal(staleProfileWrite.ok, false, 'stale catalog revisions are rejected');
  assert.deepEqual(await apiCall(`${apiUrl}${profilePath}`, { headers: owner.headers }), profile);

  const invalidProfileWrite = await fetch(`${apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`, {
    method: 'POST',
    headers: { ...owner.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_action: 'profile_set',
      p_expected_revision: profileRevision,
      p_ingredient_id: ingredientId,
      p_profile: {
        servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
        nutrients: { protein: 12 },
      },
      p_equivalent: null,
    }),
  });
  assert.equal(invalidProfileWrite.ok, false, 'invalid profile writes are rejected');
  assert.deepEqual(await apiCall(`${apiUrl}${profilePath}`, { headers: owner.headers }), profile);

  const equivalentRevision = await apiCall(`${apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`, {
    method: 'POST',
    headers: owner.headers,
    body: {
      p_action: 'equivalent_set',
      p_expected_revision: profileRevision,
      p_ingredient_id: ingredientId,
      p_profile: null,
      p_equivalent: {
        measurementType: 'count',
        picklistValueId: null,
        picklistValue: null,
        volume: { amount: 1, unitCode: 'cup' },
        weight: { amount: 120, unitCode: 'g' },
      },
    },
  });
  assert.deepEqual(await apiCall(`${apiUrl}${equivalentPath}`, { headers: owner.headers }), [
    {
      ingredient_id: ingredientId,
      measurement_type: 'count',
      volume_amount: 1,
      volume_unit_code: 'cup',
      weight_amount: 120,
      weight_unit_code: 'g',
    },
  ]);
  assert.deepEqual(
    await apiCall(`${apiUrl}${equivalentPath}`, { headers: otherOwner.headers }),
    [],
  );
  const exportSnapshot = await apiCall(`${apiUrl}/rest/v1/rpc/read_export_snapshot`, {
    method: 'POST',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    body: { p_account_id: owner.id },
  });
  assert.equal(
    exportSnapshot.records.ingredient_nutrition_profiles.find(
      ({ ingredient_id }) => ingredient_id === ingredientId,
    )?.nutrients.calories,
    360,
  );
  assert.equal(
    exportSnapshot.records.ingredient_measure_equivalents.find(
      ({ ingredient_id }) => ingredient_id === ingredientId,
    )?.weight_amount,
    120,
  );

  const removedProfileRevision = await apiCall(
    `${apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`,
    {
      method: 'POST',
      headers: owner.headers,
      body: {
        p_action: 'profile_remove',
        p_expected_revision: equivalentRevision,
        p_ingredient_id: ingredientId,
        p_profile: null,
        p_equivalent: null,
      },
    },
  );
  assert.deepEqual(await apiCall(`${apiUrl}${profilePath}`, { headers: owner.headers }), []);

  const targetName = `Nutrition merge target ${randomUUID()}`;
  const targetAddRevision = await apiCall(`${apiUrl}/rest/v1/rpc/manage_ingredient_catalog`, {
    method: 'POST',
    headers: owner.headers,
    body: {
      p_action: 'add',
      p_expected_revision: removedProfileRevision,
      p_name: targetName,
    },
  });
  const targetRows = await apiCall(
    `${apiUrl}/rest/v1/ingredients?select=id,name,account_id&account_id=eq.${owner.id}&limit=1000`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
  );
  const targetId = targetRows.find(
    (row) =>
      row.account_id === owner.id &&
      row.name.toLocaleLowerCase() === targetName.toLocaleLowerCase(),
  )?.id;
  if (!targetId) {
    throw new Error(
      `Could not create the nutrition merge target ingredient ${targetName}; catalog rows were ${JSON.stringify(
        targetRows.map(({ id, name }) => ({ id, name })),
      )}.`,
    );
  }

  const sourceProfileRevision = await apiCall(`${apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`, {
    method: 'POST',
    headers: owner.headers,
    body: {
      p_action: 'profile_set',
      p_expected_revision: targetAddRevision,
      p_ingredient_id: ingredientId,
      p_profile: {
        servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
        nutrients: { calories: 360, protein: 12 },
      },
      p_equivalent: null,
    },
  });
  const mergeRevision = await apiCall(`${apiUrl}/rest/v1/rpc/manage_ingredient_catalog`, {
    method: 'POST',
    headers: owner.headers,
    body: {
      p_action: 'merge',
      p_expected_revision: sourceProfileRevision,
      p_ingredient_id: ingredientId,
      p_replacement_id: targetId,
    },
  });
  const targetProfilePath = profilePath.replace(`eq.${ingredientId}`, `eq.${targetId}`);
  const sourceEquivalentPath = equivalentPath;
  const targetEquivalentPath = equivalentPath.replace(`eq.${ingredientId}`, `eq.${targetId}`);
  assert.deepEqual(await apiCall(`${apiUrl}${targetProfilePath}`, { headers: owner.headers }), [
    {
      ingredient_id: targetId,
      serving_size_amount: 1,
      nutrients: { calories: 360, protein: 12 },
    },
  ]);
  assert.deepEqual(await apiCall(`${apiUrl}${profilePath}`, { headers: owner.headers }), []);
  assert.deepEqual(await apiCall(`${apiUrl}${targetEquivalentPath}`, { headers: owner.headers }), [
    {
      ingredient_id: targetId,
      measurement_type: 'count',
      volume_amount: 1,
      volume_unit_code: 'cup',
      weight_amount: 120,
      weight_unit_code: 'g',
    },
  ]);
  assert.deepEqual(
    await apiCall(`${apiUrl}${sourceEquivalentPath}`, { headers: owner.headers }),
    [],
  );

  const deleteRevision = await apiCall(`${apiUrl}/rest/v1/rpc/manage_ingredient_catalog`, {
    method: 'POST',
    headers: owner.headers,
    body: {
      p_action: 'delete',
      p_expected_revision: mergeRevision,
      p_ingredient_id: targetId,
      p_replacement_id: null,
    },
  });
  assert.deepEqual(await apiCall(`${apiUrl}${targetProfilePath}`, { headers: owner.headers }), []);
  assert.deepEqual(
    await apiCall(`${apiUrl}${targetEquivalentPath}`, { headers: owner.headers }),
    [],
  );

  const history = await apiCall(
    `${apiUrl}/rest/v1/ingredient_catalog_history?select=event_type,ingredient_id&account_id=eq.${owner.id}`,
    { headers: owner.headers },
  );
  const historyEvents = history.map(({ event_type }) => event_type);
  for (const eventType of [
    'ingredient.nutrition_profile_set',
    'ingredient.nutrition_profile_removed',
    'ingredient.measure_equivalent_set',
    'ingredient.nutrition_reassigned',
    'ingredient.measure_equivalent_reassigned',
    'ingredient.deleted',
  ]) {
    assert.ok(historyEvents.includes(eventType), `expected catalog history event ${eventType}`);
  }
  assert.ok(deleteRevision > mergeRevision);

  const conflictNames = [
    `Nutrition merge source ${randomUUID()}`,
    `Nutrition merge target ${randomUUID()}`,
  ];
  let conflictRevision = deleteRevision;
  const conflictIds = [];
  for (const name of conflictNames) {
    conflictRevision = await apiCall(`${apiUrl}/rest/v1/rpc/manage_ingredient_catalog`, {
      method: 'POST',
      headers: owner.headers,
      body: {
        p_action: 'add',
        p_expected_revision: conflictRevision,
        p_name: name,
      },
    });
    const rows = await apiCall(
      `${apiUrl}/rest/v1/ingredients?select=id,name,account_id&account_id=eq.${owner.id}&limit=1000`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    const id = rows.find(
      (row) =>
        row.account_id === owner.id && row.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )?.id;
    if (!id) throw new Error(`Could not create merge-conflict ingredient ${name}.`);
    conflictIds.push(id);
  }
  const [conflictSourceId, conflictTargetId] = conflictIds;
  const conflictSourceProfileRevision = await apiCall(
    `${apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`,
    {
      method: 'POST',
      headers: owner.headers,
      body: {
        p_action: 'profile_set',
        p_expected_revision: conflictRevision,
        p_ingredient_id: conflictSourceId,
        p_profile: {
          servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
          nutrients: { calories: 100 },
        },
        p_equivalent: null,
      },
    },
  );
  const targetProfileRevision = await apiCall(`${apiUrl}/rest/v1/rpc/manage_ingredient_nutrition`, {
    method: 'POST',
    headers: owner.headers,
    body: {
      p_action: 'profile_set',
      p_expected_revision: conflictSourceProfileRevision,
      p_ingredient_id: conflictTargetId,
      p_profile: {
        servingSize: { amount: 1, dimension: 'volume', unitCode: 'cup' },
        nutrients: { calories: 250 },
      },
      p_equivalent: null,
    },
  });
  const conflictMergeRevision = await apiCall(`${apiUrl}/rest/v1/rpc/manage_ingredient_catalog`, {
    method: 'POST',
    headers: owner.headers,
    body: {
      p_action: 'merge',
      p_expected_revision: targetProfileRevision,
      p_ingredient_id: conflictSourceId,
      p_replacement_id: conflictTargetId,
    },
  });
  const conflictTargetProfilePath = profilePath.replace(
    `eq.${ingredientId}`,
    `eq.${conflictTargetId}`,
  );
  const conflictSourceProfilePath = profilePath.replace(
    `eq.${ingredientId}`,
    `eq.${conflictSourceId}`,
  );
  assert.deepEqual(
    await apiCall(`${apiUrl}${conflictTargetProfilePath}`, { headers: owner.headers }),
    [
      {
        ingredient_id: conflictTargetId,
        serving_size_amount: 1,
        nutrients: { calories: 250 },
      },
    ],
  );
  assert.deepEqual(
    await apiCall(`${apiUrl}${conflictSourceProfilePath}`, { headers: owner.headers }),
    [],
  );
  assert.ok(conflictMergeRevision > targetProfileRevision);
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
  const sourceSupabase = resolve(repositoryRoot, 'supabase');
  const sourceMigrations = join(sourceSupabase, 'migrations');
  const migrations = (await readdir(sourceMigrations))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const targetIndex = migrations.indexOf(migrationName);
  if (targetIndex < 0) throw new Error(`Could not find ${migrationName}.`);

  let config = await readFile(join(sourceSupabase, 'config.toml'), 'utf8');
  const ports = [...config.matchAll(/^\s*(?:port|shadow_port)\s*=\s*(\d+)\s*$/gm)].map((match) =>
    Number(match[1]),
  );
  const offset = await findPortOffset(ports);
  config = config
    .replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${projectId}"`)
    .replace(
      /^(\s*(?:port|shadow_port)\s*=\s*)(\d+)(\s*)$/gm,
      (_line, prefix, port, suffix) => `${prefix}${Number(port) + offset}${suffix}`,
    )
    .replace(/(\[db\.seed\]\s*enabled\s*=\s*)true/, '$1false');

  await mkdir(join(supabaseDirectory, 'migrations'), { recursive: true });
  for (const migration of migrations.slice(0, targetIndex + 1)) {
    await cp(join(sourceMigrations, migration), join(supabaseDirectory, 'migrations', migration));
  }
  await cp(join(sourceSupabase, 'templates'), join(supabaseDirectory, 'templates'), {
    recursive: true,
  });
  await cp(join(sourceSupabase, 'seed.sql'), join(supabaseDirectory, 'seed.sql'));
  await writeFile(join(supabaseDirectory, 'config.toml'), config);
  const localSmtpSection = config
    .split(/^\[/m)
    .find((section) => section.startsWith('local_smtp]'));
  const mailpitPort = Number(localSmtpSection?.match(/^\s*port\s*=\s*(\d+)/m)?.[1]);
  if (!Number.isInteger(mailpitPort)) {
    throw new Error('Could not read the isolated Mailpit port.');
  }
  return `http://127.0.0.1:${mailpitPort}`;
}

try {
  const mailpitUrl = await configureProject();
  supabaseStartAttempted = true;
  runSupabase(['start', '--yes']);
  runSupabase(['migration', 'up']);
  const migrationList = runSupabase(['migration', 'list']);
  assert.match(
    migrationList,
    /20261211000000/u,
    'Makes default-visibility migration should be applied',
  );
  await verifyNutritionRpcAndAccess();
  runBrowserTests(mailpitUrl);
  process.stdout.write(
    'Nutrition migrations and access checks passed in an isolated Supabase project.\n',
  );
} finally {
  if (supabaseStartAttempted) {
    try {
      runSupabase(['stop', '--no-backup']);
    } catch (error) {
      process.stderr.write(`Could not stop the isolated Supabase project: ${String(error)}\n`);
    }
  }
  await rm(temporaryRoot, { recursive: true, force: true });
}
