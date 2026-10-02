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

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: 'Your private workspace' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

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
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/app$/);
  } finally {
    await deleteTestUser(request, user);
  }
});

test('an admin can invite an email, accept once, and grant admin to an existing account @e2e', async ({
  page,
  request,
}) => {
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
    await expect(page).toHaveURL(/\/app$/);

    await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible();
    await page.getByRole('link', { name: 'Administration' }).click();
    await expect(page.getByRole('heading', { name: 'Account administration' })).toBeVisible();
    await page.getByLabel('Invite email').fill(recipient);
    await page.getByRole('button', { name: 'Send invitation' }).click();
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
    expect(usersResponse.ok()).toBeTruthy();
    const users = await usersResponse.json();
    const invitedUser = users.users.find(
      (user: { email?: string }) => user.email?.toLowerCase() === recipient,
    );
    expect(invitedUser).toBeDefined();
    recipientUserId = invitedUser.id;

    let messageId: string | undefined;
    await expect
      .poll(
        async () => {
          const response = await request.get(
            `http://127.0.0.1:55425/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`,
          );
          if (!response.ok()) {
            return null;
          }

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
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText(recipient)).toBeVisible();

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

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.getByLabel('Email').fill(recipient);
    await page.getByLabel('Password').fill(recipientPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);

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
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible();
    await page.getByRole('link', { name: 'Administration' }).click();

    const memberRow = page.getByRole('row', { name: new RegExp(member.email) });
    await expect(memberRow).toContainText('Member');
    await memberRow.getByRole('button', { name: 'Grant admin' }).click();
    await expect(memberRow).toContainText('Admin');
    await expect(memberRow.getByRole('button', { name: 'Grant admin' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByLabel('Email').fill(member.email);
    await page.getByLabel('Password').fill(member.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
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

  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password').fill(admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.goto('/admin');
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

    const desktopA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(desktopA11y.violations).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
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
      390,
    );
    const mobileA11y = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(mobileA11y.violations).toEqual([]);
  } finally {
    await deleteTestUser(request, admin);
  }
});
