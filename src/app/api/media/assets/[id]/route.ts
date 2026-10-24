import { processMediaCleanup } from '../../../../../lib/media/server';
import { createAdminClient } from '../../../../../lib/supabase/admin';
import { createClient } from '../../../../../lib/supabase/server';

export const runtime = 'nodejs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type MediaAssetRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: MediaAssetRouteContext) {
  const { id } = await context.params;
  if (!uuidPattern.test(id)) {
    return Response.json({ error: 'The image is unavailable.' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return Response.json({ error: 'Sign in before changing images.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The image update request is invalid.' }, { status: 400 });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'The image update request is invalid.' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  let rpc:
    | 'set_recipe_photo_primary'
    | 'update_media_description'
    | 'delete_media_asset'
    | 'delete_recipe_photo_with_references';
  let parameters: Record<string, unknown>;

  if (payload.action === 'primary') {
    rpc = 'set_recipe_photo_primary';
    parameters = { p_asset_id: id };
  } else if (payload.action === 'description' && typeof payload.description === 'string') {
    rpc = 'update_media_description';
    parameters = { p_asset_id: id, p_description: payload.description.trim() };
  } else if (payload.action === 'delete') {
    if (payload.expected_version === undefined) {
      rpc = 'delete_media_asset';
      parameters = { p_asset_id: id };
    } else if (
      typeof payload.expected_version === 'number' &&
      Number.isSafeInteger(payload.expected_version) &&
      payload.expected_version > 0
    ) {
      rpc = 'delete_recipe_photo_with_references';
      parameters = {
        p_asset_id: id,
        p_expected_version: payload.expected_version,
      };
    } else {
      return Response.json(
        { error: 'Reload the recipe before removing this photo.' },
        { status: 400 },
      );
    }
  } else {
    return Response.json({ error: 'Choose a valid image change.' }, { status: 400 });
  }

  const { error } = await supabase.rpc(rpc, parameters);
  if (error) {
    const status =
      error.code === 'P0002'
        ? 404
        : error.code === '40001' || error.code === 'PT409' || error.code === '55000'
          ? 409
          : error.code === '42501'
            ? 403
            : 422;
    return Response.json({ error: error.message || 'Unable to change this image.' }, { status });
  }

  if (payload.action === 'delete') {
    const cleanup = await processMediaCleanup(createAdminClient());
    return Response.json({
      changed: true,
      cleanupPending: cleanup.failed.length > 0,
      message:
        cleanup.failed.length > 0
          ? 'Image removed. Storage cleanup is queued for retry.'
          : 'Image removed.',
    });
  }

  return Response.json({ changed: true });
}
