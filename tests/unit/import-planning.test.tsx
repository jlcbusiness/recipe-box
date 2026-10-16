import { describe, expect, it } from 'vitest';
import { exportTableNames, type PortableData } from '../../src/lib/exports/rules';
import { planDatabaseImport } from '../../src/lib/imports/planning';

const sourcePublicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceRecipeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const destinationPublicationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const destinationRecipeId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const newPublicationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const newRecipeId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const newStepId = '11111111-1111-4111-8111-111111111111';

function emptyData(): PortableData {
  return {
    format: 'recipe-box-data',
    schema_version: 1,
    scope: { type: 'database' },
    account_preferences: {},
    records: Object.fromEntries(
      exportTableNames.map((table) => [table, []]),
    ) as unknown as PortableData['records'],
  };
}

function createInput() {
  const data = emptyData();
  data.records.publications = [
    { id: sourcePublicationId, publication_type: 'book', name: 'Baking Annual' },
  ];
  data.records.recipes = [
    { id: sourceRecipeId, publication_id: sourcePublicationId, name: 'Lemon cake' },
  ];
  data.records.recipe_steps = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      recipe_id: sourceRecipeId,
      position: 0,
      content_markdown: 'Bake.',
      plain_text: 'Bake.',
    },
  ];
  const existing = {
    publications: [
      { id: destinationPublicationId, publication_type: 'book', name: 'Baking Annual' },
    ],
    recipes: [
      {
        id: destinationRecipeId,
        publication_id: destinationPublicationId,
        name: 'Lemon cake',
      },
    ],
  };
  return { data, existing };
}

