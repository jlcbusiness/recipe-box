import { createClient } from '@supabase/supabase-js';
import type { CropRect } from '../media/rules';
import type {
  RecipeIngredient,
  RecipeIngredientSet,
  RecipeInstructionStep,
  RecipeMeasurement,
} from './data';
import {
  buildPublicRecipePayload,
  type PublicRecipePayload,
  type PublicRecipeSource,
} from './public-rules';

const publicIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const signedUrlLifetimeSeconds = 900;

function createPublicDataAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase server administration is not configured.');
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
  | { status: 'unavailable' | 'gone' }
  | { status: 'active'; recipe: PublicRecipePayload; photos: PublicRecipePhoto[] };

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

type SignedPublicPhoto = Omit<PublicRecipePhoto, 'id'> & { assetId: string };

function ensureNoError(error: { message: string } | null): void {
  if (error) {
    throw new Error('Unable to load this public recipe.');
  }
}

async function getPublicPhotos(recipeId: string): Promise<SignedPublicPhoto[]> {
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
  ensureNoError(error);

  const rows = (data ?? []) as PublicPhotoRow[];
  return Promise.all(
    rows.map(async ({ id, full_path, thumbnail_path, source_full_path, ...metadata }) => {
      const [full, thumbnail] = await Promise.all([
        supabase.storage.from('recipe-media').createSignedUrl(full_path, signedUrlLifetimeSeconds),
        supabase.storage
          .from('recipe-media')
          .createSignedUrl(thumbnail_path, signedUrlLifetimeSeconds),
      ]);
      if (full.error || thumbnail.error) {
        throw new Error('Unable to prepare this recipe photo.');
      }
      return {
        ...metadata,
        crop: full_path === source_full_path ? metadata.crop : null,
        assetId: id,
        full_url: full.data.signedUrl,
        thumbnail_url: thumbnail.data.signedUrl,
      };
    }),
  );
}

export async function getPublicRecipePageData(publicId: string): Promise<PublicRecipePageData> {
  if (!publicIdPattern.test(publicId)) {
    return { status: 'unavailable' };
  }

  const supabase = createPublicDataAdminClient();
  const { data: row, error } = await supabase
    .from('recipes')
    .select(
      'id, account_id, public_id, is_private, trashed_at, name, publication_id, publication_page, serves, makes_quantity, makes_thing, prep_time_minutes, mixing_time_minutes, marinate_time_minutes, chill_time_minutes, freeze_time_minutes, cook_time_minutes, bake_time_minutes, cooling_time_minutes, rest_time_minutes, total_time_minutes',
    )
    .eq('public_id', publicId)
    .maybeSingle();
  ensureNoError(error);

  if (!row) {
    const { data: tombstone, error: tombstoneError } = await supabase
      .from('purged_recipe_public_ids')
      .select('public_id')
      .eq('public_id', publicId)
      .maybeSingle();
    ensureNoError(tombstoneError);
    return { status: tombstone ? 'gone' : 'unavailable' };
  }

  const recipeRow = row as PublicRecipeRow;
  if (recipeRow.is_private || recipeRow.trashed_at) {
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
        'id, ingredient_id, ingredient_set_id, position, is_main, detail, preparation, portion_one_ratio, size_value, size_unit',
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
  for (const result of [
    publicationResult,
    assignmentResult,
    ingredientSetResult,
    stepResult,
    ingredientResult,
    pairingResult,
    referenceResult,
  ]) {
    ensureNoError(result.error);
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
  ensureNoError(equipmentError);

  const ingredientRows = (ingredientResult.data ?? []) as IngredientRow[];
  const ingredientIds = [...new Set(ingredientRows.map((ingredient) => ingredient.ingredient_id))];
  const ingredientRowIds = ingredientRows.map((ingredient) => ingredient.id);
  const [canonicalResult, measurementResult] = await Promise.all([
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
  ]);
  ensureNoError(canonicalResult.error);
  ensureNoError(measurementResult.error);

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
  ensureNoError(measurementOptionError);

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

  const ingredients: RecipeIngredient[] = ingredientRows.map((ingredient) => ({
    ...ingredient,
    ingredient_name: ingredientNames.get(ingredient.ingredient_id) ?? '',
    portion_one_ratio: ingredient.portion_one_ratio,
    size_value: ingredient.size_value,
    size_unit: ingredient.size_unit,
    measurements: measurementsByIngredient.get(ingredient.id) ?? [],
  }));
  const source: PublicRecipeSource = {
    ...recipeRow,
    publication: publicationResult.data,
    ingredient_sets: (ingredientSetResult.data ?? []) as RecipeIngredientSet[],
    ingredients,
    steps: (stepResult.data ?? []) as RecipeInstructionStep[],
    pairings: pairingResult.data ?? [],
    references: referenceResult.data ?? [],
  };
  const signedPhotos = await getPublicPhotos(recipeRow.id);
  const publicPhotoIds = new Map(
    signedPhotos.map(({ assetId }, index) => [
      assetId.toLocaleLowerCase(),
      `00000000-0000-4000-8000-${(1_000_000 + index).toString(16).padStart(12, '0')}`,
    ]),
  );
  const recipe = buildPublicRecipePayload(
    source,
    (equipmentRows ?? []).map((equipment) => equipment.display_value),
    publicPhotoIds,
  );
  const photos = signedPhotos.map(({ assetId, ...photo }) => ({
    ...photo,
    id: publicPhotoIds.get(assetId.toLocaleLowerCase()) ?? '',
  }));
  return { status: 'active', recipe, photos };
}
