import { createClient } from '@supabase/supabase-js';
import type { CropRect } from '../media/rules';
import type {
  RecipeIngredient,
  RecipeIngredientSet,
  RecipeInstructionStep,
  RecipeMeasurement,
} from './data';
import {
  calculateRecipeNutrition,
  type NutrientValues,
  type NutritionBasis,
  type NutritionDensity,
  type NutritionEquivalent,
  type NutritionProfile,
} from './nutrition-rules';
import { createPublicPhotoId } from './public-photo-id';
import {
  buildPublicRecipePayload,
  type PublicRecipePayload,
  type PublicRecipeSource,
} from './public-rules';

const publicIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;

function createPublicDataAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error('Public recipe data failed.', { operation: 'admin_client_configuration' });
    throw new PublicRecipeDataError();
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export type PublicRecipePhoto = {
  id: string;
  description: string;
  is_primary: boolean;
  width: number;
  height: number;
  display_width: number;
  display_height: number;
  crop: CropRect | null;
  full_url: string;
  thumbnail_url: string;
};

export type PublicRecipePageData =
  | { status: 'unavailable' | 'gone' | 'error' }
  | {
      status: 'active';
      recipe: PublicRecipePayload;
      photos: PublicRecipePhoto[];
      authorUsername: string;
    };

type PublicRecipeRow = {
  id: string;
  account_id: string;
  public_id: string;
  is_private: boolean;
  trashed_at: string | null;
  name: string;
  publication_id: string | null;
  publication_page: string | null;
  serves: number | null;
  makes_quantity: number | null;
  makes_thing: string | null;
  prep_time_minutes: number | null;
  mixing_time_minutes: number | null;
  marinate_time_minutes: number | null;
  chill_time_minutes: number | null;
  freeze_time_minutes: number | null;
  cook_time_minutes: number | null;
  bake_time_minutes: number | null;
  cooling_time_minutes: number | null;
  rest_time_minutes: number | null;
  total_time_minutes: number | null;
  nutrition_overrides: NutrientValues;
};

type IngredientRow = Pick<
  RecipeIngredient,
  | 'id'
  | 'ingredient_id'
  | 'ingredient_set_id'
  | 'position'
  | 'is_main'
  | 'detail'
  | 'preparation'
  | 'portion_one_ratio'
  | 'size_value'
  | 'size_unit'
  | 'nutrition_serving_size_override'
  | 'nutrition_overrides'
>;

type MeasurementRow = RecipeMeasurement & { recipe_ingredient_id: string };

type PublicPhotoRow = {
  id: string;
  description: string;
  is_primary: boolean;
  width: number;
  height: number;
  display_width: number;
  display_height: number;
  crop: CropRect | null;
  full_path: string;
  thumbnail_path: string;
  source_full_path: string;
};

type PublicPhotoRecord = {
  assetId: string;
  photo: PublicRecipePhoto;
};

class PublicRecipeDataError extends Error {}

function ensureNoError(error: { code?: string } | null, operation: string): void {
  if (error) {
    console.error('Public recipe data query failed.', {
      operation,
      code: error.code ?? 'unknown',
    });
    throw new PublicRecipeDataError();
  }
}

async function getPublicPhotos(recipeId: string, publicId: string): Promise<PublicPhotoRecord[]> {
  const supabase = createPublicDataAdminClient();
  const { data, error } = await supabase
    .from('media_assets')
    .select(
      'id, description, is_primary, width, height, display_width, display_height, crop, full_path, thumbnail_path, source_full_path',
    )
    .eq('recipe_id', recipeId)
    .eq('asset_type', 'recipe_photo')
    .eq('status', 'ready')
    .order('position')
    .order('created_at');
  ensureNoError(error, 'recipe_photo_metadata');

  const rows = (data ?? []) as PublicPhotoRow[];
  return rows.map(({ id, full_path, thumbnail_path, source_full_path, ...metadata }) => {
    const photoId = createPublicPhotoId(publicId, id);
    const photoUrl = `/api/public-recipes/${publicId}/photos/${photoId}`;
    return {
      assetId: id,
      photo: {
        ...metadata,
        id: photoId,
        crop: full_path === source_full_path ? metadata.crop : null,
        full_url: `${photoUrl}?variant=full`,
        thumbnail_url: `${photoUrl}?variant=thumbnail`,
      },
    };
  });
}

