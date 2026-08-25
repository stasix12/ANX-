/**
 * Access control for the /api/trading/* routes. Two bearer tokens are
 * honoured: TRADING_API_SECRET (typed once into the dashboard, and used by
 * scripts/run-trader.mjs) and CRON_SECRET (which Vercel attaches to its cron
 * invocations automatically when the env var exists).
 *
 * With neither secret configured the routes stay usable — but only while the
 * engine points at a PAPER account. A live account with no secret set is
 * always refused: real money never sits behind an unauthenticated endpoint.
 */

import { getTradingConfig } from './config';

export function isTradingRequestAuthorized(request: Request): boolean {
  const secrets = [process.env.TRADING_API_SECRET, process.env.CRON_SECRET].filter(
    (s): s is string => typeof s === 'string' && s.length > 0,
  );
  if (secrets.length === 0) return getTradingConfig().paper;

  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  return token.length > 0 && secrets.includes(token);
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { ok: false, error: 'unauthorized', message: 'נדרש טוקן גישה (TRADING_API_SECRET).' },
    { status: 401 },
  );
}
