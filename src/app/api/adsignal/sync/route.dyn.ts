import { NextResponse } from 'next/server';
import { getAdsignalDb } from '@/lib/adsignal/db';
import { runSync } from '@/lib/adsignal/sync';

/**
 * Runs the full ingest + rollup pipeline. Wired to a daily cron (vercel.json)
 * and to the "Sync now" button on /adsignal/status.
 *
 * When ADSIGNAL_CRON_SECRET is set, callers must send it (Vercel cron sends
 * `Authorization: Bearer <CRON_SECRET>`; the UI posts it same-origin via the
 * server, so browsers never see it). Without the secret set, the route is
 * open — fine for a private preview, set the secret before sharing the URL.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.ADSIGNAL_CRON_SECRET;
  if (secret) {
    const header = request.headers.get('authorization');
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  const db = getAdsignalDb();
  if (!db) {
    return NextResponse.json(
      { error: 'Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' },
      { status: 503 },
    );
  }
  const report = await runSync(db);
  return NextResponse.json(report);
}

export async function POST(request: Request) {
  return handle(request);
}

// Vercel cron fires GET.
export async function GET(request: Request) {
  return handle(request);
}
