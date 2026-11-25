import standardSchema from '../../../schemas/recipe-json-v1.schema.json';
import type { RecipePicklistValue } from '../recipes/data';
import { NUTRIENT_DEFINITIONS } from '../recipes/nutrition-rules';

type JsonSchema = Record<string, unknown>;
type CatalogValues = Partial<Record<RecipePicklistValue['category'], string[]>>;

const filler = '<FILLER>';
const picklistFields: Record<string, RecipePicklistValue['category']> = {
  food_type: 'food_type',
  verdict: 'verdict',
  enthusiasm: 'enthusiasm',
  meal_types: 'meal_type',
  cuisines: 'cuisine',
  equipment: 'equipment',
};

function catalogValues(picklists: RecipePicklistValue[]): CatalogValues {
  const result: CatalogValues = {};
  for (const picklist of picklists) {
    const values = result[picklist.category] ?? [];
    if (!values.includes(picklist.display_value)) values.push(picklist.display_value);
    result[picklist.category] = values;
  }
  return result;
}

function cloneStandardSchema(): JsonSchema {
  return JSON.parse(JSON.stringify(standardSchema)) as JsonSchema;
}

function nestedSchema(root: JsonSchema, path: (string | number)[]): JsonSchema {
  let current = root;
  for (const part of path) {
    current = (current[String(part)] ?? {}) as JsonSchema;
  }
  return current;
}

function setCatalogEnum(root: JsonSchema, path: (string | number)[], values: string[]): void {
  const field = nestedSchema(root, path);
  if (values.length > 0) {
    field.enum = values;
    delete field.not;
    return;
  }
  delete field.enum;
  field.not = {};
}

export function getStandardRecipeJsonSchema(): JsonSchema {
  return cloneStandardSchema();
}

export function getStrictRecipeJsonSchema(picklists: RecipePicklistValue[]): JsonSchema {
  const schema = cloneStandardSchema();
  const values = catalogValues(picklists);
  const recipeProperties = ['$defs', 'recipe', 'properties'];
  setCatalogEnum(schema, [...recipeProperties, 'food_type'], values.food_type ?? []);
  setCatalogEnum(schema, [...recipeProperties, 'verdict'], values.verdict ?? []);
  setCatalogEnum(schema, [...recipeProperties, 'enthusiasm'], values.enthusiasm ?? []);
  setCatalogEnum(schema, [...recipeProperties, 'meal_types', 'items'], values.meal_type ?? []);
  setCatalogEnum(schema, [...recipeProperties, 'cuisines', 'items'], values.cuisine ?? []);
  setCatalogEnum(schema, [...recipeProperties, 'equipment', 'items'], values.equipment ?? []);
  setCatalogEnum(
    schema,
    [...recipeProperties, 'time_entries', 'items', 'properties', 'type'],
    values.time_type ?? [],
  );
  setCatalogEnum(
    schema,
    [
      ...recipeProperties,
      'ingredients',
      'items',
      'properties',
      'measurements',
      'items',
      'oneOf',
      3,
      'properties',
      'value',
    ],
    values.informal_unit ?? [],
  );
  setCatalogEnum(
    schema,
    [
      ...recipeProperties,
      'ingredients',
      'items',
      'properties',
      'measurements',
      'items',
      'oneOf',
      4,
      'properties',
      'value',
    ],
    values.unmeasured_phrase ?? [],
  );
  return schema;
}

