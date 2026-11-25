import { describe, expect, it } from 'vitest';
import standardSchema from '../../schemas/recipe-json-v1.schema.json';
import {
  buildRecipeJsonTemplate,
  getStandardRecipeJsonSchema,
  getStrictRecipeJsonSchema,
} from '../../src/lib/recipe-json/schema-template';
import {
  parseRecipeJsonBytes,
  RecipeJsonValidationError,
} from '../../src/lib/recipe-json/validation.mjs';
import type { RecipePicklistValue } from '../../src/lib/recipes/data';

const minimalRecipeJson = {
  format: 'recipe-box-recipe-json',
  schema_version: 1,
  recipes: [{ name: 'Citrus cake' }],
};

function parse(source: string, fileName = 'recipes.json', schema: object = standardSchema) {
  return parseRecipeJsonBytes(new TextEncoder().encode(source), fileName, schema);
}

const accountFoodType: RecipePicklistValue = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  account_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  category: 'food_type',
  value: 'Snack',
  display_value: 'Snack',
  sort_order: 0,
  is_protected: false,
};

describe('recipe JSON validation', () => {
  it('accepts standard JSON and commented JSONC', () => {
    expect(parse(JSON.stringify(minimalRecipeJson))).toEqual(minimalRecipeJson);
    expect(parse(`// Recipe file\n${JSON.stringify(minimalRecipeJson)}`, 'recipes.jsonc')).toEqual(
      minimalRecipeJson,
    );
  });

  it.each([
    ['comments in .json', `// Not JSON\n${JSON.stringify(minimalRecipeJson)}`, 'recipes.json'],
    [
      'trailing commas in .jsonc',
      '{"format":"recipe-box-recipe-json","schema_version":1,"recipes":[{"name":"Cake"},]}',
      'recipes.jsonc',
    ],
  ])('rejects %s', (_description, source, fileName) => {
    expect(() => parse(source, fileName)).toThrow(RecipeJsonValidationError);
  });

  it('rejects unresolved fillers and identifies their field paths', () => {
    const value = {
      ...minimalRecipeJson,
      recipes: [{ name: '<FILLER>', notes: 'Replace me' }],
    };
    expect(() => parse(JSON.stringify(value))).toThrow('$.recipes[0].name');
  });

  it('rejects unknown database-shaped fields and duplicate normalized names', () => {
    expect(() =>
      parse(JSON.stringify({ ...minimalRecipeJson, recipes: [{ name: 'Cake', id: 'x' }] })),
    ).toThrow('additional properties');

    expect(() =>
      parse(
        JSON.stringify({
          ...minimalRecipeJson,
          recipes: [{ name: 'Café Cake' }, { name: ' café cake ' }],
        }),
      ),
    ).toThrow('duplicates recipes[0].name');
  });

  it('accepts scalar ingredient amounts and rejects legacy range fields', () => {
    const scalar = {
      ...minimalRecipeJson,
      recipes: [
        {
          name: 'Flour cake',
          ingredients: [
            { name: 'Flour', measurements: [{ type: 'volume', amount: 1, unit: 'cup' }] },
          ],
        },
      ],
    };
    expect(() => parse(JSON.stringify(scalar))).not.toThrow();

    for (const rangeField of ['amount_min', 'amount_max']) {
      const legacyRange = {
        ...minimalRecipeJson,
        recipes: [
          {
            name: 'Flour cake',
            ingredients: [
              {
                name: 'Flour',
                measurements: [{ type: 'volume', amount: 1, [rangeField]: 2, unit: 'cup' }],
              },
            ],
          },
        ],
      };
      expect(() => parse(JSON.stringify(legacyRange))).toThrow(RecipeJsonValidationError);
    }
  });

  it('keeps the standard schema open to account picklists and closes them in strict mode', () => {
    const value = {
      ...minimalRecipeJson,
      recipes: [{ name: 'Citrus cake', food_type: 'New account value' }],
    };
    expect(() =>
      parse(JSON.stringify(value), 'recipes.json', getStandardRecipeJsonSchema()),
    ).not.toThrow();
    expect(() =>
      parse(JSON.stringify(value), 'recipes.json', getStrictRecipeJsonSchema([accountFoodType])),
    ).toThrow(RecipeJsonValidationError);
    expect(() =>
      parse(
        JSON.stringify({
          ...minimalRecipeJson,
          recipes: [{ name: 'Citrus cake', food_type: 'Snack' }],
        }),
        'recipes.json',
        getStrictRecipeJsonSchema([accountFoodType]),
      ),
    ).not.toThrow();
  });

  it('documents current account picklist values in the JSONC template', () => {
    const template = buildRecipeJsonTemplate([accountFoodType]);
    expect(template).toContain('Current account values: "Snack"');
    expect(template).toContain('"name": "<FILLER>"');
    expect(template).toContain('"schema_version": 1');
    expect(template).toContain('"type": "volume"');
    expect(template).toContain('"type": "weight"');
    expect(template).toContain('"type": "count"');
    expect(template).toContain('"type": "informal"');
    expect(template).toContain('"type": "unmeasured"');
    expect(template).toContain('"type": "external_url"');
    expect(template).toContain('"type": "printed_citation"');
    expect(template).toContain('"amount": 1');
    expect(template).toContain('"amount_is_a": true');
    expect(template).toContain('// Example Recipe 1: minimal, standalone recipe.');
    expect(template).toContain('// Example Recipe 2: complete, standalone recipe.');
    expect(template).toContain('// Ingredient example 1: volume and weight measurements.');
    expect(template).toContain('// Ingredient example 2: count measurement.');
    expect(template).toContain('// Ingredient example 3: informal quantity ("a").');
    expect(template).toContain('// Ingredient example 4: unmeasured quantity.');
    expect(template).toContain('// Expected number (greater than 0).');
    expect(template).toContain('// Allowed values: tsp, tbsp, fl_oz, cup, pt, qt, gal, ml, l.');
    expect(template).not.toContain('// Entry ');
    expect(template).not.toContain('Use the fixed value');
    expect(template.match(/"type": "<FILLER>"/gu)).toHaveLength(1);
    expect(template).not.toContain('"amount_min"');
    expect(template).not.toContain('"amount_max"');
  });
});
