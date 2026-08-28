import Link from 'next/link';
import { ImportForm } from '@/components/adsignal/ImportForm';
import { Empty, Prov } from '@/components/adsignal/ui';
import { dbConfigured, getNiches } from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'ייבוא מודעה' };

/**
 * Manual import — the honest answer to the Israeli coverage gap: Meta's API
 * does not expose commercial ads that run only in Israel, but the public Ad
 * Library site shows them. Paste one here and the real engine takes over:
 * offer extraction, variant hashing, Hot Score, clusters, competitor watch.
 */
export default async function ImportPage() {
  if (!dbConfigured()) {
    return <Empty title="Supabase אינו מוגדר">ראה את שלבי ההתקנה ב<Link href="/adsignal" style={{ color: 'var(--as-hot)' }}>דשבורד</Link>.</Empty>;
  }
  const niches = await getNiches();

  return (
    <>
      <h1 className="as-h1">＋ ייבוא מודעה</h1>
      <p className="as-sub">
        מודעות מסחריות ישראליות לא זמינות ב־API של Meta — אבל הן גלויות ב־Ad Library.
        מצאת מודעה של מתחרה? הדבק אותה כאן והמנוע ינקד, יחלץ Offers ויזהה Clusters.
      </p>

      <Empty title="איך מוצאים מודעות של מתחרים (2 דקות)">
        1. פתח את <span dir="ltr">facebook.com/ads/library</span> · 2. בחר Israel · 3. חפש
        תחום (למשל ״ניקוי ספות״) או שם עסק · 4. העתק את טקסט המודעה לכאן.
        כל מודעה מיובאת מסומנת <Prov kind="USER_IMPORTED" /> — שקיפות מלאה על מקור הנתון.
      </Empty>

      <div style={{ marginTop: 14 }}>
        <ImportForm niches={niches} />
      </div>
    </>
  );
}
