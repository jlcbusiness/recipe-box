import { createUuid } from '../uuid';
import { instructionPlainText } from './instruction-rules';
import type { NutrientValues } from './nutrition-rules';
import type { PublicRecipePhoto } from './public-data';
import type { PublicRecipePayload } from './public-rules';

export type PublicRecipePhotoSource = {
  photo: PublicRecipePhoto;
  fullPath: string;
  thumbnailPath: string;
};

export type PublicRecipeCopySource = {
  publicId: string;
  authorUsername: string;
  recipe: PublicRecipePayload;
  photoSources: PublicRecipePhotoSource[];
};

type CopyMeasurement = {
  measurement_type: string;
  amount_min: number | null;
  amount_max: number | null;
  unit_code: string | null;
  picklist_value_id: null;
};

type CopyIngredientRow = {
  recipe_ingredient_id: string;
  ingredient_id: null;
  ingredient_name: string;
  ingredient_set_id: string;
  position: number;
  is_main: boolean;
  detail: string;
  preparation: string;
  portion_one_ratio: number | null;
  size_value: number | null;
  size_unit: string | null;
  nutrition_serving_size_override: null;
  nutrition_overrides: NutrientValues;
  measurements: CopyMeasurement[];
};

type CopyStep = {
  id: string;
  position: number;
  content_markdown: string;
  plain_text: string;
};

type CopyReference = {
  id: string;
  reference_type: 'external_url' | 'printed_citation';
  display_text: string;
  linked_recipe_id: null;
  publication_id: null;
  url: string | null;
};

export type PublicRecipeCopyPayload = {
  recipe: {
    p_recipe_id: null;
    p_expected_version: null;
    p_name: string;
    p_food_type_id: null;
    p_state: 'want_to_try';
    p_verdict_id: null;
    p_enthusiasm_id: null;
    p_occasion_details: null;
    p_reason: null;
    p_serves: number | null;
    p_time_entries: Array<{ time_type: string; minutes: number; position: number }>;
    p_notes_markdown: string;
    p_meal_type_ids: string[];
    p_cuisine_ids: string[];
    p_equipment_ids: string[];
    p_equipment_names: string[];
    p_ingredient_rows: CopyIngredientRow[];
    p_instruction_steps: CopyStep[];
    p_publication_id: null;
    p_publication_page: null;
    p_recipe_url: null;
    p_recipe_relationships: {
      site_listing: null;
      pairings: Array<{
        id: string;
        display_text: string;
        linked_recipe_id: null;
      }>;
      references: CopyReference[];
    };
    p_tag_ids: string[];
    p_ingredient_sets: Array<{ id: string; label: string; position: number }>;
    p_score: null;
    p_makes_quantity: number | null;
    p_makes_thing: string | null;
    p_nutrition_overrides: NutrientValues;
  };
  photos: Array<{
    id: string;
    description: string;
    is_primary: boolean;
    position: number;
    width: number;
    height: number;
  }>;
};

function remapInstruction(
  markdown: string,
  ingredientIds: ReadonlyMap<string, string>,
  photoIds: ReadonlyMap<string, string>,
) {
  const withIngredients = markdown.replace(
    /\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?::([12]))?\|([^\]\r\n]+)\]\]/giu,
    (_marker, sourceId: string, ordinal: string | undefined, label: string) => {
      const id = ingredientIds.get(sourceId.toLocaleLowerCase());
      return id ? `[[ingredient:${id}${ordinal ? `:${ordinal}` : ''}|${label}]]` : label;
    },
  );
  return withIngredients.replace(
    /\[\[photo:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\]\](?:-(\d+))?/giu,
    (_marker, sourceId: string, width: string | undefined) => {
      const id = photoIds.get(sourceId.toLocaleLowerCase());
      return id ? `[[photo:${id}]]${width ? `-${width}` : ''}` : '';
    },
  );
}

function recipeNutritionOverrides(nutrition: NutrientValues | null, serves: number | null) {
  const servings = serves ?? 1;
  return Object.fromEntries(
    Object.entries(nutrition ?? {}).map(([nutrient, value]) => [nutrient, value * servings]),
  ) as NutrientValues;
}

