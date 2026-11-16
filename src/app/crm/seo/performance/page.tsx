'use client';

import { useCallback, useEffect, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { ErrorNote, NotConfigured, Panel, SeoShell, Stat } from '@/components/seo/SeoShell';
import { callSeoApi } from '@/lib/seo/client';
import { cityBySlug } from '@/lib/seo/config';
import type { ConnectionState } from '@/lib/seo/types';

/**
 * Search Console performance.
 *
 * The whole screen is one of three states and never a blend: connected (real
 * numbers), not configured (the variables to set), or errored (what Google
 * said). There is no fourth state where a zero stands in for an unknown —
 * that is the spec's requirement and also simply the only honest option, since
 * "0 clicks" and "we cannot see your clicks" would lead to opposite decisions.
 */

type Row = {
  query: string;
  page: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  lang: 'he' | 'ru' | null;
  city: string | null;
  opportunity: 'high_impressions_low_ctr' | 'missing_content' | 'improve_existing' | null;
};

type Totals = { clicks: number; impressions: number; ctr: number; position: number };

type ApiResponse =
  | {
      ok: true;
      window: { startDate: string; endDate: string; days: number };
      totals: Totals;
      previousTotals: Totals | null;
      rows: Row[];
    }
  | { ok: false; connection: ConnectionState };

const WINDOWS = [7, 28, 90] as const;

/** Period-over-period delta, or null when there is nothing to compare against. */
function delta(current: number, previous: number | undefined): string | null {
  if (previous === undefined || previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(0)}% מול התקופה הקודמת`;
}

export default function SeoPerformancePage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [days, setDays] = useState<number>(28);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (window: number) => {
    setLoading(true);
    setError('');
    try {
      setData(await callSeoApi<ApiResponse>('/api/seo/gsc', { days: window }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  const windowPicker = (
    <div role="group" className="flex gap-1 rounded-full border border-ink-800 p-1">
      {WINDOWS.map((w) => (
        <button
          key={w}
          type="button"
          aria-pressed={days === w}
          onClick={() => setDays(w)}
          className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
            days === w ? 'bg-brand-500 text-on-brand' : 'text-mist-300 hover:bg-ink-900'
          }`}
        >
          {w} ימים
        </button>
      ))}
    </div>
  );

  return (
    <SeoShell
      title="ביצועים"
      subtitle={
        data?.ok
          ? `${new Date(data.window.startDate).toLocaleDateString('he-IL')} – ${new Date(data.window.endDate).toLocaleDateString('he-IL')}`
          : 'Google Search Console'
      }
      action={windowPicker}
    >
      <div className="space-y-5">
        {error ? <ErrorNote message={error} /> : null}

        {loading ? (
          <div className="grid place-items-center py-20">
            <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
          </div>
        ) : !data ? null : !data.ok ? (
          data.connection.state === 'not_configured' ? (
            <NotConfigured what="Google Search Console" missing={data.connection.missing} />
          ) : (
            <ErrorNote
              message={`Search Console החזיר שגיאה: ${
                data.connection.state === 'error' ? data.connection.message : 'לא ידוע'
              }`}
            />
          )
        ) : (
          <>
            {/* Search Console reports with a 2-3 day lag; saying so prevents
                "why is yesterday empty" every single week. */}
            <p className="rounded-2xl border border-ink-800 bg-ink-850 p-4 text-xs leading-relaxed text-mist-500">
              הנתונים מגיעים ישירות מ-Google Search Console. גוגל מדווח בפיגור של יומיים-שלושה,
              ולכן החלון מסתיים לפני שלושה ימים — כך שההשוואה בין תקופות נשארת מדויקת.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="קליקים"
                value={data.totals.clicks.toLocaleString('he-IL')}
                note={delta(data.totals.clicks, data.previousTotals?.clicks) ?? 'אין תקופה להשוואה'}
              />
              <Stat
                label="חשיפות"
                value={data.totals.impressions.toLocaleString('he-IL')}
                note={
                  delta(data.totals.impressions, data.previousTotals?.impressions) ??
                  'אין תקופה להשוואה'
                }
              />
              <Stat
                label="CTR"
                value={`${(data.totals.ctr * 100).toFixed(1)}%`}
                note={data.previousTotals ? `לפני: ${(data.previousTotals.ctr * 100).toFixed(1)}%` : 'אין תקופה להשוואה'}
              />
              <Stat
                label="מיקום ממוצע"
                value={data.totals.position.toFixed(1)}
                note={
                  data.previousTotals
                    ? `לפני: ${data.previousTotals.position.toFixed(1)}`
                    : 'אין תקופה להשוואה'
                }
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="ביצועים לפי שפה" hint="זוהה לפי כתב השאילתה">
                <ul className="space-y-2">
                  {(['he', 'ru'] as const).map((l) => {
                    const rows = data.rows.filter((r) => r.lang === l);
                    const clicks = rows.reduce((a, r) => a + r.clicks, 0);
                    const impressions = rows.reduce((a, r) => a + r.impressions, 0);
                    return (
                      <li key={l} className="rounded-xl bg-ink-900 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-mist-100">
                            {l === 'he' ? 'עברית' : 'רוסית'}
                          </span>
                          <span className="text-sm tabular-nums text-mist-300">
                            {clicks} קליקים · {impressions} חשיפות
                          </span>
                        </div>
                      </li>
                    );
                  })}
                  {(() => {
                    const other = data.rows.filter((r) => r.lang === null);
                    return other.length ? (
                      <li className="rounded-xl bg-ink-900 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-mist-100">לא מזוהה</span>
                          <span className="text-sm tabular-nums text-mist-300">
                            {other.reduce((a, r) => a + r.clicks, 0)} קליקים
                          </span>
                        </div>
                      </li>
                    ) : null;
                  })()}
                </ul>
              </Panel>

              <Panel title="עמודים מובילים">
                {(() => {
                  const byPage = new Map<string, { clicks: number; impressions: number }>();
                  for (const r of data.rows) {
                    if (!r.page) continue;
                    const cur = byPage.get(r.page) ?? { clicks: 0, impressions: 0 };
                    byPage.set(r.page, {
                      clicks: cur.clicks + r.clicks,
                      impressions: cur.impressions + r.impressions,
                    });
                  }
                  const top = [...byPage.entries()].sort((a, b) => b[1].clicks - a[1].clicks).slice(0, 8);
                  return top.length === 0 ? (
                    <p className="text-sm text-mist-500">אין נתוני עמודים בחלון הזה.</p>
                  ) : (
                    <ul className="space-y-2">
                      {top.map(([page, m]) => (
                        <li key={page} className="rounded-xl bg-ink-900 px-4 py-3">
                          <p dir="ltr" className="truncate font-mono text-xs text-mist-300">
                            {page.replace(/^https?:\/\/[^/]+/, '') || '/'}
                          </p>
                          <p className="mt-1 text-sm tabular-nums text-mist-500">
                            {m.clicks} קליקים · {m.impressions} חשיפות
                          </p>
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </Panel>
            </div>

            <Panel title="הזדמנויות לשיפור" hint="שאילתות שכדאי לפעול עליהן">
              {(() => {
                const ops = data.rows
                  .filter((r) => r.opportunity !== null)
                  .sort((a, b) => b.impressions - a.impressions)
                  .slice(0, 25);
                return ops.length === 0 ? (
                  <p className="text-sm text-mist-500">
                    לא זוהו הזדמנויות בחלון הזה. ככל שייצטברו חשיפות, יופיעו כאן ביטויים לפעולה.
                  </p>
                ) : (
                  <div className="crm-snap -mx-5 overflow-x-auto px-5">
                    <table className="w-full min-w-[40rem] text-sm">
                      <thead>
                        <tr className="border-b border-ink-800 text-xs font-bold text-mist-500">
                          <th className="py-2 pe-3 text-start">שאילתה</th>
                          <th className="py-2 px-3 text-end">חשיפות</th>
                          <th className="py-2 px-3 text-end">CTR</th>
                          <th className="py-2 px-3 text-end">מיקום</th>
                          <th className="py-2 ps-3 text-start">למה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ops.map((r) => {
                          const c = cityBySlug(r.city);
                          return (
                            <tr key={r.query} className="border-b border-ink-800/60">
                              <td className="py-2.5 pe-3">
                                <span dir={r.lang === 'ru' ? 'ltr' : 'rtl'} className="font-bold text-mist-100">
                                  {r.query}
                                </span>
                                {c ? (
                                  <span className="ms-2 rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-bold text-brand-400">
                                    {c.he}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 text-end tabular-nums text-mist-100">{r.impressions}</td>
                              <td className="px-3 text-end tabular-nums text-mist-300">
                                {(r.ctr * 100).toFixed(1)}%
                              </td>
                              <td className="px-3 text-end tabular-nums text-mist-300">
                                {r.position.toFixed(1)}
                              </td>
                              <td className="ps-3 text-mist-300">
                                {r.opportunity === 'high_impressions_low_ctr'
                                  ? 'נחשף הרבה, כמעט לא נלחץ'
                                  : r.opportunity === 'missing_content'
                                    ? 'ביקוש בלי תוכן מתאים'
                                    : 'קרוב לראש — שווה חיזוק'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </Panel>
          </>
        )}
      </div>
    </SeoShell>
  );
}
