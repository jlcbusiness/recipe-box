import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createRangeArchiveSource, type ImportImageSink, readImportArchive } from './archive';
import { validateImportBundleFiles } from './rules';

const exportBucket = 'recipe-exports';
const importPathPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/imports\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.zip$/i;

export class ImportBundleError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}

export function isOwnedImportArchivePath(accountId: string, path: unknown): path is string {
  if (typeof path !== 'string') return false;
  const match = importPathPattern.exec(path);
  return !!match && match[1].toLowerCase() === accountId.toLowerCase();
}

export async function readStoredImportBundle(
  admin: SupabaseClient,
  accountId: string,
  objectPath: string,
  imageSink?: ImportImageSink,
) {
  if (!isOwnedImportArchivePath(accountId, objectPath)) {
    throw new ImportBundleError('The selected import archive is unavailable.', 404);
  }

  console.info('[import-preview] signed download URL request started');
  const { data: signedDownload, error: signedDownloadError } = await admin.storage
    .from(exportBucket)
    .createSignedUrl(objectPath, 300);
  if (signedDownloadError || !signedDownload?.signedUrl) {
    console.error('[import-preview] signed download URL request failed');
    throw new ImportBundleError('The selected import archive is unavailable.', 404);
  }
  console.info('[import-preview] signed download URL ready');

  try {
    console.info('[import-preview] archive parsing started');
    const archive = await readImportArchive(
      createRangeArchiveSource(signedDownload.signedUrl),
      imageSink,
    );
    console.info('[import-preview] archive parsing completed', {
      entryCount: archive.entries.size,
      imageCount: archive.images.size,
    });
    console.info('[import-preview] bundle validation started');
    const bundle = validateImportBundleFiles(archive.entries, archive.images);
    console.info('[import-preview] bundle validation completed');
    return bundle;
  } catch (error) {
    console.error('[import-preview] archive processing failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    if (error instanceof ImportBundleError) throw error;
    if (error instanceof Error) {
      throw new ImportBundleError(error.message, 422);
    }
    throw new ImportBundleError('The selected import archive is invalid.', 422);
  }
}
