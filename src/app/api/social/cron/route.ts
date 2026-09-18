import { errorResponse, requireCron } from '@/lib/social/server/auth';
import { runWorker } from '@/lib/social/server/worker';

export const maxDuration = 60;

/**
 * Scheduled tick. Called every few minutes by .github/workflows/social-cron.yml
 * (or Vercel Cron via vercel.json) with SOCIAL_CRON_SECRET.
 */
async function handle(request: Request) {
  try {
    requireCron(request);
    const report = await runWorker('cron');
    return Response.json(report);
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = handle;
export const POST = handle;
