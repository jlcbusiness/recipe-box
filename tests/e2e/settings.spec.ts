import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/recipes$/);
}

test('Settings owns unit preferences without a navigation Units menu @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };

  try {
    await signIn(page, user.email, user.password);
    const privateNavigation = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(privateNavigation.getByLabel('Units', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Personal preferences' })).toBeVisible();
    await expect(page.locator('.units-menu-panel')).toHaveCount(0);
    const settingsWidth = (await page.locator('.settings-main').boundingBox())?.width ?? 0;
    expect(settingsWidth).toBeGreaterThan((page.viewportSize()?.width ?? 0) * 0.75);

    const volumeSelect = page.getByRole('combobox', { name: 'Volume', exact: true });
    const weightSelect = page.getByRole('combobox', { name: 'Weight', exact: true });
    await expect(volumeSelect).toContainText('US customary');
    await expect(weightSelect).toContainText('US customary');
    const volumeWidth = (await volumeSelect.boundingBox())?.width ?? 0;

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
    expect((await volumeSelect.boundingBox())?.height).toBe(36);
    expect((await weightSelect.boundingBox())?.height).toBe(36);

    await volumeSelect.focus();
    await page.keyboard.press('Tab');
    await expect(weightSelect).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(volumeSelect).toBeFocused();
    await expect(volumeSelect).toHaveCSS('outline-style', 'solid');

    if (testInfo.project.name === 'Fold 6') {
      const volumeHitHeight = await volumeSelect.evaluate((trigger) =>
        Number.parseFloat(getComputedStyle(trigger, '::before').height),
      );
      const weightHitHeight = await weightSelect.evaluate((trigger) =>
        Number.parseFloat(getComputedStyle(trigger, '::before').height),
      );
      expect(volumeHitHeight).toBeGreaterThanOrEqual(48);
      expect(weightHitHeight).toBeGreaterThanOrEqual(48);
    }

    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Saved.');
    await expect(volumeSelect).toContainText('Metric');
    await expect(weightSelect).toContainText('US customary');
    expect((await volumeSelect.boundingBox())?.width).toBeCloseTo(volumeWidth, 0);

    const volumeSaved = await request.get(
      `${config.apiUrl}/rest/v1/accounts?select=volume_system,weight_system&id=eq.${user.id}`,
      { headers },
    );
    expect(await volumeSaved.json()).toEqual([
      { volume_system: 'metric', weight_system: 'us_customary' },
    ]);

    await weightSelect.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toHaveText('Saved.');
    const bothSaved = await request.get(
      `${config.apiUrl}/rest/v1/accounts?select=volume_system,weight_system&id=eq.${user.id}`,
      { headers },
    );
    expect(await bothSaved.json()).toEqual([{ volume_system: 'metric', weight_system: 'metric' }]);

    await expect(volumeSelect).toContainText('Metric');
    await expect(weightSelect).toContainText('Metric');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('Settings redirects signed-out visitors to sign in @e2e', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByLabel('Email')).toBeVisible();
});
