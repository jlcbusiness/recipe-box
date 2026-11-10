import { describe, expect, it } from 'vitest';
import { buildPublicRecipeCopyPayload } from '../../src/lib/recipes/public-copy-rules';
import type { PublicRecipePhoto } from '../../src/lib/recipes/public-data';
import type { PublicRecipePayload } from '../../src/lib/recipes/public-rules';

const publicId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const publicSetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const publicIngredientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const publicPhotoId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const missingMentionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const missingPhotoId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const recipe: PublicRecipePayload = {
  name: 'Citrus cake',
  serves: 2,
  makes_quantity: 1,
  makes_thing: 'cake',
  timings: {
    prep: 15,
    mixing: null,
    marinate: null,
    chill: null,
    freeze: null,
    cook: 30,
    bake: 35,
    cooling: 20,
    rest: null,
    total: 70,
  },
  equipment: ['Oven'],
  ingredient_sets: [{ id: publicSetId, label: 'Main', position: 0 }],
  ingredients: [
    {
      id: publicIngredientId,
      ingredient_id: publicIngredientId,
      ingredient_set_id: publicSetId,
      ingredient_name: 'Lemon',
      position: 0,
      is_main: true,
      detail: 'zest and juice',
      preparation: '',
      portion_one_ratio: null,
      size_value: null,
      size_unit: null,
      measurements: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          position: 0,
          measurement_type: 'volume',
          amount_min: 1,
          amount_max: null,
          unit_code: 'cup',
          picklist_value_id: null,
          picklist_value: null,
        },
      ],
    },
  ],
  steps: [
    {
      position: 0,
      content_markdown: [
        `Mix [[ingredient:${publicIngredientId}|lemon]].`,
        `Bake with [[photo:${publicPhotoId}]]-200.`,
        `Fold in [[ingredient:${missingMentionId}|pepper]] and [[photo:${missingPhotoId}]]-120.`,
      ].join('\n'),
    },
  ],
  nutrition_per_serving: { calories: 125, protein: 4 },
  attribution: {
    publication_name: 'Baking Annual',
    publication_type: 'book',
    page: '42',
  },
  pairings: ['Tea'],
  references: [
    { display_text: 'Original source', href: 'https://example.test/cake' },
    { display_text: 'Printed note', href: null },
  ],
};

const photo = {
  id: publicPhotoId,
  description: 'Finished cake',
  is_primary: true,
  width: 640,
  height: 480,
  display_width: 640,
  display_height: 480,
  crop: null,
  full_url: `/api/public-recipes/${publicId}/photos/${publicPhotoId}?variant=full`,
  thumbnail_url: `/api/public-recipes/${publicId}/photos/${publicPhotoId}?variant=thumbnail`,
} satisfies PublicRecipePhoto;

function createIdFactory() {
  let value = 0;
  return () => `10000000-0000-4000-8000-${String(++value).padStart(12, '0')}`;
}

describe('public recipe copy payload', () => {
  it('creates new graph IDs and remaps public ingredient and photo markers', () => {
    const payload = buildPublicRecipeCopyPayload(
      {
        publicId,
        authorUsername: 'source-user',
        recipe,
        photoSources: [
          {
            photo,
            fullPath: 'source-private/path/full.webp',
            thumbnailPath: 'source-private/path/thumb.webp',
          },
        ],
      },
      createIdFactory(),
    );
    const ingredientId = payload.recipe.p_ingredient_rows[0]?.recipe_ingredient_id;
    const photoId = payload.photos[0]?.id;
    const step = payload.recipe.p_instruction_steps[0]?.content_markdown ?? '';

    expect(payload.recipe.p_recipe_id).toBeNull();
    expect(ingredientId).toBeTruthy();
    expect(photoId).toBeTruthy();
    expect(ingredientId).not.toBe(publicIngredientId);
    expect(photoId).not.toBe(publicPhotoId);
    expect(step).toContain(`[[ingredient:${ingredientId}|lemon]]`);
    expect(step).toContain(`[[photo:${photoId}]]-200`);
    expect(step).toContain('pepper');
    expect(step).not.toContain(missingMentionId);
    expect(step).not.toContain(missingPhotoId);
    expect(payload.recipe.p_ingredient_sets[0]?.id).not.toBe(publicSetId);
    expect(payload.recipe.p_ingredient_rows[0]).toMatchObject({
      ingredient_id: null,
      ingredient_name: 'Lemon',
      ingredient_set_id: payload.recipe.p_ingredient_sets[0]?.id,
    });
  });

  it('preserves public nutrition, publication attribution, and reference labels only', () => {
    const payload = buildPublicRecipeCopyPayload(
      { publicId, authorUsername: 'source-user', recipe, photoSources: [] },
      createIdFactory(),
    );

    expect(payload.recipe.p_nutrition_overrides).toEqual({ calories: 250, protein: 8 });
    expect(payload.recipe.p_recipe_relationships.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reference_type: 'external_url',
          display_text: 'Original source',
          url: 'https://example.test/cake',
        }),
        expect.objectContaining({
          reference_type: 'printed_citation',
          display_text: 'Printed note',
        }),
        expect.objectContaining({
          reference_type: 'printed_citation',
          display_text: 'Baking Annual · p. 42',
        }),
      ]),
    );
    expect(payload.recipe.p_publication_page).toBeNull();
    expect(payload.recipe.p_recipe_url).toBeNull();
    expect(payload.recipe.p_equipment_names).toEqual(['Oven']);
    expect(JSON.stringify(payload)).not.toContain('source-private/path');
    expect(JSON.stringify(payload)).not.toContain('full_url');
    expect(payload.photos).toEqual([]);
  });

  it('does not carry private ingredient nutrition or source identities into the copy', () => {
    const payload = buildPublicRecipeCopyPayload(
      {
        publicId,
        authorUsername: 'source-user',
        recipe,
        photoSources: [{ photo, fullPath: 'a', thumbnailPath: 'b' }],
      },
      createIdFactory(),
    );

    expect(payload.recipe.p_ingredient_rows[0]).toMatchObject({
      nutrition_serving_size_override: null,
      nutrition_overrides: {},
    });
    expect(payload.recipe.p_ingredient_rows[0]?.measurements[0]).toEqual({
      measurement_type: 'volume',
      amount_min: 1,
      amount_max: null,
      unit_code: 'cup',
      picklist_value_id: null,
    });
    expect(payload.photos[0]).not.toHaveProperty('full_path');
    expect(payload.photos[0]).not.toHaveProperty('thumbnail_path');
    expect(payload.photos[0]).not.toHaveProperty('full_url');
  });

  it('does not copy the Recipe Tin collection as a recipe source citation', () => {
    const payload = buildPublicRecipeCopyPayload(
      {
        publicId,
        authorUsername: 'source-user',
        recipe: {
          ...recipe,
          attribution: {
            publication_name: 'Recipe Tin',
            publication_type: 'collection',
            page: null,
          },
        },
        photoSources: [],
      },
      createIdFactory(),
    );

    expect(payload.recipe.p_recipe_relationships.references).not.toContainEqual(
      expect.objectContaining({
        reference_type: 'printed_citation',
        display_text: 'Recipe Tin',
      }),
    );
  });
});
