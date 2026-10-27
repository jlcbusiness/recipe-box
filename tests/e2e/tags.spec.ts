import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getLocalSupabaseConfig,
  type TestUser,
} from '../support/local-supabase';

function ownerHeaders(config: Awaited<ReturnType<typeof getLocalSupabaseConfig>>, user: TestUser) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
}

async function addTag(
  request: import('@playwright/test').APIRequestContext,
  config: Awaited<ReturnType<typeof getLocalSupabaseConfig>>,
  user: TestUser,
  name: string,
) {
  const headers = ownerHeaders(config, user);
  const revisionsResponse = await request.get(
    `${config.apiUrl}/rest/v1/tag_catalog_revisions?select=revision`,
    { headers },
  );
  expect(revisionsResponse.ok(), await revisionsResponse.text()).toBeTruthy();
  const [{ revision }] = (await revisionsResponse.json()) as { revision: number }[];
  const response = await request.post(`${config.apiUrl}/rest/v1/rpc/manage_tag_catalog`, {
    headers,
    data: {
      p_action: 'add',
      p_expected_revision: revision,
      p_tag_id: null,
      p_name: name,
      p_replacement_id: null,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const catalogResponse = await request.get(
    `${config.apiUrl}/rest/v1/tags?select=id,name,color_key&order=name.asc`,
    { headers },
  );
  expect(catalogResponse.ok(), await catalogResponse.text()).toBeTruthy();
  const catalog = (await catalogResponse.json()) as {
    id: string;
    name: string;
    color_key: string;
  }[];
  const tag = catalog.find((entry) => entry.name === name);
  expect(tag).toBeDefined();
  if (!tag) throw new Error(`Tag ${name} was not created.`);
  return tag;
}

async function saveRecipeWithTags(
  request: import('@playwright/test').APIRequestContext,
  config: Awaited<ReturnType<typeof getLocalSupabaseConfig>>,
  user: TestUser,
  recipeId: string | null,
  expectedVersion: number | null,
  name: string,
  tagIds: string[],
) {
  return request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe_with_relationships`, {
    headers: ownerHeaders(config, user),
    data: {
      p_recipe_id: recipeId,
      p_expected_version: expectedVersion,
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
      p_publication_id: null,
      p_publication_page: null,
      p_recipe_url: null,
      p_recipe_relationships: { site_listing: null, pairings: [], references: [] },
      p_tag_ids: tagIds,
    },
  });
}

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications$/);
}

test('Settings exposes an accessible Tags catalog section @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForLoadState('networkidle');

    const section = page.getByRole('region', { name: 'Tags' });
    await expect(section).toBeVisible();
    await expect(section).toHaveCSS('margin-top', '0px');
    const toggle = section.getByRole('button', { name: 'Edit tags' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      await toggle.evaluate((button) => {
        const chevron = button.querySelector('svg');
        const label = button.querySelector('span');
        return Boolean(
          chevron &&
            label &&
            chevron.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const addTag = section.getByRole('textbox', { name: 'Add tag' });
    const tagSearch = section.getByRole('textbox', { name: 'Search tags' });
    await expect(tagSearch.locator('xpath=../../following-sibling::span')).toHaveCSS(
      'margin-left',
      '0px',
    );
    await expect(addTag).toBeVisible();

    await addTag.fill('  Weeknight  ');
    const addWeeknight = section.getByRole('button', { name: 'Add Weeknight' });
    await expect(addWeeknight).toBeVisible();
    await expect(addTag).toHaveCSS('font-style', 'italic');
    await expect(addTag).toHaveCSS('font-size', '17px');
    await expect(addWeeknight).toHaveText('');
    await addWeeknight.click();
    await expect(section.getByRole('button', { name: 'Edit Weeknight' })).toBeVisible();
    await expect(section.getByRole('status')).toContainText(/tag added/i);

    await addTag.fill('a');
    await addTag.press('Enter');
    const tagRows = section.locator('[data-tag-row]');
    await expect(tagRows).toHaveCount(2);
    await expect(section.locator('ul[aria-label="Tags"]')).toHaveCSS('padding-left', '4px');
    await expect(section.locator('ul[aria-label="Tags"]')).toHaveCSS('padding-right', '4px');
    await expect(tagRows.first().getByRole('button', { name: 'Edit a' })).toBeVisible();
    await expect(tagRows.nth(1).getByRole('button', { name: 'Edit Weeknight' })).toBeVisible();
    const firstTagButton = tagRows.first().getByRole('button', { name: 'Edit a' });
    const wideTagButton = tagRows.nth(1).getByRole('button', { name: 'Edit Weeknight' });
    const firstTagRowBounds = await tagRows.first().boundingBox();
    const firstTagButtonBounds = await firstTagButton.boundingBox();
    await expect(firstTagButton).toHaveCSS('padding', '8px 18px');
    await expect(wideTagButton).toHaveCSS('padding', '8px 14px');
    await expect(firstTagButton).toHaveCSS('text-align', 'left');
    expect(firstTagButtonBounds?.x).toBe(firstTagRowBounds?.x);
    expect(firstTagButtonBounds?.width).toBeLessThan(firstTagRowBounds?.width ?? 0);

    await addTag.fill('Cancelled');
    await addTag.press('Escape');
    await expect(addTag).toHaveValue('');
    await expect(addTag).not.toBeFocused();
    await expect(section.getByRole('button', { name: /^add /i })).toHaveCount(0);

    await addTag.fill('weeknight');
    await addTag.press('Enter');
    await expect(section.getByRole('alert')).toContainText(/already exists/i);
    await expect(tagRows).toHaveCount(2);

    await section.getByRole('button', { name: 'Edit Weeknight' }).click();
    const renameTag = section.getByRole('textbox', { name: 'Rename Weeknight' });
    await expect(renameTag).toBeFocused();
    await tagSearch.click();
    await expect(renameTag).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Edit Weeknight' })).toBeVisible();
    await section.getByRole('button', { name: 'Edit Weeknight' }).click();
    const activeRenameTag = section.getByRole('textbox', { name: 'Rename Weeknight' });
    await expect(activeRenameTag).toBeFocused();
    await activeRenameTag.fill('Supper');
    await activeRenameTag.press('Enter');
    await expect(section.getByRole('button', { name: 'Edit Supper' })).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Settings searches tags, adds a search result, and scrolls its 4x4 color catalog @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    for (let index = 1; index <= 12; index += 1) {
      await addTag(request, config, user, `Seasoning ${String(index).padStart(2, '0')}`);
    }

    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();
    const section = page.getByRole('region', { name: 'Tags' });
    const toggle = section.getByRole('button', { name: 'Edit tags' });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const search = section.getByRole('textbox', { name: 'Search tags' });
    const clearSearch = section.getByRole('button', { name: 'Clear tag search' });
    const searchLayout = await search.locator('xpath=../..').evaluate((controls) => {
      const field = controls.querySelector('label');
      const input = field?.querySelector('input');
      const icon = field?.querySelector('svg');
      const clear = controls.querySelector('button');
      if (!field || !input || !icon || !clear) {
        throw new Error('Expected a search field, magnifier, and separate clear control.');
      }

      const fieldBounds = field.getBoundingClientRect();
      const inputBounds = input.getBoundingClientRect();
      const iconBounds = icon.getBoundingClientRect();
      const clearBounds = clear.getBoundingClientRect();
      return {
        iconFollowsInput: iconBounds.left > inputBounds.right,
        clearIsOutsideField: !field.contains(clear),
        clearFollowsField: clearBounds.left >= fieldBounds.right,
      };
    });
    expect(searchLayout).toEqual({
      iconFollowsInput: true,
      clearIsOutsideField: true,
      clearFollowsField: true,
    });
    await search.fill('11');
    await expect(section.getByText('1 of 12 tags')).toBeVisible();
    await expect(section.getByRole('button', { name: 'Edit Seasoning 11' })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Edit Seasoning 01' })).toHaveCount(0);
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(section.getByText('12 tags')).toBeVisible();
    await search.press('Escape');
    await expect(search).not.toBeFocused();
    await search.fill('11');
    await search.fill('season ');
    await expect(section.getByText('0 of 12 tags')).toBeVisible();
    const addSearchResult = section.getByRole('button', { name: 'add season' });
    await expect(addSearchResult).toBeVisible();
    await expect(addSearchResult.locator('xpath=..')).toHaveCSS('border-top-width', '1px');
    await expect(addSearchResult.locator('xpath=..')).toHaveCSS('border-bottom-width', '1px');
    await expect(addSearchResult.locator('xpath=..')).toHaveCSS(
      'border-top-color',
      'rgb(174, 184, 167)',
    );
    await addSearchResult.click();
    await expect(section.getByRole('button', { name: 'Edit Season' })).toBeVisible();
    await expect(section.getByRole('status')).toHaveText('Tag added.');
    await search.fill('Seasoning ');
    await expect(section.getByText('12 of 13 tags')).toBeVisible();
    await search.fill('Pinch');
    await search.press('Enter');
    await expect(section.getByRole('button', { name: 'Edit Pinch' })).toBeVisible();
    await expect(section.getByRole('status')).toHaveText('Tag added.');

    await clearSearch.click();
    const list = section.locator('ul[aria-label="Tags"]');
    await expect(list.locator('[data-tag-row]')).toHaveCount(14);
    await expect
      .poll(() => list.evaluate((element) => element.scrollHeight > element.clientHeight))
      .toBe(true);
    await expect
      .poll(() => list.evaluate((element) => element.clientHeight))
      .toBeLessThanOrEqual(416);

    await section.getByRole('button', { name: 'Change color for Pinch' }).click();
    const palette = section.getByRole('group', { name: 'Color for Pinch' });
    await expect(palette.getByRole('button')).toHaveCount(16);
    const columns = await palette
      .locator('div')
      .evaluate(
        (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
      );
    expect(columns).toBe(4);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Settings merges a chosen survivor and deletes unused tags without replacement @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForLoadState('networkidle');
    const section = page.getByRole('region', { name: 'Tags' });
    await section.getByRole('button', { name: 'Edit tags' }).click();
    const addTag = section.getByRole('textbox', { name: 'Add tag' });
    for (const name of ['Merge Source', 'Keep First', 'Keep Second', 'Disposable']) {
      await addTag.fill(name);
      await addTag.press('Enter');
      await expect(section.getByRole('button', { name: `Edit ${name}` })).toBeVisible();
    }

    await section.getByRole('button', { name: 'Merge Merge Source' }).click();
    const mergePane = section.getByRole('region', { name: 'Merge Merge Source' });
    const counterpart = mergePane.getByRole('combobox', { name: 'Merge Merge Source with' });
    await counterpart.selectOption({ label: 'Keep First' });
    const keepChoices = mergePane.getByRole('group', { name: 'Keep as' });
    const keepFirst = keepChoices.getByRole('button', { name: 'Keep First' });
    await expect(keepFirst).toHaveCSS('border-radius', '12px');
    await expect(keepFirst).toHaveCSS('border-color', 'rgb(140, 63, 29)');
    await expect(keepFirst).toHaveCSS('background-color', 'rgb(255, 254, 250)');
    await keepFirst.click();
    await expect(keepFirst).toHaveAttribute('aria-pressed', 'true');
    await expect(keepFirst).toHaveCSS('background-color', 'rgb(140, 63, 29)');
    await counterpart.selectOption({ label: 'Keep Second' });
    await expect(keepChoices.getByRole('button', { name: 'Merge Source' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(keepChoices.getByRole('button', { name: 'Keep Second' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await keepChoices.getByRole('button', { name: 'Keep Second' }).click();
    await mergePane.getByRole('button', { name: 'Merge', exact: true }).click();
    await expect(section.getByRole('button', { name: 'Edit Merge Source' })).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Edit Keep Second' })).toBeVisible();
    await expect(section.getByRole('status')).toHaveText('Tags merged.');

    await page.setViewportSize({ width: 390, height: 844 });
    await section.getByRole('button', { name: 'Delete Disposable' }).click();
    const deletePane = section.getByRole('region', { name: 'Delete Disposable' });
    await expect(deletePane.getByText('Used by 0 recipes and 0 publications.')).toBeVisible();
    const paneBounds = await deletePane.boundingBox();
    expect(paneBounds).not.toBeNull();
    expect(paneBounds?.y).toBeGreaterThanOrEqual(0);
    expect((paneBounds?.y ?? 0) + (paneBounds?.height ?? 0)).toBeLessThanOrEqual(844);
    await expect(deletePane.getByRole('combobox', { name: 'Replace with' })).toHaveCount(0);
    await expect(deletePane.getByRole('button', { name: 'Delete tag' })).toBeEnabled();
    await deletePane.getByRole('button', { name: 'Delete tag' }).click();
    await expect(section.getByRole('button', { name: 'Edit Disposable' })).toHaveCount(0);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipes create tags inline and use shared pastel colors @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    const tagPicker = page.getByRole('group', { name: 'Tags' });
    const input = tagPicker.getByRole('combobox', { name: 'Add or find a tag' });
    await input.fill('Weeknight');
    await tagPicker.getByRole('option', { name: 'Create tag “Weeknight”' }).click();
    await expect(tagPicker.getByRole('button', { name: 'Remove Weeknight' })).toBeVisible();

    await page.getByLabel('Name').fill('Inline tagged supper');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Inline tagged supper' })).toBeVisible();
    const detailTags = page.getByRole('list', { name: 'Tags' });
    await expect(detailTags.getByRole('listitem').first()).toHaveText('Weeknight');

    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForLoadState('networkidle');
    const catalog = page.getByRole('region', { name: 'Tags' });
    await catalog.getByRole('button', { name: 'Edit tags' }).click();
    await catalog.getByRole('button', { name: 'Change color for Weeknight' }).click();
    const palette = catalog.getByRole('group', { name: 'Color for Weeknight' });
    const sageSwatch = palette.getByRole('button', { name: 'Set Weeknight color to Sage' });
    await sageSwatch.scrollIntoViewIfNeeded();
    await expect(sageSwatch).toBeInViewport();
    await sageSwatch.click();
    await expect(catalog.getByRole('status')).toHaveText('Tag color updated.');

    const tagResponse = await request.get(
      `${config.apiUrl}/rest/v1/tags?select=color_key&name=eq.Weeknight`,
      { headers: ownerHeaders(config, user) },
    );
    expect(await tagResponse.json()).toEqual([{ color_key: 'sage' }]);

    await page.goto('/recipes');
    await page.getByRole('link', { name: 'Inline tagged supper' }).click();
    await expect(page.getByRole('list', { name: 'Tags' }).getByRole('listitem').first()).toHaveText(
      'Weeknight',
    );
    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recipes can assign, edit, and remove private tags @e2e @a11y', async ({ page, request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    const tag = await addTag(request, config, user, 'Weeknight');
    await addTag(request, config, user, 'apricot');
    await addTag(request, config, user, 'Banana');
    await addTag(request, config, user, 'Replacement');
    await signIn(page, user.email, user.password);
    await page.goto('/recipes/new');
    const tags = page.getByRole('group', { name: 'Tags' });
    const selectedTagList = tags.getByRole('list', { name: 'Tags' });
    const tagInput = selectedTagList.getByRole('combobox', { name: 'Add or find a tag' });
    await expect(tagInput).toHaveAttribute('placeholder', 'add tag');
    await expect(tagInput).toHaveCSS('font-family', /Georgia/);
    await expect(tagInput).toHaveCSS('font-style', 'italic');
    const initialInputWidth = (await tagInput.boundingBox())?.width ?? 0;
    expect(initialInputWidth).toBeGreaterThanOrEqual(96);
    await tagInput.fill('a');
    const oneCharacterWidth = (await tagInput.boundingBox())?.width ?? 0;
    await tagInput.fill('ab');
    const twoCharacterWidth = (await tagInput.boundingBox())?.width ?? 0;
    expect(twoCharacterWidth - oneCharacterWidth).toBeLessThan(96);
    await tagInput.fill('a considerably longer tag name');
    const longerInputWidth = (await tagInput.boundingBox())?.width ?? 0;
    expect(longerInputWidth).toBeGreaterThan(initialInputWidth);
    expect(longerInputWidth).toBeLessThan(300);
    await tagInput.fill('a');
    const optionLabels = await tags.getByRole('option').allTextContents();
    expect(optionLabels.map((label) => label.trim())).toEqual([
      'apricot',
      'Banana',
      'Replacement',
      'Create tag “a”',
    ]);
    await tagInput.press('ArrowDown');
    await expect(tags.getByRole('option', { name: 'Banana' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await tagInput.press('ArrowUp');
    await expect(tags.getByRole('option', { name: 'apricot' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await tagInput.press('Enter');
    await tagInput.fill('Weeknight');
    await tags.getByRole('option', { name: 'Weeknight' }).click();
    await expect(tags.getByRole('button', { name: 'Remove apricot' })).toBeVisible();
    await expect(tags.getByRole('button', { name: 'Remove Weeknight' })).toBeVisible();
    await expect(selectedTagList).toHaveCSS('display', 'flex');
    await expect(selectedTagList).toHaveCSS('flex-wrap', 'wrap');
    await expect(selectedTagList.getByRole('listitem')).toHaveCount(3);
    await expect(selectedTagList.getByRole('listitem').last().getByRole('combobox')).toBeVisible();
    const formAccessibility = await new AxeBuilder({ page }).analyze();
    expect(formAccessibility.violations).toEqual([]);
    await page.getByLabel('Name').fill('Tagged supper');
    await page.getByRole('button', { name: 'Save recipe' }).click();

    await expect(page.getByRole('heading', { name: 'Tagged supper' })).toBeVisible();
    await expect(page.getByText('Weeknight', { exact: true })).toBeVisible();
    const detailTags = page.getByRole('list', { name: 'Tags' });
    await expect(detailTags.getByRole('listitem').nth(0)).toHaveText('apricot');
    await expect(detailTags.getByRole('listitem').nth(1)).toHaveText('Weeknight');
    const finalTagBounds = await detailTags.locator('li').nth(1).boundingBox();
    const detailTagsBounds = await detailTags.boundingBox();
    const detailTitleBounds = await page.locator('.recipe-detail-title').boundingBox();
    const detailHeadingBounds = await page.locator('.recipe-detail-heading').boundingBox();
    const detailActions = page.locator('.recipe-detail-heading-actions');
    const detailActionsBounds = await detailActions.boundingBox();
    expect(detailTagsBounds).not.toBeNull();
    expect(detailTitleBounds).not.toBeNull();
    expect(detailHeadingBounds).not.toBeNull();
    expect(detailActionsBounds).not.toBeNull();
    if ((page.viewportSize()?.width ?? 0) <= 760) {
      expect(detailActionsBounds?.y).toBeGreaterThanOrEqual(
        (finalTagBounds?.y ?? 0) + (finalTagBounds?.height ?? 0),
      );
    } else if (
      detailTitleBounds &&
      detailActionsBounds &&
      detailHeadingBounds &&
      detailTagsBounds
    ) {
      expect(Math.abs(detailActionsBounds.y - detailTitleBounds.y)).toBeLessThanOrEqual(1);
      expect(detailActionsBounds.x).toBeGreaterThanOrEqual(
        detailTitleBounds.x + detailTitleBounds.width,
      );
      expect(detailTagsBounds.y).toBeGreaterThanOrEqual(
        Math.max(
          detailTitleBounds.y + detailTitleBounds.height,
          detailActionsBounds.y + detailActionsBounds.height,
        ),
      );
      expect(detailActionsBounds.x + detailActionsBounds.width).toBeCloseTo(
        detailHeadingBounds.x + detailHeadingBounds.width,
        0,
      );
    }
    await expect(page.getByRole('link', { name: 'Weeknight' })).toHaveCount(0);
    const recipeId = new URL(page.url()).pathname.split('/').at(-1);
    expect(recipeId).toBeTruthy();
    const assignment = await request.get(
      `${config.apiUrl}/rest/v1/recipe_tags?select=tag_id&tag_id=eq.${tag.id}`,
      { headers: ownerHeaders(config, user) },
    );
    expect(await assignment.json()).toHaveLength(1);

    await page.setViewportSize({ width: 390, height: 844 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    await page.goto('/settings');
    const settingsTags = page.getByRole('region', { name: 'Tags' });
    await settingsTags.getByRole('button', { name: 'Edit tags' }).click();
    await settingsTags.getByRole('button', { name: 'Delete Weeknight' }).click();
    const deletePane = settingsTags.getByRole('region', { name: 'Delete Weeknight' });
    await expect(deletePane.getByText('Used by 1 recipe and 0 publications.')).toBeVisible();
    const replacement = deletePane.getByRole('combobox', { name: 'Replace with' });
    await expect(replacement).toBeVisible();
    const deleteTag = deletePane.getByRole('button', { name: 'Delete tag' });
    await expect(deleteTag).toBeDisabled();
    await replacement.selectOption({ label: 'Replacement' });
    await deleteTag.click();
    await expect(settingsTags.getByRole('button', { name: 'Edit Weeknight' })).toHaveCount(0);
    await expect(settingsTags.getByRole('status')).toHaveText('Tag deleted.');

    await page.goto(`/recipes/${recipeId}`);
    await expect(page.getByText('Replacement', { exact: true })).toBeVisible();
    const restoredTagList = page.getByRole('list', { name: 'Tags' });
    await expect(restoredTagList.getByRole('listitem').nth(0)).toHaveText('apricot');
    await expect(restoredTagList.getByRole('listitem').nth(1)).toHaveText('Replacement');
    await page.getByRole('link', { name: 'Edit' }).click();
    const editTags = page.getByRole('group', { name: 'Tags' });
    await expect(editTags.getByRole('button', { name: 'Remove Replacement' })).toBeVisible();
    await editTags.getByRole('button', { name: 'Remove Replacement' }).click();
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Tagged supper' })).toBeVisible();
    await expect(page.getByText('Replacement', { exact: true })).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('publications can create, reuse, edit, and remove private tags @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();

  try {
    await addTag(request, config, user, 'Reference');
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Library' }).click();
    await page.getByRole('link', { name: 'Add publication' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('radio', { name: 'Book' }).check();
    await page.getByLabel('Name', { exact: true }).fill('Tagged collection');
    const tags = page.getByRole('group', { name: 'Tags' });
    const tagInput = tags.getByRole('combobox', { name: 'Add or find a tag' });
    await tagInput.fill('reference');
    await tags.getByRole('option', { name: 'Reference' }).click();
    await tagInput.fill('Collected');
    await tags.getByRole('option', { name: 'Create tag “Collected”' }).click();
    await expect(tags.getByRole('button', { name: 'Remove Reference' })).toBeVisible();
    await expect(tags.getByRole('button', { name: 'Remove Collected' })).toBeVisible();
    const formAccessibility = await new AxeBuilder({ page }).analyze();
    expect(formAccessibility.violations).toEqual([]);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Tagged collection' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Tags', exact: true })).toHaveText(
      'CollectedReference',
    );
    await expect(page.getByRole('link', { name: 'Reference' })).toHaveCount(0);

    await page.setViewportSize({ width: 390, height: 844 });
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    await page.getByRole('button', { name: 'Edit publication' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit publication' });
    const editTags = dialog.getByRole('group', { name: 'Tags' });
    await expect(editTags.getByRole('button', { name: 'Remove Reference' })).toBeVisible();
    await editTags.getByRole('button', { name: 'Remove Reference' }).click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tagged collection' })).toBeVisible();
    await expect(dialog).toBeHidden();
    const detailTags = page
      .locator('.publication-detail-heading')
      .getByRole('list', { name: 'Tags', exact: true });
    await expect(detailTags).toHaveText('Collected');
  } finally {
    await deleteTestUser(request, user);
  }
});

test('tag catalog is owner-scoped and rejects direct writes @e2e', async ({ request }) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const catalogUrl = `${config.apiUrl}/rest/v1/tags?select=id,account_id,name&order=name.asc`;
  const revisionsUrl = `${config.apiUrl}/rest/v1/tag_catalog_revisions?select=revision`;
  const manageUrl = `${config.apiUrl}/rest/v1/rpc/manage_tag_catalog`;
  const ownerHeaders = {
    apikey: config.anonKey,
    Authorization: `Bearer ${owner.accessToken}`,
  };
  const otherHeaders = {
    apikey: config.anonKey,
    Authorization: `Bearer ${other.accessToken}`,
  };

  try {
    const ownerCatalogResponse = await request.get(catalogUrl, { headers: ownerHeaders });
    expect(ownerCatalogResponse.ok(), await ownerCatalogResponse.text()).toBeTruthy();
    expect(await ownerCatalogResponse.json()).toEqual([]);
    const ownerRevisionResponse = await request.get(revisionsUrl, { headers: ownerHeaders });
    expect(ownerRevisionResponse.ok(), await ownerRevisionResponse.text()).toBeTruthy();
    expect(await ownerRevisionResponse.json()).toEqual([{ revision: 1 }]);

    const addTag = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'add',
        p_expected_revision: 1,
        p_tag_id: null,
        p_name: '  wEeKnIgHt  ',
        p_replacement_id: null,
      },
    });
    expect(addTag.ok(), await addTag.text()).toBeTruthy();
    expect(await addTag.json()).toBe(2);

    const directWrite = await request.post(`${config.apiUrl}/rest/v1/tags`, {
      headers: { ...ownerHeaders, Prefer: 'return=representation' },
      data: { account_id: owner.id, name: 'Direct write must be rejected' },
    });
    expect(directWrite.ok()).toBe(false);

    const duplicateTag = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'add',
        p_expected_revision: 2,
        p_tag_id: null,
        p_name: 'WEEKnight',
        p_replacement_id: null,
      },
    });
    expect(duplicateTag.ok()).toBe(false);

    const staleTag = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'add',
        p_expected_revision: 1,
        p_tag_id: null,
        p_name: 'Stale tag',
        p_replacement_id: null,
      },
    });
    expect(staleTag.ok()).toBe(false);

    const longTag = await request.post(manageUrl, {
      headers: ownerHeaders,
      data: {
        p_action: 'add',
        p_expected_revision: 2,
        p_tag_id: null,
        p_name: 'x'.repeat(161),
        p_replacement_id: null,
      },
    });
    expect(longTag.ok()).toBe(false);

    const ownerCatalogAfterAdd = await request.get(catalogUrl, { headers: ownerHeaders });
    expect(await ownerCatalogAfterAdd.json()).toEqual([
      { id: expect.any(String), account_id: owner.id, name: 'wEeKnIgHt' },
    ]);
    const ownerHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/tag_catalog_history?select=actor_user_id,event_type,before_data,after_data&order=created_at.asc`,
      { headers: ownerHeaders },
    );
    expect(ownerHistoryResponse.ok(), await ownerHistoryResponse.text()).toBeTruthy();
    expect(await ownerHistoryResponse.json()).toEqual([
      {
        actor_user_id: owner.id,
        event_type: 'tag.added',
        before_data: [],
        after_data: [
          expect.objectContaining({
            id: expect.any(String),
            name: 'wEeKnIgHt',
            color_key: expect.any(String),
          }),
        ],
      },
    ]);

    const otherCatalogResponse = await request.get(catalogUrl, { headers: otherHeaders });
    expect(otherCatalogResponse.ok(), await otherCatalogResponse.text()).toBeTruthy();
    expect(await otherCatalogResponse.json()).toEqual([]);
    const otherRevisionResponse = await request.get(revisionsUrl, { headers: otherHeaders });
    expect(await otherRevisionResponse.json()).toEqual([{ revision: 1 }]);
  } finally {
    await deleteTestUser(request, owner);
    await deleteTestUser(request, other);
  }
});

