import 'server-only';

import type { Readable } from 'node:stream';
import type { SupabaseClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { FULL_IMAGE_MAX_EDGE, THUMBNAIL_MAX_EDGE } from '../media/rules';

export const MAX_IMPORT_MEDIA_OBJECT_BYTES = 20 * 1024 * 1024;

const imagePathPattern =
  /^images\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(full|thumbnail)\.webp$/i;

export type StagedImportImagePaths = {
  fullPath: string;
  thumbnailPath: string;
};

export type StagedImportImageMetadata = {
  byteSize: number;
  width?: number;
  height?: number;
};

export function createImportImageStager(
  admin: SupabaseClient,
  accountId: string,
  destinationAssetIds: ReadonlyMap<string, string>,
) {
  const stagedPaths = new Set<string>();
  const pathsBySourceAsset = new Map<string, Partial<StagedImportImagePaths>>();
  const metadataBySourceAsset = new Map<string, StagedImportImageMetadata>();

  async function imageSink(path: string, stream: Readable) {
    const match = imagePathPattern.exec(path);
    const sourceAssetId = match?.[1];
    const destinationAssetId = sourceAssetId ? destinationAssetIds.get(sourceAssetId) : undefined;
    if (!match || !sourceAssetId || !destinationAssetId) {
      for await (const _chunk of stream) {
        // Consume images omitted by the selected Keep Existing choices.
      }
      return;
    }

    const chunks: Buffer[] = [];
    let byteSize = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk);
      byteSize += bytes.byteLength;
      if (byteSize > MAX_IMPORT_MEDIA_OBJECT_BYTES) {
        throw new Error('An image variant exceeds the supported Storage object limit.');
      }
      chunks.push(bytes);
    }

    const variant = match[2]?.toLowerCase();
    const image = Buffer.concat(chunks, byteSize);
    let imageMetadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
    try {
      imageMetadata = await sharp(image, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
      }).metadata();
    } catch {
      throw new Error('An imported image variant is invalid.');
    }
    const maxEdge = variant === 'thumbnail' ? THUMBNAIL_MAX_EDGE : FULL_IMAGE_MAX_EDGE;
    if (
      imageMetadata.format !== 'webp' ||
      !imageMetadata.width ||
      !imageMetadata.height ||
      (imageMetadata.pages !== undefined && imageMetadata.pages > 1) ||
      imageMetadata.width > maxEdge ||
      imageMetadata.height > maxEdge
    ) {
      throw new Error('An imported image variant is invalid.');
    }
    const fileName = variant === 'thumbnail' ? 'thumb.webp' : 'full.webp';
    const objectPath = `${accountId}/assets/${destinationAssetId}/${fileName}`;
    stagedPaths.add(objectPath);
    const { error } = await admin.storage.from('recipe-media').upload(objectPath, image, {
      cacheControl: '3600',
      contentType: 'image/webp',
      upsert: false,
    });
    if (error) {
      throw new Error('Unable to stage an imported image.');
    }

    const currentPaths = pathsBySourceAsset.get(sourceAssetId) ?? {};
    if (variant === 'thumbnail') {
      currentPaths.thumbnailPath = objectPath;
    } else {
      currentPaths.fullPath = objectPath;
    }
    pathsBySourceAsset.set(sourceAssetId, currentPaths);

    const currentMetadata = metadataBySourceAsset.get(sourceAssetId) ?? { byteSize: 0 };
    currentMetadata.byteSize += byteSize;
    if (variant !== 'thumbnail') {
      currentMetadata.width = imageMetadata.width;
      currentMetadata.height = imageMetadata.height;
    }
    metadataBySourceAsset.set(sourceAssetId, currentMetadata);
  }

  return { imageSink, pathsBySourceAsset, metadataBySourceAsset, stagedPaths };
}
