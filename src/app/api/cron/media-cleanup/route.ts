import { processMediaCleanup } from '../../../../lib/media/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'Media cleanup is not configured.' }, { status: 503 });
  }

  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Media cleanup authorization failed.' }, { status: 401 });
  }

  const result = await processMediaCleanup(createAdminClient());
  if (result.failed.length > 0) {
    return Response.json(
      {
        processed: result.processed,
        failed: result.failed.length,
        error: 'Some stored images could not be deleted; they remain queued for retry.',
      },
      { status: 503 },
    );
  }

  return Response.json({ processed: result.processed, failed: 0 });
}
