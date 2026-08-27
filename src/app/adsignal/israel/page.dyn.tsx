import Link from 'next/link';
import { Empty, Prov, Sparkline, StatusPill, fmtPct, pctClass } from '@/components/adsignal/ui';
import { dbConfigured, getNicheMetrics, getNiches, getTrendSparklines, getTrendingOffers } from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: '🇮🇱 Israel Trends' };

export default async function IsraelPage() {
  if (!dbConfigured()) {
    return <Empty title="Supabase אינו מוגדר">ראה את שלבי ההתקנה ב<Link href="/adsignal" style={{ color: 'var(--as-hot)' }}>דשבורד</Link>.</Empty>;
  }
  const [metrics, niches, sparks, offers] = await Promise.all([
    getNicheMetrics('IL'),
    getNiches(),
    getTrendSparklines('IL'),
    getTrendingOffers(20),
  ]);
  const byKey = new Map(metrics.map((m) => [m.niche_key, m]));
  const name = (key: string) => niches.find((n) => n.key === key)?.name_he ?? key;

  return (
    <>
      <h1 className="as-h1">🇮🇱 Israel Trends</h1>
      <p className="as-sub">מה מתחיל לעבוד עכשיו בשוק הישראלי — ביקוש, פעילות פרסומית והזדמנויות.</p>

      <Empty title="מצב כיסוי · ישראל">
        סיגנלים אוטומטיים: ביקוש חיפוש (<Prov kind="REAL" label="Google Trends" />) וסיגנל אורגני
        (<Prov kind="REAL" label="YouTube" />). מודעות <span dir="ltr">Meta</span> מסחריות ישראליות
        אינן זמינות ב־API הרשמי — רק פוליטיות; מעקב מפרסמים ספציפיים דרך{' '}
        <Link href="/adsignal/competitors" style={{ color: 'var(--as-hot)' }}>Competitor Watch</Link>.
        כל הציונים כאן הם <Prov kind="DERIVED" /> עם Confidence לפי הסיגנלים שקיימים בפועל.
      </Empty>

      {metrics.length === 0 && (
        <Empty title="עדיין אין מדדים לישראל">
          הרץ סנכרון ראשון במסך <Link href="/adsignal/status" style={{ color: 'var(--as-hot)' }}>חיבורים</Link> —
          לאחר איסוף Trends/YouTube יחושבו המדדים לכל נישה.
        </Empty>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
        {niches.map((n) => {
          const m = byKey.get(n.key);
          const spark = sparks.get(n.key) ?? [];
          return (
            <div key={n.key} id={n.key} className="as-card">
              <div className="as-adline" style={{ marginBottom: 8 }}>
                <div>
                  <div className="nm" style={{ fontWeight: 700, fontSize: 15 }}>{n.name_he}</div>
                  <div className="sm" style={{ color: 'var(--as-muted)', fontSize: 12 }}>{n.name_en}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sparkline values={spark} color={m?.signal_status === 'hot' ? '#FF6B4A' : '#3EC9A7'} />
                  <StatusPill status={m?.signal_status ?? null} />
                </div>
              </div>
              {m ? (
                <div className="as-grid cols2" style={{ gap: 8 }}>
                  <Metric label="Demand Trend" value={fmtPct(m.demand_trend)} cls={pctClass(m.demand_trend)} prov="REAL" />
                  <Metric label="Ad Activity" value={fmtPct(m.ad_activity)} cls={pctClass(m.ad_activity)} prov="DERIVED" />
                  <Metric label="Competition" value={m.competition != null ? `${Math.round(m.competition)}/100` : '—'} cls="as-num" prov="DERIVED" />
                  <Metric label="New Advertisers 7d" value={m.new_advertisers_7d?.toString() ?? '—'} cls="as-num" prov="DERIVED" />
                  <Metric label="Active Ads" value={m.active_ads?.toString() ?? 'לא זמין ל־IL'} cls="as-num" prov="DERIVED" />
                  <Metric label="Opportunity" value={m.opportunity != null ? `${Math.round(m.opportunity)}/100` : '—'} cls="as-num hotc" prov="DERIVED" />
                </div>
              ) : (
                <div className="sm" style={{ color: 'var(--as-muted)', fontSize: 12.5 }}>
                  אין עדיין נתונים לנישה זו — יופיעו לאחר הסנכרון הבא.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="as-section">
        <div className="as-section-head">
          <h2>🎯 Offers שמתפשטים</h2>
          <Link href="/adsignal/offers">לכל ההצעות ←</Link>
        </div>
        {offers.length ? (
          <div className="as-card as-rows">
            {offers.slice(0, 6).map((o) => (
              <div key={o.offer_id} className="as-row">
                <div className="grow">
                  <div className="nm">{o.normalized_text}</div>
                  <div className="sm">{o.kind}</div>
                </div>
                <span className="as-num">{o.advertisers} מפרסמים</span>
                {o.advertisers7d > 0 && <span className="as-num up">+{o.advertisers7d} השבוע</span>}
              </div>
            ))}
          </div>
        ) : (
          <Empty>הצעות שיווקיות יחולצו אוטומטית מטקסטי מודעות ברגע שיש מודעות במסד.</Empty>
        )}
      </section>
    </>
  );
}

function Metric({ label, value, cls, prov }: { label: string; value: string; cls: string; prov: 'REAL' | 'DERIVED' }) {
  return (
    <div style={{ background: 'var(--as-surface2)', borderRadius: 10, padding: '8px 11px' }}>
      <div style={{ fontSize: 11, color: 'var(--as-muted)', display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span>{label}</span>
        <Prov kind={prov} />
      </div>
      <div className={cls} style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
