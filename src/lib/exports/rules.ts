import { createHash } from 'node:crypto';

export const EXPORT_SCHEMA_VERSION = 5;
export const EXPORT_DATA_BYTES_LIMIT = 64 * 1024 * 1024;
export const EXPORT_MEDIA_BYTES_LIMIT = 1024 * 1024 * 1024;
export const DATABASE_EXPORT_REMINDER_DAYS = 30;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const imagePathPattern =
  /^images\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(full|thumbnail)\.webp$/i;
const preferenceFields = [
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
] as const;

export const exportTableNames = [
  'recipes',
  'publications',
  'recipe_picklist_values',
  'recipe_picklist_assignments',
  'ingredients',
  'recipe_ingredient_sets',
  'recipe_ingredients',
  'recipe_ingredient_measurements',
  'recipe_steps',
  'recipe_step_mentions',
  'recipe_site_listings',
  'recipe_pairings',
  'recipe_references',
  'ingredient_densities',
  'tags',
  'recipe_tags',
  'publication_tags',
  'explorer_state',
  'media_assets',
] as const;

export type ExportTableName = (typeof exportTableNames)[number];
export type ExportRecord = Record<string, unknown>;
export type ExportScope =
  | { type: 'database' }
  | { type: 'publication'; id: string }
  | { type: 'recipe'; id: string };

export type ExportSnapshot = {
  accountPreferences: ExportRecord;
  records: Partial<Record<ExportTableName, ExportRecord[]>>;
};

export type PortableData = {
  format: 'recipe-box-data';
  schema_version: number;
  scope: ExportScope;
  account_preferences: ExportRecord;
  records: Record<ExportTableName, ExportRecord[]>;
};

export type BundleManifestFile = {
  path: string;
  size_bytes: number;
  sha256: string;
};

export type BundleManifest = {
  format: 'recipe-box-bundle';
  schema_version: number;
  created_at: string;
  app_version: string;
  scope: ExportScope;
  files: BundleManifestFile[];
};

export function parseExportScope(input: unknown): ExportScope | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const payload = input as Record<string, unknown>;
  const keys = Object.keys(payload);
  if (payload.type === 'database' && keys.length === 1) {
    return { type: 'database' };
  }

  if (
    (payload.type === 'publication' || payload.type === 'recipe') &&
    typeof payload.id === 'string' &&
    uuidPattern.test(payload.id) &&
    keys.length === 2
  ) {
    return { type: payload.type, id: payload.id.toLowerCase() };
  }

  return null;
}

export function assertExportLimits(dataBytes: number, mediaBytes: number): void {
  if (!Number.isSafeInteger(dataBytes) || dataBytes < 0 || dataBytes > EXPORT_DATA_BYTES_LIMIT) {
    throw new Error('The normalized export data exceeds the supported size limit.');
  }
  if (
    !Number.isSafeInteger(mediaBytes) ||
    mediaBytes < 0 ||
    mediaBytes > EXPORT_MEDIA_BYTES_LIMIT
  ) {
    throw new Error('The selected image assets exceed the supported media export limit.');
  }
}

export function isDatabaseExportReminderDue(
  lastExportAt: string | null,
  now = new Date(),
): boolean {
  if (!lastExportAt) {
    return true;
  }
  const parsed = Date.parse(lastExportAt);
  if (!Number.isFinite(parsed)) {
    return true;
  }

  const elapsed = now.getTime() - parsed;
  return elapsed > DATABASE_EXPORT_REMINDER_DAYS * 24 * 60 * 60 * 1000;
}

export function buildBundleManifest(
  scope: ExportScope,
  files: Array<{ path: string; bytes: Uint8Array }>,
  appVersion: string,
  createdAt: Date,
): BundleManifest {
  return createBundleManifest(
    scope,
    files.map(({ path, bytes }) => ({
      path,
      size_bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })),
    appVersion,
    createdAt,
  );
}

