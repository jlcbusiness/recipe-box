import { Readable } from 'node:stream';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import {
  createImportImageStager,
  MAX_IMPORT_MEDIA_OBJECT_BYTES,
} from '../../src/lib/imports/media';

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceAssetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const destinationAssetId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function createWebp(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 50, b: 80 } },
  })
    .webp()
    .toBuffer();
}

function createAdmin(upload: ReturnType<typeof vi.fn>) {
  return { storage: { from: vi.fn(() => ({ upload })) } } as never;
}

describe('import image staging', () => {
  it('maps verified variants to owner-scoped paths using the planned destination ID', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fullImage = await createWebp(2, 2);
    const thumbnail = await createWebp(1, 1);
    const stager = createImportImageStager(
      createAdmin(upload),
      accountId,
      new Map([[sourceAssetId, destinationAssetId]]),
    );

    await stager.imageSink(`images/${sourceAssetId}/full.webp`, Readable.from([fullImage]));
    await stager.imageSink(`images/${sourceAssetId}/thumbnail.webp`, Readable.from([thumbnail]));

    expect(upload).toHaveBeenNthCalledWith(
      1,
      `${accountId}/assets/${destinationAssetId}/full.webp`,
      fullImage,
      { cacheControl: '3600', contentType: 'image/webp', upsert: false },
    );
    expect(stager.pathsBySourceAsset.get(sourceAssetId)).toEqual({
      fullPath: `${accountId}/assets/${destinationAssetId}/full.webp`,
      thumbnailPath: `${accountId}/assets/${destinationAssetId}/thumb.webp`,
    });
    expect(stager.stagedPaths).toEqual(
      new Set([
        `${accountId}/assets/${destinationAssetId}/full.webp`,
        `${accountId}/assets/${destinationAssetId}/thumb.webp`,
      ]),
    );
    expect(stager.metadataBySourceAsset.get(sourceAssetId)).toEqual({
      byteSize: fullImage.byteLength + thumbnail.byteLength,
      width: 2,
      height: 2,
    });
  });

  it('rejects bytes that are not valid WebP image data', async () => {
    const upload = vi.fn();
    const stager = createImportImageStager(
      createAdmin(upload),
      accountId,
      new Map([[sourceAssetId, destinationAssetId]]),
    );

    await expect(
      stager.imageSink(
        `images/${sourceAssetId}/full.webp`,
        Readable.from([Buffer.from('not webp')]),
      ),
    ).rejects.toThrow(/variant is invalid/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('consumes assets omitted by Keep Existing without uploading them', async () => {
    const upload = vi.fn();
    const stager = createImportImageStager(createAdmin(upload), accountId, new Map());

    await stager.imageSink(
      `images/${sourceAssetId}/full.webp`,
      Readable.from([Buffer.from('omitted')]),
    );

    expect(upload).not.toHaveBeenCalled();
    expect(stager.stagedPaths.size).toBe(0);
  });

  it('rejects an image variant larger than the Storage object limit', async () => {
    const upload = vi.fn();
    const stager = createImportImageStager(
      createAdmin(upload),
      accountId,
      new Map([[sourceAssetId, destinationAssetId]]),
    );

    await expect(
      stager.imageSink(
        `images/${sourceAssetId}/full.webp`,
        Readable.from([Buffer.alloc(MAX_IMPORT_MEDIA_OBJECT_BYTES + 1)]),
      ),
    ).rejects.toThrow(/Storage object limit/);
    expect(upload).not.toHaveBeenCalled();
  });
});
