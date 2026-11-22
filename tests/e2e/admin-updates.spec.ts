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

async function expectUpdatesUseSettingsTrack(page: import('@playwright/test').Page) {
  const geometry = await page.evaluate(() => {
    function bounds(selector: string) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Expected ${selector} to exist.`);
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }

    return {
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      track: bounds('.settings-main'),
      panel: bounds('.settings-tab-panel:not([hidden])'),
      updates: bounds('.admin-updates'),
      list: bounds('.admin-update-list'),
    };
  });

  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  for (const [name, element] of Object.entries({
    panel: geometry.panel,
    updates: geometry.updates,
    list: geometry.list,
  })) {
    expect(
      Math.abs(element.left - geometry.track.left),
      `${name} left edge: ${JSON.stringify(geometry)}`,
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(element.right - geometry.track.right),
      `${name} right edge: ${JSON.stringify(geometry)}`,
    ).toBeLessThanOrEqual(1);
  }
}

async function getUpdateTextGeometry(page: import('@playwright/test').Page, rowSelector: string) {
  return page.locator(rowSelector).evaluate((row) => {
    const textarea = row.querySelector<HTMLTextAreaElement>('.admin-update-inline-textarea');
    const body = row.querySelector<HTMLElement>('.admin-update-body');
    const rail = row.querySelector<HTMLElement>('.admin-update-done');
    const checkbox = row.querySelector<HTMLInputElement>('.admin-update-checkbox-hit-area input');
    const kind = row.querySelector<HTMLElement>('.admin-update-kind');
    const deleteAction = row.querySelector<HTMLElement>('.admin-update-delete-action');
    const list = row.closest<HTMLElement>('.admin-update-list');
    if (!textarea || !body || !rail || !checkbox || !kind || !list) {
      throw new Error('Expected the update row text and controls to be rendered.');
    }

    const fieldStyle = getComputedStyle(textarea);
    const gridColumns = getComputedStyle(row).gridTemplateColumns.split(/\s+/u);
    const textTrackWidth = Number.parseFloat(gridColumns[1] ?? '');
    const horizontalPadding =
      Number.parseFloat(fieldStyle.paddingLeft) + Number.parseFloat(fieldStyle.paddingRight);
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, right: rect.right, left: rect.left, bottom: rect.bottom };
    };

    return {
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      listWidth: list.clientWidth,
      listScrollWidth: list.scrollWidth,
      row: bounds(row),
      rail: bounds(rail),
      checkbox: bounds(checkbox),
      body: bounds(body),
      kind: bounds(kind),
      deleteAction: deleteAction ? bounds(deleteAction) : null,
      textContentLeft:
        textarea.getBoundingClientRect().left +
        Number.parseFloat(fieldStyle.borderLeftWidth) +
        Number.parseFloat(fieldStyle.paddingLeft),
      textContentWidth: textTrackWidth - horizontalPadding,
      textFieldWidth: textarea.getBoundingClientRect().width,
      textFieldHeight: textarea.clientHeight,
      textFieldScrollHeight: textarea.scrollHeight,
      rowPaddingRight: Number.parseFloat(getComputedStyle(row).paddingRight),
    };
  });
}

async function resizeUpdatesListToTextWidth(
  page: import('@playwright/test').Page,
  rowSelector: string,
  targetWidth: number,
) {
  await page.locator('.admin-update-list').evaluate(
    (list, { rowSelector, targetWidth }) => {
      const row = list.querySelector<HTMLElement>(rowSelector);
      const textarea = row?.querySelector<HTMLTextAreaElement>('.admin-update-inline-textarea');
      if (!row || !textarea) {
        throw new Error('Expected an update row before resizing its list container.');
      }

      list.style.width = '900px';
      list.style.maxWidth = 'none';
      const columns = getComputedStyle(row).gridTemplateColumns.split(/\s+/u);
      const textTrackWidth = Number.parseFloat(columns[1] ?? '');
      const fieldStyle = getComputedStyle(textarea);
      const horizontalPadding =
        Number.parseFloat(fieldStyle.paddingLeft) + Number.parseFloat(fieldStyle.paddingRight);
      const textContentWidth = textTrackWidth - horizontalPadding;
      list.style.width = `${list.getBoundingClientRect().width + targetWidth - textContentWidth}px`;
    },
    { rowSelector, targetWidth },
  );

  await expect
    .poll(async () => {
      const geometry = await getUpdateTextGeometry(page, rowSelector);
      return Math.abs(geometry.textContentWidth - targetWidth);
    })
    .toBeLessThan(0.5);
}

async function addUpdate(
  page: import('@playwright/test').Page,
  body: string,
  kind: 'Fix' | 'Feature',
  useTouch: boolean,
) {
  await waitForUpdatesInteractionReady(page, useTouch);
  const draft = page.getByRole('textbox', { name: 'Add update' });
  await draft.fill(body);
  await expect(draft).toHaveValue(body);
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

async function waitForUpdatesInteractionReady(
  page: import('@playwright/test').Page,
  useTouch: boolean,
) {
  const picker = page
    .locator('.admin-update-row.is-new')
    .getByRole('combobox', { name: '+ Add tag' });
  const option = page.getByRole('option', { name: 'Fix', exact: true });

  await expect
    .poll(
      async () => {
        if (await option.isVisible()) {
          return true;
        }
        if (useTouch) {
          await picker.tap();
        } else {
          await picker.click();
        }
        return option.isVisible();
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  await page.keyboard.press('Escape');
  await expect(option).toBeHidden();
}

async function cleanupTestUpdates(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  anonKey: string,
  admin: TestUser,
  marker: string,
) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${admin.accessToken}`,
  };
  const updatesResponse = await request.get(
    `${apiUrl}/rest/v1/app_updates?select=id,revision&body_markdown=like.${encodeURIComponent(`*${marker}*`)}`,
    { headers },
  );
  if (!updatesResponse.ok()) {
    throw new Error(`Could not load test updates for cleanup: ${await updatesResponse.text()}`);
  }

  const updates = (await updatesResponse.json()) as { id: string; revision: number }[];
  for (const update of updates) {
    const deleteResponse = await request.post(`${apiUrl}/rest/v1/rpc/admin_update_delete`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { p_id: update.id, p_revision: update.revision },
    });
    if (!deleteResponse.ok()) {
      throw new Error(`Could not delete test update: ${await deleteResponse.text()}`);
    }
  }
}

