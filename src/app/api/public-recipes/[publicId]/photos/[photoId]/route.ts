import { createPublicPhotoId } from '../../../../../../lib/recipes/public-photo-id';
import { createAdminClient } from '../../../../../../lib/supabase/admin';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const noStoreHeaders = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
};

type PublicPhotoRouteContext = {
  params: Promise<{ publicId: string; photoId: string }>;
};

function unavailable(status = 404) {
  return new Response(null, { status, headers: noStoreHeaders });
}

function reportFailure(operation: string, code?: string) {
  console.error('Public recipe photo request failed.', {
    operation,
    code: code ?? 'unknown',
  });
}

export async function GET(request: Request, context: PublicPhotoRouteContext) {
  const { publicId, photoId } = await context.params;
  const variant = new URL(request.url).searchParams.get('variant');
  if (
    !uuidPattern.test(publicId) ||
    !uuidPattern.test(photoId) ||
    (variant !== 'full' && variant !== 'thumbnail')
  ) {
    return unavailable();
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    reportFailure('admin_client_configuration');
    return unavailable(500);
  }

  const { data: recipe, error: recipeError } = await admin
    .from('recipes')
    .select('id, is_private, trashed_at')
    .eq('public_id', publicId)
    .maybeSingle();
  if (recipeError) {
    reportFailure('recipe_visibility', recipeError.code);
    return unavailable(500);
  }
  if (!recipe || recipe.is_private || recipe.trashed_at) {
    return unavailable();
  }

  const { data: assets, error: assetError } = await admin
    .from('media_assets')
    .select('id, full_path, thumbnail_path')
    .eq('recipe_id', recipe.id)
    .eq('asset_type', 'recipe_photo')
    .eq('status', 'ready')
    .order('position')
    .order('created_at');
  if (assetError) {
    reportFailure('recipe_photo_lookup', assetError.code);
    return unavailable(500);
  }

  const asset = (assets ?? []).find(
    (candidate) => createPublicPhotoId(publicId, candidate.id) === photoId.toLocaleLowerCase(),
  );
  const path = variant === 'full' ? asset?.full_path : asset?.thumbnail_path;
  if (!asset || !path) {
    return unavailable();
  }

  const { data: photo, error: downloadError } = await admin.storage
    .from('recipe-media')
    .download(path);
  if (downloadError || !photo) {
    reportFailure('storage_download', downloadError?.name);
    return unavailable(502);
  }

  const { data: currentRecipe, error: currentRecipeError } = await admin
    .from('recipes')
    .select('is_private, trashed_at')
    .eq('id', recipe.id)
    .maybeSingle();
  if (currentRecipeError) {
    reportFailure('final_recipe_visibility', currentRecipeError.code);
    return unavailable(500);
  }
  if (!currentRecipe || currentRecipe.is_private || currentRecipe.trashed_at) {
    return unavailable();
  }

  return new Response(photo.stream(), {
    status: 200,
    headers: {
      ...noStoreHeaders,
      'Content-Length': String(photo.size),
      'Content-Type': 'image/webp',
    },
  });
}
