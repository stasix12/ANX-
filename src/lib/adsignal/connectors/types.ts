import type { SupabaseClient } from '@supabase/supabase-js';
import type { Niche } from '../types';

export type RunStats = Record<string, number>;

export type ConnectorResult = {
  ok: boolean;
  stats: RunStats;
  error?: string;
};

export type Connector = {
  /** Stable id, also the adsignal_connector_state key. */
  source: string;
  /** Human name shown on the status screen. */
  name: string;
  /** Which env var(s) unlock it — surfaced verbatim when missing. */
  requiredEnv: string[];
  /** What this source can and cannot provide, shown on the status screen. */
  coverage: { provides: string; limits: string };
  isConfigured(): boolean;
  run(db: SupabaseClient, niches: Niche[]): Promise<ConnectorResult>;
};

export async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: non-JSON response (${text.slice(0, 200)})`);
  }
  if (!res.ok) {
    const message =
      (json as { error?: { message?: string } })?.error?.message ??
      (json as { error?: string })?.error ??
      `HTTP ${res.status}`;
    throw new Error(String(message));
  }
  return json;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
