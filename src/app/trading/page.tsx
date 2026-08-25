'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The trading dashboard — a single client page that polls /api/trading/status
 * and renders the account, the open positions and today's orders in Hebrew.
 * If the API answers 401 it asks once for the access token and keeps it in
 * localStorage; the token is only a gate on this dashboard, the Alpaca keys
 * themselves never leave the server.
 */

type Status = {
  ok: boolean;
  error?: string;
  message?: string;
  mode?: 'paper' | 'live';
  enabled?: boolean;
  clock?: { is_open: boolean; next_open: string; next_close: string };
  account?: {
    equity: number;
    lastEquity: number;
    cash: number;
    buyingPower: number;
    daytradeCount: number;
  };
  positions?: {
    symbol: string;
    qty: number;
    entry: number;
    current: number;
    marketValue: number;
    pl: number;
    plPct: number;
  }[];
  orders?: {
    id: string;
    symbol: string;
    side: 'buy' | 'sell';
    type: string;
    qty: number | null;
    filledQty: number;
    filledPrice: number | null;
    status: string;
    submittedAt: string;
  }[];
  settings?: {
    maxOpenPositions: number;
    takeProfitPct: number;
    stopLossPct: number;
    maxDailyLossPct: number;
    maxPositionUsd: number;
  };
};

const TOKEN_KEY = 'trading-dashboard-token';

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const ORDER_STATUS_HE: Record<string, string> = {
  new: 'ממתינה',
  accepted: 'התקבלה',
  partially_filled: 'מולאה חלקית',
  filled: 'בוצעה',
  canceled: 'בוטלה',
  expired: 'פגה',
  rejected: 'נדחתה',
  held: 'מוחזקת',
  pending_new: 'ממתינה',
};

