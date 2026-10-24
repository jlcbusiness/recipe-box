import { randomUUID } from 'node:crypto';
import {
  type ExportRecord,
  type ExportTableName,
  exportTableNames,
  type PortableData,
} from '../exports/rules';
import { findImportMatches, normalizeImportName } from './rules';

export type ImportChoice = {
  action: 'keep' | 'duplicate' | 'replace';
  targetId: string;
};

export type ImportPlan = {
  records: PortableData['records'];
  replaceRecipeIds: string[];
  replacePublicationIds: string[];
  reusedCatalogRecords: Array<{
    table: 'ingredients' | 'recipe_picklist_values' | 'tags';
    id: string;
  }>;
  reusedDensityIngredientIds: string[];
  idMappings: Record<ExportTableName, Map<string, string>>;
};

type ExistingRecords = Partial<Record<ExportTableName, ExportRecord[]>>;
type ImportChoices = Readonly<Record<string, ImportChoice>>;
export type RecipeImportOptions = {
  destinationPublicationIds?: Readonly<Record<string, string>>;
  omitMissingSourcePublication?: boolean;
  omitRecipeIds?: readonly string[];
};

const conflictKey = (kind: 'recipe' | 'publication', id: string) => `${kind}:${id}`;

function rowsFrom(existing: ExistingRecords, table: ExportTableName): ExportRecord[] {
  return existing[table] ?? [];
}

function mapRoot(
  kind: 'recipe' | 'publication',
  record: ExportRecord,
  candidateIds: string[],
  choices: ImportChoices,
  idMap: Map<string, string>,
  createId: () => string,
  replaceIds: string[],
  keptIds: Set<string>,
) {
  const sourceId = String(record.id);
  const choice = choices[conflictKey(kind, sourceId)];
  if (candidateIds.length === 0) {
    if (choice) {
      throw new Error('The selected import choice is stale. Preview the archive again.');
    }
    const id = createId();
    idMap.set(sourceId, id);
    return { id, action: 'create' as const };
  }
  if (!choice || !candidateIds.includes(choice.targetId)) {
    throw new Error(`Choose a current match for the incoming ${kind}.`);
  }

  if (choice.action === 'keep') {
    idMap.set(sourceId, choice.targetId);
    keptIds.add(sourceId);
    return { id: choice.targetId, action: 'keep' as const };
  }
  if (choice.action === 'replace') {
    idMap.set(sourceId, choice.targetId);
    replaceIds.push(choice.targetId);
    return { id: choice.targetId, action: 'replace' as const };
  }
  if (choice.action === 'duplicate') {
    const id = createId();
    idMap.set(sourceId, id);
    return { id, action: 'duplicate' as const };
  }
  throw new Error(`The selected import choice for this ${kind} is invalid.`);
}

function mapCatalog(
  table: 'ingredients' | 'recipe_picklist_values' | 'tags',
  incoming: ExportRecord[],
  existing: ExportRecord[],
  idMap: Map<string, string>,
  createId: () => string,
) {
  const imported: ExportRecord[] = [];
  const reused: Array<{ table: 'ingredients' | 'recipe_picklist_values' | 'tags'; id: string }> =
    [];
  for (const record of incoming) {
    const sourceId = String(record.id);
    const candidates = existing.filter((item) => {
      if (table === 'recipe_picklist_values' && item.category !== record.category) return false;
      const field = table === 'recipe_picklist_values' ? 'value' : 'name';
      return (
        normalizeImportName(String(item[field] ?? '')) ===
        normalizeImportName(String(record[field] ?? ''))
      );
    });
    if (candidates.length > 1) {
      throw new Error(`The destination ${table} contains ambiguous normalized names.`);
    }
    const localId = candidates[0]?.id;
    if (typeof localId === 'string') {
      idMap.set(sourceId, localId);
      reused.push({ table, id: localId });
      continue;
    }
    const id = createId();
    idMap.set(sourceId, id);
    imported.push({ ...record, id });
  }
  return { imported, reused };
}

