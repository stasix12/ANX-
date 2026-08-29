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
const WEEKDAY_LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

type RangeView = 'monthly' | 'daily' | 'custom';
type Metric = 'spend' | 'conversations' | 'cpl';

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
};

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: 'spend', label: '💸 הוצאה' },
  { value: 'conversations', label: '📥 פניות' },
  { value: 'cpl', label: '🎯 עלות לפנייה' },
];

function metricValue(point: SpendPoint, metric: Metric): number {
  if (metric === 'spend') return point.spend;
  if (metric === 'conversations') return point.conversations;
  return point.conversations > 0 ? point.spend / point.conversations : 0;
}

const sumSpend = (points: SpendPoint[]) => points.reduce((sum, p) => sum + p.spend, 0);
const sumConv = (points: SpendPoint[]) => points.reduce((sum, p) => sum + p.conversations, 0);
const cplOf = (points: SpendPoint[]): number | null => {
  const conversations = sumConv(points);
  return conversations > 0 ? sumSpend(points) / conversations : null;
};

const monthName = (isoStart: string) => MONTH_LONG[Number(isoStart.slice(5, 7)) - 1];
const monthKeyLabel = (key: string) => `${MONTH_LONG[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

function statsOf(points: SpendPoint[]) {
  const spend = sumSpend(points);
  const conversations = sumConv(points);
  return { spend, conversations, cpl: conversations > 0 ? spend / conversations : null };
}

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

/** A month-over-month cell: the value plus a colored arrow-delta underneath. */
function DeltaTile({
  label,
  value,
  delta,
  goodWhenDown,
}: {
  label: string;
  value: string;
  /** Percent change vs the previous month, null when it can't be computed. */
  delta: number | null;
  goodWhenDown: boolean;
}) {
  let deltaText = '—';
  let deltaClass = 'text-mist-500';
  if (delta !== null) {
    if (Math.abs(delta) < 0.5) {
      deltaText = '≈ ללא שינוי';
    } else {
      const good = goodWhenDown ? delta < 0 : delta > 0;
      deltaText = `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}%`;
      deltaClass = good ? 'text-emerald-600' : 'text-red-600';
    }
  }
  return (
    <div className="text-center">
      <p className="text-xs font-semibold text-mist-500">{label}</p>
      <p className="mt-0.5 text-base font-extrabold tabular-nums">{value}</p>
      <p className={`mt-0.5 text-xs font-bold tabular-nums ${deltaClass}`}>{deltaText}</p>
    </div>
  );
}

/** The arrow-percent between two periods; green when the change is good. */
function DeltaBadge({
  from,
  to,
  goodWhenDown,
}: {
  from: number | null;
  to: number | null;
  goodWhenDown: boolean;
}) {
  if (from === null || to === null || from <= 0) {
    return <span className="font-bold text-mist-500">—</span>;
  }
  const delta = ((to - from) / from) * 100;
  if (Math.abs(delta) < 0.5) return <span className="font-bold text-mist-500">≈</span>;
  const good = goodWhenDown ? delta < 0 : delta > 0;
  return (
    <span className={`font-bold tabular-nums ${good ? 'text-emerald-600' : 'text-red-600'}`}>
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
    </span>
  );
}

interface Insight {
  emoji: string;
  text: string;
}

export default function CrmAdsPage() {
  const [config, setConfig] = useState<FbAdsConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [view, setView] = useState<RangeView>('monthly');
  const [metric, setMetric] = useState<Metric>('spend');
  const [monthly, setMonthly] = useState<SpendPoint[] | null>(null);
  const [daily, setDaily] = useState<SpendPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [customRange, setCustomRange] = useState({ since: isoYearsAgo(1), until: isoToday() });
  const [customSeries, setCustomSeries] = useState<SpendPoint[] | null>(null);
  const [customIncrement, setCustomIncrement] = useState<'monthly' | 1>('monthly');
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<'month' | 'year'>('month');
  const [monthA, setMonthA] = useState('');
  const [monthB, setMonthB] = useState('');
  const [yearA, setYearA] = useState('');
  const [yearB, setYearB] = useState('');

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

  const loadCustom = useCallback(
    async (range: { since: string; until: string }) => {
      if (!config) return;
      if (!range.since || !range.until || range.since > range.until) {
        setCustomError('בחר טווח תקין — תאריך ההתחלה צריך להיות לפני הסיום.');
        return;
      }
      // Long spans (years) come back as monthly buckets — a 4-year daily chart
      // would be ~1,500 bars; short spans stay daily for the fine detail.
      const spanDays = (Date.parse(range.until) - Date.parse(range.since)) / 86_400_000;
      const increment: 'monthly' | 1 = spanDays > 92 ? 'monthly' : 1;
      setCustomLoading(true);
      setCustomError(null);
      try {
        const rows = await fetchSpendSeries(config, { timeIncrement: increment, timeRange: range });
        setCustomIncrement(increment);
        setCustomSeries(rows);
      } catch (err) {
        setCustomError(err instanceof Error ? err.message : 'שליפת נתוני הפרסום נכשלה.');
      } finally {
        setCustomLoading(false);
      }
    },
    [config],
  );

  // Entering the custom tab for the first time loads its default range.
  useEffect(() => {
    if (view === 'custom' && !customSeries && !customLoading) void loadCustom(customRange);
  }, [view, customSeries, customLoading, loadCustom, customRange]);

  const series = view === 'monthly' ? monthly : view === 'daily' ? daily : customSeries;
  const monthlyBuckets = view === 'monthly' || (view === 'custom' && customIncrement === 'monthly');

  // Keep the newest bar selected whenever the series or view changes.
  useEffect(() => {
    if (series?.length) setSelected(series.length - 1);
  }, [series]);

  const points: AdsBarPoint[] = useMemo(
    () =>
      (series ?? []).map((point) => {
        const [, month, day] = point.start.split('-').map(Number);
        // Custom spans cross years, so their month labels carry the year.
        const label = monthlyBuckets
          ? view === 'custom'
            ? `${MONTH_SHORT[month - 1]} ${point.start.slice(2, 4)}`
            : MONTH_SHORT[month - 1]
          : `${day}.${month}`;
        return {
          label,
          value: metricValue(point, metric),
          conversations: point.conversations,
        };
      }),
    [series, view, metric, monthlyBuckets],
  );

  const customTotals = useMemo(() => {
    if (!customSeries) return null;
    return { spend: sumSpend(customSeries), conversations: sumConv(customSeries) };
  }, [customSeries]);

  // Everything the comparison card can pick from — 'YYYY-MM' month keys and
  // the distinct years, straight out of the lifetime monthly series.
  const monthKeys = useMemo(() => (monthly ?? []).map((p) => p.start.slice(0, 7)), [monthly]);
  const yearKeys = useMemo(() => [...new Set(monthKeys.map((k) => k.slice(0, 4)))], [monthKeys]);

  // Sensible defaults: the latest month against the same month a year back
  // (falling back to the month before), and this year against last year.
  useEffect(() => {
    if (!monthKeys.length) return;
    const latest = monthKeys[monthKeys.length - 1];
    const sameMonthLastYear = `${Number(latest.slice(0, 4)) - 1}${latest.slice(4)}`;
    setMonthB((b) => (b && monthKeys.includes(b) ? b : latest));
    setMonthA((a) =>
      a && monthKeys.includes(a)
        ? a
        : monthKeys.includes(sameMonthLastYear)
          ? sameMonthLastYear
          : monthKeys[Math.max(0, monthKeys.length - 2)],
    );
    const lastYear = yearKeys[yearKeys.length - 1];
    setYearB((b) => (b && yearKeys.includes(b) ? b : lastYear));
    setYearA((a) => (a && yearKeys.includes(a) ? a : (yearKeys[yearKeys.length - 2] ?? lastYear)));
  }, [monthKeys, yearKeys]);

  const compare = useMemo(() => {
    const source = monthly ?? [];
    if (!source.length) return null;
    const nowMonth = new Date().toISOString().slice(0, 7);
    if (compareMode === 'month') {
      if (!monthA || !monthB) return null;
      const partial = (key: string) => (key === nowMonth ? ' (עד היום)' : '');
      return {
        labelA: monthKeyLabel(monthA) + partial(monthA),
        labelB: monthKeyLabel(monthB) + partial(monthB),
        a: statsOf(source.filter((p) => p.start.startsWith(monthA))),
        b: statsOf(source.filter((p) => p.start.startsWith(monthB))),
        breakdown: null as null | { month: number; aSpend: number | null; bSpend: number | null }[],
      };
    }
    if (!yearA || !yearB) return null;
    const breakdown: { month: number; aSpend: number | null; bSpend: number | null }[] = [];
    for (let m = 1; m <= 12; m++) {
      const mm = `-${String(m).padStart(2, '0')}`;
      const pa = source.find((p) => p.start.startsWith(yearA + mm));
      const pb = source.find((p) => p.start.startsWith(yearB + mm));
      if (pa || pb) breakdown.push({ month: m, aSpend: pa?.spend ?? null, bSpend: pb?.spend ?? null });
    }
    const partialYear = (year: string) => (year === nowMonth.slice(0, 4) ? ' (עד היום)' : '');
    return {
      labelA: yearA + partialYear(yearA),
      labelB: yearB + partialYear(yearB),
      a: statsOf(source.filter((p) => p.start.startsWith(yearA))),
      b: statsOf(source.filter((p) => p.start.startsWith(yearB))),
      breakdown,
    };
  }, [monthly, compareMode, monthA, monthB, yearA, yearB]);

  const totals = useMemo(() => {
    const source = monthly ?? [];
    const spend = sumSpend(source);
    const conversations = sumConv(source);
    return { spend, conversations, costPer: conversations > 0 ? spend / conversations : null };
  }, [monthly]);

  // The last two *complete* months — the running month is partial, so comparing
  // it head-to-head against a full month would always look like a crash.
  const mom = useMemo(() => {
    const currentKey = new Date().toISOString().slice(0, 7);
    const complete = (monthly ?? []).filter((p) => p.start.slice(0, 7) !== currentKey);
    if (complete.length < 2) return null;
    const previous = complete[complete.length - 2];
    const last = complete[complete.length - 1];
    const lastCpl = last.conversations > 0 ? last.spend / last.conversations : null;
    const prevCpl = previous.conversations > 0 ? previous.spend / previous.conversations : null;
    const pct = (prev: number | null, next: number | null): number | null =>
      prev !== null && next !== null && prev > 0 ? ((next - prev) / prev) * 100 : null;
    return {
      title: `${monthName(last.start)} מול ${monthName(previous.start)}`,
      last,
      lastCpl,
      spendDelta: pct(previous.spend, last.spend),
      convDelta: pct(previous.conversations, last.conversations),
      cplDelta: pct(prevCpl, lastCpl),
    };
  }, [monthly]);

  // Everything here is derived from the two series already on hand — no extra
  // Graph calls, just reading the data the way a media buyer would.
  const insights = useMemo<Insight[]>(() => {
    const items: Insight[] = [];
    const days = daily ?? [];
    const months = monthly ?? [];
    const money = (v: number) => formatSpend(v, 'ILS');

    // 1. Weekly momentum: last 7 days vs the 7 before them.
    if (days.length >= 14) {
      const last7 = days.slice(-7);
      const prev7 = days.slice(-14, -7);
      const lastCpl = cplOf(last7);
      const prevCpl = cplOf(prev7);
      if (lastCpl !== null && prevCpl !== null) {
        const change = ((lastCpl - prevCpl) / prevCpl) * 100;
        if (change <= -10) {
          items.push({
            emoji: '📉',
            text: `מגמה מצוינת: עלות לפנייה ירדה בשבוע האחרון ל‑${money(lastCpl)} לעומת ${money(prevCpl)} בשבוע שלפני (${Math.abs(change).toFixed(0)}% שיפור).`,
          });
        } else if (change >= 10) {
          items.push({
            emoji: '📈',
            text: `שים לב: עלות לפנייה עלתה בשבוע האחרון ל‑${money(lastCpl)} לעומת ${money(prevCpl)} בשבוע שלפני — שווה לרענן קריאייטיב או קהל.`,
          });
        } else {
          items.push({
            emoji: '⚖️',
            text: `יציבות: עלות לפנייה בשבוע האחרון (${money(lastCpl)}) דומה לשבוע שלפני (${money(prevCpl)}).`,
          });
        }
      } else if (sumSpend(last7) > 0 && sumConv(last7) === 0) {
        items.push({
          emoji: '🚨',
          text: `בשבוע האחרון הוצאת ${money(sumSpend(last7))} בלי אף פנייה — כדאי לבדוק את הקמפיין בהקדם.`,
        });
      }
    }

    // 2. Days that burned budget with zero inquiries.
    const burned = days.filter((p) => p.spend > 0 && p.conversations === 0);
    if (burned.length > 0) {
      items.push({
        emoji: '🔥',
        text: `ב‑30 הימים האחרונים היו ${burned.length} ימים עם הוצאה של ${money(sumSpend(burned))} בלי אף פנייה. בדוק אילו ימים ושקול תזמון מודעות.`,
      });
    } else if (days.some((p) => p.spend > 0)) {
      items.push({ emoji: '✅', text: 'אין ימים "שרופים" — בכל יום עם הוצאה בחודש האחרון התקבלו פניות.' });
    }

    // 3. Which weekday converts cheapest / priciest (last 30 days).
    const byWeekday = new Map<number, { spend: number; conversations: number }>();
    for (const p of days) {
      const dow = new Date(`${p.start}T00:00:00`).getDay();
      const agg = byWeekday.get(dow) ?? { spend: 0, conversations: 0 };
      agg.spend += p.spend;
      agg.conversations += p.conversations;
      byWeekday.set(dow, agg);
    }
    const weekdayCpls = [...byWeekday.entries()]
      .filter(([, agg]) => agg.conversations > 0 && agg.spend > 0)
      .map(([dow, agg]) => ({ dow, cpl: agg.spend / agg.conversations }));
    if (weekdayCpls.length >= 3) {
      const best = weekdayCpls.reduce((a, b) => (b.cpl < a.cpl ? b : a));
      const worst = weekdayCpls.reduce((a, b) => (b.cpl > a.cpl ? b : a));
      if (best.dow !== worst.dow && worst.cpl >= best.cpl * 1.4) {
        items.push({
          emoji: '📅',
          text: `היום המשתלם ביותר בחודש האחרון: יום ${WEEKDAY_LONG[best.dow]} (~${money(best.cpl)} לפנייה). היקר ביותר: יום ${WEEKDAY_LONG[worst.dow]} (~${money(worst.cpl)}). שקול להסיט תקציב לימים החזקים.`,
        });
      }
    }

    // 4. Best and priciest month ever (ignoring token months of tiny spend).
    const qualifying = months
      .filter((p) => p.spend >= 100 && p.conversations > 0)
      .map((p) => ({ start: p.start, cpl: p.spend / p.conversations }));
    if (qualifying.length >= 4) {
      const best = qualifying.reduce((a, b) => (b.cpl < a.cpl ? b : a));
      const worst = qualifying.reduce((a, b) => (b.cpl > a.cpl ? b : a));
      if (best.start !== worst.start) {
        items.push({
          emoji: '🏆',
          text: `החודש המשתלם ביותר אי־פעם: ${monthName(best.start)} ${best.start.slice(0, 4)} (${money(best.cpl)} לפנייה). היקר ביותר: ${monthName(worst.start)} ${worst.start.slice(0, 4)} (${money(worst.cpl)}).`,
        });
      }
    }

    // 5. The running month against the lifetime average.
    const currentKey = new Date().toISOString().slice(0, 7);
    const current = months.find((p) => p.start.slice(0, 7) === currentKey);
    const lifetime = cplOf(months);
    if (current && current.conversations > 0 && lifetime !== null && lifetime > 0) {
      const currentCpl = current.spend / current.conversations;
      const diff = ((currentCpl - lifetime) / lifetime) * 100;
      if (diff <= -5) {
        items.push({
          emoji: '🚀',
          text: `החודש אתה משיג פניות ב‑${Math.abs(diff).toFixed(0)}% פחות מהממוצע הכללי שלך (${money(currentCpl)} מול ${money(lifetime)}).`,
        });
      } else if (diff >= 5) {
        items.push({
          emoji: '🧭',
          text: `החודש עלות הפנייה (${money(currentCpl)}) גבוהה ב‑${diff.toFixed(0)}% מהממוצע הכללי שלך (${money(lifetime)}).`,
        });
      } else {
        items.push({
          emoji: '🎯',
          text: `החודש אתה בדיוק בקו הממוצע הכללי שלך — ${money(currentCpl)} לפנייה.`,
        });
      }
    }

    return items;
  }, [monthly, daily]);

  const sel = series?.[selected];
  const selTitle = sel
    ? monthlyBuckets
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
          <Link
            href="/crm/ads/campaign"
            className="mt-2 block text-sm font-bold text-brand-400"
          >
            🛋️ בינתיים — קמפיין באר שבע מוכן להשקה
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

          <Link
            href="/crm/ads/optimize"
            className="mt-3 flex items-center justify-center gap-2 rounded-full bg-brand-500 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400"
          >
            🎛️ אופטימיזציית קמפיינים — מה לעשות עכשיו
          </Link>
          <Link
            href="/crm/ads/campaign"
            className="mt-2 flex items-center justify-center gap-2 rounded-full border border-brand-500/50 py-2.5 text-sm font-bold text-brand-400 transition-colors hover:bg-brand-500/10"
          >
            🛋️ קמפיין באר שבע — מוכן להשקה
          </Link>

          {mom ? (
            <div className="mt-3 rounded-card border border-ink-700 surface p-3">
              <p className="text-center text-xs font-bold text-mist-500">📊 {mom.title}</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <DeltaTile
                  label="הוצאה"
                  value={formatSpend(mom.last.spend, currency)}
                  delta={mom.spendDelta}
                  goodWhenDown
                />
                <DeltaTile
                  label="פניות"
                  value={mom.last.conversations.toLocaleString('he-IL')}
                  delta={mom.convDelta}
                  goodWhenDown={false}
                />
                <DeltaTile
                  label="עלות לפנייה"
                  value={mom.lastCpl !== null ? formatSpend(mom.lastCpl, currency) : '—'}
                  delta={mom.cplDelta}
                  goodWhenDown
                />
              </div>
            </div>
          ) : null}

          {compare ? (
            <div className="mt-3 rounded-card border border-ink-700 surface p-3">
              <p className="text-center text-xs font-bold text-mist-500">⚖️ השוואה חופשית</p>

              <div className="mt-2 flex rounded-full border border-ink-700 bg-ink-850 p-1" role="group" aria-label="סוג ההשוואה">
                {(
                  [
                    { value: 'month', label: 'חודש מול חודש' },
                    { value: 'year', label: 'שנה מול שנה' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={compareMode === option.value}
                    onClick={() => setCompareMode(option.value)}
                    className={`flex-1 rounded-full py-1.5 text-xs font-bold transition-colors ${
                      compareMode === option.value ? 'bg-brand-500 text-on-brand' : 'text-mist-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {compareMode === 'month' ? (
                  <>
                    <select
                      aria-label="תקופה ראשונה"
                      value={monthA}
                      onChange={(e) => setMonthA(e.target.value)}
                      className="w-full rounded-xl border border-ink-700 bg-ink-850 px-2 py-2 text-sm font-semibold"
                    >
                      {[...monthKeys].reverse().map((key) => (
                        <option key={key} value={key}>
                          {monthKeyLabel(key)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="תקופה שנייה"
                      value={monthB}
                      onChange={(e) => setMonthB(e.target.value)}
                      className="w-full rounded-xl border border-ink-700 bg-ink-850 px-2 py-2 text-sm font-semibold"
                    >
                      {[...monthKeys].reverse().map((key) => (
                        <option key={key} value={key}>
                          {monthKeyLabel(key)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <select
                      aria-label="שנה ראשונה"
                      value={yearA}
                      onChange={(e) => setYearA(e.target.value)}
                      className="w-full rounded-xl border border-ink-700 bg-ink-850 px-2 py-2 text-sm font-semibold"
                    >
                      {[...yearKeys].reverse().map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="שנה שנייה"
                      value={yearB}
                      onChange={(e) => setYearB(e.target.value)}
                      className="w-full rounded-xl border border-ink-700 bg-ink-850 px-2 py-2 text-sm font-semibold"
                    >
                      {[...yearKeys].reverse().map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div className="mt-2.5 overflow-hidden rounded-xl border border-ink-700">
                <div className="grid grid-cols-[1.1fr_1fr_1fr_0.8fr] gap-1 bg-ink-850 px-2 py-1.5 text-[11px] font-bold text-mist-500">
                  <span />
                  <span className="text-center">{compare.labelA}</span>
                  <span className="text-center">{compare.labelB}</span>
                  <span className="text-center">שינוי</span>
                </div>
                {(
                  [
                    {
                      label: 'הוצאה',
                      a: compare.a.spend,
                      b: compare.b.spend,
                      fmt: (v: number) => formatSpend(v, currency),
                      goodWhenDown: true,
                    },
                    {
                      label: 'פניות',
                      a: compare.a.conversations,
                      b: compare.b.conversations,
                      fmt: (v: number) => v.toLocaleString('he-IL'),
                      goodWhenDown: false,
                    },
                    {
                      label: 'עלות לפנייה',
                      a: compare.a.cpl,
                      b: compare.b.cpl,
                      fmt: (v: number) => formatSpend(v, currency),
                      goodWhenDown: true,
                    },
                  ] as const
                ).map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[1.1fr_1fr_1fr_0.8fr] items-center gap-1 border-t border-ink-700 px-2 py-2 text-xs"
                  >
                    <span className="font-semibold text-mist-500">{row.label}</span>
                    <span className="text-center font-bold tabular-nums">
                      {row.a !== null ? row.fmt(row.a) : '—'}
                    </span>
                    <span className="text-center font-bold tabular-nums">
                      {row.b !== null ? row.fmt(row.b) : '—'}
                    </span>
                    <span className="text-center">
                      <DeltaBadge from={row.a} to={row.b} goodWhenDown={row.goodWhenDown} />
                    </span>
                  </div>
                ))}
              </div>

              {compare.breakdown?.length ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-bold text-brand-400">
                    📅 פירוט הוצאה חודש מול חודש
                  </summary>
                  <div className="mt-1.5 overflow-hidden rounded-xl border border-ink-700">
                    {compare.breakdown.map((row) => (
                      <div
                        key={row.month}
                        className="grid grid-cols-[1.1fr_1fr_1fr_0.8fr] items-center gap-1 border-t border-ink-700 px-2 py-1.5 text-xs first:border-t-0"
                      >
                        <span className="font-semibold text-mist-500">{MONTH_LONG[row.month - 1]}</span>
                        <span className="text-center font-bold tabular-nums">
                          {row.aSpend !== null ? formatSpend(row.aSpend, currency) : '—'}
                        </span>
                        <span className="text-center font-bold tabular-nums">
                          {row.bSpend !== null ? formatSpend(row.bSpend, currency) : '—'}
                        </span>
                        <span className="text-center">
                          <DeltaBadge from={row.aSpend} to={row.bSpend} goodWhenDown />
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex rounded-full border border-ink-700 bg-ink-850 p-1" role="group" aria-label="טווח הגרף">
            {(
              [
                { value: 'monthly', label: 'חודשי — הכל' },
                { value: 'daily', label: 'יומי — 30' },
                { value: 'custom', label: '📆 תאריכים' },
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

          {view === 'custom' ? (
            <div className="mt-2 rounded-card border border-ink-700 surface p-3">
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4].map((years) => (
                  <button
                    key={years}
                    type="button"
                    onClick={() => {
                      const range = { since: isoYearsAgo(years), until: isoToday() };
                      setCustomRange(range);
                      void loadCustom(range);
                    }}
                    className="rounded-full border border-ink-700 bg-ink-850 px-3 py-1.5 text-xs font-bold text-mist-300"
                  >
                    {years === 1 ? 'שנה אחרונה' : years === 2 ? 'שנתיים' : `${years} שנים`}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-mist-500">
                  מתאריך
                  <input
                    type="date"
                    value={customRange.since}
                    max={customRange.until}
                    onChange={(e) => setCustomRange((r) => ({ ...r, since: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-850 px-2 py-2 text-sm font-semibold"
                  />
                </label>
                <label className="text-xs font-semibold text-mist-500">
                  עד תאריך
                  <input
                    type="date"
                    value={customRange.until}
                    min={customRange.since}
                    max={isoToday()}
                    onChange={(e) => setCustomRange((r) => ({ ...r, until: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-850 px-2 py-2 text-sm font-semibold"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={customLoading}
                onClick={() => void loadCustom(customRange)}
                className="mt-2.5 w-full rounded-full bg-brand-500 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-60"
              >
                {customLoading ? 'טוען…' : 'הצג טווח'}
              </button>
              {customError ? (
                <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
                  {customError}
                </p>
              ) : null}
              {customTotals && !customLoading && !customError ? (
                <p className="mt-2 text-center text-xs font-semibold text-mist-500">
                  סה״כ בטווח: {formatSpend(customTotals.spend, currency)} ·{' '}
                  {conversationsLine(customTotals.conversations, customTotals.spend, currency)}
                  {customIncrement === 'monthly' ? ' · בחלוקה חודשית' : ' · בחלוקה יומית'}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-2 flex gap-1.5" role="group" aria-label="המדד בגרף">
            {METRIC_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={metric === option.value}
                onClick={() => setMetric(option.value)}
                className={`flex-1 rounded-full border py-1.5 text-xs font-bold transition-colors ${
                  metric === option.value
                    ? 'border-brand-500 bg-brand-500 text-on-brand'
                    : 'border-ink-700 bg-ink-850 text-mist-300'
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

            {view === 'custom' && customLoading ? (
              <div className="grid place-items-center py-10">
                <SpinnerIcon className="h-6 w-6 animate-spin text-brand-500" />
              </div>
            ) : points.length === 0 ? (
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

          {insights.length > 0 ? (
            <div className="mt-4 rounded-card border border-ink-700 surface p-4">
              <h2 className="text-sm font-extrabold">🧠 ניתוח אוטומטי</h2>
              <ul className="mt-2 space-y-2.5">
                {insights.map((insight, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed">
                    <span aria-hidden className="shrink-0">
                      {insight.emoji}
                    </span>
                    <span>{insight.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </CrmShell>
  );
}
