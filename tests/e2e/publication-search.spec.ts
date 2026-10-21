import { type APIRequestContext, expect, test } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getLocalSupabaseConfig,
  type LocalSupabaseConfig,
  type TestUser,
} from '../support/local-supabase';

function headers(config: LocalSupabaseConfig, user: TestUser) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
}

async function searchPublications(
  request: APIRequestContext,
  config: LocalSupabaseConfig,
  user: TestUser,
  options: {
    query?: string | null;
    filters?: Record<string, unknown>[];
    type?: string | null;
    sort?: string;
    direction?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  } = {},
) {
  return request.post(`${config.apiUrl}/rest/v1/rpc/search_publications`, {
    headers: headers(config, user),
    data: {
      p_query: options.query ?? null,
      p_filters: options.filters ?? [],
      p_publication_type: options.type ?? null,
      p_sort_key: options.sort ?? null,
      p_sort_direction: options.direction ?? 'asc',
      p_limit: options.limit ?? 50,
      p_offset: options.offset ?? 0,
    },
  });
}

test('publication search indexes metadata and tags with owner-scoped typed results @e2e', async ({
  request,
}) => {
  const user = await createTestUser(request);
  const otherUser = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const recipeTinResponse = await request.get(
    `${config.apiUrl}/rest/v1/publications?select=id&publication_type=eq.collection`,
    { headers: headers(config, user) },
  );
  expect(recipeTinResponse.ok(), await recipeTinResponse.text()).toBeTruthy();
  const [{ id: recipeTinId }] = (await recipeTinResponse.json()) as { id: string }[];

  try {
    const tagRevisionResponse = await request.get(
      `${config.apiUrl}/rest/v1/tag_catalog_revisions?select=revision`,
      { headers: headers(config, user) },
    );
    expect(tagRevisionResponse.ok(), await tagRevisionResponse.text()).toBeTruthy();
    const [{ revision: tagRevision }] = (await tagRevisionResponse.json()) as {
      revision: number;
    }[];
    const tagResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/manage_tag_catalog`, {
      headers: headers(config, user),
      data: {
        p_action: 'add',
        p_expected_revision: tagRevision,
        p_tag_id: null,
        p_name: 'Zqpublicationtagold',
        p_replacement_id: null,
      },
    });
    expect(tagResponse.ok(), await tagResponse.text()).toBeTruthy();
    const tagListResponse = await request.get(`${config.apiUrl}/rest/v1/tags?select=id,name`, {
      headers: headers(config, user),
    });
    expect(tagListResponse.ok(), await tagListResponse.text()).toBeTruthy();
    const tags = (await tagListResponse.json()) as { id: string; name: string }[];
    const tagId = tags.find(({ name }) => name === 'Zqpublicationtagold')?.id;
    expect(tagId).toBeTruthy();

    const firstPublicationResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers: headers(config, user),
        data: {
          p_name: 'Zqpublicationtitleold',
          p_publication_type: 'book',
          p_author: 'Zqpublicationauthorold',
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: null,
          p_tag_ids: [tagId],
        },
      },
    );
    expect(firstPublicationResponse.ok(), await firstPublicationResponse.text()).toBeTruthy();
    const publicationId = (await firstPublicationResponse.json()) as string;

    const secondPublicationResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers: headers(config, user),
        data: {
          p_name: 'Zqpublicationtitleother',
          p_publication_type: 'site',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: 'https://example.test',
          p_tag_ids: [],
        },
      },
    );
    expect(secondPublicationResponse.ok(), await secondPublicationResponse.text()).toBeTruthy();
    const secondPublicationId = (await secondPublicationResponse.json()) as string;

    for (const query of [
      'Zqpublicationtitleold',
      'Zqpublicationauthorold',
      'Zqpublicationtagold',
    ]) {
      const response = await searchPublications(request, config, user, { query });
      expect(response.ok(), await response.text()).toBeTruthy();
      expect(
        ((await response.json()) as { publication_id: string }[]).map(
          ({ publication_id }) => publication_id,
        ),
      ).toEqual([publicationId]);
    }

    const isolatedResponse = await searchPublications(request, config, otherUser, {
      query: 'Zqpublicationtitleold',
    });
    expect(isolatedResponse.ok(), await isolatedResponse.text()).toBeTruthy();
    expect(await isolatedResponse.json()).toEqual([]);

    const typeFilterResponse = await searchPublications(request, config, user, {
      filters: [{ field: 'publication_type', operator: 'in', value: ['book'] }],
    });
    expect(typeFilterResponse.ok(), await typeFilterResponse.text()).toBeTruthy();
    expect(
      ((await typeFilterResponse.json()) as { publication_id: string }[]).map(
        ({ publication_id }) => publication_id,
      ),
    ).toEqual([publicationId]);

    const combinedFilterResponse = await searchPublications(request, config, user, {
      query: 'Zqpublicationtitleold',
      filters: [
        { field: 'publication_type', operator: 'in', value: ['book'] },
        { field: 'tag', operator: 'contains_any', value: [tagId] },
        { field: 'recipe_count', operator: 'between', value: 0, value_to: 1 },
      ],
    });
    expect(combinedFilterResponse.ok(), await combinedFilterResponse.text()).toBeTruthy();
    expect(
      ((await combinedFilterResponse.json()) as { publication_id: string }[]).map(
        ({ publication_id }) => publication_id,
      ),
    ).toEqual([publicationId]);

    const firstPageResponse = await searchPublications(request, config, user, {
      sort: 'name',
      limit: 1,
      offset: 0,
    });
    expect(firstPageResponse.ok(), await firstPageResponse.text()).toBeTruthy();
    const [firstPage] = (await firstPageResponse.json()) as {
      publication_id: string;
      total_count: number;
    }[];
    expect(firstPage.total_count).toBe(3);
    const secondPageResponse = await searchPublications(request, config, user, {
      sort: 'name',
      limit: 1,
      offset: 1,
    });
    expect(secondPageResponse.ok(), await secondPageResponse.text()).toBeTruthy();
    const [secondPage] = (await secondPageResponse.json()) as { publication_id: string }[];
    expect(secondPage.publication_id).not.toBe(firstPage.publication_id);

    const statsPublicationResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers: headers(config, user),
        data: {
          p_name: 'Zqpublicationstats',
          p_publication_type: 'book',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: null,
          p_tag_ids: [],
        },
      },
    );
    expect(statsPublicationResponse.ok(), await statsPublicationResponse.text()).toBeTruthy();
    const statsPublicationId = (await statsPublicationResponse.json()) as string;
    const recipeResponse = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
      headers: headers(config, user),
      data: {
        p_recipe_id: null,
        p_expected_version: null,
        p_name: 'Publication count fixture',
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
    expect(recipeResponse.ok(), await recipeResponse.text()).toBeTruthy();
    const [countRecipe] = (await recipeResponse.json()) as { id: string }[];
    const assignedRecipeResponse = await request.patch(
      `${config.apiUrl}/rest/v1/recipes?id=eq.${countRecipe.id}`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          Prefer: 'return=minimal',
        },
        data: { publication_id: statsPublicationId },
      },
    );
    expect(assignedRecipeResponse.ok(), await assignedRecipeResponse.text()).toBeTruthy();

    const searchRows = async (
      options: NonNullable<Parameters<typeof searchPublications>[3]> = {},
    ) => {
      const response = await searchPublications(request, config, user, options);
      expect(response.ok(), await response.text()).toBeTruthy();
      return (await response.json()) as {
        publication_id: string;
        name: string;
        rank: number;
        total_count: number;
      }[];
    };
    const searchNames = async (options: NonNullable<Parameters<typeof searchPublications>[3]>) =>
      (await searchRows(options)).map(({ name }) => name);

    const textCases = [
      {
        operator: 'contains',
        value: 'PUBLICATIONTITLE',
        expected: ['Zqpublicationtitleold', 'Zqpublicationtitleother'],
      },
      {
        operator: 'does_not_contain',
        value: 'title',
        expected: ['Recipe Tin', 'Zqpublicationstats'],
      },
      {
        operator: 'equals',
        value: 'Zqpublicationtitleold'.toLowerCase(),
        expected: ['Zqpublicationtitleold'],
      },
      {
        operator: 'starts_with',
        value: 'Zqpublicationtitleold',
        expected: ['Zqpublicationtitleold'],
      },
    ];
    for (const textCase of textCases) {
      expect(
        await searchNames({
          sort: 'name',
          filters: [{ field: 'name', operator: textCase.operator, value: textCase.value }],
        }),
      ).toEqual(textCase.expected);
    }
    expect(
      await searchNames({
        sort: 'name',
        filters: [{ field: 'author', operator: 'is_empty' }],
      }),
    ).toEqual(['Recipe Tin', 'Zqpublicationstats', 'Zqpublicationtitleother']);
    expect(
      await searchNames({
        filters: [{ field: 'author', operator: 'is_not_empty' }],
      }),
    ).toEqual(['Zqpublicationtitleold']);
    expect(
      await searchNames({
        sort: 'name',
        filters: [{ field: 'publication_type', operator: 'not_in', value: ['site'] }],
      }),
    ).toEqual(['Recipe Tin', 'Zqpublicationstats', 'Zqpublicationtitleold']);

    const tagCases = [
      { operator: 'contains_any', expected: ['Zqpublicationtitleold'] },
      { operator: 'contains_all', expected: ['Zqpublicationtitleold'] },
      {
        operator: 'does_not_contain',
        expected: ['Recipe Tin', 'Zqpublicationstats', 'Zqpublicationtitleother'],
      },
      { operator: 'is', expected: ['Zqpublicationtitleold'] },
      {
        operator: 'is_not',
        expected: ['Recipe Tin', 'Zqpublicationstats', 'Zqpublicationtitleother'],
      },
    ];
    for (const tagCase of tagCases) {
      expect(
        await searchNames({
          sort: 'name',
          filters: [{ field: 'tag', operator: tagCase.operator, value: [tagId] }],
        }),
      ).toEqual(tagCase.expected);
    }

    const countCases = [
      {
        operator: 'equals',
        value: 0,
        expected: ['Recipe Tin', 'Zqpublicationtitleold', 'Zqpublicationtitleother'],
      },
      { operator: 'not_equals', value: 0, expected: ['Zqpublicationstats'] },
      { operator: 'greater_than', value: 0, expected: ['Zqpublicationstats'] },
      {
        operator: 'less_than',
        value: 1,
        expected: ['Recipe Tin', 'Zqpublicationtitleold', 'Zqpublicationtitleother'],
      },
      { operator: 'at_least', value: 1, expected: ['Zqpublicationstats'] },
      {
        operator: 'at_most',
        value: 0,
        expected: ['Recipe Tin', 'Zqpublicationtitleold', 'Zqpublicationtitleother'],
      },
      {
        operator: 'between',
        value: 0,
        value_to: 1,
        expected: [
          'Recipe Tin',
          'Zqpublicationstats',
          'Zqpublicationtitleold',
          'Zqpublicationtitleother',
        ],
      },
    ];
    for (const countCase of countCases) {
      expect(
        await searchNames({
          sort: 'name',
          filters: [
            {
              field: 'recipe_count',
              operator: countCase.operator,
              value: countCase.value,
              ...(countCase.value_to === undefined ? {} : { value_to: countCase.value_to }),
            },
          ],
        }),
      ).toEqual(countCase.expected);
    }

    const authorOrder = [
      'Recipe Tin',
      'Zqpublicationtitleold',
      'Zqpublicationstats',
      'Zqpublicationtitleother',
    ];
    expect(await searchNames({ sort: 'author', direction: 'asc' })).toEqual(authorOrder);
    expect(await searchNames({ sort: 'author', direction: 'desc' })).toEqual(authorOrder);
    const authorPages = await Promise.all(
      [0, 1, 2, 3].map((offset) => searchRows({ sort: 'author', limit: 1, offset })),
    );
    expect(authorPages.map(([publication]) => publication?.name)).toEqual(authorOrder);
    expect(authorPages.flat().map(({ publication_id }) => publication_id)).toEqual([
      recipeTinId,
      publicationId,
      statsPublicationId,
      secondPublicationId,
    ]);
    expect(authorPages.flat().map(({ total_count }) => total_count)).toEqual([4, 4, 4, 4]);
    expect(await searchRows({ sort: 'author', limit: 1, offset: 4 })).toEqual([]);

    const rankingPublications = await Promise.all(
      [
        { name: 'Rankmarker publication title', author: null },
        { name: 'Publication author result', author: 'Rankmarker' },
      ].map(({ name, author }) =>
        request.post(`${config.apiUrl}/rest/v1/rpc/create_publication`, {
          headers: headers(config, user),
          data: {
            p_name: name,
            p_publication_type: 'book',
            p_author: author,
            p_edition: null,
            p_isbn: null,
            p_retailer_url: null,
            p_issue: null,
            p_site_url: null,
            p_tag_ids: [],
          },
        }),
      ),
    );
    for (const response of rankingPublications) {
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    const rankedPublications = await searchRows({ query: 'Rankmarker' });
    expect(rankedPublications.map(({ name }) => name)).toEqual([
      'Rankmarker publication title',
      'Publication author result',
    ]);
    expect(rankedPublications[0]?.rank).toBeGreaterThan(rankedPublications[1]?.rank ?? 0);

    const currentRevisionResponse = await request.get(
      `${config.apiUrl}/rest/v1/tag_catalog_revisions?select=revision`,
      { headers: headers(config, user) },
    );
    expect(currentRevisionResponse.ok(), await currentRevisionResponse.text()).toBeTruthy();
    const [{ revision: currentTagRevision }] = (await currentRevisionResponse.json()) as {
      revision: number;
    }[];
    const renameTagResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_tag_catalog`,
      {
        headers: headers(config, user),
        data: {
          p_action: 'rename',
          p_expected_revision: currentTagRevision,
          p_tag_id: tagId,
          p_name: 'Zqpublicationtagnew',
          p_replacement_id: null,
        },
      },
    );
    expect(renameTagResponse.ok(), await renameTagResponse.text()).toBeTruthy();
    const oldTagSearch = await searchPublications(request, config, user, {
      query: 'Zqpublicationtagold',
    });
    expect(oldTagSearch.ok(), await oldTagSearch.text()).toBeTruthy();
    expect(await oldTagSearch.json()).toEqual([]);
    const newTagSearch = await searchPublications(request, config, user, {
      query: 'Zqpublicationtagnew',
    });
    expect(newTagSearch.ok(), await newTagSearch.text()).toBeTruthy();
    expect(
      ((await newTagSearch.json()) as { publication_id: string }[]).map(
        ({ publication_id }) => publication_id,
      ),
    ).toEqual([publicationId]);

    const publicationVersionResponse = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=version&id=eq.${publicationId}`,
      { headers: headers(config, user) },
    );
    expect(publicationVersionResponse.ok(), await publicationVersionResponse.text()).toBeTruthy();
    const [{ version: publicationVersion }] = (await publicationVersionResponse.json()) as {
      version: number;
    }[];
    const updatePublicationResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/update_publication`,
      {
        headers: headers(config, user),
        data: {
          p_publication_id: publicationId,
          p_expected_version: publicationVersion,
          p_name: 'Zqpublicationtitlenew',
          p_author: 'Zqpublicationauthornew',
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_site_url: null,
          p_tag_ids: [tagId],
        },
      },
    );
    expect(updatePublicationResponse.ok(), await updatePublicationResponse.text()).toBeTruthy();
    const oldTitleSearch = await searchPublications(request, config, user, {
      query: 'Zqpublicationtitleold',
    });
    expect(oldTitleSearch.ok(), await oldTitleSearch.text()).toBeTruthy();
    expect(await oldTitleSearch.json()).toEqual([]);
    const newTitleSearch = await searchPublications(request, config, user, {
      query: 'Zqpublicationtitlenew',
    });
    expect(newTitleSearch.ok(), await newTitleSearch.text()).toBeTruthy();
    expect(
      ((await newTitleSearch.json()) as { publication_id: string }[]).map(
        ({ publication_id }) => publication_id,
      ),
    ).toEqual([publicationId]);
    const oldAuthorSearch = await searchPublications(request, config, user, {
      query: 'Zqpublicationauthorold',
    });
    expect(oldAuthorSearch.ok(), await oldAuthorSearch.text()).toBeTruthy();
    expect(await oldAuthorSearch.json()).toEqual([]);
    const newAuthorSearch = await searchPublications(request, config, user, {
      query: 'Zqpublicationauthornew',
    });
    expect(newAuthorSearch.ok(), await newAuthorSearch.text()).toBeTruthy();
    expect(
      ((await newAuthorSearch.json()) as { publication_id: string }[]).map(
        ({ publication_id }) => publication_id,
      ),
    ).toEqual([publicationId]);
  } finally {
    await deleteTestUser(request, otherUser);
    await deleteTestUser(request, user);
  }
});
