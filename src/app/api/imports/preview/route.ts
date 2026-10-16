import {
  type ExportRecord,
  type ExportSnapshot,
  exportTableNames,
} from '../../../../lib/exports/rules';
import { findImportMatches } from '../../../../lib/imports/rules';
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
  if (!isOwnedImportArchivePath(authData.user.id, objectPath)) {
    return jsonResponse({ error: 'The selected import archive is unavailable.' }, 400);
  }

  const admin = createAdminClient();
  try {
    const bundle = await readStoredImportBundle(admin, authData.user.id, objectPath);
    const { data: snapshotData, error: snapshotError } = await admin.rpc('read_export_snapshot', {
      p_account_id: authData.user.id,
    });
    if (snapshotError || !snapshotData) {
      return jsonResponse({ error: 'Unable to compare this archive with your account.' }, 503);
    }

    const snapshot = snapshotData as ExportSnapshot;
    const matches = findImportMatches(bundle.data, {
      recipes: snapshot.records.recipes ?? [],
      publications: snapshot.records.publications ?? [],
    });
    const incomingRecords = bundle.data.records;
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
            return { id, name: record?.name ?? 'Untitled', version: record?.version ?? null };
          }),
        };
      });
    const recipeFlags = incomingRecords.recipes.map((recipe) => recipe.is_private !== false);

    return jsonResponse({
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
