import { createHash, randomUUID } from 'node:crypto';
import type { ExportRecord, ExportSnapshot, ExportTableName, PortableData } from '../exports/rules';
import { EXPORT_SCHEMA_VERSION, exportTableNames } from '../exports/rules';
import { normalizeImportName } from '../imports/normalize-import-name.mjs';
import { normalizeHttpUrl } from '../publications/validation';
import type { RecipePicklistValue } from '../recipes/data';
import {
  type IngredientRowDraft,
  type IngredientRowPayload,
  serializeIngredientRows,
} from '../recipes/ingredient-rules';
import { instructionPlainText } from '../recipes/instruction-rules';
import {
  getNutritionBasisSignature,
  isNutritionBasis,
  NUTRIENT_DEFINITIONS,
  type NutrientKey,
  type NutritionBasis,
  type NutritionFieldOverrides,
} from '../recipes/nutrition-rules';
import { RecipeJsonValidationError } from './validation.mjs';

type JsonNutrition = Partial<Record<NutrientKey, number>>;
type JsonMeasurement = {
  type: 'volume' | 'weight' | 'count' | 'informal' | 'unmeasured';
  amount?: number;
  amount_is_a?: boolean;
  unit?: string;
  value?: string;
};
type JsonIngredient = {
  ingredient_set?: string;
  name: string;
  is_main?: boolean;
  detail?: string;
  alternate_note?: string;
  preparation?: string;
  measurements?: JsonMeasurement[];
  portion_one_ratio?: number | null;
  size_value?: number | null;
  size_unit?: 'in' | 'cm' | null;
  nutrition_serving_size?: {
    amount: number;
    dimension: 'volume' | 'weight';
    unit: string;
  } | null;
  nutrition_overrides?: JsonNutrition;
};
type JsonReference =
  | { type: 'external_url'; display_text: string; url: string }
  | { type: 'printed_citation'; display_text: string };
export type RecipeJsonRecipe = {
  name: string;
  food_type?: string;
  state?: 'want_to_try' | 'tried' | 'will_not_try';
  verdict?: string;
  enthusiasm?: string;
  score?: -5 | -3 | -1 | 0 | 1 | 2 | 3 | 4 | 5;
  occasion_details?: string;
  reason?: string;
  serves?: number;
  makes_quantity?: number;
  makes_thing?: string;
  time_entries?: Array<{ type: string; minutes: number }>;
  nutrition_overrides?: JsonNutrition;
  meal_types?: string[];
  cuisines?: string[];
  equipment?: string[];
  tags?: string[];
  publication_page?: string;
  recipe_url?: string;
  ingredient_sets?: string[];
  ingredients?: JsonIngredient[];
  prep_ahead?: string;
  instructions?: string[];
  notes?: string;
  references?: JsonReference[];
};
export type RecipeJsonDocument = {
  format: 'recipe-box-recipe-json';
  schema_version: 1;
  recipes: RecipeJsonRecipe[];
};

function emptyRecords(): PortableData['records'] {
  return Object.fromEntries(
    exportTableNames.map((table) => [table, [] as ExportRecord[]]),
  ) as PortableData['records'];
}

