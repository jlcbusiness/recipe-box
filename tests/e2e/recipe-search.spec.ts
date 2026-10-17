import { randomUUID } from 'node:crypto';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { captureScreenshot } from '../support/capture-screenshot';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function selectFilterOption(page: Page, row: Locator, label: string, option: string) {
  await row.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function selectFilterValue(page: Page, row: Locator, value: string) {
  await row.getByRole('button', { name: /^Value:/ }).click();
  await page
    .getByRole('group', { name: 'Value options' })
    .getByRole('button', { name: value, exact: true })
    .click();
  await page.keyboard.press('Escape');
}

async function createContractRecipe(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  anonKey: string,
  accessToken: string,
  recipe: {
    name: string;
    state: 'want_to_try' | 'tried';
    totalTime: number | null;
    notes: string;
    ingredients?: string[];
  },
): Promise<string> {
  const response = await request.post(`${apiUrl}/rest/v1/rpc/save_recipe`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
    data: {
      p_recipe_id: null,
      p_expected_version: null,
      p_name: recipe.name,
      p_food_type_id: null,
      p_state: recipe.state,
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
      p_total_time_minutes: recipe.totalTime,
      p_notes_markdown: recipe.notes,
      p_meal_type_ids: [],
      p_cuisine_ids: [],
      p_equipment_ids: [],
      p_ingredient_rows: (recipe.ingredients ?? []).map((ingredientName) => ({
        recipe_ingredient_id: randomUUID(),
        ingredient_id: null,
        ingredient_name: ingredientName,
        is_main: false,
        detail: '',
        preparation: '',
        measurements: [],
      })),
      p_instruction_steps: [],
    },
  });
  const responseBody = await response.text();
  expect(response.ok(), responseBody).toBeTruthy();
  const [createdRecipe] = JSON.parse(responseBody) as { id: string; version: number }[];
  return createdRecipe.id;
}

async function setContractRecipePrivate(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  anonKey: string,
  accessToken: string,
  recipeId: string,
) {
  const headers = { apikey: anonKey, Authorization: `Bearer ${accessToken}` };
  const recipeResponse = await request.get(
    `${apiUrl}/rest/v1/recipes?select=version&id=eq.${recipeId}`,
    { headers },
  );
  const recipeResponseBody = await recipeResponse.text();
  expect(recipeResponse.ok(), recipeResponseBody).toBeTruthy();
  const [{ version }] = JSON.parse(recipeResponseBody) as { version: number }[];
  const privacyResponse = await request.post(`${apiUrl}/rest/v1/rpc/set_recipe_privacy`, {
    headers,
    data: { p_recipe_id: recipeId, p_expected_version: version, p_is_private: true },
  });
  expect(privacyResponse.ok(), await privacyResponse.text()).toBeTruthy();
}

