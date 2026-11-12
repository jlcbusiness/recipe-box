import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { appVersion } from '../../src/lib/app-version';
import {
  createAdminTestUser,
  createTestUser,
  deleteTestUser,
  getLocalSupabaseConfig,
  type TestUser,
} from '../support/local-supabase';

test.describe.configure({ mode: 'serial' });

async function signInAs(page: import('@playwright/test').Page, user: TestUser) {
  await page.goto('/');
  await expect(page.getByRole('contentinfo', { name: 'Application version' })).toHaveText(
    `Recipe Box v${appVersion}`,
  );
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications$/);
}

function updateRow(page: import('@playwright/test').Page, body: string) {
  return page
    .locator('.admin-update-row[data-admin-update-id]')
    .filter({ has: page.getByRole('checkbox', { name: `Mark "${body.slice(0, 60)}" done` }) });
}

async function updateOrder(
  page: import('@playwright/test').Page,
  expectedBodies: readonly string[],
) {
  return page.locator('.admin-update-row[data-admin-update-id]').evaluateAll((rows, bodies) => {
    const expected = new Set(bodies);
    return rows
      .map((row) => row.querySelector('textarea')?.value ?? '')
      .filter((body) => expected.has(body));
  }, expectedBodies);
}

async function addUpdate(
  page: import('@playwright/test').Page,
  body: string,
  kind: 'Fix' | 'Feature',
  useTouch: boolean,
) {
  await page.getByRole('textbox', { name: 'Add update' }).fill(body);
  const picker = page
    .locator('.admin-update-row.is-new')
    .getByRole('combobox', { name: '+ Add tag' });
  const option = page.getByRole('option', { name: kind, exact: true });
  if (useTouch) {
    await picker.tap();
    await option.tap();
  } else {
    await picker.click();
    await option.click();
  }
  await expect(updateRow(page, body)).toBeVisible({ timeout: 15_000 });
}

