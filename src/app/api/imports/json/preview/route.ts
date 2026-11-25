import type { ExportRecord, ExportSnapshot } from '../../../../../lib/exports/rules';
import { findImportMatches } from '../../../../../lib/imports/rules';
import { createPortableRecipeJsonData } from '../../../../../lib/recipe-json/portable-data';
import { RecipeJsonUploadError, readStoredRecipeJson } from '../../../../../lib/recipe-json/server';
import { RecipeJsonValidationError } from '../../../../../lib/recipe-json/validation.mjs';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { createClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Sign in before importing recipe JSON.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'The recipe JSON preview request is invalid.' }, 400);
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Choose a valid JSON file and destination publication.' }, 400);
  }
  const requestBody = body as Record<string, unknown>;
  if (typeof requestBody.path !== 'string' || typeof requestBody.targetPublicationId !== 'string') {
    return jsonResponse({ error: 'Choose a valid JSON file and destination publication.' }, 400);
  }

  const admin = createAdminClient();
  try {
    const parsed = await readStoredRecipeJson(admin, authData.user.id, requestBody.path);
    const { data: snapshotData, error: snapshotError } = await admin.rpc('read_export_snapshot', {
      p_account_id: authData.user.id,
    });
    if (snapshotError || !snapshotData) {
      return jsonResponse({ error: 'Unable to compare this JSON file with your account.' }, 503);
    }

    const snapshot = snapshotData as ExportSnapshot;
    const target = (snapshot.records.publications ?? []).find(
      (publication) =>
        publication.id === requestBody.targetPublicationId && publication.trashed_at == null,
    );
    if (!target) {
      return jsonResponse({ error: 'The destination publication is unavailable.' }, 404);
    }

    const incoming = createPortableRecipeJsonData(parsed, snapshot, new Date(), requestBody.path);
    const matches = findImportMatches(incoming, {
      recipes: snapshot.records.recipes ?? [],
      publications: snapshot.records.publications ?? [],
    }).filter((match) => match.kind === 'recipe');
    const incomingRecipes = incoming.records.recipes.map((recipe) => ({
      id: String(recipe.id),
      name: String(recipe.name),
    }));
    const conflicts = matches
      .filter((match) => match.existingIds.length > 0)
      .map((match) => {
        const recipe = incoming.records.recipes.find(
          (record) => String(record.id) === match.incomingId,
        );
        const existingRows = (snapshot.records.recipes ?? []) as ExportRecord[];
        return {
          kind: 'recipe' as const,
          incomingId: match.incomingId,
          incomingName: String(recipe?.name ?? 'Untitled'),
          candidates: match.existingIds.map((id) => {
            const record = existingRows.find((item) => item.id === id);
            const publicationId =
              typeof record?.publication_id === 'string' ? record.publication_id : null;
            const publication = (snapshot.records.publications ?? []).find(
              (item) => item.id === publicationId,
            );
            return {
              id,
              name: String(record?.name ?? 'Untitled'),
              publicationId,
              publicationName: publication?.name ?? 'Unfiled',
              version: record?.version ?? null,
            };
          }),
        };
      });

    return jsonResponse({
      incomingRecipes,
      destinationPublication: {
        id: String(target.id),
        name: String(target.name ?? 'Untitled'),
        publicationType: String(target.publication_type ?? ''),
      },
      conflicts,
    });
  } catch (error) {
    if (error instanceof RecipeJsonUploadError || error instanceof RecipeJsonValidationError) {
      return jsonResponse(
        { error: error.message },
        error instanceof RecipeJsonUploadError ? error.status : 422,
      );
    }
    console.error('[recipe-json-preview] request failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return jsonResponse({ error: 'Unable to preview this JSON file. Try again.' }, 503);
  }
}
