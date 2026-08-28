import Link from 'next/link';
import { Empty, Prov, Sparkline, StatusPill, fmtPct, pctClass } from '@/components/adsignal/ui';
import {
  dbConfigured,
  getNicheMetrics,
  getNiches,
  getRisingQueries,
  getSearchRanking,
  getTrendSparklines,
} from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';

/**
 * The home screen answers one question, from one source: which services are
 * people in Israel searching for the most right now — Google Trends only.
 * Volume ranking comes from anchored comparison queries (the only honest way
 * to compare volumes across keywords), momentum from each service's own
 * series, and the rising list is Google's own "rising related queries".
 */
export default async function SearchNowPage() {
  if (!dbConfigured()) return <SetupNotice />;

  const [ranking, metrics, sparks, rising, niches] = await Promise.all([
    getSearchRanking(),
    getNicheMetrics('IL'),
    getTrendSparklines('IL'),
    getRisingQueries(15),
    getNiches(),
  ]);
  const name = (key: string) => niches.find((n) => n.key === key)?.name_he ?? key;
  const metricByKey = new Map(metrics.map((m) => [m.niche_key, m]));
  const maxVolume = Math.max(1, ...ranking.map((r) => r.volume));
  const updatedAt = ranking[0]?.volume_date;

  return (
    <>
      <h1 className="as-h1">🔍 מה מחפשים עכשיו בישראל</h1>
      <p className="as-sub">
        דירוג שירותים לפי נפח חיפוש יחסי ב־Google — <Prov kind="REAL" label="Google Trends" />
        {updatedAt && <> · עודכן {new Date(updatedAt).toLocaleDateString('he-IL')}</>} · מתעדכן כל לילה
      </p>

      {ranking.length === 0 ? (
        <Empty title="הדירוג ההשוואתי ייבנה בסנכרון הבא">
          נקודות הטרנד לכל שירות כבר נאספות; הדירוג ״מי מחופש הכי הרבה״ דורש שאילתות השוואה
          (שיטת עוגן) שנוספו הרגע — הוא יופיע אוטומטית אחרי ריצת הסנכרון הקרובה.
        </Empty>
      ) : (
        <div className="as-card as-rows">
          {ranking.map((row, i) => {
            const metric = metricByKey.get(row.niche_key);
            const spark = sparks.get(row.niche_key) ?? [];
            return (
              <Link key={row.niche_key} href={`/adsignal/israel#${row.niche_key}`} className="as-row" style={{ gap: 12 }}>
                <span className="as-num" style={{ width: 22, color: i < 3 ? 'var(--as-hot)' : 'var(--as-muted)', fontWeight: 700 }}>
                  {i + 1}
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="as-adline" style={{ marginBottom: 4 }}>
                    <span className="nm">{name(row.niche_key)}</span>
                    <span className={pctClass(metric?.demand_trend ?? null)} style={{ fontSize: 12.5 }}>
                      {fmtPct(metric?.demand_trend ?? null)} ב־7 ימים
                    </span>
                  </div>
                  <div className="as-gauge" style={{ height: 8 }}>
                    <i style={{
                      width: `${Math.max(3, (row.volume / maxVolume) * 100)}%`,
                      background: i < 3
                        ? 'linear-gradient(90deg, var(--as-amber), var(--as-hot))'
                        : 'var(--as-teal)',
                    }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <span className="as-num" style={{ fontWeight: 700, fontSize: 15 }}>{row.volume}</span>
                  <Sparkline values={spark} color={metric?.signal_status === 'hot' ? '#FF6B4A' : '#3EC9A7'} />
                </div>
              </Link>
            );
          })}
          <div className="sm" style={{ paddingTop: 10, fontSize: 11.5, color: 'var(--as-muted)' }}>
            נפח יחסי: {name(ranking.find((r) => r.volume === 100)?.niche_key ?? '') || 'שירות העוגן'} = 100.
            המספר אומר פי כמה שירות מחופש ביחס אליו — לא מספר חיפושים מוחלט.
          </div>
        </div>
      )}

      <section className="as-section">
        <div className="as-section-head">
          <h2>🚀 חיפושים שמזנקים עכשיו</h2>
          <Prov kind="REAL" label="Google Rising" />
        </div>
        {rising.length === 0 ? (
          <Empty>
            רשימת ה־Rising של Google — ביטויים שאנשים התחילו לחפש פתאום — תופיע אחרי הסנכרון הקרוב.
          </Empty>
        ) : (
          <div className="as-card as-rows">
            {rising.map((r) => (
              <div key={r.query} className="as-row">
                <div className="grow">
                  <div className="nm" style={{ fontSize: 13.5 }}>{r.query}</div>
                  <div className="sm">{name(r.niche_key)}</div>
                </div>
                <span className={r.growth >= 1000 ? 'as-badge der' : 'as-num up'} style={r.growth >= 1000 ? {} : { fontWeight: 700 }}>
                  {r.growth >= 1000 ? '🔥 BREAKOUT' : r.formatted || `+${r.growth}%`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="as-section">
        {metrics.length > 0 && (
          <div className="as-filters" style={{ paddingTop: 4 }}>
            {metrics
              .filter((m) => m.signal_status === 'hot' || m.signal_status === 'emerging' || m.signal_status === 'growing')
              .slice(0, 6)
              .map((m) => (
                <Link key={m.niche_key} href={`/adsignal/israel#${m.niche_key}`} className="as-chip on" style={{ display: 'inline-flex', gap: 6 }}>
                  {name(m.niche_key)} <StatusPill status={m.signal_status} />
                </Link>
              ))}
          </div>
        )}
        <p className="sm" style={{ fontSize: 12, color: 'var(--as-muted)', marginTop: 10 }}>
          ניתוח מעמיק לכל שירות — במסך <Link href="/adsignal/israel" style={{ color: 'var(--as-hot)' }}>🇮🇱 ישראל</Link>;
          דירוג הזדמנויות — ב<Link href="/adsignal/opportunities" style={{ color: 'var(--as-hot)' }}>־💎 הזדמנויות</Link>.
        </p>
      </section>
    </>
  );
}

function SetupNotice() {
  return (
    <>
      <h1 className="as-h1">AdSignal עוד לא מחובר</h1>
      <div className="as-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
        <div>1. הרץ את <code style={{ direction: 'ltr' }}>supabase/adsignal-schema.sql</code> ב־SQL Editor של Supabase.</div>
        <div>2. הוסף ל־env:‏ <code style={{ direction: 'ltr' }}>SUPABASE_SERVICE_ROLE_KEY</code>.</div>
        <div>3. פרטים במסך <Link href="/adsignal/status" style={{ color: 'var(--as-hot)' }}>חיבורים</Link>.</div>
      </div>
    </>
  );
}
