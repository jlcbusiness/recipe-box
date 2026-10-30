import type { RecipeSupabaseClient } from '../recipes/data';
import type { CropRect } from './rules';

export type MediaAssetDisplay = {
  id: string;
  asset_type: 'recipe_photo' | 'publication_cover';
  reference_code: number | null;
  description: string;
  position: number;
  is_primary: boolean;
  byte_size: number;
  width: number;
  height: number;
  display_width: number;
  display_height: number;
  crop: CropRect | null;
  saved_crop: CropRect | null;
  full_url: string;
  thumbnail_url: string;
  source_full_url: string;
};

type MediaAssetRow = Omit<
  MediaAssetDisplay,
  'crop' | 'saved_crop' | 'full_url' | 'thumbnail_url' | 'source_full_url'
> & {
  crop: CropRect | null;
  full_path: string;
  thumbnail_path: string;
  source_full_path: string;
  source_thumbnail_path: string;
  source_byte_size: number;
};

const signedUrlLifetimeSeconds = 900;

async function signMediaRows(
  supabase: RecipeSupabaseClient,
  rows: MediaAssetRow[],
): Promise<MediaAssetDisplay[]> {
  return Promise.all(
    rows.map(async (row) => {
      const [fullResult, thumbnailResult, sourceFullResult] = await Promise.all([
        supabase.storage
          .from('recipe-media')
          .createSignedUrl(row.full_path, signedUrlLifetimeSeconds),
        supabase.storage
          .from('recipe-media')
          .createSignedUrl(row.thumbnail_path, signedUrlLifetimeSeconds),
        row.source_full_path === row.full_path
          ? Promise.resolve(null)
          : supabase.storage
              .from('recipe-media')
              .createSignedUrl(row.source_full_path, signedUrlLifetimeSeconds),
      ]);
      if (fullResult.error || thumbnailResult.error || sourceFullResult?.error) {
        throw new Error('Unable to prepare this image for viewing.');
      }

      const {
        crop: savedCrop,
        full_path: _fullPath,
        source_full_path: _sourceFullPath,
        source_thumbnail_path: _sourceThumbnailPath,
        source_byte_size: _sourceByteSize,
        thumbnail_path: _thumbnailPath,
        ...metadata
      } = row;
      return {
        ...metadata,
        crop: row.full_path === row.source_full_path ? savedCrop : null,
        saved_crop: savedCrop,
        full_url: fullResult.data.signedUrl,
        thumbnail_url: thumbnailResult.data.signedUrl,
        source_full_url: sourceFullResult?.data.signedUrl ?? fullResult.data.signedUrl,
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
      'id, asset_type, reference_code, description, position, is_primary, byte_size, width, height, display_width, display_height, crop, full_path, thumbnail_path, source_full_path, source_thumbnail_path, source_byte_size',
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
      'id, recipe_id, asset_type, reference_code, description, position, is_primary, byte_size, width, height, display_width, display_height, crop, full_path, thumbnail_path, source_full_path, source_thumbnail_path, source_byte_size',
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
      'id, asset_type, reference_code, description, position, is_primary, byte_size, width, height, display_width, display_height, crop, full_path, thumbnail_path, source_full_path, source_thumbnail_path, source_byte_size',
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
      'id, publication_id, asset_type, reference_code, description, position, is_primary, byte_size, width, height, display_width, display_height, crop, full_path, thumbnail_path, source_full_path, source_thumbnail_path, source_byte_size',
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
