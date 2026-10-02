import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('the home route serves the accessible local workspace @e2e', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Recipe Box' })).toBeVisible();
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByText('Your local recipe workspace is ready.')).toBeVisible();
});

test('the home route has no WCAG 2 A/AA violations @a11y', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