export default function TradingDashboard() {
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [needsToken, setNeedsToken] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      setToken(localStorage.getItem(TOKEN_KEY) ?? '');
    } catch {
      /* private mode — just re-ask every visit */
    }
  }, []);

  const authHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/status', { headers: authHeaders, cache: 'no-store' });
      if (res.status === 401) {
        setNeedsToken(true);
        setStatus(null);
        return;
      }
      setNeedsToken(false);
      setStatus((await res.json()) as Status);
    } catch {
      setStatus({ ok: false, error: 'network', message: 'שגיאת רשת — לא ניתן להגיע לשרת.' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, 15_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  const saveToken = (e: React.FormEvent) => {
    e.preventDefault();
    const value = tokenInput.trim();
    try {
      localStorage.setItem(TOKEN_KEY, value);
    } catch {
      /* ignore */
    }
    setToken(value);
    setLoading(true);
  };

  const runAction = async (path: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch(path, { method: 'POST', headers: authHeaders });
      const body = (await res.json()) as { message?: string; closed?: number; phase?: string };
      if (res.status === 401) {
        setNeedsToken(true);
      } else if (path.includes('close-all')) {
        setActionMsg(res.ok ? `נסגרו ${body.closed ?? 0} פוזיציות.` : `שגיאה: ${body.message ?? res.status}`);
      } else {
        setActionMsg(body.message ?? body.phase ?? 'בוצע.');
      }
      await refresh();
    } catch {
      setActionMsg('שגיאת רשת.');
    } finally {
      setBusy(false);
    }
  };

  const account = status?.account;
  const dayPl = account ? account.equity - account.lastEquity : 0;
  const dayPlPct = account && account.lastEquity > 0 ? (dayPl / account.lastEquity) * 100 : 0;

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-4 py-8 text-mist-100">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">מסחר יומי אוטומטי</h1>
          <p className="mt-1 text-sm text-mist-300">
            קנייה אוטומטית של המניות החמות של היום, מכירה לפני סגירת השוק.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {status?.mode ? (
            <span
              className={`rounded-full px-3 py-1 font-semibold ${
                status.mode === 'paper' ? 'bg-sky-500/15 text-sky-300' : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {status.mode === 'paper' ? 'חשבון דמו (Paper)' : 'כסף אמיתי!'}
            </span>
          ) : null}
          {status?.clock ? (
            <span
              className={`rounded-full px-3 py-1 font-semibold ${
                status.clock.is_open ? 'bg-emerald-500/15 text-emerald-300' : 'bg-ink-700 text-mist-300'
              }`}
            >
              {status.clock.is_open ? 'השוק פתוח' : 'השוק סגור'}
            </span>
          ) : null}
        </div>
      </header>

      {needsToken ? (
        <form onSubmit={saveToken} className="rounded-card bg-ink-850 p-6">
          <h2 className="mb-2 text-lg font-semibold text-white">נדרש טוקן גישה</h2>
          <p className="mb-4 text-sm text-mist-300">
            הזינו את הערך של <code dir="ltr">TRADING_API_SECRET</code> שהוגדר בשרת. הוא יישמר בדפדפן הזה בלבד.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-base text-white outline-none focus:border-brand-400"
              placeholder="הדביקו את הטוקן כאן"
              autoFocus
            />
            <button
              type="submit"
              className="rounded-lg bg-brand-500 px-5 py-2 font-semibold text-on-brand transition hover:bg-brand-400"
            >
              כניסה
            </button>
          </div>
        </form>
      ) : loading ? (
        <p className="text-mist-300">טוען נתונים…</p>
      ) : !status?.ok ? (
        <div className="rounded-card bg-ink-850 p-6">
          <h2 className="mb-2 text-lg font-semibold text-rose-300">המערכת לא מחוברת</h2>
          <p className="text-sm leading-relaxed text-mist-300" dir="auto">
            {status?.message ?? 'שגיאה לא ידועה.'}
          </p>
          {status?.error === 'missing-keys' ? (
            <p className="mt-3 text-sm text-mist-300">
              פתחו חשבון (חינמי) ב-alpaca.markets, צרו מפתחות API בסביבת ה-Paper, והגדירו{' '}
              <code dir="ltr">ALPACA_KEY_ID</code> ו-<code dir="ltr">ALPACA_SECRET_KEY</code> בהגדרות הסביבה. פירוט
              מלא ב-README.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="שווי החשבון" value={usd(account!.equity)} />
            <StatCard
              label="רווח/הפסד היום"
              value={`${usd(dayPl)} (${dayPlPct >= 0 ? '+' : ''}${dayPlPct.toFixed(2)}%)`}
              tone={dayPl > 0 ? 'up' : dayPl < 0 ? 'down' : undefined}
            />
            <StatCard label="מזומן" value={usd(account!.cash)} />
            <StatCard label="כוח קנייה" value={usd(account!.buyingPower)} />
          </section>

          <section className="mb-6 rounded-card bg-ink-850 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">פוזיציות פתוחות ({status.positions!.length})</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => runAction('/api/trading/tick')}
                  disabled={busy}
                  className="rounded-lg bg-ink-700 px-4 py-1.5 text-sm font-semibold text-mist-100 transition hover:bg-ink-600 disabled:opacity-50"
                >
                  הפעל פעימה עכשיו
                </button>
                <button
                  onClick={() =>
                    runAction('/api/trading/close-all', 'לסגור מיד את כל הפוזיציות ולבטל את כל הפקודות?')
                  }
                  disabled={busy}
                  className="rounded-lg bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                >
                  מכור הכל עכשיו
                </button>
              </div>
            </div>
            {actionMsg ? (
              <p className="mb-3 rounded-lg bg-ink-900 px-3 py-2 text-sm text-mist-300" dir="auto">
                {actionMsg}
              </p>
            ) : null}
            {status.positions!.length === 0 ? (
              <p className="text-sm text-mist-300">אין פוזיציות פתוחות כרגע.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm [&_td]:px-3 [&_th]:px-3">
                  <thead>
                    <tr className="text-right text-mist-300">
                      <th className="pb-2 font-medium">מניה</th>
                      <th className="pb-2 font-medium">כמות</th>
                      <th className="pb-2 font-medium">מחיר כניסה</th>
                      <th className="pb-2 font-medium">מחיר נוכחי</th>
                      <th className="pb-2 font-medium">שווי</th>
                      <th className="pb-2 font-medium">רווח/הפסד</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.positions!.map((p) => (
                      <tr key={p.symbol} className="border-t border-ink-700">
                        <td className="py-2 font-bold text-white" dir="ltr">
                          {p.symbol}
                        </td>
                        <td className="py-2">{p.qty}</td>
                        <td className="py-2" dir="ltr">
                          {usd(p.entry)}
                        </td>
                        <td className="py-2" dir="ltr">
                          {usd(p.current)}
                        </td>
                        <td className="py-2" dir="ltr">
                          {usd(p.marketValue)}
                        </td>
                        <td
                          className={`py-2 font-semibold ${p.pl > 0 ? 'text-emerald-300' : p.pl < 0 ? 'text-rose-300' : ''}`}
                          dir="ltr"
                        >
                          {usd(p.pl)} ({p.plPct >= 0 ? '+' : ''}
                          {p.plPct.toFixed(2)}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mb-6 rounded-card bg-ink-850 p-5">
            <h2 className="mb-3 text-lg font-semibold text-white">הפקודות של היום ({status.orders!.length})</h2>
            {status.orders!.length === 0 ? (
              <p className="text-sm text-mist-300">עוד לא בוצעו פקודות היום.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {status.orders!.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-ink-900 px-3 py-2">
                    <span className={`font-bold ${o.side === 'buy' ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {o.side === 'buy' ? 'קנייה' : 'מכירה'}
                    </span>
                    <span className="font-bold text-white" dir="ltr">
                      {o.symbol}
                    </span>
                    {o.qty ? <span>{o.qty} יח׳</span> : null}
                    {o.filledPrice ? (
                      <span dir="ltr" className="text-mist-300">
                        @ {usd(o.filledPrice)}
                      </span>
                    ) : null}
                    <span className="text-mist-300">{ORDER_STATUS_HE[o.status] ?? o.status}</span>
                    <span className="ms-auto text-xs text-mist-500" dir="ltr">
                      {new Date(o.submittedAt).toLocaleTimeString('he-IL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {status.settings ? (
            <footer className="text-xs leading-relaxed text-mist-500">
              הגדרות פעילות: עד {status.settings.maxOpenPositions} פוזיציות במקביל · עד{' '}
              {usd(status.settings.maxPositionUsd)} לפוזיציה · טייק-פרופיט +{status.settings.takeProfitPct}% ·
              סטופ-לוס −{status.settings.stopLossPct}% · עצירה יומית בהפסד של {status.settings.maxDailyLossPct}% ·
              כל הפוזיציות נסגרות אוטומטית לפני סגירת השוק. {status.enabled ? '' : 'המנוע כבוי (TRADING_ENABLED=false).'}
              <br />
              המערכת אינה ייעוץ השקעות; מסחר יומי כרוך בסיכון ממשי להפסד כספי.
            </footer>
          ) : null}
        </>
      )}
    </main>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-card bg-ink-850 p-4">
      <div className="text-xs text-mist-300">{label}</div>
      <div
        className={`mt-1 text-lg font-bold ${tone === 'up' ? 'text-emerald-300' : tone === 'down' ? 'text-rose-300' : 'text-white'}`}
        dir="ltr"
      >
        {value}
      </div>
    </div>
  );
}
