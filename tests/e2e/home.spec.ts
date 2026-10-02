import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('the home route serves the email and password sign-in screen @e2e', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
});

test('the sign-in screen is accessible on desktop and mobile @a11y', async ({ page }) => {
  await page.goto('/');

  const desktopResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(desktopResults.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const mobileResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(mobileResults.violations).toEqual([]);
});
