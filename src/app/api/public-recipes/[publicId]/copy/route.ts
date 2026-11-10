import { queueMediaDeletions } from '../../../../../lib/media/server';
import { buildPublicRecipeCopyPayload } from '../../../../../lib/recipes/public-copy-rules';
import { getPublicRecipeCopySource } from '../../../../../lib/recipes/public-data';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { createClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const maximumPhotoBytes = 20 * 1024 * 1024;
const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' };

type CopyRouteContext = { params: Promise<{ publicId: string }> };
type ExistingCopy = { recipeId: string };
type StagedPhoto = {
  id: string;
  description: string;
  is_primary: boolean;
  position: number;
  width: number;
  height: number;
  full_path: string;
  thumbnail_path: string;
  source_full_path: string;
  source_thumbnail_path: string;
  source_byte_size: number;
  byte_size: number;
  content_type: 'image/webp';
  crop: null;
};

function jsonResponse(body: unknown, status: number) {
  return Response.json(body, { status, headers: noStoreHeaders });
}

function reportFailure(operation: string, code?: string) {
  console.error('Public recipe copy failed.', { operation, code: code ?? 'unknown' });
}

async function findExistingCopy(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  publicId: string,
) {
  const { data: recipe, error } = await admin
    .from('recipes')
    .select(
      'id, recipe_references!recipe_references_account_id_recipe_id_fkey!inner(source_public_id,is_protected_source)',
    )
    .eq('account_id', accountId)
    .eq('recipe_references.source_public_id', publicId)
    .eq('recipe_references.is_protected_source', true)
    .is('trashed_at', null)
    .maybeSingle();
  if (error) {
    reportFailure('existing_copy_lookup', error.code);
    return { error: true, copy: null };
  }
  if (!recipe) return { error: false, copy: null };
  if (typeof recipe.id !== 'string') {
    reportFailure('existing_copy_recipe_missing');
    return { error: true, copy: null };
  }

  return { error: false, copy: { recipeId: recipe.id } satisfies ExistingCopy };
}

async function queueCleanup(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  paths: string[],
) {
  if (!paths.length) return true;
  try {
    await queueMediaDeletions(admin, accountId, paths);
    return true;
  } catch (error) {
    reportFailure('media_cleanup_queue', error instanceof Error ? error.name : undefined);
    return false;
  }
}

export async function POST(_request: Request, context: CopyRouteContext) {
  const { publicId } = await context.params;
  if (!uuidPattern.test(publicId)) {
    return jsonResponse({ error: 'This recipe is currently unavailable.' }, 404);
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (error) {
    reportFailure('session_client', error instanceof Error ? error.name : undefined);
    return jsonResponse({ error: 'Unable to verify your sign-in. Please try again.' }, 503);
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Sign in before saving a public recipe.' }, 401);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    reportFailure('public_site_url_configuration');
    return jsonResponse({ error: 'Unable to save this recipe right now.' }, 503);
  }
  let publicUrl: string;
  try {
    publicUrl = new URL(`/r/${publicId}`, siteUrl).toString();
  } catch {
    reportFailure('public_site_url_configuration');
    return jsonResponse({ error: 'Unable to save this recipe right now.' }, 503);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    reportFailure('admin_client_configuration', error instanceof Error ? error.name : undefined);
    return jsonResponse({ error: 'Unable to save this recipe right now.' }, 503);
  }

  const existing = await findExistingCopy(admin, authData.user.id, publicId);
  if (existing.error) {
    return jsonResponse({ error: 'Unable to check your Recipe Tin. Please try again.' }, 503);
  }
  if (existing.copy) {
    return jsonResponse({ alreadySaved: true, ...existing.copy }, 200);
  }

  const source = await getPublicRecipeCopySource(publicId);
  if (source.status !== 'active') {
    return source.status === 'error'
      ? jsonResponse({ error: 'Unable to load this recipe. Please try again.' }, 503)
      : jsonResponse({ error: 'This recipe is currently unavailable.' }, 404);
  }

  const payload = buildPublicRecipeCopyPayload(source);
  const photoAssets: StagedPhoto[] = [];
  const cleanupPaths: string[] = [];
  const storage = admin.storage.from('recipe-media');

  for (const [position, photo] of payload.photos.entries()) {
    const photoSource = source.photoSources[position];
    if (!photoSource) {
      reportFailure('photo_source_mapping');
      await queueCleanup(admin, authData.user.id, cleanupPaths);
      return jsonResponse({ error: 'Unable to prepare this recipe photo.' }, 503);
    }

    const fullPath = `${authData.user.id}/assets/${photo.id}/full.webp`;
    const thumbnailPath = `${authData.user.id}/assets/${photo.id}/thumb.webp`;
    const variants = [
      { sourcePath: photoSource.fullPath, destinationPath: fullPath },
      { sourcePath: photoSource.thumbnailPath, destinationPath: thumbnailPath },
    ];
    let fullByteSize = 0;
    for (const [variantIndex, variant] of variants.entries()) {
      const { data: image, error: downloadError } = await storage.download(variant.sourcePath);
      if (downloadError || !image || image.size <= 0 || image.size > maximumPhotoBytes) {
        reportFailure('photo_download', downloadError?.name);
        const cleanupQueued = await queueCleanup(admin, authData.user.id, cleanupPaths);
        return jsonResponse(
          {
            error: cleanupQueued
              ? 'Unable to copy the public recipe photos. Please try again.'
              : 'Unable to copy the public recipe photos; cleanup is still pending.',
          },
          downloadError || !image ? 502 : 413,
        );
      }

      const upload = await storage.upload(variant.destinationPath, image, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false,
      });
      if (upload.error) {
        reportFailure('photo_upload', upload.error.name);
        cleanupPaths.push(fullPath, thumbnailPath);
        const cleanupQueued = await queueCleanup(admin, authData.user.id, cleanupPaths);
        return jsonResponse(
          {
            error: cleanupQueued
              ? 'Unable to save the public recipe photos. Please try again.'
              : 'Unable to save the public recipe photos; cleanup is still pending.',
          },
          502,
        );
      }
      cleanupPaths.push(variant.destinationPath);
      if (variantIndex === 0) fullByteSize = image.size;
      else fullByteSize += image.size;
    }

    photoAssets.push({
      ...photo,
      full_path: fullPath,
      thumbnail_path: thumbnailPath,
      source_full_path: fullPath,
      source_thumbnail_path: thumbnailPath,
      source_byte_size: fullByteSize,
      byte_size: fullByteSize,
      content_type: 'image/webp',
      crop: null,
    });
  }

  const { data: copyResult, error: copyError } = await admin.rpc('save_public_recipe_copy', {
    p_destination_account_id: authData.user.id,
    p_source_public_id: publicId,
    p_public_url: publicUrl,
    p_recipe_payload: payload.recipe,
    p_photo_assets: photoAssets,
  });
  if (copyError || !copyResult || typeof copyResult !== 'object') {
    reportFailure('database_save', copyError?.code);
    const cleanupQueued = await queueCleanup(admin, authData.user.id, cleanupPaths);
    if (copyError?.code === '23505' || copyError?.code === 'P0001') {
      const racedCopy = await findExistingCopy(admin, authData.user.id, publicId);
      if (!racedCopy.error && racedCopy.copy) {
        return jsonResponse({ alreadySaved: true, ...racedCopy.copy }, 200);
      }
    }
    if (copyError?.code === 'P0002') {
      return jsonResponse({ error: 'This recipe is currently unavailable.' }, 404);
    }
    return jsonResponse(
      {
        error: cleanupQueued
          ? 'Unable to save this recipe. Please try again.'
          : 'Unable to save this recipe; cleanup is still pending.',
      },
      503,
    );
  }

  const result = copyResult as { recipe_id?: unknown; already_saved?: unknown };
  if (typeof result.recipe_id !== 'string') {
    reportFailure('database_save_response');
    const cleanupQueued = await queueCleanup(admin, authData.user.id, cleanupPaths);
    return jsonResponse(
      {
        error: cleanupQueued
          ? 'Unable to save this recipe. Please try again.'
          : 'Unable to save this recipe; cleanup is still pending.',
      },
      503,
    );
  }
  if (result.already_saved === true) {
    const cleanupQueued = await queueCleanup(admin, authData.user.id, cleanupPaths);
    if (!cleanupQueued) {
      return jsonResponse({ error: 'Unable to clean up duplicate recipe photos.' }, 503);
    }
    const savedCopy = await findExistingCopy(admin, authData.user.id, publicId);
    if (savedCopy.error || !savedCopy.copy) {
      return jsonResponse({ error: 'Unable to check your Recipe Tin. Please try again.' }, 503);
    }
    return jsonResponse({ alreadySaved: true, ...savedCopy.copy }, 200);
  }

  return jsonResponse({ alreadySaved: false, recipeId: result.recipe_id }, 201);
}
