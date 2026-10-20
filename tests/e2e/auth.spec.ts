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

test('Google sign-in can start without email or password @e2e', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue with Google' }).click();

  await expect(page).toHaveURL(
    (url) => url.searchParams.has('error') || url.hostname !== 'localhost' || url.pathname !== '/',
  );
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

    await page.getByRole('textbox', { name: 'New password' }).fill(user.password);
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page.locator('.auth-feedback[role="alert"]')).toHaveText(
      'Choose a password different from your current password.',
    );

    await page.getByRole('textbox', { name: 'New password' }).fill('replacement-password-84');
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('.account-menu-trigger').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill('replacement-password-84');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
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
    await expect(page).toHaveURL(/\/publications$/);

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
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/app');
    await expect(page).toHaveURL(/\/$/);

    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/publications$/);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    const desktopLibraryLink = page.getByRole('link', { name: 'Library' });
    await expect(desktopLibraryLink).toHaveAttribute('aria-current', 'page');
    await expect(desktopLibraryLink).toHaveCSS('color', 'rgb(56, 96, 68)');
    await expect(desktopLibraryLink).toHaveCSS('text-decoration-line', 'underline');
    await page.reload();
    await expect(page).toHaveURL(/\/publications$/);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Workspace' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Trash', exact: true })).toBeVisible();
    const accountTrigger = page.locator('.account-menu-trigger');
    await expect(accountTrigger).toHaveAttribute('aria-label', `Account options for ${user.email}`);
    await expect(accountTrigger.locator('.account-menu-email')).toHaveText(
      user.email.split('@')[0],
    );
    await expect(accountTrigger.locator('.account-menu-email')).toHaveCSS('white-space', 'nowrap');
    await expect(accountTrigger.locator('.account-avatar')).toBeVisible();
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
    await accountTrigger.click();
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

    const desktopA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(desktopA11y.violations).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const mobileLibraryLink = page.getByRole('link', { name: 'Library' });
    await expect(mobileLibraryLink).toHaveAttribute('aria-current', 'page');
    await expect(mobileLibraryLink).toHaveCSS('border-width', '2px');
    await expect(mobileLibraryLink).toHaveCSS('background-color', 'rgb(237, 244, 233)');
    await expect(mobileLibraryLink).toHaveCSS('color', 'rgb(56, 96, 68)');
    const mobileSearchLink = page.getByRole('link', { name: 'Search' });
    const mobileSettingsLink = page.getByRole('link', { name: 'Settings' });
    await expect(mobileLibraryLink.locator('.private-nav-mobile-icon')).toBeVisible();
    await expect(mobileSearchLink.locator('.private-nav-mobile-icon')).toBeVisible();
    await expect(mobileSettingsLink.locator('svg')).toBeVisible();
    const mobileTrashLink = page.getByRole('link', { name: 'Trash', exact: true });
    await expect(mobileTrashLink).toBeVisible();
    const mobileNavBounds = await page
      .getByRole('navigation', { name: 'Main navigation' })
      .boundingBox();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCSS(
      'position',
      'sticky',
    );
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCSS('top', '0px');
    const mobileAccountBounds = await accountTrigger.boundingBox();
    await expect(accountTrigger.locator('.account-avatar')).toBeVisible();
    await expect(accountTrigger.locator('.account-menu-email')).toBeHidden();
    expect(mobileAccountBounds?.width).toBeGreaterThanOrEqual(44);
    expect(mobileAccountBounds?.height).toBeGreaterThanOrEqual(44);
    const handPreference = await page.locator('.private-shell').getAttribute('data-hand');
    const accountEdgeGap =
      handPreference === 'left'
        ? (mobileAccountBounds?.x ?? 0) - (mobileNavBounds?.x ?? 0)
        : (mobileNavBounds?.x ?? 0) +
          (mobileNavBounds?.width ?? 0) -
          ((mobileAccountBounds?.x ?? 0) + (mobileAccountBounds?.width ?? 0));
    expect(accountEdgeGap).toBeGreaterThanOrEqual(0);
    expect(accountEdgeGap).toBeLessThanOrEqual(20);
    await accountTrigger.focus();
    await accountTrigger.press('Enter');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    const mobileA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(mobileA11y.violations).toEqual([]);

    for (const width of [641, 640]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(mobileLibraryLink).toHaveCSS('border-width', width <= 640 ? '2px' : '0px');
      await expect(mobileLibraryLink).toHaveCSS(
        'text-decoration-line',
        width <= 640 ? 'none' : 'underline',
      );
    }
    await page.goto('/recipes');
    await expect(page).toHaveURL(/\/publications\/[0-9a-f-]+$/);
    await expect(page.getByRole('heading', { name: 'Recipe Tin' })).toBeVisible();
    await page.goto('/app');
    await expect(page).toHaveURL(/\/publications$/);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await accountTrigger.click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await deleteTestUser(request, user);
  }
});
