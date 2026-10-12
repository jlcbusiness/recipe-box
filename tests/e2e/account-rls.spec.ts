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

    const ownerUpload = await request.post(
      `${supabase.apiUrl}/storage/v1/object/recipe-media/${mediaPath}`,
      {
        headers: { ...userHeaders(firstUser), 'Content-Type': 'text/plain' },
        data: 'private test content',
      },
    );
    expect(ownerUpload.status()).toBe(400);

    const fixtureUpload = await request.post(
      `${supabase.apiUrl}/storage/v1/object/recipe-media/${mediaPath}`,
      {
        headers: {
          apikey: supabase.serviceRoleKey,
          Authorization: `Bearer ${supabase.serviceRoleKey}`,
          'Content-Type': 'text/plain',
        },
        data: 'private test content',
      },
    );
    expect(fixtureUpload.ok(), await fixtureUpload.text()).toBeTruthy();

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

test('Account unit preferences are owner-scoped and cannot update protected account fields @e2e', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const otherUser = await createTestUser(request);

  try {
    const preferencesUrl = `${supabase.apiUrl}/rest/v1/accounts?select=id,is_admin,sign_in_method,volume_system,weight_system,ingredient_presentation&id=eq.${owner.id}`;
    const initialRead = await request.get(preferencesUrl, { headers: userHeaders(owner) });
    expect(initialRead.status()).toBe(200);
    expect(await initialRead.json()).toEqual([
      {
        id: owner.id,
        is_admin: false,
        sign_in_method: 'email_password',
        volume_system: 'us_customary',
        weight_system: 'us_customary',
        ingredient_presentation: 'standard',
      },
    ]);

    const foreignPreferenceRead = await request.get(
      `${supabase.apiUrl}/rest/v1/accounts?select=volume_system,weight_system&id=eq.${owner.id}`,
      { headers: userHeaders(otherUser) },
    );
    expect(foreignPreferenceRead.status()).toBe(200);
    expect(await foreignPreferenceRead.json()).toEqual([]);

    const directPreferenceUpdate = await request.patch(
      `${supabase.apiUrl}/rest/v1/accounts?id=eq.${owner.id}`,
      {
        headers: { ...userHeaders(owner), Prefer: 'return=representation' },
        data: { volume_system: 'metric' },
      },
    );
    expect(directPreferenceUpdate.ok()).toBeFalsy();

    const directPresentationUpdate = await request.patch(
      `${supabase.apiUrl}/rest/v1/accounts?id=eq.${owner.id}`,
      {
        headers: { ...userHeaders(owner), Prefer: 'return=representation' },
        data: { ingredient_presentation: 'ingredient_first' },
      },
    );
    expect(directPresentationUpdate.ok()).toBeFalsy();

    const directProtectedUpdate = await request.patch(
      `${supabase.apiUrl}/rest/v1/accounts?id=eq.${owner.id}`,
      {
        headers: { ...userHeaders(owner), Prefer: 'return=representation' },
        data: { is_admin: true, sign_in_method: 'google' },
      },
    );
    expect(directProtectedUpdate.ok()).toBeFalsy();

    const updateVolume = await request.post(
      `${supabase.apiUrl}/rest/v1/rpc/update_account_unit_preferences`,
      {
        headers: { ...userHeaders(owner), 'Content-Type': 'application/json' },
        data: { p_volume_system: 'metric', p_weight_system: null },
      },
    );
    expect(updateVolume.status()).toBe(204);

    const updatePresentation = await request.post(
      `${supabase.apiUrl}/rest/v1/rpc/update_account_unit_preferences`,
      {
        headers: { ...userHeaders(owner), 'Content-Type': 'application/json' },
        data: {
          p_volume_system: null,
          p_weight_system: null,
          p_ingredient_presentation: 'ingredient_first',
        },
      },
    );
    expect(updatePresentation.status()).toBe(204);

    const afterVolumeUpdate = await request.get(preferencesUrl, { headers: userHeaders(owner) });
    expect(await afterVolumeUpdate.json()).toEqual([
      {
        id: owner.id,
        is_admin: false,
        sign_in_method: 'email_password',
        volume_system: 'metric',
        weight_system: 'us_customary',
        ingredient_presentation: 'ingredient_first',
      },
    ]);

    const invalidUpdate = await request.post(
      `${supabase.apiUrl}/rest/v1/rpc/update_account_unit_preferences`,
      {
        headers: { ...userHeaders(owner), 'Content-Type': 'application/json' },
        data: { p_volume_system: 'imperial', p_weight_system: null },
      },
    );
    expect(invalidUpdate.ok()).toBeFalsy();

    const invalidPresentationUpdate = await request.post(
      `${supabase.apiUrl}/rest/v1/rpc/update_account_unit_preferences`,
      {
        headers: { ...userHeaders(owner), 'Content-Type': 'application/json' },
        data: {
          p_volume_system: null,
          p_weight_system: null,
          p_ingredient_presentation: 'compact',
        },
      },
    );
    expect(invalidPresentationUpdate.ok()).toBeFalsy();

    const anonymousUpdate = await request.post(
      `${supabase.apiUrl}/rest/v1/rpc/update_account_unit_preferences`,
      {
        headers: { apikey: supabase.anonKey, 'Content-Type': 'application/json' },
        data: { p_volume_system: 'us_customary', p_weight_system: null },
      },
    );
    expect(anonymousUpdate.ok()).toBeFalsy();

    const foreignTargetAttempt = await request.post(
      `${supabase.apiUrl}/rest/v1/rpc/update_account_unit_preferences`,
      {
        headers: { ...userHeaders(owner), 'Content-Type': 'application/json' },
        data: {
          p_account_id: otherUser.id,
          p_volume_system: 'metric',
          p_weight_system: 'metric',
        },
      },
    );
    expect(foreignTargetAttempt.ok()).toBeFalsy();

    const otherUserRead = await request.get(
      `${supabase.apiUrl}/rest/v1/accounts?select=volume_system,weight_system,ingredient_presentation&id=eq.${otherUser.id}`,
      { headers: userHeaders(otherUser) },
    );
    expect(await otherUserRead.json()).toEqual([
      {
        volume_system: 'us_customary',
        weight_system: 'us_customary',
        ingredient_presentation: 'standard',
      },
    ]);
  } finally {
    await deleteTestUser(request, otherUser);
    await deleteTestUser(request, owner);
  }
});
