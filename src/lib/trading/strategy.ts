/**
 * The "hot stock" scanner — turns the market's raw movers list into a short,
 * ranked list of symbols worth a momentum day-trade right now.
 *
 * The idea: a stock that is up strongly on the day, trading on real volume,
 * and still holding near its high-of-day has demonstrated momentum that
 * statistically tends to persist over the next hour — long enough for a
 * +4% take-profit / -2% stop-loss bracket to resolve. Everything cheap,
 * illiquid, fading, or already ours is filtered out first.
 */

import type { AlpacaClient, Snapshot } from './alpaca';
import type { TradingConfig } from './config';

export type Candidate = {
  symbol: string;
  price: number;
  dayChangePct: number;
  dollarVolume: number;
  reasons: string[];
};

export type ScanResult = {
  candidates: Candidate[];
  /** Symbols that showed up hot but failed a filter, with the reason — for the tick report. */
  rejected: { symbol: string; reason: string }[];
};

export async function scanHotStocks(
  client: AlpacaClient,
  cfg: TradingConfig,
  excludeSymbols: Set<string>,
): Promise<ScanResult> {
  // Two independent "heat" signals: biggest % gainers and heaviest volume.
  const [gainers, actives] = await Promise.all([client.getTopGainers(25), client.getMostActives(25)]);

  const universe = new Set<string>();
  for (const g of gainers) universe.add(g.symbol);
  for (const a of actives) universe.add(a.symbol);

  const rejected: ScanResult['rejected'] = [];
  const toCheck: string[] = [];
  for (const symbol of universe) {
    // Leveraged-ETF tickers and units/warrants (5+ letters, or .W suffixes)
    // dominate the actives list but are not the momentum trade this engine
    // makes; plain common stock only.
    if (!/^[A-Z]{1,5}$/.test(symbol)) {
      rejected.push({ symbol, reason: 'not-common-stock' });
      continue;
    }
    if (excludeSymbols.has(symbol)) {
      rejected.push({ symbol, reason: 'already-held-or-traded-today' });
      continue;
    }
    toCheck.push(symbol);
  }

  const snapshots = await client.getSnapshots(toCheck);
  const candidates: Candidate[] = [];

  for (const symbol of toCheck) {
    const snap: Snapshot | undefined = snapshots[symbol];
    const price = snap?.latestTrade?.p ?? snap?.dailyBar?.c;
    const day = snap?.dailyBar;
    const prevClose = snap?.prevDailyBar?.c;

    if (!snap || !price || !day || !prevClose) {
      rejected.push({ symbol, reason: 'no-market-data' });
      continue;
    }

    const dayChangePct = ((price - prevClose) / prevClose) * 100;
    const dollarVolume = day.v * price;

    if (price < cfg.minPrice || price > cfg.maxPrice) {
      rejected.push({ symbol, reason: `price-out-of-range (${price.toFixed(2)})` });
      continue;
    }
    if (dayChangePct < cfg.minDayChangePct) {
      rejected.push({ symbol, reason: `day-change-too-small (${dayChangePct.toFixed(1)}%)` });
      continue;
    }
    if (dollarVolume < cfg.minDollarVolume) {
      rejected.push({ symbol, reason: 'volume-too-thin' });
      continue;
    }
    // Momentum confirmation: still above today's open (the move hasn't
    // reversed) and within 1.5% of the high of day (not already fading).
    if (price <= day.o) {
      rejected.push({ symbol, reason: 'below-open-price' });
      continue;
    }
    if (price < day.h * 0.985) {
      rejected.push({ symbol, reason: 'fading-off-high' });
      continue;
    }

    candidates.push({
      symbol,
      price,
      dayChangePct,
      dollarVolume,
      reasons: [
        `+${dayChangePct.toFixed(1)}% today`,
        `$${Math.round(dollarVolume / 1e6)}M volume`,
        'holding near high of day',
      ],
    });
  }

  // Strongest momentum first; the engine takes as many as it has free slots.
  candidates.sort((a, b) => b.dayChangePct - a.dayChangePct);
  return { candidates, rejected };
}
