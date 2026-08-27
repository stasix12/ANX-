import Link from 'next/link';
import { Empty, Prov } from '@/components/adsignal/ui';
import { dbConfigured, getTrendingOffers } from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: '🎯 Trending Offers' };

const KIND_LABEL: Record<string, string> = {
  price_point: 'מחיר נקוב',
  discount: 'הנחה',
  free: 'חינם',
  urgency: 'דחיפות',
  bundle: 'חבילה',
  guarantee: 'אחריות',
  other: 'אחר',
};

export default async function OffersPage() {
  if (!dbConfigured()) {
    return <Empty title="Supabase אינו מוגדר">ראה את שלבי ההתקנה ב<Link href="/adsignal" style={{ color: 'var(--as-hot)' }}>דשבורד</Link>.</Empty>;
  }
  const offers = await getTrendingOffers(50);

  return (
    <>
      <h1 className="as-h1">🎯 Trending Offers</h1>
      <p className="as-sub">
        הצעות שיווקיות שחולצו אוטומטית מטקסטים אמיתיים של מודעות <Prov kind="DERIVED" label="RULE" /> —
        ממוינות לפי כמה מפרסמים שונים משתמשים בהן.
      </p>

      {offers.length === 0 ? (
        <Empty title="עדיין לא חולצו הצעות">
          החילוץ רץ אוטומטית על כל מודעה שנקלטת (דפוסים כמו ₪299, ‎20%‎ הנחה, הצעת מחיר חינם,
          שירות באותו היום). ברגע שיש מודעות במסד — הרשימה תתמלא.
        </Empty>
      ) : (
        <div className="as-card as-rows">
          {offers.map((o) => (
            <div key={o.offer_id} className="as-row">
              <div className="grow">
                <div className="nm">{o.normalized_text}</div>
                <div className="sm">{KIND_LABEL[o.kind] ?? o.kind} · {o.ads} מודעות</div>
              </div>
              {o.advertisers7d >= 3 && <span className="as-badge der">SPREADING</span>}
              <span className="as-num" style={{ minWidth: 90, textAlign: 'left' }}>{o.advertisers} מפרסמים</span>
              {o.advertisers7d > 0 && <span className="as-num up">+{o.advertisers7d} ב־7 ימים</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