async function expectDialogCentered(
  page: import('@playwright/test').Page,
  dialog: import('@playwright/test').Locator,
) {
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  if (!bounds || !viewport) {
    throw new Error('The dialog and viewport must be available for the centering check.');
  }
  expect(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
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
  const isTextReflowed = await sourceRow.evaluate((element) =>
    element.classList.contains('is-text-reflowed'),
  );
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
  expect(handleBounds.x).toBeCloseTo(checkboxHitAreaBounds.x + 32, 1);
  expect(handleBounds.width).toBe(32);
  expect(handleBounds.x).toBeGreaterThanOrEqual(checkboxBounds.x + checkboxBounds.width);
  expect(gripBounds.y - sourceRowBounds.y).toBe(21);
  expect(Math.abs(handleBounds.y - sourceRowBounds.y)).toBeLessThanOrEqual(1);
  if (isTextReflowed) {
    const textContentLeft = await sourceRow
      .locator('.admin-update-inline-textarea')
      .evaluate((textarea: HTMLTextAreaElement) => {
        const style = getComputedStyle(textarea);
        const bounds = textarea.getBoundingClientRect();
        return (
          bounds.left +
          Number.parseFloat(style.borderLeftWidth) +
          Number.parseFloat(style.paddingLeft)
        );
      });
    expect(Math.abs(textContentLeft - checkboxBounds.x)).toBeLessThanOrEqual(1);
    expect(handleBounds.y + handleBounds.height).toBeLessThanOrEqual(textBounds.y + 1);
  } else {
    expect(gripToTextGap).toBe(12);
    expect(textBounds.x - checkboxHitAreaBounds.x).toBe(64);
    expect(handleBounds.x + handleBounds.width).toBeCloseTo(textBounds.x, 1);
    expect(
      Math.abs(handleBounds.y + handleBounds.height - (sourceRowBounds.y + sourceRowBounds.height)),
    ).toBeLessThanOrEqual(1);
  }
  await expect(sourceRow).toHaveCSS('transform', 'none');
  await expect(targetRow).toHaveCSS('transform', 'none');
  const targetBounds = await targetRow.boundingBox();
  if (!targetBounds) {
    throw new Error('Both update reorder targets must be visible.');
  }
  const sourceX = handleBounds.x + handleBounds.width - 1;
  const sourceY =
    Math.min(sourceRowBounds.y + sourceRowBounds.height, handleBounds.y + handleBounds.height) - 2;
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
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();
  const admin = await createAdminTestUser(request);
  const runId = `${Date.now()}-${testInfo.project.name.replace(/\s/gu, '-')}`;

  try {
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
    await expect(page).toHaveTitle('Recipe Box - Settings - Updates');
    await expect(page.getByRole('button', { name: 'Add update' })).toHaveCount(0);
    await expect(page.getByText('Done', { exact: true })).toBeVisible();
    await expect(page.getByText('Type', { exact: true })).toBeVisible();
    const useTouch = testInfo.project.name === 'Fold 6';
    await waitForUpdatesInteractionReady(page, useTouch);

    const addRow = page.locator('.admin-update-row.is-new');
    const addField = page.getByRole('textbox', { name: 'Add update' });
    await expect(addField).toBeVisible();
    await addField.fill(initialBody);
    await addField.press('Enter');
    await page.keyboard.type('keyboard item');
    const typePicker = addRow.getByRole('combobox', { name: '+ Add tag' });
    await typePicker.focus();
    await typePicker.press('ArrowDown');
    await typePicker.press('ArrowDown');
    await typePicker.press('Enter');
    await expect(page.locator('.admin-updates [role="status"]')).toHaveText('Update added.');
    await expect(addField).toHaveValue('');

    const savedRow = page.locator('.admin-update-row').filter({
      has: page.getByRole('checkbox', { name: `Mark "${savedBody.slice(0, 60)}" done` }),
    });
    await expect(savedRow).toHaveCount(1);
    await expect(savedRow.locator('textarea')).toHaveValue(savedBody);
    await expect(savedRow.getByText('Change', { exact: true })).toBeVisible();
    const changeContrast = await savedRow
      .locator('.admin-update-kind-tag')
      .evaluate((element: HTMLElement) => {
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/gu);
          if (!channels || channels.length < 3) {
            throw new Error(`Could not read the computed color: ${color}`);
          }
          const [red, green, blue] = channels
            .slice(0, 3)
            .map(Number)
            .map((value) => {
              const channel = value / 255;
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
          return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const style = getComputedStyle(element);
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        );
      });
    expect(changeContrast).toBeGreaterThanOrEqual(4.5);
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
    await expectUpdatesUseSettingsTrack(page);

    await page.reload();
    await expect(page.getByRole('tabpanel', { name: 'Updates' })).toBeVisible();
    await expect(savedRow.getByRole('combobox', { name: 'Change' })).toBeVisible();
    await waitForUpdatesInteractionReady(page, useTouch);

    const textField = row.getByRole('textbox', { name: 'Update text' });
    await textField.click();
    await textField.fill(`Discard this draft ${runId}.`);
    await textField.press('Escape');
    await expect(textField).toHaveValue(savedBody);
    await textField.click();
    await textField.fill(editedText);
    const currentTypePicker = row.getByRole('combobox', { name: 'Change' });
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
    await expectDialogCentered(page, versionDialog);
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

    for (const width of [641, 640, 473, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await expectUpdatesUseSettingsTrack(page);
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
        footerBottom:
          document.querySelector('.app-version-footer')?.getBoundingClientRect().bottom ?? 0,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    });
    expect(mobileGeometry.document).toBeLessThanOrEqual(mobileGeometry.viewport);
    expect(mobileGeometry.listScrollWidth).toBeLessThanOrEqual(mobileGeometry.listWidth);
    expect(mobileGeometry.textWidth).toBeGreaterThan(0);
    expect(mobileGeometry.textFontSize).toBe('14px');
    expect(mobileGeometry.textHeight).toBeGreaterThan(0);
    expect(mobileGeometry.textHeight).toBeGreaterThanOrEqual(mobileGeometry.textScrollHeight - 1);
    expect(mobileGeometry.rowHeight).toBeGreaterThanOrEqual(mobileGeometry.textHeight + 8);
    expect(mobileGeometry.footerTop).toBeGreaterThanOrEqual(mobileGeometry.listBottom);
    if (mobileGeometry.documentHeight > mobileGeometry.viewportHeight + 1) {
      expect(mobileGeometry.footerTop - mobileGeometry.listBottom).toBeLessThanOrEqual(1);
      expect(mobileGeometry.footerBottom).toBeGreaterThan(mobileGeometry.viewportHeight);
    } else {
      expect(
        Math.abs(mobileGeometry.footerBottom - mobileGeometry.viewportHeight),
      ).toBeLessThanOrEqual(1);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('admin-updates-mobile.png') });
    const mobileA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(mobileA11y.violations).toEqual([]);

    await row.getByRole('checkbox', { name: /done/i }).click();
    const finalCompletion = page.getByRole('dialog', { name: 'Complete update' });
    await finalCompletion.getByLabel('Version').fill('0.0.0');
    await expectDialogCentered(page, finalCompletion);
    await finalCompletion.getByRole('button', { name: 'Submit version' }).click();
    await expect(row.getByRole('button', { name: 'Done in 0.0.0' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Hide done updates' }).click();
    await expect(row).toHaveCount(0);

    await page.getByRole('button', { name: 'Show done updates' }).click();
    await expect(row).toBeVisible();
    const deleteButton = row.getByRole('button', {
      name: `Delete update: ${editedText.slice(0, 80)}`,
    });
    await expect(deleteButton).toBeVisible();
    const deleteBounds = await deleteButton.boundingBox();
    const rowBounds = await row.boundingBox();
    const kindBounds = await row.locator('.admin-update-kind').boundingBox();
    if (!deleteBounds || !rowBounds || !kindBounds) {
      throw new Error(
        'The saved update row controls must be visible for the delete geometry check.',
      );
    }
    expect(deleteBounds.width).toBeGreaterThanOrEqual(48);
    expect(deleteBounds.x).toBeGreaterThanOrEqual(kindBounds.x + kindBounds.width);
    expect(
      Math.abs(deleteBounds.x + deleteBounds.width - (rowBounds.x + rowBounds.width - 6)),
    ).toBeLessThanOrEqual(1);
    if (testInfo.project.name === 'Fold 6') {
      await deleteButton.tap();
    } else {
      await deleteButton.click();
    }
    const deleteDialog = page.getByRole('dialog', { name: 'Delete this update?' });
    await expect(deleteDialog).toBeVisible();
    await expectDialogCentered(page, deleteDialog);
    await deleteDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(deleteDialog).toBeHidden();
    await expect(row).toBeVisible();
    await expect(deleteButton).toBeFocused();
    if (testInfo.project.name === 'Fold 6') {
      await deleteButton.tap();
    } else {
      await deleteButton.click();
    }
    await deleteDialog.getByRole('button', { name: 'Delete update', exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15_000 });
  } finally {
    try {
      await cleanupTestUpdates(request, apiUrl, anonKey, admin, runId);
    } finally {
      await deleteTestUser(request, admin);
    }
  }
});

test('admins reflow update text by available content width @e2e', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(60_000);
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();
  const admin = await createAdminTestUser(request);
  const runId = `${Date.now()}-${testInfo.project.name.replace(/\s/gu, '-')}`;
  const body = `Reflow ${runId}: Keep update text readable when the row width changes.`;

  try {
    await signInAs(page, admin);
    await page.goto('/settings?tab=updates');
    await expect(page.getByRole('tabpanel', { name: 'Updates' })).toBeVisible();
    await addUpdate(page, body, 'Feature', testInfo.project.name === 'Fold 6');

    const row = updateRow(page, body);
    const updateId = await row.locator('[data-update-done]').getAttribute('data-update-done');
    expect(updateId).toBeTruthy();
    const rowSelector = `.admin-update-row[data-admin-update-id="${updateId}"]`;

    await page.setViewportSize({ width: 1280, height: 844 });
    await resizeUpdatesListToTextWidth(page, rowSelector, 192);
    await expect
      .poll(async () => {
        const geometry = await getUpdateTextGeometry(page, rowSelector);
        return Math.abs(geometry.body.top - geometry.kind.top);
      })
      .toBeLessThanOrEqual(1);
    const atThreshold = await getUpdateTextGeometry(page, rowSelector);
    expect(Math.abs(atThreshold.body.top - atThreshold.kind.top)).toBeLessThanOrEqual(1);
    await row.screenshot({ path: testInfo.outputPath('admin-update-text-at-threshold.png') });

    await resizeUpdatesListToTextWidth(page, rowSelector, 191);
    await expect
      .poll(async () => {
        const geometry = await getUpdateTextGeometry(page, rowSelector);
        return geometry.body.top >= geometry.kind.bottom - 1;
      })
      .toBe(true);
    const belowThreshold = await getUpdateTextGeometry(page, rowSelector);
    expect(belowThreshold.body.top).toBeGreaterThanOrEqual(belowThreshold.kind.bottom - 1);
    expect(
      Math.abs(belowThreshold.textContentLeft - belowThreshold.checkbox.left),
    ).toBeLessThanOrEqual(1);
    expect(belowThreshold.body.right).toBeCloseTo(
      belowThreshold.row.right - belowThreshold.rowPaddingRight,
      1,
    );
    expect(belowThreshold.textFieldWidth).toBeGreaterThan(192);
    await row.screenshot({ path: testInfo.outputPath('admin-update-text-below-threshold.png') });

    await resizeUpdatesListToTextWidth(page, rowSelector, 193);
    await expect
      .poll(async () => {
        const geometry = await getUpdateTextGeometry(page, rowSelector);
        return Math.abs(geometry.body.top - geometry.kind.top);
      })
      .toBeLessThanOrEqual(1);
    const afterContainerResize = await getUpdateTextGeometry(page, rowSelector);
    expect(
      Math.abs(afterContainerResize.body.top - afterContainerResize.kind.top),
    ).toBeLessThanOrEqual(1);

    await page.locator('.admin-update-list').evaluate((list) => {
      list.style.removeProperty('width');
      list.style.removeProperty('max-width');
    });
    await page.setViewportSize({ width: 320, height: 844 });
    await expectUpdatesUseSettingsTrack(page);
    await expect
      .poll(async () => {
        const geometry = await getUpdateTextGeometry(page, rowSelector);
        return geometry.body.top >= geometry.kind.bottom - 1;
      })
      .toBe(true);
    const narrowGeometry = await getUpdateTextGeometry(page, rowSelector);
    expect(narrowGeometry.pageWidth).toBeLessThanOrEqual(320);
    expect(narrowGeometry.listScrollWidth).toBeLessThanOrEqual(narrowGeometry.listWidth);
    expect(narrowGeometry.body.top).toBeGreaterThanOrEqual(narrowGeometry.kind.bottom - 1);
    expect(
      Math.abs(narrowGeometry.textContentLeft - narrowGeometry.checkbox.left),
    ).toBeLessThanOrEqual(1);
    expect(narrowGeometry.textContentWidth).toBeLessThan(192);
    expect(narrowGeometry.textFieldWidth).toBeGreaterThan(0);
    if (!narrowGeometry.deleteAction) {
      throw new Error('Expected the saved update delete action at 320px.');
    }
    expect(narrowGeometry.deleteAction.top).toBeLessThan(narrowGeometry.body.top);
    expect(narrowGeometry.kind.right).toBeLessThanOrEqual(
      narrowGeometry.row.right - narrowGeometry.rowPaddingRight + 1,
    );
    expect(narrowGeometry.deleteAction.right).toBeLessThanOrEqual(
      narrowGeometry.row.right - narrowGeometry.rowPaddingRight + 1,
    );
    await row.screenshot({ path: testInfo.outputPath('admin-update-text-reflow-320.png') });

    await expect(row.getByRole('checkbox', { name: /done/i })).toBeVisible();
    await expect(row.getByRole('button', { name: /Reorder update/ })).toBeVisible();
    const typePicker = row.getByRole('combobox', { name: 'Feature' });
    if (testInfo.project.name === 'Fold 6') {
      await typePicker.tap();
    } else {
      await typePicker.click();
    }
    await expect(page.getByRole('option', { name: 'Fix', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    const completionCheckbox = row.getByRole('checkbox', { name: /done/i });
    if (testInfo.project.name === 'Fold 6') {
      await completionCheckbox.tap();
    } else {
      await completionCheckbox.click();
    }
    const completionDialog = page.getByRole('dialog', { name: 'Complete update' });
    await expect(completionDialog).toBeVisible();
    await completionDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(completionDialog).toBeHidden();

    const textField = row.getByRole('textbox', { name: 'Update text' });
    if (testInfo.project.name === 'Fold 6') {
      await textField.tap();
    } else {
      await textField.click();
    }
    await textField.fill(`${body} Edited draft.`);
    await textField.press('Escape');
    await expect(textField).toHaveValue(body);

    const deleteButton = row.getByRole('button', {
      name: `Delete update: ${body.slice(0, 80)}`,
    });
    if (testInfo.project.name === 'Fold 6') {
      await deleteButton.tap();
    } else {
      await deleteButton.click();
    }
    const deleteDialog = page.getByRole('dialog', { name: 'Delete this update?' });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Delete update', exact: true }).click();
    await expect(row).toHaveCount(0);
  } finally {
    try {
      await cleanupTestUpdates(request, apiUrl, anonKey, admin, runId);
    } finally {
      await deleteTestUser(request, admin);
    }
  }
});

test('admins can reorder incomplete updates with pointer, touch, and keyboard @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(60_000);
  const config = await getLocalSupabaseConfig();
  const runId = `${Date.now()}-${testInfo.project.name.replace(/\s/gu, '-')}`;
  const admin = await createAdminTestUser(request);
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
    const reorderedIds = await Promise.all(
      [second, third, first].map(async (body) => {
        const id = await updateRow(page, body).getAttribute('data-admin-update-id');
        if (!id) throw new Error('Expected each reordered update to have a persisted ID.');
        return id;
      }),
    );
    const persistedOrderResponse = await request.get(
      `${config.apiUrl}/rest/v1/app_updates?select=id,sort_order&id=in.(${reorderedIds.join(',')})&order=sort_order.asc`,
      {
        headers: {
          apikey: config.anonKey,
          Authorization: `Bearer ${admin.accessToken}`,
        },
      },
    );
    expect(persistedOrderResponse.ok(), await persistedOrderResponse.text()).toBeTruthy();
    const persistedOrder = (await persistedOrderResponse.json()) as { id: string }[];
    expect(persistedOrder.map(({ id }) => id)).toEqual(reorderedIds);
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
    try {
      await cleanupTestUpdates(request, config.apiUrl, config.anonKey, admin, runId);
    } finally {
      await deleteTestUser(request, admin);
    }
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
