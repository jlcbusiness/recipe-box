import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type Archiver, ZipArchive } from 'archiver';
import {
  assertExportLimits,
  type BundleManifestFile,
  buildPortableData,
  createBundleManifest,
  type ExportRecord,
  type ExportScope,
  type ExportSnapshot,
} from './rules';

const exportBucket = 'recipe-exports';
const mediaBucket = 'recipe-media';
const signedUrlLifetimeSeconds = 15 * 60;
const minimumExportLifetimeMilliseconds = 24 * 60 * 60 * 1000;
const appVersion = process.env.npm_package_version ?? '0.1.0';

type CleanupResult = {
  processed: number;
  failed: string[];
};

export class ExportTooLargeError extends Error {}

function asRecord(value: unknown): ExportRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ExportRecord)
    : null;
}

function rowsFromSnapshot(snapshot: ExportSnapshot, table: string): ExportRecord[] {
  const value = snapshot.records[table as keyof ExportSnapshot['records']];
  return Array.isArray(value) ? value : [];
}

export function isExportScopeAvailable(snapshot: ExportSnapshot, scope: ExportScope): boolean {
  if (scope.type === 'database') {
    return asRecord(snapshot.accountPreferences) !== null;
  }

  const table = scope.type === 'recipe' ? 'recipes' : 'publications';
  const record = rowsFromSnapshot(snapshot, table).find((row) => row.id === scope.id);
  return !!record && record.trashed_at == null;
}

function storageObjectPath(value: unknown, accountId: string): string {
  if (typeof value !== 'string') {
    throw new Error('An image object is unavailable.');
  }
  const segments = value.split('/');
  if (
    !value.startsWith(`${accountId}/`) ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    value.includes('\\')
  ) {
    throw new Error('An image object is unavailable.');
  }
  return value;
}

function appendEntry(archive: Archiver, path: string, bytes: Buffer) {
  return new Promise<void>((resolve, reject) => {
    const removeListeners = () => {
      archive.off('entry', onEntry);
      archive.off('error', onError);
    };
    const onEntry = () => {
      removeListeners();
      resolve();
    };
    const onError = (error: Error) => {
      removeListeners();
      reject(error);
    };

    archive.once('entry', onEntry);
    archive.once('error', onError);
    archive.append(bytes, { name: path });
  });
}

function assertLimits(dataBytes: number, mediaBytes: number): void {
  try {
    assertExportLimits(dataBytes, mediaBytes);
  } catch (error) {
    throw new ExportTooLargeError(
      error instanceof Error ? error.message : 'The export is too large.',
    );
  }
}

async function downloadImage(
  admin: SupabaseClient,
  accountId: string,
  path: unknown,
): Promise<Buffer> {
  const objectPath = storageObjectPath(path, accountId);
  const { data, error } = await admin.storage.from(mediaBucket).download(objectPath);
  if (error || !data) {
    throw new Error('A required image could not be downloaded.');
  }
  return Buffer.from(await data.arrayBuffer());
}

async function removeExportObject(admin: SupabaseClient, objectPath: string): Promise<void> {
  const { error } = await admin.storage.from(exportBucket).remove([objectPath]);
  if (error) {
    throw new Error('Unable to remove an incomplete export archive.');
  }
}

async function queueExportCleanup(
  admin: SupabaseClient,
  accountId: string,
  objectPath: string,
): Promise<void> {
  const deleteAfter = new Date(
    Date.now() + minimumExportLifetimeMilliseconds + 60_000,
  ).toISOString();
  const { error } = await admin.from('export_deletion_queue').insert({
    account_id: accountId,
    object_path: objectPath,
    delete_after: deleteAfter,
  });
  if (error) {
    throw new Error('Unable to schedule export archive cleanup.');
  }
}

