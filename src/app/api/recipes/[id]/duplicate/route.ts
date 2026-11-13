import { Readable } from 'node:stream';
import type { ExportSnapshot, PortableData } from '../../../../../lib/exports/rules';
import { buildPortableData } from '../../../../../lib/exports/rules';
import {
  createImportImageStager,
  MAX_IMPORT_MEDIA_OBJECT_BYTES,
} from '../../../../../lib/imports/media';
import { planImport } from '../../../../../lib/imports/planning';
import { processMediaDeletions, queueMediaDeletions } from '../../../../../lib/media/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { createClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' };

type DuplicateRouteContext = { params: Promise<{ id: string }> };
type DuplicateRequest = { name: string; publicationId: string };
type DuplicateFailure = { status: number; message: string };

function jsonResponse(body: unknown, status: number) {
  return Response.json(body, { status, headers: noStoreHeaders });
}

function reportFailure(operation: string, code?: string) {
  console.error('Recipe duplication failed.', { operation, code: code ?? 'unknown' });
}

function parseDuplicateRequest(value: unknown): DuplicateRequest | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length !== 2 || entries.some(([key]) => key !== 'name' && key !== 'publicationId')) {
    return null;
  }
  const request = value as Record<string, unknown>;
  if (
    typeof request.name !== 'string' ||
    !request.name.trim() ||
    typeof request.publicationId !== 'string' ||
    !uuidPattern.test(request.publicationId)
  ) {
    return null;
  }
  return { name: request.name.trim(), publicationId: request.publicationId.toLowerCase() };
}

function ownedAssetPath(value: unknown, accountId: string, assetId: string): string | null {
  if (typeof value !== 'string') return null;
  const prefix = `${accountId}/assets/${assetId}/`;
  const segments = value.split('/');
  if (
    !value.startsWith(prefix) ||
    value.includes('\\') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }
  return value;
}

async function cleanupStagedMedia(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  paths: ReadonlySet<string>,
) {
  if (paths.size === 0) return true;
  try {
    const stagedPaths = [...paths];
    await queueMediaDeletions(admin, accountId, stagedPaths);
    const result = await processMediaDeletions(admin, stagedPaths);
    if (result.failed.length > 0) reportFailure('media_cleanup', 'incomplete');
    return result.failed.length === 0;
  } catch (error) {
    reportFailure('media_cleanup', error instanceof Error ? error.name : undefined);
    return false;
  }
}

