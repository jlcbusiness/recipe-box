import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser } from '../support/local-supabase';

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications$/);
}

test('account content reset warning is accessible and Escape cancels @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();
    const dataManagement = page.getByRole('region', { name: 'Data management' });
    const wipeButton = page.getByRole('button', { name: 'Wipe all account data' });
    const transferActions = dataManagement.locator('.settings-data-management-transfers');
    const transferBounds = await transferActions.boundingBox();
    const contentBounds = await dataManagement
      .locator('.settings-data-management-content')
      .boundingBox();
    const wipeBounds = await wipeButton.boundingBox();
    const settingsViewport = page.viewportSize();
    expect(transferBounds).not.toBeNull();
    expect(contentBounds).not.toBeNull();
    expect(wipeBounds).not.toBeNull();
    expect(
      Math.abs(
        (transferBounds?.x ?? 0) +
          (transferBounds?.width ?? 0) -
          ((contentBounds?.x ?? 0) + (contentBounds?.width ?? 0)),
      ),
    ).toBeLessThan(2);
    if ((settingsViewport?.width ?? 0) > 640) {
      expect(wipeBounds?.y).toBeCloseTo(transferBounds?.y ?? 0, 0);
      expect(wipeBounds?.x).toBeLessThan(transferBounds?.x ?? 0);
    } else {
      expect(wipeBounds?.y).toBeLessThan(transferBounds?.y ?? 0);
    }

    await wipeButton.click();

    const dialog = page.getByRole('dialog', { name: 'Wipe all account data?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Active and trashed recipes');
    await expect(dialog).toContainText('Personal preferences');
    await expect(dialog).toContainText('Public recipe links');
    await expect(dialog).toContainText('offline copies');
    await expect(dialog).toContainText('admin/owner access remain');
    await expect(dialog.getByLabel('Current password')).toBeVisible();
    const dialogBounds = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(dialogBounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(dialogBounds?.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds?.y).toBeGreaterThanOrEqual(0);
    expect((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0)).toBeLessThanOrEqual(
      viewport?.width ?? 0,
    );
    expect((dialogBounds?.y ?? 0) + (dialogBounds?.height ?? 0)).toBeLessThanOrEqual(
      viewport?.height ?? 0,
    );

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    if (testInfo.project.name === 'chromium') {
      const desktopScreenshot = testInfo.outputPath('account-content-reset-desktop.png');
      await page.screenshot({ path: desktopScreenshot });
      await testInfo.attach('account-content-reset-desktop', {
        path: desktopScreenshot,
        contentType: 'image/png',
      });

      await page.setViewportSize({ width: 307, height: 629 });
      await expect(dialog).toBeVisible();
      const mobileBounds = await dialog.boundingBox();
      expect(mobileBounds).not.toBeNull();
      expect(mobileBounds?.x).toBeGreaterThanOrEqual(0);
      expect(mobileBounds?.y).toBeGreaterThanOrEqual(0);
      expect((mobileBounds?.x ?? 0) + (mobileBounds?.width ?? 0)).toBeLessThanOrEqual(307);
      expect((mobileBounds?.y ?? 0) + (mobileBounds?.height ?? 0)).toBeLessThanOrEqual(629);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBeTruthy();
      const mobileScreenshot = testInfo.outputPath('account-content-reset-mobile.png');
      await page.screenshot({ path: mobileScreenshot });
      await testInfo.attach('account-content-reset-mobile', {
        path: mobileScreenshot,
        contentType: 'image/png',
      });
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    if (testInfo.project.name === 'chromium') {
      const mobileTransfers = await transferActions.boundingBox();
      const mobileContent = await dataManagement
        .locator('.settings-data-management-content')
        .boundingBox();
      const mobileWipe = await wipeButton.boundingBox();
      expect(mobileTransfers).not.toBeNull();
      expect(mobileContent).not.toBeNull();
      expect(mobileWipe).not.toBeNull();
      expect(
        Math.abs(
          (mobileTransfers?.x ?? 0) +
            (mobileTransfers?.width ?? 0) -
            ((mobileContent?.x ?? 0) + (mobileContent?.width ?? 0)),
        ),
      ).toBeLessThan(2);
      expect(mobileWipe?.y).toBeLessThan(mobileTransfers?.y ?? 0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBeTruthy();
    }
  } finally {
    await deleteTestUser(request, user);
  }
});

test('account content reset keeps OAuth re-authentication after URL cleanup @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.goto('/settings?content_reset_reauthenticated=1');

    const dialog = page.getByRole('dialog', { name: 'Wipe all account data?' });
    const phrase = dialog.getByLabel(/Type RESET ALL CONTENT to confirm/);
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(phrase).toBeVisible();
    await expect(dialog.getByLabel('Current password')).toBeHidden();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Wipe all account data' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Wipe all account data?' }).getByLabel('Current password'),
    ).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});

test('account content reset requires exact confirmation and clears offline snapshots @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await signIn(page, user.email, user.password);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.evaluate(async () => {
      const cache = await caches.open('recipe-box-private-v1');
      await cache.put(
        new URL('/recipes/123e4567-e89b-12d3-a456-426614174000', location.origin),
        new Response('<main>Private offline test copy</main>', {
          headers: { 'Content-Type': 'text/html' },
        }),
      );
    });

    await page.getByRole('button', { name: 'Wipe all account data' }).click();
    const dialog = page.getByRole('dialog', { name: 'Wipe all account data?' });
    await dialog.getByLabel('Current password').fill(user.password);
    await dialog.getByRole('button', { name: 'Verify password' }).click();
    await expect(dialog.getByLabel(/Type RESET ALL CONTENT to confirm/)).toBeVisible();

    const phrase = dialog.getByLabel(/Type RESET ALL CONTENT to confirm/);
    const submitButton = dialog.getByRole('button', { name: 'Wipe all account data' });
    await expect(submitButton).toBeDisabled();
    await phrase.fill('RESET ALL CONTENT ');
    await expect(submitButton).toBeDisabled();
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain('recipe-box-private-v1');

    await phrase.fill('RESET ALL CONTENT');
    await expect(submitButton).toBeEnabled();
    await submitButton.click();
    await expect(dialog.getByRole('status')).toContainText(
      'Managed media and export archives have been deleted.',
    );
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .not.toContain('recipe-box-private-v1');
    await expect(page.getByRole('button', { name: 'Wipe all account data' })).toBeVisible();

    await page.goto('/publications');
    const recipeTinCard = page
      .locator('.publication-explorer-card-collection')
      .filter({ hasText: 'Recipe Tin' });
    await expect(recipeTinCard.getByRole('link', { name: 'Recipe Tin' })).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});
