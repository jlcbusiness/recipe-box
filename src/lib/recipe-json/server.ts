import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import standardSchema from '../../../schemas/recipe-json-v1.schema.json';
import { isOwnedRecipeJsonImportPath } from '../imports/server';
import type { RecipeJsonDocument } from './portable-data';
import {
  parseRecipeJsonBytes,
  RECIPE_JSON_DATA_BYTES_LIMIT,
  RecipeJsonValidationError,
} from './validation.mjs';

const exportBucket = 'recipe-exports';

export class RecipeJsonUploadError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}

export async function readStoredRecipeJson(
  admin: SupabaseClient,
  accountId: string,
  objectPath: unknown,
): Promise<RecipeJsonDocument> {
  if (!isOwnedRecipeJsonImportPath(accountId, objectPath)) {
    throw new RecipeJsonUploadError('The selected JSON file is unavailable.', 404);
  }

  const { data: signedDownload, error: signedDownloadError } = await admin.storage
    .from(exportBucket)
    .createSignedUrl(objectPath, 300);
  if (signedDownloadError || !signedDownload?.signedUrl) {
    throw new RecipeJsonUploadError('The selected JSON file is unavailable.', 404);
  }

  const response = await fetch(signedDownload.signedUrl);
  if (!response.ok || !response.body) {
    throw new RecipeJsonUploadError('Unable to read the selected JSON file.', 503);
  }
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > RECIPE_JSON_DATA_BYTES_LIMIT) {
    await response.body.cancel();
    throw new RecipeJsonValidationError('The JSON file exceeds the 64 MiB size limit.');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > RECIPE_JSON_DATA_BYTES_LIMIT) {
      await reader.cancel();
      throw new RecipeJsonValidationError('The JSON file exceeds the 64 MiB size limit.');
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks, totalBytes);
  try {
    return parseRecipeJsonBytes(bytes, objectPath, standardSchema) as RecipeJsonDocument;
  } catch (error) {
    if (error instanceof RecipeJsonValidationError) throw error;
    throw new RecipeJsonValidationError('The selected JSON file is invalid.');
  }
}