async function loadPublicRecipePageData(publicId: string): Promise<PublicRecipePageData> {
  if (!publicIdPattern.test(publicId)) {
    return { status: 'unavailable' };
  }

  const supabase = createPublicDataAdminClient();
  const { data: row, error } = await supabase
    .from('recipes')
    .select(
      'id, account_id, public_id, is_private, trashed_at, name, publication_id, publication_page, serves, makes_quantity, makes_thing, prep_time_minutes, mixing_time_minutes, marinate_time_minutes, chill_time_minutes, freeze_time_minutes, cook_time_minutes, bake_time_minutes, cooling_time_minutes, rest_time_minutes, total_time_minutes, nutrition_overrides',
    )
    .eq('public_id', publicId)
    .maybeSingle();
  ensureNoError(error, 'recipe_visibility');

  if (!row) {
    const { data: tombstone, error: tombstoneError } = await supabase
      .from('purged_recipe_public_ids')
      .select('public_id')
      .eq('public_id', publicId)
      .maybeSingle();
    ensureNoError(tombstoneError, 'purged_recipe_lookup');
    return { status: tombstone ? 'gone' : 'unavailable' };
  }

  const recipeRow = row as PublicRecipeRow;
  if (recipeRow.is_private || recipeRow.trashed_at) {
    return { status: 'unavailable' };
  }

  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('public_username')
    .eq('id', recipeRow.account_id)
    .maybeSingle();
  ensureNoError(accountError, 'public_username');
  if (!account?.public_username) {
    return { status: 'unavailable' };
  }

  const [
    publicationResult,
    assignmentResult,
    ingredientSetResult,
    stepResult,
    ingredientResult,
    pairingResult,
    referenceResult,
  ] = await Promise.all([
    recipeRow.publication_id
      ? supabase
          .from('publications')
          .select('name')
          .eq('account_id', recipeRow.account_id)
          .eq('id', recipeRow.publication_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('recipe_picklist_assignments')
      .select('picklist_value_id')
      .eq('account_id', recipeRow.account_id)
      .eq('recipe_id', recipeRow.id)
      .eq('category', 'equipment'),
    supabase
      .from('recipe_ingredient_sets')
      .select('id, label, position')
      .eq('account_id', recipeRow.account_id)
      .eq('recipe_id', recipeRow.id)
      .order('position'),
    supabase
      .from('recipe_steps')
      .select('id, position, content_markdown, plain_text')
      .eq('account_id', recipeRow.account_id)
      .eq('recipe_id', recipeRow.id)
      .order('position'),
    supabase
      .from('recipe_ingredients')
      .select(
        'id, ingredient_id, ingredient_set_id, position, is_main, detail, preparation, portion_one_ratio, size_value, size_unit, nutrition_serving_size_override, nutrition_overrides',
      )
      .eq('account_id', recipeRow.account_id)
      .eq('recipe_id', recipeRow.id)
      .order('position'),
    supabase
      .from('recipe_pairings')
      .select('display_text')
      .eq('account_id', recipeRow.account_id)
      .eq('source_recipe_id', recipeRow.id)
      .order('position'),
    supabase
      .from('recipe_references')
      .select('reference_type, display_text, url')
      .eq('account_id', recipeRow.account_id)
      .eq('recipe_id', recipeRow.id)
      .order('position'),
  ]);
  const publicDataResults: Array<[string, { error: { code?: string } | null }]> = [
    ['publication', publicationResult],
    ['equipment_assignments', assignmentResult],
    ['ingredient_sets', ingredientSetResult],
    ['instruction_steps', stepResult],
    ['recipe_ingredients', ingredientResult],
    ['recipe_pairings', pairingResult],
    ['recipe_references', referenceResult],
  ];
  for (const [operation, result] of publicDataResults) {
    ensureNoError(result.error, operation);
  }

  const equipmentIds = (assignmentResult.data ?? []).map(
    (assignment) => assignment.picklist_value_id,
  );
  const { data: equipmentRows, error: equipmentError } = equipmentIds.length
    ? await supabase
        .from('recipe_picklist_values')
        .select('display_value')
        .eq('account_id', recipeRow.account_id)
        .eq('category', 'equipment')
        .in('id', equipmentIds)
    : { data: [], error: null };
  ensureNoError(equipmentError, 'equipment_values');

  const ingredientRows = (ingredientResult.data ?? []) as IngredientRow[];
  const ingredientIds = [...new Set(ingredientRows.map((ingredient) => ingredient.ingredient_id))];
  const ingredientRowIds = ingredientRows.map((ingredient) => ingredient.id);
  const [canonicalResult, measurementResult, profileResult, equivalentResult, densityResult] =
    await Promise.all([
      ingredientIds.length
        ? supabase
            .from('ingredients')
            .select('id, name')
            .eq('account_id', recipeRow.account_id)
            .in('id', ingredientIds)
        : Promise.resolve({ data: [], error: null }),
      ingredientRowIds.length
        ? supabase
            .from('recipe_ingredient_measurements')
            .select(
              'id, recipe_ingredient_id, position, measurement_type, amount_min, amount_max, unit_code, picklist_value_id',
            )
            .eq('account_id', recipeRow.account_id)
            .in('recipe_ingredient_id', ingredientRowIds)
            .order('recipe_ingredient_id')
            .order('position')
        : Promise.resolve({ data: [], error: null }),
      ingredientIds.length
        ? supabase
            .from('ingredient_nutrition_profiles')
            .select(
              'ingredient_id, serving_size_amount, serving_size_dimension, serving_size_unit_code, nutrients',
            )
            .eq('account_id', recipeRow.account_id)
            .in('ingredient_id', ingredientIds)
        : Promise.resolve({ data: [], error: null }),
      ingredientIds.length
        ? supabase
            .from('ingredient_measure_equivalents')
            .select(
              'ingredient_id, measurement_type, picklist_value_id, picklist_value, volume_amount, volume_unit_code, weight_amount, weight_unit_code',
            )
            .eq('account_id', recipeRow.account_id)
            .in('ingredient_id', ingredientIds)
        : Promise.resolve({ data: [], error: null }),
      ingredientIds.length
        ? supabase
            .from('ingredient_densities')
            .select(
              'ingredient_id, volume_amount, volume_unit_code, weight_amount, weight_unit_code',
            )
            .eq('account_id', recipeRow.account_id)
            .in('ingredient_id', ingredientIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  ensureNoError(canonicalResult.error, 'ingredient_names');
  ensureNoError(measurementResult.error, 'ingredient_measurements');
  ensureNoError(profileResult.error, 'ingredient_nutrition_profiles');
  ensureNoError(equivalentResult.error, 'ingredient_measure_equivalents');
  ensureNoError(densityResult.error, 'ingredient_densities');

  const measurementRows = (measurementResult.data ?? []) as MeasurementRow[];
  const measurementOptionIds = [
    ...new Set(
      measurementRows
        .map((measurement) => measurement.picklist_value_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: measurementOptions, error: measurementOptionError } = measurementOptionIds.length
    ? await supabase
        .from('recipe_picklist_values')
        .select('id, display_value')
        .eq('account_id', recipeRow.account_id)
        .in('id', measurementOptionIds)
    : { data: [], error: null };
  ensureNoError(measurementOptionError, 'measurement_picklist_values');

  const ingredientNames = new Map(
    (canonicalResult.data ?? []).map((ingredient) => [ingredient.id, ingredient.name]),
  );
  const measurementLabels = new Map(
    (measurementOptions ?? []).map((option) => [option.id, option.display_value]),
  );
  const measurementsByIngredient = new Map<string, RecipeMeasurement[]>();
  for (const measurement of measurementRows) {
    const rows = measurementsByIngredient.get(measurement.recipe_ingredient_id) ?? [];
    rows.push({
      ...measurement,
      picklist_value: measurement.picklist_value_id
        ? (measurementLabels.get(measurement.picklist_value_id) ?? null)
        : null,
    });
    measurementsByIngredient.set(measurement.recipe_ingredient_id, rows);
  }

  const profileByIngredient = new Map(
    (profileResult.data ?? []).map((profile) => [
      profile.ingredient_id,
      {
        servingSize: {
          amount: Number(profile.serving_size_amount),
          dimension: profile.serving_size_dimension as NutritionBasis['dimension'],
          unitCode: profile.serving_size_unit_code,
        },
        nutrients: profile.nutrients as NutritionProfile['nutrients'],
      },
    ]),
  );
  const equivalentByIngredient = new Map(
    (equivalentResult.data ?? []).map((equivalent) => [
      equivalent.ingredient_id,
      {
        measurementType: equivalent.measurement_type as NutritionEquivalent['measurementType'],
        picklistValueId: equivalent.picklist_value_id,
        picklistValue: equivalent.picklist_value,
        volume:
          equivalent.volume_amount === null
            ? null
            : { amount: Number(equivalent.volume_amount), unitCode: equivalent.volume_unit_code },
        weight:
          equivalent.weight_amount === null
            ? null
            : { amount: Number(equivalent.weight_amount), unitCode: equivalent.weight_unit_code },
      },
    ]),
  );
  const densityByIngredient = new Map(
    (densityResult.data ?? []).map((density) => [
      density.ingredient_id,
      {
        volumeAmount: Number(density.volume_amount),
        volumeUnitCode: density.volume_unit_code,
        weightAmount: Number(density.weight_amount),
        weightUnitCode: density.weight_unit_code,
      } satisfies NutritionDensity,
    ]),
  );
  const ingredients: RecipeIngredient[] = ingredientRows.map((ingredient) => ({
    ...ingredient,
    ingredient_name: ingredientNames.get(ingredient.ingredient_id) ?? '',
    portion_one_ratio: ingredient.portion_one_ratio,
    size_value: ingredient.size_value,
    size_unit: ingredient.size_unit,
    nutrition_serving_size_override:
      ingredient.nutrition_serving_size_override as NutritionBasis | null,
    nutrition_overrides: ingredient.nutrition_overrides as RecipeIngredient['nutrition_overrides'],
    nutrition_profile: profileByIngredient.get(ingredient.ingredient_id) ?? null,
    nutrition_equivalent: equivalentByIngredient.get(ingredient.ingredient_id) ?? null,
    density: densityByIngredient.get(ingredient.ingredient_id) ?? null,
    measurements: measurementsByIngredient.get(ingredient.id) ?? [],
  }));
  const nutritionPerServing = calculateRecipeNutrition(
    ingredients.map((ingredient) => ({
      measurements: ingredient.measurements.map((measurement) => ({
        type: measurement.measurement_type,
        amount: measurement.amount_min,
        maximum: measurement.amount_max,
        unitCode: measurement.unit_code,
        picklistValueId: measurement.picklist_value_id,
        picklistValue: measurement.picklist_value,
      })),
      profile: ingredient.nutrition_profile ?? null,
      servingSizeOverride: ingredient.nutrition_serving_size_override ?? null,
      nutrientOverrides: ingredient.nutrition_overrides ?? {},
      density: ingredient.density ?? null,
      equivalent: ingredient.nutrition_equivalent ?? null,
    })),
    recipeRow.serves,
    recipeRow.nutrition_overrides,
  ).perServing;
  const source: PublicRecipeSource = {
    ...recipeRow,
    publication: publicationResult.data,
    ingredient_sets: (ingredientSetResult.data ?? []) as RecipeIngredientSet[],
    ingredients,
    nutrition_per_serving: nutritionPerServing,
    steps: (stepResult.data ?? []) as RecipeInstructionStep[],
    pairings: pairingResult.data ?? [],
    references: referenceResult.data ?? [],
  };
  const photoRecords = await getPublicPhotos(recipeRow.id, publicId);
  const photos = photoRecords.map(({ photo }) => photo);
  const publicPhotoIds = new Map(
    photoRecords.map(({ assetId, photo }) => [assetId.toLocaleLowerCase(), photo.id]),
  );
  const recipe = buildPublicRecipePayload(
    source,
    (equipmentRows ?? []).map((equipment) => equipment.display_value),
    publicPhotoIds,
  );
  return { status: 'active', recipe, photos, authorUsername: account.public_username };
}

export async function getPublicRecipePageData(publicId: string): Promise<PublicRecipePageData> {
  try {
    return await loadPublicRecipePageData(publicId);
  } catch (error) {
    if (error instanceof PublicRecipeDataError) {
      return { status: 'error' };
    }
    throw error;
  }
}