export function createBundleManifest(
  scope: ExportScope,
  files: BundleManifestFile[],
  appVersion: string,
  createdAt: Date,
): BundleManifest {
  const filePaths = new Set<string>();
  for (const { path, size_bytes, sha256 } of files) {
    if (
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').some((part) => part === '.' || part === '..' || part === '') ||
      (path !== 'data.json' && !imagePathPattern.test(path)) ||
      path === 'manifest.json' ||
      filePaths.has(path) ||
      !Number.isSafeInteger(size_bytes) ||
      size_bytes < 0 ||
      !/^[0-9a-f]{64}$/.test(sha256)
    ) {
      throw new Error('The export contains an unsafe or duplicate file path.');
    }
    filePaths.add(path);
  }

  if (!filePaths.has('data.json')) {
    throw new Error('The export is missing data.json.');
  }

  return {
    format: 'recipe-box-bundle',
    schema_version: EXPORT_SCHEMA_VERSION,
    created_at: createdAt.toISOString(),
    app_version: appVersion,
    scope,
    files,
  };
}

function tableRows(snapshot: ExportSnapshot, table: ExportTableName): ExportRecord[] {
  return snapshot.records[table] ?? [];
}

function recordId(record: ExportRecord): string | null {
  return typeof record.id === 'string' ? record.id : null;
}

function relationId(record: ExportRecord, field: string): string | null {
  return typeof record[field] === 'string' ? (record[field] as string) : null;
}

export const portableRecordFields: Record<ExportTableName, readonly string[]> = {
  recipes: [
    'id',
    'name',
    'food_type_id',
    'state',
    'verdict_id',
    'enthusiasm_id',
    'occasion_details',
    'reason',
    'serves',
    'prep_time_minutes',
    'mixing_time_minutes',
    'marinate_time_minutes',
    'chill_time_minutes',
    'freeze_time_minutes',
    'cook_time_minutes',
    'bake_time_minutes',
    'cooling_time_minutes',
    'rest_time_minutes',
    'total_time_minutes',
    'notes_markdown',
    'is_private',
    'version',
    'created_at',
    'updated_at',
    'trashed_at',
    'publication_id',
    'publication_page',
    'recipe_url',
  ],
  publications: [
    'id',
    'publication_type',
    'name',
    'author',
    'edition',
    'isbn',
    'retailer_url',
    'site_url',
    'version',
    'created_at',
    'updated_at',
    'trashed_at',
  ],
  recipe_picklist_values: [
    'id',
    'category',
    'value',
    'sort_order',
    'is_protected',
    'created_at',
    'display_value',
  ],
  recipe_picklist_assignments: ['recipe_id', 'category', 'picklist_value_id'],
  ingredients: ['id', 'name', 'created_at', 'sort_order'],
  recipe_ingredient_sets: ['id', 'recipe_id', 'label', 'position'],
  recipe_ingredients: [
    'id',
    'recipe_id',
    'ingredient_id',
    'ingredient_set_id',
    'position',
    'is_main',
    'detail',
    'preparation',
    'portion_one_ratio',
    'size_value',
    'size_unit',
  ],
  recipe_ingredient_measurements: [
    'id',
    'recipe_ingredient_id',
    'position',
    'measurement_type',
    'amount_min',
    'amount_max',
    'unit_code',
    'picklist_value_id',
  ],
  recipe_steps: ['id', 'recipe_id', 'position', 'content_markdown', 'plain_text'],
  recipe_step_mentions: [
    'id',
    'recipe_id',
    'recipe_step_id',
    'recipe_ingredient_id',
    'position',
    'portion_ordinal',
  ],
  recipe_site_listings: ['id', 'recipe_id', 'site_publication_id', 'recipe_url'],
  recipe_pairings: ['id', 'source_recipe_id', 'linked_recipe_id', 'display_text', 'position'],
  recipe_references: [
    'id',
    'recipe_id',
    'reference_type',
    'publication_id',
    'display_text',
    'url',
    'position',
    'linked_recipe_id',
  ],
  ingredient_densities: [
    'ingredient_id',
    'volume_amount',
    'volume_unit_code',
    'weight_amount',
    'weight_unit_code',
    'created_at',
    'updated_at',
  ],
  tags: ['id', 'name', 'created_at', 'sort_order', 'color_key'],
  recipe_tags: ['recipe_id', 'tag_id'],
  publication_tags: ['publication_id', 'tag_id'],
  explorer_state: ['context_key', 'state', 'created_at', 'updated_at'],
  media_assets: [
    'id',
    'recipe_id',
    'publication_id',
    'asset_type',
    'status',
    'full_path',
    'thumbnail_path',
    'content_type',
    'description',
    'position',
    'is_primary',
    'byte_size',
    'width',
    'height',
    'crop',
    'created_at',
    'updated_at',
  ],
};

