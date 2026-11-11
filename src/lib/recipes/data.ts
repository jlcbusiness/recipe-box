import type { createClient } from '../supabase/server';
import type { IngredientDensity } from './density-rules';
import type { MeasurementType } from './measurement-rules';
import type {
  NutrientValues,
  NutritionBasis,
  NutritionEquivalent,
  NutritionFieldOverrides,
  NutritionProfile,
} from './nutrition-rules';
import { STANDARD_NUTRIENT_KEYS } from './nutrition-rules';
import type { RecipeScore } from './recipe-rules';
import type { TagColorKey } from './tag-colors';

export type RecipeState = 'want_to_try' | 'tried' | 'will_not_try';

export type PublicationType = 'book' | 'magazine' | 'site' | 'collection';

export type PublicationOption = {
  id: string;
  name: string;
  publication_type: PublicationType;
  author: string | null;
  edition: string | null;
  isbn: string | null;
  retailer_url: string | null;
  site_url: string | null;
};

export type PicklistCategory =
  | 'food_type'
  | 'meal_type'
  | 'cuisine'
  | 'equipment'
  | 'verdict'
  | 'enthusiasm'
  | 'informal_unit'
  | 'unmeasured_phrase'
  | 'time_type';

export type RecipePicklistValue = {
  id: string;
  account_id: string;
  category: PicklistCategory;
  value: string;
  display_value: string;
  sort_order: number;
  is_protected: boolean;
};

export type IngredientOption = {
  id: string;
  name: string;
  density?: IngredientDensity | null;
  nutritionProfile?: NutritionProfile | null;
  nutritionEquivalent?: NutritionEquivalent | null;
};

export type TagOption = {
  id: string;
  name: string;
  color_key: TagColorKey;
};

const tagNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortTagOptions(tags: TagOption[]): TagOption[] {
  return [...tags].sort(
    (left, right) =>
      tagNameCollator.compare(left.name, right.name) || left.id.localeCompare(right.id),
  );
}

export type RecipeIngredient = {
  id: string;
  ingredient_id: string;
  ingredient_set_id: string;
  ingredient_name: string;
  position: number;
  is_main: boolean;
  detail: string;
  preparation: string;
  portion_one_ratio: number | null;
  size_value: number | null;
  size_unit: 'in' | 'cm' | null;
  nutrition_serving_size_override?: NutritionBasis | null;
  nutrition_overrides?: NutritionFieldOverrides;
  nutrition_profile?: NutritionProfile | null;
  nutrition_equivalent?: NutritionEquivalent | null;
  density?: IngredientDensity | null;
  measurements: RecipeMeasurement[];
};

export type RecipeIngredientSet = {
  id: string;
  label: string;
  position: number;
};

export type RecipeMeasurement = {
  id: string;
  position: number;
  measurement_type: MeasurementType;
  amount_min: number | null;
  amount_max: number | null;
  unit_code: string | null;
  picklist_value_id: string | null;
  picklist_value: string | null;
};

export type RecipeInstructionStep = {
  id: string;
  position: number;
  content_markdown: string;
  plain_text: string;
};

export type RecipePairing = {
  id: string;
  display_text: string;
  linked_recipe_id: string | null;
  linked_recipe_is_active: boolean;
  position: number;
};

export type IncomingRecipePairing = {
  source_recipe_id: string;
  source_recipe_name: string;
  source_recipe_is_active: boolean;
};

export type RecipeReference = {
  id: string;
  reference_type: 'recipe' | 'publication' | 'external_url' | 'printed_citation';
  display_text: string;
  linked_recipe_id: string | null;
  linked_recipe_is_active: boolean;
  publication_id: string | null;
  url: string | null;
  position: number;
  is_protected_source: boolean;
  source_public_id: string | null;
};

type RecipeMeasurementRecord = Omit<RecipeMeasurement, 'picklist_value'> & {
  recipe_ingredient_id: string;
};

