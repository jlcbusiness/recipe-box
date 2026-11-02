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
    await page.getByRole('button', { name: 'Reset account content' }).click();

    const dialog = page.getByRole('dialog', { name: 'Reset all account content?' });
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

    await page.getByRole('button', { name: 'Reset account content' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reset all account content?' });
    await dialog.getByLabel('Current password').fill(user.password);
    await dialog.getByRole('button', { name: 'Verify password' }).click();
    await expect(dialog.getByLabel(/Type RESET ALL CONTENT to confirm/)).toBeVisible();

    const phrase = dialog.getByLabel(/Type RESET ALL CONTENT to confirm/);
    await phrase.fill('RESET ALL CONTENT ');
    await dialog.getByRole('button', { name: 'Reset all content' }).click();
    await expect(dialog.getByRole('alert')).toContainText('exactly');
    await expect.poll(() => page.evaluate(() => caches.keys())).toContain('recipe-box-private-v1');

    await phrase.fill('RESET ALL CONTENT');
    await dialog.getByRole('button', { name: 'Reset all content' }).click();
    await expect(dialog.getByRole('status')).toContainText('Account content reset is complete.');
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .not.toContain('recipe-box-private-v1');
    await expect(page.getByRole('button', { name: 'Reset account content' })).toBeVisible();
  } finally {
    await deleteTestUser(request, user);
  }
});
