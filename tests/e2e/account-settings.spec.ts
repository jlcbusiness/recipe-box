import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  createAdminTestUser,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../support/local-supabase';

async function signInAs(page: import('@playwright/test').Page, user: TestUser) {
  await page.goto('/');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/publications$/);
}

test('account menu links to separate Username and App data pages @e2e @a11y', async ({
  page,
  request,
}, testInfo) => {
  const user = await createTestUser(request);

  try {
    await signInAs(page, user);
    await page.locator('.account-menu-trigger').click();

    const menu = page.locator('.account-menu-panel');
    if (testInfo.project.name === 'Fold 6') {
      const menuScreenshot = testInfo.outputPath('account-menu-mobile.png');
      await page.screenshot({ path: menuScreenshot });
      await testInfo.attach('Account menu mobile', {
        path: menuScreenshot,
        contentType: 'image/png',
      });
    }
    await expect(menu.getByText(user.email)).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Username' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'App data' })).toBeVisible();
    const usernameLinkBounds = await menu.getByRole('link', { name: 'Username' }).boundingBox();
    const appDataLinkBounds = await menu.getByRole('link', { name: 'App data' }).boundingBox();
    const signOutBounds = await menu.getByRole('button', { name: 'Sign out' }).boundingBox();
    expect(usernameLinkBounds).not.toBeNull();
    expect(appDataLinkBounds).not.toBeNull();
    expect(signOutBounds).not.toBeNull();
    expect((appDataLinkBounds?.y ?? 0) - (usernameLinkBounds?.y ?? 0)).toBeCloseTo(32, 0);
    expect(
      (signOutBounds?.y ?? 0) - ((appDataLinkBounds?.y ?? 0) + (appDataLinkBounds?.height ?? 0)),
    ).toBeCloseTo(8, 0);
    await expect(menu.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Administration' })).toHaveCount(0);

    await menu.getByRole('link', { name: 'Username' }).click();
    await expect(page).toHaveURL(/\/account\/username$/);
    await expect(page.getByRole('heading', { name: 'Username', level: 1 })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Username' })).toBeVisible();
    await expect(page.getByText(/appears as plain-text attribution/)).toBeVisible();
    const usernameAccessibility = await new AxeBuilder({ page })
      .include('.settings-main')
      .analyze();
    expect(usernameAccessibility.violations).toEqual([]);

    await page.locator('.account-menu-trigger').click();
    await page.locator('.account-menu-panel').getByRole('link', { name: 'App data' }).click();
    await expect(page).toHaveURL(/\/account\/app-data$/);
    await expect(page.getByRole('heading', { name: 'App data', level: 1 })).toBeVisible();
    const dataManagement = page.getByRole('region', { name: 'App data' });
    await expect(dataManagement).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wipe all account data' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export database' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import database' })).toBeVisible();
    const desktopButtons = await Promise.all([
      page.getByRole('button', { name: 'Wipe all account data' }).boundingBox(),
      page.getByRole('button', { name: 'Export database' }).boundingBox(),
      page.getByRole('button', { name: 'Import database' }).boundingBox(),
    ]);
    expect(desktopButtons.every(Boolean)).toBeTruthy();
    expect(desktopButtons[0]?.y).toBeGreaterThan(desktopButtons[2]?.y ?? 0);
    const desktopSectionBounds = await dataManagement.boundingBox();
    expect(desktopSectionBounds).not.toBeNull();
    for (const buttonBounds of desktopButtons) {
      expect(
        Math.abs(
          (buttonBounds?.x ?? 0) +
            (buttonBounds?.width ?? 0) / 2 -
            ((desktopSectionBounds?.x ?? 0) + (desktopSectionBounds?.width ?? 0) / 2),
        ),
      ).toBeLessThan(2);
    }
    const appDataAccessibility = await new AxeBuilder({ page })
      .include('.settings-data-management')
      .analyze();
    expect(appDataAccessibility.violations).toEqual([]);
    if (testInfo.project.name === 'chromium') {
      const desktopScreenshot = testInfo.outputPath('account-app-data-desktop.png');
      await page.screenshot({ path: desktopScreenshot });
      await testInfo.attach('Account App data desktop', {
        path: desktopScreenshot,
        contentType: 'image/png',
      });

      await page.setViewportSize({ width: 307, height: 629 });
      const mobileBounds = await Promise.all([
        page.getByRole('button', { name: 'Wipe all account data' }).boundingBox(),
        page.getByRole('button', { name: 'Export database' }).boundingBox(),
        page.getByRole('button', { name: 'Import database' }).boundingBox(),
        dataManagement.locator('.settings-data-management-transfers').boundingBox(),
      ]);
      expect(mobileBounds.every(Boolean)).toBeTruthy();
      expect(mobileBounds[0]?.y).toBeGreaterThan(mobileBounds[2]?.y ?? 0);
      const sectionBounds = await dataManagement.boundingBox();
      expect(sectionBounds).not.toBeNull();
      for (const buttonBounds of mobileBounds.slice(0, 3)) {
        expect(
          Math.abs(
            (buttonBounds?.x ?? 0) +
              (buttonBounds?.width ?? 0) / 2 -
              ((sectionBounds?.x ?? 0) + (sectionBounds?.width ?? 0) / 2),
          ),
        ).toBeLessThan(2);
      }
      const footerBounds = await page.getByRole('contentinfo').boundingBox();
      expect(footerBounds).not.toBeNull();
      expect(
        (footerBounds?.y ?? 0) - ((mobileBounds[0]?.y ?? 0) + (mobileBounds[0]?.height ?? 0)),
      ).toBeCloseTo(12, 0);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= window.innerWidth &&
            document.documentElement.scrollHeight <= window.innerHeight,
        ),
      ).toBeTruthy();

      const mobileScreenshot = testInfo.outputPath('account-app-data-mobile.png');
      await page.screenshot({ path: mobileScreenshot });
      await testInfo.attach('Account App data mobile', {
        path: mobileScreenshot,
        contentType: 'image/png',
      });
    }

    await page.goto('/settings');
    await expect(page.getByRole('tab', { name: 'Preferences' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Recipe data' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Account & data' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'App admin' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Updates' })).toHaveCount(0);
    await page.goto('/settings?tab=app-admin');
    await expect(page.getByRole('tab', { name: 'Preferences' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { name: 'Send an invitation' })).toHaveCount(0);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('admin workflows are Settings tabs and the legacy route redirects @e2e', async ({
  page,
  request,
}, _testInfo) => {
  const admin = await createAdminTestUser(request);

  try {
    await signInAs(page, admin);
    await page.locator('.account-menu-trigger').click();
    await expect(
      page.locator('.account-menu-panel').getByRole('link', { name: 'Username' }),
    ).toBeVisible();
    await expect(
      page.locator('.account-menu-panel').getByRole('link', { name: 'App data' }),
    ).toBeVisible();
    await expect(
      page.locator('.account-menu-panel').getByRole('link', { name: 'Administration' }),
    ).toHaveCount(0);

    await page.goto('/settings');
    const tabs = page.getByRole('tablist', { name: 'Settings areas' });
    await expect(tabs.getByRole('tab')).toHaveText([
      'Preferences',
      'Recipe data',
      'App admin',
      'Updates',
    ]);

    await page.setViewportSize({ width: 307, height: 629 });
    const tabGeometry = await tabs.evaluate((tabList) => {
      const buttons = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]'));
      return {
        clientWidth: tabList.clientWidth,
        scrollWidth: tabList.scrollWidth,
        pageWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        tabs: buttons.map((button) => {
          const bounds = button.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height, top: bounds.top };
        }),
      };
    });
    expect(tabGeometry.clientWidth).toBeGreaterThan(0);
    expect(tabGeometry.scrollWidth).toBeLessThanOrEqual(tabGeometry.clientWidth);
    expect(tabGeometry.pageWidth).toBeLessThanOrEqual(tabGeometry.viewportWidth);
    expect(new Set(tabGeometry.tabs.map((tab) => tab.top)).size).toBeGreaterThan(1);
    for (const tab of tabGeometry.tabs) {
      expect(tab.width).toBeGreaterThanOrEqual(48);
      expect(tab.height).toBeGreaterThanOrEqual(48);
    }

    await page.goto('/settings?tab=app-admin');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Account administration' })).toBeVisible();

    await page.goto('/settings?tab=updates');
    await expect(page.getByRole('tabpanel', { name: 'Updates' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Add update' })).toBeVisible();

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/settings\?tab=app-admin$/);
    await expect(page.getByRole('heading', { name: 'Account administration' })).toBeVisible();
  } finally {
    await deleteTestUser(request, admin);
  }
});
