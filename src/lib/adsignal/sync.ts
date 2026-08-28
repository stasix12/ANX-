import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { metaConnector } from './connectors/meta';
import { trendsConnector } from './connectors/trends';
import { youtubeConnector } from './connectors/youtube';
import type { Connector } from './connectors/types';
import { runRollup } from './rollup';
import type { Niche } from './types';

export const CONNECTORS: Connector[] = [metaConnector, trendsConnector, youtubeConnector];

export type SyncReport = {
  startedAt: string;
  finishedAt: string;
  connectors: Record<string, { ran: boolean; ok?: boolean; error?: string; stats?: Record<string, number>; skipped?: string }>;
  rollup: Record<string, number> | null;
};

/**
 * One full pipeline pass: every configured connector, then the derived
 * rollup. Connectors that lack credentials are skipped and reported as
 * such — never silently, never with made-up data.
 */
export async function runSync(db: SupabaseClient): Promise<SyncReport> {
  const startedAt = new Date().toISOString();
  const report: SyncReport = { startedAt, finishedAt: '', connectors: {}, rollup: null };

  // The code-side taxonomy is the source of truth — adding a service there
  // is enough, the next sync registers it.
  const { SERVICES } = await import('./taxonomy');
  await db.from('adsignal_niches').upsert(SERVICES, { onConflict: 'key' });

  const { data: nicheData } = await db.from('adsignal_niches').select('*').order('sort');
  const niches = (nicheData ?? []) as Niche[];

  for (const connector of CONNECTORS) {
    if (!connector.isConfigured()) {
      report.connectors[connector.source] = {
        ran: false,
        skipped: `missing env: ${connector.requiredEnv.join(', ')}`,
      };
      continue;
    }
    const runAt = new Date().toISOString();
    try {
      const result = await connector.run(db, niches);
      report.connectors[connector.source] = { ran: true, ok: result.ok, stats: result.stats };
      await db.from('adsignal_connector_state').upsert({
        source: connector.source,
        last_run_at: runAt,
        last_ok_at: new Date().toISOString(),
        last_error: null,
        stats: result.stats,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report.connectors[connector.source] = { ran: true, ok: false, error: message };
      await db.from('adsignal_connector_state').upsert({
        source: connector.source,
        last_run_at: runAt,
        last_error: message,
      });
    }
  }

  try {
    report.rollup = await runRollup(db, niches);
  } catch (err) {
    report.rollup = null;
    report.connectors['rollup'] = {
      ran: true,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  report.finishedAt = new Date().toISOString();
  return report;
}