test('Find Recipes exposes and filters recipe visibility @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const linkableRecipeName = 'Linkable visibility filter recipe';
    const privateRecipeName = 'Private visibility filter recipe';
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: linkableRecipeName,
      state: 'want_to_try',
      totalTime: null,
      notes: '',
    });
    const privateRecipeId = await createContractRecipe(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      { name: privateRecipeName, state: 'want_to_try', totalTime: null, notes: '' },
    );
    await setContractRecipePrivate(
      request,
      config.apiUrl,
      config.anonKey,
      user.accessToken,
      privateRecipeId,
    );

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

    await page.goto('/recipes/find?column_visibility=private&sort=name&direction=asc&view=details');
    await expect(page.getByText('1 recipe found')).toBeVisible();
    const privateRow = page
      .locator('.find-recipes-list tbody tr')
      .filter({ has: page.getByRole('link', { name: privateRecipeName }) });
    await expect(privateRow.locator('[data-explorer-column="visibility"]')).toHaveText('Private');
    await expect(
      page.getByRole('link', { name: linkableRecipeName, exact: true }),
    ).toHaveCount(0);

    await page.goto('/recipes/find?tab=query&sort=name&direction=asc&view=details');
    await page.getByRole('button', { name: 'Add rule' }).click();
    const visibilityRule = page.locator('.recipe-filter-row').first();
    await selectFilterOption(page, visibilityRule, 'Field', 'Visibility');
    await selectFilterValue(page, visibilityRule, 'Linkable');
    await visibilityRule.getByRole('button', { name: 'Value: Linkable' }).press('Enter');
    await expect(page.getByText('1 recipe found')).toBeVisible();
    const linkableRow = page
      .locator('.find-recipes-list tbody tr')
      .filter({ has: page.getByRole('link', { name: linkableRecipeName }) });
    await expect(linkableRow.locator('[data-explorer-column="visibility"]')).toHaveText(
      'Linkable',
    );
    await expect(
      page.getByRole('link', { name: privateRecipeName, exact: true }),
    ).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes updates mobile metadata when columns are toggled @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: 'Mobile column visibility recipe',
      state: 'want_to_try',
      totalTime: 20,
      notes: '',
    });

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/recipes/find?sort=name&direction=asc&page=1&view=details');

    const recipeRow = page
      .locator('.find-recipes-list tbody tr')
      .filter({ has: page.getByRole('link', { name: 'Mobile column visibility recipe' }) });
    const metadata = recipeRow.locator('.find-recipes-mobile-metadata');
    const stateSegment = metadata.locator('[data-explorer-column="state"]');
    const stateOption = page.getByRole('checkbox', { name: 'State', exact: true });
    const totalTimeOption = page.getByRole('checkbox', { name: 'Total Time', exact: true });
    const columnsButton = page.getByRole('button', { name: 'Choose List columns' });

    await columnsButton.click();
    await stateOption.check();
    await totalTimeOption.check();
    await expect(stateSegment).toBeVisible();
    await expect
      .poll(() => metadata.evaluate((element) => (element as HTMLElement).innerText))
      .toBe('Recipe Tin ~ Want to try ~ 20 min');
    await stateOption.uncheck();
    await expect(stateSegment).toBeHidden();
    await expect
      .poll(() => metadata.evaluate((element) => (element as HTMLElement).innerText))
      .toBe('Recipe Tin ~ 20 min');
    await stateOption.check();
    await expect(stateSegment).toBeVisible();
    await expect
      .poll(() => metadata.evaluate((element) => (element as HTMLElement).innerText))
      .toBe('Recipe Tin ~ Want to try ~ 20 min');
    await columnsButton.click();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('List column preferences do not change recipe Grid cards @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: 'Grid preference isolation recipe',
      state: 'tried',
      totalTime: 20,
      notes: '',
    });

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/recipes/find?view=details');

    const nameResizeHandle = page.locator(
      '.find-recipes-list [data-explorer-resize-column="name"]',
    );
    await expect(nameResizeHandle).toBeVisible();
    await expect(nameResizeHandle).toHaveAttribute('aria-hidden', 'true');
    expect(await nameResizeHandle.evaluate((element) => (element as HTMLElement).tabIndex)).toBe(
      -1,
    );

    const cards = page.locator('.find-recipes-grid li');
    const metadata = cards.locator('.find-recipes-grid-metadata');
    await page.getByRole('button', { name: 'Switch to List view' }).click();
    await page.getByRole('button', { name: 'Switch to Grid view' }).click();
    await expect(cards).toHaveCount(1);
    await expect(metadata).toHaveText('Recipe Tin ~ Tried ~ 20 min');
    await expect(metadata).toHaveCSS('color', 'rgb(36, 40, 32)');

    await page.getByRole('button', { name: 'Switch to Details view' }).click();
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await page.getByRole('checkbox', { name: 'Publication', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'State', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Total Time', exact: true }).uncheck();
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      'name',
    );

    await page.getByRole('button', { name: 'Switch to List view' }).click();
    await page.getByRole('button', { name: 'Switch to Grid view' }).click();
    await expect(cards).toHaveCount(1);
    await expect(metadata).toHaveText('Recipe Tin ~ Tried ~ 20 min');

    const tinResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id&publication_type=eq.collection`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    );
    expect(tinResponse.ok(), await tinResponse.text()).toBeTruthy();
    const [{ id: tinId }] = (await tinResponse.json()) as { id: string }[];
    await page.goto(`/publications/${tinId}?view=grid`);
    const tinMetadata = page.locator('.find-recipes-grid-metadata').first();
    await expect(tinMetadata).toHaveText('Tried ~ 20 min');
    await expect(tinMetadata).toHaveCSS('color', 'rgb(40, 36, 32)');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes searches indexed sources and isolates accounts @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const otherUser = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const publicationResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: {
          p_name: 'Search Source Magazine',
          p_publication_type: 'magazine',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: null,
        },
      },
    );
    expect(publicationResponse.ok(), await publicationResponse.text()).toBeTruthy();
    const publicationId = (await publicationResponse.json()) as string;

    const recipeResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/save_recipe_with_relationships`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: {
          p_recipe_id: null,
          p_expected_version: null,
          p_name: 'Searchable saffron rice',
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
          p_total_time_minutes: 20,
          p_notes_markdown: 'A distinctive cardamom notesearch marker.',
          p_meal_type_ids: [],
          p_cuisine_ids: [],
          p_equipment_ids: [],
          p_ingredient_rows: [
            {
              recipe_ingredient_id: randomUUID(),
              ingredient_id: null,
              ingredient_name: 'Searchable coriander ingredient',
              is_main: true,
              detail: 'toasted source marker',
              preparation: '',
              measurements: [],
            },
          ],
          p_instruction_steps: [
            {
              id: randomUUID(),
              position: 0,
              content_markdown: 'Fold the toasted spice into the rice.',
              plain_text: 'Fold in the saffroninstruction marker.',
            },
          ],
          p_publication_id: publicationId,
          p_publication_page: '42',
          p_recipe_url: null,
          p_recipe_relationships: {
            site_listing: null,
            pairings: [],
            references: [
              {
                id: randomUUID(),
                reference_type: 'printed_citation',
                display_text: 'The Saffron Kitchen, page 42',
                linked_recipe_id: null,
                publication_id: null,
                url: null,
              },
            ],
          },
          p_tag_ids: [],
        },
      },
    );
    expect(recipeResponse.ok(), await recipeResponse.text()).toBeTruthy();

    const secondRecipeResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/save_recipe_with_relationships`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: {
          p_recipe_id: null,
          p_expected_version: null,
          p_name: 'Apricot roast with a very long title that wraps on a narrow screen',
          p_food_type_id: null,
          p_state: 'tried',
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
          p_recipe_url: 'https://source.example.test/apricot-roast',
          p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
          p_tag_ids: [],
        },
      },
    );
    expect(secondRecipeResponse.ok(), await secondRecipeResponse.text()).toBeTruthy();

    for (const query of ['coriander ingredient', 'saffroninstruction marker']) {
      const searchResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: { p_query: query, p_limit: 50, p_offset: 0 },
      });
      expect(searchResponse.ok(), await searchResponse.text()).toBeTruthy();
      const searchResults = (await searchResponse.json()) as { recipe_name: string }[];
      expect(searchResults.map(({ recipe_name }) => recipe_name)).toContain(
        'Searchable saffron rice',
      );
    }

    const ingredientOptionsResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id,name`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
      },
    );
    expect(ingredientOptionsResponse.ok(), await ingredientOptionsResponse.text()).toBeTruthy();
    const ingredientOptions = (await ingredientOptionsResponse.json()) as {
      id: string;
      name: string;
    }[];
    expect(
      ingredientOptions.map(({ name }) => name),
      'Authenticated ingredient catalog response',
    ).toContain('Searchable Coriander Ingredient');
    const ingredientId = ingredientOptions.find(
      ({ name }) => name.toLowerCase() === 'searchable coriander ingredient',
    )?.id;
    expect(ingredientId).toBeTruthy();

    const ingredientFilter = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_query: null,
        p_filters: [{ field: 'ingredient', operator: 'contains_any', value: [ingredientId] }],
        p_sort_key: 'name',
        p_limit: 50,
        p_offset: 0,
      },
    });
    expect(ingredientFilter.ok(), await ingredientFilter.text()).toBeTruthy();
    expect(
      ((await ingredientFilter.json()) as { recipe_name: string }[]).map(
        ({ recipe_name }) => recipe_name,
      ),
    ).toEqual(['Searchable saffron rice']);

    const exactIngredientFilters = [
      {
        operator: 'is',
        value: [ingredientId],
        expectedNames: ['Searchable saffron rice'],
      },
      {
        operator: 'is',
        value: [ingredientId, 'unassigned-ingredient'],
        expectedNames: [],
      },
      {
        operator: 'is_not',
        value: [ingredientId],
        expectedNames: ['Apricot roast with a very long title that wraps on a narrow screen'],
      },
    ];
    for (const exactFilter of exactIngredientFilters) {
      const exactIngredientSearch = await request.post(
        `${config.apiUrl}/rest/v1/rpc/search_recipes`,
        {
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${user.accessToken}`,
          },
          data: {
            p_query: null,
            p_filters: [
              {
                field: 'ingredient',
                operator: exactFilter.operator,
                value: exactFilter.value,
              },
            ],
            p_sort_key: 'name',
            p_limit: 50,
            p_offset: 0,
          },
        },
      );
      expect(exactIngredientSearch.ok(), await exactIngredientSearch.text()).toBeTruthy();
      expect(
        ((await exactIngredientSearch.json()) as { recipe_name: string }[]).map(
          ({ recipe_name }) => recipe_name,
        ),
      ).toEqual(exactFilter.expectedNames);
    }

    const filteredSearch = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_query: 'saffron rice',
        p_filters: [
          { field: 'state', operator: 'in', value: ['want_to_try'] },
          { field: 'total_time_minutes', operator: 'between', value: 10, value_to: 30 },
        ],
        p_sort_key: 'total_time_minutes',
        p_sort_direction: 'asc',
        p_limit: 50,
        p_offset: 0,
      },
    });
    expect(filteredSearch.ok(), await filteredSearch.text()).toBeTruthy();
    expect(
      ((await filteredSearch.json()) as { recipe_name: string }[]).map(
        ({ recipe_name }) => recipe_name,
      ),
    ).toEqual(['Searchable saffron rice']);

    const sourceCases = [
      {
        field: 'publication_page',
        value: '42',
        expectedName: 'Searchable saffron rice',
        expectedFacet: [
          { facet_value: '42', facet_label: '42', recipe_count: 1 },
          { facet_value: '__blank__', facet_label: 'No page', recipe_count: 1 },
        ],
      },
      {
        field: 'recipe_url',
        value: 'https://source.example.test/apricot-roast',
        expectedName: 'Apricot roast with a very long title that wraps on a narrow screen',
        expectedFacet: [
          {
            facet_value: '__blank__',
            facet_label: 'No URL',
            recipe_count: 1,
          },
          {
            facet_value: 'https://source.example.test/apricot-roast',
            facet_label: 'https://source.example.test/apricot-roast',
            recipe_count: 1,
          },
        ],
      },
      {
        field: 'citation',
        value: 'The Saffron Kitchen, page 42',
        expectedName: 'Searchable saffron rice',
        expectedFacet: [
          {
            facet_value: '__blank__',
            facet_label: 'No citation',
            recipe_count: 1,
          },
          {
            facet_value: 'The Saffron Kitchen, page 42',
            facet_label: 'The Saffron Kitchen, page 42',
            recipe_count: 1,
          },
        ],
      },
    ] as const;

    for (const sourceCase of sourceCases) {
      const sourceFilter = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${user.accessToken}`,
        },
        data: {
          p_query: null,
          p_filters: [{ field: sourceCase.field, operator: 'in', value: [sourceCase.value] }],
          p_sort_key: 'name',
          p_limit: 50,
          p_offset: 0,
        },
      });
      expect(sourceFilter.ok(), await sourceFilter.text()).toBeTruthy();
      expect(
        ((await sourceFilter.json()) as { recipe_name: string }[]).map(
          ({ recipe_name }) => recipe_name,
        ),
      ).toEqual([sourceCase.expectedName]);

      const sourceFacets = await request.post(
        `${config.apiUrl}/rest/v1/rpc/recipe_search_facet_values`,
        {
          headers: {
            apikey: config.anonKey,
            Authorization: `Bearer ${user.accessToken}`,
          },
          data: { p_query: null, p_filters: [], p_facet_field: sourceCase.field },
        },
      );
      expect(sourceFacets.ok(), await sourceFacets.text()).toBeTruthy();
      expect(await sourceFacets.json()).toEqual(sourceCase.expectedFacet);
    }

    const firstPage = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_query: null,
        p_filters: [],
        p_sort_key: 'name',
        p_sort_direction: 'asc',
        p_limit: 1,
        p_offset: 0,
      },
    });
    expect(firstPage.ok(), await firstPage.text()).toBeTruthy();
    const firstPageResults = (await firstPage.json()) as {
      recipe_name: string;
      total_count: number;
    }[];
    expect(firstPageResults.map(({ recipe_name }) => recipe_name)).toEqual([
      'Apricot roast with a very long title that wraps on a narrow screen',
    ]);
    expect(firstPageResults[0]?.total_count).toBe(2);

    const secondPage = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_query: null,
        p_filters: [],
        p_sort_key: 'name',
        p_sort_direction: 'asc',
        p_limit: 1,
        p_offset: 1,
      },
    });
    expect(secondPage.ok(), await secondPage.text()).toBeTruthy();
    expect(
      ((await secondPage.json()) as { recipe_name: string }[]).map(
        ({ recipe_name }) => recipe_name,
      ),
    ).toEqual(['Searchable saffron rice']);

    const isolatedSearch = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${otherUser.accessToken}`,
      },
      data: { p_query: 'cardamom notesearch', p_limit: 50, p_offset: 0 },
    });
    expect(isolatedSearch.ok(), await isolatedSearch.text()).toBeTruthy();
    expect(await isolatedSearch.json()).toEqual([]);

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    await page.goto('/publications');
    const searchLink = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Search' });
    await expect(searchLink).toBeVisible();
    const mainLinks = await page
      .getByRole('navigation', { name: 'Main navigation' })
      .locator('.private-nav-links a')
      .allTextContents();
    expect(mainLinks.indexOf('Search')).toBe(mainLinks.indexOf('Library') + 1);
    await searchLink.click();
    await expect(page).toHaveURL(/\/recipes\/find$/);
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', {
        name: 'Search',
      }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toBeVisible();
    await expect(page.getByText('YOUR COLLECTION', { exact: true })).toHaveCount(0);

    await page.getByRole('searchbox', { name: 'Search recipes' }).fill('cardamom notesearch');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page.getByRole('link', { name: 'Searchable saffron rice' })).toBeVisible();
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.getByRole('button', { name: 'clear all' })).toHaveCount(0);
    const searchTab = page.getByRole('tab', { name: 'Search' });
    const queryTab = page.getByRole('tab', { name: 'Query' });
    await expect(searchTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Search' })).toBeVisible();
    await expect(page.getByRole('tabpanel', { name: 'Query' })).toBeHidden();
    await searchTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(queryTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveCount(0);
    await expect(page.getByRole('tabpanel', { name: 'Query' })).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(searchTab).toHaveAttribute('aria-selected', 'true');
    const searchGeometry = await page.evaluate(() => {
      const searchInput = document.querySelector('#recipe-search');
      const searchButton = document.querySelector('.find-recipes-form-controls button');
      const controls = document.querySelector('.find-recipes-form-controls');
      const tabs = document.querySelector('.find-recipes-tabs');
      const searchPanel = document.querySelector('.find-recipes-tabpanel-search');
      if (!searchInput || !searchButton || !controls || !tabs || !searchPanel) return null;
      const inputBounds = searchInput.getBoundingClientRect();
      const buttonBounds = searchButton.getBoundingClientRect();
      const controlsBounds = controls.getBoundingClientRect();
      const tabsBounds = tabs.getBoundingClientRect();
      const searchPanelBounds = searchPanel.getBoundingClientRect();
      return {
        inputButtonGap: buttonBounds.left - inputBounds.right,
        tabPanelGap: searchPanelBounds.top - tabsBounds.bottom,
        searchHeight: inputBounds.height,
        buttonHeight: buttonBounds.height,
        controlsTop: controlsBounds.top,
      };
    });
    expect(searchGeometry).not.toBeNull();
    expect(searchGeometry?.inputButtonGap).toBe(18);
    expect(searchGeometry?.tabPanelGap).toBe(18);
    expect(searchGeometry?.buttonHeight).toBe(searchGeometry?.searchHeight);
    await queryTab.click();
    await page.getByRole('button', { name: 'Add rule' }).click();
    const initialRule = page.locator('.recipe-filter-row').first();
    await selectFilterOption(page, initialRule, 'Field', 'Publication Name');
    await initialRule.getByRole('combobox', { name: 'Operator' }).click();
    await expect(page.getByRole('option', { name: 'Is', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: "Isn't", exact: true })).toBeVisible();
    const selectedOperatorCheck = page
      .getByRole('option', { name: 'Is', exact: true })
      .locator('.single-picklist-check');
    await expect(selectedOperatorCheck).toHaveText('✓');
    await expect(selectedOperatorCheck).toHaveCSS('font-size', '16px');
    await expect(selectedOperatorCheck).toHaveCSS('border-radius', '0px');
    await page.keyboard.press('Escape');
    await initialRule.getByRole('button', { name: /^Value:/ }).click();
    await expect(
      page.getByRole('group', { name: 'Value options' }).getByRole('button', {
        name: 'Recipe Tin',
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await selectFilterOption(page, initialRule, 'Field', 'Name');
    await initialRule.getByRole('combobox', { name: 'Operator' }).click();
    await expect(page.getByRole('option', { name: 'Contains no', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: "Isn't Empty", exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await initialRule.getByLabel('Value').fill('saffron');
    await page.getByRole('button', { name: 'Add rule' }).click();
    const secondInitialRule = page.locator('.recipe-filter-row').nth(1);
    await selectFilterOption(page, secondInitialRule, 'Field', 'State');
    await selectFilterValue(page, secondInitialRule, 'Want to Try');
    await expect(secondInitialRule.locator('.recipe-filter-value-trigger')).toContainText(
      'Want to Try',
    );
    await searchTab.click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'clear all' })).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('');
    await queryTab.click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'clear all' })).toHaveCount(0);
    await searchTab.click();
    await expect(page.locator('#recipe-search')).toHaveValue('');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL((url) => {
      const params = new URL(url).searchParams;
      return (
        !params.has('q') && params.getAll('filter').length === 0 && params.get('tab') === 'search'
      );
    });
    await expect(page.getByText('2 recipes found')).toBeVisible();

    await queryTab.click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add rule' }).click();
    const independentRule = page.locator('.recipe-filter-row').first();
    await selectFilterOption(page, independentRule, 'Field', 'Name');
    await independentRule.getByLabel('Value').fill('saffron');
    await page.getByRole('button', { name: 'Add rule' }).click();
    const independentStateRule = page.locator('.recipe-filter-row').nth(1);
    await selectFilterOption(page, independentStateRule, 'Field', 'State');
    await selectFilterValue(page, independentStateRule, 'Want to Try');
    await page.getByRole('button', { name: 'clear all' }).click();
    await expect(page).toHaveURL((url) => {
      const searchParams = new URL(url).searchParams;
      return (
        !searchParams.has('q') &&
        searchParams.getAll('filter').length === 0 &&
        searchParams.get('tab') === 'query'
      );
    });
    await expect(page.getByText('2 recipes found')).toBeVisible();
    await searchTab.click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('2 recipes found')).toBeVisible();
    const secondRecipeRow = page.locator('.find-recipes-list tbody tr').nth(1);
    if ((page.viewportSize()?.width ?? 0) <= 720) {
      await expect(secondRecipeRow).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(secondRecipeRow.locator('td').first()).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
    } else {
      await expect(secondRecipeRow.locator('td').first()).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
    }

    if ((page.viewportSize()?.width ?? 0) > 700) {
      await page.getByRole('button', { name: 'Filter Name' }).click();
      await expect(page.getByRole('group', { name: 'Name values' })).toBeVisible();
      await expect(page.getByLabel('Searchable saffron rice')).toBeChecked();
      await page
        .getByLabel('Apricot roast with a very long title that wraps on a narrow screen')
        .uncheck();
      await page
        .locator('.recipe-column-filter-popover')
        .getByRole('button', { name: 'Apply' })
        .click();
      await expect(page.getByText('1 recipe found')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Searchable saffron rice' })).toBeVisible();
      await expect(
        page.getByRole('link', {
          name: 'Apricot roast with a very long title that wraps on a narrow screen',
        }),
      ).toHaveCount(0);

      await page.getByRole('button', { name: 'Filter Name' }).click();
      await page.getByRole('button', { name: 'Deselect all' }).click();
      await page.getByRole('button', { name: 'Select all' }).click();
      await expect(
        page.getByLabel('Apricot roast with a very long title that wraps on a narrow screen'),
      ).toBeChecked();
      await expect(page.getByLabel('Searchable saffron rice')).toBeChecked();
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
      await expect(page.getByText('2 recipes found')).toBeVisible();
    }

    await queryTab.click();
    await page.getByRole('button', { name: 'Add rule' }).click();
    const filterRows = page.locator('.recipe-filter-row');
    await expect(filterRows.nth(0).getByLabel('Field')).toBeFocused();
    await expect(filterRows.nth(0).locator('legend')).toHaveCount(0);
    await expect(filterRows.nth(0).getByLabel('Value')).toBeVisible();
    await expect(filterRows.nth(0).getByLabel('Value')).toBeDisabled();
    for (const labelClass of [
      '.recipe-filter-field-label',
      '.recipe-filter-operator-label',
      '.recipe-filter-value-label',
    ]) {
      await expect(filterRows.nth(0).locator(labelClass)).toHaveCSS('position', 'absolute');
      await expect(filterRows.nth(0).locator(labelClass)).toHaveCSS('clip-path', 'inset(50%)');
    }
    await selectFilterOption(page, filterRows.nth(0), 'Field', 'State');
    await selectFilterValue(page, filterRows.nth(0), 'Want to Try');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await expect(filterRows.nth(1).getByLabel('Field')).toBeFocused();
    await selectFilterOption(page, filterRows.nth(1), 'Field', 'Total Time');
    await selectFilterOption(page, filterRows.nth(1), 'Operator', 'Between');
    await filterRows.nth(1).getByLabel('Value').fill('10');
    await filterRows.nth(1).getByLabel('Through').fill('30');
    await page.getByRole('button', { name: 'Add rule' }).click();
    await selectFilterOption(page, filterRows.nth(2), 'Field', 'Ingredient');
    await filterRows.nth(2).getByRole('combobox', { name: 'Operator' }).click();
    await expect(page.getByRole('option', { name: 'Is', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: "Isn't", exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Has', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Has Any', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: "Doesn't Have", exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await filterRows
      .nth(2)
      .getByRole('button', { name: /^Value:/ })
      .click();
    const ingredientValueOptions = page.getByRole('group', { name: 'Value options' });
    const valueOptionStyles = await ingredientValueOptions
      .getByText('Searchable Coriander Ingredient', { exact: true })
      .evaluate((element) => {
        const styles = getComputedStyle(element);
        return { fontSize: styles.fontSize, fontWeight: styles.fontWeight };
      });
    expect(valueOptionStyles).toEqual({ fontSize: '16px', fontWeight: '400' });
    await ingredientValueOptions
      .getByRole('button', { name: 'Searchable Coriander Ingredient' })
      .click();
    await page.keyboard.press('Escape');
    const lastRule = filterRows.nth(2);
    const [
      ruleBounds,
      removeBounds,
      fieldBounds,
      operatorBounds,
      valueBounds,
      actionsBounds,
      addRuleBounds,
      clearAllBounds,
    ] = await Promise.all([
      lastRule.boundingBox(),
      lastRule.getByRole('button', { name: 'Remove filter 3' }).boundingBox(),
      lastRule.getByLabel('Field').boundingBox(),
      lastRule.getByLabel('Operator').boundingBox(),
      lastRule.getByRole('button', { name: /^Value:/ }).boundingBox(),
      page.locator('.recipe-filter-actions').boundingBox(),
      page.getByRole('button', { name: 'Add rule' }).boundingBox(),
      page.getByRole('button', { name: 'clear all' }).boundingBox(),
    ]);
    const [removeStrokeWidth, addRuleFontSize, rowBorder] = await Promise.all([
      lastRule
        .getByRole('button', { name: 'Remove filter 3' })
        .locator('svg')
        .getAttribute('stroke-width'),
      page
        .getByRole('button', { name: 'Add rule' })
        .evaluate((button) => getComputedStyle(button).fontSize),
      lastRule.evaluate((row) => getComputedStyle(row).borderTopWidth),
    ]);
    const [addRuleTextStyle, clearAllTextStyle] = await Promise.all([
      page.locator('.recipe-filter-add .recipe-ingredient-empty-prompt').evaluate((text) => {
        const styles = getComputedStyle(text);
        return {
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          fontStyle: styles.fontStyle,
        };
      }),
      page.locator('.recipe-filter-clear-all .recipe-ingredient-empty-prompt').evaluate((text) => {
        const styles = getComputedStyle(text);
        return {
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          fontStyle: styles.fontStyle,
        };
      }),
    ]);
    if (
      !ruleBounds ||
      !removeBounds ||
      !fieldBounds ||
      !operatorBounds ||
      !valueBounds ||
      !actionsBounds ||
      !addRuleBounds ||
      !clearAllBounds
    ) {
      throw new Error('The final query rule controls must be measurable.');
    }
    expect(removeBounds.x).toBeGreaterThanOrEqual(valueBounds.x + valueBounds.width);
    expect(Math.abs(addRuleBounds.y - clearAllBounds.y)).toBeLessThanOrEqual(1);
    expect(addRuleBounds.width).toBeLessThan(actionsBounds.width / 2);
    expect(
      Math.abs(clearAllBounds.x + clearAllBounds.width - actionsBounds.x - actionsBounds.width),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(addRuleBounds.x - actionsBounds.x)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(clearAllBounds.x + clearAllBounds.width - (removeBounds.x + removeBounds.width)),
    ).toBeLessThanOrEqual(1);
    expect(clearAllTextStyle).toEqual(addRuleTextStyle);
    expect(lastRule.getByRole('button', { name: 'Apply' })).toHaveCount(0);
    for (const bounds of [fieldBounds, operatorBounds, valueBounds]) {
      expect(bounds.height).toBe(36);
    }
    const controlsCenterY = (fieldBounds.y + valueBounds.y + valueBounds.height) / 2;
    if ((page.viewportSize()?.width ?? 0) <= 700) {
      expect(
        Math.abs(removeBounds.y + removeBounds.height / 2 - controlsCenterY),
      ).toBeLessThanOrEqual(6);
    } else {
      expect(
        Math.abs(
          removeBounds.y + removeBounds.height / 2 - (fieldBounds.y + fieldBounds.height / 2),
        ),
      ).toBeLessThanOrEqual(2);
    }
    expect(removeStrokeWidth).toBe('1.35');
    expect(addRuleFontSize).toBe('16px');
    expect(rowBorder).toBe('0px');
    await page.getByRole('button', { name: 'Add rule' }).hover();
    await expect(page.getByRole('button', { name: 'Add rule' })).toHaveCSS(
      'text-decoration-line',
      'underline',
    );
    await page
      .getByRole('button', { name: /^Value:/ })
      .last()
      .press('Enter');
    const appliedUrl = new URL(page.url());
    expect(appliedUrl.searchParams.get('q')?.trim() ?? '').toBe('');
    expect(
      appliedUrl.searchParams.getAll('filter').some((value) => JSON.parse(value).field === 'state'),
    ).toBe(true);
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Searchable saffron rice' })).toBeVisible();

    await page.getByRole('combobox', { name: 'Sort by Name' }).click();
    await page
      .locator('.recipe-explorer-sort-menu')
      .getByRole('option', { name: 'Date Added' })
      .click();
    await expect(page).toHaveURL(/sort=created_at/);
    await expect(page.getByRole('button', { name: 'Switch to List view' })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to List view' }).click();
    await expect(page.locator('.recipe-explorer-simple-list')).toBeVisible();
    await expect(page.locator('.recipe-explorer-simple-list img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Switch to Grid view' }).click();
    await expect(page.locator('.find-recipes-grid')).toBeVisible();
    await expect(page.locator('.find-recipes-grid-metadata')).toHaveText(
      'Search Source Magazine ~ Want to try ~ 20 min',
    );
    await page.reload();
    await expect(page.getByText('1 recipe found')).toBeVisible();
    await expect(page.locator('.find-recipes-grid')).toBeVisible();
    await expect(page).toHaveURL((url) => {
      const params = new URL(url).searchParams;
      return (
        params.get('sort') === 'created_at' &&
        params.get('view') === 'grid' &&
        params.get('tab') === 'query' &&
        params.getAll('filter').length === 3
      );
    });
    await expect(page.getByRole('button', { name: 'Switch to Details view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Switch to Details view' }).click();

    for (const width of [352, 390]) {
      await page.setViewportSize({ width, height: 820 });
      await expect(page.locator('.find-recipes-mobile-filters')).toHaveCSS('display', 'flex');
      await expect(page.locator('.find-recipes-list thead')).toHaveCSS('display', 'none');
      await expect(page.locator('.find-recipes-mobile-label')).toHaveCount(0);
      await expect(page.locator('.find-recipes-mobile-metadata')).toHaveText(
        'Search Source Magazine ~ Want to try ~ 20 min',
      );
      await expect(page.locator('.find-recipes-list tbody tr').first()).toHaveCSS(
        'background-color',
        'rgba(56, 96, 68, 0.08)',
      );
      await expect(page.locator('.find-recipes-list tbody tr').first()).toHaveCSS(
        'display',
        'flex',
      );
      const mobileRule = page.locator('.recipe-filter-row').last();
      const mobileControlBounds = await Promise.all([
        mobileRule.getByRole('combobox', { name: 'Field' }).boundingBox(),
        mobileRule.getByRole('combobox', { name: 'Operator' }).boundingBox(),
        mobileRule.getByRole('button', { name: /^Value:/ }).boundingBox(),
      ]);
      expect(mobileControlBounds.every(Boolean)).toBeTruthy();
      const controlPositions = mobileControlBounds.map((bounds) => ({
        left: bounds?.x ?? 0,
        right: (bounds?.x ?? 0) + (bounds?.width ?? 0),
        top: bounds?.y ?? 0,
      }));
      expect(
        Math.max(...controlPositions.map(({ top }) => top)) -
          Math.min(...controlPositions.map(({ top }) => top)),
      ).toBeLessThanOrEqual(1);
      expect(controlPositions[0]?.right).toBeLessThanOrEqual(controlPositions[1]?.left ?? 0);
      expect(controlPositions[1]?.right).toBeLessThanOrEqual(controlPositions[2]?.left ?? 0);
      const navItems = await page.locator('.private-nav').evaluate((nav) =>
        Array.from(
          nav.querySelectorAll<HTMLElement>(
            '.private-nav-links a, .private-nav-utility-link, .account-menu-trigger',
          ),
          (item) => {
            const { x, y, width: itemWidth, height: itemHeight } = item.getBoundingClientRect();
            return { x, y, width: itemWidth, height: itemHeight };
          },
        ),
      );
      expect(new Set(navItems.map(({ y }) => y)).size).toBe(1);
      expect(
        new Set(
          navItems.map(({ width: itemWidth, height: itemHeight }) => `${itemWidth}x${itemHeight}`),
        ),
      ).toEqual(new Set(['44x44']));
      const toolbarRows = await page
        .locator('.recipe-explorer-toolbar')
        .evaluate((toolbar) =>
          Array.from(
            toolbar.querySelectorAll<HTMLElement>(
              '.recipe-explorer-sort-picklist, .recipe-explorer-toolbar > a, .recipe-explorer-toolbar > button',
            ),
            (item) => item.getBoundingClientRect().y,
          ),
        );
      expect(new Set(toolbarRows).size).toBe(1);
      await expect(
        page.locator('.find-recipes-list tbody td[data-explorer-column="state"]'),
      ).toHaveCSS('white-space', 'nowrap');
      await expect(
        page.locator('.find-recipes-list tbody td[data-explorer-column="total_time_minutes"]'),
      ).toHaveCSS('white-space', 'nowrap');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBeTruthy();
      await page.keyboard.press('Escape');
    }

    await page.goto('/recipes/find?sort=name&direction=asc&page=1&view=grid');
    await expect(page.locator('.find-recipes-grid li')).toHaveCount(2);
    await expect(page.locator('.find-recipes-grid li').first()).toHaveCSS(
      'background-color',
      'rgba(56, 96, 68, 0.08)',
    );
    await expect(page.locator('.find-recipes-grid li').first()).toHaveCSS(
      'box-shadow',
      'rgba(36, 40, 32, 0.18) 0px 4px 12px 0px',
    );
    await expect(page.locator('.find-recipes-grid li').nth(1)).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
    const noTimeGridCard = page
      .locator('.find-recipes-grid li')
      .filter({ hasText: 'Apricot roast with a very long title that wraps on a narrow screen' });
    const gridCardHeights = await page
      .locator('.find-recipes-grid li')
      .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().height)));
    expect(new Set(gridCardHeights).size).toBeGreaterThan(1);
    await expect(noTimeGridCard.locator('.find-recipes-grid-metadata')).toHaveText(
      'Recipe Tin ~ Tried',
    );
    const noImageTitleHeight = await noTimeGridCard
      .locator('strong')
      .evaluate((title) => title.getBoundingClientRect().height);
    expect(noImageTitleHeight).toBeGreaterThan(24);
    await page.goto('/recipes/find?sort=name&direction=asc&page=1&view=details');
    await expect(page.locator('.find-recipes-list thead')).toHaveCSS('display', 'none');
    await expect(page.locator('.find-recipes-mobile-thumbnail-placeholder')).toHaveCount(2);
    await expect(page.locator('.find-recipes-mobile-thumbnail-placeholder').first()).toHaveCSS(
      'border-width',
      '0px',
    );
    await expect(page.locator('.find-recipes-mobile-thumbnail-placeholder').first()).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await expect(page.locator('.find-recipes-mobile-thumbnail').first()).toHaveCSS(
      'object-fit',
      'contain',
    );
    await expect(
      page.locator('.find-recipes-list tbody tr').first().locator('.find-recipes-mobile-metadata'),
    ).toHaveText('Recipe Tin ~ Tried');
    const clippedTitle = page
      .locator('.find-recipes-mobile-title')
      .filter({ hasText: 'Apricot roast with a very long title that wraps on a narrow screen' })
      .first();
    await expect(clippedTitle).toHaveCSS('white-space', 'nowrap');
    await expect(clippedTitle).toHaveCSS('text-overflow', 'ellipsis');
    expect(
      await clippedTitle.evaluate((element) => {
        return element.scrollWidth > element.clientWidth;
      }),
    ).toBeTruthy();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();

    await page.setViewportSize({ width: 1280, height: 900 });
    const firstHeader = page.locator('.find-recipes-list thead th').first();
    await expect(firstHeader).toHaveCSS('font-size', '16px');
    await expect(firstHeader).toHaveCSS('text-transform', 'none');
    await expect(firstHeader).toHaveCSS('text-align', 'left');
    await expect(page.locator('.find-recipes-list')).toHaveCSS('display', 'grid');
    await expect(
      page.locator('.find-recipes-list tbody td[data-explorer-column="name"]').first(),
    ).toHaveCSS('white-space', 'nowrap');
    const firstColumnShare = await firstHeader.evaluate((header) => {
      const tableWidth = header.closest('table')?.getBoundingClientRect().width ?? 0;
      return header.getBoundingClientRect().width / tableWidth;
    });
    expect(firstColumnShare).toBeLessThanOrEqual(0.55);
    const columnStartOffsets = await page
      .locator('.find-recipes-list thead th')
      .evaluateAll((headers) =>
        headers.map((header, index) => {
          const button = header.querySelector('button');
          const cell = header
            .closest('table')
            ?.querySelectorAll('tbody tr:first-child td')
            .item(index);
          if (!button || !cell) return Number.POSITIVE_INFINITY;
          const headerRange = document.createRange();
          headerRange.selectNodeContents(button);
          const cellRange = document.createRange();
          cellRange.selectNodeContents(cell);
          return headerRange.getBoundingClientRect().left - cellRange.getBoundingClientRect().left;
        }),
      );
    expect(columnStartOffsets.every((offset) => Math.abs(offset) < 2)).toBeTruthy();
    await expect(
      page.locator('.find-recipes-list tbody tr').first().locator('td').first(),
    ).toHaveCSS('background-color', 'rgba(56, 96, 68, 0.08)');
    await expect(
      page.locator('.find-recipes-list tbody tr').first().locator('td:first-child a'),
    ).toHaveCSS('font-weight', '400');
    await captureScreenshot(page, 'find-recipes-populated-list');
    await page.setViewportSize({ width: 390, height: 844 });
    await captureScreenshot(page, 'find-recipes-populated-list-mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'Filter Publication' }).click();
    const filterOptionLabel = page
      .locator('.recipe-column-filter-popover .recipe-column-filter-option span')
      .first();
    await expect(filterOptionLabel).toHaveCSS('font-size', '16px');
    await expect(filterOptionLabel).toHaveCSS('text-transform', 'none');

    for (const index of [3, 4, 5, 6, 7, 8]) {
      await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
        name: `Grid stripe recipe ${index}`,
        state: 'want_to_try',
        totalTime: 10 + index,
        notes: '',
      });
    }

    await page.goto('/recipes/find?sort=name&direction=asc&page=1&view=grid');
    const desktopGridCards = page.locator('.find-recipes-grid li');
    await expect(desktopGridCards).toHaveCount(8);
    const desktopGridCardHeights = await desktopGridCards.evaluateAll((cards) =>
      cards.map((card) => Math.round(card.getBoundingClientRect().height)),
    );
    expect(new Set(desktopGridCardHeights).size).toBe(1);
    await expect(desktopGridCards.first()).toHaveCSS('height', '234px');
    await expect(desktopGridCards.first()).toHaveCSS('background-color', 'rgba(56, 96, 68, 0.08)');
    await expect(desktopGridCards.first()).toHaveCSS(
      'box-shadow',
      'rgba(36, 40, 32, 0.18) 0px 4px 12px 0px',
    );

    async function checkGridRowStarts(
      columnCount: number,
      candidateWidths = [
        760, 800, 840, 880, 920, 960, 1000, 1040, 1080, 1120, 1160, 1200, 1240, 1280, 1360, 1500,
      ],
    ) {
      let matchedColumns = false;
      for (const width of candidateWidths) {
        await page.setViewportSize({ width, height: 900 });
        const actualColumns = await desktopGridCards.evaluateAll((cards) => {
          const firstTop = cards[0]?.getBoundingClientRect().top;
          if (firstTop === undefined) return 0;
          return cards.filter((card) => Math.abs(card.getBoundingClientRect().top - firstTop) < 1)
            .length;
        });
        if (actualColumns !== columnCount) continue;
        matchedColumns = true;
        break;
      }

      expect(matchedColumns).toBe(true);
      const secondRowStart = desktopGridCards.nth(columnCount);
      const secondRowNextCard = desktopGridCards.nth(columnCount + 1);
      await expect(desktopGridCards.first()).toHaveAttribute('data-stripe-cell', 'odd');
      await expect(desktopGridCards.nth(1)).toHaveAttribute('data-stripe-cell', 'even');
      await expect(secondRowStart).toHaveAttribute('data-stripe-cell', 'even');
      await expect(secondRowNextCard).toHaveAttribute('data-stripe-cell', 'odd');
      await expect(desktopGridCards.first()).toHaveCSS(
        'background-color',
        'rgba(56, 96, 68, 0.08)',
      );
      await expect(desktopGridCards.nth(1)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(secondRowStart).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(secondRowNextCard).toHaveCSS('background-color', 'rgba(56, 96, 68, 0.08)');
      await expect(desktopGridCards.first().locator('.find-recipes-grid-metadata')).toHaveCSS(
        'color',
        'rgb(36, 40, 32)',
      );
      await expect(desktopGridCards.nth(1).locator('.find-recipes-grid-metadata')).toHaveCSS(
        'color',
        'rgb(36, 40, 32)',
      );
      if (columnCount === 3) {
        await expect(desktopGridCards.nth(6)).toHaveAttribute('data-stripe-cell', 'odd');
        await expect(desktopGridCards.nth(7)).toHaveAttribute('data-stripe-cell', 'even');
        await expect(desktopGridCards.nth(6)).toHaveCSS(
          'background-color',
          'rgba(56, 96, 68, 0.08)',
        );
        await expect(desktopGridCards.nth(7)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      }
    }

    await checkGridRowStarts(3);
    await checkGridRowStarts(4);
    await checkGridRowStarts(5, [1414]);
    await checkGridRowStarts(5, [1440]);
    await checkGridRowStarts(5, [1920]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await captureScreenshot(page, 'find-recipes-populated-grid');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(desktopGridCards).toHaveCount(8);
    await captureScreenshot(page, 'find-recipes-populated-grid-mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
    await desktopGridCards.first().locator('a').hover();
    await expect(desktopGridCards.first().locator('strong')).toHaveCSS(
      'text-decoration-line',
      'underline',
    );

    const emptyQuery = `no-matching-recipe-${randomUUID()}`;
    await page.goto(
      `/recipes/find?q=${encodeURIComponent(emptyQuery)}&sort=name&direction=asc&view=list`,
    );
    await expect(page.getByText('0 recipes found')).toBeVisible();
    await expect(page.getByText('No recipes match these search criteria.')).toBeVisible();
    await captureScreenshot(page, 'find-recipes-empty-list');
    await page.setViewportSize({ width: 390, height: 844 });
    await captureScreenshot(page, 'find-recipes-empty-list-mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      `/recipes/find?q=${encodeURIComponent(emptyQuery)}&sort=name&direction=asc&view=grid`,
    );
    await expect(page.getByText('No recipes match these search criteria.')).toBeVisible();
    await captureScreenshot(page, 'find-recipes-empty-grid');
    await page.setViewportSize({ width: 390, height: 844 });
    await captureScreenshot(page, 'find-recipes-empty-grid-mobile');
  } finally {
    await Promise.all([deleteTestUser(request, user), deleteTestUser(request, otherUser)]);
  }
});

test('Find Recipes shows a recoverable query error and preserves filters @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const filter = JSON.stringify({ field: 'unsupported_field', operator: 'contains', value: 'x' });

  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    await page.goto(`/recipes/find?filter=${encodeURIComponent(filter)}&tab=query&view=grid`);

    await expect(
      page.getByRole('alert').filter({ hasText: 'Unable to search recipes.' }),
    ).toHaveText('Unable to search recipes. Your query refinements are preserved. Try again.');
    await expect(page.getByRole('searchbox', { name: 'Search recipes' })).toHaveValue('');
    await expect(page.locator('.recipe-empty-state')).toHaveCount(0);
    await expect(page).toHaveURL((url) => {
      const params = new URL(url).searchParams;
      return !params.has('q') && params.get('filter') === filter && params.get('tab') === 'query';
    });
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Find Recipes sorts by every display column in Details view @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    await page.goto('/recipes/find?sort=name&direction=asc&view=details');

    await page.getByRole('combobox', { name: 'Sort by Name' }).click();
    const sortMenu = page.locator('.recipe-explorer-sort-menu');
    await expect(sortMenu.getByRole('option', { name: 'Name' })).toBeVisible();
    await expect(sortMenu.getByRole('option', { name: 'Publication' })).toBeVisible();
    await expect(sortMenu.getByRole('option', { name: 'State' })).toBeVisible();
    await expect(sortMenu.getByRole('option', { name: 'Opinion' })).toHaveCount(0);
    await expect(sortMenu.getByRole('option', { name: 'Citation' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await page.getByRole('checkbox', { name: 'Opinion' }).check();
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      /(^|\s)opinion(\s|$)/,
    );
    await page.getByRole('button', { name: 'Choose List columns' }).click();
    await page.getByRole('combobox', { name: 'Sort by Name' }).click();
    await expect(sortMenu.getByRole('option', { name: 'Opinion' })).toBeVisible();
    await expect(sortMenu.getByRole('option', { name: 'Citation' })).toHaveCount(0);
    await sortMenu.getByRole('option', { name: 'Opinion' }).click();

    await expect(page).toHaveURL(/sort=opinion/);
    await expect(page.getByRole('combobox', { name: 'Sort by Opinion' })).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Unable to search recipes.' }),
    ).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipe search RPC honors typed filters, ranking, stable sorting, and page boundaries @e2e', async ({
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };

  const search = async (
    options: {
      query?: string | null;
      filters?: Record<string, unknown>[];
      sort?: string;
      direction?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    } = {},
  ) => {
    const response = await request.post(`${config.apiUrl}/rest/v1/rpc/search_recipes`, {
      headers,
      data: {
        p_query: options.query ?? null,
        p_filters: options.filters ?? [],
        p_sort_key: options.sort ?? null,
        p_sort_direction: options.direction ?? 'asc',
        p_limit: options.limit ?? 50,
        p_offset: options.offset ?? 0,
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()) as {
      recipe_name: string;
      rank: number;
      total_count: number;
    }[];
  };
  const names = async (options: Parameters<typeof search>[0] = {}) =>
    (await search(options)).map(({ recipe_name }) => recipe_name);

  try {
    const alphaName = 'Contract Alpha Rankmarker';
    const betaName = 'Contract Beta';
    const gammaName = 'Contract Gamma';
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: alphaName,
      state: 'want_to_try',
      totalTime: 10,
      notes: '',
      ingredients: ['Contract Ingredient A', 'Contract Ingredient B'],
    });
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: betaName,
      state: 'tried',
      totalTime: null,
      notes: 'Rankmarker body-only',
      ingredients: ['Contract Ingredient A', 'Contract Ingredient C'],
    });
    await createContractRecipe(request, config.apiUrl, config.anonKey, user.accessToken, {
      name: gammaName,
      state: 'want_to_try',
      totalTime: 30,
      notes: '',
    });

    const ingredientResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id,name`,
      { headers },
    );
    expect(ingredientResponse.ok(), await ingredientResponse.text()).toBeTruthy();
    const ingredients = (await ingredientResponse.json()) as { id: string; name: string }[];
    const ingredientIds = new Map(ingredients.map(({ id, name }) => [name, id]));
    const ingredientA = ingredientIds.get('Contract Ingredient A');
    const ingredientB = ingredientIds.get('Contract Ingredient B');
    expect(ingredientA).toBeTruthy();
    expect(ingredientB).toBeTruthy();

    const textCases = [
      { operator: 'contains', value: 'CONTRACT', expected: [alphaName, betaName, gammaName] },
      { operator: 'does_not_contain', value: 'beta', expected: [alphaName, gammaName] },
      { operator: 'equals', value: alphaName.toLowerCase(), expected: [alphaName] },
      { operator: 'starts_with', value: 'contract beta', expected: [betaName] },
    ];
    for (const textCase of textCases) {
      expect(
        await names({
          sort: 'name',
          filters: [{ field: 'name', operator: textCase.operator, value: textCase.value }],
        }),
      ).toEqual(textCase.expected);
    }
    expect(
      await names({
        sort: 'name',
        filters: [{ field: 'notes_markdown', operator: 'is_empty' }],
      }),
    ).toEqual([alphaName, gammaName]);
    expect(
      await names({
        sort: 'name',
        filters: [{ field: 'notes_markdown', operator: 'is_not_empty' }],
      }),
    ).toEqual([betaName]);

    const setCases = [
      {
        operator: 'contains_any',
        value: [ingredientA, ingredientB],
        expected: [alphaName, betaName],
      },
      { operator: 'contains_all', value: [ingredientA, ingredientB], expected: [alphaName] },
      { operator: 'does_not_contain', value: [ingredientA], expected: [gammaName] },
      { operator: 'is', value: [ingredientA, ingredientB], expected: [alphaName] },
      { operator: 'is_not', value: [ingredientA, ingredientB], expected: [betaName, gammaName] },
    ];
    for (const setCase of setCases) {
      expect(
        await names({
          sort: 'name',
          filters: [{ field: 'ingredient', operator: setCase.operator, value: setCase.value }],
        }),
      ).toEqual(setCase.expected);
    }

    const numericCases = [
      { operator: 'equals', value: 10, expected: [alphaName] },
      { operator: 'not_equals', value: 10, expected: [gammaName] },
      { operator: 'greater_than', value: 10, expected: [gammaName] },
      { operator: 'less_than', value: 30, expected: [alphaName] },
      { operator: 'at_least', value: 30, expected: [gammaName] },
      { operator: 'at_most', value: 10, expected: [alphaName] },
      { operator: 'between', value: 10, value_to: 30, expected: [alphaName, gammaName] },
    ];
    for (const numericCase of numericCases) {
      expect(
        await names({
          sort: 'name',
          filters: [
            {
              field: 'total_time_minutes',
              operator: numericCase.operator,
              value: numericCase.value,
              ...(numericCase.value_to === undefined ? {} : { value_to: numericCase.value_to }),
            },
          ],
        }),
      ).toEqual(numericCase.expected);
    }
    expect(
      await names({
        sort: 'name',
        filters: [{ field: 'state', operator: 'not_in', value: ['tried'] }],
      }),
    ).toEqual([alphaName, gammaName]);

    const ranked = await search({ query: 'Rankmarker' });
    expect(ranked.map(({ recipe_name }) => recipe_name)).toEqual([alphaName, betaName]);
    expect(ranked[0]?.rank).toBeGreaterThan(ranked[1]?.rank ?? 0);

    expect(await names({ sort: 'total_time_minutes', direction: 'asc' })).toEqual([
      alphaName,
      gammaName,
      betaName,
    ]);
    expect(await names({ sort: 'total_time_minutes', direction: 'desc' })).toEqual([
      gammaName,
      alphaName,
      betaName,
    ]);
    const stablePages = await Promise.all(
      [0, 1, 2].map((offset) => search({ sort: 'state', limit: 1, offset })),
    );
    expect(stablePages.map(([recipe]) => recipe?.recipe_name)).toEqual([
      betaName,
      alphaName,
      gammaName,
    ]);
    expect(stablePages.flat().map(({ total_count }) => total_count)).toEqual([3, 3, 3]);
    expect(await search({ sort: 'state', limit: 1, offset: 3 })).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});
