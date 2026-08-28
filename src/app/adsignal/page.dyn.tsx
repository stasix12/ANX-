import Link from 'next/link';
import { AdCard } from '@/components/adsignal/AdCard';
import { Empty, StatusPill, fmtPct, pctClass } from '@/components/adsignal/ui';
import {
  dbConfigured,
  getCounts,
  getNicheMetrics,
  getNiches,
  getTopAds,
  getTrendingOffers,
} from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  if (!dbConfigured()) return <SetupNotice />;

  const [counts, niches, topAds, offers, nicheList] = await Promise.all([
    getCounts(),
    getNicheMetrics('IL'),
    getTopAds(null, 6),
    getTrendingOffers(5),
    getNiches(),
  ]);
  const nicheName = (key: string) => nicheList.find((n) => n.key === key)?.name_he ?? key;

  const trending = niches.filter((n) => n.signal_status === 'hot' || n.signal_status === 'growing');
  const fastest = [...niches].sort((a, b) => (b.growth ?? -999) - (a.growth ?? -999))[0];
  const bestOpp = niches[0];
  const emerging = niches.filter((n) => n.signal_status === 'emerging');
  const topOffer = offers[0];
  const hasData = counts.ads > 0 || counts.trendPoints > 0;

  return (
    <>
      <h1 className="as-h1">דשבורד</h1>
      <p className="as-sub">
        {counts.ads.toLocaleString()} מודעות · {counts.advertisers.toLocaleString()} מפרסמים ·{' '}
        {counts.trendPoints.toLocaleString()} נקודות טרנד במסד
      </p>

      {!hasData && (
        <Empty title="עדיין אין נתונים במסד">
          המערכת לא מציגה נתוני דמו. עבור אל <Link href="/adsignal/status" style={{ color: 'var(--as-hot)' }}>מסך החיבורים</Link>,
          ודא שהמפתחות מוגדרים והרץ סנכרון ראשון — ואז המסך הזה יתמלא בנתונים אמיתיים בלבד.
        </Empty>
      )}

      <div className="as-grid cols2" style={{ marginTop: 14 }}>
        <Link href="/adsignal/israel" className="as-kpi">
          <div className="lbl">🔥 Trending Now</div>
          <div className="val">{trending.length}</div>
          <div className="d">נישות בישראל בסטטוס Hot/Growing</div>
        </Link>
        <Link href={fastest ? `/adsignal/israel#${fastest.niche_key}` : '/adsignal/israel'} className="as-kpi">
          <div className="lbl">🚀 Fastest Growing</div>
          <div className="val">{fastest ? nicheName(fastest.niche_key) : '—'}</div>
          <div className="d">{fastest ? `${fmtPct(fastest.growth)} צמיחה` : 'אין נתונים עדיין'}</div>
        </Link>
        <Link href="/adsignal/opportunities" className="as-kpi">
          <div className="lbl">💎 Opportunity</div>
          <div className="val">
            {bestOpp?.opportunity != null ? `${Math.round(bestOpp.opportunity)}/100` : '—'}
          </div>
          <div className="d">{bestOpp ? nicheName(bestOpp.niche_key) : 'אין נתונים עדיין'}</div>
        </Link>
        <Link href="/adsignal/israel" className="as-kpi">
          <div className="lbl">📈 Emerging Niches</div>
          <div className="val">{emerging.length}</div>
          <div className="d">מתחילות להתעורר עכשיו</div>
        </Link>
        <Link href="/adsignal/offers" className="as-kpi">
          <div className="lbl">🎯 Winning Offer</div>
          <div className="val" style={{ fontSize: 16 }}>{topOffer?.normalized_text ?? '—'}</div>
          <div className="d">{topOffer ? `${topOffer.advertisers} מפרסמים` : 'אין נתונים עדיין'}</div>
        </Link>
        <Link href="/adsignal/competitors" className="as-kpi">
          <div className="lbl">🕵️ Competitor Watch</div>
          <div className="val">מעקב</div>
          <div className="d">הוסף מפרסמים למעקב</div>
        </Link>
      </div>

      {niches.length > 0 && (
        <section className="as-section">
          <div className="as-section-head">
            <h2>🇮🇱 מצב נישות בישראל</h2>
            <Link href="/adsignal/israel">לכל הנישות ←</Link>
          </div>
          <div className="as-card as-rows">
            {niches.slice(0, 5).map((n) => (
              <Link key={n.niche_key} href={`/adsignal/israel#${n.niche_key}`} className="as-row">
                <div className="grow">
                  <div className="nm">{nicheName(n.niche_key)}</div>
                  <div className="sm">ביקוש {fmtPct(n.demand_trend)} · פעילות מודעות {fmtPct(n.ad_activity)}</div>
                </div>
                <StatusPill status={n.signal_status} />
                <span className={pctClass(n.opportunity)} style={{ minWidth: 34, textAlign: 'left' }}>
                  {n.opportunity != null ? Math.round(n.opportunity) : '—'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="as-section">
        <div className="as-section-head">
          <h2>מודעות חמות</h2>
          <Link href="/adsignal/ads">לכל המודעות ←</Link>
        </div>
        {topAds.length ? (
          <div className="as-grid cards">
            {topAds.map((ad, i) => (
              <AdCard key={ad.id} ad={ad} alt={i % 2 === 1} />
            ))}
          </div>
        ) : (
          <Empty>
            אין עדיין מודעות עם ציון. שתי דרכים להתחיל:{' '}
            <Link href="/adsignal/import" style={{ color: 'var(--as-hot)' }}>＋ ייבא מודעה של מתחרה</Link>{' '}
            מ־Ad Library (עובד מיד, בלי מפתחות), או חבר מקורות נתונים במסך{' '}
            <Link href="/adsignal/status" style={{ color: 'var(--as-hot)' }}>החיבורים</Link>.
          </Empty>
        )}
      </section>
    </>
  );
}

function SetupNotice() {
  return (
    <>
      <h1 className="as-h1">AdSignal עוד לא מחובר</h1>
      <p className="as-sub">שלושה צעדים ותראה נתונים אמיתיים — בלי שום דאטה מזויף בדרך.</p>
      <div className="as-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
        <div>1. הרץ את <code style={{ direction: 'ltr' }}>supabase/adsignal-schema.sql</code> ב־SQL Editor של פרויקט ה־Supabase.</div>
        <div>2. הוסף ל־env:‏ <code style={{ direction: 'ltr' }}>SUPABASE_SERVICE_ROLE_KEY</code> (ליד ה־URL הקיים).</div>
        <div>3. הוסף מפתחות מקורות נתונים — הרשימה המלאה במסך <Link href="/adsignal/status" style={{ color: 'var(--as-hot)' }}>חיבורים</Link>.</div>
      </div>
    </>
  );
}