function createIdFactory(seed?: string): () => string {
  if (!seed) return randomUUID;
  let sequence = 0;
  return () => {
    const bytes = createHash('sha256').update(`${seed}:${sequence}`).digest().subarray(0, 16);
    sequence += 1;
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

function rows(snapshot: ExportSnapshot, table: ExportTableName): ExportRecord[] {
  return snapshot.records[table] ?? [];
}

function recordText(record: ExportRecord, key: string): string {
  return typeof record[key] === 'string' ? String(record[key]) : '';
}

function recipeIssue(path: string, message: string): never {
  throw new RecipeJsonValidationError(`${path}: ${message}`, [{ path, message }]);
}

function validateBasis(
  basis: JsonIngredient['nutrition_serving_size'],
  path: string,
): NutritionBasis | null {
  if (!basis) return null;
  const normalized = {
    amount: basis.amount,
    dimension: basis.dimension,
    unitCode: basis.unit,
  };
  if (!isNutritionBasis(normalized)) {
    recipeIssue(path, 'Use a supported positive Volume or Weight amount and unit.');
  }
  return normalized;
}

function getCatalogMatch(
  existing: ExportRecord[],
  field: string,
  label: string,
  path: string,
  category?: string,
): ExportRecord | undefined {
  const normalized = normalizeImportName(label);
  const matches = existing.filter(
    (record) =>
      (!category || record.category === category) &&
      normalizeImportName(recordText(record, field)) === normalized,
  );
  if (matches.length > 1) {
    recipeIssue(
      path,
      'This label matches more than one catalog value; resolve the catalog ambiguity first.',
    );
  }
  return matches[0];
}

function profileBasis(snapshot: ExportSnapshot, ingredientId: string): NutritionBasis | null {
  const profile = rows(snapshot, 'ingredient_nutrition_profiles').find(
    (record) => record.ingredient_id === ingredientId,
  );
  if (!profile) return null;
  const basis = {
    amount: Number(profile.serving_size_amount),
    dimension: String(profile.serving_size_dimension),
    unitCode: String(profile.serving_size_unit_code),
  };
  return isNutritionBasis(basis) ? basis : null;
}

function nutritionOverrides(
  values: JsonNutrition | undefined,
  basis: NutritionBasis | null,
  path: string,
): NutritionFieldOverrides {
  const result: NutritionFieldOverrides = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (!basis) {
      recipeIssue(path, 'A serving-size basis is required for ingredient nutrition values.');
    }
    if (!NUTRIENT_DEFINITIONS.some((nutrient) => nutrient.key === key)) {
      recipeIssue(path, 'The nutrient is not supported.');
    }
    result[key as NutrientKey] = {
      value: Number(value),
      basisSignature: getNutritionBasisSignature(basis),
      acknowledgedBasisSignature: null,
    };
  }
  return result;
}

function picklistRecord(
  category: RecipePicklistValue['category'],
  label: string,
  path: string,
  snapshot: ExportSnapshot,
  records: PortableData['records'],
  idsByKey: Map<string, string>,
  createdAt: string,
  createId: () => string,
): string {
  const trimmed = label.trim();
  if (!trimmed) recipeIssue(path, 'Enter a non-blank catalog label.');
  const key = `${category}:${normalizeImportName(trimmed)}`;
  const cached = idsByKey.get(key);
  if (cached) return cached;

  const existing = getCatalogMatch(
    rows(snapshot, 'recipe_picklist_values'),
    'display_value',
    trimmed,
    path,
    category,
  );
  const sourceId = createId();
  const categoryRows = rows(snapshot, 'recipe_picklist_values').filter(
    (record) => record.category === category,
  );
  const nextOrder =
    [
      ...categoryRows,
      ...records.recipe_picklist_values.filter((record) => record.category === category),
    ].reduce((max, record) => Math.max(max, Number(record.sort_order) || 0), -1) + 1;
  records.recipe_picklist_values.push({
    id: sourceId,
    category,
    value: existing ? recordText(existing, 'value') : trimmed,
    display_value: existing ? recordText(existing, 'display_value') : trimmed,
    sort_order: existing ? Number(existing.sort_order) : nextOrder,
    is_protected: existing?.is_protected === true,
    created_at: existing ? recordText(existing, 'created_at') : createdAt,
  });
  idsByKey.set(key, sourceId);
  return sourceId;
}

function ingredientRecord(
  label: string,
  path: string,
  snapshot: ExportSnapshot,
  records: PortableData['records'],
  idsByName: Map<string, { id: string; existingId: string | null }>,
  createdAt: string,
  createId: () => string,
) {
  const trimmed = label.trim();
  if (!trimmed) recipeIssue(path, 'Enter a non-blank ingredient name.');
  const key = normalizeImportName(trimmed);
  const cached = idsByName.get(key);
  if (cached) return cached;
  const existing = getCatalogMatch(rows(snapshot, 'ingredients'), 'name', trimmed, path);
  const sourceId = createId();
  const ingredientRows = rows(snapshot, 'ingredients');
  records.ingredients.push({
    id: sourceId,
    name: existing ? recordText(existing, 'name') : trimmed,
    created_at: existing ? recordText(existing, 'created_at') : createdAt,
    sort_order: existing
      ? Number(existing.sort_order)
      : [...ingredientRows, ...records.ingredients].reduce(
          (max, record) => Math.max(max, Number(record.sort_order) || 0),
          -1,
        ) + 1,
  });
  const result = { id: sourceId, existingId: existing ? String(existing.id) : null };
  idsByName.set(key, result);
  return result;
}

function tagRecord(
  label: string,
  path: string,
  snapshot: ExportSnapshot,
  records: PortableData['records'],
  idsByName: Map<string, string>,
  createdAt: string,
  createId: () => string,
): string {
  const trimmed = label.trim();
  if (!trimmed) recipeIssue(path, 'Enter a non-blank tag name.');
  const key = normalizeImportName(trimmed);
  const cached = idsByName.get(key);
  if (cached) return cached;
  const existing = getCatalogMatch(rows(snapshot, 'tags'), 'name', trimmed, path);
  const sourceId = createId();
  const tagRows = rows(snapshot, 'tags');
  records.tags.push({
    id: sourceId,
    name: existing ? recordText(existing, 'name') : trimmed,
    created_at: existing ? recordText(existing, 'created_at') : createdAt,
    sort_order: existing
      ? Number(existing.sort_order)
      : [...tagRows, ...records.tags].reduce(
          (max, record) => Math.max(max, Number(record.sort_order) || 0),
          -1,
        ) + 1,
    color_key: existing?.color_key ?? null,
  });
  idsByName.set(key, sourceId);
  return sourceId;
}

function convertMeasurement(
  measurement: JsonMeasurement,
  path: string,
  snapshot: ExportSnapshot,
  records: PortableData['records'],
  picklistIds: Map<string, string>,
  createdAt: string,
  createId: () => string,
): IngredientRowDraft['measurements'][number] {
  const amount = measurement.amount;
  let picklistValueId = '';
  if (measurement.type === 'informal' && measurement.value) {
    picklistValueId = picklistRecord(
      'informal_unit',
      measurement.value,
      `${path}.value`,
      snapshot,
      records,
      picklistIds,
      createdAt,
      createId,
    );
  } else if (measurement.type === 'unmeasured' && measurement.value) {
    picklistValueId = picklistRecord(
      'unmeasured_phrase',
      measurement.value,
      `${path}.value`,
      snapshot,
      records,
      picklistIds,
      createdAt,
      createId,
    );
  }

  return {
    id: createId(),
    type: measurement.type,
    quantity: measurement.amount_is_a ? 'a' : amount === undefined ? '' : String(amount),
    unitCode:
      measurement.type === 'volume' || measurement.type === 'weight'
        ? (measurement.unit ?? '')
        : '',
    picklistValueId,
  };
}

function ensureTextOnlyMarkdown(value: string, path: string): void {
  if (value.includes('[[photo:')) {
    recipeIssue(path, 'Photo markers are not supported in JSON imports.');
  }
  if (value.includes('[[ingredient:')) {
    recipeIssue(path, 'Use plain ingredient text instead of structured ingredient mentions.');
  }
}

export function createPortableRecipeJsonData(
  input: RecipeJsonDocument,
  snapshot: ExportSnapshot,
  now = new Date(),
  stableSourceKey?: string,
): PortableData {
  const records = emptyRecords();
  const createdAt = now.toISOString();
  const createId = createIdFactory(stableSourceKey);
  const picklistIds = new Map<string, string>();
  const ingredientIds = new Map<string, { id: string; existingId: string | null }>();
  const tagIds = new Map<string, string>();
  const recipeIds = input.recipes.map(() => createId());

  for (const [recipeIndex, recipe] of input.recipes.entries()) {
    const recipeId = recipeIds[recipeIndex];
    if (!recipeId) recipeIssue(`$.recipes[${recipeIndex}]`, 'Unable to assign an import ID.');
    const base = `$.recipes[${recipeIndex}]`;
    const state = recipe.state ?? 'want_to_try';
    const serves = recipe.serves ?? null;
    const recipeNutrition = recipe.nutrition_overrides ?? {};
    if (Object.keys(recipeNutrition).length > 0 && !serves) {
      recipeIssue(`${base}.serves`, 'Set serves before importing recipe nutrition values.');
    }

    const ingredientSetLabels = recipe.ingredient_sets ?? ['Main'];
    const setIds = new Map<string, string>();
    for (const [position, label] of ingredientSetLabels.entries()) {
      const trimmed = label.trim();
      const key = normalizeImportName(trimmed);
      setIds.set(key, createId());
      records.recipe_ingredient_sets.push({
        id: setIds.get(key),
        recipe_id: recipeId,
        label: trimmed,
        position,
      });
    }

    const ingredientDrafts: IngredientRowDraft[] = (recipe.ingredients ?? []).map(
      (ingredient, ingredientIndex) => {
        const path = `${base}.ingredients[${ingredientIndex}]`;
        const sectionLabel = ingredient.ingredient_set ?? ingredientSetLabels[0] ?? 'Main';
        const setId = setIds.get(normalizeImportName(sectionLabel));
        if (!setId) recipeIssue(`${path}.ingredient_set`, 'Choose a valid ingredient section.');

        const catalogIngredient = ingredientRecord(
          ingredient.name,
          `${path}.name`,
          snapshot,
          records,
          ingredientIds,
          createdAt,
          createId,
        );
        const explicitBasis = validateBasis(
          ingredient.nutrition_serving_size,
          `${path}.nutrition_serving_size`,
        );
        const profile = catalogIngredient.existingId
          ? profileBasis(snapshot, catalogIngredient.existingId)
          : null;
        const basis = explicitBasis ?? profile;
        const ingredientOverrides = nutritionOverrides(
          ingredient.nutrition_overrides,
          basis,
          `${path}.nutrition_overrides`,
        );

        return {
          id: createId(),
          ingredientSetId: setId,
          ingredientId: catalogIngredient.id,
          ingredientName: ingredient.name.trim(),
          isMain: ingredient.is_main ?? false,
          detail: ingredient.detail ?? '',
          alternateNote: ingredient.alternate_note ?? '',
          preparation: ingredient.preparation ?? '',
          measurements: (ingredient.measurements ?? []).map((measurement, measurementIndex) =>
            convertMeasurement(
              measurement,
              `${path}.measurements[${measurementIndex}]`,
              snapshot,
              records,
              picklistIds,
              createdAt,
              createId,
            ),
          ),
          portionOneRatio: ingredient.portion_one_ratio ?? null,
          sizeValue:
            ingredient.size_value === undefined || ingredient.size_value === null
              ? ''
              : String(ingredient.size_value),
          sizeUnit: ingredient.size_unit ?? '',
          nutritionServingSizeOverride: explicitBasis,
          nutritionOverrides: ingredientOverrides,
        };
      },
    );

    let ingredientPayload: IngredientRowPayload[];
    try {
      ingredientPayload = serializeIngredientRows(ingredientDrafts);
    } catch (error) {
      recipeIssue(
        `${base}.ingredients`,
        error instanceof Error ? error.message : 'Check the ingredient measurements and details.',
      );
    }
    for (const [position, ingredient] of ingredientPayload.entries()) {
      records.recipe_ingredients.push({
        id: ingredient.recipe_ingredient_id,
        recipe_id: recipeId,
        ingredient_id: ingredient.ingredient_id,
        ingredient_set_id: ingredient.ingredient_set_id,
        position,
        is_main: ingredient.is_main,
        detail: ingredient.detail,
        alternate_note: ingredient.alternate_note,
        preparation: ingredient.preparation,
        portion_one_ratio: ingredient.portion_one_ratio,
        size_value: ingredient.size_value,
        size_unit: ingredient.size_unit,
        nutrition_serving_size_override: ingredient.nutrition_serving_size_override,
        nutrition_overrides: ingredient.nutrition_overrides,
      });
      for (const [measurementPosition, measurement] of ingredient.measurements.entries()) {
        records.recipe_ingredient_measurements.push({
          id: createId(),
          recipe_ingredient_id: ingredient.recipe_ingredient_id,
          position: measurementPosition,
          measurement_type: measurement.measurement_type,
          amount_min: measurement.amount_min,
          amount_max: measurement.amount_max,
          unit_code: measurement.unit_code,
          picklist_value_id: measurement.picklist_value_id ? measurement.picklist_value_id : null,
          amount_is_a: measurement.amount_is_a,
        });
      }
    }

    const foodTypeId = recipe.food_type
      ? picklistRecord(
          'food_type',
          recipe.food_type,
          `${base}.food_type`,
          snapshot,
          records,
          picklistIds,
          createdAt,
          createId,
        )
      : null;
    const verdictId =
      recipe.verdict && state === 'tried'
        ? picklistRecord(
            'verdict',
            recipe.verdict,
            `${base}.verdict`,
            snapshot,
            records,
            picklistIds,
            createdAt,
            createId,
          )
        : null;
    const enthusiasmId =
      recipe.enthusiasm && state === 'want_to_try'
        ? picklistRecord(
            'enthusiasm',
            recipe.enthusiasm,
            `${base}.enthusiasm`,
            snapshot,
            records,
            picklistIds,
            createdAt,
            createId,
          )
        : null;

    const addAssignments = (
      values: string[] | undefined,
      category: 'meal_type' | 'cuisine' | 'equipment',
      field: 'meal_types' | 'cuisines' | 'equipment',
    ) => {
      for (const [position, value] of (values ?? []).entries()) {
        const picklistValueId = picklistRecord(
          category,
          value,
          `${base}.${field}[${position}]`,
          snapshot,
          records,
          picklistIds,
          createdAt,
          createId,
        );
        records.recipe_picklist_assignments.push({
          recipe_id: recipeId,
          category,
          picklist_value_id: picklistValueId,
        });
      }
    };
    addAssignments(recipe.meal_types, 'meal_type', 'meal_types');
    addAssignments(recipe.cuisines, 'cuisine', 'cuisines');
    addAssignments(recipe.equipment, 'equipment', 'equipment');

    for (const [position, label] of (recipe.tags ?? []).entries()) {
      const tagId = tagRecord(
        label,
        `${base}.tags[${position}]`,
        snapshot,
        records,
        tagIds,
        createdAt,
        createId,
      );
      records.recipe_tags.push({ recipe_id: recipeId, tag_id: tagId });
    }

    const timeEntries = recipe.time_entries ?? [];
    for (const [position, entry] of timeEntries.entries()) {
      const timeTypeId = picklistRecord(
        'time_type',
        entry.type,
        `${base}.time_entries[${position}].type`,
        snapshot,
        records,
        picklistIds,
        createdAt,
        createId,
      );
      records.recipe_time_entries.push({
        id: createId(),
        recipe_id: recipeId,
        time_type_id: timeTypeId,
        minutes: entry.minutes,
        position,
      });
    }

    const totalTime = timeEntries.reduce((total, entry) => total + entry.minutes, 0);
    records.recipes.push({
      id: recipeId,
      name: recipe.name.trim(),
      food_type_id: foodTypeId,
      state,
      score: state === 'tried' ? (recipe.score ?? null) : null,
      is_starred: false,
      is_hearted: false,
      made_count: state === 'tried' ? 1 : 0,
      last_made_at: null,
      verdict_id: verdictId,
      enthusiasm_id: enthusiasmId,
      occasion_details: recipe.occasion_details?.trim() || null,
      reason: recipe.reason?.trim() || null,
      serves,
      makes_quantity: recipe.makes_quantity ?? null,
      makes_thing: recipe.makes_thing?.trim() || null,
      saved_from_public_id: null,
      total_time_minutes: timeEntries.length ? totalTime : null,
      prep_ahead_markdown: recipe.prep_ahead ?? '',
      notes_markdown: recipe.notes ?? '',
      is_private: true,
      version: 1,
      created_at: createdAt,
      updated_at: createdAt,
      trashed_at: null,
      publication_id: null,
      publication_page: recipe.publication_page?.trim() || null,
      recipe_url: recipe.recipe_url ? normalizeHttpUrl(recipe.recipe_url) : null,
      nutrition_overrides: Object.fromEntries(
        Object.entries(recipeNutrition).map(([key, value]) => [
          key,
          Number(value) * Number(serves),
        ]),
      ),
    });

    for (const [position, markdown] of (recipe.instructions ?? []).entries()) {
      ensureTextOnlyMarkdown(markdown, `${base}.instructions[${position}]`);
      records.recipe_steps.push({
        id: createId(),
        recipe_id: recipeId,
        position,
        content_markdown: markdown,
        plain_text: instructionPlainText(markdown),
      });
    }
    if (recipe.prep_ahead) ensureTextOnlyMarkdown(recipe.prep_ahead, `${base}.prep_ahead`);
    if (recipe.notes) ensureTextOnlyMarkdown(recipe.notes, `${base}.notes`);

    for (const [position, reference] of (recipe.references ?? []).entries()) {
      const url = reference.type === 'external_url' ? normalizeHttpUrl(reference.url) : null;
      if (reference.type === 'external_url' && !url) {
        recipeIssue(`${base}.references[${position}].url`, 'Enter a valid HTTP(S) URL.');
      }
      records.recipe_references.push({
        id: createId(),
        recipe_id: recipeId,
        reference_type: reference.type,
        publication_id: null,
        display_text: reference.display_text.trim(),
        url,
        position,
        linked_recipe_id: null,
        is_protected_source: false,
        source_public_id: null,
      });
    }
  }

  const firstRecipeId = recipeIds[0];
  if (!firstRecipeId) recipeIssue('$.recipes', 'Add at least one recipe.');
  return {
    format: 'recipe-box-data',
    schema_version: EXPORT_SCHEMA_VERSION,
    scope: { type: 'recipe', id: firstRecipeId },
    account_preferences: {},
    records,
  };
}
