import { createClient } from '../../../../../../lib/supabase/server';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RecipeOrderRouteContext = {
  params: Promise<{ id: string }>;
};

function isUuidArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((assetId) => typeof assetId === 'string' && uuidPattern.test(assetId))
  );
}

export async function PATCH(request: Request, context: RecipeOrderRouteContext) {
  const { id } = await context.params;
  if (!uuidPattern.test(id)) {
    return Response.json({ error: 'The recipe is unavailable.' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'Sign in before reordering photos.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The photo order request is invalid.' }, { status: 400 });
  }
  const payload =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  if (!payload || !isUuidArray(payload.assetIds)) {
    return Response.json({ error: 'The photo order request is invalid.' }, { status: 400 });
  }

  const assetIds = payload.assetIds;
  const { error } = await supabase.rpc('reorder_recipe_photos', {
    p_recipe_id: id,
    p_asset_ids: assetIds,
  });
  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '40001' || error.code === 'PT409'
          ? 409
          : error.code === '42501'
            ? 403
            : 422;
    return Response.json(
      { error: error.message || 'Unable to reorder recipe photos.' },
      { status },
    );
  }

  return Response.json({ changed: true });
}