export function planImport(
  incoming: PortableData,
  existing: ExistingRecords,
  choices: ImportChoices,
  createId: () => string = randomUUID,
  recipeOptions: RecipeImportOptions = {},
): ImportPlan {
  const idMappings = Object.fromEntries(
    exportTableNames.map((table) => [table, new Map<string, string>()]),
  ) as Record<ExportTableName, Map<string, string>>;
  const replaceRecipeIds: string[] = [];
  const replacePublicationIds: string[] = [];
  const keptRecipeIds = new Set<string>();
  const keptPublicationIds = new Set<string>();
  const sourcePublicationResolutions = new Map<string, string>();
  const importedPublications: ExportRecord[] = [];
  const omittedPublicationIds = new Set<string>();
  const scope = incoming.scope;
  const destinationPublicationIds = recipeOptions.destinationPublicationIds ?? {};
  const omittedRecipeIds = new Set(recipeOptions.omitRecipeIds ?? []);
  const incomingRecipeIds = new Set(incoming.records.recipes.map((recipe) => String(recipe.id)));
  if ([...omittedRecipeIds].some((recipeId) => !incomingRecipeIds.has(recipeId))) {
    throw new Error('The import plan cannot omit a recipe outside the archive.');
  }

  const publicationMatches = findImportMatches(incoming, {
    recipes: [],
    publications: rowsFrom(existing, 'publications'),
  }).filter((match) => match.kind === 'publication');
  for (const publication of incoming.records.publications) {
    const sourceId = String(publication.id);
    const match = publicationMatches.find((item) => item.incomingId === sourceId);
    if (publication.publication_type === 'collection') {
      const activePublications = rowsFrom(existing, 'publications').filter(
        (item) => item.trashed_at == null,
      );
      const recipeTin = activePublications.find((item) => item.publication_type === 'collection');
      if (!recipeTin) throw new Error('The destination Recipe Tin is unavailable.');
      idMappings.publications.set(sourceId, String(recipeTin.id));
      sourcePublicationResolutions.set(sourceId, String(recipeTin.id));
      keptPublicationIds.add(sourceId);
      continue;
    }

    if (scope.type === 'recipe') {
      const activePublications = rowsFrom(existing, 'publications').filter(
        (item) => item.trashed_at == null,
      );
      const candidates = (match?.existingIds ?? []).filter((id) =>
        activePublications.some((item) => item.id === id),
      );
      const existingMatch = candidates.length === 1 ? candidates[0] : undefined;
      const resolvedId = existingMatch ?? createId();
      if (existingMatch) {
        keptPublicationIds.add(sourceId);
      } else {
        importedPublications.push({
          ...publication,
          id: resolvedId,
          name: candidates.length ? `${String(publication.name)} (Imported)` : publication.name,
        });
      }
      idMappings.publications.set(sourceId, resolvedId);
      sourcePublicationResolutions.set(sourceId, resolvedId);
      continue;
    }
    if (
      scope.type === 'publication' &&
      recipeOptions.omitMissingSourcePublication &&
      sourceId === scope.id &&
      (match?.existingIds.length ?? 0) === 0
    ) {
      omittedPublicationIds.add(sourceId);
      keptPublicationIds.add(sourceId);
      continue;
    }
    const result = mapRoot(
      'publication',
      publication,
      match?.existingIds ?? [],
      choices,
      idMappings.publications,
      createId,
      replacePublicationIds,
      keptPublicationIds,
    );
    sourcePublicationResolutions.set(sourceId, result.id);
    if (result.action !== 'keep') {
      importedPublications.push({
        ...publication,
        id: result.id,
        name:
          result.action === 'duplicate'
            ? `${String(publication.name)} (Imported)`
            : publication.name,
      });
    }
  }

  const picklists = mapCatalog(
    'recipe_picklist_values',
    incoming.records.recipe_picklist_values,
    rowsFrom(existing, 'recipe_picklist_values'),
    idMappings.recipe_picklist_values,
    createId,
  );
  const mappedId = (table: ExportTableName, value: unknown, label: string) => {
    if (typeof value !== 'string') return value;
    const mapped = idMappings[table].get(value);
    if (!mapped) throw new Error(`The import plan cannot resolve a ${label} reference.`);
    return mapped;
  };

  const recipeMatches = findImportMatches(
    incoming,
    {
      recipes: rowsFrom(existing, 'recipes'),
      publications: rowsFrom(existing, 'publications'),
    },
    sourcePublicationResolutions,
  ).filter((match) => match.kind === 'recipe');
  const importedRecipes: ExportRecord[] = [];
  for (const recipe of incoming.records.recipes) {
    const sourceId = String(recipe.id);
    if (omittedRecipeIds.has(sourceId)) continue;
    const match = recipeMatches.find((item) => item.incomingId === sourceId);
    const publicationChoice =
      choices[conflictKey('publication', String(recipe.publication_id ?? ''))];
    let recipeChoices = choices;
    if (scope.type === 'publication' && publicationChoice?.action === 'replace' && match) {
      if (match.existingIds.length !== 1) {
        throw new Error(
          'A matching recipe is ambiguous. Keep the publication and choose recipes individually.',
        );
      }
      recipeChoices = {
        ...choices,
        [conflictKey('recipe', sourceId)]: {
          action: 'replace',
          targetId: match.existingIds[0],
        },
      };
    }
    const result = mapRoot(
      'recipe',
      recipe,
      match?.existingIds ?? [],
      recipeChoices,
      idMappings.recipes,
      createId,
      replaceRecipeIds,
      keptRecipeIds,
    );
    if (result.action !== 'keep') {
      const selectedPublicationId = destinationPublicationIds[sourceId];
      const targetRecipe =
        result.action === 'replace'
          ? rowsFrom(existing, 'recipes').find((item) => item.id === result.id)
          : undefined;
      let publicationId =
        targetRecipe && typeof targetRecipe.publication_id === 'string'
          ? targetRecipe.publication_id
          : (sourcePublicationResolutions.get(String(recipe.publication_id ?? '')) ?? null);
      if (
        omittedPublicationIds.has(String(recipe.publication_id ?? '')) &&
        !selectedPublicationId
      ) {
        throw new Error('Choose a destination publication for every imported recipe.');
      }
      if (result.action !== 'replace' && selectedPublicationId) {
        const selectedPublication = rowsFrom(existing, 'publications').find(
          (item) => item.id === selectedPublicationId && item.trashed_at == null,
        );
        if (!selectedPublication) {
          throw new Error('Choose a current active destination publication.');
        }
        publicationId = selectedPublicationId;
      }
      importedRecipes.push({
        ...recipe,
        id: result.id,
        name: result.action === 'duplicate' ? `${String(recipe.name)} (Imported)` : recipe.name,
        publication_id: publicationId,
        food_type_id: mappedId('recipe_picklist_values', recipe.food_type_id, 'food type'),
        verdict_id: mappedId('recipe_picklist_values', recipe.verdict_id, 'verdict'),
        enthusiasm_id: mappedId('recipe_picklist_values', recipe.enthusiasm_id, 'enthusiasm'),
        is_private: recipe.is_private !== false,
      });
    }
  }

  const ingredients = mapCatalog(
    'ingredients',
    incoming.records.ingredients,
    rowsFrom(existing, 'ingredients'),
    idMappings.ingredients,
    createId,
  );
  const tags = mapCatalog(
    'tags',
    incoming.records.tags,
    rowsFrom(existing, 'tags'),
    idMappings.tags,
    createId,
  );
  const reusedCatalogRecords = [...ingredients.reused, ...picklists.reused, ...tags.reused];
  const reusedDensities = new Set(
    rowsFrom(existing, 'ingredient_densities')
      .map((record) => record.ingredient_id)
      .filter((id): id is string => typeof id === 'string'),
  );
  const reusedDensityIngredientIds: string[] = [];

  for (const table of exportTableNames) {
    if (
      table === 'recipes' ||
      table === 'publications' ||
      table === 'ingredients' ||
      table === 'recipe_picklist_values' ||
      table === 'tags' ||
      table === 'explorer_state' ||
      table === 'ingredient_densities' ||
      table === 'media_assets'
    ) {
      continue;
    }
    for (const record of incoming.records[table]) {
      if (typeof record.id === 'string') {
        idMappings[table].set(record.id, createId());
      }
    }
  }

  const mapRecipeLink = (value: unknown, displayText: unknown) => {
    if (typeof value !== 'string') return null;
    const mapped = idMappings.recipes.get(value);
    if (mapped) return mapped;
    if (typeof displayText !== 'string') return null;
    const candidates = rowsFrom(existing, 'recipes').filter(
      (record) =>
        record.trashed_at == null &&
        normalizeImportName(String(record.name ?? '')) === normalizeImportName(displayText),
    );
    return candidates.length === 1 ? (candidates[0].id ?? null) : null;
  };
  const mapExplorerPublicationId = (value: unknown) => {
    if (typeof value === 'string') {
      return idMappings.publications.get(value) ?? value;
    }
    if (Array.isArray(value)) {
      return value.map((item) =>
        typeof item === 'string' ? (idMappings.publications.get(item) ?? item) : item,
      );
    }
    return value;
  };
  const recipeIncluded = (recipeId: unknown) =>
    typeof recipeId !== 'string' ||
    (!keptRecipeIds.has(recipeId) && !omittedRecipeIds.has(recipeId));
  const recipeOwned = (record: ExportRecord) => recipeIncluded(record.recipe_id);

  const records = Object.fromEntries(
    exportTableNames.map((table) => [table, []]),
  ) as unknown as PortableData['records'];
  records.publications = importedPublications;
  records.recipes = importedRecipes;
  records.ingredients = ingredients.imported;
  records.recipe_picklist_values = picklists.imported;
  records.tags = tags.imported;
  records.explorer_state = incoming.records.explorer_state.flatMap((record) => {
    const contextKey = record.context_key;
    const contextMatch =
      typeof contextKey === 'string'
        ? /^publication-recipes:([0-9a-f-]{36})$/i.exec(contextKey)
        : null;
    if (contextMatch && !idMappings.publications.has(contextMatch[1])) return [];
    const state = record.state;
    const mappedState =
      state !== null && typeof state === 'object' && !Array.isArray(state)
        ? {
            ...(state as Record<string, unknown>),
            filters: Array.isArray((state as Record<string, unknown>).filters)
              ? ((state as Record<string, unknown>).filters as unknown[]).map((filter) => {
                  if (filter === null || typeof filter !== 'object' || Array.isArray(filter)) {
                    return filter;
                  }
                  const filterRecord = filter as Record<string, unknown>;
                  return filterRecord.field === 'publication_id'
                    ? {
                        ...filterRecord,
                        value: mapExplorerPublicationId(filterRecord.value),
                        value_to: mapExplorerPublicationId(filterRecord.value_to),
                      }
                    : filterRecord;
                })
              : (state as Record<string, unknown>).filters,
          }
        : state;
    return [
      {
        ...record,
        context_key: contextMatch
          ? `publication-recipes:${mappedId('publications', contextMatch[1], 'publication')}`
          : contextKey,
        state: mappedState,
      },
    ];
  });
  records.ingredient_densities = incoming.records.ingredient_densities.flatMap((record) => {
    const ingredientId = mappedId('ingredients', record.ingredient_id, 'ingredient');
    if (typeof ingredientId === 'string' && reusedDensities.has(ingredientId)) {
      reusedDensityIngredientIds.push(ingredientId);
      return [];
    }
    return [{ ...record, ingredient_id: ingredientId }];
  });
  records.recipe_picklist_assignments = incoming.records.recipe_picklist_assignments
    .filter((record) => recipeIncluded(record.recipe_id))
    .map((record) => ({
      ...record,
      recipe_id: mappedId('recipes', record.recipe_id, 'recipe'),
      picklist_value_id: mappedId('recipe_picklist_values', record.picklist_value_id, 'picklist'),
    }));
  records.recipe_ingredient_sets = incoming.records.recipe_ingredient_sets
    .filter((record) => recipeIncluded(record.recipe_id))
    .map((record) => ({
      ...record,
      id: mappedId('recipe_ingredient_sets', record.id, 'ingredient set'),
      recipe_id: mappedId('recipes', record.recipe_id, 'recipe'),
    }));
  records.recipe_ingredients = incoming.records.recipe_ingredients
    .filter(recipeOwned)
    .map((record) => ({
      ...record,
      id: mappedId('recipe_ingredients', record.id, 'recipe ingredient'),
      recipe_id: mappedId('recipes', record.recipe_id, 'recipe'),
      ingredient_id: mappedId('ingredients', record.ingredient_id, 'ingredient'),
      ingredient_set_id: mappedId(
        'recipe_ingredient_sets',
        record.ingredient_set_id,
        'ingredient set',
      ),
    }));
  records.recipe_ingredient_measurements = incoming.records.recipe_ingredient_measurements
    .filter((record) => {
      const sourceIngredient = incoming.records.recipe_ingredients.find(
        (ingredient) => ingredient.id === record.recipe_ingredient_id,
      );
      return sourceIngredient !== undefined && recipeOwned(sourceIngredient);
    })
    .map((record) => ({
      ...record,
      id: mappedId('recipe_ingredient_measurements', record.id, 'measurement'),
      recipe_ingredient_id: mappedId(
        'recipe_ingredients',
        record.recipe_ingredient_id,
        'recipe ingredient',
      ),
      picklist_value_id:
        record.picklist_value_id === null
          ? null
          : mappedId('recipe_picklist_values', record.picklist_value_id, 'picklist'),
    }));
  records.recipe_steps = incoming.records.recipe_steps.filter(recipeOwned).map((record) => {
    if (typeof record.content_markdown !== 'string') {
      throw new Error('The import plan cannot resolve recipe step content.');
    }
    return {
      ...record,
      id: mappedId('recipe_steps', record.id, 'recipe step'),
      recipe_id: mappedId('recipes', record.recipe_id, 'recipe'),
      content_markdown: record.content_markdown.replace(
        /\[\[ingredient:([0-9a-f-]{36})(?::([12]))?(\|[^\]\r\n]+\]\])/gi,
        (_marker: string, sourceId: string, portionOrdinal: string | undefined, suffix: string) =>
          `[[ingredient:${mappedId('recipe_ingredients', sourceId, 'recipe ingredient')}${portionOrdinal ? `:${portionOrdinal}` : ''}${suffix}`,
      ),
    };
  });
  records.recipe_step_mentions = incoming.records.recipe_step_mentions
    .filter(recipeOwned)
    .map((record) => ({
      ...record,
      id: mappedId('recipe_step_mentions', record.id, 'recipe mention'),
      recipe_id: mappedId('recipes', record.recipe_id, 'recipe'),
      recipe_step_id: mappedId('recipe_steps', record.recipe_step_id, 'recipe step'),
      recipe_ingredient_id: mappedId(
        'recipe_ingredients',
        record.recipe_ingredient_id,
        'recipe ingredient',
      ),
    }));
  records.recipe_site_listings = [];
  records.recipe_pairings = incoming.records.recipe_pairings
    .filter((record) => recipeIncluded(record.source_recipe_id))
    .map((record) => ({
      ...record,
      id: mappedId('recipe_pairings', record.id, 'recipe pairing'),
      source_recipe_id: mappedId('recipes', record.source_recipe_id, 'recipe'),
      linked_recipe_id: mapRecipeLink(record.linked_recipe_id, record.display_text),
    }));
  records.recipe_references = incoming.records.recipe_references
    .filter(recipeOwned)
    .map((record) => ({
      ...record,
      id: mappedId('recipe_references', record.id, 'recipe reference'),
      recipe_id: mappedId('recipes', record.recipe_id, 'recipe'),
      publication_id:
        record.publication_id === null
          ? null
          : (idMappings.publications.get(String(record.publication_id)) ?? null),
      linked_recipe_id:
        record.linked_recipe_id === null
          ? null
          : mapRecipeLink(record.linked_recipe_id, record.display_text),
    }));
  const nextReferencePosition = new Map<string, number>();
  for (const reference of records.recipe_references) {
    const recipeId = String(reference.recipe_id);
    const position = Number(reference.position);
    nextReferencePosition.set(
      recipeId,
      Math.max(nextReferencePosition.get(recipeId) ?? -1, position),
    );
  }
  for (const listing of incoming.records.recipe_site_listings.filter(recipeOwned)) {
    const recipeId = String(mappedId('recipes', listing.recipe_id, 'recipe'));
    const position = (nextReferencePosition.get(recipeId) ?? -1) + 1;
    records.recipe_references.push({
      id: createId(),
      recipe_id: recipeId,
      reference_type: 'external_url',
      publication_id: null,
      display_text: listing.recipe_url,
      url: listing.recipe_url,
      position,
      linked_recipe_id: null,
    });
    nextReferencePosition.set(recipeId, position);
  }
  records.recipe_tags = incoming.records.recipe_tags
    .filter((record) => recipeIncluded(record.recipe_id))
    .map((record) => ({
      ...record,
      recipe_id: mappedId('recipes', record.recipe_id, 'recipe'),
      tag_id: mappedId('tags', record.tag_id, 'tag'),
    }));
  records.publication_tags = incoming.records.publication_tags
    .filter((record) => !keptPublicationIds.has(String(record.publication_id)))
    .map((record) => ({
      ...record,
      publication_id: mappedId('publications', record.publication_id, 'publication'),
      tag_id: mappedId('tags', record.tag_id, 'tag'),
    }));
  records.media_assets = incoming.records.media_assets.flatMap((record) => {
    if (
      (record.recipe_id && !recipeIncluded(record.recipe_id)) ||
      (record.publication_id && keptPublicationIds.has(String(record.publication_id)))
    ) {
      return [];
    }
    const id = createId();
    idMappings.media_assets.set(String(record.id), id);
    return [
      {
        ...record,
        id,
        recipe_id:
          record.recipe_id === null ? null : mappedId('recipes', record.recipe_id, 'recipe'),
        publication_id:
          record.publication_id === null
            ? null
            : mappedId('publications', record.publication_id, 'publication'),
      },
    ];
  });
  records.recipe_steps = records.recipe_steps.map((record) => {
    if (typeof record.content_markdown !== 'string') {
      throw new Error('The import plan cannot resolve recipe step content.');
    }
    const markerCount = [...record.content_markdown.matchAll(/\[\[photo:/giu)].length;
    const photoPattern = /\[\[photo:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\]\]/giu;
    const references = [...record.content_markdown.matchAll(photoPattern)];
    if (markerCount !== references.length) {
      throw new Error('The import plan contains an invalid photo reference.');
    }
    return {
      ...record,
      content_markdown: record.content_markdown.replace(
        photoPattern,
        (_marker: string, sourceId: string) =>
          `[[photo:${mappedId('media_assets', sourceId, 'photo asset')}]]`,
      ),
    };
  });

  return {
    records,
    replaceRecipeIds,
    replacePublicationIds,
    reusedCatalogRecords,
    reusedDensityIngredientIds,
    idMappings,
  };
}

export function planDatabaseImport(
  incoming: PortableData,
  existing: ExistingRecords,
  choices: ImportChoices,
  createId: () => string = randomUUID,
): ImportPlan {
  if (incoming.scope.type !== 'database') {
    throw new Error('Only database exports can be planned here.');
  }
  return planImport(incoming, existing, choices, createId);
}
