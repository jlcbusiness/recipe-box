import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertExportLimits,
  buildBundleManifest,
  buildPortableData,
  isDatabaseExportReminderDue,
  parseExportScope,
} from '../../src/lib/exports/rules';

const ownerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const firstPublicationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secondPublicationId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const firstRecipeId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const secondRecipeId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const trashedRecipeId = '88888888-8888-4888-8888-888888888888';
const firstIngredientId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const secondIngredientId = '11111111-1111-4111-8111-111111111111';
const firstRowId = '22222222-2222-4222-8222-222222222222';
const secondRowId = '33333333-3333-4333-8333-333333333333';
const firstSetId = '99999999-9999-4999-8999-999999999999';
const secondSetId = 'aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa';
const firstStepId = '44444444-4444-4444-8444-444444444444';
const firstAssetId = '55555555-5555-4555-8555-555555555555';
const secondAssetId = '66666666-6666-4666-8666-666666666666';
const unrelatedAssetId = '77777777-7777-4777-8777-777777777777';

function createSnapshot() {
  return {
    accountPreferences: {
      id: ownerId,
      volume_system: 'metric',
      weight_system: 'us_customary',
      temperature_system: 'celsius',
      ingredient_color: 'blue',
      temperature_color: 'red',
      duration_color: 'orange',
      private_print_uses_colors: true,
      include_instruction_photos_in_private_print: false,
      repeat_ingredients_in_private_print: false,
      include_private_details_in_private_print: false,
      is_admin: true,
      sign_in_method: 'password',
      last_database_export_at: '2026-01-01T00:00:00.000Z',
    },
    records: {
      recipes: [
        {
          id: firstRecipeId,
          account_id: ownerId,
          publication_id: firstPublicationId,
          publication_page: 'Spring 2026',
          name: 'Lemon cake',
          state: 'tried',
          score: 5,
          is_starred: true,
          is_hearted: false,
          is_private: true,
          public_link_id: 'future-public-link-identity',
          food_type_category: 'food_type',
          verdict_category: 'verdict',
          enthusiasm_category: 'enthusiasm',
          trashed_at: null,
          trashed_by_user_id: ownerId,
        },
        {
          id: secondRecipeId,
          account_id: ownerId,
          publication_id: secondPublicationId,
          name: 'Tomato soup',
          state: 'tried',
          score: null,
          is_starred: false,
          is_hearted: true,
          is_private: false,
          trashed_at: null,
        },
        {
          id: trashedRecipeId,
          account_id: ownerId,
          publication_id: firstPublicationId,
          name: 'Trashed lemon loaf',
          state: 'tried',
          score: -5,
          is_starred: true,
          is_hearted: true,
          is_private: false,
          trashed_at: '2026-10-01T00:00:00.000Z',
        },
      ],
      publications: [
        { id: firstPublicationId, account_id: ownerId, name: 'Cakes' },
        { id: secondPublicationId, account_id: ownerId, name: 'Soups' },
      ],
      recipe_picklist_values: [
        { id: 'food-type-cake', account_id: ownerId, category: 'food_type' },
        { id: 'food-type-soup', account_id: ownerId, category: 'food_type' },
      ],
      recipe_picklist_assignments: [
        { recipe_id: firstRecipeId, picklist_value_id: 'meal-dessert' },
        { recipe_id: secondRecipeId, picklist_value_id: 'meal-dinner' },
      ],
      ingredients: [
        { id: firstIngredientId, account_id: ownerId, name: 'Lemon' },
        { id: secondIngredientId, account_id: ownerId, name: 'Tomato' },
      ],
      recipe_ingredients: [
        {
          id: firstRowId,
          recipe_id: firstRecipeId,
          ingredient_id: firstIngredientId,
          ingredient_set_id: firstSetId,
          portion_one_ratio: 0.25,
          size_value: 1.5,
          size_unit: 'in',
        },
        { id: secondRowId, recipe_id: secondRecipeId, ingredient_id: secondIngredientId },
      ],
      recipe_ingredient_sets: [
        { id: firstSetId, recipe_id: firstRecipeId, label: 'Main', position: 0 },
        { id: secondSetId, recipe_id: secondRecipeId, label: 'Main', position: 0 },
      ],
      recipe_ingredient_measurements: [
        { id: 'measurement-cake', recipe_ingredient_id: firstRowId },
        { id: 'measurement-soup', recipe_ingredient_id: secondRowId },
      ],
      recipe_steps: [{ id: firstStepId, recipe_id: firstRecipeId }],
      recipe_step_mentions: [
        {
          id: 'mention-cake',
          recipe_step_id: firstStepId,
          recipe_ingredient_id: firstRowId,
          portion_ordinal: 2,
        },
      ],
      recipe_site_listings: [{ id: 'listing-cake', recipe_id: firstRecipeId }],
      recipe_pairings: [{ id: 'pairing-cake', source_recipe_id: firstRecipeId }],
      recipe_references: [{ id: 'reference-cake', recipe_id: firstRecipeId }],
      ingredient_densities: [{ ingredient_id: firstIngredientId, volume_amount: 1 }],
      tags: [{ id: 'tag-cake', account_id: ownerId, name: 'Baking' }],
      recipe_tags: [{ recipe_id: firstRecipeId, tag_id: 'tag-cake' }],
      publication_tags: [{ publication_id: firstPublicationId, tag_id: 'tag-cake' }],
      explorer_state: [{ context_key: 'recipes-find', state: { view: 'list' } }],
      media_assets: [
        {
          id: firstAssetId,
          account_id: ownerId,
          recipe_id: firstRecipeId,
          publication_id: null,
          status: 'ready',
          crop: { left: 0.25, top: 0.125, width: 0.5, height: 0.75, rotation: 90 },
          full_path: `${ownerId}/assets/${firstAssetId}/full.webp`,
          thumbnail_path: `${ownerId}/assets/${firstAssetId}/thumb.webp`,
          source_full_path: `${ownerId}/assets/${firstAssetId}/full.webp`,
          source_thumbnail_path: `${ownerId}/assets/${firstAssetId}/thumb.webp`,
          source_byte_size: 1200,
          byte_size: 1200,
          width: 1200,
          height: 800,
          created_by_user_id: ownerId,
        },
        {
          id: secondAssetId,
          account_id: ownerId,
          recipe_id: null,
          publication_id: firstPublicationId,
          status: 'ready',
          crop: null,
          full_path: `${ownerId}/assets/${secondAssetId}/full.webp`,
          thumbnail_path: `${ownerId}/assets/${secondAssetId}/thumb.webp`,
          source_full_path: `${ownerId}/assets/${secondAssetId}/full.webp`,
          source_thumbnail_path: `${ownerId}/assets/${secondAssetId}/thumb.webp`,
          source_byte_size: 1500,
          byte_size: 1500,
        },
        {
          id: unrelatedAssetId,
          account_id: ownerId,
          recipe_id: secondRecipeId,
          publication_id: null,
          status: 'pending',
          full_path: null,
          thumbnail_path: null,
        },
      ],
      recipe_history: [{ id: 'history-private', account_id: ownerId }],
    },
  };
}

