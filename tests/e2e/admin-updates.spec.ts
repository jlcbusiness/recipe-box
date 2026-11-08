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
    const initialText = `Restore keyboard focus after saving ${runId}.`;
    const editedText = `Improve saved update guidance ${runId}.`;
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

    const partialRunRows = page
      .getByRole('row')
      .filter({ hasText: /Restore keyboard focus after saving(?: \d+)?\./ });
    while (await partialRunRows.count()) {
      const previousCount = await partialRunRows.count();
      await partialRunRows.first().getByRole('button', { name: 'Archive update' }).click();
      await expect(page.getByRole('status')).toHaveText('Update archived.');
      await expect(partialRunRows).toHaveCount(previousCount - 1, { timeout: 15_000 });
    }

    await page.getByRole('button', { name: 'Add update' }).click();
    await page
      .getByLabel('Update text')
      .fill(
        `Restore keyboard focus after **saving** ${runId}.\n\n- Keep nested lists\n  - readable`,
      );
    await page.getByLabel('Update text').press('Enter');
    await page.keyboard.type('keyboard item');
    const typePicker = page.getByRole('combobox', { name: '+ Add tag' });
    const fixOption = page.getByRole('option', { name: 'Fix', exact: true });
    if (testInfo.project.name === 'Fold 6') {
      await typePicker.tap();
      await fixOption.tap();
    } else {
      await typePicker.click();
      await fixOption.click();
    }
    await page.getByRole('button', { name: 'Submit update' }).click();
    await expect(page.getByText(initialText)).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: initialText });
    await expect(row.getByText('Fix', { exact: true })).toBeVisible();
    await expect(row.locator('ul > li > ul > li').nth(0)).toHaveText('readable');
    await expect(row.locator('ul > li > ul > li').nth(1)).toHaveText('keyboard item');
    const desktopGeometry = await page.evaluate(() => {
      const list = document.querySelector('.admin-updates-table-scroll');
      return {
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        listWidth: list?.clientWidth ?? 0,
        listScrollWidth: list?.scrollWidth ?? 0,
      };
    });
    expect(desktopGeometry.document).toBeLessThanOrEqual(desktopGeometry.viewport);
    expect(desktopGeometry.listScrollWidth).toBeLessThanOrEqual(desktopGeometry.listWidth);
    await page.screenshot({
      path: testInfo.outputPath('admin-updates-desktop.png'),
    });

    await row.getByRole('checkbox', { name: /mark .* done/i }).click();
    const versionDialog = page.getByRole('dialog', { name: 'Complete update' });
    await expect(versionDialog).toBeVisible();
    await versionDialog.getByLabel('Version').fill('01.2.3');
    await versionDialog.getByRole('button', { name: 'Submit version' }).click();
    await expect(versionDialog.getByRole('alert')).toHaveText(/standard version number/i);
    await expect(versionDialog.getByLabel('Version')).toHaveValue('01.2.3');
    await versionDialog.getByLabel('Version').fill('1.10.0');
    await versionDialog.getByRole('button', { name: 'Submit version' }).click();
    await expect(versionDialog).toBeHidden({ timeout: 15_000 });
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
    await expect(row.getByRole('checkbox', { name: /mark .* done/i })).toBeVisible({
      timeout: 15_000,
    });

    await row.getByRole('button', { name: 'Edit update' }).click();
    await page.getByLabel('Update text').fill(editedText);
    const fixPicker = page.getByRole('combobox', { name: 'Fix' });
    const featureOption = page.getByRole('option', { name: 'Feature', exact: true });
    if (testInfo.project.name === 'Fold 6') {
      await fixPicker.tap();
      await featureOption.tap();
    } else {
      await fixPicker.click();
      await featureOption.click();
    }
    await page.getByRole('button', { name: 'Submit update' }).click();
    const editedRow = page.getByRole('row').filter({ hasText: editedText });
    await expect(editedRow.getByText('Feature', { exact: true })).toBeVisible();

    await editedRow.getByRole('button', { name: 'Archive update' }).click();
    await page.getByRole('button', { name: 'Show archived updates' }).click();
    const archivedRow = page.getByRole('row').filter({ hasText: editedText });
    await expect(archivedRow).toBeVisible();
    await archivedRow.getByRole('button', { name: 'Restore update' }).click();
    await expect(archivedRow).toBeVisible();
    await page.getByRole('button', { name: 'Hide archived updates' }).click();
    await expect(archivedRow).toBeVisible();

    await page.setViewportSize({ width: 641, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      641,
    );
    await page.setViewportSize({ width: 640, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      640,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const mobileGeometry = await page.evaluate(() => {
      const list = document.querySelector('.admin-updates-table-scroll');
      return {
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        listWidth: list?.clientWidth ?? 0,
        listScrollWidth: list?.scrollWidth ?? 0,
      };
    });
    expect(mobileGeometry.document).toBeLessThanOrEqual(mobileGeometry.viewport);
    expect(mobileGeometry.listScrollWidth).toBeLessThanOrEqual(mobileGeometry.listWidth);
    const checkboxTargetHeight = await page
      .locator('.admin-update-checkbox-hit-area')
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);
    const actionTargetHeight = await page
      .getByRole('button', { name: 'Archive update' })
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(checkboxTargetHeight).toBeGreaterThanOrEqual(48);
    expect(actionTargetHeight).toBeGreaterThanOrEqual(48);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath('admin-updates-mobile.png'),
    });
    const mobileA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(mobileA11y.violations).toEqual([]);
    await page.reload();
    await page.getByRole('tab', { name: 'Updates' }).click();
    await expect(page.getByText(editedText)).toBeVisible();
    const finalRow = page.getByRole('row').filter({ hasText: editedText });
    await finalRow.getByRole('button', { name: 'Archive update' }).click();
    await expect(finalRow).toHaveCount(0);
    await page.getByRole('button', { name: 'Show archived updates' }).click();
    await expect(finalRow).toBeVisible();
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
