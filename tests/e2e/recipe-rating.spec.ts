import { expect, test } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getLocalSupabaseConfig,
  type TestUser,
} from '../support/local-supabase';

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/(?:app|recipes|publications(?:\/[0-9a-f-]+)?)(?:\?.*)?$/);
}

async function selectSinglePicklist(
  page: import('@playwright/test').Page,
  label: string,
  option: string,
) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function readRecipe(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  headers: Record<string, string>,
  recipeId: string,
) {
  const response = await request.get(
    `${apiUrl}/rest/v1/recipes?select=state,score,version&id=eq.${recipeId}`,
    { headers },
  );
  const responseText = await response.text();
  expect(response.ok(), responseText).toBeTruthy();
  const [recipe] = JSON.parse(responseText) as {
    state: string;
    score: number | null;
    version: number;
  }[];
  if (!recipe) {
    throw new Error('Expected the owner to read the saved recipe.');
  }
  return recipe;
}

async function setRating(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  headers: Record<string, string>,
  recipeId: string,
  expectedVersion: number,
  score: number | null,
) {
  return request.post(`${apiUrl}/rest/v1/rpc/set_recipe_rating`, {
    headers,
    data: {
      p_recipe_id: recipeId,
      p_expected_version: expectedVersion,
      p_score: score,
    },
  });
}

test('Rating writes validate ownership, Tried state, versions, and history @e2e @rating', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  let other: TestUser | null = null;

  try {
    other = await createTestUser(request);
    const config = await getLocalSupabaseConfig();
    const ownerHeaders = {
      apikey: config.anonKey,
      Authorization: `Bearer ${owner.accessToken}`,
    };
    const otherHeaders = {
      apikey: config.anonKey,
      Authorization: `Bearer ${other.accessToken}`,
    };
    const recipeName = `Rating RPC ${crypto.randomUUID()}`;

    await signIn(page, owner.email, owner.password);
    await page.goto('/recipes/new');
    await page.getByLabel('Name').fill(recipeName);
    await selectSinglePicklist(page, 'State', 'Tried');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();
    const recipeId = new URL(page.url()).pathname.split('/').at(-1);
    expect(recipeId).toBeTruthy();
    if (!recipeId) {
      throw new Error('Expected the saved recipe ID in the detail URL.');
    }

    const allowedScores = [-5, -3, -1, 0, 1, 2, 3, 4, 5];
    for (const score of allowedScores) {
      const current = await readRecipe(request, config.apiUrl, ownerHeaders, recipeId);
      expect(current.state).toBe('tried');
      const response = await setRating(
        request,
        config.apiUrl,
        ownerHeaders,
        recipeId,
        current.version,
        score,
      );
      const responseText = await response.text();
      expect(response.ok(), responseText).toBeTruthy();
      expect(JSON.parse(responseText)).toEqual([{ version: current.version + 1 }]);
      await expect(
        readRecipe(request, config.apiUrl, ownerHeaders, recipeId),
      ).resolves.toMatchObject({ score });
    }

    const latest = await readRecipe(request, config.apiUrl, ownerHeaders, recipeId);
    const invalid = await setRating(
      request,
      config.apiUrl,
      ownerHeaders,
      recipeId,
      latest.version,
      -2,
    );
    expect(invalid.status()).toBe(400);

    const stale = await setRating(
      request,
      config.apiUrl,
      ownerHeaders,
      recipeId,
      latest.version - 1,
      -5,
    );
    expect(stale.status()).toBe(409);

    const unauthorized = await setRating(
      request,
      config.apiUrl,
      otherHeaders,
      recipeId,
      latest.version,
      -5,
    );
    expect(unauthorized.ok()).toBe(false);
    const unauthenticated = await setRating(
      request,
      config.apiUrl,
      { apikey: config.anonKey },
      recipeId,
      latest.version,
      -5,
    );
    expect(unauthenticated.ok()).toBe(false);
    await expect(readRecipe(request, config.apiUrl, ownerHeaders, recipeId)).resolves.toMatchObject(
      { score: 5, version: latest.version },
    );

    const cleared = await setRating(
      request,
      config.apiUrl,
      ownerHeaders,
      recipeId,
      latest.version,
      null,
    );
    const clearedText = await cleared.text();
    expect(cleared.ok(), clearedText).toBeTruthy();
    expect(JSON.parse(clearedText)).toEqual([{ version: latest.version + 1 }]);
    await expect(readRecipe(request, config.apiUrl, ownerHeaders, recipeId)).resolves.toMatchObject(
      { score: null, version: latest.version + 1 },
    );

    const historyResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${recipeId}&event_type=eq.recipe.updated&order=created_at.asc`,
      { headers: ownerHeaders },
    );
    const historyText = await historyResponse.text();
    expect(historyResponse.ok(), historyText).toBeTruthy();
    const history = JSON.parse(historyText) as {
      event_type: string;
      before_data: { score: number | null };
      after_data: { score: number | null };
    }[];
    expect(history).toHaveLength(10);
    expect(history.map((event) => event.after_data.score)).toEqual([...allowedScores, null]);
    expect(history.at(-1)?.before_data.score).toBe(5);

    const restored = await setRating(
      request,
      config.apiUrl,
      ownerHeaders,
      recipeId,
      latest.version + 1,
      5,
    );
    const restoredText = await restored.text();
    expect(restored.ok(), restoredText).toBeTruthy();

    await page.goto(`/recipes/${recipeId}/edit`);
    await page.getByLabel('Serves').fill('2');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();
    const afterUnrelatedEdit = await readRecipe(request, config.apiUrl, ownerHeaders, recipeId);
    expect(afterUnrelatedEdit).toMatchObject({ state: 'tried', score: 5 });

    await page.goto(`/recipes/${recipeId}/edit`);
    await selectSinglePicklist(page, 'State', 'Want to Try');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: recipeName })).toBeVisible();
    const noLongerTried = await readRecipe(request, config.apiUrl, ownerHeaders, recipeId);
    expect(noLongerTried).toMatchObject({ state: 'want_to_try', score: null });
    for (const score of [-5, null]) {
      const rejected = await setRating(
        request,
        config.apiUrl,
        ownerHeaders,
        recipeId,
        noLongerTried.version,
        score,
      );
      expect(rejected.ok()).toBe(false);
    }
  } finally {
    if (other) {
      await deleteTestUser(request, other);
    }
    await deleteTestUser(request, owner);
  }
});