describe('export rules', () => {
  it('accepts only supported scope shapes and valid record identifiers', () => {
    expect(parseExportScope({ type: 'database' })).toEqual({ type: 'database' });
    expect(parseExportScope({ type: 'publication', id: firstPublicationId })).toEqual({
      type: 'publication',
      id: firstPublicationId,
    });
    expect(parseExportScope({ type: 'recipe', id: firstRecipeId })).toEqual({
      type: 'recipe',
      id: firstRecipeId,
    });
    expect(parseExportScope({ type: 'account', id: ownerId })).toBeNull();
    expect(parseExportScope({ type: 'recipe', id: '../../private' })).toBeNull();
    expect(parseExportScope({ type: 'database', id: ownerId })).toBeNull();
    expect(parseExportScope(null)).toBeNull();
  });

  it('exports the complete owner graph for a publication without unrelated rows', () => {
    const output = buildPortableData(createSnapshot(), {
      type: 'publication',
      id: firstPublicationId,
    });

    expect(output.records.publications.map((record) => record.id)).toEqual([firstPublicationId]);
    expect(output.records.recipes[0].publication_page).toBe('Spring 2026');
    expect(output.records.recipes.map((record) => record.id)).toEqual([firstRecipeId]);
    expect(output.records.ingredients.map((record) => record.id)).toEqual([firstIngredientId]);
    expect(output.records.recipe_ingredients.map((record) => record.id)).toEqual([firstRowId]);
    expect(output.records.recipe_ingredient_sets).toEqual([
      { id: firstSetId, recipe_id: firstRecipeId, label: 'Main', position: 0 },
    ]);
    expect(output.records.recipe_ingredients[0]).toMatchObject({
      portion_one_ratio: 0.25,
      size_value: 1.5,
      size_unit: 'in',
    });
    expect(output.records.recipe_step_mentions[0].portion_ordinal).toBe(2);
    expect(output.records.recipe_ingredient_measurements.map((record) => record.id)).toEqual([
      'measurement-cake',
    ]);
    expect(output.records.recipe_steps.map((record) => record.id)).toEqual([firstStepId]);
    expect(output.records.recipe_step_mentions.map((record) => record.id)).toEqual([
      'mention-cake',
    ]);
    expect(output.records.recipe_pairings.map((record) => record.id)).toEqual(['pairing-cake']);
    expect(output.records.recipe_references.map((record) => record.id)).toEqual(['reference-cake']);
    expect(output.records.media_assets.map((record) => record.id)).toEqual([
      firstAssetId,
      secondAssetId,
    ]);
    expect(output.records.explorer_state).toEqual([]);
    expect('recipe_history' in output.records).toBe(false);
  });

  it('exports only the selected recipe graph and its basic publication metadata', () => {
    const output = buildPortableData(createSnapshot(), { type: 'recipe', id: firstRecipeId });

    expect(output.records.recipes.map((record) => record.id)).toEqual([firstRecipeId]);
    expect(output.records.publications.map((record) => record.id)).toEqual([firstPublicationId]);
    expect(output.records.recipe_pairings.map((record) => record.id)).toEqual(['pairing-cake']);
    expect(output.records.media_assets.map((record) => record.id)).toEqual([firstAssetId]);
    expect(output.records.explorer_state).toEqual([]);
  });

  it('keeps trashed records in database exports but excludes them from scoped exports', () => {
    const snapshot = createSnapshot();
    const database = buildPortableData(snapshot, { type: 'database' });
    const publication = buildPortableData(snapshot, {
      type: 'publication',
      id: firstPublicationId,
    });
    const recipe = buildPortableData(snapshot, { type: 'recipe', id: trashedRecipeId });

    expect(database.records.recipes.map((record) => record.id)).toContain(trashedRecipeId);
    expect(publication.records.recipes.map((record) => record.id)).not.toContain(trashedRecipeId);
    expect(recipe.records.recipes).toEqual([]);
  });

  it('keeps product preferences and recipe privacy while stripping account and auth fields', () => {
    const output = buildPortableData(createSnapshot(), { type: 'database' });

    expect(output.account_preferences).toEqual({
      volume_system: 'metric',
      weight_system: 'us_customary',
      temperature_system: 'celsius',
      ingredient_color: 'blue',
      temperature_color: 'red',
      duration_color: 'orange',
      private_print_uses_colors: true,
      include_instruction_photos_in_private_print: false,
      repeat_ingredients_in_private_print: false,
      include_private_details_in_private_print: false,
    });
    expect(output.records.recipes[0]).toMatchObject({ is_private: true });
    expect(output.records.recipes[0]).not.toHaveProperty('food_type_category');
    expect(output.records.recipes[0]).not.toHaveProperty('verdict_category');
    expect(output.records.recipes[0]).not.toHaveProperty('enthusiasm_category');
    expect(output.records.recipes[0]).not.toHaveProperty('public_link_id');
    expect(output.records.recipes[0]).not.toHaveProperty('trashed_by_user_id');
    expect(output.records.recipes[0]).not.toHaveProperty('account_id');
    expect(output.records.recipes[0]).toMatchObject({
      score: 5,
      is_starred: true,
      is_hearted: false,
    });
    expect(output.records.media_assets[0]).toMatchObject({
      full_path: `images/${firstAssetId}/full.webp`,
      thumbnail_path: `images/${firstAssetId}/thumbnail.webp`,
      crop: { left: 0.25, top: 0.125, width: 0.5, height: 0.75, rotation: 90 },
    });
    expect(output.records.media_assets[0]).not.toHaveProperty('created_by_user_id');
    expect(output.records.media_assets[0]).not.toHaveProperty('account_id');
    expect(output.account_preferences).not.toHaveProperty('is_admin');
    expect(output.account_preferences).not.toHaveProperty('sign_in_method');
    expect(output.account_preferences).not.toHaveProperty('id');
    expect(output.account_preferences).not.toHaveProperty('last_database_export_at');
    expect(output.records.media_assets.some((record) => record.id === unrelatedAssetId)).toBe(
      false,
    );
  });

  it('creates a checksummed manifest for every payload file', () => {
    const data = Buffer.from('{"ok":true}', 'utf8');
    const image = Buffer.from([1, 2, 3]);
    const manifest = buildBundleManifest(
      { type: 'recipe', id: firstRecipeId },
      [
        { path: 'data.json', bytes: data },
        { path: `images/${firstAssetId}/full.webp`, bytes: image },
      ],
      '0.1.0',
      new Date('2026-10-15T12:00:00.000Z'),
    );

    expect(manifest.schema_version).toBe(7);
    expect(manifest.scope).toEqual({ type: 'recipe', id: firstRecipeId });
    expect(manifest.files).toEqual([
      {
        path: 'data.json',
        size_bytes: data.byteLength,
        sha256: createHash('sha256').update(data).digest('hex'),
      },
      {
        path: `images/${firstAssetId}/full.webp`,
        size_bytes: image.byteLength,
        sha256: createHash('sha256').update(image).digest('hex'),
      },
    ]);
  });

  it('rejects duplicate, unsafe, and unsupported bundle paths', () => {
    const bytes = Buffer.from('{}', 'utf8');
    const invalidPaths = [
      '../data.json',
      './data.json',
      'C:/data.json',
      'notes.txt',
      'images/not-a-uuid/full.webp',
      'images/55555555-5555-4555-8555-555555555555/preview.webp',
    ];

    for (const path of invalidPaths) {
      expect(() =>
        buildBundleManifest(
          { type: 'database' },
          [
            { path: 'data.json', bytes },
            { path, bytes },
          ],
          '0.1.0',
          new Date('2026-10-15T12:00:00.000Z'),
        ),
      ).toThrow(/path/i);
    }

    expect(() =>
      buildBundleManifest(
        { type: 'database' },
        [
          { path: 'data.json', bytes },
          { path: 'data.json', bytes },
        ],
        '0.1.0',
        new Date('2026-10-15T12:00:00.000Z'),
      ),
    ).toThrow(/path/i);
  });

  it('rejects oversized media and JSON before recording a successful export', () => {
    expect(() => assertExportLimits(1024, 1024)).not.toThrow();
    expect(() => assertExportLimits(64 * 1024 * 1024 + 1, 0)).toThrow(/data/i);
    expect(() => assertExportLimits(0, 1024 * 1024 * 1024 + 1)).toThrow(/media/i);
  });

  it('reminds when no full export exists or it is more than 30 days old', () => {
    const now = new Date('2026-10-15T12:00:00.000Z');

    expect(isDatabaseExportReminderDue(null, now)).toBe(true);
    expect(isDatabaseExportReminderDue('2026-09-14T11:59:59.999Z', now)).toBe(true);
    expect(isDatabaseExportReminderDue('2026-09-15T12:00:00.000Z', now)).toBe(false);
    expect(isDatabaseExportReminderDue('2026-10-14T12:00:00.000Z', now)).toBe(false);
  });
});
