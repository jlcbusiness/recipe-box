import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

function getLocalSupabaseCredentials() {
  const result = spawnSync('supabase', ['status', '--output', 'env'], {
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Could not read local Supabase credentials: ${result.error?.message ?? result.stderr}`,
    );
  }

  const values = new Map(
    result.stdout.split(/\r?\n/).flatMap((line) => {
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
    throw new Error('Local Supabase credentials are incomplete.');
  }
  return { apiUrl, anonKey, serviceRoleKey };
}

async function request(url, { headers = {}, body, method = 'GET' } = {}) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { response, data };
}

async function createOwner(apiUrl, anonKey) {
  const { response, data } = await request(`${apiUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey },
    body: {
      email: `dlc13-advanced-${randomUUID()}@example.test`,
      password: `Dlc13-${randomUUID()}-42`,
    },
  });
  assert.equal(
    response.status,
    200,
    `Could not create isolated test owner: ${JSON.stringify(data)}`,
  );
  assert.ok(data.user?.id && data.access_token, 'Owner signup must return a user and access token');
  return {
    id: data.user.id,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${data.access_token}`,
    },
  };
}

async function callRpc(apiUrl, owner, name, body) {
  return request(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: owner.headers,
    body,
  });
}

async function createPublication(apiUrl, owner, name) {
  const { response, data } = await callRpc(apiUrl, owner, 'create_publication', {
    p_name: name,
    p_publication_type: 'book',
    p_author: null,
    p_edition: null,
    p_isbn: null,
    p_retailer_url: null,
    p_issue: null,
    p_site_url: null,
    p_tag_ids: [],
  });
  assert.equal(
    response.status,
    200,
    `Could not create publication fixture: ${JSON.stringify(data)}`,
  );
  assert.equal(typeof data, 'string');
  return data;
}

async function createRecipe(
  apiUrl,
  owner,
  { name, publicationId, totalTime, prepTime, serves = null, nutritionOverrides = {} },
) {
  const { response, data } = await callRpc(apiUrl, owner, 'save_recipe_with_nutrition', {
    p_recipe_id: null,
    p_expected_version: null,
    p_name: name,
    p_food_type_id: null,
    p_state: 'want_to_try',
    p_verdict_id: null,
    p_enthusiasm_id: null,
    p_occasion_details: null,
    p_reason: null,
    p_serves: serves,
    p_prep_time_minutes: prepTime,
    p_mixing_time_minutes: null,
    p_marinate_time_minutes: null,
    p_chill_time_minutes: null,
    p_freeze_time_minutes: null,
    p_cook_time_minutes: null,
    p_bake_time_minutes: null,
    p_cooling_time_minutes: null,
    p_rest_time_minutes: null,
    p_total_time_minutes: totalTime,
    p_notes_markdown: '',
    p_meal_type_ids: [],
    p_cuisine_ids: [],
    p_equipment_ids: [],
    p_ingredient_rows: [],
    p_instruction_steps: [],
    p_publication_id: publicationId,
    p_publication_page: null,
    p_recipe_url: null,
    p_recipe_relationships: { pairings: [], references: [] },
    p_tag_ids: [],
    p_ingredient_sets: [{ id: randomUUID(), label: 'Ingredients', position: 0 }],
    p_score: null,
    p_makes_quantity: null,
    p_makes_thing: null,
    p_nutrition_overrides: nutritionOverrides,
  });
  assert.equal(response.status, 200, `Could not create recipe fixture: ${JSON.stringify(data)}`);
  assert.ok(Array.isArray(data) && data[0]?.id, 'Recipe save must return an ID');
  return data[0];
}

async function deleteOwner(apiUrl, serviceRoleKey, ownerId) {
  const { response, data } = await request(`${apiUrl}/auth/v1/admin/users/${ownerId}`, {
    method: 'DELETE',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  assert.ok(
    response.ok || response.status === 404,
    `Could not clean test owner ${ownerId}: ${JSON.stringify(data)}`,
  );
}

function makeRule(field, operator, value, valueTo) {
  return {
    id: randomUUID(),
    field,
    operator,
    ...(value === undefined ? {} : { value }),
    ...(valueTo === undefined ? {} : { value_to: valueTo }),
  };
}

function makeFilter(field, operator, value, valueTo) {
  return {
    field,
    operator,
    ...(value === undefined ? {} : { value }),
    ...(valueTo === undefined ? {} : { value_to: valueTo }),
  };
}

function advancedFilter(text, rules) {
  return {
    field: 'advanced_rules',
    operator: 'matches',
    value: JSON.stringify({ version: 1, text, rules }),
  };
}

async function search(
  apiUrl,
  owner,
  {
    query = 'DLC13',
    filters = [],
    text,
    rules,
    limit = 100,
    offset = 0,
    publicationId = null,
  } = {},
) {
  return callRpc(apiUrl, owner, 'search_recipes', {
    p_query: query,
    p_limit: limit,
    p_offset: offset,
    p_filters: [...filters, ...(text === undefined ? [] : [advancedFilter(text, rules)])],
    p_sort_key: 'name',
    p_sort_direction: 'asc',
    p_publication_id: publicationId,
  });
}

async function expectInvalidSearch(apiUrl, owner, filters, label) {
  const { response, data } = await search(apiUrl, owner, {
    query: `definitely-no-match-${randomUUID()}`,
    filters,
  });
  assert.ok(!response.ok, `${label} must be rejected even when the query matches no recipes`);
  assert.ok(
    data?.message || data?.hint || data?.details,
    `${label} must return an explicit database validation error`,
  );
}

function ruleRefs(...rules) {
  return rules.map((rule) => ({ ...rule, id: randomUUID() }));
}

function recipeNames(rows) {
  return rows.map(({ recipe_name: name }) => name).sort();
}

function runExplain(owner, publicationId, filters) {
  const command = spawnSync(
    'supabase',
    [
      'db',
      'query',
      '--local',
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       WITH auth_context AS MATERIALIZED (
         SELECT set_config('request.jwt.claim.sub', '${owner.id}', true)
       )
       SELECT result.*
       FROM auth_context
       CROSS JOIN LATERAL public.search_recipes(
         'Benchmark Plan',
         100,
         0,
         '${JSON.stringify(filters).replaceAll("'", "''")}'::jsonb,
         'name',
         'asc',
         '${publicationId}'::uuid
       ) AS result`,
      '--output',
      'json',
    ],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  if (command.error || command.status !== 0) {
    throw new Error(
      `Could not explain benchmark search: ${command.error?.message ?? command.stderr}`,
    );
  }
  const outputStart = command.stdout.indexOf('{');
  const output = JSON.parse(command.stdout.slice(outputStart));
  const rawPlan = output.rows?.[0]?.['QUERY PLAN'];
  const planData = typeof rawPlan === 'string' ? JSON.parse(rawPlan) : rawPlan;
  const root = Array.isArray(planData) ? planData[0] : planData;
  const plan = root?.Plan;
  assert.ok(plan, `EXPLAIN did not return a plan: ${command.stdout}`);
  const nodes = [];
  function collectNodes(node) {
    nodes.push(node);
    for (const child of node.Plans ?? []) collectNodes(child);
  }
  collectNodes(plan);
  return {
    planningMs: root['Planning Time'],
    executionMs: root['Execution Time'],
    functionNodes: nodes
      .filter(({ 'Node Type': nodeType }) => nodeType === 'Function Scan')
      .map((node) => ({
        function: node['Function Name'],
        actualRows: node['Actual Rows'],
        actualLoops: node['Actual Loops'],
        actualTotalTimeMs: node['Actual Total Time'],
        sharedHitBlocks: node['Shared Hit Blocks'] ?? 0,
        sharedReadBlocks: node['Shared Read Blocks'] ?? 0,
      })),
    nodeTypes: nodes.map(({ 'Node Type': nodeType }) => nodeType),
  };
}

