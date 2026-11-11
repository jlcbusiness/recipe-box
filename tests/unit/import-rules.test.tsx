import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ZipArchive } from 'archiver';
import { zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import {
  buildBundleManifest,
  type ExportScope,
  exportTableNames,
  type PortableData,
} from '../../src/lib/exports/rules';
import {
  createRangeArchiveSource,
  type ImportArchiveSource,
  readImportArchive,
} from '../../src/lib/imports/archive';
import {
  findImportMatches,
  normalizeImportName,
  validateImportBundleFiles,
} from '../../src/lib/imports/rules';

const recipeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createMemoryArchiveSource(archive: Buffer): ImportArchiveSource {
  return {
    size: async () => archive.byteLength,
    stream(offset: number, length?: number) {
      return Readable.from([
        archive.subarray(offset, length === undefined ? undefined : offset + length),
      ]);
    },
  };
}

function createBundleEntries(options: {
  scope?: ExportScope;
  manifestScope?: ExportScope;
  schemaVersion?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
  recipe?: Record<string, unknown>;
  publication?: Record<string, unknown>;
  accountPreferences?: Record<string, unknown>;
  records?: Partial<PortableData['records']>;
  includeImages?: boolean;
  sourceVariants?: boolean;
}) {
  const scope = options.scope ?? { type: 'database' as const };
  const schemaVersion = options.schemaVersion ?? 2;
  const tables =
    schemaVersion === 1
      ? exportTableNames.filter(
          (table) =>
            table !== 'recipe_ingredient_sets' &&
            table !== 'ingredient_nutrition_profiles' &&
            table !== 'ingredient_measure_equivalents' &&
            table !== 'recipe_time_entries',
        )
      : schemaVersion < 9
        ? exportTableNames.filter(
            (table) =>
              table !== 'ingredient_nutrition_profiles' &&
              table !== 'ingredient_measure_equivalents' &&
              table !== 'recipe_time_entries',
          )
        : schemaVersion < 11
          ? exportTableNames.filter((table) => table !== 'recipe_time_entries')
          : exportTableNames;
  const data = {
    format: 'recipe-box-data',
    schema_version: schemaVersion,
    scope,
    account_preferences: options.accountPreferences ?? {},
    records: Object.fromEntries(
      tables.map((table) => [
        table,
        options.records?.[table] ??
          (table === 'recipes' && options.recipe
            ? [
                {
                  ...(schemaVersion >= 6
                    ? { score: null, is_starred: false, is_hearted: false }
                    : {}),
                  ...(schemaVersion >= 8 ? { makes_quantity: null, makes_thing: null } : {}),
                  ...(schemaVersion >= 9 ? { nutrition_overrides: {} } : {}),
                  ...options.recipe,
                },
              ]
            : table === 'publications' && options.publication
              ? [options.publication]
              : table === 'recipe_ingredient_sets' && options.recipe
                ? [
                    {
                      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                      recipe_id: options.recipe.id,
                      label: 'Main',
                      position: 0,
                    },
                  ]
                : []),
      ]),
    ) as unknown as PortableData['records'],
  };
  const dataBytes = Buffer.from(JSON.stringify(data), 'utf8');
  const files = [{ path: 'data.json', bytes: dataBytes }];
  if (options.includeImages) {
    const sourceFull = Buffer.from('source-full-image');
    const sourceThumbnail = Buffer.from('source-thumbnail-image');
    files.push(
      { path: `images/${assetId}/full.webp`, bytes: Buffer.from('full-image') },
      { path: `images/${assetId}/thumbnail.webp`, bytes: Buffer.from('thumbnail-image') },
    );
    if (options.sourceVariants) {
      files.push(
        { path: `images/${assetId}/source-full.webp`, bytes: sourceFull },
        { path: `images/${assetId}/source-thumbnail.webp`, bytes: sourceThumbnail },
      );
    }
    const displayByteSize = Buffer.byteLength('full-image') + Buffer.byteLength('thumbnail-image');
    const sourceByteSize = options.sourceVariants
      ? sourceFull.byteLength + sourceThumbnail.byteLength
      : displayByteSize;
    data.records.media_assets.push({
      id: assetId,
      recipe_id: recipeId,
      publication_id: null,
      asset_type: 'recipe_photo',
      status: 'ready',
      full_path: `images/${assetId}/full.webp`,
      thumbnail_path: `images/${assetId}/thumbnail.webp`,
      content_type: 'image/webp',
      description: '',
      position: 0,
      is_primary: true,
      byte_size: displayByteSize + (options.sourceVariants ? sourceByteSize : 0),
      width: 32,
      height: 24,
      ...(schemaVersion >= 7
        ? {
            source_full_path: options.sourceVariants
              ? `images/${assetId}/source-full.webp`
              : `images/${assetId}/full.webp`,
            source_thumbnail_path: options.sourceVariants
              ? `images/${assetId}/source-thumbnail.webp`
              : `images/${assetId}/thumbnail.webp`,
            source_byte_size: sourceByteSize,
          }
        : {}),
      ...(schemaVersion >= 4
        ? {
            crop: {
              left: 0.25,
              top: 0.125,
              width: 0.5,
              height: 0.75,
              ...(schemaVersion >= 5 ? { rotation: 90 } : {}),
            },
          }
        : {}),
    });

    const updatedDataBytes = Buffer.from(JSON.stringify(data), 'utf8');
    files[0] = { path: 'data.json', bytes: updatedDataBytes };
  }
  const manifest = buildBundleManifest(
    options.manifestScope ?? scope,
    files,
    '0.1.0',
    new Date('2026-10-15T12:00:00.000Z'),
  );
  manifest.schema_version = schemaVersion;
  const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
  return new Map([
    ['manifest.json', manifestBytes],
    ...files.map(({ path, bytes }) => [path, bytes] as const),
  ]);
}

describe('import bundle validation', () => {
  it('preserves Makes fields in version 8 bundles and accepts version 7 without them', () => {
    const currentEntries = createBundleEntries({
      schemaVersion: 8,
      recipe: {
        id: recipeId,
        name: 'Lemon cake',
        score: null,
        is_starred: false,
        is_hearted: false,
        makes_quantity: 2,
        makes_thing: 'baby cakes',
      },
    });
    const legacyEntries = createBundleEntries({
      schemaVersion: 7,
      recipe: {
        id: recipeId,
        name: 'Lemon cake',
        score: null,
        is_starred: false,
        is_hearted: false,
      },
    });

    expect(validateImportBundleFiles(currentEntries).data.records.recipes[0]).toMatchObject({
      makes_quantity: 2,
      makes_thing: 'baby cakes',
    });
    expect(validateImportBundleFiles(legacyEntries).data.records.recipes[0]).toMatchObject({
      makes_quantity: null,
      makes_thing: null,
    });
  });

  it('preserves distinct original and framed image variants in version 7 bundles', () => {
    const entries = createBundleEntries({
      schemaVersion: 7,
      recipe: {
        id: recipeId,
        name: 'Lemon cake',
        state: 'tried',
        score: 1,
        is_starred: false,
        is_hearted: false,
      },
      includeImages: true,
      sourceVariants: true,
    });

    const result = validateImportBundleFiles(entries);
    expect(result.data.records.media_assets[0]).toMatchObject({
      source_full_path: `images/${assetId}/source-full.webp`,
      source_thumbnail_path: `images/${assetId}/source-thumbnail.webp`,
      source_byte_size:
        Buffer.byteLength('source-full-image') + Buffer.byteLength('source-thumbnail-image'),
    });
    expect(result.images.size).toBe(4);
  });

  it('backfills retained source metadata for version 6 media records', () => {
    const entries = createBundleEntries({
      schemaVersion: 6,
      recipe: {
        id: recipeId,
        name: 'Lemon cake',
        state: 'tried',
        score: 1,
        is_starred: false,
        is_hearted: false,
      },
      includeImages: true,
    });

    const result = validateImportBundleFiles(entries);
    expect(result.data.records.media_assets[0]).toMatchObject({
      source_full_path: `images/${assetId}/full.webp`,
      source_thumbnail_path: `images/${assetId}/thumbnail.webp`,
      source_byte_size: Buffer.byteLength('full-image') + Buffer.byteLength('thumbnail-image'),
    });
    expect(result.images.size).toBe(2);
  });

  it('defaults personal signals when importing a pre-DLC 10 recipe bundle', () => {
    const entries = createBundleEntries({
      schemaVersion: 5,
      recipe: { id: recipeId, name: 'Lemon cake', state: 'tried' },
      accountPreferences: { recipe_column_order: ['name', 'state'] },
    });

    const result = validateImportBundleFiles(entries);

    expect(result.data.records.recipes[0]).toMatchObject({
      score: null,
      is_starred: false,
      is_hearted: false,
    });
    expect(result.data.account_preferences.recipe_column_order).toEqual([
      'name',
      'state',
      'score',
      'starred',
      'hearted',
      'makes',
    ]);
  });

  it('preserves Recipe unit preferences in an imported database bundle', () => {
    const entries = createBundleEntries({
      accountPreferences: { volume_system: 'recipe', weight_system: 'metric' },
    });

    expect(validateImportBundleFiles(entries).data.account_preferences).toMatchObject({
      volume_system: 'recipe',
      weight_system: 'metric',
    });
  });

  it('validates version 6 personal recipe signals', () => {
    const valid = createBundleEntries({
      schemaVersion: 6,
      recipe: {
        id: recipeId,
        name: 'Lemon cake',
        state: 'tried',
        score: -3,
        is_starred: true,
        is_hearted: false,
      },
    });

    expect(validateImportBundleFiles(valid).data.records.recipes[0]).toMatchObject({
      score: -3,
      is_starred: true,
      is_hearted: false,
    });

    const invalid = createBundleEntries({
      schemaVersion: 6,
      recipe: {
        id: recipeId,
        name: 'Lemon cake',
        state: 'want_to_try',
        score: 2,
        is_starred: false,
        is_hearted: true,
      },
    });
    expect(() => validateImportBundleFiles(invalid)).toThrow(/score or marker/i);
  });

  it('accepts and validates instruction emphasis preferences in database bundles', () => {
    const preferences = {
      ingredient_color: 'dark_blue',
      temperature_color: 'red',
      duration_color: 'orange',
      temperature_system: 'celsius',
      private_print_uses_colors: false,
      include_instruction_photos_in_private_print: true,
      repeat_ingredients_in_private_print: false,
      include_private_details_in_private_print: false,
    };

    expect(() =>
      validateImportBundleFiles(
        createBundleEntries({ schemaVersion: 3, accountPreferences: preferences }),
      ),
    ).not.toThrow();
    expect(() =>
      validateImportBundleFiles(
        createBundleEntries({
          schemaVersion: 3,
          accountPreferences: { ...preferences, ingredient_color: 'ultraviolet' },
        }),
      ),
    ).toThrow(/preference/i);
    expect(() =>
      validateImportBundleFiles(
        createBundleEntries({
          schemaVersion: 3,
          accountPreferences: { ...preferences, temperature_system: 'kelvin' },
        }),
      ),
    ).toThrow(/preference/i);
    expect(() =>
      validateImportBundleFiles(
        createBundleEntries({
          schemaVersion: 3,
          accountPreferences: {
            ...preferences,
            include_instruction_photos_in_private_print: 'yes',
          },
        }),
      ),
    ).toThrow(/preference/i);
    expect(() =>
      validateImportBundleFiles(
        createBundleEntries({
          schemaVersion: 3,
          accountPreferences: {
            ...preferences,
            repeat_ingredients_in_private_print: 'yes',
          },
        }),
      ),
    ).toThrow(/preference/i);
    expect(() =>
      validateImportBundleFiles(
        createBundleEntries({
          schemaVersion: 3,
          accountPreferences: {
            ...preferences,
            include_private_details_in_private_print: 'yes',
          },
        }),
      ),
    ).toThrow(/preference/i);
  });

  it('streams a ZIP archive and rejects duplicate or unsupported paths', async () => {
    const data = Buffer.from('portable data');
    const archive = zipSync({ 'data.json': data, 'manifest.json': Buffer.from('{}') });
    const result = await readImportArchive(createMemoryArchiveSource(Buffer.from(archive)));
    expect([...result.entries.keys()].sort()).toEqual(['data.json', 'manifest.json']);
    expect(Buffer.from(result.entries.get('data.json') ?? [])).toEqual(data);

    const unsupported = zipSync({ 'notes.txt': data });
    await expect(
      readImportArchive(createMemoryArchiveSource(Buffer.from(unsupported))),
    ).rejects.toThrow(/unsafe|unsupported/i);
  });

  it('rejects archives above the entry-count limit before parsing their directory', async () => {
    const archive = Buffer.from(zipSync({ 'data.json': Buffer.from('{}') }));
    const endRecordOffset = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    archive.writeUInt16LE(20_001, endRecordOffset + 8);
    archive.writeUInt16LE(20_001, endRecordOffset + 10);

    await expect(readImportArchive(createMemoryArchiveSource(archive))).rejects.toThrow(
      /unsupported file entry/i,
    );
  });

  it('reads streamed ZIP archives when compressed data contains the descriptor signature', async () => {
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const archiveParts: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => archiveParts.push(Buffer.from(chunk)));
    const archiveFinished = finished(archive);
    const data = randomBytes(2 * 1024 * 1024);
    const descriptorSignature = Buffer.from([0x50, 0x4b, 0x07, 0x08]);
    data.set(descriptorSignature, 100_000);
    archive.append(data, { name: 'data.json' });
    archive.append(Buffer.from('{}'), { name: 'manifest.json' });
    for (let index = 0; index < 20; index += 1) {
      const imageId = `${index.toString(16).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
      archive.append(Buffer.from(`image-${index}`), { name: `images/${imageId}/full.webp` });
    }
    await archive.finalize();
    await archiveFinished;
    const archiveBytes = Buffer.concat(archiveParts);
    const embeddedSignatureOffset = archiveBytes.indexOf(descriptorSignature, 30);
    const descriptorSignatureOffset = archiveBytes.lastIndexOf(descriptorSignature);
    expect(embeddedSignatureOffset).toBeGreaterThan(30);
    expect(embeddedSignatureOffset).toBeLessThan(descriptorSignatureOffset);

    const rangeFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestedRange = new Headers(init?.headers).get('range') ?? '';
      const match = /^bytes=(\d+)-(\d+)$/.exec(requestedRange);
      if (!match) throw new Error('Expected a byte-range request.');
      const start = Number(match[1]);
      const end = Number(match[2]);
      return new Response(archiveBytes.subarray(start, end + 1), {
        status: 206,
        headers: { 'content-range': `bytes ${start}-${end}/${archiveBytes.byteLength}` },
      });
    });
    vi.stubGlobal('fetch', rangeFetch);

    try {
      const result = await readImportArchive(
        createRangeArchiveSource('https://example.test/archive'),
      );

      expect([...result.entries.keys()].sort()).toEqual(['data.json', 'manifest.json']);
      expect(Buffer.from(result.entries.get('data.json') ?? [])).toEqual(data);
      expect(rangeFetch).toHaveBeenCalledTimes(2);
      expect(rangeFetch.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(
        true,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('streams image entries to a sink without retaining their bytes in the result', async () => {
    const imageBytes = Buffer.from('streamed image content');
    const archive = zipSync({
      'data.json': Buffer.from('{}'),
      [`images/${assetId}/full.webp`]: imageBytes,
      'manifest.json': Buffer.from('{}'),
    });
    const result = await readImportArchive(
      createMemoryArchiveSource(Buffer.from(archive)),
      async (_path, stream) => {
        for await (const _chunk of stream) {
        }
      },
    );

    expect(result.entries.has(`images/${assetId}/full.webp`)).toBe(false);
    expect(result.images.get(`images/${assetId}/full.webp`)?.size_bytes).toBe(
      imageBytes.byteLength,
    );
    expect(result.images.get(`images/${assetId}/full.webp`)?.sha256).toBe(
      createHash('sha256').update(imageBytes).digest('hex'),
    );
  });

  it('accepts a complete v1 bundle and returns its normalized data and images', () => {
    const entries = createBundleEntries({
      schemaVersion: 1,
      scope: { type: 'recipe', id: recipeId },
      recipe: { id: recipeId, name: 'Lemon cake', publication_id: null, is_private: true },
      records: {
        ingredients: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Lemon' }],
        recipe_ingredients: [
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            recipe_id: recipeId,
            ingredient_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            position: 0,
          },
        ],
      },
      includeImages: true,
    });

    const bundle = validateImportBundleFiles(entries);

    expect(bundle.manifest.schema_version).toBe(1);
    expect(bundle.data.scope).toEqual({ type: 'recipe', id: recipeId });
    expect(bundle.data.records.recipes).toEqual([
      {
        id: recipeId,
        name: 'Lemon cake',
        publication_id: null,
        is_private: true,
        score: null,
        is_starred: false,
        is_hearted: false,
        makes_quantity: null,
        makes_thing: null,
        nutrition_overrides: {},
        total_time_minutes: 0,
      },
    ]);
    expect(bundle.data.records.recipe_ingredient_sets).toHaveLength(1);
    expect(bundle.data.records.recipe_ingredient_sets[0]).toMatchObject({
      recipe_id: recipeId,
      label: 'Main',
      position: 0,
    });
    expect(bundle.data.records.recipe_ingredients[0]).toMatchObject({
      ingredient_set_id: bundle.data.records.recipe_ingredient_sets[0].id,
      portion_one_ratio: null,
      size_value: null,
      size_unit: null,
    });
    expect(bundle.data.records.media_assets[0].crop).toBeNull();
    expect([...bundle.images.keys()]).toEqual([
      `images/${assetId}/full.webp`,
      `images/${assetId}/thumbnail.webp`,
    ]);
  });

  it.each([1, 2, 3] as const)('backfills v%d media framing to Fit', (schemaVersion) => {
    const entries = createBundleEntries({
      schemaVersion,
      scope: { type: 'recipe', id: recipeId },
      recipe: { id: recipeId, name: 'Lemon cake', publication_id: null },
      includeImages: true,
    });

    expect(validateImportBundleFiles(entries).data.records.media_assets[0].crop).toBeNull();
  });

  it('imports v4 framing at zero degrees and preserves v5 quarter-turn framing', () => {
    const legacyEntries = createBundleEntries({
      schemaVersion: 4,
      scope: { type: 'recipe', id: recipeId },
      recipe: { id: recipeId, name: 'Lemon cake', publication_id: null },
      includeImages: true,
    });
    expect(validateImportBundleFiles(legacyEntries).data.records.media_assets[0].crop).toEqual({
      left: 0.25,
      top: 0.125,
      width: 0.5,
      height: 0.75,
      rotation: 0,
    });

    const entries = createBundleEntries({
      schemaVersion: 5,
      scope: { type: 'recipe', id: recipeId },
      recipe: { id: recipeId, name: 'Lemon cake', publication_id: null },
      includeImages: true,
    });
    const validBundle = validateImportBundleFiles(entries);
    expect(validBundle.data.records.media_assets[0].crop).toEqual({
      left: 0.25,
      top: 0.125,
      width: 0.5,
      height: 0.75,
      rotation: 90,
    });

    const data = JSON.parse(new TextDecoder().decode(entries.get('data.json')));
    data.records.media_assets[0].crop = {
      left: 0.5,
      top: 0.5,
      width: 0.75,
      height: 0.25,
      rotation: 90,
    };
    const dataBytes = Buffer.from(JSON.stringify(data), 'utf8');
    const manifest = buildBundleManifest(
      { type: 'recipe', id: recipeId },
      [
        { path: 'data.json', bytes: dataBytes },
        { path: `images/${assetId}/full.webp`, bytes: Buffer.from('full-image') },
        { path: `images/${assetId}/thumbnail.webp`, bytes: Buffer.from('thumbnail-image') },
      ],
      '0.1.0',
      new Date('2026-10-15T12:00:00.000Z'),
    );
    manifest.schema_version = 5;
    entries.set('data.json', dataBytes);
    entries.set('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));

    expect(() => validateImportBundleFiles(entries)).toThrow(/crop|framing/i);
  });

  it('accepts v2 defaults and v3 portions while rejecting unresolved ingredient-set IDs', () => {
    const setId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const rowId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const valid = createBundleEntries({
      scope: { type: 'recipe', id: recipeId },
      recipe: { id: recipeId, name: 'Lemon cake', publication_id: null },
      records: {
        recipe_ingredient_sets: [{ id: setId, recipe_id: recipeId, label: 'Main', position: 0 }],
        recipe_ingredients: [
          {
            id: rowId,
            recipe_id: recipeId,
            ingredient_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            ingredient_set_id: setId,
            position: 0,
          },
        ],
        ingredients: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Lemon' }],
      },
    });
    const validated = validateImportBundleFiles(valid);
    expect(validated.data.records.recipe_ingredients[0]).toMatchObject({
      portion_one_ratio: null,
      size_value: null,
      size_unit: null,
    });

    const v3 = createBundleEntries({
      schemaVersion: 3,
      scope: { type: 'recipe', id: recipeId },
      recipe: { id: recipeId, name: 'Lemon cake', publication_id: null },
      records: {
        recipe_ingredient_sets: [{ id: setId, recipe_id: recipeId, label: 'Main', position: 0 }],
        ingredients: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Lemon' }],
        recipe_ingredients: [
          {
            id: rowId,
            recipe_id: recipeId,
            ingredient_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            ingredient_set_id: setId,
            position: 0,
            preparation: 'cubed',
            portion_one_ratio: 0.25,
            size_value: 2,
            size_unit: 'cm',
          },
        ],
        recipe_steps: [{ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', recipe_id: recipeId }],
        recipe_step_mentions: [
          {
            id: '99999999-9999-4999-8999-999999999999',
            recipe_id: recipeId,
            recipe_step_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            recipe_ingredient_id: rowId,
            position: 0,
            portion_ordinal: 2,
          },
        ],
      },
    });
    expect(validateImportBundleFiles(v3).data.records.recipe_ingredients[0]).toMatchObject({
      portion_one_ratio: 0.25,
      size_value: 2,
      size_unit: 'cm',
    });

    const invalid = createBundleEntries({
      scope: { type: 'recipe', id: recipeId },
      recipe: { id: recipeId, name: 'Lemon cake', publication_id: null },
      records: {
        recipe_ingredient_sets: [{ id: setId, recipe_id: recipeId, label: 'Main', position: 0 }],
        recipe_ingredients: [
          {
            id: rowId,
            recipe_id: recipeId,
            ingredient_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            ingredient_set_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            position: 0,
          },
        ],
        ingredients: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Lemon' }],
      },
    });
    expect(() => validateImportBundleFiles(invalid)).toThrow(/ingredient set/i);
  });

  it('accepts publication roots and preserves out-of-scope relationship display text', () => {
    const publicationEntries = createBundleEntries({
      scope: { type: 'publication', id: assetId },
      publication: { id: assetId, publication_type: 'book', name: 'Baking Annual' },
    });
    expect(() => validateImportBundleFiles(publicationEntries)).not.toThrow();

    const recipeEntries = createBundleEntries({
      scope: { type: 'recipe', id: recipeId },
      recipe: { id: recipeId, publication_id: assetId, name: 'Lemon cake' },
      publication: { id: assetId, publication_type: 'book', name: 'Baking Annual' },
      records: {
        recipe_pairings: [
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            source_recipe_id: recipeId,
            linked_recipe_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            display_text: 'Tomato soup',
            position: 0,
          },
        ],
        recipe_references: [
          {
            id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            recipe_id: recipeId,
            reference_type: 'publication',
            publication_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            display_text: 'Family cookbook',
            url: null,
            position: 0,
            linked_recipe_id: null,
          },
        ],
      },
    });

    expect(() => validateImportBundleFiles(recipeEntries)).not.toThrow();
  });

  it('accepts valid v1 secondary Site listing data without requiring its source publication', () => {
    const entries = createBundleEntries({
      scope: { type: 'recipe', id: recipeId },
      recipe: { id: recipeId, publication_id: null, name: 'Lemon cake' },
      records: {
        recipe_site_listings: [
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            recipe_id: recipeId,
            site_publication_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            recipe_url: 'https://example.com/lemon-cake',
          },
        ],
      },
    });

    expect(() => validateImportBundleFiles(entries)).not.toThrow();
  });

  it('validates image checksums from streamed metadata without image buffers', () => {
    const allEntries = createBundleEntries({
      recipe: { id: recipeId, name: 'Lemon cake' },
      includeImages: true,
    });
    const entries = new Map([...allEntries].filter(([path]) => !path.startsWith('images/')));
    const streamedImages = new Map(
      [...allEntries]
        .filter(([path]) => path.startsWith('images/'))
        .map(([path, bytes]) => [
          path,
          {
            size_bytes: bytes.byteLength,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          },
        ]),
    );

    const bundle = validateImportBundleFiles(entries, streamedImages);

    expect(bundle.images.get(`images/${assetId}/full.webp`)).toEqual(
      streamedImages.get(`images/${assetId}/full.webp`),
    );
  });

  it('rejects a payload whose checksum or byte count differs from the manifest', () => {
    const entries = createBundleEntries({});
    entries.set('data.json', Buffer.from('{"tampered":true}', 'utf8'));

    expect(() => validateImportBundleFiles(entries)).toThrow(/checksum|size/i);
  });

  it('rejects missing and unlisted archive entries', () => {
    const entries = createBundleEntries({});
    entries.delete('data.json');
    expect(() => validateImportBundleFiles(entries)).toThrow(/data\.json|missing/i);

    const unlisted = createBundleEntries({});
    unlisted.set('unexpected.txt', Buffer.from('not portable'));
    expect(() => validateImportBundleFiles(unlisted)).toThrow(/entry|manifest|unexpected/i);
  });

  it('rejects mismatched scopes, unsupported versions, and owner identity fields', () => {
    const mismatched = createBundleEntries({
      scope: { type: 'database' },
      manifestScope: { type: 'recipe', id: recipeId },
    });
    expect(() => validateImportBundleFiles(mismatched)).toThrow(/scope/i);

    const unsupported = createBundleEntries({});
    const manifest = JSON.parse(new TextDecoder().decode(unsupported.get('manifest.json')));
    manifest.schema_version = 7;
    unsupported.set('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));
    expect(() => validateImportBundleFiles(unsupported)).toThrow(/version/i);

    const ownerData = createBundleEntries({ recipe: { id: recipeId, account_id: recipeId } });
    expect(() => validateImportBundleFiles(ownerData)).toThrow(/field|account/i);
  });

  it('rejects ready media assets without both matching image variants', () => {
    const entries = createBundleEntries({ recipe: { id: recipeId, name: 'Lemon cake' } });
    const data = JSON.parse(new TextDecoder().decode(entries.get('data.json')));
    data.schema_version = 3;
    data.records.media_assets = [
      {
        id: assetId,
        recipe_id: recipeId,
        publication_id: null,
        asset_type: 'recipe_photo',
        status: 'ready',
        full_path: `images/${assetId}/full.webp`,
        thumbnail_path: `images/${assetId}/thumbnail.webp`,
        content_type: 'image/webp',
        byte_size: 10,
        width: 32,
        height: 24,
      },
    ];
    const dataBytes = Buffer.from(JSON.stringify(data), 'utf8');
    const manifest = buildBundleManifest(
      { type: 'database' },
      [{ path: 'data.json', bytes: dataBytes }],
      '0.1.0',
      new Date('2026-10-15T12:00:00.000Z'),
    );
    manifest.schema_version = 3;
    entries.set('data.json', dataBytes);
    entries.set('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));

    expect(() => validateImportBundleFiles(entries)).toThrow(/image|variant|asset/i);
  });

  it('rejects database rows with an unresolved internal relationship', () => {
    const entries = createBundleEntries({
      recipe: {
        id: recipeId,
        name: 'Lemon cake',
        food_type_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
    });

    expect(() => validateImportBundleFiles(entries)).toThrow(/reference|relationship/i);
  });

  it('accepts nullable linked recipe references in a database bundle', () => {
    const entries = createBundleEntries({ recipe: { id: recipeId, name: 'Lemon cake' } });
    const data = JSON.parse(new TextDecoder().decode(entries.get('data.json')));
    data.schema_version = 3;
    data.records.recipe_pairings = [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        source_recipe_id: recipeId,
        linked_recipe_id: null,
        display_text: 'Serve with tea',
        position: 0,
      },
    ];
    const dataBytes = Buffer.from(JSON.stringify(data), 'utf8');
    const manifest = buildBundleManifest(
      { type: 'database' },
      [{ path: 'data.json', bytes: dataBytes }],
      '0.1.0',
      new Date('2026-10-15T12:00:00.000Z'),
    );
    manifest.schema_version = 3;
    entries.set('data.json', dataBytes);
    entries.set('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));

    expect(() => validateImportBundleFiles(entries)).not.toThrow();
  });

  it('accepts publication references retained as static text without a target ID', () => {
    const entries = createBundleEntries({ recipe: { id: recipeId, name: 'Lemon cake' } });
    const data = JSON.parse(new TextDecoder().decode(entries.get('data.json')));
    data.schema_version = 3;
    data.records.recipe_references = [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        recipe_id: recipeId,
        reference_type: 'publication',
        publication_id: null,
        display_text: 'Baking Annual',
        url: null,
        position: 0,
        linked_recipe_id: null,
      },
    ];
    const dataBytes = Buffer.from(JSON.stringify(data), 'utf8');
    const manifest = buildBundleManifest(
      { type: 'database' },
      [{ path: 'data.json', bytes: dataBytes }],
      '0.1.0',
      new Date('2026-10-15T12:00:00.000Z'),
    );
    manifest.schema_version = 3;
    entries.set('data.json', dataBytes);
    entries.set('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));

    expect(() => validateImportBundleFiles(entries)).not.toThrow();
  });

  it('accepts references whose publication ID is optional by type', () => {
    const entries = createBundleEntries({ recipe: { id: recipeId, name: 'Lemon cake' } });
    const data = JSON.parse(new TextDecoder().decode(entries.get('data.json')));
    data.schema_version = 3;
    data.records.recipe_references = [
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        recipe_id: recipeId,
        reference_type: 'printed_citation',
        publication_id: null,
        display_text: 'Family notebook',
        url: null,
        position: 0,
        linked_recipe_id: null,
      },
    ];
    const dataBytes = Buffer.from(JSON.stringify(data), 'utf8');
    const manifest = buildBundleManifest(
      { type: 'database' },
      [{ path: 'data.json', bytes: dataBytes }],
      '0.1.0',
      new Date('2026-10-15T12:00:00.000Z'),
    );
    manifest.schema_version = 3;
    entries.set('data.json', dataBytes);
    entries.set('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));

    expect(() => validateImportBundleFiles(entries)).not.toThrow();
  });

  it('rejects scoped recipe rows with unresolved internal references', () => {
    const entries = createBundleEntries({
      scope: { type: 'recipe', id: recipeId },
      recipe: { id: recipeId, publication_id: null, name: 'Lemon cake' },
      records: {
        recipe_ingredients: [
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            recipe_id: recipeId,
            ingredient_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            position: 0,
          },
        ],
      },
    });

    expect(() => validateImportBundleFiles(entries)).toThrow(/ingredient reference/i);
  });

  it('does not match a recipe through an unmatched source publication id', () => {
    const dataBytes = createBundleEntries({
      recipe: {
        id: recipeId,
        name: 'Lemon cake',
        publication_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      },
    }).get('data.json');
    const incoming = JSON.parse(new TextDecoder().decode(dataBytes));
    incoming.records.publications.push({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      publication_type: 'cookbook',
      name: 'Incoming Book',
    });

    expect(
      findImportMatches(incoming, {
        publications: [
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            publication_type: 'magazine',
            name: 'Unrelated publication',
          },
        ],
        recipes: [
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            publication_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            name: 'Lemon cake',
          },
        ],
      }),
    ).toEqual([]);
  });

  it('normalizes Unicode and finds publication and recipe matches within source scope', () => {
    const incoming = JSON.parse(
      new TextDecoder().decode(
        createBundleEntries({
          recipe: { id: recipeId, name: 'Cafe\u0301 cake', publication_id: assetId },
        }).get('data.json'),
      ),
    );
    incoming.records.publications = [
      { id: assetId, publication_type: 'book', name: 'Baking Annual' },
    ];

    expect(normalizeImportName('  Café  ')).toBe('café');
    expect(
      findImportMatches(incoming, {
        publications: [{ id: 'local-book', publication_type: 'book', name: ' Baking Annual ' }],
        recipes: [
          { id: 'local-recipe', name: 'Café cake', publication_id: 'local-book' },
          { id: 'unrelated-recipe', name: 'Café cake', publication_id: 'another-book' },
        ],
      }),
    ).toEqual([
      { incomingId: assetId, existingIds: ['local-book'], kind: 'publication' },
      { incomingId: recipeId, existingIds: ['local-recipe'], kind: 'recipe' },
    ]);
  });

  it('validates version 9 nutrition profiles and measure-equivalent references', () => {
    const ingredientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const thingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const entries = createBundleEntries({
      schemaVersion: 9,
      records: {
        ingredients: [{ id: ingredientId, name: 'Spinach' }],
        recipe_picklist_values: [
          { id: thingId, category: 'informal_unit', value: 'bunch', display_value: 'bunch' },
        ],
        ingredient_nutrition_profiles: [
          {
            ingredient_id: ingredientId,
            serving_size_amount: 1,
            serving_size_dimension: 'weight',
            serving_size_unit_code: 'oz',
            nutrients: { calories: 12, protein: 1 },
          },
        ],
        ingredient_measure_equivalents: [
          {
            ingredient_id: ingredientId,
            measurement_type: 'informal',
            picklist_value_id: thingId,
            picklist_value: 'bunch',
            volume_amount: 1,
            volume_unit_code: 'cup',
            weight_amount: null,
            weight_unit_code: null,
          },
        ],
      },
    });

    const bundle = validateImportBundleFiles(entries);
    expect(bundle.data.records.ingredient_nutrition_profiles[0].nutrients).toEqual({
      calories: 12,
      protein: 1,
    });
    expect(bundle.data.records.ingredient_measure_equivalents[0].picklist_value_id).toBe(thingId);

    const invalidEntries = createBundleEntries({
      schemaVersion: 9,
      records: {
        ingredients: [{ id: ingredientId, name: 'Spinach' }],
        ingredient_nutrition_profiles: [
          {
            ingredient_id: ingredientId,
            serving_size_amount: 1,
            serving_size_dimension: 'weight',
            serving_size_unit_code: 'oz',
            nutrients: { calories: 12, unknown_nutrient: 1 },
          },
        ],
      },
    });
    expect(() => validateImportBundleFiles(invalidEntries)).toThrow(/nutrition profile/i);
  });

  it('preserves protected source identity in v10 and backfills v9 references as editable', () => {
    const sourcePublicId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const sourceReference = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      recipe_id: recipeId,
      reference_type: 'external_url',
      publication_id: null,
      display_text: "source-user's Lemon cake",
      url: `https://recipe-box.example/r/${sourcePublicId}`,
      position: 0,
      linked_recipe_id: null,
      is_protected_source: true,
      source_public_id: sourcePublicId,
    };
    const currentEntries = createBundleEntries({
      schemaVersion: 10,
      recipe: { id: recipeId, name: 'Lemon cake' },
      records: { recipe_references: [sourceReference] },
    });

    expect(
      validateImportBundleFiles(currentEntries).data.records.recipe_references[0],
    ).toMatchObject({
      is_protected_source: true,
      source_public_id: sourcePublicId,
      url: sourceReference.url,
    });

    const legacyEntries = createBundleEntries({
      schemaVersion: 9,
      recipe: { id: recipeId, name: 'Lemon cake' },
      records: {
        recipe_references: [
          Object.fromEntries(
            Object.entries(sourceReference).filter(
              ([key]) => key !== 'is_protected_source' && key !== 'source_public_id',
            ),
          ),
        ],
      },
    });
    expect(
      validateImportBundleFiles(legacyEntries).data.records.recipe_references[0],
    ).toMatchObject({
      is_protected_source: false,
      source_public_id: null,
    });
  });

  it('converts legacy component times into ordered entries and derives their total', () => {
    const entries = createBundleEntries({
      schemaVersion: 10,
      recipe: {
        id: recipeId,
        name: 'Lemon cake',
        prep_time_minutes: 12,
        cook_time_minutes: 28,
        total_time_minutes: 99,
      },
    });

    const bundle = validateImportBundleFiles(entries);
    const recipe = bundle.data.records.recipes[0];
    expect(bundle.data.schema_version).toBe(11);
    expect(recipe).not.toHaveProperty('prep_time_minutes');
    expect(recipe.total_time_minutes).toBe(40);
    expect(bundle.data.records.recipe_time_entries).toHaveLength(2);
    expect(
      bundle.data.records.recipe_time_entries.map((entry) => [entry.minutes, entry.position]),
    ).toEqual([
      [12, 0],
      [28, 1],
    ]);
    expect(
      bundle.data.records.recipe_picklist_values
        .filter((value) => value.category === 'time_type')
        .map((value) => value.value),
    ).toEqual(['Prep', 'Cook']);
  });

  it('converts a legacy total-only recipe into a Cook entry', () => {
    const entries = createBundleEntries({
      schemaVersion: 10,
      recipe: { id: recipeId, name: 'Slow soup', total_time_minutes: 40 },
    });

    const bundle = validateImportBundleFiles(entries);
    expect(bundle.data.records.recipe_time_entries).toHaveLength(1);
    expect(bundle.data.records.recipe_time_entries[0].minutes).toBe(40);
    expect(bundle.data.records.recipe_time_entries[0].position).toBe(0);
    const timeTypeId = bundle.data.records.recipe_time_entries[0].time_type_id;
    expect(
      bundle.data.records.recipe_picklist_values.find((value) => value.id === timeTypeId)?.value,
    ).toBe('Cook');
  });

  it('validates version 11 time-entry references and ordering', () => {
    const timeTypeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const timeEntryId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const entries = createBundleEntries({
      schemaVersion: 11,
      recipe: { id: recipeId, name: 'Lemon cake', total_time_minutes: 25 },
      records: {
        recipe_picklist_values: [
          { id: timeTypeId, category: 'time_type', value: 'Bake', display_value: 'Bake' },
        ],
        recipe_time_entries: [
          {
            id: timeEntryId,
            recipe_id: recipeId,
            time_type_id: timeTypeId,
            minutes: 25,
            position: 0,
          },
        ],
      },
    });

    expect(validateImportBundleFiles(entries).data.records.recipe_time_entries).toEqual([
      {
        id: timeEntryId,
        recipe_id: recipeId,
        time_type_id: timeTypeId,
        minutes: 25,
        position: 0,
      },
    ]);
  });

  it('rejects protected source metadata whose stable URL does not match its public ID', () => {
    const sourcePublicId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const entries = createBundleEntries({
      schemaVersion: 10,
      recipe: { id: recipeId, name: 'Lemon cake' },
      records: {
        recipe_references: [
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            recipe_id: recipeId,
            reference_type: 'external_url',
            publication_id: null,
            display_text: "source-user's Lemon cake",
            url: 'https://recipe-box.example/r/ffffffff-ffff-4fff-8fff-ffffffffffff',
            position: 0,
            linked_recipe_id: null,
            is_protected_source: true,
            source_public_id: sourcePublicId,
          },
        ],
      },
    });

    expect(() => validateImportBundleFiles(entries)).toThrow(/source|protected|identity/i);
  });
});