function completeExample() {
  const values = Object.fromEntries(NUTRIENT_DEFINITIONS.map(({ key }) => [key, filler]));
  return {
    name: filler,
    food_type: filler,
    state: filler,
    verdict: filler,
    enthusiasm: filler,
    score: filler,
    occasion_details: filler,
    reason: filler,
    serves: filler,
    makes_quantity: filler,
    makes_thing: filler,
    time_entries: [{ type: filler, minutes: filler }],
    nutrition_overrides: values,
    meal_types: [filler],
    cuisines: [filler],
    equipment: [filler],
    tags: [filler],
    publication_page: filler,
    recipe_url: filler,
    ingredient_sets: [filler],
    ingredients: [
      {
        ingredient_set: filler,
        name: filler,
        is_main: filler,
        detail: filler,
        alternate_note: filler,
        preparation: filler,
        measurements: [
          { type: filler, amount: filler, unit: filler },
          { type: filler, amount: filler, unit: filler },
        ],
        portion_one_ratio: filler,
        size_value: filler,
        size_unit: filler,
        nutrition_serving_size: { amount: filler, dimension: filler, unit: filler },
        nutrition_overrides: values,
      },
      {
        ingredient_set: filler,
        name: filler,
        is_main: filler,
        detail: filler,
        alternate_note: filler,
        preparation: filler,
        measurements: [{ type: filler, amount: filler }],
        portion_one_ratio: filler,
        size_value: filler,
        size_unit: filler,
        nutrition_serving_size: filler,
        nutrition_overrides: {},
      },
      {
        ingredient_set: filler,
        name: filler,
        is_main: filler,
        detail: filler,
        alternate_note: filler,
        preparation: filler,
        measurements: [
          {
            type: filler,
            amount: 1,
            amount_is_a: true,
            value: filler,
          },
        ],
        portion_one_ratio: filler,
        size_value: filler,
        size_unit: filler,
        nutrition_serving_size: filler,
        nutrition_overrides: {},
      },
      {
        ingredient_set: filler,
        name: filler,
        is_main: filler,
        detail: filler,
        alternate_note: filler,
        preparation: filler,
        measurements: [{ type: filler, value: filler }],
        portion_one_ratio: filler,
        size_value: filler,
        size_unit: filler,
        nutrition_serving_size: filler,
        nutrition_overrides: {},
      },
    ],
    prep_ahead: filler,
    instructions: [filler],
    notes: filler,
    references: [
      { type: filler, display_text: filler, url: filler },
      { type: filler, display_text: filler },
    ],
  };
}

function resolveReference(root: JsonSchema, schema: JsonSchema): JsonSchema {
  if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/')) return schema;
  return nestedSchema(root, schema.$ref.slice(2).split('/'));
}

function itemSchemaForPath(
  root: JsonSchema,
  schema: JsonSchema,
  index: number,
  path: string,
): JsonSchema {
  const resolved = resolveReference(root, schema);
  const items = (resolved.items ?? {}) as JsonSchema;
  if (!Array.isArray(items.oneOf)) return resolveReference(root, items);
  const branch = path.includes('.measurements[')
    ? measurementBranch(path)
    : path.includes('.references[')
      ? index
      : index;
  return resolveReference(root, (items.oneOf[branch] ?? {}) as JsonSchema);
}

function measurementBranch(path: string): number {
  const ingredientIndex = Number(/\.(?:ingredients)\[(\d+)\]/u.exec(path)?.[1] ?? -1);
  const measurementIndex = Number(/\.measurements\[(\d+)\]/u.exec(path)?.[1] ?? -1);
  if (ingredientIndex === 0) return measurementIndex === 1 ? 1 : 0;
  if (ingredientIndex === 1) return 2;
  if (ingredientIndex === 2) return 3;
  return 4;
}

function picklistCategory(path: string, key: string): RecipePicklistValue['category'] | null {
  const field = path.split('.').at(-1) ?? key;
  if (picklistFields[field]) return picklistFields[field];
  if (field === 'type' && path.includes('.time_entries[')) return 'time_type';
  if (field === 'value' && path.includes('.measurements[')) {
    const branch = measurementBranch(path);
    if (branch === 3) return 'informal_unit';
    if (branch === 4) return 'unmeasured_phrase';
  }
  return null;
}

function schemaDescription(schema: JsonSchema): string {
  if (typeof schema.description === 'string') return schema.description;
  if (Array.isArray(schema.enum)) return `Allowed values: ${schema.enum.join(', ')}.`;
  const types = Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type;
  const constraints = [
    typeof schema.minLength === 'number' ? `at least ${schema.minLength} characters` : '',
    typeof schema.maxLength === 'number' ? `at most ${schema.maxLength} characters` : '',
    typeof schema.minimum === 'number' ? `minimum ${schema.minimum}` : '',
    typeof schema.exclusiveMinimum === 'number' ? `greater than ${schema.exclusiveMinimum}` : '',
    typeof schema.maximum === 'number' ? `maximum ${schema.maximum}` : '',
    typeof schema.exclusiveMaximum === 'number' ? `less than ${schema.exclusiveMaximum}` : '',
  ].filter(Boolean);
  return `Expected ${types || 'a value'}${constraints.length ? ` (${constraints.join(', ')})` : ''}.`;
}

function schemaFixedValue(schema: JsonSchema): unknown | undefined {
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length === 1) return schema.enum[0];
  return undefined;
}

