import type { RecipeIngredientSet, RecipeRecord } from './data';

export type PublicRecipeSource = {
  name: string;
  serves: number | null;
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
  publication_page: string | null;
  publication: { name: string } | null;
  ingredient_sets: RecipeIngredientSet[];
  ingredients: RecipeRecord['ingredients'];
  steps: RecipeRecord['steps'];
  pairings: Array<Pick<RecipeRecord['pairings'][number], 'display_text'>>;
  references: Array<
    Pick<RecipeRecord['references'][number], 'reference_type' | 'display_text' | 'url'>
  >;
};

export type PublicRecipeReference = {
  display_text: string;
  href: string | null;
};

export type PublicRecipePayload = {
  name: string;
  serves: number | null;
  timings: {
    prep: number | null;
    mixing: number | null;
    marinate: number | null;
    chill: number | null;
    freeze: number | null;
    cook: number | null;
    bake: number | null;
    cooling: number | null;
    rest: number | null;
    total: number | null;
  };
  equipment: string[];
  ingredient_sets: RecipeIngredientSet[];
  ingredients: RecipeRecord['ingredients'];
  steps: Array<Pick<RecipeRecord['steps'][number], 'position' | 'content_markdown'>>;
  attribution: { publication_name: string; page: string | null } | null;
  pairings: string[];
  references: PublicRecipeReference[];
};

function createPublicDisplayId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function remapPublicInstructionMentions(
  markdown: string,
  ingredientIds: Map<string, string>,
  missingMentionIds: Map<string, string>,
  createDisplayId: () => string,
): string {
  return markdown.replace(
    /\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?::([12]))?\|([^\]\r\n]+)\]\]/giu,
    (_mention, sourceId: string, ordinal: string | undefined, slug: string) => {
      const normalizedId = sourceId.toLocaleLowerCase();
      const displayId =
        ingredientIds.get(normalizedId) ?? missingMentionIds.get(normalizedId) ?? createDisplayId();
      if (!ingredientIds.has(normalizedId)) {
        missingMentionIds.set(normalizedId, displayId);
      }
      return `[[ingredient:${displayId}${ordinal ? `:${ordinal}` : ''}|${slug}]]`;
    },
  );
}

function remapPublicInstructionPhotos(
  markdown: string,
  photoIds: ReadonlyMap<string, string>,
): string {
  return markdown.replace(
    /\[\[photo:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\]\]/giu,
    (_marker, sourceId: string) => {
      const displayId = photoIds.get(sourceId.toLocaleLowerCase());
      return displayId ? `[[photo:${displayId}]]` : '';
    },
  );
}

export function getSafePublicReferenceHref(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function buildPublicRecipePayload(
  recipe: PublicRecipeSource,
  equipment: string[],
  photoIds: ReadonlyMap<string, string> = new Map(),
): PublicRecipePayload {
  let displayIdIndex = 0;
  const createDisplayId = () => createPublicDisplayId(displayIdIndex++);
  const setIds = new Map<string, string>();
  const ingredientSets = recipe.ingredient_sets.map((set) => {
    const id = createDisplayId();
    setIds.set(set.id.toLocaleLowerCase(), id);
    return { id, label: set.label, position: set.position };
  });
  const ingredientIds = new Map<string, string>();
  const ingredients = recipe.ingredients.map((ingredient) => {
    const id = createDisplayId();
    ingredientIds.set(ingredient.id.toLocaleLowerCase(), id);
    return {
      id,
      ingredient_id: id,
      ingredient_set_id: setIds.get(ingredient.ingredient_set_id.toLocaleLowerCase()) ?? '',
      ingredient_name: ingredient.ingredient_name,
      position: ingredient.position,
      is_main: ingredient.is_main,
      detail: ingredient.detail,
      preparation: ingredient.preparation,
      portion_one_ratio: ingredient.portion_one_ratio,
      size_value: ingredient.size_value,
      size_unit: ingredient.size_unit,
      measurements: ingredient.measurements.map((measurement) => ({
        id: createDisplayId(),
        position: measurement.position,
        measurement_type: measurement.measurement_type,
        amount_min: measurement.amount_min,
        amount_max: measurement.amount_max,
        unit_code: measurement.unit_code,
        picklist_value_id: null,
        picklist_value: measurement.picklist_value,
      })),
    };
  });
  const missingMentionIds = new Map<string, string>();

  return {
    name: recipe.name,
    serves: recipe.serves,
    timings: {
      prep: recipe.prep_time_minutes,
      mixing: recipe.mixing_time_minutes,
      marinate: recipe.marinate_time_minutes,
      chill: recipe.chill_time_minutes,
      freeze: recipe.freeze_time_minutes,
      cook: recipe.cook_time_minutes,
      bake: recipe.bake_time_minutes,
      cooling: recipe.cooling_time_minutes,
      rest: recipe.rest_time_minutes,
      total: recipe.total_time_minutes,
    },
    equipment: [...equipment],
    ingredient_sets: ingredientSets,
    ingredients,
    steps: recipe.steps.map(({ position, content_markdown }) => ({
      position,
      content_markdown: remapPublicInstructionPhotos(
        remapPublicInstructionMentions(
          content_markdown,
          ingredientIds,
          missingMentionIds,
          createDisplayId,
        ),
        photoIds,
      ),
    })),
    attribution: recipe.publication
      ? {
          publication_name: recipe.publication.name,
          page: recipe.publication_page,
        }
      : null,
    pairings: recipe.pairings.map(({ display_text }) => display_text),
    references: recipe.references.map((reference) => ({
      display_text: reference.display_text,
      href:
        reference.reference_type === 'external_url'
          ? getSafePublicReferenceHref(reference.url)
          : null,
    })),
  };
}
