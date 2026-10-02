import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { APIRequestContext } from '@playwright/test';

export type LocalSupabaseConfig = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

export type TestUser = {
  id: string;
  email: string;
  password: string;
  accessToken: string;
};

export async function getLocalSupabaseConfig(): Promise<LocalSupabaseConfig> {
  const process = spawn('supabase', ['status', '--output', 'env'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let apiUrl: string | undefined;
  let anonKey: string | undefined;
  let serviceRoleKey: string | undefined;

  for await (const line of createInterface({ input: process.stdout })) {
    if (line.startsWith('API_URL=')) {
      apiUrl = line.slice('API_URL='.length).replace(/^"|"$/g, '');
    } else if (line.startsWith('ANON_KEY=')) {
      anonKey = line.slice('ANON_KEY='.length).replace(/^"|"$/g, '');
    } else if (line.startsWith('SERVICE_ROLE_KEY=')) {
      serviceRoleKey = line.slice('SERVICE_ROLE_KEY='.length).replace(/^"|"$/g, '');
    }
  }

  const exitCode = await new Promise<number | null>((resolve) => {
    process.once('close', resolve);
  });

  if (exitCode !== 0 || !apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Local Supabase must be running before integration tests.');
  }

  return { apiUrl, anonKey, serviceRoleKey };
}

export async function createTestUser(request: APIRequestContext): Promise<TestUser> {
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();
  const email = `slice1-${randomUUID()}@example.test`;
  const password = 'local-test-password-42';
  const response = await request.post(`${apiUrl}/auth/v1/signup`, {
    headers: { apikey: anonKey },
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(`Local Auth test user creation failed with HTTP ${response.status()}.`);
  }

  const result = await response.json();
  return {
    id: result.user.id,
    email,
    password,
    accessToken: result.access_token,
  };
}

export async function deleteTestUser(request: APIRequestContext, user: TestUser): Promise<void> {
  const { apiUrl, serviceRoleKey } = await getLocalSupabaseConfig();
  const response = await request.delete(`${apiUrl}/auth/v1/admin/users/${user.id}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Local Auth test user cleanup failed with HTTP ${response.status()}.`);
  }
}

export async function deleteTestUserByEmail(
  request: APIRequestContext,
  email: string,
): Promise<void> {
  const { apiUrl, serviceRoleKey } = await getLocalSupabaseConfig();
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  const response = await request.get(`${apiUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers,
  });

  if (!response.ok()) {
    throw new Error(`Local Auth cleanup lookup failed with HTTP ${response.status()}.`);
  }

  const result = await response.json();
  const user = result.users.find(
    (candidate: { email?: string }) => candidate.email?.toLowerCase() === email.toLowerCase(),
  );

  if (!user) {
    return;
  }

  const deletion = await request.delete(`${apiUrl}/auth/v1/admin/users/${user.id}`, { headers });
  if (!deletion.ok()) {
    throw new Error(`Local Auth test user cleanup failed with HTTP ${deletion.status()}.`);
  }
}

export async function createAdminTestUser(request: APIRequestContext): Promise<TestUser> {
  const user = await createTestUser(request);
  const { apiUrl, serviceRoleKey } = await getLocalSupabaseConfig();
  const response = await request.patch(`${apiUrl}/rest/v1/accounts?id=eq.${user.id}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=representation',
    },
    data: { is_admin: true },
  });

  if (!response.ok()) {
    await deleteTestUser(request, user);
    throw new Error(`Local admin fixture setup failed with HTTP ${response.status()}.`);
  }

  return user;
}

export async function deletePendingInviteTestUsers(request: APIRequestContext): Promise<void> {
  const { apiUrl, serviceRoleKey } = await getLocalSupabaseConfig();
  const response = await request.get(`${apiUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok()) {
    throw new Error(`Local invitation fixture lookup failed with HTTP ${response.status()}.`);
  }

  const result = await response.json();
  const pendingUsers = result.users.filter(
    (user: { email?: string; app_metadata?: { invitation_pending?: boolean } }) =>
      user.email?.startsWith('invite-') && user.app_metadata?.invitation_pending === true,
  );

  for (const user of pendingUsers) {
    const deletion = await request.delete(`${apiUrl}/auth/v1/admin/users/${user.id}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!deletion.ok()) {
      throw new Error(`Local invitation fixture cleanup failed with HTTP ${deletion.status()}.`);
    }
  }
}
