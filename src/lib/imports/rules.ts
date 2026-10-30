import { createHash, randomUUID } from 'node:crypto';
import {
  type BundleManifest,
  EXPORT_DATA_BYTES_LIMIT,
  EXPORT_MEDIA_BYTES_LIMIT,
  EXPORT_SCHEMA_VERSION,
  type ExportRecord,
  type ExportScope,
  type ExportTableName,
  exportTableNames,
  type PortableData,
  parseExportScope,
  portableRecordFields,
} from '../exports/rules';
import { isValidNormalizedCrop } from '../media/rules';
import { validateIngredientSetLabels } from '../recipes/ingredient-set-rules';
import { instructionEmphasisOptions } from '../recipes/instruction-emphasis';
import { isRecipeScore } from '../recipes/recipe-rules';

const imagePathPattern =
  /^images\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(full|thumbnail|source-full|source-thumbnail)\.webp$/i;
const requiredManifestKeys = [
  'format',
  'schema_version',
  'created_at',
  'app_version',
  'scope',
  'files',
];
const requiredDataKeys = ['format', 'schema_version', 'scope', 'account_preferences', 'records'];
const preferenceFields = new Set([
  'volume_system',
  'weight_system',
  'temperature_system',
  'ingredient_presentation',
  'hand_preference',
  'ingredient_color',
  'temperature_color',
  'duration_color',
  'private_print_uses_colors',
  'include_instruction_photos_in_private_print',
  'repeat_ingredients_in_private_print',
  'include_private_details_in_private_print',
  'recipe_column_order',
  'recipe_hidden_columns',
]);

export type ValidatedImportBundle = {
  manifest: BundleManifest;
  data: PortableData;
  images: Map<string, ImportImageMetadata>;
};

export type ImportImageMetadata = { size_bytes: number; sha256: string };

function asRecord(value: unknown, label: string): ExportRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as ExportRecord;
}

