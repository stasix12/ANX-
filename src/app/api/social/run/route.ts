import { errorResponse, requireAdminOrCron } from '@/lib/social/server/auth';
import { runWorker } from '@/lib/social/server/worker';

export const maxDuration = 60;

/** "Publish now" / manual tick from the dashboard. */
export async function POST(request: Request) {
  try {
    await requireAdminOrCron(request);
    const report = await runWorker('manual');
    return Response.json(report);
  } catch (err) {
    return errorResponse(err);
  }
}
