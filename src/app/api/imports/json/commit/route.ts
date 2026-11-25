import type { ExportSnapshot, PortableData } from '../../../../../lib/exports/rules';
import { type ImportChoice, planImport } from '../../../../../lib/imports/planning';
import { findImportMatches } from '../../../../../lib/imports/rules';
import { createPortableRecipeJsonData } from '../../../../../lib/recipe-json/portable-data';
import { RecipeJsonUploadError, readStoredRecipeJson } from '../../../../../lib/recipe-json/server';
import { RecipeJsonValidationError } from '../../../../../lib/recipe-json/validation.mjs';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { createClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

type JsonChoice = {
  action: 'keep' | 'duplicate';
  targetId: string;
};
type RootVersion = {
  incomingId: string;
  targetId: string;
  version: number;
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function parseChoices(value: unknown): Record<string, JsonChoice> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, JsonChoice> = {};
  for (const [key, choice] of Object.entries(value)) {
    if (
      !key ||
      choice === null ||
      typeof choice !== 'object' ||
      Array.isArray(choice) ||
      !['keep', 'duplicate'].includes(String((choice as Record<string, unknown>).action)) ||
      typeof (choice as Record<string, unknown>).targetId !== 'string'
    ) {
      return null;
    }
    result[key] = choice as JsonChoice;
  }
  return result;
}

function parseRootVersions(value: unknown): RootVersion[] | null {
  if (!Array.isArray(value)) return null;
  const result: RootVersion[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return null;
    const version = item as Record<string, unknown>;
    if (
      typeof version.incomingId !== 'string' ||
      typeof version.targetId !== 'string' ||
      !Number.isSafeInteger(version.version) ||
      Number(version.version) < 1
    ) {
      return null;
    }
    result.push({
      incomingId: version.incomingId,
      targetId: version.targetId,
      version: Number(version.version),
    });
  }
  return result;
}

function retainUsedCatalogRows(records: PortableData['records']): void {
  const usedPicklistIds = new Set<string>();
  const addPicklistId = (value: unknown) => {
    if (typeof value === 'string') usedPicklistIds.add(value);
  };
  for (const recipe of records.recipes) {
    addPicklistId(recipe.food_type_id);
    addPicklistId(recipe.verdict_id);
    addPicklistId(recipe.enthusiasm_id);
  }
  for (const table of [
    records.recipe_picklist_assignments,
    records.recipe_time_entries,
    records.recipe_ingredient_measurements,
  ]) {
    for (const record of table) addPicklistId(record.picklist_value_id ?? record.time_type_id);
  }
  records.recipe_picklist_values = records.recipe_picklist_values.filter((record) =>
    usedPicklistIds.has(String(record.id)),
  );

  const usedIngredientIds = new Set(
    records.recipe_ingredients
      .map((record) => record.ingredient_id)
      .filter((id): id is string => typeof id === 'string'),
  );
  records.ingredients = records.ingredients.filter((record) =>
    usedIngredientIds.has(String(record.id)),
  );
  const usedTagIds = new Set(
    records.recipe_tags
      .map((record) => record.tag_id)
      .filter((id): id is string => typeof id === 'string'),
  );
  records.tags = records.tags.filter((record) => usedTagIds.has(String(record.id)));
}

function findCurrentRecipe(snapshot: ExportSnapshot, recipeId: string) {
  return (snapshot.records.recipes ?? []).find((recipe) => recipe.id === recipeId);
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
    return jsonResponse({ error: 'The recipe JSON commit request is invalid.' }, 400);
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Choose a current JSON preview and conflict choices.' }, 400);
  }
  const requestBody = body as Record<string, unknown>;
  if (typeof requestBody.path !== 'string' || typeof requestBody.targetPublicationId !== 'string') {
    return jsonResponse(
      { error: 'Choose a current JSON preview and destination publication.' },
      400,
    );
  }
  const targetPublicationId = requestBody.targetPublicationId;
  const choices = parseChoices(requestBody.choices);
  const rootVersions = parseRootVersions(requestBody.rootVersions);
  if (!choices || !rootVersions) {
    return jsonResponse({ error: 'Choose current import matches and preview versions.' }, 400);
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
    const destination = (snapshot.records.publications ?? []).find(
      (publication) => publication.id === targetPublicationId && publication.trashed_at == null,
    );
    if (!destination) {
      return jsonResponse({ error: 'The destination publication is unavailable.' }, 409);
    }

    const incoming = createPortableRecipeJsonData(parsed, snapshot, new Date(), requestBody.path);
    const matches = findImportMatches(incoming, {
      recipes: snapshot.records.recipes ?? [],
      publications: snapshot.records.publications ?? [],
    }).filter((match) => match.kind === 'recipe');
    const conflicts = matches.filter((match) => match.existingIds.length > 0);
    const conflictKeys = new Set(conflicts.map((match) => `recipe:${match.incomingId}`));
    if (
      Object.keys(choices).some((key) => !conflictKeys.has(key)) ||
      Object.keys(choices).length !== conflicts.length
    ) {
      return jsonResponse({ error: 'Preview this JSON file again before importing.' }, 409);
    }
    const versionsByIncomingId = new Map<string, RootVersion>();
    for (const version of rootVersions) {
      if (versionsByIncomingId.has(version.incomingId)) {
        return jsonResponse({ error: 'Preview this JSON file again before importing.' }, 409);
      }
      versionsByIncomingId.set(version.incomingId, version);
    }
    if (versionsByIncomingId.size !== conflicts.length) {
      return jsonResponse({ error: 'Preview this JSON file again before importing.' }, 409);
    }

    const expectedVersions: Array<{
      kind: 'recipe';
      incomingId: string;
      targetId: string;
      version: number;
    }> = [];
    for (const match of conflicts) {
      const key = `recipe:${match.incomingId}`;
      const choice = choices[key];
      const version = versionsByIncomingId.get(match.incomingId);
      if (!choice || !match.existingIds.includes(choice.targetId) || !version) {
        return jsonResponse({ error: 'Choose a current match for each recipe conflict.' }, 409);
      }
      const current = findCurrentRecipe(snapshot, choice.targetId);
      if (
        version.targetId !== choice.targetId ||
        !Number.isSafeInteger(current?.version) ||
        current?.version !== version.version
      ) {
        return jsonResponse(
          { error: 'A selected recipe changed. Preview the JSON file again.' },
          409,
        );
      }
      expectedVersions.push({
        kind: 'recipe',
        incomingId: match.incomingId,
        targetId: choice.targetId,
        version: version.version,
      });
    }

    const plannerChoices: Record<string, ImportChoice> = Object.fromEntries(
      Object.entries(choices).map(([key, choice]) => [
        key,
        { action: choice.action, targetId: choice.targetId },
      ]),
    );
    const destinationPublicationIds = Object.fromEntries(
      incoming.records.recipes.map((recipe) => [String(recipe.id), targetPublicationId]),
    );
    let plan: ReturnType<typeof planImport>;
    try {
      plan = planImport(incoming, snapshot.records, plannerChoices, undefined, {
        destinationPublicationIds,
      });
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'The import choices are invalid.' },
        409,
      );
    }
    retainUsedCatalogRows(plan.records);
    if (plan.records.recipes.length === 0) {
      return jsonResponse({ importedCount: 0, keptCount: conflicts.length });
    }

    const { error: commitError } = await admin.rpc('commit_database_import_with_media_sources', {
      p_account_id: authData.user.id,
      p_account_preferences: {},
      p_records: plan.records,
      p_expected_versions: expectedVersions,
      p_replace_recipe_ids: plan.replaceRecipeIds,
      p_replace_publication_ids: plan.replacePublicationIds,
      p_media_sources: [],
    });
    if (commitError) {
      console.error('[recipe-json-commit] database transaction failed', {
        code: commitError.code,
      });
      return jsonResponse(
        {
          error:
            commitError.code === 'PT409' || commitError.code === '40001'
              ? 'A recipe changed while importing. Preview the JSON file again.'
              : 'Unable to import this JSON file. No recipes were added.',
        },
        commitError.code === 'PT409' || commitError.code === '40001' ? 409 : 503,
      );
    }

    return jsonResponse({
      importedCount: plan.records.recipes.length,
      keptCount: conflicts.filter(
        (match) => choices[`recipe:${match.incomingId}`]?.action === 'keep',
      ).length,
      destination: {
        id: requestBody.targetPublicationId,
        name: destination.name,
      },
    });
  } catch (error) {
    if (error instanceof RecipeJsonUploadError || error instanceof RecipeJsonValidationError) {
      return jsonResponse(
        { error: error.message },
        error instanceof RecipeJsonUploadError ? error.status : 422,
      );
    }
    console.error('[recipe-json-commit] request failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return jsonResponse({ error: 'Unable to import this JSON file. Try again.' }, 503);
  }
}