function assertExactKeys(value: ExportRecord, required: string[], label: string) {
  const keys = Object.keys(value).sort();
  const expected = [...required].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has missing or unsupported fields.`);
  }
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`${label} is not valid UTF-8 JSON.`);
  }
}

function readScope(value: unknown, label: string): ExportScope {
  const scope = parseExportScope(value);
  if (!scope) {
    throw new Error(`${label} contains an invalid scope.`);
  }
  return scope;
}

function sameScope(left: ExportScope, right: ExportScope) {
  return (
    left.type === right.type &&
    ('id' in left ? left.id === ('id' in right ? right.id : '') : !('id' in right))
  );
}

function validateIngredientPortionFields(records: PortableData['records']) {
  const ingredientByRowId = new Map<string, ExportRecord>();
  const uniqueIngredientRows = new Set<string>();
  for (const ingredient of records.recipe_ingredients) {
    const rowId = String(ingredient.id);
    ingredientByRowId.set(rowId, ingredient);
    const ratio = ingredient.portion_one_ratio;
    if (
      ratio !== null &&
      ratio !== undefined &&
      (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0 || ratio >= 1)
    ) {
      throw new Error('The bundle contains an invalid ingredient portion ratio.');
    }

    const sizeValue = ingredient.size_value;
    const sizeUnit = ingredient.size_unit;
    if (
      (sizeValue == null) !== (sizeUnit == null) ||
      (sizeValue != null &&
        (typeof sizeValue !== 'number' ||
          !Number.isFinite(sizeValue) ||
          sizeValue <= 0 ||
          !['in', 'cm'].includes(String(sizeUnit)) ||
          String(ingredient.preparation ?? '')
            .trim()
            .toLocaleLowerCase() !== 'cubed'))
    ) {
      throw new Error('The bundle contains an invalid ingredient Size value.');
    }

    const uniqueKey = `${String(ingredient.ingredient_set_id)}\u0000${String(ingredient.ingredient_id)}`;
    if (uniqueIngredientRows.has(uniqueKey)) {
      throw new Error('The bundle repeats an ingredient within the same section.');
    }
    uniqueIngredientRows.add(uniqueKey);
  }

  for (const mention of records.recipe_step_mentions) {
    const ordinal = mention.portion_ordinal;
    if (ordinal != null && ordinal !== 1 && ordinal !== 2) {
      throw new Error('The bundle contains an invalid ingredient portion reference.');
    }
    if (ordinal != null) {
      const ingredient = ingredientByRowId.get(String(mention.recipe_ingredient_id));
      if (ingredient?.portion_one_ratio == null) {
        throw new Error('The bundle portion reference targets an ingredient that is not divided.');
      }
    }
  }
}

function validateData(
  value: unknown,
  manifestScope: ExportScope,
  schemaVersion: number,
): PortableData {
  const data = asRecord(value, 'The bundle data');
  assertExactKeys(data, requiredDataKeys, 'The bundle data');
  if (
    data.format !== 'recipe-box-data' ||
    data.schema_version !== schemaVersion ||
    !Number.isInteger(schemaVersion) ||
    schemaVersion < 1 ||
    schemaVersion > EXPORT_SCHEMA_VERSION
  ) {
    throw new Error('The bundle data format or schema version is not supported.');
  }

  const scope = readScope(data.scope, 'The bundle data');
  if (!sameScope(scope, manifestScope)) {
    throw new Error('The bundle manifest and data scopes do not match.');
  }

  const preferences = { ...asRecord(data.account_preferences, 'Account preferences') };
  const legacyColumnOrder = preferences.recipe_column_order;
  if (
    schemaVersion < 6 &&
    Array.isArray(legacyColumnOrder) &&
    legacyColumnOrder.every((column): column is string => typeof column === 'string')
  ) {
    preferences.recipe_column_order = [
      ...legacyColumnOrder,
      ...(['score', 'starred', 'hearted'] as const).filter(
        (column) => !legacyColumnOrder.includes(column),
      ),
    ];
  }
  const instructionColors = new Set<string>(
    instructionEmphasisOptions.map((option) => option.value),
  );
  if (
    Object.keys(preferences).some((field) => !preferenceFields.has(field)) ||
    (scope.type !== 'database' && Object.keys(preferences).length > 0) ||
    ['ingredient_color', 'temperature_color', 'duration_color'].some(
      (field) =>
        preferences[field] !== undefined && !instructionColors.has(String(preferences[field])),
    ) ||
    (preferences.temperature_system !== undefined &&
      !['fahrenheit', 'celsius'].includes(String(preferences.temperature_system))) ||
    (preferences.private_print_uses_colors !== undefined &&
      typeof preferences.private_print_uses_colors !== 'boolean') ||
    (preferences.include_instruction_photos_in_private_print !== undefined &&
      typeof preferences.include_instruction_photos_in_private_print !== 'boolean') ||
    (preferences.repeat_ingredients_in_private_print !== undefined &&
      typeof preferences.repeat_ingredients_in_private_print !== 'boolean') ||
    (preferences.include_private_details_in_private_print !== undefined &&
      typeof preferences.include_private_details_in_private_print !== 'boolean')
  ) {
    throw new Error('The bundle contains unsupported account preference fields.');
  }

  const records = asRecord(data.records, 'The bundle records');
  const inputTables =
    schemaVersion === 1
      ? exportTableNames.filter((table) => table !== 'recipe_ingredient_sets')
      : exportTableNames;
  assertExactKeys(records, [...inputTables], 'The bundle records');
  for (const table of inputTables) {
    if (!Array.isArray(records[table])) {
      throw new Error(`The ${table} records must be an array.`);
    }
    const allowedFields = new Set(
      table === 'recipes' && schemaVersion < 6
        ? portableRecordFields[table].filter(
            (field) => !['score', 'is_starred', 'is_hearted'].includes(field),
          )
        : table === 'recipe_ingredients' && schemaVersion < 3
          ? portableRecordFields[table].filter(
              (field) =>
                field !== 'portion_one_ratio' && field !== 'size_value' && field !== 'size_unit',
            )
          : table === 'recipe_step_mentions' && schemaVersion < 3
            ? portableRecordFields[table].filter((field) => field !== 'portion_ordinal')
            : table === 'media_assets'
              ? portableRecordFields[table].filter(
                  (field) =>
                    (schemaVersion >= 4 || field !== 'crop') &&
                    (schemaVersion >= 7 ||
                      !['source_full_path', 'source_thumbnail_path', 'source_byte_size'].includes(
                        field,
                      )),
                )
              : portableRecordFields[table],
    );
    for (const [index, item] of (records[table] as unknown[]).entries()) {
      const record = asRecord(item, `The ${table} record at index ${index}`);
      if (Object.keys(record).some((field) => !allowedFields.has(field))) {
        throw new Error(`The ${table} record contains an unsupported field.`);
      }
    }
  }

  const recipes = records.recipes as ExportRecord[];
  if (schemaVersion < 6) {
    records.recipes = recipes.map((recipe) => ({
      ...recipe,
      score: null,
      is_starred: false,
      is_hearted: false,
    }));
  } else {
    for (const recipe of recipes) {
      if (
        !Object.hasOwn(recipe, 'score') ||
        !Object.hasOwn(recipe, 'is_starred') ||
        !Object.hasOwn(recipe, 'is_hearted') ||
        (recipe.score !== null &&
          (typeof recipe.score !== 'number' ||
            !Number.isInteger(recipe.score) ||
            !isRecipeScore(recipe.score))) ||
        typeof recipe.is_starred !== 'boolean' ||
        typeof recipe.is_hearted !== 'boolean' ||
        (recipe.score !== null && recipe.state !== 'tried')
      ) {
        throw new Error('The bundle contains invalid recipe score or marker data.');
      }
    }
  }

  validateIngredientPortionFields(records as unknown as PortableData['records']);

  if (schemaVersion === 1) {
    const setsByRecipe = new Map<string, ExportRecord>();
    records.recipe_ingredient_sets = (records.recipes as ExportRecord[]).map((recipe) => {
      const set = {
        id: randomUUID(),
        recipe_id: recipe.id,
        label: 'Main',
        position: 0,
      };
      setsByRecipe.set(String(recipe.id), set);
      return set;
    });
    records.recipe_ingredients = (records.recipe_ingredients as ExportRecord[]).map((row) => ({
      ...row,
      ingredient_set_id: setsByRecipe.get(String(row.recipe_id))?.id,
    }));
  }

  if (schemaVersion < 3) {
    records.recipe_ingredients = (records.recipe_ingredients as ExportRecord[]).map((row) => ({
      ...row,
      portion_one_ratio: null,
      size_value: null,
      size_unit: null,
    }));
    records.recipe_step_mentions = (records.recipe_step_mentions as ExportRecord[]).map(
      (mention) => ({ ...mention, portion_ordinal: null }),
    );
  }

  records.media_assets = (records.media_assets as ExportRecord[]).map((asset) => {
    let crop: unknown = null;
    if (schemaVersion >= 4) {
      if (!Object.hasOwn(asset, 'crop')) {
        throw new Error('A media asset is missing its crop framing.');
      }
      if (asset.crop !== null) {
        const cropRecord = asRecord(asset.crop, 'A media asset crop');
        assertExactKeys(
          cropRecord,
          schemaVersion >= 5
            ? ['left', 'top', 'width', 'height', 'rotation']
            : ['left', 'top', 'width', 'height'],
          'A media asset crop',
        );
        crop = schemaVersion >= 5 ? cropRecord : { ...cropRecord, rotation: 0 };
        if (!isValidNormalizedCrop(crop)) {
          throw new Error('The bundle contains invalid media crop framing.');
        }
      }
    }

    const sourceFields =
      schemaVersion < 7
        ? {
            source_full_path: asset.full_path,
            source_thumbnail_path: asset.thumbnail_path,
            source_byte_size: asset.byte_size,
          }
        : {
            source_full_path: asset.source_full_path,
            source_thumbnail_path: asset.source_thumbnail_path,
            source_byte_size: asset.source_byte_size,
          };
    if (
      schemaVersion >= 7 &&
      (!Object.hasOwn(asset, 'source_full_path') ||
        !Object.hasOwn(asset, 'source_thumbnail_path') ||
        !Object.hasOwn(asset, 'source_byte_size') ||
        typeof sourceFields.source_full_path !== 'string' ||
        typeof sourceFields.source_thumbnail_path !== 'string' ||
        !Number.isSafeInteger(sourceFields.source_byte_size) ||
        Number(sourceFields.source_byte_size) < 1)
    ) {
      throw new Error('A media asset is missing its retained source image metadata.');
    }
    return { ...asset, crop, ...sourceFields };
  });

  const setsByRecipe = new Map<string, ExportRecord[]>();
  for (const set of records.recipe_ingredient_sets as ExportRecord[]) {
    const recipeId = String(set.recipe_id);
    const recipeSets = setsByRecipe.get(recipeId) ?? [];
    recipeSets.push(set);
    setsByRecipe.set(recipeId, recipeSets);
  }
  for (const recipeSets of setsByRecipe.values()) {
    if (
      validateIngredientSetLabels(
        recipeSets.map((set) => ({
          id: String(set.id),
          label: String(set.label ?? ''),
          position: Number(set.position),
        })),
      )
    ) {
      throw new Error('The bundle contains invalid ingredient set labels.');
    }
  }

  if (scope.type === 'database') {
    validateDatabaseReferences(records as unknown as PortableData['records']);
  } else {
    validateScopedReferences(scope, records as unknown as PortableData['records']);
  }

  if (
    scope.type === 'recipe' &&
    !(records.recipes as ExportRecord[]).some((row) => row.id === scope.id)
  ) {
    throw new Error('The selected recipe is missing from the bundle.');
  }
  if (
    scope.type === 'publication' &&
    !(records.publications as ExportRecord[]).some((row) => row.id === scope.id)
  ) {
    throw new Error('The selected publication is missing from the bundle.');
  }

  data.account_preferences = preferences;
  return data as unknown as PortableData;
}

function validateScopedReferences(
  scope: Exclude<ExportScope, { type: 'database' }>,
  records: PortableData['records'],
) {
  const recipeIds = new Set(
    records.recipes.map((record) => record.id).filter((id): id is string => typeof id === 'string'),
  );
  const publicationIds = new Set(
    records.publications
      .map((record) => record.id)
      .filter((id): id is string => typeof id === 'string'),
  );

  if (scope.type === 'recipe') {
    const recipe = records.recipes[0];
    if (records.recipes.length !== 1 || recipe?.id !== scope.id || recipe.trashed_at != null) {
      throw new Error('A recipe bundle must contain only its selected active recipe.');
    }
    if (
      (typeof recipe.publication_id === 'string' &&
        (records.publications.length !== 1 || !publicationIds.has(recipe.publication_id))) ||
      (recipe.publication_id == null && records.publications.length > 0)
    ) {
      throw new Error('A recipe bundle contains invalid primary publication metadata.');
    }
    if (records.publication_tags.length > 0) {
      throw new Error('A recipe bundle cannot contain publication tag assignments.');
    }
  } else if (
    records.publications.length !== 1 ||
    records.publications[0].id !== scope.id ||
    records.publications[0].trashed_at != null ||
    records.recipes.some(
      (recipe) => recipe.publication_id !== scope.id || recipe.trashed_at != null,
    )
  ) {
    throw new Error(
      'A publication bundle must contain only its selected active publication graph.',
    );
  }

  if (records.explorer_state.length > 0) {
    throw new Error('A scoped bundle cannot contain account explorer state.');
  }
  for (const listing of records.recipe_site_listings) {
    if (!recipeIds.has(String(listing.recipe_id))) {
      throw new Error('A Site listing must belong to a recipe in the scoped bundle.');
    }
    let url: URL;
    try {
      url = new URL(String(listing.recipe_url));
    } catch {
      throw new Error('A Site listing must contain an absolute HTTP(S) URL.');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('A Site listing must contain an absolute HTTP(S) URL.');
    }
  }

  validateDatabaseReferences({
    ...records,
    recipe_pairings: records.recipe_pairings.map((pairing) => ({
      ...pairing,
      linked_recipe_id:
        typeof pairing.linked_recipe_id === 'string' && recipeIds.has(pairing.linked_recipe_id)
          ? pairing.linked_recipe_id
          : null,
    })),
    recipe_references: records.recipe_references.map((reference) => ({
      ...reference,
      publication_id:
        typeof reference.publication_id === 'string' && publicationIds.has(reference.publication_id)
          ? reference.publication_id
          : null,
      linked_recipe_id:
        typeof reference.linked_recipe_id === 'string' && recipeIds.has(reference.linked_recipe_id)
          ? reference.linked_recipe_id
          : null,
    })),
    recipe_site_listings: [],
  });
}

function validateDatabaseReferences(records: PortableData['records']) {
  const ids = new Map<ExportTableName, Set<string>>();
  for (const table of exportTableNames) {
    const tableIds = new Set<string>();
    for (const [index, value] of records[table].entries()) {
      const record = asRecord(value, `The ${table} record at index ${index}`);
      const id = table === 'ingredient_densities' ? record.ingredient_id : record.id;
      if (typeof id === 'string') {
        if (tableIds.has(id)) {
          throw new Error(`The ${table} records contain a duplicate identifier.`);
        }
        tableIds.add(id);
      }
    }
    ids.set(table, tableIds);
  }

  const requireReference = (table: ExportTableName, value: unknown, label: string) => {
    if (typeof value !== 'string' || !ids.get(table)?.has(value)) {
      throw new Error(`The bundle contains an unresolved ${label} reference.`);
    }
  };
  const optionalReference = (table: ExportTableName, value: unknown, label: string) => {
    if (value !== null && value !== undefined) {
      requireReference(table, value, label);
    }
  };

  for (const recipe of records.recipes) {
    optionalReference('recipe_picklist_values', recipe.food_type_id, 'food type');
    optionalReference('recipe_picklist_values', recipe.verdict_id, 'verdict');
    optionalReference('recipe_picklist_values', recipe.enthusiasm_id, 'enthusiasm');
    optionalReference('publications', recipe.publication_id, 'publication');
  }
  for (const assignment of records.recipe_picklist_assignments) {
    requireReference('recipes', assignment.recipe_id, 'recipe');
    requireReference('recipe_picklist_values', assignment.picklist_value_id, 'picklist value');
  }
  const ingredientSetOwners = new Map<string, string>();
  for (const set of records.recipe_ingredient_sets) {
    requireReference('recipes', set.recipe_id, 'ingredient set recipe');
    if (typeof set.id === 'string' && typeof set.recipe_id === 'string') {
      ingredientSetOwners.set(set.id, set.recipe_id);
    }
  }
  for (const ingredient of records.recipe_ingredients) {
    requireReference('recipes', ingredient.recipe_id, 'recipe');
    requireReference('ingredients', ingredient.ingredient_id, 'ingredient');
    requireReference('recipe_ingredient_sets', ingredient.ingredient_set_id, 'ingredient set');
    if (
      typeof ingredient.recipe_id !== 'string' ||
      ingredientSetOwners.get(String(ingredient.ingredient_set_id)) !== ingredient.recipe_id
    ) {
      throw new Error('The bundle contains an ingredient set owned by a different recipe.');
    }
  }
  for (const measurement of records.recipe_ingredient_measurements) {
    requireReference('recipe_ingredients', measurement.recipe_ingredient_id, 'recipe ingredient');
    optionalReference('recipe_picklist_values', measurement.picklist_value_id, 'picklist value');
  }
  for (const step of records.recipe_steps) {
    requireReference('recipes', step.recipe_id, 'recipe');
  }
  for (const mention of records.recipe_step_mentions) {
    requireReference('recipes', mention.recipe_id, 'recipe');
    requireReference('recipe_steps', mention.recipe_step_id, 'recipe step');
    requireReference('recipe_ingredients', mention.recipe_ingredient_id, 'recipe ingredient');
  }
  for (const listing of records.recipe_site_listings) {
    requireReference('recipes', listing.recipe_id, 'recipe');
    requireReference('publications', listing.site_publication_id, 'site publication');
  }
  for (const pairing of records.recipe_pairings) {
    requireReference('recipes', pairing.source_recipe_id, 'source recipe');
    optionalReference('recipes', pairing.linked_recipe_id, 'linked recipe');
  }
  for (const reference of records.recipe_references) {
    requireReference('recipes', reference.recipe_id, 'recipe');
    optionalReference('publications', reference.publication_id, 'publication');
    optionalReference('recipes', reference.linked_recipe_id, 'linked recipe');
  }
  for (const density of records.ingredient_densities) {
    requireReference('ingredients', density.ingredient_id, 'ingredient');
  }
  for (const assignment of records.recipe_tags) {
    requireReference('recipes', assignment.recipe_id, 'recipe');
    requireReference('tags', assignment.tag_id, 'tag');
  }
  for (const assignment of records.publication_tags) {
    requireReference('publications', assignment.publication_id, 'publication');
    requireReference('tags', assignment.tag_id, 'tag');
  }
  for (const asset of records.media_assets) {
    if (asset.asset_type === 'recipe_photo') {
      requireReference('recipes', asset.recipe_id, 'media recipe');
    } else if (asset.asset_type === 'publication_cover') {
      requireReference('publications', asset.publication_id, 'media publication');
    } else {
      throw new Error('The bundle contains a media asset with an invalid parent type.');
    }
  }
}

export function validateImportBundleFiles(
  entries: ReadonlyMap<string, Uint8Array>,
  streamedImages: ReadonlyMap<string, ImportImageMetadata> = new Map(),
): ValidatedImportBundle {
  const manifestBytes = entries.get('manifest.json');
  const dataBytes = entries.get('data.json');
  if (!manifestBytes || !dataBytes) {
    throw new Error('The bundle is missing manifest.json or data.json.');
  }
  if (dataBytes.byteLength > EXPORT_DATA_BYTES_LIMIT) {
    throw new Error('The bundle data exceeds the supported size limit.');
  }

  const manifest = asRecord(parseJson(manifestBytes, 'The bundle manifest'), 'The bundle manifest');
  assertExactKeys(manifest, requiredManifestKeys, 'The bundle manifest');
  if (
    manifest.format !== 'recipe-box-bundle' ||
    !Number.isInteger(manifest.schema_version) ||
    (manifest.schema_version as number) < 1 ||
    (manifest.schema_version as number) > EXPORT_SCHEMA_VERSION ||
    typeof manifest.created_at !== 'string' ||
    !Number.isFinite(Date.parse(manifest.created_at)) ||
    typeof manifest.app_version !== 'string' ||
    !Array.isArray(manifest.files)
  ) {
    throw new Error('The bundle manifest format or schema version is not supported.');
  }

  const scope = readScope(manifest.scope, 'The bundle manifest');
  const listedPaths = new Set<string>();
  let mediaBytes = 0;
  const images = new Map<string, ImportImageMetadata>();
  for (const [index, listedFileValue] of manifest.files.entries()) {
    const listedFile = asRecord(listedFileValue, `Manifest file ${index}`);
    assertExactKeys(listedFile, ['path', 'size_bytes', 'sha256'], `Manifest file ${index}`);
    const path = listedFile.path;
    if (
      typeof path !== 'string' ||
      path === 'manifest.json' ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').some((part) => part === '' || part === '.' || part === '..') ||
      (path !== 'data.json' && !imagePathPattern.test(path)) ||
      listedPaths.has(path) ||
      !Number.isSafeInteger(listedFile.size_bytes) ||
      (listedFile.size_bytes as number) < 0 ||
      typeof listedFile.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(listedFile.sha256)
    ) {
      throw new Error('The bundle manifest contains an unsafe or duplicate file entry.');
    }
    listedPaths.add(path);
    const bytes = entries.get(path);
    const streamedImage = streamedImages.get(path);
    if (!bytes && !streamedImage) {
      throw new Error(`The bundle is missing ${path}.`);
    }
    const sizeBytes = bytes?.byteLength ?? streamedImage?.size_bytes;
    const digest = bytes ? createHash('sha256').update(bytes).digest('hex') : streamedImage?.sha256;
    if (sizeBytes !== listedFile.size_bytes) {
      throw new Error(`The bundle file size does not match for ${path}.`);
    }
    if (digest !== listedFile.sha256) {
      throw new Error(`The bundle checksum does not match for ${path}.`);
    }
    if (path !== 'data.json') {
      mediaBytes += sizeBytes ?? 0;
      if (mediaBytes > EXPORT_MEDIA_BYTES_LIMIT) {
        throw new Error('The bundle images exceed the supported media size limit.');
      }
      images.set(path, { size_bytes: sizeBytes ?? 0, sha256: digest ?? '' });
    }
  }

  if (!listedPaths.has('data.json')) {
    throw new Error('The bundle manifest does not list data.json.');
  }
  const archivePaths = new Set([...entries.keys(), ...streamedImages.keys()]);
  if ([...archivePaths].some((path) => path !== 'manifest.json' && !listedPaths.has(path))) {
    throw new Error('The archive contains a file not listed in the manifest.');
  }
  if (archivePaths.size !== listedPaths.size + 1) {
    throw new Error('The archive contains duplicate or unlisted files.');
  }

  const data = validateData(
    parseJson(dataBytes, 'The bundle data'),
    scope,
    manifest.schema_version as number,
  );

  const expectedImages = new Set<string>();
  const assetIds = new Set<string>();
  for (const value of data.records.media_assets) {
    const asset = asRecord(value, 'A media asset');
    if (
      typeof asset.id !== 'string' ||
      assetIds.has(asset.id) ||
      asset.status !== 'ready' ||
      asset.content_type !== 'image/webp'
    ) {
      throw new Error('The bundle contains an invalid or duplicate media asset.');
    }
    assetIds.add(asset.id);
    const fullPath = `images/${asset.id}/full.webp`;
    const thumbnailPath = `images/${asset.id}/thumbnail.webp`;
    const sourceFullPath = `images/${asset.id}/source-full.webp`;
    const sourceThumbnailPath = `images/${asset.id}/source-thumbnail.webp`;
    if (
      asset.full_path !== fullPath ||
      asset.thumbnail_path !== thumbnailPath ||
      ![fullPath, sourceFullPath].includes(String(asset.source_full_path)) ||
      ![thumbnailPath, sourceThumbnailPath].includes(String(asset.source_thumbnail_path))
    ) {
      throw new Error('A media asset has invalid image paths.');
    }
    const assetPaths = new Set([
      fullPath,
      thumbnailPath,
      String(asset.source_full_path),
      String(asset.source_thumbnail_path),
    ]);
    for (const path of assetPaths) {
      expectedImages.add(path);
    }
    const fullImage = images.get(fullPath);
    const thumbnailImage = images.get(thumbnailPath);
    const sourceBytes = new Set([
      String(asset.source_full_path),
      String(asset.source_thumbnail_path),
    ]);
    const sourceByteSize = [...sourceBytes].reduce(
      (total, path) => total + (images.get(path)?.size_bytes ?? 0),
      0,
    );
    const assetByteSize = [...assetPaths].reduce(
      (total, path) => total + (images.get(path)?.size_bytes ?? 0),
      0,
    );
    if (
      !fullImage ||
      !thumbnailImage ||
      asset.byte_size !== assetByteSize ||
      asset.source_byte_size !== sourceByteSize
    ) {
      throw new Error('A media asset is missing a required image variant or has an invalid size.');
    }
  }
  if (
    images.size !== expectedImages.size ||
    [...images.keys()].some((path) => !expectedImages.has(path))
  ) {
    throw new Error('The bundle contains an image without a matching media asset.');
  }

  return {
    manifest: manifest as unknown as BundleManifest,
    data,
    images,
  };
}

export type ImportMatch = {
  incomingId: string;
  existingIds: string[];
  kind: 'recipe' | 'publication';
};

export function normalizeImportName(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function findImportMatches(
  incoming: PortableData,
  existing: { recipes: ExportRecord[]; publications: ExportRecord[] },
  publicationResolutions: ReadonlyMap<string, string> = new Map(),
): ImportMatch[] {
  const publicationMatches = new Map<string, string[]>();
  const matches: ImportMatch[] = [];
  for (const publication of incoming.records.publications) {
    const candidates = existing.publications
      .filter(
        (item) =>
          item.trashed_at == null &&
          item.publication_type === publication.publication_type &&
          normalizeImportName(String(item.name ?? '')) ===
            normalizeImportName(String(publication.name ?? '')),
      )
      .map((item) => String(item.id));
    publicationMatches.set(String(publication.id), candidates);
    if (candidates.length > 0) {
      matches.push({
        incomingId: String(publication.id),
        existingIds: candidates,
        kind: 'publication',
      });
    }
  }

  const destinationTinIds = existing.publications
    .filter((item) => item.publication_type === 'collection' && item.trashed_at == null)
    .map((item) => String(item.id));
  for (const recipe of incoming.records.recipes) {
    if (incoming.scope.type === 'recipe') {
      const candidates = existing.recipes
        .filter(
          (item) =>
            item.trashed_at == null &&
            normalizeImportName(String(item.name ?? '')) ===
              normalizeImportName(String(recipe.name ?? '')),
        )
        .map((item) => String(item.id));
      if (candidates.length > 0) {
        matches.push({ incomingId: String(recipe.id), existingIds: candidates, kind: 'recipe' });
      }
      continue;
    }
    const sourcePublicationId = String(recipe.publication_id ?? '');
    const sourceCandidates = publicationMatches.get(sourcePublicationId);
    const resolvedPublicationId = publicationResolutions.get(sourcePublicationId);
    const resolvedPublicationIds = resolvedPublicationId
      ? [resolvedPublicationId]
      : sourceCandidates?.length === 1
        ? sourceCandidates
        : sourcePublicationId
          ? []
          : destinationTinIds.length === 1
            ? destinationTinIds
            : [];
    const candidates = existing.recipes
      .filter((item) => {
        if (
          item.trashed_at != null ||
          normalizeImportName(String(item.name ?? '')) !==
            normalizeImportName(String(recipe.name ?? ''))
        ) {
          return false;
        }
        const itemPublicationId = String(item.publication_id ?? '');
        return resolvedPublicationIds.includes(itemPublicationId);
      })
      .map((item) => String(item.id));
    if (candidates.length > 0) {
      matches.push({ incomingId: String(recipe.id), existingIds: candidates, kind: 'recipe' });
    }
  }

  return matches;
}

export function isImportTableName(value: string): value is ExportTableName {
  return (exportTableNames as readonly string[]).includes(value);
}
