import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildBundleManifest,
  type ExportScope,
  exportTableNames,
  type PortableData,
} from '../../src/lib/exports/rules';
import { readImportArchive } from '../../src/lib/imports/archive';
import {
  findImportMatches,
  normalizeImportName,
  validateImportBundleFiles,
} from '../../src/lib/imports/rules';

const recipeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const assetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function createBundleEntries(options: {
  scope?: ExportScope;
  manifestScope?: ExportScope;
  schemaVersion?: 1 | 2;
  recipe?: Record<string, unknown>;
  publication?: Record<string, unknown>;
  records?: Partial<PortableData['records']>;
  includeImages?: boolean;
}) {
  const scope = options.scope ?? { type: 'database' as const };
  const schemaVersion = options.schemaVersion ?? 2;
  const tables =
    schemaVersion === 1
      ? exportTableNames.filter((table) => table !== 'recipe_ingredient_sets')
      : exportTableNames;
  const data = {
    format: 'recipe-box-data',
    schema_version: schemaVersion,
    scope,
    account_preferences: {},
    records: Object.fromEntries(
      tables.map((table) => [
        table,
        options.records?.[table] ??
          (table === 'recipes' && options.recipe
            ? [options.recipe]
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
    files.push(
      { path: `images/${assetId}/full.webp`, bytes: Buffer.from('full-image') },
      { path: `images/${assetId}/thumbnail.webp`, bytes: Buffer.from('thumbnail-image') },
    );
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
      byte_size: Buffer.byteLength('full-image') + Buffer.byteLength('thumbnail-image'),
      width: 32,
      height: 24,
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
  it('streams a ZIP archive and rejects duplicate or unsupported paths', async () => {
    const data = Buffer.from('portable data');
    const archive = zipSync({ 'data.json': data, 'manifest.json': Buffer.from('{}') });
    const result = await readImportArchive(
      new ReadableStream({
        start(controller) {
          controller.enqueue(archive);
          controller.close();
        },
      }),
    );
    expect([...result.entries.keys()].sort()).toEqual(['data.json', 'manifest.json']);
    expect(Buffer.from(result.entries.get('data.json') ?? [])).toEqual(data);

    const unsupported = zipSync({ 'notes.txt': data });
    await expect(
      readImportArchive(
        new ReadableStream({
          start(controller) {
            controller.enqueue(unsupported);
            controller.close();
          },
        }),
      ),
    ).rejects.toThrow(/unsafe|unsupported/i);
  });

  it('streams image entries to a sink without retaining their bytes in the result', async () => {
    const imageBytes = Buffer.from('streamed image content');
    const archive = zipSync({
      'data.json': Buffer.from('{}'),
      [`images/${assetId}/full.webp`]: imageBytes,
      'manifest.json': Buffer.from('{}'),
    });
    const result = await readImportArchive(
      new ReadableStream({
        start(controller) {
          controller.enqueue(archive);
          controller.close();
        },
      }),
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
      { id: recipeId, name: 'Lemon cake', publication_id: null, is_private: true },
    ]);
    expect(bundle.data.records.recipe_ingredient_sets).toHaveLength(1);
    expect(bundle.data.records.recipe_ingredient_sets[0]).toMatchObject({
      recipe_id: recipeId,
      label: 'Main',
      position: 0,
    });
    expect(bundle.data.records.recipe_ingredients[0]).toMatchObject({
      ingredient_set_id: bundle.data.records.recipe_ingredient_sets[0].id,
    });
    expect([...bundle.images.keys()]).toEqual([
      `images/${assetId}/full.webp`,
      `images/${assetId}/thumbnail.webp`,
    ]);
  });

  it('accepts v2 set membership and rejects an unresolved ingredient-set ID', () => {
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
    expect(() => validateImportBundleFiles(valid)).not.toThrow();

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
    manifest.schema_version = 3;
    unsupported.set('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));
    expect(() => validateImportBundleFiles(unsupported)).toThrow(/version/i);

    const ownerData = createBundleEntries({ recipe: { id: recipeId, account_id: recipeId } });
    expect(() => validateImportBundleFiles(ownerData)).toThrow(/field|account/i);
  });

  it('rejects ready media assets without both matching image variants', () => {
    const entries = createBundleEntries({ recipe: { id: recipeId, name: 'Lemon cake' } });
    const data = JSON.parse(new TextDecoder().decode(entries.get('data.json')));
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
    entries.set('data.json', dataBytes);
    entries.set('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));

    expect(() => validateImportBundleFiles(entries)).not.toThrow();
  });

  it('accepts publication references retained as static text without a target ID', () => {
    const entries = createBundleEntries({ recipe: { id: recipeId, name: 'Lemon cake' } });
    const data = JSON.parse(new TextDecoder().decode(entries.get('data.json')));
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
    entries.set('data.json', dataBytes);
    entries.set('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));

    expect(() => validateImportBundleFiles(entries)).not.toThrow();
  });

  it('accepts references whose publication ID is optional by type', () => {
    const entries = createBundleEntries({ recipe: { id: recipeId, name: 'Lemon cake' } });
    const data = JSON.parse(new TextDecoder().decode(entries.get('data.json')));
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
});
