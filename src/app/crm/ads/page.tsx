'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdsBarChart, type AdsBarPoint } from '@/components/crm/AdsBarChart';
import { CrmShell } from '@/components/crm/CrmShell';
import { MONTH_LONG } from '@/components/crm/YearRevenueChart';
import { SpinnerIcon } from '@/components/icons';
import {
  conversationsLine,
  fetchSpendSeries,
  formatSpend,
  type SpendPoint,
} from '@/lib/crm/facebookAds';
import { formatDateLongHe } from '@/lib/crm/leads';
import { getFbAdsConfig, type FbAdsConfig } from '@/lib/crm/settings';

const MONTH_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];

type RangeView = 'monthly' | 'daily';

function SummaryTile({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="rounded-card border border-ink-700 surface p-3 text-center">
      <p aria-hidden className="text-lg leading-none">
        {emoji}
      </p>
      <p className="mt-1.5 text-lg font-extrabold tabular-nums text-blue-700">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-mist-500">{label}</p>
    </div>
  );
}

export default function CrmAdsPage() {
  const [config, setConfig] = useState<FbAdsConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [view, setView] = useState<RangeView>('monthly');
  const [monthly, setMonthly] = useState<SpendPoint[] | null>(null);
  const [daily, setDaily] = useState<SpendPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    getFbAdsConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setConfigLoaded(true));
  }, []);

  const load = useCallback(async (cfg: FbAdsConfig) => {
    setError(null);
    try {
      const [months, days] = await Promise.all([
        // The account's whole lifetime, one bucket per month — like Ads Manager.
        fetchSpendSeries(cfg, { timeIncrement: 'monthly', datePreset: 'maximum' }),
        fetchSpendSeries(cfg, { timeIncrement: 1, datePreset: 'last_30d' }),
      ]);
      setMonthly(months);
      setDaily(days);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שליפת נתוני הפרסום נכשלה.');
    }
  }, []);

  useEffect(() => {
    if (config) void load(config);
  }, [config, load]);

  const series = view === 'monthly' ? monthly : daily;

  // Keep the newest bar selected whenever the series or view changes.
  useEffect(() => {
    if (series?.length) setSelected(series.length - 1);
  }, [series]);

  const points: AdsBarPoint[] = useMemo(
    () =>
      (series ?? []).map((point) => {
        const [, month, day] = point.start.split('-').map(Number);
        return {
          label: view === 'monthly' ? MONTH_SHORT[month - 1] : `${day}.${month}`,
          value: point.spend,
          conversations: point.conversations,
        };
      }),
    [series, view],
  );

  const totals = useMemo(() => {
    const source = monthly ?? [];
    const spend = source.reduce((sum, p) => sum + p.spend, 0);
    const conversations = source.reduce((sum, p) => sum + p.conversations, 0);
    return { spend, conversations, costPer: conversations > 0 ? spend / conversations : null };
  }, [monthly]);

  const sel = series?.[selected];
  const selTitle = sel
    ? view === 'monthly'
      ? `${MONTH_LONG[Number(sel.start.slice(5, 7)) - 1]} ${sel.start.slice(0, 4)}`
      : formatDateLongHe(sel.start)
    : '';

  const currency = 'ILS';

  return (
    <CrmShell title="פרסום ממומן">
      {!configLoaded ? null : !config ? (
        <div className="rounded-card border border-ink-700 surface p-6 text-center">
          <p aria-hidden className="text-3xl">📣</p>
          <p className="mt-2 text-sm font-bold">עדיין לא חובר חשבון פרסום</p>
          <p className="mt-1 text-sm text-mist-500">מתחברים פעם אחת בעמוד הנתונים.</p>
          <Link
            href="/crm/stats"
            className="mt-3 inline-flex rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400"
          >
            לחיבור פייסבוק
          </Link>
        </div>
      ) : error ? (
        <div className="space-y-3 rounded-card border border-ink-700 surface p-4">
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
          <Link href="/crm/stats" className="inline-flex rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-on-brand">
            לעדכון החיבור
          </Link>
        </div>
      ) : !monthly ? (
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <SummaryTile label="סה״כ הוצאה" value={formatSpend(totals.spend, currency)} emoji="💰" />
            <SummaryTile label="סה״כ פניות" value={totals.conversations.toLocaleString('he-IL')} emoji="📥" />
            <SummaryTile
              label="ממוצע לפנייה"
              value={totals.costPer !== null ? formatSpend(totals.costPer, currency) : '—'}
              emoji="🎯"
            />
          </div>
          <p className="mt-1.5 text-center text-xs font-semibold text-mist-500">
            מאז תחילת הפעילות בחשבון הפרסום
          </p>

          <div className="mt-4 flex rounded-full border border-ink-700 bg-ink-850 p-1" role="group" aria-label="טווח הגרף">
            {(
              [
                { value: 'monthly', label: 'חודשי — מההתחלה' },
                { value: 'daily', label: 'יומי — 30 ימים' },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={view === option.value}
                onClick={() => setView(option.value)}
                className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
                  view === option.value ? 'bg-brand-500 text-on-brand' : 'text-mist-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-card border border-ink-700 surface p-4">
            {sel ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-base font-extrabold">
                  {selTitle} · <span className="tabular-nums">{formatSpend(sel.spend, currency)}</span>
                </p>
                <p className="text-sm font-semibold text-mist-500">
                  {conversationsLine(sel.conversations, sel.spend, currency)}
                </p>
              </div>
            ) : null}

            {points.length === 0 ? (
              <p className="py-10 text-center text-sm font-semibold text-mist-500">אין עדיין נתונים בטווח הזה.</p>
            ) : (
              <div className="mt-2">
                <AdsBarChart points={points} selected={selected} onSelect={setSelected} />
              </div>
            )}
          </div>

          <p className="mt-2 text-xs font-semibold text-mist-500">
            💡 לחץ על עמודה כדי לראות את הפירוט שלה. הגרף נגלל הצידה — הישן משמאל, החדש מימין.
          </p>
        </>
      )}
    </CrmShell>
  );
}
