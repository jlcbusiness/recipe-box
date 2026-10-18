import {
  discardPendingMediaUpload,
  type PendingMediaUpload,
  processMediaDeletions,
  queueMediaDeletions,
} from '../../../../lib/media/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'Sign in before uploading images.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The upload request is not valid JSON.' }, { status: 400 });
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json(
      { error: 'Choose a recipe or publication for this image.' },
      { status: 400 },
    );
  }

  const payload = body as Record<string, unknown>;
  if (
    !['recipe', 'publication'].includes(String(payload.parentType)) ||
    typeof payload.parentId !== 'string' ||
    !uuidPattern.test(payload.parentId)
  ) {
    return Response.json({ error: 'Choose a valid recipe or publication.' }, { status: 400 });
  }

  const parentType = payload.parentType as 'recipe' | 'publication';
  const { data: assetId, error: reserveError } = await supabase.rpc('reserve_media_upload', {
    p_parent_type: parentType,
    p_parent_id: payload.parentId,
  });
  if (reserveError || typeof assetId !== 'string') {
    const status =
      reserveError?.code === 'P0002'
        ? 404
        : reserveError?.code === '54000' || reserveError?.code === '55000'
          ? 409
          : 422;
    return Response.json(
      {
        error:
          status === 404
            ? 'The selected recipe or publication is unavailable.'
            : reserveError?.message || 'Unable to prepare this image upload.',
      },
      { status },
    );
  }

  const admin = createAdminClient();
  const stagingPath = `${authData.user.id}/staging/${assetId}/source`;
  const { data: signedUpload, error: signedUploadError } = await admin.storage
    .from('recipe-media')
    .createSignedUploadUrl(stagingPath, { upsert: false });

  if (signedUploadError) {
    const { data: reservedUpload, error: lookupError } = await admin
      .from('media_assets')
      .select(
        'id, account_id, asset_type, recipe_id, publication_id, status, staging_path, full_path, thumbnail_path, created_by_user_id',
      )
      .eq('id', assetId)
      .maybeSingle();
    if (lookupError) {
      throw new Error('Unable to cancel the incomplete image upload.');
    }
    if (reservedUpload) {
      await discardPendingMediaUpload(admin, reservedUpload);
    }
    return Response.json({ error: 'Unable to prepare secure image upload.' }, { status: 503 });
  }

  return Response.json(
    {
      assetId,
      path: stagingPath,
      token: signedUpload.token,
    },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'Sign in before cancelling image uploads.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The cancellation request is invalid.' }, { status: 400 });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Choose a publication for this image.' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  if (
    payload.parentType !== 'publication' ||
    typeof payload.parentId !== 'string' ||
    !uuidPattern.test(payload.parentId)
  ) {
    return Response.json({ error: 'Choose a valid publication.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('media_assets')
    .select(
      'id, account_id, asset_type, recipe_id, publication_id, status, staging_path, full_path, thumbnail_path, created_by_user_id',
    )
    .eq('account_id', authData.user.id)
    .eq('created_by_user_id', authData.user.id)
    .eq('publication_id', payload.parentId)
    .eq('asset_type', 'publication_cover')
    .eq('status', 'pending')
    .maybeSingle();
  if (error) {
    throw new Error('Unable to check for an incomplete cover upload.');
  }
  if (!data) {
    return Response.json({ cancelled: false, cleanupPending: false });
  }

  const upload = data as PendingMediaUpload;
  let cleanupPending = false;
  try {
    await discardPendingMediaUpload(admin, upload);
  } catch {
    const { data: pendingUpload, error: verificationError } = await admin
      .from('media_assets')
      .select('id')
      .eq('id', upload.id)
      .eq('account_id', authData.user.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (verificationError || pendingUpload) {
      throw new Error('Unable to cancel the incomplete upload.');
    }

    const cleanupPaths = [upload.staging_path, upload.full_path, upload.thumbnail_path];
    try {
      await queueMediaDeletions(admin, upload.account_id, cleanupPaths);
    } catch {
      const paths = cleanupPaths.filter((path): path is string => Boolean(path));
      if (paths.length > 0) {
        const { error: storageError } = await admin.storage.from('recipe-media').remove(paths);
        cleanupPending = Boolean(storageError);
      }
    }
  }

  try {
    const cleanup = await processMediaDeletions(
      admin,
      [upload.staging_path, upload.full_path, upload.thumbnail_path].filter(
        (path): path is string => Boolean(path),
      ),
    );
    cleanupPending ||= cleanup.failed.length > 0;
  } catch {
    cleanupPending = true;
  }
  return Response.json({ cancelled: true, cleanupPending });
}