test('recipe and publication tag assignments are versioned, private, and included in history @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const ownerHeadersForUser = ownerHeaders(config, owner);
  const otherTag = await addTag(request, config, other, 'Other account');

  try {
    const ownerTag = await addTag(request, config, owner, 'Weeknight');
    const createRecipe = await saveRecipeWithTags(
      request,
      config,
      owner,
      null,
      null,
      'Tagged recipe',
      [ownerTag.id],
    );
    expect(createRecipe.ok(), await createRecipe.text()).toBeTruthy();
    const [recipe] = (await createRecipe.json()) as { id: string; version: number }[];
    expect(recipe.version).toBe(1);

    const recipeHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,after_data&record_id=eq.${recipe.id}&order=created_at.asc`,
      { headers: ownerHeadersForUser },
    );
    expect(recipeHistoryResponse.ok(), await recipeHistoryResponse.text()).toBeTruthy();
    expect(await recipeHistoryResponse.json()).toEqual([
      {
        event_type: 'recipe.created',
        after_data: expect.objectContaining({
          tags: expect.arrayContaining([
            expect.objectContaining({ id: ownerTag.id, name: 'Weeknight' }),
          ]),
        }),
      },
    ]);

    const updateRecipe = await saveRecipeWithTags(
      request,
      config,
      owner,
      recipe.id,
      1,
      'Updated tagged recipe',
      [],
    );
    expect(updateRecipe.ok(), await updateRecipe.text()).toBeTruthy();
    expect(await updateRecipe.json()).toEqual([{ id: recipe.id, version: 2 }]);

    const staleRecipe = await saveRecipeWithTags(
      request,
      config,
      owner,
      recipe.id,
      1,
      'Stale recipe save',
      [otherTag.id],
    );
    expect(staleRecipe.ok()).toBe(false);
    const recipeAssignments = await request.get(
      `${config.apiUrl}/rest/v1/recipe_tags?select=tag_id&recipe_id=eq.${recipe.id}`,
      { headers: ownerHeadersForUser },
    );
    expect(await recipeAssignments.json()).toEqual([]);
    const updatedRecipeHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${recipe.id}&order=created_at.asc`,
      { headers: ownerHeadersForUser },
    );
    const updatedRecipeHistory = (await updatedRecipeHistoryResponse.json()) as {
      event_type: string;
      before_data: { tags: { id: string; name: string }[] } | null;
      after_data: { tags: { id: string; name: string }[] };
    }[];
    expect(updatedRecipeHistoryResponse.ok()).toBeTruthy();
    expect(updatedRecipeHistory).toHaveLength(2);
    expect(updatedRecipeHistory[1]).toMatchObject({
      event_type: 'recipe.updated',
      before_data: { tags: [{ id: ownerTag.id, name: 'Weeknight' }] },
      after_data: { tags: [] },
    });

    const crossAccountRecipe = await saveRecipeWithTags(
      request,
      config,
      owner,
      null,
      null,
      'Cross-account tag must fail',
      [otherTag.id],
    );
    expect(crossAccountRecipe.ok()).toBe(false);
    const rejectedRecipe = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=id&name=eq.${encodeURIComponent('Cross-account tag must fail')}`,
      { headers: ownerHeadersForUser },
    );
    expect(rejectedRecipe.ok(), await rejectedRecipe.text()).toBeTruthy();
    expect(await rejectedRecipe.json()).toEqual([]);

    const crossAccountPublication = await request.post(
      `${config.apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers: ownerHeadersForUser,
        data: {
          p_name: 'Cross-account tagged publication must fail',
          p_publication_type: 'book',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: null,
          p_tag_ids: [otherTag.id],
        },
      },
    );
    expect(crossAccountPublication.ok()).toBe(false);
    const rejectedPublication = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=id&name=eq.${encodeURIComponent('Cross-account tagged publication must fail')}`,
      { headers: ownerHeadersForUser },
    );
    expect(rejectedPublication.ok(), await rejectedPublication.text()).toBeTruthy();
    expect(await rejectedPublication.json()).toEqual([]);

    const createPublication = await request.post(
      `${config.apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers: ownerHeadersForUser,
        data: {
          p_name: 'Tagged Cookbook',
          p_publication_type: 'book',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: null,
          p_tag_ids: [ownerTag.id],
        },
      },
    );
    expect(createPublication.ok(), await createPublication.text()).toBeTruthy();
    const publicationId = (await createPublication.json()) as string;

    const publicationHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/publication_history?select=event_type,after_data&record_id=eq.${publicationId}&order=created_at.asc`,
      { headers: ownerHeadersForUser },
    );
    expect(publicationHistoryResponse.ok(), await publicationHistoryResponse.text()).toBeTruthy();
    expect(await publicationHistoryResponse.json()).toEqual([
      {
        event_type: 'publication.created',
        after_data: expect.objectContaining({
          tags: expect.arrayContaining([
            expect.objectContaining({ id: ownerTag.id, name: 'Weeknight' }),
          ]),
        }),
      },
    ]);

    const updatePublication = await request.post(
      `${config.apiUrl}/rest/v1/rpc/update_publication`,
      {
        headers: ownerHeadersForUser,
        data: {
          p_publication_id: publicationId,
          p_expected_version: 1,
          p_name: 'Tagged Cookbook',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_site_url: null,
          p_tag_ids: [],
        },
      },
    );
    expect(updatePublication.ok(), await updatePublication.text()).toBeTruthy();
    expect(await updatePublication.json()).toEqual([{ id: publicationId, version: 2 }]);
    const updatedPublicationHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/publication_history?select=event_type,before_data,after_data&record_id=eq.${publicationId}&order=created_at.asc`,
      { headers: ownerHeadersForUser },
    );
    const updatedPublicationHistory = (await updatedPublicationHistoryResponse.json()) as {
      event_type: string;
      before_data: { tags: { id: string; name: string }[] } | null;
      after_data: { tags: { id: string; name: string }[] };
    }[];
    expect(updatedPublicationHistoryResponse.ok()).toBeTruthy();
    expect(updatedPublicationHistory).toHaveLength(2);
    expect(updatedPublicationHistory[1]).toMatchObject({
      event_type: 'publication.updated',
      before_data: { tags: [{ id: ownerTag.id, name: 'Weeknight' }] },
      after_data: { tags: [] },
    });

    const stalePublication = await request.post(`${config.apiUrl}/rest/v1/rpc/update_publication`, {
      headers: ownerHeadersForUser,
      data: {
        p_publication_id: publicationId,
        p_expected_version: 1,
        p_name: 'Stale tagged publication',
        p_author: null,
        p_edition: null,
        p_isbn: null,
        p_retailer_url: null,
        p_site_url: null,
        p_tag_ids: [otherTag.id],
      },
    });
    expect(stalePublication.ok()).toBe(false);
    const publicationAssignments = await request.get(
      `${config.apiUrl}/rest/v1/publication_tags?select=tag_id&publication_id=eq.${publicationId}`,
      { headers: ownerHeadersForUser },
    );
    expect(await publicationAssignments.json()).toEqual([]);
  } finally {
    await deleteTestUser(request, other);
    await deleteTestUser(request, owner);
  }
});

