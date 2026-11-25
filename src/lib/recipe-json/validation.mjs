import Ajv2020 from 'ajv/dist/2020.js';
import { parse, printParseErrorCode } from 'jsonc-parser';
import { normalizeImportName } from '../imports/normalize-import-name.mjs';

export const RECIPE_JSON_DATA_BYTES_LIMIT = 64 * 1024 * 1024;
const validatorCache = new WeakMap();

export class RecipeJsonValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'RecipeJsonValidationError';
    this.issues = issues;
  }
}

function jsonPath(instancePath, additionalProperty) {
  const parts = instancePath
    ? instancePath
        .split('/')
        .slice(1)
        .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    : [];
  if (additionalProperty) parts.push(additionalProperty);
  return parts.reduce(
    (path, part) => (/^\d+$/.test(part) ? `${path}[${part}]` : `${path}.${part}`),
    '$',
  );
}

function getValidator(schema) {
  let validate = validatorCache.get(schema);
  if (!validate) {
    validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    validatorCache.set(schema, validate);
  }
  return validate;
}

function findFillers(value, path = '$', results = []) {
  if (typeof value === 'string') {
    if (value === '<FILLER>') results.push(path);
    return results;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findFillers(item, `${path}[${index}]`, results);
    });
    return results;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      findFillers(item, `${path}.${key}`, results);
    }
  }
  return results;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function collectSemanticIssues(value) {
  const issues = [];
  const recipes = Array.isArray(value?.recipes) ? value.recipes : [];
  const names = new Map();
  const nonBlank = (fieldValue, path, label) => {
    if (typeof fieldValue === 'string' && !fieldValue.trim()) {
      issues.push({ path, message: `${label} cannot be blank.` });
    }
  };
  const uniqueLabels = (values, path, label) => {
    const seen = new Map();
    for (const [index, item] of values.entries()) {
      nonBlank(item, `${path}[${index}]`, label);
      if (typeof item !== 'string' || !item.trim()) continue;
      const normalized = normalizeImportName(item);
      if (seen.has(normalized)) {
        issues.push({
          path: `${path}[${index}]`,
          message: `This ${label.toLocaleLowerCase('en-US')} duplicates ${path}[${seen.get(normalized)}].`,
        });
      } else {
        seen.set(normalized, index);
      }
    }
  };
  for (const [index, recipe] of recipes.entries()) {
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) continue;
    const base = `$.recipes[${index}]`;
    const name = typeof recipe.name === 'string' ? recipe.name.trim() : '';
    if (!name) {
      issues.push({ path: `${base}.name`, message: 'Enter a non-blank recipe name.' });
    } else {
      const normalized = normalizeImportName(name);
      const firstIndex = names.get(normalized);
      if (firstIndex !== undefined) {
        issues.push({
          path: `${base}.name`,
          message: `This name duplicates recipes[${firstIndex}].name after name normalization.`,
        });
      } else {
        names.set(normalized, index);
      }
    }

    const state = recipe.state ?? 'want_to_try';
    nonBlank(recipe.food_type, `${base}.food_type`, 'Food Type');
    nonBlank(recipe.verdict, `${base}.verdict`, 'Verdict');
    nonBlank(recipe.enthusiasm, `${base}.enthusiasm`, 'Enthusiasm');
    nonBlank(recipe.makes_thing, `${base}.makes_thing`, 'Makes thing');
    if (recipe.verdict !== undefined && state !== 'tried') {
      issues.push({
        path: `${base}.verdict`,
        message: 'Verdict is only valid when state is tried.',
      });
    }
    if (recipe.score !== undefined && state !== 'tried') {
      issues.push({ path: `${base}.score`, message: 'Rating is only valid when state is tried.' });
    }
    if (recipe.enthusiasm !== undefined && state !== 'want_to_try') {
      issues.push({
        path: `${base}.enthusiasm`,
        message: 'Enthusiasm is only valid when state is want_to_try.',
      });
    }
    if (recipe.reason !== undefined && state !== 'will_not_try') {
      issues.push({
        path: `${base}.reason`,
        message: 'Reason is only valid when state is will_not_try.',
      });
    }
    if (
      recipe.occasion_details !== undefined &&
      ![recipe.verdict, recipe.enthusiasm].some(
        (label) =>
          typeof label === 'string' &&
          normalizeImportName(label).replaceAll(' ', '_') === 'specific_occasion',
      )
    ) {
      issues.push({
        path: `${base}.occasion_details`,
        message: 'Occasion details require the Specific Occasion Verdict or Enthusiasm value.',
      });
    }

    if ((recipe.makes_quantity === undefined) !== (recipe.makes_thing === undefined)) {
      issues.push({
        path: `${base}.makes_quantity`,
        message: 'Provide both makes_quantity and makes_thing, or omit both.',
      });
    }
    if (
      recipe.nutrition_overrides &&
      Object.keys(recipe.nutrition_overrides).length > 0 &&
      !recipe.serves
    ) {
      issues.push({
        path: `${base}.serves`,
        message: 'Set serves before adding recipe nutrition values.',
      });
    }

    for (const field of ['meal_types', 'cuisines', 'equipment', 'tags']) {
      if (Array.isArray(recipe[field])) {
        uniqueLabels(recipe[field], `${base}.${field}`, field.replaceAll('_', ' '));
      }
    }

    const minutes = (recipe.time_entries ?? []).reduce(
      (total, entry) => total + (Number.isSafeInteger(entry?.minutes) ? entry.minutes : 0),
      0,
    );
    if (minutes > 2_147_483_647) {
      issues.push({
        path: `${base}.time_entries`,
        message: 'The total duration exceeds the supported whole-minute limit.',
      });
    }

    const sets = Array.isArray(recipe.ingredient_sets) ? recipe.ingredient_sets : ['Main'];
    const setNames = new Map();
    for (const [setIndex, setLabel] of sets.entries()) {
      if (typeof setLabel !== 'string' || !setLabel.trim()) {
        issues.push({
          path: `${base}.ingredient_sets[${setIndex}]`,
          message: 'Ingredient section labels cannot be blank.',
        });
        continue;
      }
      const normalized = normalizeImportName(setLabel);
      if (setNames.has(normalized)) {
        issues.push({
          path: `${base}.ingredient_sets[${setIndex}]`,
          message: `This section duplicates ingredient_sets[${setNames.get(normalized)}].`,
        });
      } else {
        setNames.set(normalized, setIndex);
      }
    }
    uniqueLabels(
      (recipe.time_entries ?? []).map((entry) => entry.type),
      `${base}.time_entries`,
      'Time Type',
    );

    for (const [ingredientIndex, ingredient] of (recipe.ingredients ?? []).entries()) {
      const ingredientPath = `${base}.ingredients[${ingredientIndex}]`;
      if (sets.length === 0) continue;
      const section = ingredient.ingredient_set ?? sets[0];
      nonBlank(ingredient.name, `${ingredientPath}.name`, 'Ingredient name');
      if (!sets.some((item) => normalizeImportName(item) === normalizeImportName(section))) {
        issues.push({
          path: `${ingredientPath}.ingredient_set`,
          message: 'Choose a label present in ingredient_sets.',
        });
      }
      for (const [measurementIndex, measurement] of (ingredient.measurements ?? []).entries()) {
        if (typeof measurement.value === 'string') {
          nonBlank(
            measurement.value,
            `${ingredientPath}.measurements[${measurementIndex}].value`,
            'Measurement value',
          );
        }
      }
    }

    if (typeof recipe.recipe_url === 'string' && !isHttpUrl(recipe.recipe_url)) {
      issues.push({ path: `${base}.recipe_url`, message: 'Enter a valid HTTP(S) URL.' });
    }
    for (const [referenceIndex, reference] of (recipe.references ?? []).entries()) {
      nonBlank(
        reference.display_text,
        `${base}.references[${referenceIndex}].display_text`,
        'Reference display text',
      );
      if (reference.type === 'external_url' && !isHttpUrl(reference.url)) {
        issues.push({
          path: `${base}.references[${referenceIndex}].url`,
          message: 'Enter a valid HTTP(S) URL.',
        });
      }
    }
  }
  return issues;
}