export type RecipeRecord = {
  id: string;
  public_id: string;
  is_private: boolean;
  name: string;
  publication_id: string;
  publication_page: string | null;
  recipe_url: string | null;
  publication: PublicationOption | null;
  food_type_id: string | null;
  state: RecipeState;
  verdict_id: string | null;
  enthusiasm_id: string | null;
  score: RecipeScore | null;
  is_starred: boolean;
  is_hearted: boolean;
  occasion_details: string | null;
  reason: string | null;
  serves: number | null;
  makes_quantity: number | null;
  makes_thing: string | null;
  time_entries: RecipeTimeEntry[];
  total_time_minutes: number;
  notes_markdown: string;
  nutrition_overrides: NutrientValues;
  version: number;
  created_at: string;
  updated_at: string;
  meal_type_ids: string[];
  cuisine_ids: string[];
  equipment_ids: string[];
  tags: TagOption[];
  ingredient_sets: RecipeIngredientSet[];
  ingredients: RecipeIngredient[];
  steps: RecipeInstructionStep[];
  pairings: RecipePairing[];
  incoming_pairings: IncomingRecipePairing[];
  references: RecipeReference[];
};

export type RecipeTimeEntry = {
  id: string;
  time_type_id: string;
  time_type: string;
  minutes: number;
  position: number;
};

export type TrashedRecipeRecord = {
  id: string;
  name: string;
  version: number;
  trashed_at: string;
};

export type TrashedPublicationRecord = {
  id: string;
  name: string;
  publication_type: PublicationType;
  version: number;
  trashed_at: string;
};

export type RecipeSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type IngredientNutritionSettings = {
  profile: NutritionProfile | null;
  equivalent: NutritionEquivalent | null;
  density: IngredientDensity | null;
};

async function getIngredientNutritionSettings(
  supabase: RecipeSupabaseClient,
  ingredientIds?: string[],
): Promise<Map<string, IngredientNutritionSettings>> {
  if (ingredientIds?.length === 0) return new Map();
  let profilesQuery = supabase
    .from('ingredient_nutrition_profiles')
    .select(
      'ingredient_id, serving_size_amount, serving_size_dimension, serving_size_unit_code, nutrients',
    );
  let equivalentsQuery = supabase
    .from('ingredient_measure_equivalents')
    .select(
      'ingredient_id, measurement_type, picklist_value_id, picklist_value, volume_amount, volume_unit_code, weight_amount, weight_unit_code',
    );
  let densitiesQuery = supabase
    .from('ingredient_densities')
    .select('ingredient_id, volume_amount, volume_unit_code, weight_amount, weight_unit_code');
  if (ingredientIds) {
    profilesQuery = profilesQuery.in('ingredient_id', ingredientIds);
    equivalentsQuery = equivalentsQuery.in('ingredient_id', ingredientIds);
    densitiesQuery = densitiesQuery.in('ingredient_id', ingredientIds);
  }
  const [profilesResult, equivalentsResult, densitiesResult] = await Promise.all([
    profilesQuery,
    equivalentsQuery,
    densitiesQuery,
  ]);
  if (profilesResult.error || equivalentsResult.error || densitiesResult.error) {
    throw new Error('Unable to load ingredient nutrition settings.');
  }

  const settings = new Map<string, IngredientNutritionSettings>();
  for (const id of ingredientIds ?? []) {
    settings.set(id, { profile: null, equivalent: null, density: null });
  }
  for (const profile of profilesResult.data ?? []) {
    settings.set(profile.ingredient_id, {
      ...(settings.get(profile.ingredient_id) ?? {
        profile: null,
        equivalent: null,
        density: null,
      }),
      profile: {
        servingSize: {
          amount: Number(profile.serving_size_amount),
          dimension: profile.serving_size_dimension as NutritionBasis['dimension'],
          unitCode: profile.serving_size_unit_code,
        },
        nutrients: profile.nutrients as NutritionProfile['nutrients'],
      },
    });
  }
  for (const equivalent of equivalentsResult.data ?? []) {
    settings.set(equivalent.ingredient_id, {
      ...(settings.get(equivalent.ingredient_id) ?? {
        profile: null,
        equivalent: null,
        density: null,
      }),
      equivalent: {
        measurementType: equivalent.measurement_type as NutritionEquivalent['measurementType'],
        picklistValueId: equivalent.picklist_value_id,
        picklistValue: equivalent.picklist_value,
        volume:
          equivalent.volume_amount === null
            ? null
            : {
                amount: Number(equivalent.volume_amount),
                unitCode: equivalent.volume_unit_code,
              },
        weight:
          equivalent.weight_amount === null
            ? null
            : {
                amount: Number(equivalent.weight_amount),
                unitCode: equivalent.weight_unit_code,
              },
      },
    });
  }
  for (const density of densitiesResult.data ?? []) {
    settings.set(density.ingredient_id, {
      ...(settings.get(density.ingredient_id) ?? {
        profile: null,
        equivalent: null,
        density: null,
      }),
      density: {
        volumeAmount: Number(density.volume_amount),
        volumeUnitCode: density.volume_unit_code,
        weightAmount: Number(density.weight_amount),
        weightUnitCode: density.weight_unit_code,
      },
    });
  }
  return settings;
}