export function buildPublicRecipeCopyPayload(
  source: PublicRecipeCopySource,
  createId: () => string = createUuid,
): PublicRecipeCopyPayload {
  const ingredientSetIds = new Map(
    source.recipe.ingredient_sets.map((set) => [set.id.toLocaleLowerCase(), createId()]),
  );
  const ingredientIds = new Map(
    source.recipe.ingredients.map((ingredient) => [ingredient.id.toLocaleLowerCase(), createId()]),
  );
  const photos = source.photoSources.map(({ photo }, position) => ({
    id: createId(),
    description: photo.description,
    is_primary: photo.is_primary,
    position,
    width: photo.width,
    height: photo.height,
  }));
  const photoIds = new Map(
    source.photoSources.map(({ photo }, index) => [
      photo.id.toLocaleLowerCase(),
      photos[index]?.id ?? '',
    ]),
  );
  const ingredientSets = source.recipe.ingredient_sets.map((set, position) => ({
    id: ingredientSetIds.get(set.id.toLocaleLowerCase()) ?? createId(),
    label: set.label,
    position,
  }));
  const ingredientRows = source.recipe.ingredients.map((ingredient, position) => ({
    recipe_ingredient_id: ingredientIds.get(ingredient.id.toLocaleLowerCase()) ?? createId(),
    ingredient_id: null,
    ingredient_name: ingredient.ingredient_name,
    ingredient_set_id:
      ingredientSetIds.get(ingredient.ingredient_set_id.toLocaleLowerCase()) ??
      ingredientSets[0]?.id ??
      createId(),
    position,
    is_main: ingredient.is_main,
    detail: ingredient.detail,
    preparation: ingredient.preparation,
    portion_one_ratio: ingredient.portion_one_ratio,
    size_value: ingredient.size_value,
    size_unit: ingredient.size_unit,
    nutrition_serving_size_override: null,
    nutrition_overrides: {},
    measurements: ingredient.measurements.map((measurement) => ({
      measurement_type: measurement.measurement_type,
      amount_min: measurement.amount_min,
      amount_max: measurement.amount_max,
      unit_code: measurement.unit_code,
      picklist_value_id: null,
    })),
  }));
  const steps = source.recipe.steps.map((step, position) => {
    const content_markdown = remapInstruction(step.content_markdown, ingredientIds, photoIds);
    return {
      id: createId(),
      position,
      content_markdown,
      plain_text: instructionPlainText(content_markdown),
    };
  });
  const references = source.recipe.references.map((reference) => ({
    id: createId(),
    reference_type: reference.href ? ('external_url' as const) : ('printed_citation' as const),
    display_text: reference.display_text,
    linked_recipe_id: null,
    publication_id: null,
    url: reference.href,
  }));

  if (source.recipe.attribution && source.recipe.attribution.publication_type !== 'collection') {
    references.push({
      id: createId(),
      reference_type: 'printed_citation',
      display_text: `${source.recipe.attribution.publication_name}${
        source.recipe.attribution.page ? ` · p. ${source.recipe.attribution.page}` : ''
      }`,
      linked_recipe_id: null,
      publication_id: null,
      url: null,
    });
  }

  return {
    recipe: {
      p_recipe_id: null,
      p_expected_version: null,
      p_name: source.recipe.name,
      p_food_type_id: null,
      p_state: 'want_to_try',
      p_verdict_id: null,
      p_enthusiasm_id: null,
      p_occasion_details: null,
      p_reason: null,
      p_serves: source.recipe.serves,
      p_time_entries: source.recipe.time_entries.map((entry) => ({ ...entry })),
      p_notes_markdown: '',
      p_meal_type_ids: [],
      p_cuisine_ids: [],
      p_equipment_ids: [],
      p_equipment_names: [...source.recipe.equipment],
      p_ingredient_rows: ingredientRows,
      p_instruction_steps: steps,
      p_publication_id: null,
      p_publication_page: null,
      p_recipe_url: null,
      p_recipe_relationships: {
        site_listing: null,
        pairings: source.recipe.pairings.map((pairing) => ({
          id: createId(),
          display_text: pairing,
          linked_recipe_id: null,
        })),
        references,
      },
      p_tag_ids: [],
      p_ingredient_sets: ingredientSets,
      p_score: null,
      p_makes_quantity: source.recipe.makes_quantity,
      p_makes_thing: source.recipe.makes_thing,
      p_nutrition_overrides: recipeNutritionOverrides(
        source.recipe.nutrition_per_serving,
        source.recipe.serves,
      ),
    },
    photos,
  };
}
