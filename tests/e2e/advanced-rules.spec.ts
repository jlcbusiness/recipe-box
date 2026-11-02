import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

test('Advanced Rules stages, validates, cancels, and compacts only on apply @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(60_000);
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  try {
    for (const name of ['alpha beta', 'beta gamma', 'gamma']) {
      const response = await request.post(`${config.apiUrl}/rest/v1/rpc/save_recipe`, {
        headers: { apikey: config.anonKey, Authorization: `Bearer ${user.accessToken}` },
        data: {
          p_recipe_id: null,
          p_expected_version: null,
          p_name: name,
          p_state: 'want_to_try',
          p_food_type_id: null,
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
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.goto('/recipes/find?tab=query&sort=name&view=list');
    await page.locator('.recipe-filter-add').click();
    await page.locator('.recipe-filter-add').click();
    await expect(page.locator('.is-staged-changed')).toHaveCount(0);
    await page.getByRole('button', { name: 'Remove filter 1', exact: true }).click();
    await expect(page.locator('.recipe-filter-deleted-row')).toContainText('Rule deleted');
    await expect(page.locator('.recipe-filter-deleted-row mark')).toHaveCount(0);
    await expect(page.locator('.recipe-filter-row')).toHaveAttribute('aria-label', 'Filter 2');
    await page.getByRole('button', { name: 'Remove filter 2', exact: true }).click();
    await expect(page.locator('.recipe-filter-deleted-row')).toHaveCount(0);
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    const rules = [
      { field: 'name', operator: 'contains', value: 'alpha' },
      { field: 'name', operator: 'contains', value: 'beta' },
      { field: 'name', operator: 'contains', value: 'gamma' },
    ];
    const params = new URLSearchParams({ tab: 'query', sort: 'name', view: 'list' });
    for (const rule of rules) params.append('filter', JSON.stringify(rule));
    await page.goto(`/recipes/find?${params}`);
    const originalUrl = page.url();
    await expect(page.locator('.is-staged-changed')).toHaveCount(0);
    const stagedValueInput = page.locator('input.recipe-filter-value-control').first();
    await stagedValueInput.fill('alpha beta');
    await expect(stagedValueInput).toHaveClass(/is-staged-changed/);
    await expect(stagedValueInput).toHaveCSS('background-color', 'rgb(255, 247, 214)');
    const valueStatusId = await stagedValueInput.getAttribute('aria-describedby');
    expect(valueStatusId).toBeTruthy();
    const valueStatus = page.locator(`[id="${valueStatusId}"]`);
    await expect(valueStatus).toHaveText('Changed, not yet applied.');
    await expect(valueStatus).toHaveClass(/visually-hidden/);
    const link = page.getByRole('button', { name: 'Advanced Rules', exact: true });
    await link.click();
    const pane = page.getByRole('dialog', { name: 'Advanced Rules', exact: true });
    const input = pane.getByRole('textbox', { name: 'Logic expression' });
    await expect(input).toBeFocused();
    await expect(pane.getByRole('list')).toContainText('alpha');
    expect(
      await pane.locator('ol').evaluate((element) => getComputedStyle(element).listStyleType),
    ).toBe('decimal');
    const paneBounds = await pane.boundingBox();
    const viewport = page.viewportSize();
    if (!paneBounds || !viewport) throw new Error('Pane and viewport must be measurable.');
    expect(paneBounds.x).toBeGreaterThanOrEqual(0);
    expect(paneBounds.x + paneBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(paneBounds.y + paneBounds.height).toBeLessThanOrEqual(viewport.height);
    await input.fill('1');
    await pane.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(pane.getByRole('alert')).toContainText('Unused rules: 2, 3');
    await input.fill('(1 AND 2) OR NOT 3');
    await pane.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(pane).toBeHidden();
    await expect(link).toBeFocused();
    await expect(page.locator('.recipe-filter-expression')).toContainText('(1 AND 2) OR NOT 3');
    await expect(page.locator('.recipe-filter-expression mark')).toHaveText('(1 AND 2) OR NOT 3');
    await expect(page.locator('.recipe-filter-expression mark')).toHaveCSS(
      'background-color',
      'rgb(255, 247, 214)',
    );
    expect(page.url()).toBe(originalUrl);
    const summary = page.locator('.recipe-filter-expression');
    const expressionStatusId = await summary.getAttribute('aria-describedby');
    expect(expressionStatusId).toBeTruthy();
    await expect(page.locator(`[id="${expressionStatusId}"]`)).toHaveText(
      'Advanced rule expression changed, not yet applied.',
    );
    await expect(summary.locator('legend')).toHaveText('Advanced rule expression');
    await expect(summary.locator('legend')).toHaveClass(/visually-hidden/);
    expect(
      await summary.locator('i').evaluate((element) => getComputedStyle(element).fontStyle),
    ).toBe('italic');
    await expect(page.getByText('Draft', { exact: true })).toHaveCount(0);
    const summaryBounds = await summary.boundingBox();
    const firstRuleBounds = await page.locator('.recipe-filter-row').first().boundingBox();
    const linkBounds = await link.boundingBox();
    const linkTextBounds = await link.locator('span').boundingBox();
    const expressionTextBounds = await summary.locator('i').boundingBox();
    const removeIconBounds = await summary.getByRole('button').locator('svg').boundingBox();
    if (
      !summaryBounds ||
      !firstRuleBounds ||
      !linkBounds ||
      !linkTextBounds ||
      !expressionTextBounds ||
      !removeIconBounds
    )
      throw new Error('Query controls must be measurable.');
    if (testInfo.project.name === 'Fold 6') {
      expect(summaryBounds.y + summaryBounds.height).toBeLessThanOrEqual(firstRuleBounds.y);
      const linkTextCenter = linkTextBounds.y + linkTextBounds.height / 2;
      const expressionTextCenter = expressionTextBounds.y + expressionTextBounds.height / 2;
      const removeIconCenter = removeIconBounds.y + removeIconBounds.height / 2;
      expect(Math.abs(linkTextCenter - expressionTextCenter)).toBeLessThanOrEqual(1);
      expect(Math.abs(linkTextCenter - removeIconCenter)).toBeLessThanOrEqual(1);
    } else {
      expect(summaryBounds.x).toBeGreaterThanOrEqual(linkBounds.x + linkBounds.width);
    }

    await link.click();
    await input.fill('1 OR 2 OR 3');
    await pane.getByRole('button', { name: 'Clear', exact: true }).click();
    await expect(input).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(page.locator('.recipe-filter-expression')).toContainText('(1 AND 2) OR NOT 3');
    await link.click();
    await input.fill('1 OR 2 OR 3');
    await pane.getByRole('button', { name: 'Cancel', exact: true }).click();
    await link.click();
    await input.fill('1 OR 2 OR 3');
    await page.mouse.click(1, 1);
    await expect(pane).toBeHidden();
    await expect(link).toBeFocused();
    await link.click();
    await expect(input).toHaveValue('(1 AND 2) OR NOT 3');
    await pane.getByRole('button', { name: 'Add', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(pane.getByRole('button', { name: 'Close Advanced Rules' })).toBeFocused();
    expect(
      (await new AxeBuilder({ page }).include('.recipe-advanced-rules-pane').analyze()).violations,
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('advanced-rules-pane.png') });
    await pane.getByRole('button', { name: 'Close Advanced Rules' }).click();
    await page.locator('.recipe-filter-apply').click();
    await expect(page).not.toHaveURL(originalUrl);
    await expect(page).toHaveURL(/[?&]query_submitted=1/);
    await expect(page.getByText('1 recipe found', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'alpha beta', exact: true })).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toHaveCount(0);
    await expect(page.locator('.is-staged-changed')).toHaveCount(0);
    await expect(page.locator('.recipe-filter-expression mark')).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('1 recipe found', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Sort descending', exact: true }).click();
    await expect(page).toHaveURL(/direction=desc/);
    await expect(summary).toContainText('(1 AND 2) OR NOT 3');
    await page.getByRole('button', { name: 'Switch to Grid view', exact: true }).click();
    await expect(page).toHaveURL(/view=grid/);
    await expect(page.getByRole('link', { name: /^alpha beta / })).toBeVisible();
    await expect
      .poll(async () => {
        const response = await request.get(
          `${config.apiUrl}/rest/v1/explorer_state?context_key=eq.recipes-find&select=state`,
          {
            headers: { apikey: config.anonKey, Authorization: `Bearer ${user.accessToken}` },
          },
        );
        expect(response.ok()).toBeTruthy();
        const saved = await response.json();
        return saved[0]?.state.view;
      })
      .toBe('grid');
    await page.goto('/recipes/find');
    await expect(page).toHaveURL(/tab=query/);
    await expect(summary).toContainText('(1 AND 2) OR NOT 3');
    await expect(page.locator('.recipe-filter-expression')).toContainText('(1 AND 2) OR NOT 3');
    await page.getByRole('button', { name: 'Remove filter 2', exact: true }).click();
    await expect(page.locator('.recipe-filter-expression')).toContainText('(1 AND 2) OR NOT 3');
    await expect(page.locator('.recipe-filter-deleted-row mark')).toHaveText('Rule deleted');
    await expect(page.locator('.recipe-filter-deleted-row mark')).toHaveCSS(
      'background-color',
      'rgb(255, 247, 214)',
    );
    expect(
      await page
        .locator('.recipe-filter-row')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label'))),
    ).toEqual(['Filter 1', 'Filter 3']);
    const deletedBuilderRule = page.locator('.recipe-filter-deleted-row');
    const builderDeletionStatusId = await deletedBuilderRule.getAttribute('aria-describedby');
    expect(builderDeletionStatusId).toBeTruthy();
    await expect(page.locator(`[id="${builderDeletionStatusId}"]`)).toContainText(
      'not yet applied',
    );
    await expect(page.locator(`[id="${builderDeletionStatusId}"]`)).toHaveClass(/visually-hidden/);
    await expect(page.locator('.recipe-filter-apply')).toBeDisabled();
    const builderError = page.locator('.recipe-filter-builder .recipe-advanced-rules-error');
    await expect(builderError).toHaveText('Remove or replace the deleted rule.');
    await expect(
      page.locator('.recipe-filter-advanced-row > .recipe-advanced-rules-error'),
    ).toHaveCount(1);
    const advancedLink = page.getByRole('button', { name: 'Advanced Rules' });
    const [linkBox, errorBox] = await Promise.all([
      advancedLink.boundingBox(),
      builderError.boundingBox(),
    ]);
    if (!linkBox || !errorBox) throw new Error('The Advanced Rules error is not visible.');
    expect(errorBox.y).toBeGreaterThanOrEqual(linkBox.y + linkBox.height);
    if (testInfo.project.name === 'Fold 6') {
      expect(errorBox.y - (linkBox.y + linkBox.height)).toBeLessThanOrEqual(1);
      const visibleTextGap = await advancedLink.evaluate((link) => {
        const range = document.createRange();
        range.selectNodeContents(link);
        const linkTextBottom = range.getBoundingClientRect().bottom;
        const error = link
          .closest('.recipe-filter-advanced-row')
          ?.querySelector('.recipe-advanced-rules-error');
        return error ? error.getBoundingClientRect().top - linkTextBottom : null;
      });
      if (visibleTextGap === null) throw new Error('The Advanced Rules error is not visible.');
      expect(visibleTextGap).toBeLessThanOrEqual(6);
      await expect(builderError).toHaveCSS('justify-self', 'center');
      await expect(builderError).toHaveCSS('text-align', 'center');
    }
    await expect(builderError).toHaveCSS('font-size', '12px');
    await expect(builderError).toHaveCSS('font-weight', '400');
    await expect(builderError).toHaveCSS('color', 'rgb(180, 62, 50)');
    const builderMissingRuleToken = page.locator(
      '.recipe-filter-expression .recipe-advanced-rules-missing-reference',
    );
    await expect(builderMissingRuleToken).toHaveText('2');
    await expect(builderMissingRuleToken).toHaveCSS('color', 'rgb(180, 62, 50)');
    await page.screenshot({ path: testInfo.outputPath('deleted-rule-builder-error.png') });
    await link.click();
    const deletedPaneRule = pane.locator('.recipe-advanced-rules-deleted-rule');
    await expect(deletedPaneRule).toContainText('Rule deleted');
    await expect(deletedPaneRule).toHaveAttribute('value', '2');
    const deletionStatusId = await deletedPaneRule.getAttribute('aria-describedby');
    expect(deletionStatusId).toBeTruthy();
    await expect(page.locator(`[id="${deletionStatusId}"]`)).toContainText('not yet applied');
    await expect(page.locator(`[id="${deletionStatusId}"]`)).toHaveClass(/visually-hidden/);
    const paneError = pane.getByRole('alert');
    await expect(paneError).toHaveText('Remove or replace the deleted rule.');
    const missingRuleToken = pane.locator('.recipe-advanced-rules-missing-reference');
    await expect(missingRuleToken).toHaveText('2');
    await expect(missingRuleToken).toHaveCSS('color', 'rgb(180, 62, 50)');
    await input.fill('(1 AND 2) OR NOT 3');
    await pane.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(pane.getByRole('alert')).toHaveText('Remove or replace the deleted rule.');
    await input.fill('1 OR NOT 3');
    await expect(pane.getByRole('alert')).toHaveCount(0);
    await expect(pane.locator('.recipe-advanced-rules-missing-reference')).toHaveCount(0);
    await pane.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.recipe-filter-apply')).toBeEnabled();
    await expect(page.locator('.recipe-filter-expression')).toContainText('1 OR NOT 3');
    expect(
      await page
        .locator('.recipe-filter-row')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label'))),
    ).toEqual(['Filter 1', 'Filter 3']);
    await page.locator('.recipe-filter-apply').click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(2);
    await expect(page.locator('.recipe-filter-expression')).toContainText('1 OR NOT 2');
    expect(
      await page
        .locator('.recipe-filter-row')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label'))),
    ).toEqual(['Filter 1', 'Filter 2']);
    const valueInput = page.locator('input.recipe-filter-value-control').first();
    // Simulate an oversized restored value beyond the text field's normal input cap.
    await valueInput.evaluate((element) => element.removeAttribute('maxlength'));
    await valueInput.fill('é'.repeat(33000));
    await expect(valueInput).toHaveValue('é'.repeat(33000));
    await expect(page.locator('.recipe-filter-builder')).toContainText('65,536 UTF-8 bytes');
    await expect(page.locator('.recipe-filter-apply')).toBeDisabled();
    await page.getByRole('button', { name: 'Advanced Rules', exact: true }).click();
    await pane.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(pane.getByRole('alert')).toContainText('65,536 UTF-8 bytes');
    await pane.getByRole('button', { name: 'Cancel', exact: true }).click();
    await valueInput.fill('alpha');
    await valueInput.evaluate((element) => element.setAttribute('maxlength', '500'));
    await expect(page.locator('.recipe-filter-apply')).toBeEnabled();
    await link.click();
    await pane.getByRole('button', { name: 'Clear', exact: true }).click();
    await pane.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(summary).toContainText('Advanced rule removed');
    await expect(summary.locator('mark')).toHaveText('Advanced rule removed');
    await link.click();
    await input.fill('1 OR NOT 2');
    await pane.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'Remove advanced rule' }).click();
    await expect(summary).toContainText('Advanced rule removed');
    await expect(page.locator('.recipe-filter-row')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath('numbered-query.png') });
    await page.locator('.recipe-filter-builder .recipe-filter-clear-all').click();
    await expect(page.locator('.recipe-filter-row')).toHaveCount(0);
    await expect(page.getByText('1 recipe found', { exact: true })).toBeVisible();
    await page.locator('.recipe-filter-apply').click();
    await expect(page.getByText('3 recipes found', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/[?&]query_submitted=1/);
    await page.getByRole('tab', { name: 'Search', exact: true }).click();
    await expect(page).not.toHaveURL(/[?&]filter=/);
    await page.getByRole('searchbox', { name: 'Search recipes' }).fill('alpha');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/[?&]query_submitted=1/);
    await page.getByRole('tab', { name: 'Query', exact: true }).click();
    await expect(page).toHaveURL(/[?&]query_submitted=1/);
    await page.locator('.recipe-filter-add').click();
    const addedField = page.locator('.recipe-filter-field-control').last();
    await expect(addedField).toHaveClass(/is-staged-changed/);
    const addedFieldStatusId = await addedField.getAttribute('aria-describedby');
    expect(addedFieldStatusId).toBeTruthy();
    await expect(page.locator(`[id="${addedFieldStatusId}"]`)).toHaveText(
      'Changed, not yet applied.',
    );
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Query keeps deleted rule slots stable until Apply compacts them @e2e', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

    const params = new URLSearchParams({
      tab: 'query',
      sort: 'name',
      view: 'list',
      query_submitted: '1',
    });
    for (const value of ['alpha', 'beta', 'gamma']) {
      params.append('filter', JSON.stringify({ field: 'name', operator: 'contains', value }));
    }
    await page.goto(`/recipes/find?${params}`);
    const entries = page.locator(
      '.recipe-filter-builder > .recipe-filter-row, .recipe-filter-builder > .recipe-filter-deleted-row',
    );
    const entryLabels = () =>
      entries.evaluateAll((elements) =>
        elements.map((element) =>
          element.classList.contains('recipe-filter-deleted-row')
            ? 'Rule deleted'
            : element.getAttribute('aria-label'),
        ),
      );
    await expect(entries).toHaveCount(3);
    await page.getByRole('button', { name: 'Remove filter 2', exact: true }).click();
    await expect(entries).toHaveCount(3);
    expect(await entryLabels()).toEqual(['Filter 1', 'Rule deleted', 'Filter 3']);
    const tombstoneBounds = await page.locator('.recipe-filter-deleted-row').boundingBox();
    const builderBounds = await page.locator('.recipe-filter-builder').boundingBox();
    if (!tombstoneBounds || !builderBounds) throw new Error('Rule rows must be measurable.');
    expect(tombstoneBounds.x).toBeGreaterThanOrEqual(builderBounds.x);
    expect(tombstoneBounds.x + tombstoneBounds.width).toBeLessThanOrEqual(
      builderBounds.x + builderBounds.width,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (testInfo.project.name === 'Fold 6') {
      const activeRows = page.locator('.recipe-filter-row');
      const firstRowBounds = await activeRows.first().boundingBox();
      const lastRowBounds = await activeRows.last().boundingBox();
      const firstNumberBounds = await activeRows
        .first()
        .locator('.recipe-filter-mobile-toggle > span')
        .boundingBox();
      const deletedNumberBounds = await page
        .locator('.recipe-filter-deleted-mobile-toggle > span')
        .boundingBox();
      const deletedLabelBounds = await page.locator('.recipe-filter-deleted-label').boundingBox();
      if (
        !firstRowBounds ||
        !lastRowBounds ||
        !firstNumberBounds ||
        !deletedNumberBounds ||
        !deletedLabelBounds
      )
        throw new Error('Mobile rule slots must be measurable.');
      expect(Math.abs(tombstoneBounds.height - firstRowBounds.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(tombstoneBounds.height - lastRowBounds.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(deletedNumberBounds.x - firstNumberBounds.x)).toBeLessThanOrEqual(1);
      const deletedRowCenter = tombstoneBounds.y + tombstoneBounds.height / 2;
      const deletedLabelCenter = deletedLabelBounds.y + deletedLabelBounds.height / 2;
      expect(Math.abs(deletedLabelCenter - deletedRowCenter)).toBeLessThanOrEqual(1);
    }

    await page.locator('.recipe-filter-add').click();
    await expect(entries).toHaveCount(4);
    expect(await entryLabels()).toEqual(['Filter 1', 'Rule deleted', 'Filter 3', 'Filter 4']);
    await page.getByRole('button', { name: 'Remove filter 4', exact: true }).click();
    expect(await entryLabels()).toEqual(['Filter 1', 'Rule deleted', 'Filter 3', 'Rule deleted']);
    await expect(page.locator('.recipe-filter-apply')).toBeEnabled();
    await page.locator('.recipe-filter-apply').click();

    await expect(page.locator('.recipe-filter-row')).toHaveCount(2);
    await expect(page.locator('.recipe-filter-deleted-row')).toHaveCount(0);
    expect(
      await page
        .locator('.recipe-filter-row')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label'))),
    ).toEqual(['Filter 1', 'Filter 2']);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Advanced Rules stays usable around responsive boundaries @e2e', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Explicit viewport coverage in desktop browser');
  test.setTimeout(60_000);
  const user = await createTestUser(request);
  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    const filter = JSON.stringify({
      field: 'name',
      operator: 'contains',
      value: 'Representative long recipe name that wraps on narrow screens',
    });
    await page.goto(
      `/recipes/find?tab=query&view=details&sort=name&filter=${encodeURIComponent(filter)}`,
    );
    for (const width of [320, 640, 719, 720, 721, 900, 1280]) {
      await page.setViewportSize({ width, height: width === 320 ? 480 : 900 });
      await page.getByRole('button', { name: 'Advanced Rules', exact: true }).click();
      const pane = page.getByRole('dialog', { name: 'Advanced Rules' });
      await pane
        .getByRole('textbox', { name: 'Logic expression' })
        .fill('NOT (1 OR NOT 1) AND (1 OR 1) AND NOT (1 OR NOT 1) AND (1 OR 1)');
      if (width === 320) {
        await page.evaluate(() => {
          const viewport = window.visualViewport;
          if (!viewport) throw new Error('Visual viewport is required for keyboard geometry test');
          Object.defineProperties(viewport, {
            height: { value: 220, configurable: true },
            offsetTop: { value: 80, configurable: true },
          });
          viewport.dispatchEvent(new Event('resize'));
        });
        await expect
          .poll(async () => {
            const bounds = await pane.boundingBox();
            return Boolean(bounds && bounds.y >= 80 && bounds.y + bounds.height <= 300);
          })
          .toBe(true);
      }
      await pane.getByRole('button', { name: 'Add', exact: true }).click();
      if (width === 320) {
        await page.evaluate(() => {
          if (!window.visualViewport) throw new Error('Expected visual viewport');
          Reflect.deleteProperty(window.visualViewport, 'height');
          Reflect.deleteProperty(window.visualViewport, 'offsetTop');
        });
      }
      const controls = page.locator('.recipe-filter-builder');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const bounds = await controls.boundingBox();
      if (!bounds) throw new Error('Query controls must be measurable');
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await expect(
        controls.getByText(width <= 720 ? "Don't add cols." : "Don't auto-select columns", {
          exact: true,
        }),
      ).toBeVisible();
      if (width <= 720) {
        const [
          advancedRowBounds,
          advancedLinkBounds,
          advancedExpressionBounds,
          advancedRemoveBounds,
          regularRemoveBounds,
          autoSelectBounds,
        ] = await Promise.all([
          page.locator('.recipe-filter-advanced-controls').boundingBox(),
          page.getByRole('button', { name: 'Advanced Rules', exact: true }).boundingBox(),
          page.locator('.recipe-filter-expression').boundingBox(),
          page.getByRole('button', { name: 'Remove advanced rule' }).boundingBox(),
          page.locator('.recipe-filter-row .recipe-filter-remove').first().boundingBox(),
          page.locator('.recipe-filter-auto-select').boundingBox(),
        ]);
        if (
          !advancedRowBounds ||
          !advancedLinkBounds ||
          !advancedExpressionBounds ||
          !advancedRemoveBounds ||
          !regularRemoveBounds ||
          !autoSelectBounds
        ) {
          throw new Error('The mobile Advanced Rules row should be measurable.');
        }
        expect(advancedLinkBounds.x + advancedLinkBounds.width).toBeCloseTo(
          advancedRowBounds.x + advancedRowBounds.width,
          0,
        );
        expect(
          Math.abs(
            advancedLinkBounds.y +
              advancedLinkBounds.height / 2 -
              (autoSelectBounds.y + autoSelectBounds.height / 2),
          ),
        ).toBeLessThanOrEqual(1);
        await expect(page.locator('.recipe-filter-expression i')).toHaveCSS('text-align', 'right');
        if (advancedExpressionBounds.y > advancedLinkBounds.y + advancedLinkBounds.height) {
          expect(advancedRemoveBounds.x).toBeCloseTo(regularRemoveBounds.x, 0);
          expect(advancedRemoveBounds.width).toBeCloseTo(regularRemoveBounds.width, 0);
          expect(advancedExpressionBounds.width).toBeCloseTo(advancedRowBounds.width, 0);
        }
      } else {
        const [
          advancedLinkBounds,
          advancedLinkTextBounds,
          advancedExpressionBounds,
          advancedExpressionTextBounds,
          advancedExpressionRemoveIconBounds,
          autoSelectBounds,
          autoSelectLabelBounds,
          autoSelectInputBounds,
        ] = await Promise.all([
          page.getByRole('button', { name: 'Advanced Rules', exact: true }).boundingBox(),
          page.locator('.recipe-filter-advanced-link span').boundingBox(),
          page.locator('.recipe-filter-expression').boundingBox(),
          page.locator('.recipe-filter-expression i').boundingBox(),
          page.locator('.recipe-filter-expression button svg').boundingBox(),
          page.locator('.recipe-filter-auto-select').boundingBox(),
          page.locator('.recipe-filter-auto-label-desktop').boundingBox(),
          page.locator('.recipe-filter-auto-select input').boundingBox(),
        ]);
        if (
          !advancedLinkBounds ||
          !advancedLinkTextBounds ||
          !advancedExpressionBounds ||
          !advancedExpressionTextBounds ||
          !advancedExpressionRemoveIconBounds ||
          !autoSelectBounds ||
          !autoSelectLabelBounds ||
          !autoSelectInputBounds
        ) {
          throw new Error('The desktop Advanced Rules controls should be measurable.');
        }
        expect(
          Math.abs(
            advancedExpressionBounds.y +
              advancedExpressionBounds.height -
              (advancedLinkBounds.y + advancedLinkBounds.height),
          ),
        ).toBeLessThan(2);
        expect(
          Math.abs(
            advancedExpressionTextBounds.y +
              advancedExpressionTextBounds.height -
              (advancedLinkTextBounds.y + advancedLinkTextBounds.height),
          ),
        ).toBeLessThan(2);
        const advancedLinkTextBottom = advancedLinkTextBounds.y + advancedLinkTextBounds.height;
        const autoSelectLabelBottom = autoSelectLabelBounds.y + autoSelectLabelBounds.height;
        expect(
          Math.abs(advancedLinkTextBottom - autoSelectLabelBottom),
          `Advanced Rules and auto-select label should align at ${width}px ` +
            `(link bottom ${advancedLinkTextBottom}, checkbox label bottom ${autoSelectLabelBottom}).`,
        ).toBeLessThan(2);
        expect(
          Math.abs(
            advancedExpressionRemoveIconBounds.y +
              advancedExpressionRemoveIconBounds.height / 2 -
              (advancedExpressionTextBounds.y + advancedExpressionTextBounds.height / 2),
          ),
        ).toBeLessThan(2);
        expect(
          Math.abs(
            autoSelectInputBounds.y +
              autoSelectInputBounds.height / 2 -
              (autoSelectLabelBounds.y + autoSelectLabelBounds.height / 2),
          ),
        ).toBeLessThan(2);
        await expect(page.locator('.recipe-filter-advanced-link span')).toHaveCSS(
          'font-size',
          '13px',
        );
        await expect(page.locator('.recipe-filter-expression i')).toHaveCSS('font-size', '13px');
        expect(advancedExpressionBounds.x).toBeGreaterThan(
          advancedLinkBounds.x + advancedLinkBounds.width,
        );
        expect(autoSelectBounds.y).toBeLessThan(advancedLinkBounds.y + advancedLinkBounds.height);
        expect(autoSelectBounds.y + autoSelectBounds.height).toBeGreaterThan(advancedLinkBounds.y);
      }
      if ([320, 720, 721, 1280].includes(width)) {
        await page.screenshot({ path: testInfo.outputPath(`advanced-query-${width}.png`) });
      }
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Query column auto-selection is limited to Details @e2e', async ({ page, request }) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

    const initialState = await request.post(`${config.apiUrl}/rest/v1/rpc/update_explorer_state`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${user.accessToken}`,
      },
      data: {
        p_context_key: 'recipes-find',
        p_state: {
          schema_version: 2,
          filters: [],
          sort: 'calories',
          direction: 'desc',
          view: 'details',
          display_preferences: { visible_columns: ['calories'], column_widths: {} },
        },
      },
    });
    expect(initialState.ok(), await initialState.text()).toBeTruthy();

    const filter = {
      field: 'advanced_rules',
      operator: 'matches',
      value: JSON.stringify({
        version: 1,
        text: '(1 AND 2) OR NOT 3',
        rules: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            field: 'name',
            operator: 'contains',
            value: 'Query Auto Select Regression',
          },
          {
            id: '00000000-0000-4000-8000-000000000002',
            field: 'publication_author',
            operator: 'is_not_empty',
          },
          {
            id: '00000000-0000-4000-8000-000000000003',
            field: 'food_type',
            operator: 'in',
            value: ['00000000-0000-4000-8000-000000000004'],
          },
        ],
      }),
    };
    const filterValue = encodeURIComponent(JSON.stringify(filter));
    for (const view of ['list', 'grid']) {
      await page.goto(
        `/recipes/find?tab=query&view=${view}&sort=calories&direction=desc&column_name=Query%20Auto%20Select%20Regression&auto_select_columns=1&filter=${filterValue}`,
      );
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.locator('.explorer-list-preferences')).not.toHaveAttribute(
        'data-visible-columns',
        /food_type/,
      );
      await expect(page).not.toHaveURL(/[?&]auto_select_columns=/);
      await expect(page.locator('.explorer-list-preferences-error')).toHaveCount(0);
    }

    await page.goto(
      `/recipes/find?tab=query&view=details&sort=calories&direction=desc&column_name=Query%20Auto%20Select%20Regression&filter=${filterValue}`,
    );
    const autoSelect = page.getByRole('checkbox');
    await expect(autoSelect).toBeVisible();
    await expect(page.locator('.explorer-list-preferences')).not.toHaveAttribute(
      'data-visible-columns',
      /food_type/,
    );
    await page.goto(
      `/recipes/find?tab=query&view=details&sort=calories&direction=desc&column_name=Query%20Auto%20Select%20Regression&auto_select_columns=1&filter=${filterValue}`,
    );
    await expect(page.locator('.explorer-list-preferences')).toHaveAttribute(
      'data-visible-columns',
      /food_type/,
    );
    await expect(page.locator('.explorer-list-preferences-error')).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]auto_select_columns=/);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('mobile Hand mirrors Search and Query attached controls @e2e', async ({
  page,
  request,
  isMobile,
}) => {
  test.skip(!isMobile, 'Mobile hand preference only');
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    for (const hand of ['left', 'right']) {
      const response = await request.patch(`${config.apiUrl}/rest/v1/accounts?id=eq.${user.id}`, {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
        data: { hand_preference: hand },
      });
      expect(response.ok()).toBeTruthy();
      for (const tab of ['search', 'query']) {
        for (const view of ['details', 'list', 'grid']) {
          await page.goto(`/recipes/find?tab=${tab}&view=${view}&sort=name`);
          await expect(page.locator('.private-shell')).toHaveAttribute('data-hand', hand);
          const controls = page.locator('.explorer-list-preferences-toolbar');
          const buttons = controls.locator(
            '.recipe-explorer-view-controls button, .recipe-explorer-view-controls a, .explorer-list-preferences-trigger',
          );
          const labels = await buttons.evaluateAll((elements) =>
            elements.map((element) => ({
              label: element.getAttribute('aria-label') ?? '',
              x: element.getBoundingClientRect().x,
            })),
          );
          const visual = [...labels].sort((a, b) => a.x - b.x);
          expect(visual.map(({ label }) => label)).toEqual(labels.map(({ label }) => label));
          await buttons.first().focus();
          for (let index = 0; index < labels.length; index++) {
            await expect(buttons.nth(index)).toBeFocused();
            if (index + 1 < labels.length) await page.keyboard.press('Tab');
          }
          expect(labels[hand === 'left' ? 0 : labels.length - 1].label).toContain('Switch to');
          if (view === 'details') {
            expect(labels[hand === 'left' ? labels.length - 1 : 0].label).toBe(
              'Choose List columns',
            );
          }
          const menuTrigger =
            view === 'details'
              ? controls.getByRole('button', { name: 'Choose List columns' })
              : controls.getByRole('combobox', { name: 'Sort by Name' });
          await menuTrigger.click();
          const menu = page.locator(
            view === 'details'
              ? '.explorer-list-preferences-popover'
              : '.recipe-explorer-sort-menu',
          );
          await expect(menu).toBeVisible();
          const menuBounds = await menu.boundingBox();
          const viewport = page.viewportSize();
          if (!menuBounds || !viewport) throw new Error('Control menu must be measurable');
          expect(menuBounds.x).toBeGreaterThanOrEqual(0);
          expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(viewport.width);
          expect(menuBounds.y).toBeGreaterThanOrEqual(0);
          expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(viewport.height);
          await page.keyboard.press('Escape');
          await expect(menuTrigger).toBeFocused();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
        }
      }
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

test('malformed Advanced Rules URL reports an error and can be cleared @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);
  const missingKeyWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Each child in a list should have a unique "key" prop')) {
      missingKeyWarnings.push(message.text());
    }
  });
  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    const filter = {
      field: 'advanced_rules',
      operator: 'matches',
      value: JSON.stringify({
        version: 1,
        text: '1 OR',
        rules: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            field: 'name',
            operator: 'contains',
            value: 'alpha',
          },
        ],
      }),
    };
    await page.goto(
      `/recipes/find?tab=query&auto_select_columns=1&filter=${encodeURIComponent(JSON.stringify(filter))}`,
    );
    await expect(page.locator('.find-recipes-count')).toContainText('Invalid Advanced Rules:');
    await expect(page.locator('.recipe-filter-apply')).toBeDisabled();
    await page.getByRole('button', { name: 'Advanced Rules', exact: true }).click();
    const pane = page.getByRole('dialog', { name: 'Advanced Rules' });
    await expect(pane.getByRole('textbox', { name: 'Logic expression' })).toHaveValue('1 OR');
    await expect(pane.getByRole('list')).toContainText('alpha');
    await pane.getByRole('button', { name: 'Clear', exact: true }).click();
    await pane.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.recipe-filter-apply')).toBeEnabled();
    await page.locator('.recipe-filter-apply').click();
    await expect(page.locator('.find-recipes-count')).not.toContainText('Invalid Advanced Rules:');
    const advanced = {
      ...filter,
      value: JSON.stringify({
        version: 1,
        text: '1',
        rules: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            field: 'name',
            operator: 'contains',
            value: 'alpha',
          },
        ],
      }),
    };
    const separateRule = { field: 'name', operator: 'contains', value: 'beta' };
    const params = new URLSearchParams({ tab: 'query', sort: 'name' });
    params.append('filter', JSON.stringify(advanced));
    params.append('filter', JSON.stringify(separateRule));
    await page.goto(`/recipes/find?${params}`);
    await expect(page.locator('.recipe-filter-row')).toHaveCount(2);
    await expect(page.locator('.recipe-filter-builder')).toContainText('Unused rules: 2');
    await page.getByRole('button', { name: 'Advanced Rules', exact: true }).click();
    await pane.getByRole('textbox', { name: 'Logic expression' }).fill('1 AND 2');
    await pane.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.recipe-filter-apply')).toBeEnabled();
    expect(missingKeyWarnings).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});