async function stageRecipePhotos(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  snapshot: ExportSnapshot,
  incoming: PortableData,
  plan: ReturnType<typeof planImport>,
  onStagedPaths: (paths: Set<string>) => void,
) {
  const destinationIds = new Map<string, string>();
  for (const asset of incoming.records.media_assets) {
    const sourceId = String(asset.id);
    const destinationId = plan.idMappings.media_assets.get(sourceId);
    if (!destinationId) {
      throw new Error('The duplicate plan is missing a destination photo identity.');
    }
    destinationIds.set(sourceId, destinationId);
  }

  const stager = createImportImageStager(admin, accountId, destinationIds);
  onStagedPaths(stager.stagedPaths);
  const sourceAssets = snapshot.records.media_assets ?? [];
  const storage = admin.storage.from('recipe-media');
  try {
    for (const asset of incoming.records.media_assets) {
      const sourceId = String(asset.id);
      const sourceAsset = sourceAssets.find((item) => String(item.id) === sourceId);
      if (!sourceAsset) throw new Error('A source recipe photo is unavailable.');

      const fullPath = ownedAssetPath(sourceAsset.full_path, accountId, sourceId);
      const thumbnailPath = ownedAssetPath(sourceAsset.thumbnail_path, accountId, sourceId);
      const rawSourceFullPath = ownedAssetPath(
        sourceAsset.source_full_path ?? sourceAsset.full_path,
        accountId,
        sourceId,
      );
      const rawSourceThumbnailPath = ownedAssetPath(
        sourceAsset.source_thumbnail_path ?? sourceAsset.thumbnail_path,
        accountId,
        sourceId,
      );
      if (!fullPath || !thumbnailPath || !rawSourceFullPath || !rawSourceThumbnailPath) {
        throw new Error('A source recipe photo path is invalid.');
      }

      const variants = [
        { name: 'full', path: fullPath },
        { name: 'thumbnail', path: thumbnailPath },
        ...(rawSourceFullPath === fullPath
          ? []
          : [{ name: 'source-full', path: rawSourceFullPath }]),
        ...(rawSourceThumbnailPath === thumbnailPath
          ? []
          : [{ name: 'source-thumbnail', path: rawSourceThumbnailPath }]),
      ] as const;
      for (const variant of variants) {
        const { data: image, error } = await storage.download(variant.path);
        if (error || !image || image.size <= 0 || image.size > MAX_IMPORT_MEDIA_OBJECT_BYTES) {
          throw new Error('A source recipe photo could not be copied.');
        }
        await stager.imageSink(
          `images/${sourceId}/${variant.name}.webp`,
          Readable.from([Buffer.from(await image.arrayBuffer())]),
        );
      }
    }
    await stager.finish();

    const mediaSources: Array<{
      id: string;
      source_full_path: string;
      source_thumbnail_path: string;
      source_byte_size: number;
      display_width: number;
      display_height: number;
    }> = [];
    for (const [sourceId, destinationId] of destinationIds) {
      const paths = stager.pathsBySourceAsset.get(sourceId);
      const metadata = stager.metadataBySourceAsset.get(sourceId);
      const plannedAsset = plan.records.media_assets.find((asset) => asset.id === destinationId);
      if (!paths?.fullPath || !paths.thumbnailPath || !metadata || !plannedAsset) {
        throw new Error('The duplicate plan is missing a staged photo variant.');
      }
      const sourceFullPath = paths.sourceFullPath ?? paths.fullPath;
      const sourceThumbnailPath = paths.sourceThumbnailPath ?? paths.thumbnailPath;
      const sourceByteSize =
        (metadata.variantByteSizes[paths.sourceFullPath ? 'source-full' : 'full'] ?? 0) +
        (metadata.variantByteSizes[paths.sourceThumbnailPath ? 'source-thumbnail' : 'thumbnail'] ??
          0);
      const displayWidth = metadata.width;
      const displayHeight = metadata.height;
      if (
        typeof displayWidth !== 'number' ||
        typeof displayHeight !== 'number' ||
        metadata.byteSize !== Number(plannedAsset.byte_size) ||
        (metadata.sourceWidth ?? displayWidth) !== Number(plannedAsset.width) ||
        (metadata.sourceHeight ?? displayHeight) !== Number(plannedAsset.height) ||
        sourceByteSize !== Number(plannedAsset.source_byte_size)
      ) {
        throw new Error('A staged photo does not match its source metadata.');
      }

      Object.assign(plannedAsset, {
        full_path: paths.fullPath,
        thumbnail_path: paths.thumbnailPath,
        source_full_path: sourceFullPath,
        source_thumbnail_path: sourceThumbnailPath,
      });
      mediaSources.push({
        id: destinationId,
        source_full_path: sourceFullPath,
        source_thumbnail_path: sourceThumbnailPath,
        source_byte_size: sourceByteSize,
        display_width: displayWidth,
        display_height: displayHeight,
      });
    }
    return { mediaSources, stagedPaths: stager.stagedPaths };
  } catch (error) {
    try {
      await stager.finish();
    } catch (finishError) {
      reportFailure(
        'photo_upload_completion',
        finishError instanceof Error ? finishError.name : undefined,
      );
    }
    throw error;
  }
}

