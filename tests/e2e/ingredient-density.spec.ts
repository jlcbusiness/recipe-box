import { expect, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

test('ingredient density is owner-scoped, revision-checked, and audited @e2e @density', async ({
  request,
}) => {
  const owner = await createTestUser(request);
  const other = await createTestUser(request);
  const config = await getLocalSupabaseConfig();
  const ownerHeaders = {
    apikey: config.anonKey,
    Authorization: `Bearer ${owner.accessToken}`,
  };
  const otherHeaders = {
    apikey: config.anonKey,
    Authorization: `Bearer ${other.accessToken}`,
  };
  const readRevision = async () => {
    const response = await request.get(
      `${config.apiUrl}/rest/v1/ingredient_catalog_revisions?select=revision&account_id=eq.${owner.id}`,
      { headers: ownerHeaders },
    );
    expect(response.ok()).toBeTruthy();
    const [row] = (await response.json()) as { revision: number }[];
    return row.revision;
  };
  const addIngredientByName = async (name: string) => {
    const response = await request.post(`${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`, {
      headers: ownerHeaders,
      data: {
        p_action: 'add',
        p_expected_revision: await readRevision(),
        p_name: name,
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const lookup = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id&account_id=eq.${owner.id}&name=eq.${encodeURIComponent(name)}`,
      { headers: ownerHeaders },
    );
    expect(lookup.ok()).toBeTruthy();
    const [row] = (await lookup.json()) as { id: string }[];
    return row.id;
  };
  const setDensity = async (ingredientId: string, weightAmount: number) => {
    const response = await request.post(`${config.apiUrl}/rest/v1/rpc/manage_ingredient_density`, {
      headers: ownerHeaders,
      data: {
        p_action: 'set',
        p_expected_revision: await readRevision(),
        p_ingredient_id: ingredientId,
        p_volume_amount: 1,
        p_volume_unit_code: 'cup',
        p_weight_amount: weightAmount,
        p_weight_unit_code: 'g',
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  const readDensity = async (ingredientId: string) => {
    const response = await request.get(
      `${config.apiUrl}/rest/v1/ingredient_densities?select=ingredient_id,volume_amount,volume_unit_code,weight_amount,weight_unit_code&ingredient_id=eq.${ingredientId}`,
      { headers: ownerHeaders },
    );
    expect(response.ok()).toBeTruthy();
    const [row] = (await response.json()) as {
      ingredient_id: string;
      volume_amount: number;
      volume_unit_code: string;
      weight_amount: number;
      weight_unit_code: string;
    }[];
    return row;
  };

  try {
    const addIngredient = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers: ownerHeaders,
        data: {
          p_action: 'add',
          p_expected_revision: 1,
          p_name: 'Density Flour',
        },
      },
    );
    expect(addIngredient.ok(), await addIngredient.text()).toBeTruthy();

    const ingredientResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredients?select=id&account_id=eq.${owner.id}&name=eq.Density%20Flour`,
      { headers: ownerHeaders },
    );
    const [ingredient] = (await ingredientResponse.json()) as { id: string }[];
    expect(ingredient?.id).toBeTruthy();

    const revisionResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredient_catalog_revisions?select=revision&account_id=eq.${owner.id}`,
      { headers: ownerHeaders },
    );
    const [{ revision }] = (await revisionResponse.json()) as { revision: number }[];
    const densityInput = {
      p_expected_revision: revision,
      p_ingredient_id: ingredient.id,
      p_volume_amount: 1,
      p_volume_unit_code: 'cup',
      p_weight_amount: 120,
      p_weight_unit_code: 'g',
    };

    const foreignMutation = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_density`,
      {
        headers: otherHeaders,
        data: { p_action: 'set', ...densityInput },
      },
    );
    expect(foreignMutation.ok()).toBeFalsy();

    const setResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_density`,
      {
        headers: ownerHeaders,
        data: { p_action: 'set', ...densityInput },
      },
    );
    expect(setResponse.ok(), await setResponse.text()).toBeTruthy();

    const densityUrl = `${config.apiUrl}/rest/v1/ingredient_densities?select=account_id,ingredient_id,volume_amount,volume_unit_code,weight_amount,weight_unit_code&ingredient_id=eq.${ingredient.id}`;
    const ownerDensityResponse = await request.get(densityUrl, { headers: ownerHeaders });
    expect(ownerDensityResponse.ok()).toBeTruthy();
    expect(await ownerDensityResponse.json()).toEqual([
      {
        account_id: owner.id,
        ingredient_id: ingredient.id,
        volume_amount: 1,
        volume_unit_code: 'cup',
        weight_amount: 120,
        weight_unit_code: 'g',
      },
    ]);

    const hiddenDensityResponse = await request.get(densityUrl, { headers: otherHeaders });
    expect(await hiddenDensityResponse.json()).toEqual([]);

    const directWrite = await request.post(`${config.apiUrl}/rest/v1/ingredient_densities`, {
      headers: ownerHeaders,
      data: {
        account_id: owner.id,
        ingredient_id: ingredient.id,
        volume_amount: 2,
        volume_unit_code: 'cup',
        weight_amount: 240,
        weight_unit_code: 'g',
      },
    });
    expect(directWrite.ok()).toBeFalsy();

    const revisionAfterSet = await readRevision();
    const invalidDensity = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_density`,
      {
        headers: ownerHeaders,
        data: {
          p_action: 'set',
          ...densityInput,
          p_expected_revision: revisionAfterSet,
          p_volume_amount: 0,
        },
      },
    );
    expect(invalidDensity.ok()).toBeFalsy();

    const invalidUnit = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_density`,
      {
        headers: ownerHeaders,
        data: {
          p_action: 'set',
          ...densityInput,
          p_expected_revision: revisionAfterSet,
          p_weight_unit_code: 'cup',
        },
      },
    );
    expect(invalidUnit.ok()).toBeFalsy();

    const staleDensity = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_density`,
      {
        headers: ownerHeaders,
        data: {
          p_action: 'set',
          ...densityInput,
          p_expected_revision: revisionAfterSet - 1,
        },
      },
    );
    expect(staleDensity.ok()).toBeFalsy();
    expect(await readRevision()).toBe(revisionAfterSet);

    const historyResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredient_catalog_history?select=event_type,before_data,after_data&account_id=eq.${owner.id}&event_type=eq.ingredient.density_set`,
      { headers: ownerHeaders },
    );
    expect(historyResponse.ok()).toBeTruthy();
    expect(await historyResponse.json()).toEqual([
      expect.objectContaining({
        event_type: 'ingredient.density_set',
        before_data: expect.any(Object),
        after_data: expect.any(Object),
      }),
    ]);

    const latestRevisionResponse = await request.get(
      `${config.apiUrl}/rest/v1/ingredient_catalog_revisions?select=revision&account_id=eq.${owner.id}`,
      { headers: ownerHeaders },
    );
    const [{ revision: latestRevision }] = (await latestRevisionResponse.json()) as {
      revision: number;
    }[];
    const removeResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_density`,
      {
        headers: ownerHeaders,
        data: {
          p_action: 'remove',
          p_expected_revision: latestRevision,
          p_ingredient_id: ingredient.id,
          p_volume_amount: null,
          p_volume_unit_code: null,
          p_weight_amount: null,
          p_weight_unit_code: null,
        },
      },
    );
    expect(removeResponse.ok(), await removeResponse.text()).toBeTruthy();
    const removedDensityResponse = await request.get(densityUrl, { headers: ownerHeaders });
    expect(await removedDensityResponse.json()).toEqual([]);

    const transferSourceId = await addIngredientByName('Density Transfer Source');
    const transferTargetId = await addIngredientByName('Density Transfer Target');
    await setDensity(transferSourceId, 90);
    const transferResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers: ownerHeaders,
        data: {
          p_action: 'merge',
          p_expected_revision: await readRevision(),
          p_ingredient_id: transferSourceId,
          p_replacement_id: transferTargetId,
        },
      },
    );
    expect(transferResponse.ok(), await transferResponse.text()).toBeTruthy();
    expect(await readDensity(transferTargetId)).toMatchObject({ weight_amount: 90 });
    expect(await readDensity(transferSourceId)).toBeUndefined();

    const precedenceSourceId = await addIngredientByName('Density Precedence Source');
    const precedenceTargetId = await addIngredientByName('Density Precedence Target');
    await setDensity(precedenceSourceId, 120);
    await setDensity(precedenceTargetId, 150);
    const precedenceResponse = await request.post(
      `${config.apiUrl}/rest/v1/rpc/manage_ingredient_catalog`,
      {
        headers: ownerHeaders,
        data: {
          p_action: 'merge',
          p_expected_revision: await readRevision(),
          p_ingredient_id: precedenceSourceId,
          p_replacement_id: precedenceTargetId,
        },
      },
    );
    expect(precedenceResponse.ok(), await precedenceResponse.text()).toBeTruthy();
    expect(await readDensity(precedenceTargetId)).toMatchObject({ weight_amount: 150 });
    expect(await readDensity(precedenceSourceId)).toBeUndefined();

    const densityMergeHistory = await request.get(
      `${config.apiUrl}/rest/v1/ingredient_catalog_history?select=event_type,before_data,after_data&account_id=eq.${owner.id}&event_type=eq.ingredient.density_reassigned&ingredient_id=eq.${precedenceSourceId}`,
      { headers: ownerHeaders },
    );
    expect(densityMergeHistory.ok()).toBeTruthy();
    expect(await densityMergeHistory.json()).toEqual([
      expect.objectContaining({
        before_data: expect.objectContaining({
          ingredient_id: precedenceSourceId,
          density: expect.objectContaining({ weight_amount: 120 }),
          replacement_density: expect.objectContaining({ weight_amount: 150 }),
        }),
        after_data: expect.objectContaining({
          ingredient_id: precedenceTargetId,
          density: expect.objectContaining({ weight_amount: 150 }),
        }),
      }),
    ]);
  } finally {
    await deleteTestUser(request, owner);
    await deleteTestUser(request, other);
  }
});
