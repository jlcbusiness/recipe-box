import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  createAdminTestUser,
  createTestUser,
  deletePendingInviteTestUsers,
  deleteTestUser,
  deleteTestUserByEmail,
  getLocalSupabaseConfig,
} from '../support/local-supabase';

test('local self-sign-up creates a regular email/password account @e2e @a11y', async ({
  page,
  request,
}) => {
  const email = `self-signup-${crypto.randomUUID()}@example.test`;
  const password = 'local-signup-password-42';

  try {
    await page.goto('/sign-up');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

    const desktopA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(desktopA11y.violations).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const mobileA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(mobileA11y.violations).toEqual([]);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/publications$/);
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible();
    await expect(page.locator('.account-avatar')).toBeVisible();

    const config = await getLocalSupabaseConfig();
    const usersResponse = await request.get(
      `${config.apiUrl}/auth/v1/admin/users?page=1&per_page=1000`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
      },
    );
    const users = await usersResponse.json();
    const createdUser = users.users.find((user: { email?: string }) => user.email === email);
    expect(createdUser).toBeDefined();

    const accountResponse = await request.get(
      `${config.apiUrl}/rest/v1/accounts?select=id,is_admin,sign_in_method&id=eq.${createdUser.id}`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
      },
    );
    expect(await accountResponse.json()).toEqual([
      { id: createdUser.id, is_admin: false, sign_in_method: 'email_password' },
    ]);
  } finally {
    await deleteTestUserByEmail(request, email);
  }
});

