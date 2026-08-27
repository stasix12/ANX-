import Link from 'next/link';
import { Empty, Prov } from '@/components/adsignal/ui';
import { dbConfigured, getTrendingOffers } from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Creative Clusters' };

/**
 * Concept clusters, phase 1: ads grouped by a shared, rule-extracted offer.
 * "15 advertisers using this concept" is real and derived from real ad text.
 * Embedding-based visual/semantic clustering is the P3 upgrade and is labeled
 * as not-yet-built rather than faked.
 */
export default async function ClustersPage() {
  if (!dbConfigured()) {
    return <Empty title="Supabase אינו מוגדר">ראה את שלבי ההתקנה ב<Link href="/adsignal" style={{ color: 'var(--as-hot)' }}>דשבורד</Link>.</Empty>;
  }
  const offers = await getTrendingOffers(50);
  const clusters = offers.filter((o) => o.advertisers >= 2);

  return (
    <>
      <h1 className="as-h1">Creative Clusters</h1>
      <p className="as-sub">
        קונספטים שמתפשטים בין מפרסמים — כרגע לפי Offer משותף <Prov kind="DERIVED" />.
      </p>

      {clusters.length === 0 ? (
        <Empty title="עדיין אין קונספטים מזוהים">
          Cluster נוצר כששני מפרסמים או יותר משתמשים באותה הצעה (למשל ״ניקוי ספה ב־₪299״).
          ברגע שנקלטות מספיק מודעות — הקונספטים יופיעו כאן.
        </Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {clusters.map((c) => (
            <div key={c.offer_id} className="as-card">
              <div className="as-adline">
                <div className="nm" style={{ fontWeight: 700 }}>{c.normalized_text}</div>
                {c.advertisers7d >= 2 && <span className="as-badge der">ACCELERATING</span>}
              </div>
              <div className="sm" style={{ color: 'var(--as-muted)', fontSize: 13, margin: '6px 0 10px' }}>
                🔥 {c.advertisers} advertisers using this concept
                {c.advertisers7d > 0 && <span style={{ color: 'var(--as-teal)' }}> · ↑ {c.advertisers7d} הצטרפו ב־7 ימים</span>}
                {' · '}{c.ads} מודעות
              </div>
              <Link href={`/adsignal/ads?q=${encodeURIComponent(clusterQuery(c.normalized_text))}`} style={{ color: 'var(--as-hot)', fontSize: 13 }}>
                צפה במודעות הקונספט ←
              </Link>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <Empty title="בשלב הבא (P3)">
          קיבוץ סמנטי מלא באמצעות Embeddings — זיהוי מודעות עם רעיון דומה גם בלי Offer זהה.
          עד אז מוצג רק מה שבאמת מחושב, לא סימולציה.
        </Empty>
      </div>
    </>
  );
}

/** Search the explorer for the price/number inside the offer, or its first words. */
function clusterQuery(text: string): string {
  const num = text.match(/\d{2,5}/);
  return num ? num[0] : text.split(' ').slice(0, 2).join(' ');
}
