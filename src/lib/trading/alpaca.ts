/**
 * Minimal Alpaca REST client — only the endpoints the day-trading engine
 * needs, typed by hand rather than pulling in the (heavy, Node-only) official
 * SDK. Two hosts are involved: the trading API (account, orders, positions)
 * which differs between paper and live, and the market-data API (screeners,
 * snapshots) which is the same for both.
 */

import type { TradingConfig } from './config';

export type AlpacaClock = {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
};

export type AlpacaAccount = {
  equity: string;
  last_equity: string;
  cash: string;
  buying_power: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  account_blocked: boolean;
  currency: string;
};

export type AlpacaPosition = {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  change_today: string;
  side: 'long' | 'short';
};

export type AlpacaOrder = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  qty: string | null;
  notional: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  status: string;
  order_class: string;
  submitted_at: string;
  filled_at: string | null;
  limit_price: string | null;
  stop_price: string | null;
};

export type AlpacaAsset = {
  symbol: string;
  tradable: boolean;
  fractionable: boolean;
  exchange: string;
  status: string;
};

export type Mover = { symbol: string; percent_change: number; change: number; price: number };
export type MostActive = { symbol: string; volume: number; trade_count: number };

export type Snapshot = {
  latestTrade?: { p: number };
  dailyBar?: { o: number; h: number; l: number; c: number; v: number };
  prevDailyBar?: { c: number };
};

const DATA_HOST = 'https://data.alpaca.markets';

export class AlpacaClient {
  private readonly tradingHost: string;
  private readonly headers: Record<string, string>;
  private readonly feed: string;

  constructor(cfg: Pick<TradingConfig, 'paper' | 'keyId' | 'secretKey' | 'feed'>) {
    this.tradingHost = cfg.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
    this.feed = cfg.feed;
    this.headers = {
      'APCA-API-KEY-ID': cfg.keyId,
      'APCA-API-SECRET-KEY': cfg.secretKey,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(host: string, path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${host}${path}`, {
      ...init,
      headers: { ...this.headers, ...init?.headers },
      // Broker state must never be served from a cache.
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Alpaca ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body.slice(0, 300)}`);
    }
    // DELETE endpoints may return an empty body.
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  private trading<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>(this.tradingHost, path, init);
  }

  private data<T>(path: string): Promise<T> {
    return this.request<T>(DATA_HOST, path);
  }

  getClock(): Promise<AlpacaClock> {
    return this.trading('/v2/clock');
  }

  getAccount(): Promise<AlpacaAccount> {
    return this.trading('/v2/account');
  }

  getPositions(): Promise<AlpacaPosition[]> {
    return this.trading('/v2/positions');
  }

  getAsset(symbol: string): Promise<AlpacaAsset> {
    return this.trading(`/v2/assets/${encodeURIComponent(symbol)}`);
  }

  /** All orders submitted at/after the given ISO time (newest first). */
  getOrdersSince(afterIso: string): Promise<AlpacaOrder[]> {
    const q = new URLSearchParams({ status: 'all', after: afterIso, limit: '500', direction: 'desc' });
    return this.trading(`/v2/orders?${q}`);
  }

  getOpenOrders(): Promise<AlpacaOrder[]> {
    const q = new URLSearchParams({ status: 'open', limit: '500' });
    return this.trading(`/v2/orders?${q}`);
  }

  cancelAllOrders(): Promise<unknown> {
    return this.trading('/v2/orders', { method: 'DELETE' });
  }

  /** Market-sell every open position; cancel_orders also drops their bracket legs. */
  closeAllPositions(): Promise<unknown> {
    return this.trading('/v2/positions?cancel_orders=true', { method: 'DELETE' });
  }

  /**
   * Market buy wrapped in a bracket: the broker holds the take-profit and
   * stop-loss server-side as an OCO pair, so the exit fires even if this app
   * is down. Bracket orders require whole shares (no notional/fractional).
   */
  submitBracketBuy(params: {
    symbol: string;
    qty: number;
    takeProfitPrice: number;
    stopLossPrice: number;
  }): Promise<AlpacaOrder> {
    return this.trading('/v2/orders', {
      method: 'POST',
      body: JSON.stringify({
        symbol: params.symbol,
        qty: String(params.qty),
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
        order_class: 'bracket',
        take_profit: { limit_price: params.takeProfitPrice.toFixed(2) },
        stop_loss: { stop_price: params.stopLossPrice.toFixed(2) },
      }),
    });
  }

  /** Top percentage gainers so far today. */
  async getTopGainers(top = 20): Promise<Mover[]> {
    const res = await this.data<{ gainers: Mover[] }>(`/v1beta1/screener/stocks/movers?top=${top}`);
    return res.gainers ?? [];
  }

  /** Highest-volume stocks so far today. */
  async getMostActives(top = 20): Promise<MostActive[]> {
    const res = await this.data<{ most_actives: MostActive[] }>(
      `/v1beta1/screener/stocks/most-actives?by=volume&top=${top}`,
    );
    return res.most_actives ?? [];
  }

  async getSnapshots(symbols: string[]): Promise<Record<string, Snapshot>> {
    if (symbols.length === 0) return {};
    const q = new URLSearchParams({ symbols: symbols.join(','), feed: this.feed });
    return this.data(`/v2/stocks/snapshots?${q}`);
  }
}
