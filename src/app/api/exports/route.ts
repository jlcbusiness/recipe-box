import type { ExportSnapshot } from '../../../lib/exports/rules';
import { parseExportScope } from '../../../lib/exports/rules';
import {
  createExportDownload,
  ExportTooLargeError,
  isExportScopeAvailable,
} from '../../../lib/exports/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createClient } from '../../../lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 300;

function jsonResponse(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Sign in before exporting data.' }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'The export request is not valid JSON.' }, 400);
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse({ error: 'Choose a valid export scope.' }, 400);
  }

  const scope = parseExportScope((body as Record<string, unknown>).scope);
  if (!scope) {
    return jsonResponse({ error: 'Choose a valid export scope.' }, 400);
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('read_export_snapshot', {
      p_account_id: authData.user.id,
    });
    if (error || !data) {
      return jsonResponse({ error: 'Unable to prepare the export. Please try again.' }, 503);
    }

    const snapshot = data as ExportSnapshot;
    if (!isExportScopeAvailable(snapshot, scope)) {
      return jsonResponse({ error: 'The selected record is unavailable.' }, 404);
    }

    const result = await createExportDownload(
      admin,
      authData.user.id,
      snapshot,
      scope,
      request.signal,
    );
    return jsonResponse(result, 200);
  } catch (error) {
    if (error instanceof ExportTooLargeError) {
      return jsonResponse({ error: error.message }, 413);
    }
    return jsonResponse({ error: 'Unable to prepare the export. Please try again.' }, 503);
  }
}
