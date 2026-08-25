/**
 * The kill switch: cancel every working order and market-close every open
 * position, immediately. Wired to the red button on the dashboard.
 */

import { AlpacaClient } from '@/lib/trading/alpaca';
import { getTradingConfig } from '@/lib/trading/config';
import { isTradingRequestAuthorized, unauthorizedResponse } from '@/lib/trading/auth';

export async function POST(request: Request): Promise<Response> {
  if (!isTradingRequestAuthorized(request)) return unauthorizedResponse();

  const cfg = getTradingConfig();
  if (!cfg.keyId || !cfg.secretKey) {
    return Response.json({ ok: false, message: 'חסרים מפתחות Alpaca בהגדרות הסביבה.' }, { status: 500 });
  }

  try {
    const client = new AlpacaClient(cfg);
    const positions = await client.getPositions();
    await client.cancelAllOrders();
    if (positions.length > 0) await client.closeAllPositions();
    return Response.json({ ok: true, closed: positions.length });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