describe('database import planning', () => {
  it('requires an explicit choice for every matched root', () => {
    const { data, existing } = createInput();

    expect(() => planDatabaseImport(data, existing, {})).toThrow(/match|choice/i);
  });

  it('duplicates a matched publication with a fresh graph under its new ID', () => {
    const { data, existing } = createInput();
    const generatedIds = [newPublicationId, newRecipeId, newStepId];
    const plan = planDatabaseImport(
      data,
      existing,
      {
        [`publication:${sourcePublicationId}`]: {
          action: 'duplicate',
          targetId: destinationPublicationId,
        },
      },
      () => generatedIds.shift() ?? newStepId,
    );

    expect(plan.records.publications).toEqual([
      { id: newPublicationId, publication_type: 'book', name: 'Baking Annual (Imported)' },
    ]);
    expect(plan.records.recipes).toEqual([
      {
        id: newRecipeId,
        publication_id: newPublicationId,
        name: 'Lemon cake',
        is_private: true,
      },
    ]);
    expect(plan.records.recipe_steps).toEqual([
      {
        id: newStepId,
        recipe_id: newRecipeId,
        position: 0,
        content_markdown: 'Bake.',
        plain_text: 'Bake.',
      },
    ]);
  });

  it('duplicates a recipe under the explicitly resolved existing publication', () => {
    const { data, existing } = createInput();
    const generatedIds = [newRecipeId, newStepId];
    const plan = planDatabaseImport(
      data,
      existing,
      {
        [`publication:${sourcePublicationId}`]: {
          action: 'replace',
          targetId: destinationPublicationId,
        },
        [`recipe:${sourceRecipeId}`]: {
          action: 'duplicate',
          targetId: destinationRecipeId,
        },
      },
      () => generatedIds.shift() ?? newStepId,
    );

    expect(plan.records.recipes[0]).toMatchObject({
      id: newRecipeId,
      publication_id: destinationPublicationId,
      name: 'Lemon cake (Imported)',
    });
  });

  it('preserves matched root IDs on Replace and skips the graph on Keep Existing', () => {
    const { data, existing } = createInput();
    const replacePlan = planDatabaseImport(
      data,
      existing,
      {
        [`publication:${sourcePublicationId}`]: {
          action: 'replace',
          targetId: destinationPublicationId,
        },
        [`recipe:${sourceRecipeId}`]: {
          action: 'replace',
          targetId: destinationRecipeId,
        },
      },
      () => newStepId,
    );
    const keepPlan = planDatabaseImport(data, existing, {
      [`publication:${sourcePublicationId}`]: {
        action: 'keep',
        targetId: destinationPublicationId,
      },
      [`recipe:${sourceRecipeId}`]: { action: 'keep', targetId: destinationRecipeId },
    });

    expect(replacePlan.records.publications[0].id).toBe(destinationPublicationId);
    expect(replacePlan.records.recipes[0].id).toBe(destinationRecipeId);
    expect(replacePlan.replacePublicationIds).toEqual([destinationPublicationId]);
    expect(replacePlan.replaceRecipeIds).toEqual([destinationRecipeId]);
    expect(keepPlan.records.publications).toEqual([]);
    expect(keepPlan.records.recipes).toEqual([]);
    expect(keepPlan.records.recipe_steps).toEqual([]);
  });

  it('rejects a choice targeting a record that is not a current match', () => {
    const { data, existing } = createInput();

    expect(() =>
      planDatabaseImport(data, existing, {
        [`publication:${sourcePublicationId}`]: {
          action: 'replace',
          targetId: '99999999-9999-4999-8999-999999999999',
        },
      }),
    ).toThrow(/match|choice/i);
  });

  it('maps media assets to fresh destination IDs while keeping parent links', () => {
    const { data, existing } = createInput();
    const sourceAssetId = '33333333-3333-4333-8333-333333333333';
    data.records.media_assets = [
      {
        id: sourceAssetId,
        recipe_id: sourceRecipeId,
        publication_id: null,
        asset_type: 'recipe_photo',
        status: 'ready',
        full_path: `images/${sourceAssetId}/full.webp`,
        thumbnail_path: `images/${sourceAssetId}/thumbnail.webp`,
        content_type: 'image/webp',
        byte_size: 12,
        width: 10,
        height: 10,
      },
    ];
    const generatedIds = [
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
      '77777777-7777-4777-8777-777777777777',
    ];
    const plan = planDatabaseImport(
      data,
      existing,
      {
        [`publication:${sourcePublicationId}`]: {
          action: 'replace',
          targetId: destinationPublicationId,
        },
        [`recipe:${sourceRecipeId}`]: { action: 'replace', targetId: destinationRecipeId },
      },
      () => generatedIds.shift() ?? newStepId,
    );

    expect(plan.idMappings.media_assets.get(sourceAssetId)).toBe(
      '55555555-5555-4555-8555-555555555555',
    );
    expect(plan.records.media_assets[0]).toMatchObject({
      id: '55555555-5555-4555-8555-555555555555',
      recipe_id: destinationRecipeId,
    });
  });

  it('rewrites ingredient mention IDs embedded in step markdown', () => {
    const { data, existing } = createInput();
    const sourceIngredientId = '88888888-8888-4888-8888-888888888888';
    const sourceRecipeIngredientId = '99999999-9999-4999-8999-999999999999';
    data.records.ingredients = [{ id: sourceIngredientId, name: 'Lemon', sort_order: 0 }];
    data.records.recipe_ingredients = [
      {
        id: sourceRecipeIngredientId,
        recipe_id: sourceRecipeId,
        ingredient_id: sourceIngredientId,
        position: 0,
        is_main: true,
        detail: '',
        preparation: '',
      },
    ];
    data.records.recipe_steps[0].content_markdown = `Add [[ingredient:${sourceRecipeIngredientId}|Lemon]].`;
    const plan = planDatabaseImport(
      data,
      existing,
      {
        [`publication:${sourcePublicationId}`]: {
          action: 'replace',
          targetId: destinationPublicationId,
        },
        [`recipe:${sourceRecipeId}`]: { action: 'replace', targetId: destinationRecipeId },
      },
      () => 'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
    );

    expect(plan.records.recipe_steps[0].content_markdown).toBe(
      `Add [[ingredient:${plan.idMappings.recipe_ingredients.get(sourceRecipeIngredientId)}|Lemon]].`,
    );
    expect(plan.records.recipe_steps[0].content_markdown).not.toContain(sourceRecipeIngredientId);
  });

  it('remaps publication IDs in explorer contexts and filters', () => {
    const { data, existing } = createInput();
    data.records.explorer_state = [
      {
        context_key: `publication-recipes:${sourcePublicationId}`,
        state: {
          schema_version: '1',
          filters: [{ field: 'publication_id', operator: 'equals', value: sourcePublicationId }],
          sort: 'name',
          direction: 'asc',
          view: 'list',
        },
      },
    ];
    const plan = planDatabaseImport(
      data,
      existing,
      {
        [`publication:${sourcePublicationId}`]: {
          action: 'replace',
          targetId: destinationPublicationId,
        },
        [`recipe:${sourceRecipeId}`]: { action: 'replace', targetId: destinationRecipeId },
      },
      () => newStepId,
    );

    expect(plan.records.explorer_state[0]).toMatchObject({
      context_key: `publication-recipes:${destinationPublicationId}`,
      state: {
        filters: [{ field: 'publication_id', operator: 'equals', value: destinationPublicationId }],
      },
    });
  });

  it('reuses normalized catalog records, keeps local densities, and preserves privacy', () => {
    const { data, existing } = createInput();
    const sourceIngredientId = '88888888-8888-4888-8888-888888888888';
    const localIngredientId = '99999999-9999-4999-8999-999999999999';
    const sourcePicklistId = '12121212-1212-4212-8212-121212121212';
    const localPicklistId = '13131313-1313-4313-8313-131313131313';
    const sourceTagId = '14141414-1414-4414-8414-141414141414';
    const localTagId = '15151515-1515-4515-8515-151515151515';
    const sourceRecipeIngredientId = '16161616-1616-4616-8616-161616161616';
    data.records.recipes[0].is_private = false;
    data.records.ingredients = [{ id: sourceIngredientId, name: 'lemon', sort_order: 0 }];
    data.records.recipe_picklist_values = [
      { id: sourcePicklistId, category: 'meal_type', value: 'Brunch', sort_order: 0 },
    ];
    data.records.tags = [{ id: sourceTagId, name: 'Citrus' }];
    data.records.recipe_ingredients = [
      {
        id: sourceRecipeIngredientId,
        recipe_id: sourceRecipeId,
        ingredient_id: sourceIngredientId,
        position: 0,
      },
    ];
    data.records.recipe_picklist_assignments = [
      {
        recipe_id: sourceRecipeId,
        category: 'meal_type',
        picklist_value_id: sourcePicklistId,
      },
    ];
    data.records.recipe_tags = [{ recipe_id: sourceRecipeId, tag_id: sourceTagId }];
    data.records.ingredient_densities = [
      {
        ingredient_id: sourceIngredientId,
        volume_amount: 1,
        volume_unit_code: 'cup',
        weight_amount: 1,
        weight_unit_code: 'lb',
      },
    ];
    const expandedExisting = {
      ...existing,
      ingredients: [{ id: localIngredientId, name: ' Lemon ' }],
      recipe_picklist_values: [{ id: localPicklistId, category: 'meal_type', value: 'Brunch' }],
      tags: [{ id: localTagId, name: 'citrus' }],
      ingredient_densities: [{ ingredient_id: localIngredientId }],
    };

    const plan = planDatabaseImport(
      data,
      expandedExisting,
      {
        [`publication:${sourcePublicationId}`]: {
          action: 'replace',
          targetId: destinationPublicationId,
        },
        [`recipe:${sourceRecipeId}`]: { action: 'replace', targetId: destinationRecipeId },
      },
      () => 'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa',
    );

    expect(plan.records.ingredients).toEqual([]);
    expect(plan.records.recipe_picklist_values).toEqual([]);
    expect(plan.records.tags).toEqual([]);
    expect(plan.records.recipes[0].is_private).toBe(false);
    expect(plan.records.recipe_ingredients[0].ingredient_id).toBe(localIngredientId);
    expect(plan.records.recipe_picklist_assignments[0].picklist_value_id).toBe(localPicklistId);
    expect(plan.records.recipe_tags[0].tag_id).toBe(localTagId);
    expect(plan.records.ingredient_densities).toEqual([]);
    expect(plan.reusedDensityIngredientIds).toEqual([localIngredientId]);
    expect(plan.reusedCatalogRecords).toHaveLength(3);
  });
});