export function validateRecipeJsonValue(value, schema) {
  const fillers = findFillers(value);
  if (fillers.length > 0) {
    throw new RecipeJsonValidationError(
      `Replace every <FILLER> value before importing: ${fillers.join(', ')}.`,
      fillers.map((path) => ({ path, message: 'Replace this <FILLER> value.' })),
    );
  }

  const validate = getValidator(schema);
  if (!validate(value)) {
    const issues = (validate.errors ?? []).map((error) => ({
      path: jsonPath(error.instancePath, error.params?.additionalProperty),
      message: error.message ?? 'Value does not match the recipe JSON schema.',
    }));
    throw new RecipeJsonValidationError(
      issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'),
      issues,
    );
  }

  const semanticIssues = collectSemanticIssues(value);
  if (semanticIssues.length > 0) {
    throw new RecipeJsonValidationError(
      semanticIssues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'),
      semanticIssues,
    );
  }
  return value;
}

export function parseRecipeJsonBytes(bytes, fileName, schema) {
  if (
    !ArrayBuffer.isView(bytes) ||
    bytes.BYTES_PER_ELEMENT !== 1 ||
    bytes.byteLength > RECIPE_JSON_DATA_BYTES_LIMIT
  ) {
    throw new RecipeJsonValidationError('The JSON file exceeds the 64 MiB size limit.');
  }
  const extension = fileName.toLocaleLowerCase('en-US').split('.').at(-1);
  if (extension !== 'json' && extension !== 'jsonc') {
    throw new RecipeJsonValidationError('Choose a .json or .jsonc file.');
  }

  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new RecipeJsonValidationError('The file must contain valid UTF-8 text.');
  }

  const parseErrors = [];
  const value = parse(source, parseErrors, {
    allowTrailingComma: false,
    disallowComments: extension === 'json',
    allowEmptyContent: false,
  });
  if (parseErrors.length > 0) {
    const first = parseErrors[0];
    throw new RecipeJsonValidationError(
      `Invalid ${extension.toUpperCase()} at offset ${first.offset}: ${printParseErrorCode(first.error)}.`,
    );
  }
  return validateRecipeJsonValue(value, schema);
}
