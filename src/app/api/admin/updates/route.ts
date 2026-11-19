import { timingSafeEqual } from 'node:crypto';
import {
  type AdminUpdate,
  isAdminUpdateKind,
  sortAdminUpdates,
} from '../../../../lib/admin-updates/rules';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const runtime = 'nodejs';

const noStoreHeaders = { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' };
const apiKeyEnvironmentVariable = 'ADMIN_UPDATES_API_KEY';
const minimumApiKeyBytes = 32;

type AdminUpdateApiEntry = Omit<AdminUpdate, 'revision'>;
type AdminUpdatesDatabaseClient = ReturnType<typeof createAdminClient>;

async function readUpdates(admin: AdminUpdatesDatabaseClient) {
  return admin
    .from('app_updates')
    .select(
      'id, body_markdown, kind, completed_version, completed_at, sort_order, is_archived, created_at, updated_at',
    )
    .order('created_at', { ascending: false });
}

function jsonResponse(body: unknown, status: number) {
  return Response.json(body, { status, headers: noStoreHeaders });
}

function reportFailure(operation: string, code?: string) {
  console.error('Admin Updates API failed.', { operation, code: code ?? 'unknown' });
}

function hasValidApiKey(request: Request, configuredKey: string) {
  const authorization = request.headers.get('authorization');
  const match = authorization ? /^Bearer ([^\s]+)$/iu.exec(authorization) : null;
  if (!match) return false;

  const supplied = Buffer.from(match[1], 'utf8');
  const expected = Buffer.from(configuredKey, 'utf8');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request) {
  const configuredKey = process.env[apiKeyEnvironmentVariable];
  if (!configuredKey || Buffer.byteLength(configuredKey, 'utf8') < minimumApiKeyBytes) {
    return jsonResponse({ error: 'Admin Updates API is not configured.' }, 503);
  }
  if (!hasValidApiKey(request, configuredKey)) {
    return jsonResponse({ error: 'Invalid API credentials.' }, 401);
  }

  let admin: AdminUpdatesDatabaseClient;
  try {
    admin = createAdminClient();
  } catch (error) {
    reportFailure('admin_client_configuration', error instanceof Error ? error.name : undefined);
    return jsonResponse({ error: 'Unable to load Admin Updates. Please try again.' }, 503);
  }

  let updateRows: Awaited<ReturnType<typeof readUpdates>>;
  try {
    updateRows = await readUpdates(admin);
  } catch (error) {
    reportFailure('database_query', error instanceof Error ? error.name : undefined);
    return jsonResponse({ error: 'Unable to load Admin Updates. Please try again.' }, 503);
  }
  if (updateRows.error || !updateRows.data) {
    reportFailure('database_query', updateRows.error?.code);
    return jsonResponse({ error: 'Unable to load Admin Updates. Please try again.' }, 503);
  }

  const updates: AdminUpdateApiEntry[] = [];
  for (const row of updateRows.data) {
    if (!isAdminUpdateKind(row.kind)) {
      reportFailure('unsupported_classification');
      return jsonResponse({ error: 'Unable to load Admin Updates. Please try again.' }, 503);
    }

    updates.push({
      id: row.id,
      body_markdown: row.body_markdown,
      kind: row.kind,
      completed_version: row.completed_version,
      completed_at: row.completed_at,
      sort_order: row.sort_order,
      is_archived: row.is_archived,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  return jsonResponse({ updates: sortAdminUpdates(updates) }, 200);
}
