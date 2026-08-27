import Link from 'next/link';
import { Empty, Prov, StatusPill, fmtPct, pctClass } from '@/components/adsignal/ui';
import { dbConfigured, getNicheMetrics, getNiches } from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: '💎 Opportunity Finder' };

export default async function OpportunitiesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  if (!dbConfigured()) {
    return <Empty title="Supabase אינו מוגדר">ראה את שלבי ההתקנה ב<Link href="/adsignal" style={{ color: 'var(--as-hot)' }}>דשבורד</Link>.</Empty>;
  }
  const country = typeof sp.country === 'string' && sp.country ? sp.country : 'IL';
  const [metrics, niches] = await Promise.all([getNicheMetrics(country), getNiches()]);
  const name = (key: string) => niches.find((n) => n.key === key)?.name_he ?? key;
  const ranked = metrics.filter((m) => m.opportunity != null);

  return (
    <>
      <h1 className="as-h1">💎 AI Opportunity Finder</h1>
      <p className="as-sub">תחומים שבהם הביקוש עולה מהר יותר מהתחרות — מדורגים לפי Opportunity Score.</p>

      <div className="as-filters">
        {[
          ['IL', '🇮🇱 ישראל'],
          ['NL', '🇳🇱 הולנד'],
          ['DE', '🇩🇪 גרמניה'],
        ].map(([code, label]) => (
          <Link key={code} href={`/adsignal/opportunities?country=${code}`} className={`as-chip${country === code ? ' on' : ''}`}>
            {label}
          </Link>
        ))}
      </div>

      {ranked.length === 0 ? (
        <Empty title={`אין עדיין הזדמנויות מחושבות עבור ${country}`}>
          ה־Opportunity Score מחושב בריצת העיבוד היומית מתוך נתוני ביקוש ופעילות אמיתיים.
          הרץ סנכרון במסך <Link href="/adsignal/status" style={{ color: 'var(--as-hot)' }}>חיבורים</Link>.
          אין כאן ניחושים — כשאין דאטה, אין ציון.
        </Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ranked.map((m) => (
            <div key={m.niche_key} className="as-card">
              <div className="as-adline" style={{ marginBottom: 8 }}>
                <div className="nm" style={{ fontWeight: 700, fontSize: 15 }}>{name(m.niche_key)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusPill status={m.signal_status} />
                  <span className="as-num hotc" style={{ fontSize: 18 }}>
                    {Math.round(m.opportunity!)}<span style={{ fontSize: 11, color: 'var(--as-muted)' }}>/100</span>
                  </span>
                </div>
              </div>
              <div className="as-kv" style={{ fontSize: 13 }}>
                <dt>Demand</dt><dd className={pctClass(m.demand_trend)}>{fmtPct(m.demand_trend)} <Prov kind="REAL" /></dd>
                <dt>Ad Activity</dt><dd className={pctClass(m.ad_activity)}>{fmtPct(m.ad_activity)} <Prov kind="DERIVED" /></dd>
                <dt>Competition</dt><dd>{m.competition != null ? competitionLabel(m.competition) : 'לא ידוע'} <Prov kind="DERIVED" /></dd>
                <dt>New Advertisers</dt><dd>{m.new_advertisers_7d != null ? `+${m.new_advertisers_7d} השבוע` : 'לא זמין'}</dd>
                <dt>Confidence</dt><dd className="as-num">{m.confidence?.toFixed(2) ?? '—'}</dd>
              </div>
              <div className="sm" style={{ marginTop: 8, fontSize: 12.5, color: 'var(--as-muted)' }}>
                {explain(m.demand_trend, m.ad_activity, m.competition)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function competitionLabel(v: number): string {
  if (v < 34) return 'Low';
  if (v < 67) return 'Medium';
  return 'High';
}

/** Component-based explanation — derived from the actual numbers, no LLM guessing. */
function explain(demand: number | null, activity: number | null, competition: number | null): string {
  const parts: string[] = [];
  if (demand !== null && activity !== null && demand > activity) {
    parts.push('הביקוש צומח מהר יותר מפעילות המפרסמים');
  } else if (activity !== null && activity > 25) {
    parts.push('מפרסמים נכנסים לתחום בקצב גבוה');
  }
  if (demand !== null && demand > 25) parts.push('עניין החיפוש בעלייה חדה');
  if (competition !== null && competition < 34) parts.push('התחרות עדיין נמוכה יחסית');
  if (competition !== null && competition >= 67) parts.push('שים לב: רוויה גבוהה');
  return parts.length ? parts.join(' · ') : 'אין מספיק סיגנלים למסקנה חד־משמעית.';
}
