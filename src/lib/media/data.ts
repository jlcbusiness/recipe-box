import type { RecipeSupabaseClient } from '../recipes/data';

export type MediaAssetDisplay = {
  id: string;
  asset_type: 'recipe_photo' | 'publication_cover';
  description: string;
  position: number;
  is_primary: boolean;
  byte_size: number;
  width: number;
  height: number;
  full_url: string;
  thumbnail_url: string;
};

type MediaAssetRow = Omit<MediaAssetDisplay, 'full_url' | 'thumbnail_url'> & {
  full_path: string;
  thumbnail_path: string;
};

const signedUrlLifetimeSeconds = 900;

async function signMediaRows(
  supabase: RecipeSupabaseClient,
  rows: MediaAssetRow[],
): Promise<MediaAssetDisplay[]> {
  return Promise.all(
    rows.map(async (row) => {
      const [fullResult, thumbnailResult] = await Promise.all([
        supabase.storage
          .from('recipe-media')
          .createSignedUrl(row.full_path, signedUrlLifetimeSeconds),
        supabase.storage
          .from('recipe-media')
          .createSignedUrl(row.thumbnail_path, signedUrlLifetimeSeconds),
      ]);
      if (fullResult.error || thumbnailResult.error) {
        throw new Error('Unable to prepare this image for viewing.');
      }

      const { full_path: _fullPath, thumbnail_path: _thumbnailPath, ...metadata } = row;
      return {
        ...metadata,
        full_url: fullResult.data.signedUrl,
        thumbnail_url: thumbnailResult.data.signedUrl,
      };
    }),
  );
}

export async function getRecipePhotos(
  supabase: RecipeSupabaseClient,
  recipeId: string,
): Promise<MediaAssetDisplay[]> {
  const { data, error } = await supabase
    .from('media_assets')
    .select(
      'id, asset_type, description, position, is_primary, byte_size, width, height, full_path, thumbnail_path',
    )
    .eq('recipe_id', recipeId)
    .eq('asset_type', 'recipe_photo')
    .eq('status', 'ready')
    .order('position')
    .order('created_at');

  if (error) {
    throw new Error('Unable to load recipe photos.');
  }

  return signMediaRows(supabase, (data ?? []) as MediaAssetRow[]);
}

export async function getPrimaryRecipePhotos(
  supabase: RecipeSupabaseClient,
  recipeIds: string[],
): Promise<Map<string, MediaAssetDisplay>> {
  if (recipeIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('media_assets')
    .select(
      'id, recipe_id, asset_type, description, position, is_primary, byte_size, width, height, full_path, thumbnail_path',
    )
    .in('recipe_id', recipeIds)
    .eq('asset_type', 'recipe_photo')
    .eq('status', 'ready')
    .eq('is_primary', true);

  if (error) {
    throw new Error('Unable to load recipe photos.');
  }

  const rows = (data ?? []) as (MediaAssetRow & { recipe_id: string })[];
  const signed = await signMediaRows(supabase, rows);
  return new Map(rows.map((row, index) => [row.recipe_id, signed[index]]));
}

export async function getPublicationCover(
  supabase: RecipeSupabaseClient,
  publicationId: string,
): Promise<MediaAssetDisplay | null> {
  const { data, error } = await supabase
    .from('media_assets')
    .select(
      'id, asset_type, description, position, is_primary, byte_size, width, height, full_path, thumbnail_path',
    )
    .eq('publication_id', publicationId)
    .eq('asset_type', 'publication_cover')
    .eq('status', 'ready')
    .maybeSingle();

  if (error) {
    throw new Error('Unable to load the publication cover.');
  }

  if (!data) {
    return null;
  }

  const [cover] = await signMediaRows(supabase, [data as MediaAssetRow]);
  return cover;
}

export async function getPublicationCovers(
  supabase: RecipeSupabaseClient,
  publicationIds: string[],
): Promise<Map<string, MediaAssetDisplay>> {
  if (publicationIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('media_assets')
    .select(
      'id, publication_id, asset_type, description, position, is_primary, byte_size, width, height, full_path, thumbnail_path',
    )
    .in('publication_id', publicationIds)
    .eq('asset_type', 'publication_cover')
    .eq('status', 'ready');

  if (error) {
    throw new Error('Unable to load publication covers.');
  }

  const rows = (data ?? []) as (MediaAssetRow & { publication_id: string })[];
  const signed = await signMediaRows(supabase, rows);
  return new Map(rows.map((row, index) => [row.publication_id, signed[index]]));
}
