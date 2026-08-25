/**
 * The tick — one full pass of the trading loop. A scheduler (Vercel cron,
 * an external cron service, or scripts/run-trader.mjs) calls this every few
 * minutes during US market hours; each pass is stateless and re-derives
 * everything it needs from the broker, so a missed or doubled tick is safe.
 *
 * Order of operations, most protective first:
 *   1. refuse to run live without the explicit opt-in phrase
 *   2. daily-loss circuit breaker → liquidate + halt
 *   3. end-of-day window → liquidate everything (never hold overnight)
 *   4. entry window + free slots → scan for hot stocks, buy with brackets
 *
 * Exits need no step of their own: every entry is a bracket order whose
 * take-profit/stop-loss pair lives on the broker's servers.
 */

import { AlpacaClient } from './alpaca';
import { getTradingConfig, minutesNowEt, tradingDayEt } from './config';
import { scanHotStocks } from './strategy';

export type TickReport = {
  ok: boolean;
  phase:
    | 'disabled'
    | 'missing-keys'
    | 'live-not-allowed'
    | 'market-closed'
    | 'account-blocked'
    | 'daily-loss-halt'
    | 'liquidate'
    | 'waiting'
    | 'trade';
  message: string;
  equity?: number;
  dayPlPct?: number;
  openPositions?: number;
  entered?: { symbol: string; qty: number; price: number; takeProfit: number; stopLoss: number }[];
  candidates?: string[];
  rejected?: { symbol: string; reason: string }[];
};

export async function runTick(): Promise<TickReport> {
  const cfg = getTradingConfig();

  if (!cfg.enabled) {
    return { ok: true, phase: 'disabled', message: 'TRADING_ENABLED=false — the engine is off.' };
  }
  if (!cfg.keyId || !cfg.secretKey) {
    return { ok: false, phase: 'missing-keys', message: 'ALPACA_KEY_ID / ALPACA_SECRET_KEY are not set.' };
  }
  if (!cfg.paper && !cfg.liveOptIn) {
    return {
      ok: false,
      phase: 'live-not-allowed',
      message:
        'Refusing to trade a LIVE account: set ALPACA_ALLOW_LIVE=I_UNDERSTAND_THE_RISKS to opt in, or keep ALPACA_PAPER=true.',
    };
  }

  const client = new AlpacaClient(cfg);
  const clock = await client.getClock();
  if (!clock.is_open) {
    return { ok: true, phase: 'market-closed', message: `Market closed; next open ${clock.next_open}.` };
  }

  const [account, positions] = await Promise.all([client.getAccount(), client.getPositions()]);
  const equity = Number(account.equity);
  const lastEquity = Number(account.last_equity);
  const dayPlPct = lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;
  const base = { equity, dayPlPct, openPositions: positions.length };

  if (account.trading_blocked || account.account_blocked) {
    return { ...base, ok: false, phase: 'account-blocked', message: 'Broker reports the account is blocked.' };
  }

  // Circuit breaker: one bad day must not become a terrible one.
  if (lastEquity > 0 && equity <= lastEquity * (1 - cfg.maxDailyLossPct)) {
    await client.cancelAllOrders();
    if (positions.length > 0) await client.closeAllPositions();
    return {
      ...base,
      ok: true,
      phase: 'daily-loss-halt',
      message: `Down ${dayPlPct.toFixed(2)}% today (limit ${(cfg.maxDailyLossPct * 100).toFixed(1)}%) — liquidated and halted for the day.`,
    };
  }

  const nowEt = minutesNowEt();

  // End of day: flatten everything well before the close.
  if (nowEt >= cfg.liquidateMinutesEt) {
    await client.cancelAllOrders();
    if (positions.length > 0) {
      await client.closeAllPositions();
      return { ...base, ok: true, phase: 'liquidate', message: `Closed ${positions.length} position(s) into the close.` };
    }
    return { ...base, ok: true, phase: 'liquidate', message: 'End-of-day window; nothing left to close.' };
  }

  // Outside the entry window we only babysit the brackets, which need no help.
  if (nowEt < cfg.entryStartMinutesEt || nowEt >= cfg.entryEndMinutesEt) {
    return { ...base, ok: true, phase: 'waiting', message: 'Outside the entry window; holding existing brackets only.' };
  }

  const freeSlots = cfg.maxOpenPositions - positions.length;
  if (freeSlots <= 0) {
    return { ...base, ok: true, phase: 'trade', message: 'All position slots are in use.', entered: [] };
  }

  // Never touch a symbol we already hold, have an order working on, or traded
  // earlier today — one shot per symbol per day keeps the engine from churning
  // (and from re-buying a stock its own stop-loss just kicked out).
  const dayStartIso = `${tradingDayEt()}T00:00:00-05:00`;
  const [openOrders, todayOrders] = await Promise.all([
    client.getOpenOrders(),
    client.getOrdersSince(dayStartIso),
  ]);
  const exclude = new Set<string>();
  for (const p of positions) exclude.add(p.symbol);
  for (const o of openOrders) exclude.add(o.symbol);
  for (const o of todayOrders) exclude.add(o.symbol);

  const { candidates, rejected } = await scanHotStocks(client, cfg, exclude);

  const entered: NonNullable<TickReport['entered']> = [];
  for (const candidate of candidates) {
    if (entered.length >= freeSlots) break;

    // The screener occasionally surfaces halted or non-tradable listings.
    const asset = await client.getAsset(candidate.symbol).catch(() => null);
    if (!asset || !asset.tradable || asset.status !== 'active') {
      rejected.push({ symbol: candidate.symbol, reason: 'not-tradable' });
      continue;
    }

    const notional = Math.min(equity * cfg.positionPct, cfg.maxPositionUsd, Number(account.buying_power));
    const qty = Math.floor(notional / candidate.price);
    if (qty < 1) {
      rejected.push({ symbol: candidate.symbol, reason: 'position-budget-below-one-share' });
      continue;
    }

    const takeProfit = candidate.price * (1 + cfg.takeProfitPct);
    const stopLoss = candidate.price * (1 - cfg.stopLossPct);
    try {
      await client.submitBracketBuy({
        symbol: candidate.symbol,
        qty,
        takeProfitPrice: takeProfit,
        stopLossPrice: stopLoss,
      });
      entered.push({ symbol: candidate.symbol, qty, price: candidate.price, takeProfit, stopLoss });
    } catch (error) {
      rejected.push({
        symbol: candidate.symbol,
        reason: `order-rejected: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return {
    ...base,
    ok: true,
    phase: 'trade',
    message:
      entered.length > 0
        ? `Entered ${entered.map((e) => e.symbol).join(', ')}.`
        : 'No candidate passed the filters this tick.',
    entered,
    candidates: candidates.map((c) => c.symbol),
    rejected,
  };
}
