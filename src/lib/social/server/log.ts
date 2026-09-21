import 'server-only';
import { serviceDb } from './db';

/**
 * Activity log writer. Every value is scrubbed for anything token-shaped
 * before it is stored, so even a careless caller cannot leak a credential
 * into the log the UI displays.
 */
const TOKEN_RE = /(EAA[0-9A-Za-z]{20,}|access_token=[^&\s"']+|appsecret_proof=[0-9a-f]+)/g;

export function scrub(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(TOKEN_RE, '[redacted]');
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /token|secret|proof/i.test(k) ? '[redacted]' : scrub(v);
    }
    return out;
  }
  return value;
}

export async function logActivity(
  level: 'info' | 'warn' | 'error',
  event: string,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    await serviceDb().from('social_activity_log').insert({
      level,
      event,
      message: scrub(message) as string,
      meta: scrub(meta) as Record<string, unknown>,
    });
  } catch (err) {
    console.error('[social] log write failed', err instanceof Error ? err.message : err);
  }
}
