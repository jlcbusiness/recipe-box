import { randomUUID } from 'node:crypto';
import { isOwnedImportArchivePath } from '../../../../lib/imports/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';

const exportBucket = 'recipe-exports';
const minimumLifetimeMilliseconds = 24 * 60 * 60 * 1000;

export async function POST() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'Sign in before importing data.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const objectPath = `${authData.user.id}/imports/${randomUUID()}.zip`;
  const { data: signedUpload, error: signedUploadError } = await admin.storage
    .from(exportBucket)
    .createSignedUploadUrl(objectPath, { upsert: false });
  if (signedUploadError || !signedUpload?.token) {
    return Response.json({ error: 'Unable to prepare a secure import upload.' }, { status: 503 });
  }

  const queuedAt = new Date();
  const deleteAfter = new Date(queuedAt.getTime() + minimumLifetimeMilliseconds + 60_000);
  const { error: cleanupError } = await admin.from('export_deletion_queue').insert({
    account_id: authData.user.id,
    object_path: objectPath,
    queued_at: queuedAt.toISOString(),
    delete_after: deleteAfter.toISOString(),
  });
  if (cleanupError) {
    await admin.storage.from(exportBucket).remove([objectPath]);
    return Response.json({ error: 'Unable to prepare a secure import upload.' }, { status: 503 });
  }

  return Response.json({ path: objectPath, token: signedUpload.token }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'Sign in before cancelling this import.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The import cleanup request is invalid.' }, { status: 400 });
  }
  const path =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).path
      : null;
  if (!isOwnedImportArchivePath(authData.user.id, path)) {
    return Response.json({ error: 'The selected import archive is unavailable.' }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error: removeError } = await admin.storage.from(exportBucket).remove([path]);
  if (removeError) {
    return Response.json(
      { error: 'The temporary archive is still queued for cleanup. Retry cancellation later.' },
      { status: 503 },
    );
  }

  const { error: queueError } = await admin
    .from('export_deletion_queue')
    .delete()
    .eq('account_id', authData.user.id)
    .eq('object_path', path);
  return Response.json({ cancelled: true, cleanupPending: Boolean(queueError) });
}
