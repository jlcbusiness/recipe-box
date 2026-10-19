import { isDeepStrictEqual } from 'node:util';
import type { ExportRecord, ExportSnapshot, PortableData } from '../../../../lib/exports/rules';
import { createImportImageStager } from '../../../../lib/imports/media';
import { type ImportChoice, planImport } from '../../../../lib/imports/planning';
import { findImportMatches, normalizeImportName } from '../../../../lib/imports/rules';
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

function parseRecipeDestinationPublicationIds(value: unknown): Record<string, string> | null {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, string> = {};
  for (const [recipeId, publicationId] of Object.entries(value)) {
    if (!recipeId || typeof publicationId !== 'string' || !publicationId) return null;
    result[recipeId] = publicationId;
  }
  return result;
}

function parseOmittedRecipeIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.some((recipeId) => typeof recipeId !== 'string' || !recipeId)
  ) {
    return null;
  }
  return [...new Set(value)];
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
  const expectedScope = requestBody.expectedScope;
  const accountPreferencesAction = requestBody.accountPreferencesAction;
  if (
    accountPreferencesAction !== undefined &&
    accountPreferencesAction !== 'archive' &&
    accountPreferencesAction !== 'keep'
  ) {
    return jsonResponse({ error: 'Choose a valid account settings action.' }, 400);
  }
  if (
    requestBody.omitSourcePublication !== undefined &&
    typeof requestBody.omitSourcePublication !== 'boolean'
  ) {
    return jsonResponse({ error: 'Choose a valid source publication action.' }, 400);
  }
  const omitSourcePublication = requestBody.omitSourcePublication === true;
  if (
    expectedScope !== undefined &&
    !(['database', 'publication', 'recipe'] as unknown[]).includes(expectedScope)
  ) {
    return jsonResponse({ error: 'Choose a valid import type.' }, 400);
  }
  if (!isOwnedImportArchivePath(authData.user.id, requestBody.path)) {
    return jsonResponse({ error: 'The selected import archive is unavailable.' }, 400);
  }
  const choices = parseChoices(requestBody.choices);
  const rootVersions = parseRootVersions(requestBody.rootVersions);
  const recipeDestinationPublicationIds = parseRecipeDestinationPublicationIds(
    requestBody.recipeDestinationPublicationIds,
  );
  const omittedRecipeIds = parseOmittedRecipeIds(requestBody.omitRecipeIds);
  if (!choices || !rootVersions || !recipeDestinationPublicationIds || !omittedRecipeIds) {
    return jsonResponse({ error: 'Choose current import matches and preview versions.' }, 400);
  }

  const admin = createAdminClient();
  let stagedPaths = new Set<string>();
  try {
    const bundle = await readStoredImportBundle(admin, authData.user.id, requestBody.path);
    if (expectedScope && bundle.data.scope.type !== expectedScope) {
      return jsonResponse(
        { error: 'This archive does not match the selected import action.' },
        422,
      );
    }
    const scope = bundle.data.scope;
    const hasAccountPreferences = Object.keys(bundle.data.account_preferences).length > 0;
    if (
      scope.type === 'database' &&
      hasAccountPreferences &&
      accountPreferencesAction !== 'archive' &&
      accountPreferencesAction !== 'keep'
    ) {
      return jsonResponse({ error: 'Choose how to handle the archive account settings.' }, 400);
    }
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
    const incomingRecipeIds = new Set(
      bundle.data.records.recipes.map((recipe) => String(recipe.id)),
    );
    if (
      Object.keys(recipeDestinationPublicationIds).some(
        (recipeId) => !incomingRecipeIds.has(recipeId),
      ) ||
      omittedRecipeIds.some((recipeId) => !incomingRecipeIds.has(recipeId))
    ) {
      return jsonResponse({ error: 'Preview this archive again before importing.' }, 409);
    }
    const publicationMatches = findImportMatches(bundle.data, {
      recipes: [],
      publications: existing.publications,
    }).filter((match) => match.kind === 'publication');
    if (omitSourcePublication && scope.type !== 'publication') {
      return jsonResponse(
        { error: 'Only a publication import can omit its source publication.' },
        400,
      );
    }
    if (omitSourcePublication && scope.type === 'publication') {
      const sourceMatch = publicationMatches.find((match) => match.incomingId === scope.id);
      if (sourceMatch?.existingIds.length) {
        return jsonResponse(
          { error: 'Preview the archive again before omitting its publication.' },
          409,
        );
      }
    }
    const publicationResolutions = new Map<string, string>();
    for (const publication of bundle.data.records.publications) {
      const incomingId = String(publication.id);
      const match = publicationMatches.find((item) => item.incomingId === incomingId);
      if (publication.publication_type === 'collection') {
        const recipeTin = existing.publications.find(
          (item) => item.trashed_at == null && item.publication_type === 'collection',
        );
        if (!recipeTin) {
          return jsonResponse({ error: 'The destination Recipe Tin is unavailable.' }, 409);
        }
        publicationResolutions.set(incomingId, String(recipeTin.id));
        continue;
      }
      if (scope.type === 'recipe') {
        const activeCandidates = existing.publications.filter(
          (item) =>
            item.trashed_at == null &&
            item.publication_type === publication.publication_type &&
            normalizeImportName(String(item.name ?? '')) ===
              normalizeImportName(String(publication.name ?? '')),
        );
        publicationResolutions.set(
          incomingId,
          activeCandidates.length === 1 ? String(activeCandidates[0].id) : `new:${incomingId}`,
        );
        continue;
      }
      const choice = choices[`publication:${incomingId}`];
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
    const matches =
      scope.type === 'recipe'
        ? recipeMatches
        : [
            ...publicationMatches.filter((match) => {
              const publication = bundle.data.records.publications.find(
                (item) => String(item.id) === match.incomingId,
              );
              return publication?.publication_type !== 'collection';
            }),
            ...recipeMatches,
          ];
    const effectiveChoices: Record<string, ImportChoice> = { ...choices };
    if (scope.type === 'publication' && choices[`publication:${scope.id}`]?.action === 'replace') {
      for (const match of recipeMatches) {
        const recipe = bundle.data.records.recipes.find(
          (item) => String(item.id) === match.incomingId,
        );
        if (String(recipe?.publication_id ?? '') !== scope.id) continue;
        if (match.existingIds.length !== 1) {
          return jsonResponse(
            {
              error: 'A recipe match is ambiguous. Keep the publication to choose recipe actions.',
            },
            409,
          );
        }
        effectiveChoices[`recipe:${match.incomingId}`] = {
          action: 'replace',
          targetId: match.existingIds[0],
        };
      }
    }
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
      const choice = effectiveChoices[key];
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

    if (scope.type === 'recipe' && choices[`recipe:${scope.id}`]?.action === 'keep') {
      return jsonResponse({ imported: false, ignored: true, destination: null });
    }

    let plan: ReturnType<typeof planImport>;
    try {
      plan = planImport(
        bundle.data as PortableData,
        snapshot.records,
        effectiveChoices,
        undefined,
        {
          destinationPublicationIds: recipeDestinationPublicationIds,
          omitMissingSourcePublication: omitSourcePublication,
          omitRecipeIds: omittedRecipeIds,
        },
      );
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
      p_account_preferences:
        scope.type === 'database' && accountPreferencesAction === 'archive'
          ? bundle.data.account_preferences
          : {},
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
      if (error.code === '40001' || error.code === 'PT409' || error.code === 'P0001') {
        return jsonResponse(
          { error: 'A selected record changed. Preview the archive again.' },
          409,
        );
      }
      if (error.code === 'PGRST202') {
        return jsonResponse(
          {
            error:
              'Database import is unavailable until the latest database migrations are applied.',
          },
          503,
        );
      }
      return jsonResponse(
        { error: 'Unable to import this archive. No changes were committed.' },
        422,
      );
    }

    stagedPaths.clear();
    const destination =
      scope.type === 'database'
        ? null
        : {
            type: scope.type,
            id: plan.idMappings[scope.type === 'recipe' ? 'recipes' : 'publications'].get(scope.id),
          };
    return jsonResponse({ imported: true, result: data, destination });
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
