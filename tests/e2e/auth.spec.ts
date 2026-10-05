import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser } from '../support/local-supabase';

test('rejected credentials produce an accessible sign-in error @e2e', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('missing-account@example.test');
  await page.getByLabel('Password').fill('incorrect-password-42');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Email or password is incorrect.', { exact: true })).toHaveAttribute(
    'role',
    'alert',
  );
  await expect(page).toHaveURL(/\/$/);
});

test('a user can reset their password through the local recovery email @e2e', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    const recoveryA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(recoveryA11y.violations).toEqual([]);

    await page.getByLabel('Email').fill(user.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'If an account exists for that email, reset instructions have been sent.',
    );

    let messageId: string | undefined;
    await expect
      .poll(
        async () => {
          const searchResponse = await request.get(
            `http://127.0.0.1:55425/api/v1/search?query=${encodeURIComponent(`to:${user.email}`)}`,
          );
          if (!searchResponse.ok()) {
            return null;
          }

          const search = await searchResponse.json();
          const message = search.messages?.find((item: { To?: { Address: string }[] }) =>
            item.To?.some((recipient) => recipient.Address.toLowerCase() === user.email),
          );
          messageId = message?.ID;
          return messageId ?? null;
        },
        { timeout: 10_000 },
      )
      .not.toBeNull();

    const messageResponse = await request.get(`http://127.0.0.1:55425/api/v1/message/${messageId}`);
    expect(messageResponse.ok()).toBeTruthy();
    const message = await messageResponse.json();
    const emailContent = `${message.HTML ?? ''}\n${message.Text ?? ''}`;
    const rawLink = emailContent.match(/href="([^"]+)"/)?.[1];
    if (!rawLink) {
      throw new Error('The recovery email did not include a link.');
    }

    await page.goto(rawLink.replace(/&amp;/g, '&'));
    await expect(page).toHaveURL(/\/reset-password$/);
    const resetA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(resetA11y.violations).toEqual([]);

    await page.getByRole('textbox', { name: 'New password' }).fill('replacement-password-84');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page).toHaveURL(/\/app$/);

    await page.locator('.account-menu-trigger').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('replacement-password-84');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('recovery and reset screens are accessible @a11y', async ({ page, request }) => {
  const user = await createTestUser(request);

  try {
    await page.goto('/forgot-password');
    const recoveryA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(recoveryA11y.violations).toEqual([]);

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);

    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    const resetA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(resetA11y.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('an account can sign in, use the private shell, and sign out @e2e @a11y', async ({
  page,
  request,
}) => {
  const user = await createTestUser(request);

  try {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/$/);

    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: 'Your private workspace' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    const accountTrigger = page.locator('.account-menu-trigger');
    await expect(accountTrigger).toHaveAttribute('aria-label', `Account options for ${user.email}`);
    await expect(accountTrigger).toContainText(user.email);
    const desktopNavBounds = await page
      .getByRole('navigation', { name: 'Main navigation' })
      .boundingBox();
    const desktopAccountBounds = await accountTrigger.boundingBox();
    expect(
      (desktopNavBounds?.y ?? 0) +
        (desktopNavBounds?.height ?? 0) -
        ((desktopAccountBounds?.y ?? 0) + (desktopAccountBounds?.height ?? 0)),
    ).toBeLessThanOrEqual(24);
    await accountTrigger.click();
    await expect(page.locator('.account-menu-panel').getByText(user.email)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await page.getByRole('heading', { name: 'Your private workspace' }).click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

    const desktopA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(desktopA11y.violations).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const mobileNavBounds = await page
      .getByRole('navigation', { name: 'Main navigation' })
      .boundingBox();
    const mobileAccountBounds = await accountTrigger.boundingBox();
    await expect(accountTrigger.locator('.account-avatar')).toBeVisible();
    await expect(accountTrigger.locator('.account-menu-email')).toBeHidden();
    expect(mobileAccountBounds?.width).toBeGreaterThanOrEqual(48);
    expect(mobileAccountBounds?.height).toBeGreaterThanOrEqual(48);
    expect(
      (mobileNavBounds?.x ?? 0) +
        (mobileNavBounds?.width ?? 0) -
        ((mobileAccountBounds?.x ?? 0) + (mobileAccountBounds?.width ?? 0)),
    ).toBeLessThanOrEqual(20);
    await accountTrigger.click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    const mobileA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(mobileA11y.violations).toEqual([]);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await deleteTestUser(request, user);
  }
});