test('tag merge and deletion preserve assignments without duplicates @e2e', async ({ request }) => {
  const owner = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = ownerHeaders(config, owner);

  try {
    const survivor = await addTag(request, config, owner, 'Primary');
    const absorbed = await addTag(request, config, owner, 'Secondary');
    const createRecipe = await saveRecipeWithTags(
      request,
      config,
      owner,
      null,
      null,
      'Recipe with duplicate merge tags',
      [survivor.id, absorbed.id],
    );
    expect(createRecipe.ok(), await createRecipe.text()).toBeTruthy();
    const [recipe] = (await createRecipe.json()) as { id: string; version: number }[];
    const createPublication = await request.post(
      `${config.apiUrl}/rest/v1/rpc/create_publication`,
      {
        headers,
        data: {
          p_name: 'Merge fixture publication',
          p_publication_type: 'book',
          p_author: null,
          p_edition: null,
          p_isbn: null,
          p_retailer_url: null,
          p_issue: null,
          p_site_url: null,
          p_tag_ids: [survivor.id, absorbed.id],
        },
      },
    );
    expect(createPublication.ok(), await createPublication.text()).toBeTruthy();
    const publicationId = (await createPublication.json()) as string;

    const merge = await request.post(`${config.apiUrl}/rest/v1/rpc/manage_tag_catalog`, {
      headers,
      data: {
        p_action: 'merge',
        p_expected_revision: 3,
        p_tag_id: absorbed.id,
        p_name: null,
        p_replacement_id: survivor.id,
      },
    });
    expect(merge.ok(), await merge.text()).toBeTruthy();
    expect(await merge.json()).toBe(4);

    const mergedAssignments = await request.get(
      `${config.apiUrl}/rest/v1/recipe_tags?select=tag_id&recipe_id=eq.${recipe.id}`,
      { headers },
    );
    expect(await mergedAssignments.json()).toEqual([{ tag_id: survivor.id }]);
    const mergedRecipe = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=version&id=eq.${recipe.id}`,
      { headers },
    );
    expect(await mergedRecipe.json()).toEqual([{ version: 2 }]);
    const mergedRecipeHistory = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${recipe.id}&order=created_at.asc`,
      { headers },
    );
    expect(await mergedRecipeHistory.json()).toMatchObject([
      {
        event_type: 'recipe.created',
        after_data: {
          tags: expect.arrayContaining([
            expect.objectContaining({ id: survivor.id, name: 'Primary' }),
            expect.objectContaining({ id: absorbed.id, name: 'Secondary' }),
          ]),
        },
      },
      {
        event_type: 'recipe.updated',
        before_data: {
          tags: expect.arrayContaining([
            expect.objectContaining({ id: survivor.id, name: 'Primary' }),
            expect.objectContaining({ id: absorbed.id, name: 'Secondary' }),
          ]),
        },
        after_data: {
          tags: expect.arrayContaining([
            expect.objectContaining({ id: survivor.id, name: 'Primary' }),
          ]),
        },
      },
    ]);
    const mergedPublicationAssignments = await request.get(
      `${config.apiUrl}/rest/v1/publication_tags?select=tag_id&publication_id=eq.${publicationId}`,
      { headers },
    );
    expect(await mergedPublicationAssignments.json()).toEqual([{ tag_id: survivor.id }]);
    const mergedPublication = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=version&id=eq.${publicationId}`,
      { headers },
    );
    expect(await mergedPublication.json()).toEqual([{ version: 2 }]);
    const publicationHistory = await request.get(
      `${config.apiUrl}/rest/v1/publication_history?select=event_type,after_data&record_id=eq.${publicationId}&order=created_at.asc`,
      { headers },
    );
    expect(await publicationHistory.json()).toEqual([
      expect.objectContaining({
        event_type: 'publication.created',
        after_data: expect.objectContaining({
          tags: expect.arrayContaining([
            expect.objectContaining({ id: survivor.id, name: 'Primary' }),
            expect.objectContaining({ id: absorbed.id, name: 'Secondary' }),
          ]),
        }),
      }),
      expect.objectContaining({
        event_type: 'publication.updated',
        after_data: expect.objectContaining({
          tags: expect.arrayContaining([
            expect.objectContaining({ id: survivor.id, name: 'Primary' }),
          ]),
        }),
      }),
    ]);

    const rejectAssignedDelete = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_tag_catalog`,
      {
        headers,
        data: {
          p_action: 'delete',
          p_expected_revision: 4,
          p_tag_id: survivor.id,
          p_name: null,
          p_replacement_id: null,
        },
      },
    );
    expect(rejectAssignedDelete.ok()).toBe(false);

    const replacement = await addTag(request, config, owner, 'Replacement');
    const replaceAndDelete = await request.post(`${config.apiUrl}/rest/v1/rpc/manage_tag_catalog`, {
      headers,
      data: {
        p_action: 'delete',
        p_expected_revision: 5,
        p_tag_id: survivor.id,
        p_name: null,
        p_replacement_id: replacement.id,
      },
    });
    expect(replaceAndDelete.ok(), await replaceAndDelete.text()).toBeTruthy();
    expect(await replaceAndDelete.json()).toBe(6);
    const replacementAssignments = await request.get(
      `${config.apiUrl}/rest/v1/recipe_tags?select=tag_id&recipe_id=eq.${recipe.id}`,
      { headers },
    );
    expect(await replacementAssignments.json()).toEqual([{ tag_id: replacement.id }]);
    const publicationReplacementAssignments = await request.get(
      `${config.apiUrl}/rest/v1/publication_tags?select=tag_id&publication_id=eq.${publicationId}`,
      { headers },
    );
    expect(await publicationReplacementAssignments.json()).toEqual([{ tag_id: replacement.id }]);
    const replacedRecipe = await request.get(
      `${config.apiUrl}/rest/v1/recipes?select=version&id=eq.${recipe.id}`,
      { headers },
    );
    expect(await replacedRecipe.json()).toEqual([{ version: 3 }]);
    const replacedPublication = await request.get(
      `${config.apiUrl}/rest/v1/publications?select=version&id=eq.${publicationId}`,
      { headers },
    );
    expect(await replacedPublication.json()).toEqual([{ version: 3 }]);
    const replacedRecipeHistory = await request.get(
      `${config.apiUrl}/rest/v1/recipe_history?select=event_type,before_data,after_data&record_id=eq.${recipe.id}&order=created_at.asc`,
      { headers },
    );
    const replacedRecipeEvents = (await replacedRecipeHistory.json()) as {
      event_type: string;
      before_data: { tags: { id: string; name: string }[] };
      after_data: { tags: { id: string; name: string }[] };
    }[];
    expect(replacedRecipeEvents.at(-1)).toMatchObject({
      event_type: 'recipe.updated',
      before_data: { tags: [{ id: survivor.id, name: 'Primary' }] },
      after_data: { tags: [{ id: replacement.id, name: 'Replacement' }] },
    });
    const replacedPublicationHistory = await request.get(
      `${config.apiUrl}/rest/v1/publication_history?select=event_type,before_data,after_data&record_id=eq.${publicationId}&order=created_at.asc`,
      { headers },
    );
    const replacedPublicationEvents = (await replacedPublicationHistory.json()) as {
      event_type: string;
      before_data: { tags: { id: string; name: string }[] };
      after_data: { tags: { id: string; name: string }[] };
    }[];
    expect(replacedPublicationEvents.at(-1)).toMatchObject({
      event_type: 'publication.updated',
      before_data: { tags: [{ id: survivor.id, name: 'Primary' }] },
      after_data: { tags: [{ id: replacement.id, name: 'Replacement' }] },
    });

    const catalogHistoryResponse = await request.get(
      `${config.apiUrl}/rest/v1/tag_catalog_history?select=actor_user_id,event_type,tag_id,replacement_id,affected_recipe_ids,affected_publication_ids,before_data,after_data&order=created_at.asc`,
      { headers },
    );
    expect(catalogHistoryResponse.ok(), await catalogHistoryResponse.text()).toBeTruthy();
    const catalogHistory = (await catalogHistoryResponse.json()) as {
      actor_user_id: string;
      event_type: string;
      tag_id: string | null;
      replacement_id: string | null;
      affected_recipe_ids: string[];
      affected_publication_ids: string[];
      before_data: { id: string; name: string; color_key: string }[];
      after_data: { id: string; name: string; color_key: string }[];
    }[];
    expect(catalogHistory.find((event) => event.event_type === 'tag.merged')).toMatchObject({
      actor_user_id: owner.id,
      tag_id: absorbed.id,
      replacement_id: survivor.id,
      affected_recipe_ids: [recipe.id],
      affected_publication_ids: [publicationId],
      before_data: [
        { id: survivor.id, name: 'Primary' },
        { id: absorbed.id, name: 'Secondary' },
      ],
      after_data: [{ id: survivor.id, name: 'Primary' }],
    });
    const deletedSurvivorEvent = catalogHistory.find(
      (event) => event.event_type === 'tag.deleted' && event.tag_id === survivor.id,
    );
    expect(deletedSurvivorEvent).toMatchObject({
      actor_user_id: owner.id,
      replacement_id: replacement.id,
      affected_recipe_ids: [recipe.id],
      affected_publication_ids: [publicationId],
    });
    expect(deletedSurvivorEvent?.before_data).toEqual([
      { id: survivor.id, name: 'Primary', color_key: survivor.color_key },
      { id: replacement.id, name: 'Replacement', color_key: replacement.color_key },
    ]);
    expect(deletedSurvivorEvent?.after_data).toEqual([
      { id: replacement.id, name: 'Replacement', color_key: replacement.color_key },
    ]);

    const unusedTag = await addTag(request, config, owner, 'Unused');
    const deleteUnused = await request.post(`${config.apiUrl}/rest/v1/rpc/manage_tag_catalog`, {
      headers,
      data: {
        p_action: 'delete',
        p_expected_revision: 7,
        p_tag_id: unusedTag.id,
        p_name: null,
        p_replacement_id: null,
      },
    });
    expect(deleteUnused.ok(), await deleteUnused.text()).toBeTruthy();
    expect(await deleteUnused.json()).toBe(8);
  } finally {
    await deleteTestUser(request, owner);
  }
});
