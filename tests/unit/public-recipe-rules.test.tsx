import { describe, expect, it } from 'vitest';
import type { RecipeRecord } from '../../src/lib/recipes/data';
import { buildPublicRecipePayload } from '../../src/lib/recipes/public-rules';

const privateRecipe = {
  id: 'private-recipe-id',
  public_id: 'public-recipe-link-id',
  is_private: true,
  name: 'Citrus cake',
  publication_id: 'private-publication-id',
  publication_page: '75',
  recipe_url: 'https://recipe-source.example/cake',
  publication: {
    id: 'private-publication-id',
    name: 'Baking Quarterly',
    publication_type: 'magazine',
    author: 'Private author',
    edition: null,
    isbn: null,
    retailer_url: null,
    site_url: null,
  },
  food_type_id: 'private-food-type',
  state: 'tried',
  score: -5,
  is_starred: true,
  is_hearted: true,
  verdict_id: 'private-verdict',
  enthusiasm_id: 'private-enthusiasm',
  occasion_details: 'Family birthday',
  reason: 'Too much effort',
  serves: 8,
  prep_time_minutes: 15,
  mixing_time_minutes: null,
  marinate_time_minutes: null,
  chill_time_minutes: null,
  freeze_time_minutes: null,
  cook_time_minutes: 30,
  bake_time_minutes: 35,
  cooling_time_minutes: 20,
  rest_time_minutes: null,
  total_time_minutes: 70,
  notes_markdown: 'Private notes',
  version: 12,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  meal_type_ids: ['private-meal-type'],
  cuisine_ids: ['private-cuisine'],
  equipment_ids: ['equipment-id'],
  tags: [{ id: 'private-tag-id', name: 'Personal', color_key: 'sage' }],
  ingredient_sets: [
    { id: 'private-set-main', label: 'Main', position: 0 },
    { id: 'private-set-sauce', label: 'For the sauce', position: 1 },
  ],
  ingredients: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      ingredient_id: '22222222-2222-4222-8222-222222222222',
      ingredient_set_id: 'private-set-main',
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
          id: '33333333-3333-4333-8333-333333333333',
          position: 0,
          measurement_type: 'count',
          amount_min: 2,
          amount_max: null,
          unit_code: null,
          picklist_value_id: '44444444-4444-4444-8444-444444444444',
          picklist_value: null,
        },
      ],
    },
  ],
  steps: [
    {
      id: 'step-id',
      position: 0,
      content_markdown:
        'Add [[ingredient:11111111-1111-4111-8111-111111111111|lemon]] and [[ingredient:55555555-5555-4555-8555-555555555555|pepper]].',
      plain_text: 'Mix the batter.',
    },
  ],
  pairings: [
    {
      id: 'pairing-id',
      display_text: 'Roast chicken',
      linked_recipe_id: 'private-target-recipe-id',
      linked_recipe_is_active: true,
      position: 0,
    },
  ],
  incoming_pairings: [
    {
      source_recipe_id: 'incoming-private-recipe-id',
      source_recipe_name: 'Private roast',
      source_recipe_is_active: true,
    },
  ],
  references: [
    {
      id: 'recipe-reference-id',
      reference_type: 'recipe',
      display_text: 'Lemon curd',
      linked_recipe_id: 'private-reference-recipe-id',
      linked_recipe_is_active: true,
      publication_id: null,
      url: null,
      position: 0,
    },
    {
      id: 'external-reference-id',
      reference_type: 'external_url',
      display_text: 'Original source',
      linked_recipe_id: null,
      linked_recipe_is_active: false,
      publication_id: null,
      url: 'https://recipes.example/lemon-cake',
      position: 1,
    },
    {
      id: 'printed-reference-id',
      reference_type: 'printed_citation',
      display_text: 'The Cake Book, page 12',
      linked_recipe_id: null,
      linked_recipe_is_active: false,
      publication_id: null,
      url: null,
      position: 2,
    },
  ],
} satisfies RecipeRecord;