async function verifyAdvancedRules() {
  const { apiUrl, anonKey, serviceRoleKey } = getLocalSupabaseCredentials();
  const owner = await createOwner(apiUrl, anonKey);
  const otherOwner = await createOwner(apiUrl, anonKey);

  try {
    const publications = await request(
      `${apiUrl}/rest/v1/publications?select=id,name&order=name.asc`,
      { headers: owner.headers },
    );
    assert.equal(publications.response.status, 200);
    assert.ok(publications.data.length > 0, 'Signup must create the owner’s default publication');
    const ownerPublicationId = publications.data[0].id;
    const otherPublicationResponse = await request(`${apiUrl}/rest/v1/publications?select=id`, {
      headers: otherOwner.headers,
    });
    assert.equal(otherPublicationResponse.response.status, 200);
    const otherPublicationId = otherPublicationResponse.data[0].id;
    const secondPublicationId = await createPublication(
      apiUrl,
      owner,
      `DLC13 secondary ${randomUUID()}`,
    );

    const fixtures = new Map();
    for (const recipe of [
      { name: 'DLC13 Alpha', totalTime: 10, prepTime: 5 },
      { name: 'DLC13 Beta', totalTime: 20, prepTime: 10 },
      { name: 'DLC13 Gamma', totalTime: null, prepTime: null },
      { name: 'DLC13 Delta', totalTime: 40, prepTime: 20 },
    ]) {
      fixtures.set(
        recipe.name,
        await createRecipe(apiUrl, owner, { ...recipe, publicationId: ownerPublicationId }),
      );
    }
    fixtures.set(
      'DLC13 Side publication',
      await createRecipe(apiUrl, owner, {
        name: 'DLC13 Side publication',
        publicationId: secondPublicationId,
        totalTime: 60,
        prepTime: 30,
      }),
    );
    const trashedFixture = await createRecipe(apiUrl, owner, {
      name: 'DLC13 Trashed',
      publicationId: ownerPublicationId,
      totalTime: 25,
      prepTime: 15,
    });
    const trashed = await callRpc(apiUrl, owner, 'trash_recipe', {
      p_recipe_id: trashedFixture.id,
      p_expected_version: trashedFixture.version,
    });
    assert.equal(trashed.response.status, 200, JSON.stringify(trashed.data));
    await createRecipe(apiUrl, otherOwner, {
      name: 'DLC13 Foreign owner',
      publicationId: otherPublicationId,
      totalTime: 60,
      prepTime: 30,
    });

    const benchmarkFixtureCount = 110;
    for (let index = 0; index < benchmarkFixtureCount; index += 1) {
      await createRecipe(apiUrl, owner, {
        name: `Benchmark Plan ${String(index + 1).padStart(3, '0')}`,
        publicationId: ownerPublicationId,
        totalTime: 30 + (index % 60),
        prepTime: 10 + (index % 20),
        serves: 1,
        nutritionOverrides: { calories: 120 },
      });
    }

    const primaryRules = ruleRefs(
      makeRule('name', 'equals', 'DLC13 Alpha'),
      makeRule('total_time_minutes', 'at_least', 20),
      makeRule('name', 'equals', 'DLC13 Beta'),
    );
    const expectedPrimaryNames = ['DLC13 Alpha', 'DLC13 Delta', 'DLC13 Gamma'];
    const primary = await search(apiUrl, owner, {
      text: '(1 AND 2) OR NOT 3',
      rules: primaryRules,
      publicationId: ownerPublicationId,
    });
    assert.equal(primary.response.status, 200, JSON.stringify(primary.data));
    assert.deepEqual(recipeNames(primary.data), expectedPrimaryNames);

    const notNullNumeric = await search(apiUrl, owner, {
      text: 'NOT 1',
      rules: [makeRule('total_time_minutes', 'at_least', 20)],
      publicationId: ownerPublicationId,
    });
    assert.equal(notNullNumeric.response.status, 200, JSON.stringify(notNullNumeric.data));
    assert.deepEqual(recipeNames(notNullNumeric.data), ['DLC13 Alpha', 'DLC13 Gamma']);

    const precedenceRules = ruleRefs(
      makeRule('name', 'equals', 'DLC13 Alpha'),
      makeRule('name', 'equals', 'DLC13 Beta'),
      makeRule('total_time_minutes', 'at_least', 20),
    );
    const precedence = await search(apiUrl, owner, {
      text: '1 OR 2 AND 3',
      rules: precedenceRules,
      publicationId: ownerPublicationId,
    });
    assert.equal(precedence.response.status, 200, JSON.stringify(precedence.data));
    assert.deepEqual(recipeNames(precedence.data), ['DLC13 Alpha', 'DLC13 Beta']);
    const grouped = await search(apiUrl, owner, {
      text: '(1 OR 2) AND 3',
      rules: precedenceRules,
      publicationId: ownerPublicationId,
    });
    assert.equal(grouped.response.status, 200, JSON.stringify(grouped.data));
    assert.deepEqual(recipeNames(grouped.data), ['DLC13 Beta']);

    const andAliasRules = ruleRefs(
      makeRule('total_time_minutes', 'at_least', 20),
      makeRule('name', 'equals', 'DLC13 Beta'),
    );
    const orAliasRules = ruleRefs(
      makeRule('name', 'equals', 'DLC13 Alpha'),
      makeRule('total_time_minutes', 'at_least', 20),
    );
    const notAliasRules = ruleRefs(
      makeRule('total_time_minutes', 'at_least', 20),
      makeRule('name', 'equals', 'DLC13 Beta'),
    );
    for (const [text, expected, rules] of [
      ['1 & 2', ['DLC13 Beta'], andAliasRules],
      ['1 && 2', ['DLC13 Beta'], andAliasRules],
      ['1 -and 2', ['DLC13 Beta'], andAliasRules],
      ['1 aNd 2', ['DLC13 Beta'], andAliasRules],
      ['1 | 2', ['DLC13 Alpha', 'DLC13 Beta', 'DLC13 Delta'], orAliasRules],
      ['1 || 2', ['DLC13 Alpha', 'DLC13 Beta', 'DLC13 Delta'], orAliasRules],
      ['1 -or 2', ['DLC13 Alpha', 'DLC13 Beta', 'DLC13 Delta'], orAliasRules],
      ['-not 2 -and 1', ['DLC13 Delta'], notAliasRules],
      ['! 2 && 1', ['DLC13 Delta'], notAliasRules],
    ]) {
      const result = await search(apiUrl, owner, {
        text,
        rules,
        publicationId: ownerPublicationId,
      });
      assert.equal(result.response.status, 200, `${text}: ${JSON.stringify(result.data)}`);
      assert.deepEqual(recipeNames(result.data), expected, `Unexpected alias result for ${text}`);
    }

    const repeatedRule = makeRule('name', 'equals', 'DLC13 Alpha');
    const repeated = await search(apiUrl, owner, {
      text: '1 OR 1',
      rules: [repeatedRule],
      publicationId: ownerPublicationId,
    });
    assert.equal(repeated.response.status, 200, JSON.stringify(repeated.data));
    assert.deepEqual(recipeNames(repeated.data), ['DLC13 Alpha']);

    const externalFilter = await search(apiUrl, owner, {
      filters: [makeFilter('name', 'contains', 'Alpha')],
      text: '1 OR 2',
      rules: ruleRefs(
        makeRule('name', 'contains', 'DLC13'),
        makeRule('total_time_minutes', 'at_least', 20),
      ),
      publicationId: ownerPublicationId,
    });
    assert.equal(externalFilter.response.status, 200, JSON.stringify(externalFilter.data));
    assert.deepEqual(recipeNames(externalFilter.data), ['DLC13 Alpha']);

    const externalColumnFilter = await search(apiUrl, owner, {
      filters: [makeFilter('column_prep_time_minutes', 'in', ['10'])],
      text: '1 OR 2',
      rules: ruleRefs(
        makeRule('name', 'contains', 'DLC13'),
        makeRule('total_time_minutes', 'at_least', 20),
      ),
      publicationId: ownerPublicationId,
    });
    assert.equal(
      externalColumnFilter.response.status,
      200,
      JSON.stringify(externalColumnFilter.data),
    );
    assert.deepEqual(recipeNames(externalColumnFilter.data), ['DLC13 Beta']);

    const pagedFirst = await search(apiUrl, owner, {
      text: '1',
      rules: [makeRule('total_time_minutes', 'at_least', 20)],
      publicationId: ownerPublicationId,
      limit: 1,
      offset: 0,
    });
    const pagedSecond = await search(apiUrl, owner, {
      text: '1',
      rules: [makeRule('total_time_minutes', 'at_least', 20)],
      publicationId: ownerPublicationId,
      limit: 1,
      offset: 1,
    });
    assert.equal(pagedFirst.response.status, 200, JSON.stringify(pagedFirst.data));
    assert.equal(pagedSecond.response.status, 200, JSON.stringify(pagedSecond.data));
    assert.equal(pagedFirst.data[0].total_count, 2);
    assert.equal(pagedSecond.data[0].total_count, 2);
    assert.notEqual(pagedFirst.data[0].recipe_id, pagedSecond.data[0].recipe_id);

    const fixedPublication = await search(apiUrl, owner, {
      text: 'NOT 1',
      rules: [makeRule('name', 'contains', 'not present')],
      publicationId: ownerPublicationId,
    });
    assert.equal(fixedPublication.response.status, 200, JSON.stringify(fixedPublication.data));
    assert.equal(fixedPublication.data.length, 4);
    assert.ok(
      fixedPublication.data.every(({ recipe_name: name }) => name !== 'DLC13 Side publication'),
      'A fixed publication must remain outside the expression',
    );

    const foreignValue = await search(apiUrl, owner, {
      text: 'NOT 1',
      rules: [makeRule('publication_id', 'in', [otherPublicationId])],
      publicationId: ownerPublicationId,
    });
    assert.equal(foreignValue.response.status, 200, JSON.stringify(foreignValue.data));
    assert.equal(foreignValue.data.length, 4);
    assert.ok(
      foreignValue.data.every(({ recipe_name: name }) => name !== 'DLC13 Foreign owner'),
      'A foreign publication UUID must not cross the owner boundary',
    );

    const ownerScoped = await search(apiUrl, owner, {
      text: 'NOT 1',
      rules: [makeRule('name', 'contains', 'not present')],
    });
    assert.equal(ownerScoped.response.status, 200, JSON.stringify(ownerScoped.data));
    assert.ok(
      ownerScoped.data.every(({ recipe_name: name }) => name !== 'DLC13 Foreign owner'),
      'Search results must remain scoped to the authenticated owner',
    );

    const facetResponse = await callRpc(apiUrl, owner, 'recipe_search_column_facet_values', {
      p_query: 'DLC13',
      p_filters: [advancedFilter('1', [makeRule('name', 'contains', 'DLC13')])],
      p_column_keys: ['prep_time_minutes'],
      p_publication_id: ownerPublicationId,
    });
    assert.equal(facetResponse.response.status, 200, JSON.stringify(facetResponse.data));
    assert.deepEqual(
      facetResponse.data.map(({ facet_value, recipe_count }) => [facet_value, recipe_count]),
      [
        ['__blank__', 1],
        ['10', 1],
        ['20', 1],
        ['5', 1],
      ],
      'Facet aggregation must apply the expression as one complete predicate',
    );

    const validStateFilter = advancedFilter('(1 AND 2) OR NOT 3', primaryRules);
    const savedState = await callRpc(apiUrl, owner, 'update_explorer_state', {
      p_context_key: 'recipes-find',
      p_state: {
        schema_version: 1,
        filters: [validStateFilter],
        sort: 'name',
        direction: 'asc',
        view: 'list',
      },
    });
    assert.equal(savedState.response.status, 204, JSON.stringify(savedState.data));
    const persistedState = await request(
      `${apiUrl}/rest/v1/explorer_state?select=state&account_id=eq.${owner.id}&context_key=eq.recipes-find`,
      { headers: owner.headers },
    );
    assert.equal(persistedState.response.status, 200);
    assert.deepEqual(persistedState.data[0]?.state.filters, [validStateFilter]);

    const publicationState = await callRpc(apiUrl, owner, 'update_explorer_state', {
      p_context_key: 'publications',
      p_state: {
        schema_version: 1,
        filters: [validStateFilter],
        sort: 'name',
        direction: 'asc',
        view: 'list',
      },
    });
    assert.ok(!publicationState.response.ok, 'Advanced rules are only valid for recipes-find');

    const tenRules = Array.from({ length: 10 }, () =>
      makeRule('name', 'equals', 'a non-matching value'),
    );
    const tenRuleSearch = await search(apiUrl, owner, {
      query: 'nothing-matches-this',
      text: Array.from({ length: 10 }, (_, index) => String(index + 1)).join(' OR '),
      rules: tenRules,
      publicationId: ownerPublicationId,
    });
    assert.equal(tenRuleSearch.response.status, 200, JSON.stringify(tenRuleSearch.data));
    assert.deepEqual(tenRuleSearch.data, []);

    const outerFilterLimit = await search(apiUrl, owner, {
      filters: Array.from({ length: 9 }, () => makeFilter('name', 'contains', 'does not match')),
      query: 'nothing-matches-this',
      text: '1',
      rules: [makeRule('name', 'contains', 'also does not match')],
    });
    assert.equal(outerFilterLimit.response.status, 200, JSON.stringify(outerFilterLimit.data));
    const outerFilterOverflow = await search(apiUrl, owner, {
      filters: Array.from({ length: 10 }, () => makeFilter('name', 'contains', 'does not match')),
      query: 'nothing-matches-this',
      text: '1',
      rules: [makeRule('name', 'contains', 'also does not match')],
    });
    assert.ok(!outerFilterOverflow.response.ok, 'The existing 10 outer-filter limit must remain');

    const exactText = `1${' '.repeat(1023)}`;
    const exactTextSearch = await search(apiUrl, owner, {
      text: exactText,
      rules: [makeRule('name', 'equals', 'DLC13 Alpha')],
      publicationId: ownerPublicationId,
    });
    assert.equal(exactTextSearch.response.status, 200, JSON.stringify(exactTextSearch.data));
    assert.deepEqual(recipeNames(exactTextSearch.data), ['DLC13 Alpha']);

    const exactTokenProgram = `${'NOT '.repeat(255)}1`;
    assert.equal(exactTokenProgram.trim().split(/\s+/).length, 256);
    const exactTokenSearch = await search(apiUrl, owner, {
      query: 'nothing-matches-this',
      text: exactTokenProgram,
      rules: [makeRule('name', 'equals', 'DLC13 Alpha')],
      publicationId: ownerPublicationId,
    });
    assert.equal(exactTokenSearch.response.status, 200, JSON.stringify(exactTokenSearch.data));
    assert.deepEqual(exactTokenSearch.data, []);

    const maxEnvelopeRule = makeRule('name', 'contains', '');
    const envelopeShape = {
      version: 1,
      text: '1',
      rules: [maxEnvelopeRule],
    };
    const envelopeBaseBytes = Buffer.byteLength(JSON.stringify(envelopeShape));
    const paddingBytes = 65536 - envelopeBaseBytes;
    maxEnvelopeRule.value =
      'é'.repeat(Math.floor(paddingBytes / 2)) + (paddingBytes % 2 === 1 ? 'x' : '');
    const exactEnvelope = advancedFilter('1', [maxEnvelopeRule]);
    assert.equal(Buffer.byteLength(exactEnvelope.value), 65536);
    assert.ok(
      exactEnvelope.value.length < 65536,
      'Unicode envelope must reach the boundary by UTF-8 bytes, not JS characters',
    );
    const exactEnvelopeSearch = await search(apiUrl, owner, {
      query: 'nothing-matches-this',
      filters: [exactEnvelope],
      publicationId: ownerPublicationId,
    });
    assert.equal(
      exactEnvelopeSearch.response.status,
      200,
      JSON.stringify(exactEnvelopeSearch.data),
    );
    assert.deepEqual(exactEnvelopeSearch.data, []);

    const exactNesting = await search(apiUrl, owner, {
      text: `${'('.repeat(16)}1${')'.repeat(16)}`,
      rules: [makeRule('name', 'equals', 'DLC13 Alpha')],
      publicationId: ownerPublicationId,
    });
    assert.equal(exactNesting.response.status, 200, JSON.stringify(exactNesting.data));
    assert.deepEqual(recipeNames(exactNesting.data), ['DLC13 Alpha']);

    await expectInvalidSearch(
      apiUrl,
      owner,
      [
        advancedFilter(
          '1',
          Array.from({ length: 11 }, () => makeRule('name', 'equals', 'x')),
        ),
      ],
      'More than 10 rules',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter('1', [makeRule('name', 'equals', 'x'), makeRule('name', 'equals', 'y')])],
      'Unused rules',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter('2', [makeRule('name', 'equals', 'x')])],
      'Out-of-range rule references',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter('1 1', [makeRule('name', 'equals', 'x')])],
      'Implicit operators',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter('1 AND', [makeRule('name', 'equals', 'x')])],
      'Dangling operators',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter('   ', [makeRule('name', 'equals', 'x')])],
      'Blank text',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter(`1${' '.repeat(1024)}`, [makeRule('name', 'equals', 'x')])],
      'Text longer than 1024 characters',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter(`${'NOT '.repeat(256)}1`, [makeRule('name', 'equals', 'x')])],
      'More than 256 tokens',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter(`${'('.repeat(17)}1${')'.repeat(17)}`, [makeRule('name', 'equals', 'x')])],
      'Nesting deeper than 16',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter('1', [makeRule('unsupported_field', 'equals', 'x')])],
      'Unsupported leaf fields',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter('1', [makeRule('name', 'not_equals', 'x')])],
      'Unsupported text operators',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter('1', [makeRule('name', 'contains')])],
      'Missing leaf values',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [advancedFilter('1', [makeRule('total_time_minutes', 'between', 10)])],
      'Missing range upper values',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [
        advancedFilter('1', [
          makeRule(
            'advanced_rules',
            'matches',
            JSON.stringify({ version: 1, text: '1', rules: [] }),
          ),
        ]),
      ],
      'Nested advanced envelopes',
    );
    await expectInvalidSearch(
      apiUrl,
      owner,
      [
        advancedFilter('1', [makeRule('name', 'equals', 'x')]),
        advancedFilter('1', [makeRule('name', 'equals', 'x')]),
      ],
      'Multiple advanced envelopes',
    );

    const overlengthText = await search(apiUrl, owner, {
      text: `1${' '.repeat(1024)}`,
      rules: [makeRule('name', 'equals', 'DLC13 Alpha')],
      publicationId: ownerPublicationId,
    });
    assert.ok(!overlengthText.response.ok, 'Text length 1025 must be rejected');
    const overTokenProgram = `${'NOT '.repeat(256)}1`;
    assert.equal(overTokenProgram.trim().split(/\s+/).length, 257);
    const overTokenSearch = await search(apiUrl, owner, {
      text: overTokenProgram,
      rules: [makeRule('name', 'equals', 'DLC13 Alpha')],
      publicationId: ownerPublicationId,
    });
    assert.ok(!overTokenSearch.response.ok, 'Token count 257 must be rejected');
    const overEnvelope = {
      ...exactEnvelope,
      value: `${exactEnvelope.value} `,
    };
    const overEnvelopeSearch = await search(apiUrl, owner, {
      query: 'nothing-matches-this',
      filters: [overEnvelope],
      publicationId: ownerPublicationId,
    });
    assert.ok(!overEnvelopeSearch.response.ok, 'Advanced-rule value length 65537 must be rejected');

    const benchmarkPage = await search(apiUrl, owner, {
      query: 'Benchmark Plan',
      text: '1',
      rules: [makeRule('name', 'contains', 'Benchmark Plan')],
      publicationId: ownerPublicationId,
      limit: 100,
      offset: 0,
    });
    assert.equal(benchmarkPage.response.status, 200, JSON.stringify(benchmarkPage.data));
    assert.equal(benchmarkPage.data.length, 100);
    assert.equal(benchmarkPage.data[0].total_count, benchmarkFixtureCount);
    const benchmarkRemainder = await search(apiUrl, owner, {
      query: 'Benchmark Plan',
      text: '1',
      rules: [makeRule('name', 'contains', 'Benchmark Plan')],
      publicationId: ownerPublicationId,
      limit: 100,
      offset: 100,
    });
    assert.equal(benchmarkRemainder.response.status, 200, JSON.stringify(benchmarkRemainder.data));
    assert.equal(benchmarkRemainder.data.length, 10);
    assert.equal(benchmarkRemainder.data[0].total_count, benchmarkFixtureCount);

    const benchmarkOrNotFilter = advancedFilter('1 OR 2 AND NOT 3', [
      makeRule('name', 'contains', 'Benchmark Plan'),
      makeRule('prep_time_minutes', 'at_least', 10),
      makeRule('total_time_minutes', 'less_than', 0),
    ]);
    const benchmarkNutritionFilter = advancedFilter('1', [makeRule('calories', 'at_least', 100)]);
    const nutritionPage = await search(apiUrl, owner, {
      query: 'Benchmark Plan',
      filters: [benchmarkNutritionFilter],
      publicationId: ownerPublicationId,
      limit: 100,
    });
    assert.equal(nutritionPage.response.status, 200, JSON.stringify(nutritionPage.data));
    assert.equal(nutritionPage.data.length, 100);
    assert.equal(nutritionPage.data[0].total_count, benchmarkFixtureCount);

    const orNotPlan = runExplain(owner, ownerPublicationId, [benchmarkOrNotFilter]);
    const nutritionPlan = runExplain(owner, ownerPublicationId, [benchmarkNutritionFilter]);
    assert.ok(orNotPlan.executionMs >= 0);
    assert.ok(nutritionPlan.executionMs >= 0);
    console.log(
      `EXPLAIN ANALYZE (${benchmarkFixtureCount} recipes): OR/NOT ${JSON.stringify(orNotPlan)}; nutrition ${JSON.stringify(nutritionPlan)}`,
    );

    const invalidState = await callRpc(apiUrl, owner, 'update_explorer_state', {
      p_context_key: 'recipes-find',
      p_state: {
        schema_version: 1,
        filters: [advancedFilter('1', [{ ...makeRule('name', 'equals', 'x'), id: 'not-a-uuid' }])],
        sort: 'name',
        direction: 'asc',
        view: 'list',
      },
    });
    assert.ok(!invalidState.response.ok, 'Explorer state must validate UUID rule IDs');
  } finally {
    await deleteOwner(apiUrl, serviceRoleKey, owner.id);
    await deleteOwner(apiUrl, serviceRoleKey, otherOwner.id);
  }
}

await verifyAdvancedRules();
console.log('DLC13 advanced-rule database acceptance checks passed.');
