/**
 * Everything the /trading dashboard shows in one call: engine mode, the
 * exchange clock, account totals, open positions and today's orders. Read
 * only — it never places or cancels anything.
 */

import { AlpacaClient } from '@/lib/trading/alpaca';
import { getTradingConfig, tradingDayEt } from '@/lib/trading/config';
import { isTradingRequestAuthorized, unauthorizedResponse } from '@/lib/trading/auth';

export async function GET(request: Request): Promise<Response> {
  if (!isTradingRequestAuthorized(request)) return unauthorizedResponse();

  const cfg = getTradingConfig();
  if (!cfg.keyId || !cfg.secretKey) {
    return Response.json({ ok: false, error: 'missing-keys', message: 'חסרים מפתחות Alpaca בהגדרות הסביבה.' });
  }

  try {
    const client = new AlpacaClient(cfg);
    const dayStartIso = `${tradingDayEt()}T00:00:00-05:00`;
    const [clock, account, positions, orders] = await Promise.all([
      client.getClock(),
      client.getAccount(),
      client.getPositions(),
      client.getOrdersSince(dayStartIso),
    ]);

    return Response.json({
      ok: true,
      mode: cfg.paper ? 'paper' : 'live',
      enabled: cfg.enabled,
      clock,
      account: {
        equity: Number(account.equity),
        lastEquity: Number(account.last_equity),
        cash: Number(account.cash),
        buyingPower: Number(account.buying_power),
        daytradeCount: account.daytrade_count,
      },
      positions: positions.map((p) => ({
        symbol: p.symbol,
        qty: Number(p.qty),
        entry: Number(p.avg_entry_price),
        current: Number(p.current_price),
        marketValue: Number(p.market_value),
        pl: Number(p.unrealized_pl),
        plPct: Number(p.unrealized_plpc) * 100,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side,
        type: o.type,
        qty: o.qty ? Number(o.qty) : null,
        filledQty: Number(o.filled_qty),
        filledPrice: o.filled_avg_price ? Number(o.filled_avg_price) : null,
        status: o.status,
        submittedAt: o.submitted_at,
      })),
      settings: {
        maxOpenPositions: cfg.maxOpenPositions,
        takeProfitPct: cfg.takeProfitPct * 100,
        stopLossPct: cfg.stopLossPct * 100,
        maxDailyLossPct: cfg.maxDailyLossPct * 100,
        maxPositionUsd: cfg.maxPositionUsd,
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: 'alpaca-error', message: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