test('a user cannot self-promote or change their sign-in method @e2e', async ({
  request,
  page,
}) => {
  const user = await createTestUser(request);
  const supabase = await getLocalSupabaseConfig();

  try {
    const update = await request.patch(`${supabase.apiUrl}/rest/v1/accounts?id=eq.${user.id}`, {
      headers: { apikey: supabase.anonKey, Authorization: `Bearer ${user.accessToken}` },
      data: { is_admin: true, sign_in_method: 'google' },
    });
    expect(update.ok()).toBe(false);

    const account = await request.get(
      `${supabase.apiUrl}/rest/v1/accounts?select=id,is_admin,sign_in_method&id=eq.${user.id}`,
      { headers: { apikey: supabase.anonKey, Authorization: `Bearer ${user.accessToken}` } },
    );
    expect(await account.json()).toEqual([
      { id: user.id, is_admin: false, sign_in_method: 'email_password' },
    ]);

    await page.goto('/');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/publications\/[0-9a-f-]+$/);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('an admin can invite an email, accept once, and grant admin to an existing account @e2e', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  await deletePendingInviteTestUsers(request);
  const admin = await createAdminTestUser(request);
  const recipient = `invite-${crypto.randomUUID()}@example.test`;
  const recipientPassword = 'accepted-invite-password-42';
  const config = await getLocalSupabaseConfig();
  let recipientUserId: string | undefined;

  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password').fill(admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);

    await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible();
    await page.getByRole('link', { name: 'Administration' }).click();
    await expect(page.getByRole('heading', { name: 'Account administration' })).toBeVisible();
    await page.getByLabel('Invite email').fill(recipient);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.getByRole('status')).toHaveText(`Invitation sent to ${recipient}.`);

    const getInvitedUser = async () => {
      const usersResponse = await request.get(
        `${config.apiUrl}/auth/v1/admin/users?page=1&per_page=1000`,
        {
          headers: {
            apikey: config.serviceRoleKey,
            Authorization: `Bearer ${config.serviceRoleKey}`,
          },
        },
      );
      expect(usersResponse.ok()).toBeTruthy();
      const users = await usersResponse.json();
      return users.users.find(
        (user: { email?: string }) => user.email?.toLowerCase() === recipient,
      );
    };
    await expect.poll(async () => Boolean(await getInvitedUser()), { timeout: 30_000 }).toBe(true);
    const invitedUser = await getInvitedUser();
    if (!invitedUser) throw new Error('The invited Auth user must be visible before verification.');
    expect(invitedUser.app_metadata).toMatchObject({
      invitation_pending: true,
      sign_in_method: 'email_password',
    });
    recipientUserId = invitedUser.id;

    let messageId: string | undefined;
    await expect
      .poll(
        async () => {
          const response = await request.get(
            `http://127.0.0.1:55425/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`,
          );
          if (!response.ok()) return null;

          const search = await response.json();
          const message = search.messages?.find((item: { To?: { Address: string }[] }) =>
            item.To?.some((address) => address.Address.toLowerCase() === recipient),
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
      throw new Error('The invitation email did not include a link.');
    }
    const inviteLink = rawLink.replace(/&amp;/g, '&');

    await page.goto(inviteLink);
    expect(new URL(page.url()).pathname).toBe('/complete-invite');
    await expect(page.getByRole('heading', { name: 'Finish creating your account' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const inviteA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(inviteA11y.violations).toEqual([]);
    await page.getByLabel('Create password').fill(recipientPassword);
    await page.getByRole('button', { name: 'Set password' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await expect(page.locator('.account-avatar')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });

    const invitedAccount = await request.get(
      `${config.apiUrl}/rest/v1/accounts?select=id,is_admin,sign_in_method&id=eq.${recipientUserId}`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
      },
    );
    expect(await invitedAccount.json()).toEqual([
      { id: recipientUserId, is_admin: false, sign_in_method: 'email_password' },
    ]);

    await page.locator('.account-menu-trigger').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByLabel('Email').fill(recipient);
    await page.getByLabel('Password').fill(recipientPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    const replay = await page.request.get(inviteLink);
    const replayUrl = new URL(replay.url());
    expect(replayUrl.pathname).toBe('/sign-up');
    expect(replayUrl.searchParams.get('error')).toBe('invalid-invite');
  } finally {
    if (recipientUserId) {
      await deleteTestUser(request, {
        id: recipientUserId,
        email: recipient,
        password: recipientPassword,
        accessToken: '',
      });
    }
    await deleteTestUser(request, admin);
  }
});

test('an admin can invite a Google-only account @e2e', async ({ page, request }) => {
  await deletePendingInviteTestUsers(request);
  const admin = await createAdminTestUser(request);
  const recipient = `invite-google-${crypto.randomUUID()}@example.test`;
  const config = await getLocalSupabaseConfig();
  let recipientUserId: string | undefined;

  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password').fill(admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.goto('/admin');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByLabel('Invite email').fill(recipient);
    const inviteButton = page.getByRole('button', { name: 'Send invitation' });
    const buttonWidth = await inviteButton.evaluate(
      (button) => button.getBoundingClientRect().width,
    );
    const formWidth = await page
      .locator('.auth-form')
      .evaluate((form) => form.getBoundingClientRect().width);
    expect(buttonWidth).toBeLessThan(formWidth);
    const picklistWidth = await page
      .getByRole('combobox', { name: 'Sign-in method' })
      .evaluate((picklist) => picklist.getBoundingClientRect().width);
    expect(picklistWidth).toBeLessThan(formWidth);
    await page.getByRole('combobox', { name: 'Sign-in method' }).click();
    await page.getByRole('option', { name: 'Google' }).click();
    await inviteButton.click();
    await expect(page.getByRole('status')).toHaveText(`Invitation sent to ${recipient}.`);

    const usersResponse = await request.get(
      `${config.apiUrl}/auth/v1/admin/users?page=1&per_page=1000`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
      },
    );
    const users = await usersResponse.json();
    const invitedUser = users.users.find(
      (user: { email?: string }) => user.email?.toLowerCase() === recipient,
    );
    expect(invitedUser).toBeDefined();
    recipientUserId = invitedUser.id;

    const accountResponse = await request.get(
      `${config.apiUrl}/rest/v1/accounts?select=sign_in_method&id=eq.${recipientUserId}`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
      },
    );
    expect(await accountResponse.json()).toEqual([{ sign_in_method: 'google' }]);

    let messageId: string | undefined;
    await expect
      .poll(
        async () => {
          const response = await request.get(
            `http://127.0.0.1:55425/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`,
          );
          if (!response.ok()) return null;
          const search = await response.json();
          const message = search.messages?.find((item: { To?: { Address: string }[] }) =>
            item.To?.some((address) => address.Address.toLowerCase() === recipient),
          );
          messageId = message?.ID;
          return messageId ?? null;
        },
        { timeout: 10_000 },
      )
      .not.toBeNull();

    const messageResponse = await request.get(`http://127.0.0.1:55425/api/v1/message/${messageId}`);
    const message = await messageResponse.json();
    const emailContent = `${message.HTML ?? ''}\n${message.Text ?? ''}`;
    const rawLink = emailContent.match(/href="([^"]+)"/)?.[1];
    if (!rawLink) throw new Error('The invitation email did not include a link.');

    const inviteUrl = new URL(rawLink.replace(/&amp;/g, '&'));
    expect(inviteUrl.searchParams.get('type')).toBe('invite');
    expect(inviteUrl.searchParams.has('token_hash')).toBe(true);
    await page.goto(inviteUrl.toString());
    await expect(page).toHaveURL(/\/complete-invite$/);
    await expect(page.getByRole('heading', { name: 'Finish creating your account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByLabel('Create password')).toHaveCount(0);
  } finally {
    if (recipientUserId) {
      await deleteTestUser(request, {
        id: recipientUserId,
        email: recipient,
        password: '',
        accessToken: '',
      });
    }
    await deleteTestUser(request, admin);
  }
});

test('an existing admin can grant admin status to another account @e2e', async ({
  page,
  request,
}) => {
  const admin = await createAdminTestUser(request);
  const member = await createTestUser(request);

  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password').fill(admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible();
    await page.getByRole('link', { name: 'Administration' }).click();

    const memberRow = page.getByRole('row', { name: new RegExp(member.email) });
    await expect(memberRow).toContainText('Member');
    const confirmationPromise = page.waitForEvent('dialog').then(async (confirmation) => {
      expect(confirmation.message()).toContain(member.email);
      await confirmation.accept();
    });
    await memberRow.getByRole('button', { name: 'Make admin' }).click();
    await confirmationPromise;
    await expect(memberRow).toContainText('Admin');
    await expect(memberRow.getByRole('button', { name: 'Make admin' })).toHaveCount(0);

    const accountTrigger = page.locator('.account-menu-trigger');
    await accountTrigger.focus();
    await accountTrigger.press('Enter');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByLabel('Email').fill(member.email);
    await page.getByLabel('Password').fill(member.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible();
    await page.getByRole('link', { name: 'Administration' }).click();
    await expect(page.getByRole('heading', { name: 'Account administration' })).toBeVisible();
  } finally {
    await deleteTestUser(request, member);
    await deleteTestUser(request, admin);
  }
});

test('the admin screen is accessible to an admin on desktop and mobile @a11y', async ({
  page,
  request,
}) => {
  const admin = await createAdminTestUser(request);
  const member = await createTestUser(request);

  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password').fill(admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/publications$/);
    await page.goto('/admin');
    const accountTrigger = page.locator('.account-menu-trigger');
    await accountTrigger.focus();
    await accountTrigger.press('Enter');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

    const desktopA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(desktopA11y.violations).toEqual([]);

    await page.setViewportSize({ width: 307, height: 629 });
    await expect(page.locator('.admin-main')).toHaveCSS('padding-top', '24px');
    await expect(page.locator('.admin-main section').first()).toHaveCSS('margin-top', '14px');
    await expect(page.locator('.admin-invite-form')).toHaveCSS('margin-top', '16px');
    const titleFontSize = await page
      .locator('.admin-main h1')
      .evaluate((heading) => Number.parseFloat(getComputedStyle(heading).fontSize));
    expect(titleFontSize).toBeCloseTo(21.33, 1);
    const memberRow = page.getByRole('row', { name: new RegExp(member.email) });
    const emailCell = memberRow.locator('.admin-account-email');
    const signInCell = memberRow.locator('.admin-account-sign-in');
    const roleCell = memberRow.locator('.admin-account-role');
    const actionsCell = memberRow.locator('.admin-account-actions-cell');
    await expect(emailCell).toHaveText(member.email);
    await expect(signInCell).toHaveText('Sign-in: Email');
    await expect(roleCell).toHaveText('Role: Member');
    const [emailBounds, signInBounds, roleBounds, actionsBounds] = await Promise.all([
      emailCell.boundingBox(),
      signInCell.boundingBox(),
      roleCell.boundingBox(),
      actionsCell.boundingBox(),
    ]);
    expect(emailBounds).not.toBeNull();
    expect(signInBounds).not.toBeNull();
    expect(roleBounds).not.toBeNull();
    expect(actionsBounds).not.toBeNull();
    if (!emailBounds || !signInBounds || !roleBounds || !actionsBounds) {
      throw new Error('Expected the mobile account row content to be visible');
    }
    expect(signInBounds.y).toBeGreaterThanOrEqual(emailBounds.y + emailBounds.height);
    expect(roleBounds.y).toBe(signInBounds.y);
    expect(actionsBounds.y).toBeGreaterThanOrEqual(roleBounds.y + roleBounds.height);
    await expect(memberRow.getByRole('button', { name: 'Make admin' })).toBeVisible();
    const tableDimensions = await page.locator('.admin-table-scroll').evaluate((table) => ({
      clientWidth: table.clientWidth,
      scrollWidth: table.scrollWidth,
    }));
    expect(tableDimensions.scrollWidth).toBeLessThanOrEqual(tableDimensions.clientWidth);
    const overflowingElements = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth;
      return Array.from(document.querySelectorAll<HTMLElement>('*'))
        .map((element) => ({
          tag: element.tagName,
          className: element.className.toString(),
          right: Math.ceil(element.getBoundingClientRect().right),
          isInsideAccountTable: element.closest('.admin-table-scroll') !== null,
        }))
        .filter((element) => !element.isInsideAccountTable && element.right > viewportWidth + 1);
    });
    expect(overflowingElements).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      307,
    );
    const mobileA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(mobileA11y.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, member);
    await deleteTestUser(request, admin);
  }
});
