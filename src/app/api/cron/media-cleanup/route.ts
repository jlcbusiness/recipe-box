import { processExportCleanup } from '../../../../lib/exports/server';
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

  const admin = createAdminClient();
  const [mediaResult, exportResult] = await Promise.all([
    processMediaCleanup(admin),
    processExportCleanup(admin),
  ]);
  const failedCount = mediaResult.failed.length + exportResult.failed.length;
  if (failedCount > 0) {
    return Response.json(
      {
        processed: mediaResult.processed,
        exportsProcessed: exportResult.processed,
        failed: failedCount,
        error: 'Some stored objects could not be deleted; they remain queued for retry.',
      },
      { status: 503 },
    );
  }

  return Response.json({
    processed: mediaResult.processed,
    exportsProcessed: exportResult.processed,
    failed: 0,
  });
}
