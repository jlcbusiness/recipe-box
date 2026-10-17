import {
  type ExportRecord,
  type ExportSnapshot,
  exportTableNames,
} from '../../../../lib/exports/rules';
import { findImportMatches, normalizeImportName } from '../../../../lib/imports/rules';
import {
  ImportBundleError,
  isOwnedImportArchivePath,
  readStoredImportBundle,
} from '../../../../lib/imports/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { createClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
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

  const objectPath = (body as Record<string, unknown>).path;
  const expectedScope = (body as Record<string, unknown>).expectedScope;
  if (
    expectedScope !== undefined &&
    !(['database', 'publication', 'recipe'] as unknown[]).includes(expectedScope)
  ) {
    return jsonResponse({ error: 'Choose a valid import type.' }, 400);
  }
  if (!isOwnedImportArchivePath(authData.user.id, objectPath)) {
    return jsonResponse({ error: 'The selected import archive is unavailable.' }, 400);
  }
  const admin = createAdminClient();
  try {
    const bundle = await readStoredImportBundle(admin, authData.user.id, objectPath);
    if (expectedScope && bundle.data.scope.type !== expectedScope) {
      return jsonResponse(
        { error: 'This archive does not match the selected import action.' },
        422,
      );
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
    const incomingRecords = bundle.data.records;
    const scope = bundle.data.scope;
    const rootRecipe =
      scope.type === 'recipe'
        ? incomingRecords.recipes.find((recipe) => recipe.id === scope.id)
        : undefined;
    const dependencyPublicationId =
      typeof rootRecipe?.publication_id === 'string' ? rootRecipe.publication_id : null;
    const dependencyPublication = dependencyPublicationId
      ? incomingRecords.publications.find(
          (publication) => publication.id === dependencyPublicationId,
        )
      : undefined;
    const dependencyCandidates = dependencyPublication
      ? existing.publications.filter(
          (publication) =>
            publication.trashed_at == null &&
            publication.publication_type === dependencyPublication.publication_type &&
            normalizeImportName(String(publication.name ?? '')) ===
              normalizeImportName(String(dependencyPublication.name ?? '')),
        )
      : [];
    if (
      dependencyPublication?.publication_type === 'collection' &&
      dependencyCandidates.length === 0
    ) {
      return jsonResponse({ error: 'No matching Recipe Tin is available for this recipe.' }, 409);
    }
    const publicationMatches = findImportMatches(bundle.data, {
      recipes: [],
      publications: existing.publications,
    }).filter((match) => match.kind === 'publication');
    const databasePublicationResolutions = new Map<string, string>();
    if (scope.type === 'database') {
      for (const match of publicationMatches) {
        const firstCandidateId = match.existingIds[0];
        if (firstCandidateId) {
          databasePublicationResolutions.set(match.incomingId, firstCandidateId);
        }
      }
    }
    const matches = findImportMatches(bundle.data, existing, databasePublicationResolutions).filter(
      (match) => {
        if (scope.type === 'recipe' && match.kind !== 'recipe') return false;
        if (match.kind !== 'publication') return true;
        const publication = incomingRecords.publications.find(
          (record) => record.id === match.incomingId,
        );
        return publication?.publication_type !== 'collection';
      },
    );
    const matchesByKey = new Map(
      matches.map((match) => [`${match.kind}:${match.incomingId}`, match.existingIds]),
    );
    const conflicts = matches
      .filter((match) => match.existingIds.length > 0)
      .map((match) => {
        const incomingTable = match.kind === 'recipe' ? 'recipes' : 'publications';
        const incoming = incomingRecords[incomingTable].find(
          (record) => record.id === match.incomingId,
        );
        const existingRows = (snapshot.records[incomingTable] ?? []) as ExportRecord[];
        return {
          kind: match.kind,
          incomingId: match.incomingId,
          incomingName: incoming?.name ?? 'Untitled',
          candidates: match.existingIds.map((id) => {
            const record = existingRows.find((item) => item.id === id);
            if (match.kind !== 'recipe') {
              return { id, name: record?.name ?? 'Untitled', version: record?.version ?? null };
            }
            const publicationId =
              typeof record?.publication_id === 'string' ? record.publication_id : null;
            const publication = (snapshot.records.publications ?? []).find(
              (item) => item.id === publicationId,
            );
            return {
              id,
              name: record?.name ?? 'Untitled',
              publicationId,
              publicationName:
                publication?.name ?? (publicationId === null ? 'Unfiled' : 'Unknown publication'),
              version: record?.version ?? null,
            };
          }),
        };
      });
    const recipeFlags = incomingRecords.recipes.map((recipe) => recipe.is_private !== false);

    const activePublications = existing.publications
      .filter((publication) => publication.trashed_at == null)
      .map((publication) => ({
        id: String(publication.id),
        name: String(publication.name ?? 'Untitled'),
        publicationType: String(publication.publication_type ?? ''),
      }));
    const scopedPublication =
      scope.type === 'publication'
        ? incomingRecords.publications.find((publication) => publication.id === scope.id)
        : undefined;
    const scopedPublicationMatch =
      scope.type === 'publication'
        ? matches.find((match) => match.kind === 'publication' && match.incomingId === scope.id)
        : undefined;
    const sourcePublication =
      scope.type === 'recipe' && dependencyPublication
        ? {
            id: String(dependencyPublication.id),
            name: String(dependencyPublication.name ?? 'Untitled'),
            destinationId:
              dependencyCandidates.length === 1 ? String(dependencyCandidates[0].id) : null,
            willCreate:
              dependencyPublication.publication_type !== 'collection' &&
              dependencyCandidates.length !== 1,
            candidateCount: dependencyCandidates.length,
          }
        : scope.type === 'publication' && scopedPublication
          ? {
              id: String(scopedPublication.id),
              name: String(scopedPublication.name ?? 'Untitled'),
              destinationId:
                scopedPublicationMatch?.existingIds.length === 1
                  ? scopedPublicationMatch.existingIds[0]
                  : null,
              willCreate: !scopedPublicationMatch?.existingIds.length,
              candidateCount: scopedPublicationMatch?.existingIds.length ?? 0,
            }
          : null;
    const defaultDestinationPublicationId =
      scope.type === 'publication'
        ? (sourcePublication?.destinationId ?? null)
        : scope.type !== 'recipe'
          ? null
          : (sourcePublication?.destinationId ??
            (dependencyPublication
              ? null
              : (activePublications.find(
                  (publication) => publication.publicationType === 'collection',
                )?.id ?? null)));

    return jsonResponse({
      scope,
      sourcePublication,
      incomingRecipes: incomingRecords.recipes.map((recipe) => ({
        id: String(recipe.id),
        name: String(recipe.name ?? 'Untitled'),
      })),
      destinationPublications: activePublications,
      defaultDestinationPublicationId,
      counts: Object.fromEntries(
        exportTableNames.map((table) => [table, incomingRecords[table].length]),
      ),
      mediaCount: incomingRecords.media_assets.length,
      preferences: Object.keys(bundle.data.account_preferences),
      privacy: {
        privateRecipes: recipeFlags.filter(Boolean).length,
        publicRecipes: recipeFlags.filter((value) => !value).length,
      },
      conflicts,
      unresolvedConflicts: conflicts.filter((item) => item.candidates.length !== 1).length,
      matchCount: matchesByKey.size,
    });
  } catch (error) {
    if (error instanceof ImportBundleError) {
      return jsonResponse({ error: error.message }, error.status);
    }
    return jsonResponse({ error: 'Unable to validate this archive. Please choose it again.' }, 422);
  }
}
