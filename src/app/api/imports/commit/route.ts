import { isDeepStrictEqual } from 'node:util';
import type { ExportRecord, ExportSnapshot, PortableData } from '../../../../lib/exports/rules';
import { createImportImageStager } from '../../../../lib/imports/media';
import { type ImportChoice, planDatabaseImport } from '../../../../lib/imports/planning';
import { findImportMatches } from '../../../../lib/imports/rules';
import {
  ImportBundleError,
  isOwnedImportArchivePath,
  readStoredImportBundle,
} from '../../../../lib/imports/server';
import { processMediaDeletions, queueMediaDeletions } from '../../../../lib/media/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

type RootVersion = {
  kind: 'recipe' | 'publication';
  incomingId: string;
  targetId: string;
  version: number;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function parseChoices(value: unknown): Record<string, ImportChoice> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, ImportChoice> = {};
  for (const [key, choice] of Object.entries(value)) {
    if (
      choice === null ||
      typeof choice !== 'object' ||
      Array.isArray(choice) ||
      !['keep', 'duplicate', 'replace'].includes(
        String((choice as Record<string, unknown>).action),
      ) ||
      typeof (choice as Record<string, unknown>).targetId !== 'string'
    ) {
      return null;
    }
    result[key] = choice as ImportChoice;
  }
  return result;
}

