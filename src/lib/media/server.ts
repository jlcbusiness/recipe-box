import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

type AdminSupabaseClient = SupabaseClient;

export type PendingMediaUpload = {
  id: string;
  account_id: string;
  asset_type: 'recipe_photo' | 'publication_cover';
  recipe_id: string | null;
  publication_id: string | null;
  status: 'pending' | 'ready';
  staging_path: string | null;
  full_path: string | null;
  thumbnail_path: string | null;
  created_by_user_id: string;
};

type CleanupResult = {
  processed: number;
  failed: string[];
};

function objectFolderAndName(path: string) {
  const separator = path.lastIndexOf('/');
  return {
    folder: path.slice(0, separator),
    name: path.slice(separator + 1),
  };
}

export async function queueMediaDeletions(
  admin: AdminSupabaseClient,
  accountId: string,
  paths: Array<string | null>,
) {
  const rows = [...new Set(paths.filter((path): path is string => Boolean(path)))].map(
    (objectPath) => ({ account_id: accountId, object_path: objectPath }),
  );
  if (rows.length === 0) {
    return;
  }

  const { error } = await admin
    .from('media_deletion_queue')
    .upsert(rows, { onConflict: 'object_path', ignoreDuplicates: true });
  if (error) {
    throw new Error('Unable to queue image files for cleanup.');
  }
}

export async function discardPendingMediaUpload(
  admin: AdminSupabaseClient,
  upload: PendingMediaUpload,
) {
  const { error } = await admin.rpc('discard_pending_media_upload', {
    p_asset_id: upload.id,
    p_account_id: upload.account_id,
  });
  if (error) {
    throw new Error('Unable to cancel the incomplete image upload.');
  }

  await queueMediaDeletions(admin, upload.account_id, [
    upload.staging_path,
    upload.full_path,
    upload.thumbnail_path,
  ]);
}

async function deleteStoredObject(admin: AdminSupabaseClient, path: string) {
  const { folder, name } = objectFolderAndName(path);
  const { data, error } = await admin.storage.from('recipe-media').list(folder, {
    limit: 100,
    search: name,
  });
  if (error) {
    return error.message;
  }

  if (data.some((object) => object.name === name)) {
    const { error: removeError } = await admin.storage.from('recipe-media').remove([path]);
    if (removeError) {
      return removeError.message;
    }
  }

  const { error: clearPathError } = await admin
    .from('media_assets')
    .update({ staging_path: null })
    .eq('staging_path', path);
  if (clearPathError) {
    return clearPathError.message;
  }

  return null;
}

async function processDeletionQueue(
  admin: AdminSupabaseClient,
  result: CleanupResult,
  paths?: string[],
) {
  let query = admin
    .from('media_deletion_queue')
    .select('id, object_path, attempts')
    .order('queued_at')
    .limit(100);
  if (paths) {
    if (paths.length === 0) {
      return;
    }
    query = query.in('object_path', paths);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error('Unable to load queued image cleanup tasks.');
  }

  for (const item of (data ?? []) as { id: number; object_path: string; attempts: number }[]) {
    const failure = await deleteStoredObject(admin, item.object_path);
    if (failure) {
      const { error: updateError } = await admin
        .from('media_deletion_queue')
        .update({
          attempts: item.attempts + 1,
          last_error: failure.slice(0, 500),
        })
        .eq('id', item.id);
      if (updateError) {
        throw new Error('Unable to record an image cleanup failure.');
      }
      result.failed.push(item.object_path);
      continue;
    }

    const { error: deleteError } = await admin
      .from('media_deletion_queue')
      .delete()
      .eq('id', item.id);
    if (deleteError) {
      throw new Error('Unable to complete an image cleanup task.');
    }
    result.processed += 1;
  }
}

export async function processMediaCleanup(admin: AdminSupabaseClient): Promise<CleanupResult> {
  const result: CleanupResult = { processed: 0, failed: [] };
  const staleBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: staleUploads, error } = await admin
    .from('media_assets')
    .select(
      'id, account_id, asset_type, recipe_id, publication_id, status, staging_path, full_path, thumbnail_path, created_by_user_id',
    )
    .eq('status', 'pending')
    .lt('created_at', staleBefore)
    .limit(100);
  if (error) {
    throw new Error('Unable to load expired image uploads.');
  }

  for (const upload of (staleUploads ?? []) as PendingMediaUpload[]) {
    await discardPendingMediaUpload(admin, upload);
  }

  await processDeletionQueue(admin, result);
  return result;
}

export async function processMediaDeletions(
  admin: AdminSupabaseClient,
  paths: string[],
): Promise<CleanupResult> {
  const result: CleanupResult = { processed: 0, failed: [] };
  await processDeletionQueue(admin, result, paths);
  return result;
}