function portableRecord(table: ExportTableName, record: ExportRecord): ExportRecord {
  const portable = Object.fromEntries(
    portableRecordFields[table]
      .filter((field) => record[field] !== undefined)
      .map((field) => [field, record[field]]),
  );

  if (table === 'media_assets') {
    const assetId = recordId(record);
    if (!assetId) {
      throw new Error('A media asset is missing its stable identifier.');
    }
    portable.full_path = `images/${assetId}/full.webp`;
    portable.thumbnail_path = `images/${assetId}/thumbnail.webp`;
  }

  return portable;
}

function makeRecordSet(
  snapshot: ExportSnapshot,
  scope: ExportScope,
): Record<ExportTableName, ExportRecord[]> {
  const rows = Object.fromEntries(
    exportTableNames.map((table) => [table, tableRows(snapshot, table)]),
  ) as Record<ExportTableName, ExportRecord[]>;
  const recipeIds = new Set<string>();
  const publicationIds = new Set<string>();

  if (scope.type === 'database') {
    for (const recipe of rows.recipes) {
      const id = recordId(recipe);
      if (id) recipeIds.add(id);
    }
    for (const publication of rows.publications) {
      const id = recordId(publication);
      if (id) publicationIds.add(id);
    }
  } else if (scope.type === 'publication') {
    publicationIds.add(scope.id);
    for (const recipe of rows.recipes) {
      if (relationId(recipe, 'publication_id') === scope.id && recipe.trashed_at == null) {
        const id = recordId(recipe);
        if (id) recipeIds.add(id);
      }
    }
  } else {
    const recipe = rows.recipes.find((item) => recordId(item) === scope.id);
    if (recipe && recipe.trashed_at == null) {
      recipeIds.add(scope.id);
      const publicationId = relationId(recipe, 'publication_id');
      if (publicationId) publicationIds.add(publicationId);
    }
  }

  const recipeIngredients = rows.recipe_ingredients.filter((row) =>
    recipeIds.has(relationId(row, 'recipe_id') ?? ''),
  );
  const recipeIngredientSets = rows.recipe_ingredient_sets.filter((row) =>
    recipeIds.has(relationId(row, 'recipe_id') ?? ''),
  );
  const recipeIngredientIds = new Set(
    recipeIngredients.map(recordId).filter((id): id is string => id !== null),
  );
  const ingredientIds = new Set(
    recipeIngredients
      .map((row) => relationId(row, 'ingredient_id'))
      .filter((id): id is string => !!id),
  );
  const recipeSteps = rows.recipe_steps.filter((row) =>
    recipeIds.has(relationId(row, 'recipe_id') ?? ''),
  );
  const recipeStepIds = new Set(
    recipeSteps.map(recordId).filter((id): id is string => id !== null),
  );
  const measurements = rows.recipe_ingredient_measurements.filter((row) =>
    recipeIngredientIds.has(relationId(row, 'recipe_ingredient_id') ?? ''),
  );
  const recipeAssignments = rows.recipe_picklist_assignments.filter((row) =>
    recipeIds.has(relationId(row, 'recipe_id') ?? ''),
  );
  const recipeTagAssignments = rows.recipe_tags.filter((row) =>
    recipeIds.has(relationId(row, 'recipe_id') ?? ''),
  );
  const publicationTagAssignments =
    scope.type === 'recipe'
      ? []
      : rows.publication_tags.filter((row) =>
          publicationIds.has(relationId(row, 'publication_id') ?? ''),
        );
  const tagIds = new Set(
    [...recipeTagAssignments, ...publicationTagAssignments]
      .map((row) => relationId(row, 'tag_id'))
      .filter((id): id is string => !!id),
  );
  const picklistIds = new Set<string>();
  for (const recipe of rows.recipes.filter((item) => recipeIds.has(recordId(item) ?? ''))) {
    for (const field of ['food_type_id', 'verdict_id', 'enthusiasm_id']) {
      const id = relationId(recipe, field);
      if (id) picklistIds.add(id);
    }
  }
  for (const row of recipeAssignments) {
    const id = relationId(row, 'picklist_value_id');
    if (id) picklistIds.add(id);
  }
  for (const measurement of measurements) {
    const id = relationId(measurement, 'picklist_value_id');
    if (id) picklistIds.add(id);
  }

  const selected: Record<ExportTableName, ExportRecord[]> = {
    recipes: rows.recipes.filter((row) => recipeIds.has(recordId(row) ?? '')),
    publications: rows.publications.filter((row) => publicationIds.has(recordId(row) ?? '')),
    recipe_picklist_values:
      scope.type === 'database'
        ? rows.recipe_picklist_values
        : rows.recipe_picklist_values.filter((row) => picklistIds.has(recordId(row) ?? '')),
    recipe_picklist_assignments: recipeAssignments,
    ingredients:
      scope.type === 'database'
        ? rows.ingredients
        : rows.ingredients.filter((row) => ingredientIds.has(recordId(row) ?? '')),
    recipe_ingredient_sets: recipeIngredientSets,
    recipe_ingredients: recipeIngredients,
    recipe_ingredient_measurements: measurements,
    recipe_steps: recipeSteps,
    recipe_step_mentions: rows.recipe_step_mentions.filter((row) =>
      recipeStepIds.has(relationId(row, 'recipe_step_id') ?? ''),
    ),
    recipe_site_listings: rows.recipe_site_listings.filter((row) =>
      recipeIds.has(relationId(row, 'recipe_id') ?? ''),
    ),
    recipe_pairings: rows.recipe_pairings.filter((row) =>
      recipeIds.has(relationId(row, 'source_recipe_id') ?? ''),
    ),
    recipe_references: rows.recipe_references.filter((row) =>
      recipeIds.has(relationId(row, 'recipe_id') ?? ''),
    ),
    ingredient_densities:
      scope.type === 'database'
        ? rows.ingredient_densities
        : rows.ingredient_densities.filter((row) =>
            ingredientIds.has(relationId(row, 'ingredient_id') ?? ''),
          ),
    tags:
      scope.type === 'database'
        ? rows.tags
        : rows.tags.filter((row) => tagIds.has(recordId(row) ?? '')),
    recipe_tags: recipeTagAssignments,
    publication_tags: publicationTagAssignments,
    explorer_state: scope.type === 'database' ? rows.explorer_state : [],
    media_assets: rows.media_assets.filter(
      (row) =>
        row.status === 'ready' &&
        (scope.type === 'database' ||
          recipeIds.has(relationId(row, 'recipe_id') ?? '') ||
          (scope.type === 'publication' &&
            publicationIds.has(relationId(row, 'publication_id') ?? ''))),
    ),
  };

  return selected;
}

export function buildPortableData(snapshot: ExportSnapshot, scope: ExportScope): PortableData {
  const records = makeRecordSet(snapshot, scope);
  const preferences =
    scope.type === 'database'
      ? Object.fromEntries(
          preferenceFields
            .filter((field) => snapshot.accountPreferences[field] !== undefined)
            .map((field) => [field, snapshot.accountPreferences[field]]),
        )
      : {};

  return {
    format: 'recipe-box-data',
    schema_version: EXPORT_SCHEMA_VERSION,
    scope,
    account_preferences: preferences,
    records: Object.fromEntries(
      exportTableNames.map((table) => [
        table,
        records[table].map((record) => portableRecord(table, record)),
      ]),
    ) as Record<ExportTableName, ExportRecord[]>,
  };
}
