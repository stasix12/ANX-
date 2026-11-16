'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { ErrorNote, Panel, SeoShell, Stat } from '@/components/seo/SeoShell';
import { isConfigured, listKeywords } from '@/lib/seo/client';
import { CITIES, cityBySlug } from '@/lib/seo/config';
import type { KeywordRow } from '@/lib/seo/types';

/**
 * Keyword research.
 *
 * Every row here came from Search Console. There is deliberately no
 * search-volume or difficulty column: Search Console does not report either,
 * and the spec forbids inventing them — a made-up volume is exactly the kind of
 * number an operator would plan a month of work around.
 *
 * Rows arrive via the weekly cycle, which stores what it read while choosing
 * subjects. So an empty table means "the cycle has not run with a working
 * Search Console connection yet", and the empty state says so.
 */

const OPPORTUNITY_LABEL: Record<NonNullable<KeywordRow['opportunity']>, string> = {
  high_impressions_low_ctr: 'חשיפות גבוהות, CTR נמוך',
  missing_content: 'חסר תוכן באתר',
  improve_existing: 'שווה לחזק עמוד קיים',
};

const OPPORTUNITY_STYLE: Record<NonNullable<KeywordRow['opportunity']>, string> = {
  high_impressions_low_ctr: 'bg-amber-500/15 text-amber-300',
  missing_content: 'bg-brand-500/15 text-brand-400',
  improve_existing: 'bg-emerald-500/15 text-emerald-300',
};

export default function SeoKeywordsPage() {
  const [rows, setRows] = useState<KeywordRow[] | null>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'all' | 'he' | 'ru'>('all');
  const [city, setCity] = useState('all');
  const [opportunity, setOpportunity] = useState('all');

  const load = useCallback(async () => {
    if (!isConfigured()) {
      setError('Supabase לא מוגדר');
      setRows([]);
      return;
    }
    try {
      setRows(await listKeywords());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => lang === 'all' || r.lang === lang)
      .filter((r) => city === 'all' || (city === 'none' ? !r.city : r.city === city))
      .filter((r) => opportunity === 'all' || r.opportunity === opportunity);
  }, [rows, lang, city, opportunity]);

  if (rows === null) {
    return (
      <SeoShell title="מילות מפתח">
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
        </div>
      </SeoShell>
    );
  }

  const actionable = rows.filter((r) => r.opportunity !== null).length;
  const latest = rows.reduce<string | null>(
    (acc, r) => (acc === null || r.captured_for > acc ? r.captured_for : acc),
    null,
  );

  return (
    <SeoShell
      title="מילות מפתח"
      subtitle={latest ? `נתונים עד ${new Date(latest).toLocaleDateString('he-IL')}` : undefined}
    >
      <div className="space-y-5">
        {error ? <ErrorNote message={error} /> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="שאילתות שנאספו" value={String(rows.length)} note="מ-Search Console" />
          <Stat label="הזדמנויות" value={String(actionable)} note="ביטויים ששווה לפעול עליהם" />
          <Stat
            label="ביטויים ברוסית"
            value={String(rows.filter((r) => r.lang === 'ru').length)}
            note="זוהו לפי כתב קירילי"
          />
        </div>

        {rows.length === 0 ? (
          <Panel>
            <p className="text-sm leading-relaxed text-mist-500">
              עוד לא נאספו שאילתות. מילות המפתח נאספות אוטומטית בכל מחזור שבועי, מתוך
              Google Search Console. אם המחזור רץ ולא נאסף כלום — בדקו במסך הביצועים שהחיבור
              ל-Search Console מוגדר, ושלאתר יש כבר חשיפות בגוגל.
            </p>
          </Panel>
        ) : (
          <>
            <Panel>
              <div className="flex flex-wrap gap-4">
                <label className="flex-1 min-w-[9rem]">
                  <span className="mb-1 block text-xs font-bold text-mist-500">שפה</span>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as typeof lang)}
                    className="w-full rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-base font-bold text-mist-100"
                  >
                    <option value="all">שתי השפות</option>
                    <option value="he">עברית</option>
                    <option value="ru">רוסית</option>
                  </select>
                </label>
                <label className="flex-1 min-w-[9rem]">
                  <span className="mb-1 block text-xs font-bold text-mist-500">עיר בשאילתה</span>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-base font-bold text-mist-100"
                  >
                    <option value="all">הכול</option>
                    {CITIES.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.he}
                      </option>
                    ))}
                    <option value="none">בלי עיר בשאילתה</option>
                  </select>
                </label>
                <label className="flex-1 min-w-[9rem]">
                  <span className="mb-1 block text-xs font-bold text-mist-500">סוג הזדמנות</span>
                  <select
                    value={opportunity}
                    onChange={(e) => setOpportunity(e.target.value)}
                    className="w-full rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-base font-bold text-mist-100"
                  >
                    <option value="all">הכול</option>
                    {Object.entries(OPPORTUNITY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {/* The spec insists this distinction is stated, not assumed. */}
              <p className="mt-3 text-xs leading-relaxed text-mist-500">
                ״עיר בשאילתה״ = העיר שהופיעה בטקסט החיפוש. זה לא המיקום הגיאוגרפי של המחפש —
                Search Console לא מספק אותו כאן.
              </p>
            </Panel>

            <Panel title={`${shown.length} שאילתות`}>
              {/* Tables are the one thing allowed to scroll sideways. */}
              <div className="crm-snap -mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[46rem] text-sm">
                  <thead>
                    <tr className="border-b border-ink-800 text-start text-xs font-bold text-mist-500">
                      <th className="py-2 pe-3 text-start">שאילתה</th>
                      <th className="py-2 px-3 text-start">שפה</th>
                      <th className="py-2 px-3 text-end">חשיפות</th>
                      <th className="py-2 px-3 text-end">קליקים</th>
                      <th className="py-2 px-3 text-end">CTR</th>
                      <th className="py-2 px-3 text-end">מיקום</th>
                      <th className="py-2 ps-3 text-start">הזדמנות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const c = cityBySlug(r.city);
                      return (
                        <tr key={r.id} className="border-b border-ink-800/60">
                          <td className="py-2.5 pe-3">
                            <span dir={r.lang === 'he' ? 'rtl' : 'ltr'} className="font-bold text-mist-100">
                              {r.query}
                            </span>
                            {c ? (
                              <span className="ms-2 rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-bold text-brand-400">
                                {c.he}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 text-mist-300">{r.lang === 'he' ? 'עברית' : 'רוסית'}</td>
                          <td className="px-3 text-end tabular-nums text-mist-100">{r.impressions}</td>
                          <td className="px-3 text-end tabular-nums text-mist-100">{r.clicks}</td>
                          <td className="px-3 text-end tabular-nums text-mist-300">
                            {(r.ctr * 100).toFixed(1)}%
                          </td>
                          <td className="px-3 text-end tabular-nums text-mist-300">
                            {r.position === null ? '—' : r.position.toFixed(1)}
                          </td>
                          <td className="ps-3">
                            {r.opportunity ? (
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${OPPORTUNITY_STYLE[r.opportunity]}`}
                              >
                                {OPPORTUNITY_LABEL[r.opportunity]}
                              </span>
                            ) : (
                              <span className="text-xs text-mist-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </>
        )}
      </div>
    </SeoShell>
  );
}