export async function POST(request: Request, context: DuplicateRouteContext) {
  const { id: requestedSourceRecipeId } = await context.params;
  if (!uuidPattern.test(requestedSourceRecipeId)) {
    return jsonResponse({ error: 'This recipe is currently unavailable.' }, 404);
  }
  const sourceRecipeId = requestedSourceRecipeId.toLowerCase();

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (error) {
    reportFailure('session_client', error instanceof Error ? error.name : undefined);
    return jsonResponse({ error: 'Unable to verify your sign-in. Please try again.' }, 503);
  }
  let authData: Awaited<ReturnType<typeof supabase.auth.getUser>>['data'];
  let authError: Awaited<ReturnType<typeof supabase.auth.getUser>>['error'];
  try {
    ({ data: authData, error: authError } = await supabase.auth.getUser());
  } catch (error) {
    reportFailure('session_verification', error instanceof Error ? error.name : undefined);
    return jsonResponse({ error: 'Unable to verify your sign-in. Please try again.' }, 503);
  }
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Sign in before duplicating a recipe.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'The recipe duplicate request is not valid JSON.' }, 400);
  }
  const duplicateRequest = parseDuplicateRequest(body);
  if (!duplicateRequest) {
    return jsonResponse(
      { error: 'Enter a recipe name and choose a destination publication.' },
      400,
    );
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    reportFailure('admin_client_configuration', error instanceof Error ? error.name : undefined);
    return jsonResponse({ error: 'Unable to duplicate this recipe right now.' }, 503);
  }

  let snapshotData: unknown;
  let snapshotError: { code?: string } | null = null;
  try {
    const snapshotResult = await admin.rpc('read_export_snapshot', {
      p_account_id: authData.user.id,
    });
    snapshotData = snapshotResult.data;
    snapshotError = snapshotResult.error;
  } catch (error) {
    reportFailure('account_snapshot', error instanceof Error ? error.name : undefined);
    return jsonResponse({ error: 'Unable to load this recipe. Please try again.' }, 503);
  }
  if (snapshotError || !snapshotData) {
    reportFailure('account_snapshot', snapshotError?.code);
    return jsonResponse({ error: 'Unable to load this recipe. Please try again.' }, 503);
  }

  const snapshot = snapshotData as ExportSnapshot;
  const sourceRecipe = snapshot.records.recipes?.find(
    (recipe) => recipe.id === sourceRecipeId && recipe.trashed_at == null,
  );
  if (!sourceRecipe) {
    return jsonResponse({ error: 'This recipe is currently unavailable.' }, 404);
  }
  if (
    typeof sourceRecipe.version !== 'number' ||
    !Number.isSafeInteger(sourceRecipe.version) ||
    sourceRecipe.version < 1
  ) {
    reportFailure('source_version');
    return jsonResponse({ error: 'Unable to verify this recipe. Please try again.' }, 503);
  }
  const destination = snapshot.records.publications?.find(
    (publication) =>
      publication.id === duplicateRequest.publicationId && publication.trashed_at == null,
  );
  if (!destination) {
    return jsonResponse({ error: 'Choose a current active destination publication.' }, 409);
  }

  let incoming: PortableData;
  let plan: ReturnType<typeof planImport>;
  try {
    incoming = buildPortableData(snapshot, { type: 'recipe', id: sourceRecipeId });
    plan = planImport(
      incoming,
      snapshot.records,
      { [`recipe:${sourceRecipeId}`]: { action: 'duplicate', targetId: sourceRecipeId } },
      undefined,
      { destinationPublicationIds: { [sourceRecipeId]: duplicateRequest.publicationId } },
    );
    if (plan.records.recipes.length !== 1) {
      throw new Error('The duplicate plan does not contain exactly one recipe.');
    }
    plan.records.publications = [];
    plan.records.publication_tags = [];
    Object.assign(plan.records.recipes[0], {
      name: duplicateRequest.name,
      publication_id: duplicateRequest.publicationId,
      is_private: true,
      saved_from_public_id: null,
    });
  } catch (error) {
    reportFailure('duplicate_plan', error instanceof Error ? error.name : undefined);
    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unable to prepare this recipe copy. Please try again.',
      },
      409,
    );
  }

  let stagedPaths = new Set<string>();
  let mediaSources: Awaited<ReturnType<typeof stageRecipePhotos>>['mediaSources'] = [];
  try {
    const staged = await stageRecipePhotos(
      admin,
      authData.user.id,
      snapshot,
      incoming,
      plan,
      (paths) => {
        stagedPaths = paths;
      },
    );
    stagedPaths = staged.stagedPaths;
    mediaSources = staged.mediaSources;
  } catch (error) {
    reportFailure('photo_staging', error instanceof Error ? error.name : undefined);
    const cleanupComplete = await cleanupStagedMedia(admin, authData.user.id, stagedPaths);
    return jsonResponse(
      {
        error: cleanupComplete
          ? 'Unable to copy the recipe photos. Please try again.'
          : 'Unable to copy the recipe photos; cleanup is still pending.',
      },
      503,
    );
  }

  let commitResult: unknown;
  let commitError: { code?: string } | null = null;
  let commitFailureName: string | undefined;
  try {
    const result = await admin.rpc('commit_recipe_duplicate_with_media_sources', {
      p_account_id: authData.user.id,
      p_source_recipe_id: sourceRecipeId,
      p_expected_source_version: Number(sourceRecipe.version),
      p_destination_publication_id: duplicateRequest.publicationId,
      p_account_preferences: {},
      p_records: plan.records,
      p_expected_versions: [],
      p_replace_recipe_ids: [],
      p_replace_publication_ids: [],
      p_media_sources: mediaSources,
    });
    commitResult = result.data;
    commitError = result.error;
  } catch (error) {
    commitFailureName = error instanceof Error ? error.name : undefined;
  }
  if (commitError || !commitResult || typeof commitResult !== 'object') {
    reportFailure('database_commit', commitError?.code ?? commitFailureName);
    const cleanupComplete = await cleanupStagedMedia(admin, authData.user.id, stagedPaths);
    const failure: DuplicateFailure =
      commitError?.code === 'PT409'
        ? { status: 409, message: 'This recipe changed before it could be copied. Try again.' }
        : commitError?.code === 'P0002'
          ? { status: 404, message: 'The source recipe or destination publication is unavailable.' }
          : commitError?.code === '23505'
            ? { status: 409, message: 'This recipe changed before it could be copied. Try again.' }
            : { status: 503, message: 'Unable to duplicate this recipe. Please try again.' };
    return jsonResponse(
      {
        error: cleanupComplete
          ? failure.message
          : `${failure.message} Photo cleanup is still pending.`,
      },
      failure.status,
    );
  }

  const duplicateRecipeId = plan.records.recipes[0]?.id;
  if (typeof duplicateRecipeId !== 'string') {
    reportFailure('duplicate_response');
    const cleanupComplete = await cleanupStagedMedia(admin, authData.user.id, stagedPaths);
    return jsonResponse(
      {
        error: cleanupComplete
          ? 'The copy could not be opened. Please try again.'
          : 'The copy could not be opened; photo cleanup is still pending.',
      },
      503,
    );
  }
  return jsonResponse({ recipeId: duplicateRecipeId }, 201);
}
