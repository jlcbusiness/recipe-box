import { randomUUID } from 'node:crypto';
import {
  cropImage,
  ImageProcessingError,
  type NormalizedImage,
} from '../../../../../lib/media/image-processing';
import { isValidNormalizedCrop } from '../../../../../lib/media/rules';
import {
  processMediaCleanup,
  processMediaDeletions,
  queueMediaDeletions,
} from '../../../../../lib/media/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { createClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MediaAssetRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: MediaAssetRouteContext) {
  const { id } = await context.params;
  if (!uuidPattern.test(id)) {
    return Response.json({ error: 'The image is unavailable.' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'Sign in before changing images.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The image update request is invalid.' }, { status: 400 });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'The image update request is invalid.' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  if (
    payload.action === 'crop' &&
    typeof payload.expected_version === 'number' &&
    Number.isSafeInteger(payload.expected_version) &&
    payload.expected_version > 0 &&
    (payload.crop === null || isValidNormalizedCrop(payload.crop))
  ) {
    const { data: asset, error: assetError } = await supabase
      .from('media_assets')
      .select(
        'id, account_id, crop, full_path, thumbnail_path, byte_size, width, height, display_width, display_height, source_full_path, source_thumbnail_path, source_byte_size',
      )
      .eq('id', id)
      .eq('status', 'ready')
      .maybeSingle();
    if (assetError) {
      throw new Error('Unable to verify this image before saving its framing.');
    }
    if (!asset) {
      return Response.json({ error: 'The image is unavailable.' }, { status: 404 });
    }

    const admin = createAdminClient();
    const requestedCrop = payload.crop;
    const cropUnchanged =
      requestedCrop === null
        ? asset.crop === null
        : isValidNormalizedCrop(asset.crop) &&
          asset.crop.left === requestedCrop.left &&
          asset.crop.top === requestedCrop.top &&
          asset.crop.width === requestedCrop.width &&
          asset.crop.height === requestedCrop.height &&
          asset.crop.rotation === requestedCrop.rotation;
    const alreadyMaterialized =
      asset.full_path !== asset.source_full_path &&
      asset.thumbnail_path !== asset.source_thumbnail_path;
    const canReuseCurrent =
      cropUnchanged && (requestedCrop === null ? !alreadyMaterialized : alreadyMaterialized);

    let fullPath = asset.source_full_path;
    let thumbnailPath = asset.source_thumbnail_path;
    let byteSize = Number(asset.source_byte_size);
    let displayWidth = Number(asset.width);
    let displayHeight = Number(asset.height);
    const generatedPaths: string[] = [];

    if (canReuseCurrent) {
      fullPath = asset.full_path;
      thumbnailPath = asset.thumbnail_path;
      byteSize = Number(asset.byte_size);
      displayWidth = Number(asset.display_width);
      displayHeight = Number(asset.display_height);
    } else if (requestedCrop !== null) {
      const { data: source, error: sourceError } = await admin.storage
        .from('recipe-media')
        .download(asset.source_full_path);
      if (sourceError || !source) {
        return Response.json({ error: 'The source image could not be loaded.' }, { status: 502 });
      }

      let variants: NormalizedImage;
      try {
        variants = await cropImage(Buffer.from(await source.arrayBuffer()), requestedCrop);
      } catch (error) {
        if (error instanceof ImageProcessingError) {
          return Response.json({ error: error.message }, { status: 422 });
        }
        throw error;
      }

      const versionedFolder = `${authData.user.id}/assets/${id}/framing/${randomUUID()}`;
      fullPath = `${versionedFolder}/full.webp`;
      thumbnailPath = `${versionedFolder}/thumb.webp`;
      byteSize = Number(asset.source_byte_size) + variants.full.bytes + variants.thumbnail.bytes;
      displayWidth = variants.full.width;
      displayHeight = variants.full.height;
      generatedPaths.push(fullPath, thumbnailPath);

      const fullUpload = await admin.storage
        .from('recipe-media')
        .upload(fullPath, variants.full.buffer, {
          cacheControl: '31536000',
          contentType: 'image/webp',
          upsert: false,
        });
      if (fullUpload.error) {
        await queueMediaDeletions(admin, authData.user.id, generatedPaths);
        const cleanup = await processMediaDeletions(admin, generatedPaths);
        return Response.json(
          {
            error:
              cleanup.failed.length > 0
                ? 'Unable to save the framed image; temporary storage cleanup is queued.'
                : 'Unable to save the framed image.',
          },
          { status: cleanup.failed.length > 0 ? 503 : 502 },
        );
      }

      const thumbnailUpload = await admin.storage
        .from('recipe-media')
        .upload(thumbnailPath, variants.thumbnail.buffer, {
          cacheControl: '31536000',
          contentType: 'image/webp',
          upsert: false,
        });
      if (thumbnailUpload.error) {
        await queueMediaDeletions(admin, authData.user.id, generatedPaths);
        const cleanup = await processMediaDeletions(admin, generatedPaths);
        return Response.json(
          {
            error:
              cleanup.failed.length > 0
                ? 'Unable to save the framed image; temporary storage cleanup is queued.'
                : 'Unable to save the framed image.',
          },
          { status: cleanup.failed.length > 0 ? 503 : 502 },
        );
      }
    }

    const { data, error } = await supabase.rpc('update_media_crop_assets_with_dimensions', {
      p_asset_id: id,
      p_expected_version: payload.expected_version,
      p_crop: requestedCrop,
      p_full_path: fullPath,
      p_thumbnail_path: thumbnailPath,
      p_byte_size: byteSize,
      p_display_width: displayWidth,
      p_display_height: displayHeight,
    });
    if (error) {
      if (generatedPaths.length > 0) {
        await queueMediaDeletions(admin, authData.user.id, generatedPaths);
        const cleanup = await processMediaDeletions(admin, generatedPaths);
        if (cleanup.failed.length > 0) {
          return Response.json(
            { error: 'The framing was not saved; temporary storage cleanup is queued.' },
            { status: 503 },
          );
        }
      }
      const status =
        error.code === 'P0002'
          ? 404
          : error.code === '40001' || error.code === 'PT409' || error.code === '55000'
            ? 409
            : error.code === '42501'
              ? 403
              : 422;
      return Response.json({ error: error.message || 'Unable to save image framing.' }, { status });
    }

    const updated = Array.isArray(data) ? data[0] : null;
    const previousPaths =
      updated && typeof updated === 'object'
        ? [
            'previous_full_path' in updated ? updated.previous_full_path : null,
            'previous_thumbnail_path' in updated ? updated.previous_thumbnail_path : null,
          ]
        : [];
    const obsoletePaths = previousPaths.filter(
      (path): path is string =>
        typeof path === 'string' &&
        path !== asset.source_full_path &&
        path !== asset.source_thumbnail_path &&
        path !== fullPath &&
        path !== thumbnailPath,
    );
    await queueMediaDeletions(admin, authData.user.id, obsoletePaths);
    const cleanup = await processMediaDeletions(admin, obsoletePaths);

    return Response.json({
      changed: !canReuseCurrent,
      cleanupPending: cleanup.failed.length > 0,
      version:
        updated && typeof updated === 'object' && 'version' in updated
          ? updated.version
          : undefined,
    });
  }

  let rpc:
    | 'set_recipe_photo_primary'
    | 'update_media_description'
    | 'delete_media_asset'
    | 'delete_recipe_photo_with_references';
  let parameters: Record<string, unknown>;

  if (payload.action === 'primary') {
    rpc = 'set_recipe_photo_primary';
    parameters = { p_asset_id: id };
  } else if (payload.action === 'description' && typeof payload.description === 'string') {
    rpc = 'update_media_description';
    parameters = { p_asset_id: id, p_description: payload.description.trim() };
  } else if (payload.action === 'delete') {
    if (payload.expected_version === undefined) {
      rpc = 'delete_media_asset';
      parameters = { p_asset_id: id };
    } else if (
      typeof payload.expected_version === 'number' &&
      Number.isSafeInteger(payload.expected_version) &&
      payload.expected_version > 0
    ) {
      rpc = 'delete_recipe_photo_with_references';
      parameters = {
        p_asset_id: id,
        p_expected_version: payload.expected_version,
      };
    } else {
      return Response.json(
        { error: 'Reload the recipe before removing this photo.' },
        { status: 400 },
      );
    }
  } else {
    return Response.json({ error: 'Choose a valid image change.' }, { status: 400 });
  }

  const { error } = await supabase.rpc(rpc, parameters);
  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '40001' || error.code === 'PT409' || error.code === '55000'
          ? 409
          : error.code === '42501'
            ? 403
            : 422;
    return Response.json({ error: error.message || 'Unable to change this image.' }, { status });
  }

  if (payload.action === 'delete') {
    const cleanup = await processMediaCleanup(createAdminClient());
    return Response.json({
      changed: true,
      cleanupPending: cleanup.failed.length > 0,
      message:
        cleanup.failed.length > 0
          ? 'Image removed. Storage cleanup is queued for retry.'
          : 'Image removed.',
    });
  }

  return Response.json({ changed: true });
}
