import {
  ImageProcessingError,
  type NormalizedImage,
  normalizeImage,
} from '../../../../../lib/media/image-processing';
import { inspectImageBuffer } from '../../../../../lib/media/rules';
import {
  discardPendingMediaUpload,
  type PendingMediaUpload,
  processMediaDeletions,
  queueMediaDeletions,
} from '../../../../../lib/media/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { createClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UploadRouteContext = {
  params: Promise<{ id: string }>;
};

function uploadErrorStatus(code: string) {
  if (code === 'P0002') {
    return 404;
  }
  if (code === '54000') {
    return 413;
  }
  if (code === '40001' || code === '55000') {
    return 409;
  }
  return 422;
}

export async function POST(request: Request, context: UploadRouteContext) {
  const { id } = await context.params;
  if (!uuidPattern.test(id)) {
    return Response.json({ error: 'The image upload is unavailable.' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'Sign in before completing this upload.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The upload completion request is invalid.' }, { status: 400 });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'The upload completion request is invalid.' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  if (description.length > 250) {
    return Response.json(
      { error: 'Photo descriptions must be 250 characters or fewer.' },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: uploadData, error: uploadError } = await admin
    .from('media_assets')
    .select(
      'id, account_id, asset_type, recipe_id, publication_id, status, staging_path, full_path, thumbnail_path, created_by_user_id',
    )
    .eq('id', id)
    .eq('account_id', authData.user.id)
    .eq('created_by_user_id', authData.user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (uploadError) {
    throw new Error('Unable to verify this image upload.');
  }
  if (!uploadData?.staging_path) {
    return Response.json({ error: 'The image upload is no longer available.' }, { status: 404 });
  }
  const upload = uploadData as PendingMediaUpload;
  const stagingPath = upload.staging_path;
  if (!stagingPath) {
    return Response.json({ error: 'The image upload is no longer available.' }, { status: 404 });
  }

  const { data: original, error: downloadError } = await admin.storage
    .from('recipe-media')
    .download(stagingPath);
  if (downloadError || !original) {
    await discardPendingMediaUpload(admin, upload);
    await processMediaDeletions(admin, [stagingPath]);
    return Response.json(
      { error: 'The image did not finish uploading. Choose it again and retry.' },
      { status: 409 },
    );
  }

  const source = Buffer.from(await original.arrayBuffer());
  const inspected = inspectImageBuffer(source);
  if (!inspected.ok) {
    await discardPendingMediaUpload(admin, upload);
    await processMediaDeletions(admin, [stagingPath]);
    return Response.json(
      {
        error:
          inspected.reason === 'too_large'
            ? 'Images must be 20 MiB or smaller.'
            : 'Choose a JPEG, PNG, WebP, or HEIC image.',
      },
      { status: inspected.reason === 'too_large' ? 413 : 415 },
    );
  }

  let variants: NormalizedImage;
  try {
    variants = await normalizeImage(source, inspected.format);
  } catch (error) {
    await discardPendingMediaUpload(admin, upload);
    await processMediaDeletions(admin, [stagingPath]);
    if (error instanceof ImageProcessingError) {
      const status = error.code === 'image_too_large' ? 413 : 415;
      return Response.json({ error: error.message }, { status });
    }
    throw error;
  }

  const fullPath = `${upload.account_id}/assets/${upload.id}/full.webp`;
  const thumbnailPath = `${upload.account_id}/assets/${upload.id}/thumb.webp`;
  const uploadedPaths: string[] = [];
  const fullUpload = await admin.storage
    .from('recipe-media')
    .upload(fullPath, variants.full.buffer, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: true,
    });
  if (fullUpload.error) {
    await discardPendingMediaUpload(admin, upload);
    await queueMediaDeletions(admin, upload.account_id, [fullPath, thumbnailPath]);
    await processMediaDeletions(admin, [stagingPath, fullPath, thumbnailPath]);
    return Response.json({ error: 'Unable to save the processed image.' }, { status: 502 });
  }
  uploadedPaths.push(fullPath);

  const thumbnailUpload = await admin.storage
    .from('recipe-media')
    .upload(thumbnailPath, variants.thumbnail.buffer, {
      contentType: 'image/webp',
      cacheControl: '3600',
      upsert: true,
    });
  if (thumbnailUpload.error) {
    await discardPendingMediaUpload(admin, upload);
    await queueMediaDeletions(admin, upload.account_id, [fullPath, thumbnailPath]);
    await processMediaDeletions(admin, [stagingPath, fullPath, thumbnailPath]);
    return Response.json({ error: 'Unable to save the processed image.' }, { status: 502 });
  }
  uploadedPaths.push(thumbnailPath);

  const { error: finalizeError } = await admin.rpc('complete_media_upload', {
    p_asset_id: upload.id,
    p_width: variants.full.width,
    p_height: variants.full.height,
    p_byte_size: variants.full.bytes + variants.thumbnail.bytes,
    p_description: description,
  });
  if (finalizeError) {
    await discardPendingMediaUpload(admin, upload);
    await queueMediaDeletions(admin, upload.account_id, uploadedPaths);
    await processMediaDeletions(admin, [stagingPath, ...uploadedPaths]);
    return Response.json(
      { error: finalizeError.message || 'Unable to finish saving this image.' },
      { status: uploadErrorStatus(finalizeError.code) },
    );
  }

  const { error: sourceDeleteError } = await admin.storage
    .from('recipe-media')
    .remove([stagingPath]);
  if (sourceDeleteError) {
    await queueMediaDeletions(admin, upload.account_id, [stagingPath]);
  } else {
    const { error: clearSourceError } = await admin
      .from('media_assets')
      .update({ staging_path: null })
      .eq('id', upload.id);
    if (clearSourceError) {
      await queueMediaDeletions(admin, upload.account_id, [stagingPath]);
    }
  }

  const [fullUrlResult, thumbnailUrlResult] = await Promise.all([
    admin.storage.from('recipe-media').createSignedUrl(fullPath, 900),
    admin.storage.from('recipe-media').createSignedUrl(thumbnailPath, 900),
  ]);
  if (fullUrlResult.error || thumbnailUrlResult.error) {
    throw new Error('The image was saved but could not be prepared for viewing.');
  }

  return Response.json(
    {
      assetId: upload.id,
      fullUrl: fullUrlResult.data.signedUrl,
      thumbnailUrl: thumbnailUrlResult.data.signedUrl,
      width: variants.full.width,
      height: variants.full.height,
      bytes: variants.full.bytes + variants.thumbnail.bytes,
      cleanupPending: Boolean(sourceDeleteError),
    },
    { status: 201 },
  );
}

export async function DELETE(_request: Request, context: UploadRouteContext) {
  const { id } = await context.params;
  if (!uuidPattern.test(id)) {
    return Response.json({ error: 'The image upload is unavailable.' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'Sign in before cancelling this upload.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: uploadData, error } = await admin
    .from('media_assets')
    .select(
      'id, account_id, asset_type, recipe_id, publication_id, status, staging_path, full_path, thumbnail_path, created_by_user_id',
    )
    .eq('id', id)
    .eq('account_id', authData.user.id)
    .eq('created_by_user_id', authData.user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) {
    throw new Error('Unable to verify this image upload.');
  }
  if (!uploadData) {
    return Response.json({ error: 'The image upload is no longer available.' }, { status: 404 });
  }

  await discardPendingMediaUpload(admin, uploadData as PendingMediaUpload);
  const cleanup = await processMediaDeletions(admin, [uploadData.staging_path]);
  return Response.json({ cancelled: true, cleanupPending: cleanup.failed.length > 0 });
}
