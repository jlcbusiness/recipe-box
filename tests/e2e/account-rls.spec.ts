import { expect, test } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  getLocalSupabaseConfig,
  type LocalSupabaseConfig,
  type TestUser,
} from '../support/local-supabase';

let supabase: LocalSupabaseConfig;

test.beforeAll(async () => {
  supabase = await getLocalSupabaseConfig();
});

function userHeaders(user: TestUser) {
  return {
    apikey: supabase.anonKey,
    Authorization: `Bearer ${user.accessToken}`,
  };
}

test('Account rows and private media are isolated by authenticated user @e2e', async ({
  request,
}) => {
  const firstUser = await createTestUser(request);
  const secondUser = await createTestUser(request);
  const mediaPath = `${firstUser.id}/rls-check.txt`;

  try {
    const firstRows = await request.get(`${supabase.apiUrl}/rest/v1/accounts?select=id`, {
      headers: userHeaders(firstUser),
    });
    const secondRows = await request.get(`${supabase.apiUrl}/rest/v1/accounts?select=id`, {
      headers: userHeaders(secondUser),
    });
    const anonymousRows = await request.get(`${supabase.apiUrl}/rest/v1/accounts?select=id`, {
      headers: { apikey: supabase.anonKey },
    });
    const anonymousUpdate = await request.patch(
      `${supabase.apiUrl}/rest/v1/accounts?id=eq.${firstUser.id}`,
      {
        headers: { apikey: supabase.anonKey, Prefer: 'return=representation' },
        data: { id: firstUser.id },
      },
    );

    expect(firstRows.status()).toBe(200);
    expect(await firstRows.json()).toEqual([{ id: firstUser.id }]);
    expect(await secondRows.json()).toEqual([{ id: secondUser.id }]);
    expect(await anonymousRows.json()).toEqual([]);
    expect(await anonymousUpdate.json()).toEqual([]);

    const ownerUpdate = await request.patch(
      `${supabase.apiUrl}/rest/v1/accounts?id=eq.${firstUser.id}`,
      {
        headers: { ...userHeaders(firstUser), Prefer: 'return=representation' },
        data: { id: firstUser.id },
      },
    );
    const ownerUpdateRows = await ownerUpdate.json();
    expect(ownerUpdateRows).toHaveLength(1);
    expect(ownerUpdateRows[0].id).toBe(firstUser.id);

    const crossAccountUpdate = await request.patch(
      `${supabase.apiUrl}/rest/v1/accounts?id=eq.${firstUser.id}`,
      {
        headers: { ...userHeaders(secondUser), Prefer: 'return=representation' },
        data: { id: firstUser.id },
      },
    );
    expect(await crossAccountUpdate.json()).toEqual([]);

    const upload = await request.post(
      `${supabase.apiUrl}/storage/v1/object/recipe-media/${mediaPath}`,
      {
        headers: { ...userHeaders(firstUser), 'Content-Type': 'text/plain' },
        data: 'private test content',
      },
    );
    expect(upload.ok()).toBeTruthy();

    const ownerRead = await request.get(
      `${supabase.apiUrl}/storage/v1/object/authenticated/recipe-media/${mediaPath}`,
      { headers: userHeaders(firstUser) },
    );
    const crossAccountRead = await request.get(
      `${supabase.apiUrl}/storage/v1/object/authenticated/recipe-media/${mediaPath}`,
      { headers: userHeaders(secondUser) },
    );
    const anonymousRead = await request.get(
      `${supabase.apiUrl}/storage/v1/object/authenticated/recipe-media/${mediaPath}`,
      { headers: { apikey: supabase.anonKey } },
    );
    const anonymousUpload = await request.post(
      `${supabase.apiUrl}/storage/v1/object/recipe-media/${firstUser.id}/anonymous.txt`,
      {
        headers: { apikey: supabase.anonKey, 'Content-Type': 'text/plain' },
        data: 'must not be stored',
      },
    );
    const crossAccountWrite = await request.post(
      `${supabase.apiUrl}/storage/v1/object/recipe-media/${secondUser.id}/blocked.txt`,
      {
        headers: { ...userHeaders(firstUser), 'Content-Type': 'text/plain' },
        data: 'must not be stored',
      },
    );

    expect(ownerRead.status()).toBe(200);
    expect(await ownerRead.text()).toBe('private test content');
    expect(crossAccountRead.ok()).toBe(false);
    expect(anonymousRead.ok()).toBe(false);
    expect(anonymousUpload.ok()).toBe(false);
    expect(crossAccountWrite.ok()).toBe(false);
  } finally {
    await deleteTestUser(request, secondUser);
    await deleteTestUser(request, firstUser);
  }
});
