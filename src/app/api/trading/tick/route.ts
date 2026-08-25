/**
 * One pass of the trading engine. Meant to be hit every few minutes during
 * US market hours by a scheduler — vercel.json wires Vercel's cron to GET
 * this route (cron requests carry `Authorization: Bearer $CRON_SECRET`),
 * and scripts/run-trader.mjs POSTs it in a local loop. Both verbs do the
 * same thing; the engine itself decides whether there is anything to do.
 */

import { runTick } from '@/lib/trading/engine';
import { isTradingRequestAuthorized, unauthorizedResponse } from '@/lib/trading/auth';

async function handle(request: Request): Promise<Response> {
  if (!isTradingRequestAuthorized(request)) return unauthorizedResponse();

  try {
    const report = await runTick();
    return Response.json(report, { status: report.ok ? 200 : 500 });
  } catch (error) {
    return Response.json(
      { ok: false, phase: 'error', message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