function parseRootVersions(value: unknown): RootVersion[] | null {
  if (!Array.isArray(value)) return null;
  const versions: RootVersion[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
    const entry = item as Record<string, unknown>;
    if (
      (entry.kind !== 'recipe' && entry.kind !== 'publication') ||
      typeof entry.incomingId !== 'string' ||
      typeof entry.targetId !== 'string' ||
      !Number.isSafeInteger(entry.version) ||
      (entry.version as number) < 1
    ) {
      return null;
    }
    versions.push(entry as RootVersion);
  }
  return versions;
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
    return result.failed.length === 0;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Sign in before importing data.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'The import request is not valid JSON.' }, 400);
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Choose a valid import archive.' }, 400);
  }

  const requestBody = body as Record<string, unknown>;
  if (!isOwnedImportArchivePath(authData.user.id, requestBody.path)) {
    return jsonResponse({ error: 'The selected import archive is unavailable.' }, 400);
  }
  const choices = parseChoices(requestBody.choices);
  const rootVersions = parseRootVersions(requestBody.rootVersions);
  if (!choices || !rootVersions) {
    return jsonResponse({ error: 'Choose current import matches and preview versions.' }, 400);
  }

  const admin = createAdminClient();
  let stagedPaths = new Set<string>();
  try {
    const bundle = await readStoredImportBundle(admin, authData.user.id, requestBody.path);
    const { data: snapshotData, error: snapshotError } = await admin.rpc('read_export_snapshot', {
      p_account_id: authData.user.id,
    });
    if (snapshotError || !snapshotData) {
      return jsonResponse({ error: 'Unable to compare this archive with your account.' }, 503);
    }

    const snapshot = snapshotData as ExportSnapshot;
    const existing = {
      recipes: snapshot.records.recipes ?? [],
      publications: snapshot.records.publications ?? [],
    };
    const publicationMatches = findImportMatches(bundle.data, {
      recipes: [],
      publications: existing.publications,
    }).filter((match) => match.kind === 'publication');
    const publicationResolutions = new Map<string, string>();
    for (const publication of bundle.data.records.publications) {
      const incomingId = String(publication.id);
      const match = publicationMatches.find((item) => item.incomingId === incomingId);
      const choice = choices[`publication:${incomingId}`];
      if (publication.publication_type === 'collection' && choice?.action !== 'keep') {
        return jsonResponse({ error: 'Recipe Tin must be kept during database import.' }, 409);
      }
      if (match?.existingIds.length && choice && match.existingIds.includes(choice.targetId)) {
        publicationResolutions.set(
          incomingId,
          choice.action === 'duplicate' ? `duplicate:${incomingId}` : choice.targetId,
        );
      } else {
        publicationResolutions.set(incomingId, `new:${incomingId}`);
      }
    }
    const recipeMatches = findImportMatches(bundle.data, existing, publicationResolutions).filter(
      (match) => match.kind === 'recipe',
    );
    const matches = [...publicationMatches, ...recipeMatches];
    const versionsByConflict = new Map(
      rootVersions.map((entry) => [`${entry.kind}:${entry.incomingId}`, entry]),
    );
    const conflictKeys = new Set(
      matches
        .filter((match) => match.existingIds.length > 0)
        .map((match) => `${match.kind}:${match.incomingId}`),
    );
    if (versionsByConflict.size !== rootVersions.length) {
      return jsonResponse({ error: 'Preview this archive again before importing.' }, 409);
    }
    if (Object.keys(choices).some((key) => !conflictKeys.has(key))) {
      return jsonResponse({ error: 'Preview this archive again before importing.' }, 409);
    }

    const expectedVersions: RootVersion[] = [];
    for (const match of matches) {
      if (match.existingIds.length === 0) continue;
      const key = `${match.kind}:${match.incomingId}`;
      const choice = choices[key];
      const submittedVersion = versionsByConflict.get(key);
      if (!choice || !match.existingIds.includes(choice.targetId) || !submittedVersion) {
        return jsonResponse({ error: 'Choose a current match for each conflict.' }, 409);
      }
      const table = match.kind === 'recipe' ? 'recipes' : 'publications';
      const current = ((snapshot.records[table] ?? []) as ExportRecord[]).find(
        (record) => record.id === choice.targetId,
      );
      if (
        submittedVersion.kind !== match.kind ||
        submittedVersion.targetId !== choice.targetId ||
        !Number.isSafeInteger(current?.version) ||
        current?.version !== submittedVersion.version
      ) {
        return jsonResponse(
          { error: 'A selected record changed. Preview the archive again.' },
          409,
        );
      }
      expectedVersions.push(submittedVersion);
    }
    if (rootVersions.length !== expectedVersions.length) {
      return jsonResponse({ error: 'Preview this archive again before importing.' }, 409);
    }

    let plan: ReturnType<typeof planDatabaseImport>;
    try {
      plan = planDatabaseImport(bundle.data as PortableData, snapshot.records, choices);
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'The import choices are invalid.' },
        409,
      );
    }

    const destinationAssetIds = new Map<string, string>();
    for (const asset of bundle.data.records.media_assets) {
      const sourceId = String(asset.id);
      const destinationId = plan.idMappings.media_assets.get(sourceId);
      if (destinationId) destinationAssetIds.set(sourceId, destinationId);
    }
    if (destinationAssetIds.size > 0) {
      const stager = createImportImageStager(admin, authData.user.id, destinationAssetIds);
      stagedPaths = stager.stagedPaths;
      const stagedBundle = await readStoredImportBundle(
        admin,
        authData.user.id,
        requestBody.path,
        stager.imageSink,
      );
      if (
        !isDeepStrictEqual(bundle.manifest, stagedBundle.manifest) ||
        !isDeepStrictEqual(bundle.data, stagedBundle.data)
      ) {
        throw new ImportBundleError('The archive changed during import. Preview it again.', 409);
      }
      for (const [sourceId, destinationId] of destinationAssetIds) {
        const paths = stager.pathsBySourceAsset.get(sourceId);
        if (!paths?.fullPath || !paths.thumbnailPath) {
          throw new ImportBundleError('The archive is missing a required image variant.', 422);
        }
        const plannedAsset = plan.records.media_assets.find((asset) => asset.id === destinationId);
        if (!plannedAsset) {
          throw new ImportBundleError('The import plan is missing an image record.', 422);
        }
        const stagedMetadata = stager.metadataBySourceAsset.get(sourceId);
        if (
          !stagedMetadata ||
          stagedMetadata.byteSize !== Number(plannedAsset.byte_size) ||
          stagedMetadata.width !== Number(plannedAsset.width) ||
          stagedMetadata.height !== Number(plannedAsset.height)
        ) {
          throw new ImportBundleError('An image does not match its declared metadata.', 422);
        }
      }
    }

    const { data, error } = await admin.rpc('commit_database_import', {
      p_account_id: authData.user.id,
      p_account_preferences: bundle.data.account_preferences,
      p_records: plan.records,
      p_expected_versions: expectedVersions,
      p_replace_recipe_ids: plan.replaceRecipeIds,
      p_replace_publication_ids: plan.replacePublicationIds,
    });
    if (error) {
      if (!(await cleanupStagedMedia(admin, authData.user.id, stagedPaths))) {
        return jsonResponse(
          { error: 'The import failed and staged image cleanup could not be confirmed.' },
          503,
        );
      }
      stagedPaths.clear();
      if (error.code === '40001' || error.code === 'P0001') {
        return jsonResponse(
          { error: 'A selected record changed. Preview the archive again.' },
          409,
        );
      }
      return jsonResponse(
        { error: 'Unable to import this archive. No changes were committed.' },
        422,
      );
    }

    stagedPaths.clear();
    return jsonResponse({ imported: true, result: data });
  } catch (error) {
    if (!(await cleanupStagedMedia(admin, authData.user.id, stagedPaths))) {
      return jsonResponse(
        { error: 'The import failed and staged image cleanup could not be confirmed.' },
        503,
      );
    }
    if (error instanceof ImportBundleError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: 'Unable to validate this archive. Please choose it again.' }, 422);
  }
}
