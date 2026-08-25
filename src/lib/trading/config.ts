/**
 * Day-trading engine configuration, resolved from environment variables so
 * the strategy can be tuned per deployment without touching code. Every
 * numeric knob has a conservative default; the risky switches (live trading)
 * default OFF and must be enabled explicitly.
 *
 * The engine talks to Alpaca (https://alpaca.markets) — it is the only
 * broker with a free paper-trading API, which is what this system uses
 * unless ALPACA_PAPER=false AND ALPACA_ALLOW_LIVE=I_UNDERSTAND_THE_RISKS.
 */

export type TradingConfig = {
  /** Master switch — TRADING_ENABLED=false makes every tick a no-op. */
  enabled: boolean;
  /** Paper (simulated money) vs. live account. Paper unless ALPACA_PAPER=false. */
  paper: boolean;
  /** Live trading requires this exact opt-in phrase; see engine.ts. */
  liveOptIn: boolean;
  keyId: string;
  secretKey: string;
  /** Market-data feed. 'iex' is included in the free plan; 'sip' needs a paid one. */
  feed: 'iex' | 'sip';

  /** How many positions may be open at once. */
  maxOpenPositions: number;
  /** Fraction of account equity allocated to a single position. */
  positionPct: number;
  /** Hard dollar cap per position, whatever the equity is. */
  maxPositionUsd: number;
  /** Take-profit distance above entry (0.04 = +4%). */
  takeProfitPct: number;
  /** Stop-loss distance below entry (0.02 = -2%). */
  stopLossPct: number;
  /** Halt + liquidate for the day once equity drops this far below yesterday's close. */
  maxDailyLossPct: number;

  /** Candidate filters — what counts as a "hot" stock. */
  minPrice: number;
  maxPrice: number;
  minDayChangePct: number;
  minDollarVolume: number;

  /**
   * Trading windows as minutes since midnight, US Eastern time (the exchange
   * clock). Entries start a few minutes after the 09:30 open to let the
   * opening auction chaos settle, stop early enough for a trade to breathe,
   * and everything is force-closed before the 16:00 bell — this system never
   * holds a position overnight.
   */
  entryStartMinutesEt: number;
  entryEndMinutesEt: number;
  liquidateMinutesEt: number;
};

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** "HH:MM" → minutes since midnight; falls back on any malformed value. */
const timeEt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const match = raw?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
};

export function getTradingConfig(): TradingConfig {
  return {
    enabled: process.env.TRADING_ENABLED !== 'false',
    paper: process.env.ALPACA_PAPER !== 'false',
    liveOptIn: process.env.ALPACA_ALLOW_LIVE === 'I_UNDERSTAND_THE_RISKS',
    keyId: process.env.ALPACA_KEY_ID ?? '',
    secretKey: process.env.ALPACA_SECRET_KEY ?? '',
    feed: process.env.ALPACA_FEED === 'sip' ? 'sip' : 'iex',

    maxOpenPositions: num('TRADING_MAX_POSITIONS', 3),
    positionPct: num('TRADING_POSITION_PCT', 0.1),
    maxPositionUsd: num('TRADING_MAX_POSITION_USD', 2000),
    takeProfitPct: num('TRADING_TAKE_PROFIT_PCT', 0.04),
    stopLossPct: num('TRADING_STOP_LOSS_PCT', 0.02),
    maxDailyLossPct: num('TRADING_MAX_DAILY_LOSS_PCT', 0.03),

    minPrice: num('TRADING_MIN_PRICE', 3),
    maxPrice: num('TRADING_MAX_PRICE', 100),
    minDayChangePct: num('TRADING_MIN_DAY_CHANGE_PCT', 3),
    minDollarVolume: num('TRADING_MIN_DOLLAR_VOLUME', 5_000_000),

    entryStartMinutesEt: timeEt('TRADING_ENTRY_START_ET', 9 * 60 + 40),
    entryEndMinutesEt: timeEt('TRADING_ENTRY_END_ET', 15 * 60),
    liquidateMinutesEt: timeEt('TRADING_LIQUIDATE_ET', 15 * 60 + 50),
  };
}

/** Minutes since midnight in New York, for comparing against the windows above. */
export function minutesNowEt(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** Today's date in New York as YYYY-MM-DD — the trading day, not the server's day. */
export function tradingDayEt(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}
