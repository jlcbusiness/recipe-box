import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  createAdminTestUser,
  createTestUser,
  deleteTestUser,
  getLocalSupabaseConfig,
  type TestUser,
} from '../support/local-supabase';

async function signInAs(page: import('@playwright/test').Page, user: TestUser) {
  await page.goto('/');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications$/);
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
    const editedText = `Track compact update editing after save ${runId}.`;
    await signInAs(page, admin);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Account administration' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Accounts' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    const updatesTab = page.getByRole('tab', { name: 'Updates' });
    await updatesTab.focus();
    await page.keyboard.press('Home');
    await expect(page.getByRole('tab', { name: 'Accounts' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
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
    await page.getByRole('heading', { name: 'Application updates' }).click();

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
      return {
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        listWidth: list?.clientWidth ?? 0,
        listScrollWidth: list?.scrollWidth ?? 0,
        addFieldHeight: field?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(desktopGeometry.document).toBeLessThanOrEqual(desktopGeometry.viewport);
    expect(desktopGeometry.listScrollWidth).toBeLessThanOrEqual(desktopGeometry.listWidth);
    expect(desktopGeometry.addFieldHeight).toBeLessThan(100);
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
    await showDoneButton.click();
    await expect(row.getByRole('button', { name: 'Done in 1.10.0' })).toBeVisible({
      timeout: 15_000,
    });
    await row.getByRole('button', { name: 'Done in 1.10.0' }).click();
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
    const mobileGeometry = await page.evaluate(() => {
      const row = document.querySelector('.admin-update-row:not(.is-new) textarea');
      const list = document.querySelector('.admin-update-list');
      return {
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        listWidth: list?.clientWidth ?? 0,
        listScrollWidth: list?.scrollWidth ?? 0,
        textWidth: row?.getBoundingClientRect().width ?? 0,
      };
    });
    expect(mobileGeometry.document).toBeLessThanOrEqual(mobileGeometry.viewport);
    expect(mobileGeometry.listScrollWidth).toBeLessThanOrEqual(mobileGeometry.listWidth);
    expect(mobileGeometry.textWidth).toBeGreaterThan(0);
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
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/publications\/[0-9a-f-]+$/);
  } finally {
    await deleteTestUser(request, member);
  }
});