async function dragUpdate(
  page: import('@playwright/test').Page,
  sourceRow: import('@playwright/test').Locator,
  targetRow: import('@playwright/test').Locator,
  useTouch: boolean,
) {
  const sourceHandle = sourceRow.getByRole('button', { name: /^Reorder update /u });
  await expect(sourceHandle).toBeEnabled();
  await expect(sourceHandle.locator('.reorder-handle-grip')).toBeVisible();
  await expect(sourceHandle).toHaveCSS('border-width', '0px');
  await sourceHandle.evaluate((element) =>
    element.scrollIntoView({ block: 'center', inline: 'nearest' }),
  );
  const listBounds = await page.locator('.admin-update-list').boundingBox();
  const checkboxBounds = await sourceRow
    .locator('.admin-update-checkbox-hit-area input')
    .boundingBox();
  const checkboxHitAreaBounds = await sourceRow
    .locator('.admin-update-checkbox-hit-area')
    .boundingBox();
  const gripBounds = await sourceHandle.locator('.reorder-handle-grip').boundingBox();
  const handleBounds = await sourceHandle.boundingBox();
  const textBounds = await sourceRow.locator('.admin-update-inline-textarea').boundingBox();
  const sourceRowBounds = await sourceRow.boundingBox();
  if (
    !listBounds ||
    !checkboxBounds ||
    !checkboxHitAreaBounds ||
    !gripBounds ||
    !handleBounds ||
    !textBounds ||
    !sourceRowBounds
  ) {
    throw new Error('Update controls must be visible for drag.');
  }
  const checkboxInset = checkboxBounds.x - listBounds.x;
  const checkboxToGripGap = gripBounds.x - (checkboxBounds.x + checkboxBounds.width);
  const gripToTextGap = textBounds.x - (gripBounds.x + gripBounds.width);
  expect(checkboxInset).toBeGreaterThanOrEqual(12);
  expect(checkboxInset).toBeLessThanOrEqual(14);
  expect(checkboxToGripGap).toBeGreaterThanOrEqual(12);
  expect(checkboxToGripGap).toBeLessThanOrEqual(14);
  expect(gripToTextGap).toBe(12);
  expect(textBounds.x - checkboxHitAreaBounds.x).toBe(64);
  expect(handleBounds.x).toBeCloseTo(checkboxHitAreaBounds.x + 32, 1);
  expect(handleBounds.x + handleBounds.width).toBeCloseTo(textBounds.x, 1);
  expect(handleBounds.width).toBe(32);
  expect(handleBounds.x).toBeGreaterThanOrEqual(checkboxBounds.x + checkboxBounds.width);
  expect(gripBounds.y - sourceRowBounds.y).toBe(21);
  expect(Math.abs(handleBounds.y - sourceRowBounds.y)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(handleBounds.y + handleBounds.height - (sourceRowBounds.y + sourceRowBounds.height)),
  ).toBeLessThanOrEqual(1);
  await expect(sourceRow).toHaveCSS('transform', 'none');
  await expect(targetRow).toHaveCSS('transform', 'none');
  const targetBounds = await targetRow.boundingBox();
  if (!targetBounds) {
    throw new Error('Both update reorder targets must be visible.');
  }
  const sourceX = handleBounds.x + handleBounds.width - 1;
  const sourceY = sourceRowBounds.y + sourceRowBounds.height - 2;
  const selectionBeforeDrag = await sourceRow
    .locator('.admin-update-inline-textarea')
    .evaluate((textarea: HTMLTextAreaElement) => [textarea.selectionStart, textarea.selectionEnd]);
  expect(selectionBeforeDrag[0]).toBe(selectionBeforeDrag[1]);
  const targetX = targetBounds.x + targetBounds.width / 2;
  const targetY = targetBounds.y + targetBounds.height / 2;

  if (useTouch) {
    const touch = await page.context().newCDPSession(page);
    await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const touchPoint = (id: number, x: number, y: number) => ({
      id,
      x,
      y,
      radiusX: 5,
      radiusY: 5,
      force: 1,
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint(1, sourceX, sourceY)],
    });
    await expect(sourceRow).toHaveAttribute('data-reorder-state', 'dragging');
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touchPoint(1, targetX, targetY)],
    });
    await expect(sourceRow).toHaveAttribute('data-reorder-state', 'dragging');
    await expect(targetRow).toHaveAttribute('data-reorder-state', 'displaced');
    const sourcePreviewTop = (await sourceRow.boundingBox())?.y;
    const targetPreviewTop = (await targetRow.boundingBox())?.y;
    expect(sourcePreviewTop).toBeDefined();
    expect(targetPreviewTop).toBeDefined();
    expect(
      Math.abs((sourcePreviewTop ?? 0) - (sourceRowBounds.y + targetY - sourceY)),
    ).toBeLessThanOrEqual(2);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(sourceRow).toHaveCSS('transform', 'none');
    await expect(targetRow).toHaveCSS('transform', 'none');
    await expect
      .poll(() =>
        sourceRow
          .locator('.admin-update-inline-textarea')
          .evaluate((textarea: HTMLTextAreaElement) => [
            textarea.selectionStart,
            textarea.selectionEnd,
          ]),
      )
      .toEqual(selectionBeforeDrag);
    await touch.detach();
    return;
  }

  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 8 });
  await expect(sourceRow).toHaveAttribute('data-reorder-state', 'dragging');
  await expect(targetRow).toHaveAttribute('data-reorder-state', 'displaced');
  const sourcePreviewTop = (await sourceRow.boundingBox())?.y;
  const targetPreviewTop = (await targetRow.boundingBox())?.y;
  expect(sourcePreviewTop).toBeDefined();
  expect(targetPreviewTop).toBeDefined();
  expect(
    Math.abs((sourcePreviewTop ?? 0) - (sourceRowBounds.y + targetY - sourceY)),
  ).toBeLessThanOrEqual(2);
  await page.mouse.up();
  await expect(sourceRow).toHaveCSS('transform', 'none');
  await expect(targetRow).toHaveCSS('transform', 'none');
  await expect
    .poll(() =>
      sourceRow
        .locator('.admin-update-inline-textarea')
        .evaluate((textarea: HTMLTextAreaElement) => [
          textarea.selectionStart,
          textarea.selectionEnd,
        ]),
    )
    .toEqual(selectionBeforeDrag);
}

