import { describe, expect, it } from 'vitest';
import { type ExportSnapshot, exportTableNames } from '../../src/lib/exports/rules';
import {
  createPortableRecipeJsonData,
  type RecipeJsonDocument,
} from '../../src/lib/recipe-json/portable-data';

function emptySnapshot(): ExportSnapshot {
  return {
    accountPreferences: {},
    records: Object.fromEntries(exportTableNames.map((table) => [table, []])),
  };
}

describe('recipe JSON import mapping', () => {
  it('applies private Want to try defaults for name-only recipes', () => {
    const data = createPortableRecipeJsonData(
      {
        format: 'recipe-box-recipe-json',
        schema_version: 1,
        recipes: [{ name: 'Simple recipe' }],
      },
      emptySnapshot(),
      new Date('2027-01-01T00:00:00.000Z'),
      'stable-upload-path',
    );

    expect(data.scope.type).toBe('recipe');
    expect(data.records.recipes).toHaveLength(1);
    expect(data.records.recipes[0]).toMatchObject({
      name: 'Simple recipe',
      state: 'want_to_try',
      made_count: 0,
      is_private: true,
      publication_id: null,
      total_time_minutes: null,
    });
  });

  it('maps editable recipe fields, ordered rows, and text-only references', () => {
    const document: RecipeJsonDocument = {
      format: 'recipe-box-recipe-json',
      schema_version: 1,
      recipes: [
        {
          name: 'Complete recipe',
          food_type: 'Snack',
          state: 'tried',
          verdict: 'Excellent',
          score: 5,
          occasion_details: 'Birthday',
          serves: 4,
          makes_quantity: 1,
          makes_thing: 'cake',
          time_entries: [
            { type: 'Prep', minutes: 20 },
            { type: 'Bake', minutes: 35 },
          ],
          nutrition_overrides: { calories: 100 },
          meal_types: ['Dessert'],
          cuisines: ['French'],
          equipment: ['Oven'],
          tags: ['Celebration'],
          publication_page: '42',
          recipe_url: 'https://example.test/recipe',
          ingredient_sets: ['Main'],
          ingredients: [
            {
              ingredient_set: 'Main',
              name: 'Flour',
              is_main: true,
              detail: 'sifted',
              alternate_note: 'or pastry flour',
              preparation: 'diced',
              measurements: [{ type: 'volume', amount: 2, unit: 'cup' }],
              portion_one_ratio: 0.25,
              size_value: 1,
              size_unit: 'in',
              nutrition_serving_size: { amount: 100, dimension: 'weight', unit: 'g' },
              nutrition_overrides: { protein: 10 },
            },
          ],
          prep_ahead: 'Chill overnight.',
          instructions: ['Mix **well**.', 'Bake until golden.'],
          notes: 'Family favorite.',
          references: [
            {
              type: 'external_url',
              display_text: 'Original recipe',
              url: 'https://example.test/original',
            },
            { type: 'printed_citation', display_text: 'Page 42 in the family cookbook' },
          ],
        },
      ],
    };
    const data = createPortableRecipeJsonData(
      document,
      emptySnapshot(),
      new Date('2027-01-01T00:00:00.000Z'),
      'stable-upload-path',
    );

    expect(data.records.recipes[0]).toMatchObject({
      name: 'Complete recipe',
      state: 'tried',
      made_count: 1,
      score: 5,
      total_time_minutes: 55,
      recipe_url: 'https://example.test/recipe',
      publication_page: '42',
      prep_ahead_markdown: 'Chill overnight.',
      notes_markdown: 'Family favorite.',
      nutrition_overrides: { calories: 400 },
    });
    expect(data.records.recipe_time_entries.map((entry) => entry.minutes)).toEqual([20, 35]);
    expect(data.records.recipe_ingredient_sets).toHaveLength(1);
    expect(data.records.ingredients).toHaveLength(1);
    expect(data.records.recipe_ingredients[0]).toMatchObject({
      detail: 'sifted',
      alternate_note: 'or pastry flour',
      preparation: 'diced',
      portion_one_ratio: 0.25,
      size_value: 1,
      size_unit: 'in',
    });
    expect(data.records.recipe_ingredient_measurements[0]).toMatchObject({
      measurement_type: 'volume',
      amount_min: 2,
      amount_max: null,
      unit_code: 'cup',
    });
    expect(data.records.recipe_steps.map((step) => step.content_markdown)).toEqual([
      'Mix **well**.',
      'Bake until golden.',
    ]);
    expect(data.records.recipe_references).toEqual([
      expect.objectContaining({
        reference_type: 'external_url',
        display_text: 'Original recipe',
        url: 'https://example.test/original',
        publication_id: null,
        linked_recipe_id: null,
        is_protected_source: false,
        source_public_id: null,
      }),
      expect.objectContaining({
        reference_type: 'printed_citation',
        display_text: 'Page 42 in the family cookbook',
        url: null,
      }),
    ]);
  });
});
