import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { type ImportImageSink, readImportArchive } from './archive';
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

  const { data: signedDownload, error: signedDownloadError } = await admin.storage
    .from(exportBucket)
    .createSignedUrl(objectPath, 60);
  if (signedDownloadError || !signedDownload?.signedUrl) {
    throw new ImportBundleError('The selected import archive is unavailable.', 404);
  }

  const response = await fetch(signedDownload.signedUrl, { cache: 'no-store' });
  if (!response.ok || !response.body) {
    throw new ImportBundleError('The selected import archive could not be read.', 422);
  }

  try {
    const archive = await readImportArchive(response.body, imageSink);
    const bundle = validateImportBundleFiles(archive.entries, archive.images);
    if (bundle.data.scope.type !== 'database') {
      throw new ImportBundleError('Only database exports can be imported here.', 422);
    }
    return bundle;
  } catch (error) {
    if (error instanceof ImportBundleError) throw error;
    if (error instanceof Error) {
      throw new ImportBundleError(error.message, 422);
    }
    throw new ImportBundleError('The selected import archive is invalid.', 422);
  }
}
