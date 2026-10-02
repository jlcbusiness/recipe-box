import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import type { APIRequestContext } from '@playwright/test';

export type LocalSupabaseConfig = {
  apiUrl: string;
  anonKey: string;
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

  for await (const line of createInterface({ input: process.stdout })) {
    if (line.startsWith('API_URL=')) {
      apiUrl = line.slice('API_URL='.length).replace(/^"|"$/g, '');
    } else if (line.startsWith('ANON_KEY=')) {
      anonKey = line.slice('ANON_KEY='.length).replace(/^"|"$/g, '');
    }
  }

  const exitCode = await new Promise<number | null>((resolve) => {
    process.once('close', resolve);
  });

  if (exitCode !== 0 || !apiUrl || !anonKey) {
    throw new Error('Local Supabase must be running before integration tests.');
  }

  return { apiUrl, anonKey };
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
  const { apiUrl, anonKey } = await getLocalSupabaseConfig();
  await request.delete(`${apiUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${user.accessToken}`,
    },
  });
}
