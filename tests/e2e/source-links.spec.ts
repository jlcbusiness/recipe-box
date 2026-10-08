import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { createTestUser, deleteTestUser, getLocalSupabaseConfig } from '../support/local-supabase';

type PublicationKind = 'book' | 'magazine' | 'site';

function ownerHeaders(anonKey: string, accessToken: string) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  };
}

function serviceHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: 'return=representation',
  };
}

async function deleteFixtureRows(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  serviceRoleKey: string,
  table: 'recipe_history' | 'recipes' | 'publication_history' | 'publications',
  filters: string,
) {
  const response = await request.delete(`${apiUrl}/rest/v1/${table}?${filters}`, {
    headers: serviceHeaders(serviceRoleKey),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function deleteRecipeFixture(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  serviceRoleKey: string,
  accountId: string,
  recipeId: string,
) {
  await deleteFixtureRows(
    request,
    apiUrl,
    serviceRoleKey,
    'recipe_history',
    `account_id=eq.${accountId}&record_id=eq.${recipeId}`,
  );
  await deleteFixtureRows(
    request,
    apiUrl,
    serviceRoleKey,
    'recipes',
    `account_id=eq.${accountId}&id=eq.${recipeId}`,
  );
}

async function deletePublicationFixture(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  serviceRoleKey: string,
  accountId: string,
  publicationId: string,
) {
  await deleteFixtureRows(
    request,
    apiUrl,
    serviceRoleKey,
    'publication_history',
    `account_id=eq.${accountId}&record_id=eq.${publicationId}`,
  );
  await deleteFixtureRows(
    request,
    apiUrl,
    serviceRoleKey,
    'publications',
    `account_id=eq.${accountId}&id=eq.${publicationId}`,
  );
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/recipes$/);
}

async function createPublication(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  headers: Record<string, string>,
  name: string,
  type: PublicationKind,
) {
  const response = await request.post(`${apiUrl}/rest/v1/rpc/create_publication`, {
    headers,
    data: {
      p_name: name,
      p_publication_type: type,
      p_author: null,
      p_edition: null,
      p_isbn: null,
      p_retailer_url: null,
      p_issue: null,
      p_site_url:
        type === 'site' ? `https://${name.toLowerCase().replaceAll(' ', '-')}.test` : null,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as string;
}

async function createRecipe(
  request: import('@playwright/test').APIRequestContext,
  apiUrl: string,
  headers: Record<string, string>,
  name: string,
) {
  const response = await request.post(`${apiUrl}/rest/v1/rpc/save_recipe`, {
    headers,
    data: {
      p_recipe_id: null,
      p_expected_version: null,
      p_name: name,
      p_food_type_id: null,
      p_state: 'want_to_try',
      p_verdict_id: null,
      p_enthusiasm_id: null,
      p_occasion_details: null,
      p_reason: null,
      p_serves: null,
      p_prep_time_minutes: null,
      p_mixing_time_minutes: null,
      p_marinate_time_minutes: null,
      p_chill_time_minutes: null,
      p_freeze_time_minutes: null,
      p_cook_time_minutes: null,
      p_bake_time_minutes: null,
      p_cooling_time_minutes: null,
      p_rest_time_minutes: null,
      p_total_time_minutes: null,
      p_notes_markdown: '',
      p_meal_type_ids: [],
      p_cuisine_ids: [],
      p_equipment_ids: [],
      p_ingredient_rows: [],
      p_instruction_steps: [],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const [recipe] = (await response.json()) as { id: string; version: number }[];
  return recipe;
}

test('recipe source links save atomically and remain recoverable through Trash @e2e @a11y', async ({
  page,
  request,
}) => {
  const owner = await createTestUser(request);
  const otherOwner = await createTestUser(request);
  const { apiUrl, anonKey, serviceRoleKey } = await getLocalSupabaseConfig();
  const headers = ownerHeaders(anonKey, owner.accessToken);

  try {
    const magazineId = await createPublication(
      request,
      apiUrl,
      headers,
      'October Magazine',
      'magazine',
    );
    const siteId = await createPublication(request, apiUrl, headers, 'Kitchen Site', 'site');
    const referenceId = await createPublication(request, apiUrl, headers, 'Cooking Book', 'book');
    const sourceRecipe = await createRecipe(request, apiUrl, headers, 'Herbed potatoes');
    const linkedRecipe = await createRecipe(request, apiUrl, headers, 'Roast chicken');
    const foreignRecipe = await createRecipe(
      request,
      apiUrl,
      ownerHeaders(anonKey, otherOwner.accessToken),
      'Foreign recipe',
    );
    const relationships = {
      site_listing: null,
      pairings: [
        { display_text: 'Green salad', linked_recipe_id: null },
        { display_text: 'Roast chicken', linked_recipe_id: linkedRecipe.id },
      ],
      references: [
        {
          id: randomUUID(),
          reference_type: 'recipe',
          display_text: 'Roast chicken',
          linked_recipe_id: linkedRecipe.id,
          publication_id: null,
          url: null,
        },
        {
          id: randomUUID(),
          reference_type: 'external_url',
          display_text: 'https://recipes.example.test/herbed-potatoes',
          linked_recipe_id: null,
          publication_id: null,
          url: 'https://recipes.example.test/herbed-potatoes',
        },
        {
          id: randomUUID(),
          reference_type: 'printed_citation',
          display_text: 'The Sunday Table, 2nd edition, page 84',
          linked_recipe_id: null,
          publication_id: null,
          url: null,
        },
      ],
    };
    const saveRecipe = (
      accessHeaders: Record<string, string>,
      expectedVersion: number,
      payload: unknown,
    ) =>
      request.post(`${apiUrl}/rest/v1/rpc/save_recipe_with_relationships`, {
        headers: accessHeaders,
        data: {
          p_recipe_id: sourceRecipe.id,
          p_expected_version: expectedVersion,
          p_name: 'Herbed potatoes',
          p_food_type_id: null,
          p_state: 'want_to_try',
          p_verdict_id: null,
          p_enthusiasm_id: null,
          p_occasion_details: null,
          p_reason: null,
          p_serves: null,
          p_prep_time_minutes: null,
          p_mixing_time_minutes: null,
          p_marinate_time_minutes: null,
          p_chill_time_minutes: null,
          p_freeze_time_minutes: null,
          p_cook_time_minutes: null,
          p_bake_time_minutes: null,
          p_cooling_time_minutes: null,
          p_rest_time_minutes: null,
          p_total_time_minutes: null,
          p_notes_markdown: '',
          p_meal_type_ids: [],
          p_cuisine_ids: [],
          p_equipment_ids: [],
          p_ingredient_rows: [],
          p_instruction_steps: [],
          p_publication_id: magazineId,
          p_publication_page: null,
          p_recipe_url: 'https://magazine.example.test/herbed-potatoes',
          p_recipe_relationships: payload,
        },
      });

    const saveResponse = await saveRecipe(headers, sourceRecipe.version, relationships);
    expect(saveResponse.ok(), await saveResponse.text()).toBeTruthy();
    expect(await saveResponse.json()).toEqual([{ id: sourceRecipe.id, version: 2 }]);

    const legacyReferenceResponse = await request.post(`${apiUrl}/rest/v1/recipe_references`, {
      headers: serviceHeaders(serviceRoleKey),
      data: {
        account_id: owner.id,
        recipe_id: sourceRecipe.id,
        reference_type: 'publication',
        publication_id: referenceId,
        display_text: 'Cooking Book',
        position: 3,
      },
    });
    expect(legacyReferenceResponse.ok(), await legacyReferenceResponse.text()).toBeTruthy();
    const [{ id: legacyReferenceRowId }] = (await legacyReferenceResponse.json()) as {
      id: string;
    }[];
    const storedRelationships = {
      ...relationships,
      references: [
        ...relationships.references,
        {
          id: legacyReferenceRowId,
          reference_type: 'publication',
          display_text: 'Cooking Book',
          linked_recipe_id: null,
          publication_id: referenceId,
          url: null,
        },
      ],
    };

    const siteListingsResponse = await request.get(
      `${apiUrl}/rest/v1/recipe_site_listings?select=recipe_id,site_publication_id,recipe_url&recipe_id=eq.${sourceRecipe.id}`,
      { headers },
    );
    expect(siteListingsResponse.ok()).toBe(true);
    expect(await siteListingsResponse.json()).toEqual([]);

    const rejectedSecondarySiteListing = await saveRecipe(headers, 2, {
      ...relationships,
      site_listing: {
        site_publication_id: siteId,
        recipe_url: 'https://kitchen-site.test/herbed-potatoes',
      },
    });
    expect(rejectedSecondarySiteListing.ok()).toBe(false);
    expect(await rejectedSecondarySiteListing.json()).toMatchObject({ code: '23514' });
    const unchangedAfterRejectedListing = await request.get(
      `${apiUrl}/rest/v1/recipes?select=version,publication_id&id=eq.${sourceRecipe.id}`,
      { headers },
    );
    expect(await unchangedAfterRejectedListing.json()).toEqual([
      { version: 2, publication_id: magazineId },
    ]);

    const pairingsResponse = await request.get(
      `${apiUrl}/rest/v1/recipe_pairings?select=display_text,linked_recipe_id,position&source_recipe_id=eq.${sourceRecipe.id}&order=position`,
      { headers },
    );
    expect(pairingsResponse.ok(), await pairingsResponse.text()).toBe(true);
    expect(await pairingsResponse.json()).toEqual([
      { display_text: 'Green salad', linked_recipe_id: null, position: 0 },
      { display_text: 'Roast chicken', linked_recipe_id: linkedRecipe.id, position: 1 },
    ]);

    const referencesResponse = await request.get(
      `${apiUrl}/rest/v1/recipe_references?select=reference_type,display_text,linked_recipe_id,publication_id,url,position&recipe_id=eq.${sourceRecipe.id}&order=position`,
      { headers },
    );
    expect(referencesResponse.ok()).toBe(true);
    expect(await referencesResponse.json()).toEqual([
      {
        reference_type: 'recipe',
        display_text: 'Roast chicken',
        linked_recipe_id: linkedRecipe.id,
        publication_id: null,
        url: null,
        position: 0,
      },
      {
        reference_type: 'external_url',
        display_text: 'https://recipes.example.test/herbed-potatoes',
        linked_recipe_id: null,
        publication_id: null,
        url: 'https://recipes.example.test/herbed-potatoes',
        position: 1,
      },
      {
        reference_type: 'printed_citation',
        display_text: 'The Sunday Table, 2nd edition, page 84',
        linked_recipe_id: null,
        publication_id: null,
        url: null,
        position: 2,
      },
      {
        reference_type: 'publication',
        display_text: 'Cooking Book',
        linked_recipe_id: null,
        publication_id: referenceId,
        url: null,
        position: 3,
      },
    ]);

    const trashLinkedRecipe = await request.post(`${apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers,
      data: { p_recipe_id: linkedRecipe.id, p_expected_version: 1 },
    });
    expect(trashLinkedRecipe.ok(), await trashLinkedRecipe.text()).toBeTruthy();
    const staleSaveWithTrashedTargets = await saveRecipe(
      headers,
      sourceRecipe.version,
      storedRelationships,
    );
    expect(staleSaveWithTrashedTargets.ok()).toBe(false);
    expect(await staleSaveWithTrashedTargets.json()).toMatchObject({ code: '40001' });
    const saveWithTrashedTargets = await saveRecipe(headers, 2, storedRelationships);
    expect(saveWithTrashedTargets.ok(), await saveWithTrashedTargets.text()).toBeTruthy();
    expect(await saveWithTrashedTargets.json()).toEqual([{ id: sourceRecipe.id, version: 3 }]);
    const legacyAfterApiSave = await request.get(
      `${apiUrl}/rest/v1/recipe_references?select=reference_type,display_text,publication_id&id=eq.${legacyReferenceRowId}`,
      { headers },
    );
    expect(await legacyAfterApiSave.json()).toEqual([
      { reference_type: 'publication', display_text: 'Cooking Book', publication_id: referenceId },
    ]);

    await signIn(page, owner.email, owner.password);
    await page.goto(`/recipes/${sourceRecipe.id}`);
    await expect(page.locator('.recipe-secondary-attribution')).toHaveCount(0);
    await expect(page.locator('.recipe-source-link')).toHaveCSS('display', 'block');
    if (test.info().project.name === 'Fold 6') {
      await expect(page.getByRole('link', { name: 'View online' })).toHaveAttribute(
        'href',
        'https://magazine.example.test/herbed-potatoes',
      );
    } else {
      await expect(
        page.getByRole('link', { name: 'https://magazine.example.test/herbed-potatoes' }),
      ).toHaveAttribute('href', 'https://magazine.example.test/herbed-potatoes');
    }
    await expect(page.getByText('Roast chicken', { exact: true })).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Roast chicken' })).toHaveCount(0);

    await page.goto(`/recipes/${sourceRecipe.id}/edit`);
    await page.getByLabel('Notes (Markdown)').fill('Saved while linked targets are in Trash.');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Herbed potatoes' })).toBeVisible();
    await expect(page.getByText('Saved while linked targets are in Trash.')).toBeVisible();
    const legacyAfterFormSave = await request.get(
      `${apiUrl}/rest/v1/recipe_references?select=reference_type,display_text,publication_id&id=eq.${legacyReferenceRowId}`,
      { headers },
    );
    expect(await legacyAfterFormSave.json()).toEqual([
      { reference_type: 'publication', display_text: 'Cooking Book', publication_id: referenceId },
    ]);

    const restoreLinkedRecipe = await request.post(`${apiUrl}/rest/v1/rpc/restore_recipe`, {
      headers,
      data: { p_recipe_id: linkedRecipe.id, p_expected_version: 2 },
    });
    expect(restoreLinkedRecipe.ok(), await restoreLinkedRecipe.text()).toBeTruthy();
    await page.goto(`/recipes/${sourceRecipe.id}`);
    await expect(page.getByRole('link', { name: 'Roast chicken' })).toHaveCount(2);

    const rejectedForeignLink = await saveRecipe(headers, 4, {
      ...storedRelationships,
      pairings: [{ display_text: 'Foreign recipe', linked_recipe_id: foreignRecipe.id }],
    });
    expect(rejectedForeignLink.ok()).toBe(false);
    expect(await rejectedForeignLink.json()).toMatchObject({ code: 'P0002' });
    const rejectedForeignReference = await saveRecipe(headers, 4, {
      ...storedRelationships,
      references: storedRelationships.references.map((reference, index) =>
        index === 0
          ? {
              ...reference,
              display_text: 'Foreign recipe',
              linked_recipe_id: foreignRecipe.id,
            }
          : reference,
      ),
    });
    expect(rejectedForeignReference.ok()).toBe(false);
    expect(await rejectedForeignReference.json()).toMatchObject({ code: 'P0002' });
    const unchangedRecipe = await request.get(
      `${apiUrl}/rest/v1/recipes?select=version,publication_id&id=eq.${sourceRecipe.id}`,
      { headers },
    );
    expect(await unchangedRecipe.json()).toEqual([{ version: 4, publication_id: magazineId }]);
    const staleSave = await saveRecipe(headers, 2, relationships);
    expect(staleSave.ok()).toBe(false);
    expect(await unchangedRecipe.json()).toEqual([{ version: 4, publication_id: magazineId }]);

    const historyResponse = await request.get(
      `${apiUrl}/rest/v1/recipe_history?select=event_type,after_data&record_id=eq.${sourceRecipe.id}&event_type=eq.recipe.updated`,
      { headers },
    );
    expect(await historyResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'recipe.updated',
          after_data: expect.objectContaining({
            relationships: {
              site_listing: null,
              pairings: expect.arrayContaining(
                relationships.pairings.map((pairing) => expect.objectContaining(pairing)),
              ),
              references: expect.arrayContaining(
                storedRelationships.references.map((reference) =>
                  expect.objectContaining(reference),
                ),
              ),
            },
          }),
        }),
      ]),
    );

    await page.goto(`/recipes/${sourceRecipe.id}`);
    await expect(page.locator('.recipe-detail-section h2')).toHaveText([
      'Recipe details',
      'Pairs With',
      'Notes',
      'References',
    ]);
    await expect(page.locator('#references-title + ul')).toHaveCount(1);
    await expect(page.locator('#pairs-with-title + ul')).toHaveCSS('list-style-type', 'disc');
    await expect(page.locator('#references-title + ul')).toHaveCSS('list-style-type', 'disc');
    const linkedPairMarkerColor = await page
      .locator('#pairs-with-title + ul li:has(> a)')
      .first()
      .evaluate((item) => getComputedStyle(item, '::marker').color);
    const linkedPairTextColor = await page
      .locator('#pairs-with-title + ul li a')
      .first()
      .evaluate((link) => getComputedStyle(link).color);
    expect(linkedPairMarkerColor).toBe(linkedPairTextColor);
    if ((page.viewportSize()?.width ?? 0) > 640) {
      const linkedRecipe = page.getByRole('link', { name: 'Roast chicken' }).first();
      await linkedRecipe.hover();
      await expect(linkedRecipe).toHaveCSS('text-decoration-line', 'underline');
    }
    await expect(page.getByRole('heading', { name: 'Pairs With' })).toBeVisible();
    await expect(page.getByText('Green salad')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'References' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Roast chicken' })).toHaveCount(2);
    await expect(page.getByText('Cooking Book', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cooking Book' })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'https://recipes.example.test/herbed-potatoes' }),
    ).toHaveAttribute('href', 'https://recipes.example.test/herbed-potatoes');
    await expect(page.getByText('The Sunday Table, 2nd edition, page 84')).toBeVisible();

    await page.goto(`/recipes/${linkedRecipe.id}`);
    await expect(page.getByRole('heading', { name: 'Pairs With' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Herbed potatoes' })).toHaveCount(1);

    await page.goto(`/recipes/${sourceRecipe.id}/edit`);
    await expect(page.getByLabel('Site publication')).toHaveCount(0);
    await expect(page.getByLabel('Site recipe URL')).toHaveCount(0);
    await expect(page.locator('.recipe-form > fieldset > legend')).toHaveText([
      'Recipe',
      'Ingredients',
      'Instructions',
      'Times (min)',
      'Pairs With',
      'Notes',
      'References',
    ]);
    const enthusiasmTrigger = page.getByRole('button', { name: 'Enthusiasm', exact: true });
    const enthusiasmWidths = await enthusiasmTrigger.evaluate((trigger) => {
      const measure = trigger
        .closest('.recipe-single-picklist')
        ?.querySelector('.recipe-picklist-measure');
      return {
        trigger: trigger.getBoundingClientRect().width,
        measure: measure?.getBoundingClientRect().width ?? 0,
      };
    });
    expect(enthusiasmWidths.trigger).toBeCloseTo(
      enthusiasmWidths.measure + 40 - (4 * 96) / 25.4,
      0,
    );
    if (test.info().project.name === 'Fold 6') {
      const metadataControlHeights = await page
        .locator(
          '.recipe-metadata-section input:not([type="hidden"]), .recipe-metadata-section select, .recipe-metadata-section button.recipe-picklist-trigger',
        )
        .evaluateAll((controls) =>
          controls.map((control) => Math.round(control.getBoundingClientRect().height)),
        );
      expect([...new Set(metadataControlHeights)]).toEqual([36]);
      const citationBounds = await page.locator('#recipe-publication-page').boundingBox();
      const urlBounds = await page.locator('#recipe-publication-url').boundingBox();
      if (!citationBounds || !urlBounds) {
        throw new Error('Expected the Magazine citation and URL fields to have layout bounds');
      }
      expect(urlBounds.y).toBeGreaterThan(citationBounds.y);
    }
    const pairingInputs = page
      .locator('.recipe-relationship-editor')
      .first()
      .locator('input[role="combobox"]');
    await expect(pairingInputs.nth(0)).toHaveValue('Green salad');
    await expect(pairingInputs.nth(1)).toHaveValue('#roast-chicken');
    await expect(page.getByRole('combobox', { name: 'Reference 1 type' })).toContainText('Recipe');
    await expect(page.getByRole('combobox', { name: 'Reference 1', exact: true })).toHaveValue(
      'Roast chicken',
    );
    if ((page.viewportSize()?.width ?? 0) > 640) {
      const recipeName = page.locator('#recipe-name');
      const initialNameBounds = await recipeName.boundingBox();
      if (!initialNameBounds) {
        throw new Error('Expected the Recipe Name field to have layout bounds');
      }
      expect(initialNameBounds.width).toBeGreaterThanOrEqual(3 * 96);
      await recipeName.fill('An extraordinarily long recipe name that should expand as it grows');
      const expandedNameBounds = await recipeName.boundingBox();
      if (!expandedNameBounds) {
        throw new Error('Expected the expanded Recipe Name field to have layout bounds');
      }
      expect(expandedNameBounds.width).toBeGreaterThan(initialNameBounds.width);
      expect(expandedNameBounds.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) - 40);
      await recipeName.fill('Herbed potatoes');
    }
    await expect(page.getByLabel('Reference 2', { exact: true })).toHaveValue(
      'https://recipes.example.test/herbed-potatoes',
    );
    await expect(page.getByLabel('Reference 3', { exact: true })).toHaveValue(
      'The Sunday Table, 2nd edition, page 84',
    );
    await expect(page.getByLabel('Reference 4 type')).toHaveCount(0);
    await expect(page.getByText('Publication (legacy)')).toBeVisible();
    await expect(page.locator('.recipe-reference-heading').getByText('Type')).toHaveCount(1);
    await expect(page.locator('.recipe-reference-heading').getByText('Reference')).toHaveCount(1);
    await expect(page.locator('.recipe-reference-type-control').first()).toHaveCSS(
      'border-top-width',
      '0px',
    );
    await expect(page.locator('.recipe-form .recipe-field').first()).toHaveCSS(
      'font-weight',
      '500',
    );
    const pairingRow = page
      .locator('.recipe-relationship-editor')
      .first()
      .locator('.recipe-relationship-row')
      .first();
    const pairingFieldBounds = await pairingRow.locator('input[role="combobox"]').boundingBox();
    const pairingRemoveBounds = await pairingRow
      .getByRole('button', { name: 'Remove pairing' })
      .boundingBox();
    expect(pairingFieldBounds).not.toBeNull();
    expect(pairingRemoveBounds).not.toBeNull();
    if (!pairingFieldBounds || !pairingRemoveBounds) {
      throw new Error('Expected the pairing field and remove control to have layout bounds');
    }
    if ((page.viewportSize()?.width ?? 0) > 640) {
      const pairingRowBounds = await pairingRow.boundingBox();
      if (!pairingRowBounds) {
        throw new Error('Expected the pairing row to have layout bounds');
      }
      expect(pairingFieldBounds.width).toBeGreaterThanOrEqual(3 * 96);
      const restTimeBounds = await page.locator('#rest_time_minutes').boundingBox();
      if (!restTimeBounds) {
        throw new Error('Expected the Rest time field to have layout bounds');
      }
      expect(pairingFieldBounds.x + pairingFieldBounds.width).toBeCloseTo(
        restTimeBounds.x + restTimeBounds.width,
        0,
      );
    }
    expect(pairingRemoveBounds.width).toBe(28);
    expect(pairingRemoveBounds.height).toBe(28);
    expect(pairingRemoveBounds.y + pairingRemoveBounds.height / 2).toBeCloseTo(
      pairingFieldBounds.y + pairingFieldBounds.height / 2,
      0,
    );
    const editorAccessibility = await new AxeBuilder({ page }).analyze();
    expect(editorAccessibility.violations).toEqual([]);
    await page.getByRole('button', { name: 'Add reference' }).click();
    const newReferenceType = page.getByRole('combobox', { name: 'Reference 5 type' });
    await expect(newReferenceType).toContainText('Recipe');
    await newReferenceType.click();
    const referenceTypeMenu = page.getByRole('listbox', { name: 'Reference 5 type' });
    await expect(referenceTypeMenu.getByRole('option')).toHaveText(['Recipe', 'Url', 'Print']);
    const referenceTypeMenuBounds = await referenceTypeMenu.boundingBox();
    if (!referenceTypeMenuBounds) {
      throw new Error('Expected the reference type menu to have layout bounds');
    }
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(referenceTypeMenuBounds.y).toBeGreaterThanOrEqual(0);
    expect(referenceTypeMenuBounds.x).toBeGreaterThanOrEqual(0);
    expect(referenceTypeMenuBounds.y + referenceTypeMenuBounds.height).toBeLessThanOrEqual(
      viewportHeight,
    );
    expect(referenceTypeMenuBounds.x + referenceTypeMenuBounds.width).toBeLessThanOrEqual(
      viewportWidth,
    );
    await referenceTypeMenu.getByRole('option', { name: 'Recipe' }).click();
    const recipeReferenceLookup = page.getByRole('combobox', {
      name: 'Reference 5',
      exact: true,
    });
    await recipeReferenceLookup.fill('Roast');
    const recipeReferenceSuggestions = page.getByRole('listbox', {
      name: 'Recipe suggestions for Reference 5',
    });
    await expect(
      recipeReferenceSuggestions.getByRole('option', { name: 'Roast chicken' }),
    ).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(recipeReferenceLookup).toHaveValue('Roast chicken');
    const newReferenceRow = page.locator('.recipe-reference-row').filter({ has: newReferenceType });
    const recipeReferenceSelect = newReferenceRow.getByLabel('Reference 5', { exact: true });
    const referenceRowBounds = await newReferenceRow.boundingBox();
    const referenceRemoveBounds = await newReferenceRow
      .getByRole('button', { name: 'Remove Reference 5' })
      .boundingBox();
    const referenceRemoveButton = newReferenceRow.getByRole('button', {
      name: 'Remove Reference 5',
    });
    expect(referenceRowBounds).not.toBeNull();
    expect(referenceRemoveBounds).not.toBeNull();
    if (!referenceRowBounds || !referenceRemoveBounds) {
      throw new Error('Expected the reference row and remove button to have layout bounds');
    }
    expect(referenceRemoveBounds.x + referenceRemoveBounds.width).toBeCloseTo(
      referenceRowBounds.x + referenceRowBounds.width,
      0,
    );
    const referenceFieldBounds = await recipeReferenceSelect.boundingBox();
    const referenceTypeBounds = await newReferenceRow
      .locator('.recipe-reference-type-control')
      .boundingBox();
    if (!referenceFieldBounds) {
      throw new Error('Expected the reference field to have layout bounds');
    }
    expect(referenceRemoveBounds.width).toBe(28);
    expect(referenceRemoveBounds.height).toBe(28);
    expect(referenceRemoveBounds.y + referenceRemoveBounds.height / 2).toBeCloseTo(
      referenceFieldBounds.y + referenceFieldBounds.height / 2,
      0,
    );
    if ((page.viewportSize()?.width ?? Number.POSITIVE_INFINITY) <= 640) {
      await recipeReferenceLookup.evaluate((input) => input.blur());
      await page.mouse.move(0, 0);
      await expect(referenceRemoveButton).toHaveCSS('opacity', '1');
    }
    expect(referenceTypeBounds).not.toBeNull();
    if (!referenceTypeBounds) {
      throw new Error('Expected the reference type control to have layout bounds');
    }
    expect(referenceTypeBounds.y).toBeCloseTo(referenceFieldBounds.y, 0);
    if ((page.viewportSize()?.width ?? 0) > 640) {
      expect(referenceFieldBounds.width).toBeGreaterThanOrEqual(3 * 96);
      expect(referenceFieldBounds.width).toBeLessThanOrEqual(referenceRowBounds.width / 2);
      expect(
        referenceFieldBounds.x - (referenceTypeBounds.x + referenceTypeBounds.width),
      ).toBeCloseTo(8, 0);
    } else {
      const referenceColumnGap = await newReferenceRow.evaluate((row) =>
        Number.parseFloat(getComputedStyle(row).columnGap),
      );
      expect(
        referenceFieldBounds.x - (referenceTypeBounds.x + referenceTypeBounds.width),
      ).toBeCloseTo(referenceColumnGap, 0);
    }
    const typeLabelSpacing = await newReferenceType
      .locator('.recipe-reference-type-label')
      .evaluate((label) => Number.parseFloat(getComputedStyle(label).marginRight));
    expect(typeLabelSpacing).toBeCloseTo((96 / 25.4) * 1, 0);
    expect(referenceFieldBounds.width).toBeLessThan(
      referenceRowBounds.width - referenceRemoveBounds.width,
    );
    await page.getByRole('button', { name: 'Add reference' }).click();
    const externalType = page.getByRole('combobox', { name: 'Reference 6 type' });
    await externalType.focus();
    await externalType.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(externalType).toContainText('Url');
    const externalUrlField = page.getByLabel('Reference 6', { exact: true });
    await externalUrlField.fill('google.com/roast-chicken');
    const externalUrlBounds = await externalUrlField.boundingBox();
    if (!externalUrlBounds) {
      throw new Error('Expected the external URL field to have layout bounds');
    }
    expect(externalUrlBounds.width).toBeCloseTo(referenceFieldBounds.width, 0);
    await pairingInputs.nth(0).fill('Garden salad');
    await page.getByRole('button', { name: 'Add pairing' }).click();
    const newPairing = pairingInputs.nth(2);
    await newPairing.fill('#Foreign');
    await expect(page.getByRole('listbox', { name: 'Recipe suggestions' })).toHaveCount(0);
    await newPairing.fill('#Roast');
    const recipeSuggestions = page.getByRole('listbox', { name: 'Recipe suggestions' });
    await expect(recipeSuggestions.getByRole('option', { name: 'Roast chicken' })).toBeVisible();
    await expect(recipeSuggestions).toHaveCSS('position', 'absolute');
    await newPairing.press('ArrowDown');
    await newPairing.press('Enter');
    await expect(newPairing).toHaveValue('#roast-chicken');
    await page.getByRole('button', { name: 'Save recipe' }).click();
    await expect(page.getByRole('heading', { name: 'Herbed potatoes' })).toBeVisible();
    await expect(page.getByText('Garden salad')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'https://google.com/roast-chicken' }),
    ).toHaveAttribute('href', 'https://google.com/roast-chicken');
    await expect(page.getByRole('link', { name: 'Roast chicken' })).toHaveCount(4);

    const trashLinkedRecipeAgain = await request.post(`${apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers,
      data: { p_recipe_id: linkedRecipe.id, p_expected_version: 3 },
    });
    expect(trashLinkedRecipeAgain.ok(), await trashLinkedRecipeAgain.text()).toBeTruthy();
    await deleteRecipeFixture(request, apiUrl, serviceRoleKey, owner.id, linkedRecipe.id);
    const retainedPairings = await request.get(
      `${apiUrl}/rest/v1/recipe_pairings?select=display_text,linked_recipe_id&source_recipe_id=eq.${sourceRecipe.id}&display_text=eq.Roast%20chicken`,
      { headers },
    );
    expect(await retainedPairings.json()).toEqual([
      { display_text: 'Roast chicken', linked_recipe_id: null },
      { display_text: 'Roast chicken', linked_recipe_id: null },
    ]);
    const retainedRecipeReferences = await request.get(
      `${apiUrl}/rest/v1/recipe_references?select=reference_type,display_text,linked_recipe_id&recipe_id=eq.${sourceRecipe.id}&reference_type=eq.recipe`,
      { headers },
    );
    expect(await retainedRecipeReferences.json()).toEqual([
      { reference_type: 'recipe', display_text: 'Roast chicken', linked_recipe_id: null },
      { reference_type: 'recipe', display_text: 'Roast chicken', linked_recipe_id: null },
    ]);

    for (const [publicationId, expectedVersion] of [[referenceId, 1]] as const) {
      const trashPublication = await request.post(`${apiUrl}/rest/v1/rpc/trash_publication`, {
        headers,
        data: {
          p_publication_id: publicationId,
          p_expected_version: expectedVersion,
          p_recipe_disposition: 'delete',
          p_destination_publication_id: null,
        },
      });
      expect(trashPublication.ok(), await trashPublication.text()).toBeTruthy();
    }
    await deletePublicationFixture(request, apiUrl, serviceRoleKey, owner.id, referenceId);

    const retainedReferences = await request.get(
      `${apiUrl}/rest/v1/recipe_references?select=reference_type,display_text,publication_id&recipe_id=eq.${sourceRecipe.id}&reference_type=eq.publication`,
      { headers },
    );
    expect(await retainedReferences.json()).toEqual([
      { reference_type: 'publication', display_text: 'Cooking Book', publication_id: null },
    ]);
    const retainedSourceRecipe = await request.get(
      `${apiUrl}/rest/v1/recipes?select=id,publication_id&id=eq.${sourceRecipe.id}`,
      { headers },
    );
    expect(await retainedSourceRecipe.json()).toEqual([
      { id: sourceRecipe.id, publication_id: magazineId },
    ]);
    const removedSiteListing = await request.get(
      `${apiUrl}/rest/v1/recipe_site_listings?select=id&recipe_id=eq.${sourceRecipe.id}`,
      { headers },
    );
    expect(await removedSiteListing.json()).toEqual([]);
    await page.goto(`/recipes/${sourceRecipe.id}`);
    await expect(page.getByRole('link', { name: 'Roast chicken' })).toHaveCount(0);
    await expect(page.getByText('Roast chicken', { exact: true })).toHaveCount(4);
    await expect(page.getByText('Cooking Book', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cooking Book' })).toHaveCount(0);
    await expect(page.locator('.recipe-secondary-attribution')).toHaveCount(0);

    const sourceVersionResponse = await request.get(
      `${apiUrl}/rest/v1/recipes?select=version&id=eq.${sourceRecipe.id}`,
      { headers },
    );
    const [{ version: sourceVersion }] = (await sourceVersionResponse.json()) as {
      version: number;
    }[];
    const trashSourceRecipe = await request.post(`${apiUrl}/rest/v1/rpc/trash_recipe`, {
      headers,
      data: { p_recipe_id: sourceRecipe.id, p_expected_version: sourceVersion },
    });
    expect(trashSourceRecipe.ok(), await trashSourceRecipe.text()).toBeTruthy();
    await deleteRecipeFixture(request, apiUrl, serviceRoleKey, owner.id, sourceRecipe.id);
    const remainingSourceRelationships = await request.get(
      `${apiUrl}/rest/v1/recipe_references?select=id&recipe_id=eq.${sourceRecipe.id}`,
      { headers },
    );
    expect(await remainingSourceRelationships.json()).toEqual([]);
  } finally {
    await deleteTestUser(request, otherOwner);
    await deleteTestUser(request, owner);
  }
});