export async function getPublications(
  supabase: RecipeSupabaseClient,
): Promise<PublicationOption[]> {
  const { data, error } = await supabase
    .from('publications')
    .select('id, name, publication_type, author, edition, isbn, retailer_url, site_url')
    .is('trashed_at', null)
    .order('name');

  if (error) {
    throw new Error('Unable to load publications.');
  }

  return ((data ?? []) as PublicationOption[]).sort(
    (left, right) =>
      Number(right.publication_type === 'collection') -
        Number(left.publication_type === 'collection') || left.name.localeCompare(right.name),
  );
}

export async function getRecipePicklists(
  supabase: RecipeSupabaseClient,
): Promise<RecipePicklistValue[]> {
  const { data, error } = await supabase
    .from('recipe_picklist_values')
    .select('id, account_id, category, value, display_value, sort_order, is_protected')
    .order('category')
    .order('sort_order');

  if (error) {
    throw new Error('Unable to load recipe options.');
  }

  return data as RecipePicklistValue[];
}

export async function getIngredients(supabase: RecipeSupabaseClient): Promise<IngredientOption[]> {
  const [ingredientsResult, nutritionSettings] = await Promise.all([
    supabase.from('ingredients').select('id, name').order('name'),
    getIngredientNutritionSettings(supabase),
  ]);

  if (ingredientsResult.error) {
    throw new Error('Unable to load ingredients.');
  }

  return (ingredientsResult.data ?? []).map((ingredient) => {
    const settings = nutritionSettings.get(ingredient.id);
    return {
      ...ingredient,
      density: settings?.density ?? null,
      nutritionProfile: settings?.profile ?? null,
      nutritionEquivalent: settings?.equivalent ?? null,
    };
  });
}

export async function getTags(supabase: RecipeSupabaseClient): Promise<TagOption[]> {
  const { data, error } = await supabase.from('tags').select('id, name, color_key');

  if (error) {
    throw new Error('Unable to load tags.');
  }

  return sortTagOptions((data ?? []) as TagOption[]);
}

