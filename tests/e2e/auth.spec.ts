import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalMailpitUrl } from '../support/local-supabase';

test('rejected credentials produce an accessible sign-in error @e2e', async ({ page }) => {
  await page.goto('/');
  const faviconResponse = await page.request.get('/favicon.ico');
  expect(faviconResponse.ok()).toBe(true);
  expect(faviconResponse.headers()['content-type']).toContain('image/x-icon');
  const wordmarkLogo = page.getByRole('link', { name: 'Recipe Box home' }).locator('img');
  await expect(wordmarkLogo).toBeVisible();
  await expect(wordmarkLogo).toHaveAttribute('alt', '');
  await expect(page.locator('.topbar .workspace-label')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Recipe Box home' })).toHaveCSS(
    'white-space',
    'nowrap',
  );
  await expect
    .poll(() =>
      wordmarkLogo.evaluate(
        (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true);
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
            `${getLocalMailpitUrl()}/api/v1/search?query=${encodeURIComponent(`to:${user.email}`)}`,
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

    const messageResponse = await request.get(
      `${getLocalMailpitUrl()}/api/v1/message/${messageId}`,
    );
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
}, testInfo) => {
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
    const desktopTrashLink = page.getByRole('link', { name: 'Trash', exact: true });
    await expect(desktopTrashLink).toBeVisible();
    await expect(desktopTrashLink.locator('.private-nav-mobile-icon')).toBeHidden();
    await expect(desktopTrashLink).toHaveAttribute('href', '/recipes/trash');
    const helpLink = page.getByRole('link', { name: 'Help' });
    await expect(helpLink).toHaveAttribute('href', '/help');
    await expect(helpLink).toHaveClass(/private-nav-utility-link/u);
    const [searchBounds, trashBounds] = await Promise.all([
      page.getByRole('link', { name: 'Search' }).boundingBox(),
      desktopTrashLink.boundingBox(),
    ]);
    expect(searchBounds).not.toBeNull();
    expect(trashBounds).not.toBeNull();
    if (!searchBounds || !trashBounds) {
      throw new Error('Expected desktop Search and Trash navigation links.');
    }
    expect(trashBounds.y).toBeGreaterThan(searchBounds.y);
    if (testInfo.project.name === 'Fold 6') {
      await page.setViewportSize({ width: 307, height: 629 });
    }
    await helpLink.click();
    await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Instruction encoding' })).toBeVisible();
    const resetHelp = page.getByRole('region', { name: 'Backups and account reset' });
    await expect(resetHelp).toContainText(
      /Export database downloads a ZIP backup of your content and settings/u,
    );
    await expect(resetHelp).toContainText(/does not include recipe or publication history/u);
    await expect(resetHelp).toContainText(
      /active and trashed recipes and publications and their history/u,
    );
    await expect(resetHelp).toContainText(/tags, ingredients and nutrition data/u);
    await expect(resetHelp).toContainText(
      /Your sign-in identity, account, and admin or owner access remain/u,
    );
    await expect(resetHelp).toContainText(
      /empty Recipe Tin and shipped picklist defaults are restored/u,
    );
    await expect(resetHelp).toContainText(/Reset revokes public recipe links/u);
    await expect(resetHelp).toContainText(/does not reactivate old public links/u);
    await expect(resetHelp).toContainText(
      /ZIP files already downloaded to your devices are not deleted/u,
    );
    await expect(resetHelp).toContainText(/browser you used clears its private offline copies/u);
    await expect(resetHelp).toContainText(
      /Other signed-in devices clear old snapshots the next time they reconnect/u,
    );
    await expect(resetHelp).toContainText(
      /device kept offline can continue showing its cached data/u,
    );
    await expect(resetHelp).toContainText(/queued for daily background cleanup/u);
    await expect(resetHelp).toContainText(
      /Settings shows whether deletion is pending and lets you check again later/u,
    );
    await expect(resetHelp).toContainText(
      /reset remains incomplete until managed files are deleted/u,
    );
    await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
    await expect(page.getByText('+photo37-w240-left-steponly')).toBeVisible();
    await expect(page.getByText('#sugar-sauce-1', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Editing ingredients', level: 3 }),
    ).toBeVisible();
    await expect(page.locator('.help-shortcut-groups ul').first()).toHaveCSS(
      'list-style-type',
      'disc',
    );
    await expect(
      page.locator('.help-shortcut-groups li code').filter({ hasText: 'Ctrl+ArrowUp' }).first(),
    ).toBeVisible();
    const helpA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(helpA11y.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    if (testInfo.project.name === 'Fold 6') {
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    await page.getByRole('link', { name: 'Library' }).click();
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
    const accountMenuPanel = page.locator('.account-menu-panel');
    const desktopMenuGeometry = await page.evaluate(() => {
      const nav = document.querySelector('.private-nav');
      const trigger = document.querySelector('.account-menu-trigger');
      const panel = document.querySelector('.account-menu-panel');
      if (!nav || !trigger || !panel) {
        throw new Error('Expected the open account menu and navigation.');
      }
      const panelBounds = panel.getBoundingClientRect();
      const topElement = document.elementFromPoint(
        panelBounds.right - 8,
        panelBounds.top + panelBounds.height / 2,
      );
      return {
        navOverflow: getComputedStyle(nav).overflow,
        navZIndex: getComputedStyle(nav).zIndex,
        panelRight: panelBounds.right,
        panelLeft: panelBounds.left,
        navScrollTop: nav.scrollTop,
        topElementIsPanel: topElement === panel || panel.contains(topElement),
      };
    });
    expect(desktopMenuGeometry.navOverflow).toBe('visible');
    expect(desktopMenuGeometry.navZIndex).toBe('80');
    expect(desktopMenuGeometry.panelLeft).toBeGreaterThanOrEqual(0);
    expect(desktopMenuGeometry.panelRight).toBeLessThanOrEqual(1280);
    expect(desktopMenuGeometry.navScrollTop).toBe(0);
    expect(desktopMenuGeometry.topElementIsPanel).toBe(true);
    await expect(accountMenuPanel.getByRole('link', { name: 'Administration' })).toHaveCount(0);
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
    const mobileNav = page.getByRole('navigation', { name: 'Main navigation' });
    const mobileNavBoundsAt390 = await mobileNav.boundingBox();
    expect(mobileNavBoundsAt390?.x).toBe(0);
    expect(mobileNavBoundsAt390?.width).toBe(390);
    await expect(mobileNav).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.2)');
    const mobileLibraryLink = page.getByRole('link', { name: 'Library' });
    await expect(mobileLibraryLink).toHaveAttribute('aria-current', 'page');
    await expect(mobileLibraryLink).toHaveCSS('border-width', '2px');
    await expect(mobileLibraryLink).toHaveCSS('background-color', 'rgb(237, 244, 233)');
    await expect(mobileLibraryLink).toHaveCSS('color', 'rgb(56, 96, 68)');
    const libraryColors = await mobileLibraryLink.evaluate((link) => {
      const books = link.querySelectorAll('svg > rect, svg > path:last-child');
      if (books.length !== 2) {
        throw new Error('Expected the Library icon to contain both book shapes.');
      }
      return {
        background: getComputedStyle(link).backgroundColor,
        bookFills: Array.from(books, (book) => getComputedStyle(book).fill),
      };
    });
    const normalizeRgb = (color: string) => {
      const channels = color
        .match(/[\d.]+/gu)
        ?.map(Number)
        .slice(0, 3);
      if (channels?.length !== 3) {
        throw new Error(`Expected a computed RGB color, received ${color}.`);
      }
      return color.startsWith('color(srgb') ? channels : channels.map((channel) => channel / 255);
    };
    const backgroundChannels = normalizeRgb(libraryColors.background);
    for (const bookFill of libraryColors.bookFills) {
      const bookFillChannels = normalizeRgb(bookFill);
      expect(bookFillChannels.every((channel, index) => channel < backgroundChannels[index])).toBe(
        true,
      );
    }
    const mobileSearchLink = page.getByRole('link', { name: 'Search' });
    const mobileHelpLink = page.getByRole('link', { name: 'Help' });
    const mobileSettingsLink = page.getByRole('link', { name: 'Settings' });
    await expect(mobileLibraryLink.locator('.private-nav-mobile-icon')).toBeVisible();
    await expect(mobileSettingsLink).toHaveCSS('border-width', '1px');
    await expect(mobileHelpLink).toHaveCSS('border-width', '1px');
    await expect(mobileSearchLink.locator('.private-nav-mobile-icon')).toBeVisible();
    await expect(mobileHelpLink.locator('svg')).toBeVisible();
    await expect(mobileHelpLink.locator('svg')).toHaveCSS('width', '22px');
    await expect(mobileHelpLink.locator('svg circle')).toBeHidden();
    const helpBounds = await mobileHelpLink.boundingBox();
    const libraryBounds = await mobileLibraryLink.boundingBox();
    expect(helpBounds?.x).toBeLessThan(libraryBounds?.x ?? Number.POSITIVE_INFINITY);
    await expect(mobileSettingsLink.locator('svg')).toBeVisible();
    const mobileTrashLink = page.getByRole('link', { name: 'Trash', exact: true });
    await expect(mobileTrashLink).toBeVisible();
    await expect(mobileTrashLink.locator('.private-nav-mobile-icon')).toBeVisible();
    await expect(mobileTrashLink).toHaveCSS('order', '1');
    await page.setViewportSize({ width: 307, height: 629 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      307,
    );
    const narrowNavBounds = await mobileNav.boundingBox();
    const narrowNavItemBounds = await page
      .locator('.private-nav a, .private-nav .account-menu-trigger')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const { left, right } = element.getBoundingClientRect();
          return { left, right };
        }),
      );
    expect(narrowNavBounds?.x).toBeGreaterThanOrEqual(0);
    expect((narrowNavBounds?.x ?? 0) + (narrowNavBounds?.width ?? 0)).toBeLessThanOrEqual(307);
    expect(narrowNavItemBounds.length).toBeGreaterThan(0);
    for (const bounds of narrowNavItemBounds) {
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(307);
    }
    const narrowHelpBounds = await mobileHelpLink.boundingBox();
    const narrowLibraryBounds = await mobileLibraryLink.boundingBox();
    expect(narrowHelpBounds?.x).toBeLessThan(narrowLibraryBounds?.x ?? Number.POSITIVE_INFINITY);
    await page.setViewportSize({ width: 390, height: 844 });
    await mobileHelpLink.click();
    await expect(mobileHelpLink).toHaveCSS('border-width', '2px');
    await expect(mobileLibraryLink).toHaveCSS('border-width', '1px');
    await expect(mobileLibraryLink).toHaveCSS('background-color', 'rgb(237, 244, 233)');
    await expect(page.getByRole('heading', { name: 'Help' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const mobileHelpA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(mobileHelpA11y.violations).toEqual([]);
    await page.getByRole('link', { name: 'Library' }).click();
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
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCSS(
      'z-index',
      '80',
    );
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
    await page.setViewportSize({ width: 390, height: 844 });
    const themedLibraryLink = page.locator('.private-nav-links a[href="/publications"]');
    await expect(themedLibraryLink).toHaveCSS('background-color', 'rgb(244, 239, 233)');
    const themedLibraryColors = await themedLibraryLink.evaluate((link) => {
      const books = link.querySelectorAll('svg > rect, svg > path:last-child');
      if (books.length !== 2) {
        throw new Error('Expected the Library icon to contain both book shapes.');
      }
      return {
        background: getComputedStyle(link).backgroundColor,
        bookFills: Array.from(books, (book) => getComputedStyle(book).fill),
      };
    });
    const themedBackgroundChannels = normalizeRgb(themedLibraryColors.background);
    for (const bookFill of themedLibraryColors.bookFills) {
      const themedBookFillChannels = normalizeRgb(bookFill);
      expect(
        themedBookFillChannels.every((channel, index) => channel < themedBackgroundChannels[index]),
      ).toBe(true);
    }
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
