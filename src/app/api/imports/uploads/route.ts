import { randomUUID } from 'node:crypto';
import { isOwnedImportPath } from '../../../../lib/imports/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';

const exportBucket = 'recipe-exports';
const minimumLifetimeMilliseconds = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'Sign in before importing data.' }, { status: 401 });
  }

  let extension: 'zip' | 'json' | 'jsonc' = 'zip';
  if (request.body) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'The import upload request is invalid.' }, { status: 400 });
    }
    if (
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      (body as Record<string, unknown>).type !== 'recipe-json' ||
      !['json', 'jsonc'].includes(String((body as Record<string, unknown>).extension))
    ) {
      return Response.json({ error: 'Choose a supported import file type.' }, { status: 400 });
    }
    extension = (body as Record<string, unknown>).extension as 'json' | 'jsonc';
  }

  const admin = createAdminClient();
  const objectPath = `${authData.user.id}/imports/${randomUUID()}.${extension}`;
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
  if (!isOwnedImportPath(authData.user.id, path)) {
    return Response.json({ error: 'The selected import file is unavailable.' }, { status: 404 });
  }

  const admin = createAdminClient();
  const { error: removeError } = await admin.storage.from(exportBucket).remove([path]);
  if (removeError) {
    return Response.json(
      { error: 'The temporary import file is still queued for cleanup. Retry cancellation later.' },
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