export async function getRecipeLinkOptions(
  supabase: RecipeSupabaseClient,
  excludeRecipeId?: string,
): Promise<IngredientOption[]> {
  let query = supabase.from('recipes').select('id, name').is('trashed_at', null).order('name');
  if (excludeRecipeId) {
    query = query.neq('id', excludeRecipeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error('Unable to load recipe suggestions.');
  }
  return data ?? [];
}

export async function getPreparationOptions(supabase: RecipeSupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from('recipe_ingredients')
    .select('preparation')
    .neq('preparation', '')
    .order('preparation');

  if (error) {
    throw new Error('Unable to load preparation options.');
  }

  return [...new Set((data ?? []).map((row) => row.preparation))];
}

export async function getRecipe(
  supabase: RecipeSupabaseClient,
  recipeId: string,
): Promise<RecipeRecord | null> {
  const { data, error } = await supabase
    .from('recipes')
    .select(
      'id, public_id, is_private, name, publication_id, publication_page, recipe_url, food_type_id, state, verdict_id, enthusiasm_id, score, is_starred, is_hearted, occasion_details, reason, serves, makes_quantity, makes_thing, total_time_minutes, notes_markdown, nutrition_overrides, version, created_at, updated_at',
    )
    .eq('id', recipeId)
    .is('trashed_at', null)
    .maybeSingle();

  if (error) {
    throw new Error('Unable to load this recipe.');
  }
  if (!data) {
    return null;
  }

  let publication: PublicationOption | null = null;
  if (data.publication_id) {
    const { data: publicationData, error: publicationError } = await supabase
      .from('publications')
      .select('id, name, publication_type, author, edition, isbn, retailer_url, site_url')
      .eq('id', data.publication_id)
      .maybeSingle();
    if (publicationError) {
      throw new Error('Unable to load this recipe.');
    }
    publication = (publicationData as PublicationOption | null) ?? null;
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from('recipe_picklist_assignments')
    .select('category, picklist_value_id')
    .eq('recipe_id', recipeId);

  const { data: tagAssignments, error: tagAssignmentError } = await supabase
    .from('recipe_tags')
    .select('tag_id')
    .eq('recipe_id', recipeId);

  if (assignmentError || tagAssignmentError) {
    throw new Error('Unable to load this recipe.');
  }

  const assignedTagIds = (tagAssignments ?? []).map((assignment) => assignment.tag_id);
  const { data: assignedTags, error: assignedTagsError } = assignedTagIds.length
    ? await supabase.from('tags').select('id, name, color_key').in('id', assignedTagIds)
    : { data: [], error: null };
  if (assignedTagsError) {
    throw new Error('Unable to load this recipe.');
  }

  const { data: recipeSteps, error: recipeStepsError } = await supabase
    .from('recipe_steps')
    .select('id, position, content_markdown, plain_text')
    .eq('recipe_id', recipeId)
    .order('position');

  if (recipeStepsError) {
    throw new Error('Unable to load this recipe.');
  }

  const { data: ingredientSets, error: ingredientSetsError } = await supabase
    .from('recipe_ingredient_sets')
    .select('id, label, position')
    .eq('recipe_id', recipeId)
    .order('position');

  if (ingredientSetsError) {
    throw new Error('Unable to load this recipe.');
  }

  const { data: recipeIngredients, error: recipeIngredientsError } = await supabase
    .from('recipe_ingredients')
    .select(
      'id, ingredient_id, ingredient_set_id, position, is_main, detail, preparation, portion_one_ratio, size_value, size_unit, nutrition_serving_size_override, nutrition_overrides',
    )
    .eq('recipe_id', recipeId)
    .order('position');

  if (recipeIngredientsError) {
    throw new Error('Unable to load this recipe.');
  }

  const [pairingsResult, incomingResult, referencesResult, timeEntriesResult] = await Promise.all([
    supabase
      .from('recipe_pairings')
      .select('id, display_text, linked_recipe_id, position')
      .eq('source_recipe_id', recipeId)
      .order('position'),
    supabase.from('recipe_pairings').select('source_recipe_id').eq('linked_recipe_id', recipeId),
    supabase
      .from('recipe_references')
      .select(
        'id, reference_type, display_text, linked_recipe_id, publication_id, url, position, is_protected_source, source_public_id',
      )
      .eq('recipe_id', recipeId)
      .order('position'),
    supabase
      .from('recipe_time_entries')
      .select('id, time_type_id, minutes, position')
      .eq('recipe_id', recipeId)
      .order('position'),
  ]);
  if (
    pairingsResult.error ||
    incomingResult.error ||
    referencesResult.error ||
    timeEntriesResult.error
  ) {
    throw new Error('Unable to load this recipe.');
  }
  const timeTypeIds = [
    ...new Set((timeEntriesResult.data ?? []).map((entry) => entry.time_type_id)),
  ];
  const { data: timeTypeValues, error: timeTypeError } = timeTypeIds.length
    ? await supabase
        .from('recipe_picklist_values')
        .select('id, display_value')
        .in('id', timeTypeIds)
    : { data: [], error: null };
  if (timeTypeError) {
    throw new Error('Unable to load this recipe.');
  }
  const timeTypeById = new Map(
    (timeTypeValues ?? []).map((option) => [option.id, option.display_value]),
  );
  const timeEntries = (timeEntriesResult.data ?? []).map((entry) => {
    const timeType = timeTypeById.get(entry.time_type_id);
    if (!timeType) {
      throw new Error('Unable to load this recipe.');
    }
    return { ...entry, time_type: timeType };
  });

  const pairings = pairingsResult.data ?? [];
  const incoming = incomingResult.data ?? [];
  const recipeTargetIds = [
    ...new Set([
      ...pairings.map((pairing) => pairing.linked_recipe_id).filter((id): id is string => !!id),
      ...(referencesResult.data ?? [])
        .map((reference) => reference.linked_recipe_id)
        .filter((id): id is string => !!id),
      ...incoming.map((pairing) => pairing.source_recipe_id),
    ]),
  ];
  const recipeTargetsResult = await Promise.all([
    recipeTargetIds.length
      ? supabase.from('recipes').select('id, name, trashed_at').in('id', recipeTargetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const [resolvedRecipeTargets] = recipeTargetsResult;
  if (resolvedRecipeTargets.error) {
    throw new Error('Unable to load this recipe.');
  }
  const recipeTargets = new Map(
    (resolvedRecipeTargets.data ?? []).map((target) => [target.id, target]),
  );

  const ingredientIds = [...new Set((recipeIngredients ?? []).map((row) => row.ingredient_id))];
  const recipeIngredientIds = (recipeIngredients ?? []).map((row) => row.id);
  let ingredientNames = new Map<string, string>();
  let nutritionSettings = new Map<string, IngredientNutritionSettings>();
  if (ingredientIds.length > 0) {
    const [canonicalResult, nutritionResult] = await Promise.all([
      supabase.from('ingredients').select('id, name').in('id', ingredientIds),
      getIngredientNutritionSettings(supabase, ingredientIds),
    ]);

    if (canonicalResult.error) {
      throw new Error('Unable to load this recipe.');
    }

    ingredientNames = new Map(
      (canonicalResult.data ?? []).map((ingredient) => [ingredient.id, ingredient.name]),
    );
    nutritionSettings = nutritionResult;
  }

  let recipeMeasurements: RecipeMeasurementRecord[] = [];
  if (recipeIngredientIds.length > 0) {
    const { data: measurementData, error: measurementError } = await supabase
      .from('recipe_ingredient_measurements')
      .select(
        'id, recipe_ingredient_id, position, measurement_type, amount_min, amount_max, unit_code, picklist_value_id',
      )
      .in('recipe_ingredient_id', recipeIngredientIds)
      .order('recipe_ingredient_id')
      .order('position');

    if (measurementError) {
      throw new Error('Unable to load this recipe.');
    }
    recipeMeasurements = measurementData ?? [];
  }

  const measurementPicklistIds = [
    ...new Set(
      recipeMeasurements
        .map((measurement) => measurement.picklist_value_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let measurementPicklistValues = new Map<string, string>();
  if (measurementPicklistIds.length > 0) {
    const { data: picklistData, error: picklistError } = await supabase
      .from('recipe_picklist_values')
      .select('id, display_value')
      .in('id', measurementPicklistIds);

    if (picklistError) {
      throw new Error('Unable to load this recipe.');
    }
    measurementPicklistValues = new Map(
      (picklistData ?? []).map((option) => [option.id, option.display_value]),
    );
  }

  const measurementsByIngredient = new Map<string, RecipeMeasurement[]>();
  for (const measurement of recipeMeasurements) {
    const rows = measurementsByIngredient.get(measurement.recipe_ingredient_id) ?? [];
    rows.push({
      ...measurement,
      picklist_value: measurement.picklist_value_id
        ? (measurementPicklistValues.get(measurement.picklist_value_id) ?? null)
        : null,
    });
    measurementsByIngredient.set(measurement.recipe_ingredient_id, rows);
  }

  const idsFor = (category: string) =>
    assignments
      .filter((assignment) => assignment.category === category)
      .map((assignment) => assignment.picklist_value_id);

  return {
    ...data,
    nutrition_overrides: (data.nutrition_overrides ?? {}) as NutrientValues,
    publication,
    meal_type_ids: idsFor('meal_type'),
    cuisine_ids: idsFor('cuisine'),
    equipment_ids: idsFor('equipment'),
    time_entries: timeEntries,
    tags: sortTagOptions((assignedTags ?? []) as TagOption[]),
    ingredient_sets: ingredientSets ?? [],
    ingredients: (recipeIngredients ?? []).map((row) => ({
      ...row,
      ingredient_name: ingredientNames.get(row.ingredient_id) ?? '',
      nutrition_serving_size_override: row.nutrition_serving_size_override as NutritionBasis | null,
      nutrition_overrides: (row.nutrition_overrides ?? {}) as NutritionFieldOverrides,
      nutrition_profile: nutritionSettings.get(row.ingredient_id)?.profile ?? null,
      nutrition_equivalent: nutritionSettings.get(row.ingredient_id)?.equivalent ?? null,
      density: nutritionSettings.get(row.ingredient_id)?.density ?? null,
      measurements: measurementsByIngredient.get(row.id) ?? [],
    })),
    steps: (recipeSteps ?? []) as RecipeInstructionStep[],
    pairings: pairings.map((pairing) => ({
      ...pairing,
      linked_recipe_is_active: pairing.linked_recipe_id
        ? recipeTargets.get(pairing.linked_recipe_id)?.trashed_at === null
        : false,
    })),
    incoming_pairings: incoming.map((pairing) => ({
      source_recipe_id: pairing.source_recipe_id,
      source_recipe_name: recipeTargets.get(pairing.source_recipe_id)?.name ?? '',
      source_recipe_is_active: recipeTargets.get(pairing.source_recipe_id)?.trashed_at === null,
    })),
    references: (referencesResult.data ?? []).map((recipeReference) => ({
      ...recipeReference,
      reference_type: recipeReference.reference_type as RecipeReference['reference_type'],
      is_protected_source: recipeReference.is_protected_source === true,
      source_public_id: recipeReference.source_public_id ?? null,
      linked_recipe_is_active: recipeReference.linked_recipe_id
        ? recipeTargets.get(recipeReference.linked_recipe_id)?.trashed_at === null
        : false,
    })),
  } as RecipeRecord;
}

export async function getRecipeExplorerColumnValues(
  supabase: RecipeSupabaseClient,
  recipeIds: string[],
  includeNutrition = false,
): Promise<Map<string, Record<string, string | null>>> {
  if (recipeIds.length === 0) return new Map();

  const [
    recipesResult,
    ingredientsResult,
    assignmentsResult,
    tagsResult,
    pairingsResult,
    citationsResult,
    nutritionResult,
  ] = await Promise.all([
    supabase
      .from('recipes')
      .select(
        'id, publication_id, publication_page, recipe_url, state, is_private, food_type_id, verdict_id, enthusiasm_id, score, is_starred, is_hearted, occasion_details, reason, serves, makes_quantity, makes_thing, total_time_minutes, created_at, updated_at',
      )
      .in('id', recipeIds),
    supabase
      .from('recipe_ingredients')
      .select('recipe_id, ingredient_id, position, is_main')
      .in('recipe_id', recipeIds)
      .eq('is_main', true)
      .order('position'),
    supabase
      .from('recipe_picklist_assignments')
      .select('recipe_id, category, picklist_value_id')
      .in('recipe_id', recipeIds),
    supabase.from('recipe_tags').select('recipe_id, tag_id').in('recipe_id', recipeIds),
    supabase
      .from('recipe_pairings')
      .select('source_recipe_id, display_text, position')
      .in('source_recipe_id', recipeIds)
      .order('position'),
    supabase
      .from('recipe_references')
      .select('recipe_id, display_text, position')
      .in('recipe_id', recipeIds)
      .eq('reference_type', 'printed_citation')
      .order('position'),
    includeNutrition
      ? supabase.rpc('recipe_explorer_nutrition', { p_recipe_ids: recipeIds })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (
    recipesResult.error ||
    ingredientsResult.error ||
    assignmentsResult.error ||
    tagsResult.error ||
    pairingsResult.error ||
    citationsResult.error ||
    nutritionResult.error
  ) {
    throw new Error('Unable to load recipe list details.');
  }

  const nutritionValuesByRecipe = new Map(
    (
      (nutritionResult.data ?? []) as {
        recipe_id: string;
        nutrition_values: Partial<Record<(typeof STANDARD_NUTRIENT_KEYS)[number], number>>;
      }[]
    ).map(({ recipe_id, nutrition_values }) => [recipe_id, nutrition_values]),
  );
  const mainIngredients = ingredientsResult.data ?? [];
  const tagAssignments = tagsResult.data ?? [];
  const ingredientIds = [...new Set(mainIngredients.map(({ ingredient_id }) => ingredient_id))];
  const tagIds = [...new Set(tagAssignments.map(({ tag_id }) => tag_id))];
  const publicationIds = [
    ...new Set(
      recipesResult.data
        ?.map(({ publication_id }) => publication_id)
        .filter((id): id is string => id !== null) ?? [],
    ),
  ];
  const [ingredientNamesResult, tagNamesResult, publicationNamesResult] = await Promise.all([
    ingredientIds.length
      ? supabase.from('ingredients').select('id, name').in('id', ingredientIds)
      : Promise.resolve({ data: [], error: null }),
    tagIds.length
      ? supabase.from('tags').select('id, name').in('id', tagIds)
      : Promise.resolve({ data: [], error: null }),
    publicationIds.length
      ? supabase.from('publications').select('id, name').in('id', publicationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (ingredientNamesResult.error || tagNamesResult.error || publicationNamesResult.error) {
    throw new Error('Unable to load recipe list details.');
  }

  const ingredientNameById = new Map(
    (ingredientNamesResult.data ?? []).map(({ id, name }) => [id, name]),
  );
  const tagNameById = new Map((tagNamesResult.data ?? []).map(({ id, name }) => [id, name]));
  const publicationNameById = new Map(
    (publicationNamesResult.data ?? []).map(({ id, name }) => [id, name]),
  );
  const recipes = recipesResult.data ?? [];
  const picklistIds = [
    ...new Set([
      ...(assignmentsResult.data ?? []).map(({ picklist_value_id }) => picklist_value_id),
      ...recipes
        .flatMap(({ food_type_id, verdict_id, enthusiasm_id }) => [
          food_type_id,
          verdict_id,
          enthusiasm_id,
        ])
        .filter((id): id is string => id !== null),
    ]),
  ];
  const picklistsResult = picklistIds.length
    ? await supabase
        .from('recipe_picklist_values')
        .select('id, display_value')
        .in('id', picklistIds)
    : { data: [], error: null };
  if (picklistsResult.error) {
    throw new Error('Unable to load recipe list details.');
  }
  const picklistById = new Map(
    (picklistsResult.data ?? []).map(({ id, display_value }) => [id, display_value]),
  );
  const assignmentsByRecipe = new Map<string, Map<string, string[]>>();
  for (const assignment of assignmentsResult.data ?? []) {
    const categories = assignmentsByRecipe.get(assignment.recipe_id) ?? new Map();
    const values = categories.get(assignment.category) ?? [];
    const label = picklistById.get(assignment.picklist_value_id);
    if (label) values.push(label);
    categories.set(assignment.category, values);
    assignmentsByRecipe.set(assignment.recipe_id, categories);
  }

  const ingredientsByRecipe = new Map<string, string[]>();
  for (const ingredient of mainIngredients) {
    const values = ingredientsByRecipe.get(ingredient.recipe_id) ?? [];
    const name = ingredientNameById.get(ingredient.ingredient_id);
    if (name) values.push(name);
    ingredientsByRecipe.set(ingredient.recipe_id, values);
  }
  const tagsByRecipe = new Map<string, string[]>();
  for (const assignment of tagAssignments) {
    const values = tagsByRecipe.get(assignment.recipe_id) ?? [];
    const name = tagNameById.get(assignment.tag_id);
    if (name) values.push(name);
    tagsByRecipe.set(assignment.recipe_id, values);
  }
  const pairingsByRecipe = new Map<string, string[]>();
  for (const pairing of pairingsResult.data ?? []) {
    const values = pairingsByRecipe.get(pairing.source_recipe_id) ?? [];
    values.push(pairing.display_text);
    pairingsByRecipe.set(pairing.source_recipe_id, values);
  }
  const citationsByRecipe = new Map<string, string[]>();
  for (const citation of citationsResult.data ?? []) {
    const values = citationsByRecipe.get(citation.recipe_id) ?? [];
    values.push(citation.display_text);
    citationsByRecipe.set(citation.recipe_id, values);
  }

  const optionalValue = (value: number | null) => (value === null ? null : String(value));
  const sortedDisplayValues = (values: string[] | undefined) =>
    [...(values ?? [])].sort((left, right) => left.localeCompare(right)).join(', ') || null;
  return new Map(
    recipes.map((recipe) => {
      const assignments = assignmentsByRecipe.get(recipe.id);
      const enthusiasm = recipe.enthusiasm_id
        ? (picklistById.get(recipe.enthusiasm_id) ?? null)
        : null;
      const verdict = recipe.verdict_id ? (picklistById.get(recipe.verdict_id) ?? null) : null;
      const opinion =
        recipe.state === 'want_to_try'
          ? enthusiasm
          : recipe.state === 'tried'
            ? verdict
            : recipe.reason;
      const values: Record<string, string | null> = {
        publication: recipe.publication_id
          ? (publicationNameById.get(recipe.publication_id) ?? null)
          : null,
        publication_page: recipe.publication_page,
        recipe_url: recipe.recipe_url,
        citation: citationsByRecipe.get(recipe.id)?.join(', ') ?? null,
        state: recipeStateLabels[recipe.state as RecipeState],
        visibility: recipe.is_private ? 'Private' : 'Linkable',
        enthusiasm,
        verdict,
        reason: recipe.reason,
        occasion_details: recipe.occasion_details,
        serves: optionalValue(recipe.serves),
        makes:
          recipe.makes_quantity !== null && recipe.makes_thing !== null
            ? `${recipe.makes_quantity} ${recipe.makes_thing}`
            : null,
        equipment: sortedDisplayValues(assignments?.get('equipment')),
        food_type: recipe.food_type_id ? (picklistById.get(recipe.food_type_id) ?? null) : null,
        meal_type: sortedDisplayValues(assignments?.get('meal_type')),
        cuisine: sortedDisplayValues(assignments?.get('cuisine')),
        tags: sortedDisplayValues(tagsByRecipe.get(recipe.id)),
        main_ingredients: ingredientsByRecipe.get(recipe.id)?.join(', ') ?? null,
        total_time_minutes: optionalValue(recipe.total_time_minutes),
        score: optionalValue(recipe.score),
        starred: recipe.is_starred ? 'true' : null,
        hearted: recipe.is_hearted ? 'true' : null,
        created_at: recipe.created_at,
        updated_at: recipe.updated_at,
        pairs_with: pairingsByRecipe.get(recipe.id)?.join(', ') ?? null,
        opinion,
      };
      const nutritionValues = nutritionValuesByRecipe.get(recipe.id);
      for (const key of STANDARD_NUTRIENT_KEYS) {
        const value = nutritionValues?.[key];
        values[key] = typeof value === 'number' ? String(value) : null;
      }
      return [recipe.id, values];
    }),
  );
}

export type RecipeMarkerState = {
  score: RecipeScore | null;
  is_starred: boolean;
  is_hearted: boolean;
};

export async function getRecipeMarkerStates(
  supabase: RecipeSupabaseClient,
  recipeIds: string[],
): Promise<Map<string, RecipeMarkerState>> {
  if (recipeIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('recipes')
    .select('id, score, is_starred, is_hearted')
    .in('id', recipeIds);

  if (error) {
    throw new Error('Unable to load recipe markers.');
  }

  return new Map(
    (data ?? []).map((recipe) => [
      recipe.id,
      {
        score: recipe.score as RecipeScore | null,
        is_starred: recipe.is_starred,
        is_hearted: recipe.is_hearted,
      },
    ]),
  );
}

export async function getTrashedRecipes(
  supabase: RecipeSupabaseClient,
): Promise<TrashedRecipeRecord[]> {
  const { data, error } = await supabase.rpc('list_trashed_recipes');
  if (error) {
    throw new Error('Unable to load Trash.');
  }

  return (data ?? []) as TrashedRecipeRecord[];
}

export async function getTrashedPublications(
  supabase: RecipeSupabaseClient,
): Promise<TrashedPublicationRecord[]> {
  const { data, error } = await supabase.rpc('list_trashed_publications');
  if (error) {
    throw new Error('Unable to load Trash.');
  }

  return (data ?? []) as TrashedPublicationRecord[];
}

export const recipeStateLabels: Record<RecipeState, string> = {
  want_to_try: 'Want to try',
  tried: 'Tried',
  will_not_try: 'Will not try',
};