test('admins can manage classified updates and versioned completion @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(60_000);
  const admin = await createAdminTestUser(request);

  try {
    const runId = Date.now().toString();
    const initialText = `Track compact update editing ${runId}.`;
    const initialBody = `${initialText}\n\n- Keep nested lists\n  - readable`;
    const savedBody = `${initialBody}\n  - keyboard item`;
    const editedText = `Track compact update editing after save ${runId} while keeping every wrapped line visible on narrow mobile screens.`;
    await signInAs(page, admin);
    await page.goto('/settings?tab=app-admin');
    await expect(page.getByRole('contentinfo', { name: 'Application version' })).toHaveText(
      `Recipe Box v${appVersion}`,
    );
    await expect(page.getByRole('heading', { name: 'Account administration' })).toBeVisible();
    const appAdminTab = page.getByRole('tab', { name: 'App admin' });
    await expect(appAdminTab).toHaveAttribute('aria-selected', 'true');

    const updatesTab = page.getByRole('tab', { name: 'Updates' });
    await appAdminTab.press('ArrowRight');
    await expect(updatesTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Updates' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add update' })).toHaveCount(0);
    await expect(page.getByText('Done', { exact: true })).toBeVisible();
    await expect(page.getByText('Type', { exact: true })).toBeVisible();

    const addRow = page.locator('.admin-update-row.is-new');
    const addField = page.getByRole('textbox', { name: 'Add update' });
    await expect(addField).toBeVisible();
    await addField.fill(initialBody);
    await addField.press('Enter');
    await page.keyboard.type('keyboard item');
    const typePicker = addRow.getByRole('combobox', { name: '+ Add tag' });
    const fixOption = page.getByRole('option', { name: 'Fix', exact: true });
    if (testInfo.project.name === 'Fold 6') {
      await typePicker.tap();
      await fixOption.tap();
    } else {
      await typePicker.click();
      await fixOption.click();
    }
    await expect(page.locator('.admin-updates [role="status"]')).toHaveText('Update added.');
    await expect(addField).toHaveValue('');

    const savedRow = page.locator('.admin-update-row').filter({
      has: page.getByRole('checkbox', { name: `Mark "${savedBody.slice(0, 60)}" done` }),
    });
    await expect(savedRow).toHaveCount(1);
    await expect(savedRow.locator('textarea')).toHaveValue(savedBody);
    await expect(savedRow.getByText('Fix', { exact: true })).toBeVisible();
    await expect(page.locator('.admin-updates [role="status"]')).not.toBeEmpty();
    const updateId = await savedRow.locator('[data-update-done]').getAttribute('data-update-done');
    expect(updateId).toBeTruthy();
    const row = page.locator(`.admin-update-row:has([data-update-done="${updateId}"])`);
    const desktopGeometry = await page.evaluate(() => {
      const list = document.querySelector('.admin-update-list');
      const field = document.querySelector('.admin-update-row.is-new textarea');
      const navigation = document.querySelector('.private-nav');
      return {
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        viewportHeight: window.innerHeight,
        listWidth: list?.clientWidth ?? 0,
        listScrollWidth: list?.scrollWidth ?? 0,
        addFieldHeight: field?.getBoundingClientRect().height ?? 0,
        navigationPosition: navigation ? getComputedStyle(navigation).position : '',
        navigationHeight: navigation?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(desktopGeometry.document).toBeLessThanOrEqual(desktopGeometry.viewport);
    expect(desktopGeometry.listScrollWidth).toBeLessThanOrEqual(desktopGeometry.listWidth);
    expect(desktopGeometry.addFieldHeight).toBeLessThan(100);
    if (desktopGeometry.viewport > 640) {
      expect(desktopGeometry.navigationPosition).toBe('fixed');
      expect(
        Math.abs(desktopGeometry.navigationHeight - desktopGeometry.viewportHeight),
      ).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: testInfo.outputPath('admin-updates-desktop.png') });

    const textField = row.getByRole('textbox', { name: 'Update text' });
    await textField.click();
    await textField.fill(`Discard this draft ${runId}.`);
    await textField.press('Escape');
    await expect(textField).toHaveValue(savedBody);
    await textField.click();
    await textField.fill(editedText);
    const currentTypePicker = row.getByRole('combobox', { name: 'Fix' });
    const featureOption = page.getByRole('option', { name: 'Feature', exact: true });
    if (testInfo.project.name === 'Fold 6') {
      await currentTypePicker.tap();
      await featureOption.tap();
    } else {
      await currentTypePicker.click();
      await featureOption.click();
    }
    await page.getByRole('heading', { name: 'Application updates' }).click();
    await expect(page.locator('.admin-updates [role="status"]')).toHaveText('Update saved.');
    await expect(textField).toHaveValue(editedText);
    await expect(textField).toHaveAttribute('readonly', '');
    await expect(row.getByRole('combobox', { name: 'Feature' })).toBeVisible();

    await row.getByRole('checkbox', { name: /done/i }).click();
    const versionDialog = page.getByRole('dialog', { name: 'Complete update' });
    await expect(versionDialog).toBeVisible();
    await versionDialog.getByLabel('Version').fill('01.2.3');
    await versionDialog.getByRole('button', { name: 'Submit version' }).click();
    await expect(versionDialog.getByRole('alert')).toHaveText(/standard version number/i);
    await expect(versionDialog.getByLabel('Version')).toHaveValue('01.2.3');
    await versionDialog.getByLabel('Version').fill('1.10.0');
    await versionDialog.getByRole('button', { name: 'Submit version' }).click();
    await expect(versionDialog).toBeHidden({ timeout: 15_000 });
    await expect(row).toHaveCount(0);

    const showDoneButton = page.getByRole('button', { name: 'Show done updates' });
    await expect(showDoneButton).toHaveAttribute('aria-pressed', 'false');
    await expect(showDoneButton.locator('svg')).toHaveAttribute('data-visibility-state', 'hidden');
    await showDoneButton.click();
    const completedVersion = row.getByRole('button', { name: 'Done in 1.10.0' });
    await expect(completedVersion).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('button', { name: 'Hide done updates' }).locator('svg'),
    ).toHaveAttribute('data-visibility-state', 'visible');
    await expect(completedVersion).toHaveCSS('border-width', '0px');
    const doneBounds = await row.locator('.admin-update-done').boundingBox();
    const versionBounds = await completedVersion.boundingBox();
    expect(doneBounds).toBeDefined();
    expect(versionBounds).toBeDefined();
    expect(
      Math.abs(
        (versionBounds?.x ?? 0) +
          (versionBounds?.width ?? 0) / 2 -
          ((doneBounds?.x ?? 0) + (doneBounds?.width ?? 0) / 2),
      ),
    ).toBeLessThanOrEqual(1);
    await completedVersion.click();
    const correctionDialog = page.getByRole('dialog', { name: 'Update completion' });
    await correctionDialog.getByLabel('Version').fill('1.10.1');
    await correctionDialog.getByRole('button', { name: 'Submit version' }).click();
    await expect(row.getByRole('button', { name: 'Done in 1.10.1' })).toBeVisible({
      timeout: 15_000,
    });

    await row.getByRole('button', { name: 'Done in 1.10.1' }).click();
    const reopenDialog = page.getByRole('dialog', { name: 'Update completion' });
    await reopenDialog.getByLabel('Mark incomplete').check();
    await reopenDialog.getByRole('button', { name: 'Submit version' }).click();
    await expect(row.getByRole('checkbox', { name: /done/i })).toBeVisible({
      timeout: 15_000,
    });

    await expect(textField).toHaveValue(editedText);
    await expect(row.getByRole('combobox', { name: 'Feature' })).toBeVisible();

    for (const width of [641, 640, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
    await expect
      .poll(() =>
        row.locator('textarea').evaluate((field) => field.clientHeight >= field.scrollHeight - 1),
      )
      .toBe(true);
    const mobileGeometry = await page.evaluate(() => {
      const row = document.querySelector('.admin-update-row:not(.is-new) textarea');
      const list = document.querySelector('.admin-update-list');
      const rowElement = row?.closest('.admin-update-row');
      const styles = row ? getComputedStyle(row) : null;
      return {
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        listWidth: list?.clientWidth ?? 0,
        listScrollWidth: list?.scrollWidth ?? 0,
        textWidth: row?.getBoundingClientRect().width ?? 0,
        textFontSize: styles?.fontSize ?? '',
        textHeight: row?.clientHeight ?? 0,
        textScrollHeight: row?.scrollHeight ?? 0,
        rowHeight: rowElement?.getBoundingClientRect().height ?? 0,
        listBottom: list?.getBoundingClientRect().bottom ?? 0,
        footerTop: document.querySelector('.app-version-footer')?.getBoundingClientRect().top ?? 0,
      };
    });
    expect(mobileGeometry.document).toBeLessThanOrEqual(mobileGeometry.viewport);
    expect(mobileGeometry.listScrollWidth).toBeLessThanOrEqual(mobileGeometry.listWidth);
    expect(mobileGeometry.textWidth).toBeGreaterThan(0);
    expect(mobileGeometry.textFontSize).toBe('14px');
    expect(mobileGeometry.textHeight).toBeGreaterThan(0);
    expect(mobileGeometry.textHeight).toBeGreaterThanOrEqual(mobileGeometry.textScrollHeight - 1);
    expect(mobileGeometry.rowHeight).toBeGreaterThanOrEqual(mobileGeometry.textHeight + 8);
    expect(mobileGeometry.footerTop - mobileGeometry.listBottom).toBeGreaterThanOrEqual(0);
    expect(mobileGeometry.footerTop - mobileGeometry.listBottom).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('admin-updates-mobile.png') });
    const mobileA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(mobileA11y.violations).toEqual([]);

    await row.getByRole('checkbox', { name: /done/i }).click();
    const finalCompletion = page.getByRole('dialog', { name: 'Complete update' });
    await finalCompletion.getByLabel('Version').fill('0.0.0');
    await finalCompletion.getByRole('button', { name: 'Submit version' }).click();
    await expect(row.getByRole('button', { name: 'Done in 0.0.0' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Hide done updates' }).click();
    await expect(row).toHaveCount(0);
  } finally {
    await deleteTestUser(request, admin);
  }
});

test('admins can reorder incomplete updates with pointer, touch, and keyboard @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(60_000);
  const admin = await createAdminTestUser(request);
  const runId = Date.now().toString();
  const first = `First update ${runId} with a longer note to verify wrapped rows keep their position during reorder.`;
  const second = `Second update ${runId}`;
  const third = `Third update ${runId}`;
  const useTouch = testInfo.project.name === 'Fold 6';

  try {
    await signInAs(page, admin);
    await page.goto('/settings?tab=updates');
    await addUpdate(page, first, 'Fix', useTouch);
    await addUpdate(page, second, 'Feature', useTouch);
    await addUpdate(page, third, 'Fix', useTouch);

    await expect
      .poll(() => updateOrder(page, [first, second, third]))
      .toEqual([third, second, first]);
    const thirdRow = updateRow(page, third);
    const completionCheckbox = thirdRow.getByRole('checkbox', { name: /done/i });
    if (useTouch) {
      await completionCheckbox.tap();
    } else {
      await completionCheckbox.click();
    }
    const completionDialog = page.getByRole('dialog', { name: 'Complete update' });
    await expect(completionDialog).toBeVisible();
    if (useTouch) {
      await completionDialog.getByRole('button', { name: 'Cancel' }).tap();
    } else {
      await completionDialog.getByRole('button', { name: 'Cancel' }).click();
    }
    await expect(completionCheckbox).toBeVisible();

    await updateRow(page, third)
      .getByRole('button', { name: 'Reorder update 1' })
      .press('Control+ArrowDown');
    await expect(page.locator('.admin-updates [role="status"]')).toHaveText(
      `${third} moved to position 2.`,
    );
    await expect
      .poll(() => updateOrder(page, [first, second, third]))
      .toEqual([second, third, first]);

    await dragUpdate(page, updateRow(page, first), updateRow(page, second), useTouch);
    await expect(page.locator('.admin-updates [role="status"]')).toHaveText(
      `${first.slice(0, 80)} moved to position 1.`,
    );
    await expect
      .poll(() => updateOrder(page, [first, second, third]))
      .toEqual([first, second, third]);
    await page.reload();
    await page.getByRole('tab', { name: 'Updates' }).click();
    await expect
      .poll(() => updateOrder(page, [first, second, third]))
      .toEqual([first, second, third]);

    const cancelSource = updateRow(page, first);
    const cancelTarget = updateRow(page, third);
    const cancelHandle = cancelSource.getByRole('button', { name: 'Reorder update 1' });
    await cancelHandle.scrollIntoViewIfNeeded();
    const cancelSourceBounds = await cancelHandle.boundingBox();
    const cancelSourceRowBounds = await cancelSource.boundingBox();
    const cancelTargetBounds = await cancelTarget.boundingBox();
    if (!cancelSourceBounds || !cancelSourceRowBounds || !cancelTargetBounds) {
      throw new Error('Update rows must be visible for drag cancellation.');
    }
    await page.mouse.move(
      cancelSourceBounds.x + cancelSourceBounds.width - 1,
      cancelSourceRowBounds.y + 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cancelTargetBounds.x + cancelTargetBounds.width / 2,
      cancelTargetBounds.y + cancelTargetBounds.height / 2,
      { steps: 6 },
    );
    await expect(cancelSource).toHaveAttribute('data-reorder-state', 'dragging');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(cancelHandle).toBeFocused();
    await expect
      .poll(() => updateOrder(page, [first, second, third]))
      .toEqual([first, second, third]);
    await expect(page.locator('.admin-update-row[data-reorder-state]')).toHaveCount(0);

    const a11y = await new AxeBuilder({ page })
      .include('.admin-updates')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(a11y.violations).toEqual([]);

    for (const body of [first, second, third]) {
      const row = updateRow(page, body);
      await row.getByRole('checkbox', { name: /done/i }).click();
      const completionDialog = page.getByRole('dialog', { name: 'Complete update' });
      await completionDialog.getByLabel('Version').fill('0.0.0');
      await completionDialog.getByRole('button', { name: 'Submit version' }).click();
      await expect(row).toHaveCount(0);
    }
  } finally {
    await deleteTestUser(request, admin);
  }
});

test('non-admin users cannot read or change updates @e2e', async ({ page, request }) => {
  const member = await createTestUser(request);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();

  try {
    const updates = await request.get(`${apiUrl}/rest/v1/app_updates?select=id`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${member.accessToken}` },
    });
    expect(updates.ok()).toBeTruthy();
    expect(await updates.json()).toEqual([]);

    const create = await request.post(`${apiUrl}/rest/v1/rpc/admin_update_create`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${member.accessToken}`,
        'Content-Type': 'application/json',
      },
      data: { p_body_markdown: 'Forged change', p_kind: 'fix' },
    });
    expect(create.ok()).toBe(false);

    await signInAs(page, member);
    await page.goto('/settings?tab=updates');
    await expect(page.getByRole('tab', { name: 'Preferences' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: 'Updates' })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Add update' })).toHaveCount(0);
  } finally {
    await deleteTestUser(request, member);
  }
});