function commentFor(
  root: JsonSchema,
  schema: JsonSchema,
  path: string,
  key: string,
  values: CatalogValues,
): string | null {
  const resolved = resolveReference(root, schema);
  if (schemaFixedValue(resolved) !== undefined) return null;
  let description = schemaDescription(resolved);
  const category = picklistCategory(path, key);
  if (category) {
    const allowed = values[category] ?? [];
    const list = allowed.length
      ? allowed.map((value) => JSON.stringify(value).replaceAll('*/', '*\\/')).join(', ')
      : '(none)';
    description += ` Current account values: ${list}. Import can create new values where supported.`;
  }
  return description.replaceAll(/\s+/gu, ' ').replaceAll('*/', '*\\/');
}

function arrayItemComment(path: string, index: number): string | null {
  if (path === '$.recipes') {
    if (index === 0) return 'Example Recipe 1: minimal, standalone recipe.';
    if (index === 1) return 'Example Recipe 2: complete, standalone recipe.';
  }
  if (path === '$.recipes[1].ingredients') {
    const ingredientExamples = [
      'Ingredient example 1: volume and weight measurements.',
      'Ingredient example 2: count measurement.',
      'Ingredient example 3: informal quantity ("a").',
      'Ingredient example 4: unmeasured quantity.',
    ];
    return ingredientExamples[index] ?? null;
  }
  return null;
}

function renderJsonc(
  value: unknown,
  schema: JsonSchema,
  root: JsonSchema,
  values: CatalogValues,
  path: string,
  depth: number,
): string[] {
  const indent = '  '.repeat(depth);
  const resolved = resolveReference(root, schema);
  if (Array.isArray(value)) {
    if (value.length === 0) return ['[]'];
    const lines = ['['];
    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      const itemSchema = itemSchemaForPath(root, resolved, index, itemPath);
      const comment = arrayItemComment(path, index);
      if (comment) lines.push(`${'  '.repeat(depth + 1)}// ${comment}`);
      const rendered = renderJsonc(item, itemSchema, root, values, itemPath, depth + 1);
      lines.push(
        ...rendered.map((line, lineIndex) =>
          lineIndex === 0 ? `${'  '.repeat(depth + 1)}${line}` : line,
        ),
      );
      if (index < value.length - 1) lines[lines.length - 1] += ',';
    });
    lines.push(`${indent}]`);
    return lines;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    const lines = ['{'];
    entries.forEach(([key, childValue], index) => {
      const childPath = `${path}.${key}`;
      const childSchema = resolveReference(
        root,
        ((resolved.properties as Record<string, JsonSchema> | undefined)?.[key] ??
          (resolved.additionalProperties as JsonSchema | undefined) ??
          {}) as JsonSchema,
      );
      const comment = commentFor(root, childSchema, childPath, key, values);
      if (comment) lines.push(`${'  '.repeat(depth + 1)}// ${comment}`);
      const rendered = renderJsonc(childValue, childSchema, root, values, childPath, depth + 1);
      lines.push(
        `${'  '.repeat(depth + 1)}${JSON.stringify(key)}: ${rendered[0]}`,
        ...rendered.slice(1),
      );
      if (index < entries.length - 1) lines[lines.length - 1] += ',';
    });
    lines.push(`${indent}}`);
    return lines;
  }
  const fixedValue = schemaFixedValue(resolved);
  if (fixedValue !== undefined) {
    const serialized = JSON.stringify(fixedValue);
    if (serialized === undefined) {
      throw new Error('The recipe JSON schema contains a non-JSON fixed value.');
    }
    return [serialized];
  }
  return [JSON.stringify(value)];
}

export function buildRecipeJsonTemplate(picklists: RecipePicklistValue[]): string {
  const schema = getStandardRecipeJsonSchema();
  const values = catalogValues(picklists);
  const value = {
    format: 'recipe-box-recipe-json',
    schema_version: 1,
    recipes: [{ name: filler }, completeExample()],
  };
  const recipeItemSchema = resolveReference(
    schema,
    (nestedSchema(schema, ['$defs', 'recipe']) ?? {}) as JsonSchema,
  );
  const templateSchema: JsonSchema = {
    type: 'object',
    properties: {
      format: (nestedSchema(schema, ['properties', 'format']) ?? {}) as JsonSchema,
      schema_version: (nestedSchema(schema, ['properties', 'schema_version']) ?? {}) as JsonSchema,
      recipes: {
        type: 'array',
        items: { oneOf: [recipeItemSchema, recipeItemSchema] },
      },
    },
  };
  const output = renderJsonc(value, templateSchema, schema, values, '$', 0);
  return `${output.join('\n')}\n`;
}