describe('public recipe projection', () => {
  it('remaps referenced photo IDs without exposing private asset identifiers', () => {
    const assetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const displayId = '00000000-0000-4000-8000-000000000010';
    const recipe = {
      ...privateRecipe,
      steps: [
        {
          ...privateRecipe.steps[0],
          content_markdown: `Turn the cake. [[photo:${assetId}]]-200`,
        },
      ],
    };

    const payload = buildPublicRecipePayload(recipe, [], new Map([[assetId, displayId]]));

    expect(payload.steps[0]?.content_markdown).toBe(`Turn the cake. [[photo:${displayId}]]-200`);
    expect(payload.steps[0]?.content_markdown).not.toContain(assetId);
  });

  it('keeps cooking content and approved attribution while excluding private recipe data', () => {
    const sourceWithMeasurementLink = {
      ...privateRecipe,
      ingredients: privateRecipe.ingredients.map((ingredient) => ({
        ...ingredient,
        measurements: ingredient.measurements.map((measurement) => ({
          ...measurement,
          recipe_ingredient_id: '66666666-6666-4666-8666-666666666666',
        })),
      })),
    };
    const payload = buildPublicRecipePayload(sourceWithMeasurementLink, ['Oven']);

    expect(payload).toEqual({
      name: 'Citrus cake',
      serves: 8,
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
      ingredient_sets: [
        { id: '00000000-0000-4000-8000-000000000000', label: 'Main', position: 0 },
        { id: '00000000-0000-4000-8000-000000000001', label: 'For the sauce', position: 1 },
      ],
      ingredients: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          ingredient_id: '00000000-0000-4000-8000-000000000002',
          ingredient_set_id: '00000000-0000-4000-8000-000000000000',
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
              id: '00000000-0000-4000-8000-000000000003',
              position: 0,
              measurement_type: 'count',
              amount_min: 2,
              amount_max: null,
              unit_code: null,
              picklist_value_id: null,
              picklist_value: null,
            },
          ],
        },
      ],
      steps: [
        {
          position: 0,
          content_markdown:
            'Add [[ingredient:00000000-0000-4000-8000-000000000002|lemon]] and [[ingredient:00000000-0000-4000-8000-000000000004|pepper]].',
        },
      ],
      attribution: { publication_name: 'Baking Quarterly', page: '75' },
      pairings: ['Roast chicken'],
      references: [
        { display_text: 'Lemon curd', href: null },
        {
          display_text: 'Original source',
          href: 'https://recipes.example/lemon-cake',
        },
        { display_text: 'The Cake Book, page 12', href: null },
      ],
    });

    const serialized = JSON.stringify(payload);
    expect(payload).not.toHaveProperty('score');
    expect(payload).not.toHaveProperty('is_starred');
    expect(payload).not.toHaveProperty('is_hearted');
    for (const forbiddenValue of [
      'private-recipe-id',
      'private-publication-id',
      'Private author',
      'private-food-type',
      'private-verdict',
      'private-enthusiasm',
      'Family birthday',
      'Too much effort',
      'Private notes',
      'private-tag-id',
      'private-set-main',
      'private-set-sauce',
      'private-target-recipe-id',
      'private-reference-recipe-id',
      'incoming-private-recipe-id',
      'Private roast',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
      '66666666-6666-4666-8666-666666666666',
    ]) {
      expect(serialized).not.toContain(forbiddenValue);
    }
  });

  it.each([
    ['javascript:alert(1)', null],
    ['data:text/html,unsafe', null],
    ['//recipes.example/path', null],
    ['https://user:password@recipes.example/path', null],
    ['http://recipes.example/path', 'http://recipes.example/path'],
    ['https://recipes.example/path', 'https://recipes.example/path'],
  ])('only exposes safe external links for %s', (url, expectedHref) => {
    const recipe = {
      ...privateRecipe,
      references: [
        {
          ...privateRecipe.references[1],
          url,
        },
      ],
    } satisfies RecipeRecord;

    expect(buildPublicRecipePayload(recipe, []).references).toEqual([
      { display_text: 'Original source', href: expectedHref },
    ]);
  });
});