export async function createExportDownload(
  admin: SupabaseClient,
  accountId: string,
  snapshot: ExportSnapshot,
  scope: ExportScope,
  signal?: AbortSignal,
): Promise<{ downloadUrl: string; expiresAt: string }> {
  const portableData = buildPortableData(snapshot, scope);
  const scopedRecord =
    scope.type === 'recipe'
      ? portableData.records.recipes.find((record) => record.id === scope.id)
      : scope.type === 'publication'
        ? portableData.records.publications.find((record) => record.id === scope.id)
        : null;
  const entityName = scope.type === 'database' ? 'Recipe Box' : scopedRecord?.name;
  const safeEntityName =
    (typeof entityName === 'string' ? entityName : 'Untitled')
      .normalize('NFKC')
      .replace(/[<>:"/\\|?*\p{Cc}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '')
      .slice(0, 100)
      .trim() || 'Untitled';
  const scopeName = scope.type[0].toUpperCase() + scope.type.slice(1);
  const downloadFilename = `${safeEntityName} - ${scopeName} Export.zip`;
  const dataBytes = Buffer.from(JSON.stringify(portableData), 'utf8');
  assertLimits(dataBytes.byteLength, 0);

  const objectPath = `${accountId}/exports/${randomUUID()}.zip`;
  const createdAt = new Date();
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const fileMetadata: BundleManifestFile[] = [];
  let mediaBytes = 0;
  let cleanupQueued = false;
  let uploadFailure: Error | null = null;
  const abortArchive = () => archive.destroy(new Error('The export request was canceled.'));
  signal?.addEventListener('abort', abortArchive, { once: true });

  const uploadPromise = admin.storage
    .from(exportBucket)
    .upload(objectPath, archive, {
      cacheControl: '0',
      contentType: 'application/zip',
      duplex: 'half',
      upsert: false,
    })
    .then((result) => {
      if (result.error) {
        uploadFailure = new Error('Unable to upload the export archive.');
        archive.destroy(uploadFailure);
        throw uploadFailure;
      }
      return result.data;
    });
  void uploadPromise.catch(() => undefined);

  try {
    if (signal?.aborted) {
      throw new Error('The export request was canceled.');
    }
    archive.on('warning', (warning) => {
      uploadFailure = warning;
      archive.destroy(warning);
    });
    archive.on('error', (error) => {
      uploadFailure = error;
    });

    const dataDigest = createHash('sha256').update(dataBytes).digest('hex');
    fileMetadata.push({ path: 'data.json', size_bytes: dataBytes.byteLength, sha256: dataDigest });
    await appendEntry(archive, 'data.json', dataBytes);

    const selectedAssets = portableData.records.media_assets;
    const sourceAssets = new Map(
      rowsFromSnapshot(snapshot, 'media_assets').map((asset) => [asset.id, asset]),
    );

    for (const asset of selectedAssets) {
      const source = sourceAssets.get(asset.id);
      if (!source) {
        throw new Error('A selected image record is unavailable.');
      }

      const assetId = String(asset.id);
      let assetBytes = 0;
      const variants = [
        { column: 'full_path', entry: `images/${assetId}/full.webp` },
        {
          column: 'thumbnail_path',
          entry: `images/${assetId}/thumbnail.webp`,
        },
      ];

      for (const variant of variants) {
        const bytes = await downloadImage(admin, accountId, source[variant.column]);
        if (signal?.aborted) {
          throw new Error('The export request was canceled.');
        }
        mediaBytes += bytes.byteLength;
        assetBytes += bytes.byteLength;
        assertLimits(dataBytes.byteLength, mediaBytes);

        fileMetadata.push({
          path: variant.entry,
          size_bytes: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
        await appendEntry(archive, variant.entry, bytes);
      }

      if (Number(source.byte_size) !== assetBytes) {
        throw new Error('An image size does not match its stored metadata.');
      }
    }

    const manifest = createBundleManifest(scope, fileMetadata, appVersion, createdAt);
    await appendEntry(archive, 'manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));
    await archive.finalize();
    if (uploadFailure) {
      throw uploadFailure;
    }
    await uploadPromise;

    await queueExportCleanup(admin, accountId, objectPath);
    cleanupQueued = true;

    const expiresAt = new Date(Date.now() + signedUrlLifetimeSeconds * 1000).toISOString();
    const { data: signedUrl, error: signedUrlError } = await admin.storage
      .from(exportBucket)
      .createSignedUrl(objectPath, signedUrlLifetimeSeconds, { download: downloadFilename });
    if (signedUrlError || !signedUrl?.signedUrl) {
      throw new Error('Unable to create a secure export download.');
    }

    if (scope.type === 'database') {
      if (signal?.aborted) {
        throw new Error('The export request was canceled.');
      }
      const { data: updatedAccount, error: timestampError } = await admin
        .from('accounts')
        .update({ last_database_export_at: createdAt.toISOString() })
        .eq('id', accountId)
        .select('id')
        .maybeSingle();
      if (timestampError || !updatedAccount) {
        throw new Error('Unable to record the completed database export.');
      }
    }

    return { downloadUrl: signedUrl.signedUrl, expiresAt };
  } catch (error) {
    archive.abort();
    if (!cleanupQueued) {
      try {
        await removeExportObject(admin, objectPath);
      } catch {
        try {
          await queueExportCleanup(admin, accountId, objectPath);
          cleanupQueued = true;
        } catch {
          throw new Error('The export failed and its temporary archive could not be cleaned up.');
        }
      }
    }
    if (error instanceof ExportTooLargeError) {
      throw error;
    }
    throw new Error('Unable to prepare the export. Please try again.');
  } finally {
    signal?.removeEventListener('abort', abortArchive);
  }
}

export async function processExportCleanup(admin: SupabaseClient): Promise<CleanupResult> {
  const { data, error } = await admin
    .from('export_deletion_queue')
    .select('id, account_id, object_path, attempts')
    .lte('delete_after', new Date().toISOString())
    .order('delete_after')
    .limit(100);
  if (error) {
    throw new Error('Unable to load queued export cleanup tasks.');
  }

  const result: CleanupResult = { processed: 0, failed: [] };
  for (const task of data ?? []) {
    const expectedPrefix = `${task.account_id}/exports/`;
    const validPath =
      task.object_path.startsWith(expectedPrefix) && task.object_path.endsWith('.zip');
    const removeResult = validPath
      ? await admin.storage.from(exportBucket).remove([task.object_path])
      : { error: new Error('Invalid export cleanup path.') };

    if (removeResult.error) {
      const { error: updateError } = await admin
        .from('export_deletion_queue')
        .update({ attempts: task.attempts + 1, last_error: 'Unable to remove export archive.' })
        .eq('id', task.id);
      if (updateError) {
        throw new Error('Unable to record an export cleanup failure.');
      }
      result.failed.push(task.object_path);
      continue;
    }

    const { error: deleteError } = await admin
      .from('export_deletion_queue')
      .delete()
      .eq('id', task.id);
    if (deleteError) {
      throw new Error('Unable to complete an export cleanup task.');
    }
    result.processed += 1;
  }

  return result;
}
