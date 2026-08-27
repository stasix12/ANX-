import Link from 'next/link';
import { AdCard } from '@/components/adsignal/AdCard';
import { Empty } from '@/components/adsignal/ui';
import { dbConfigured, getExplorerAds, getNiches, type ExplorerFilters } from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ad Explorer' };

const str = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined);

export default async function AdsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  if (!dbConfigured()) {
    return <Empty title="Supabase אינו מוגדר">ראה את שלבי ההתקנה ב<Link href="/adsignal" style={{ color: 'var(--as-hot)' }}>דשבורד</Link>.</Empty>;
  }

  // Israel is the default market; "all" opts out explicitly.
  const country = str(sp.country) ?? 'IL';
  const filters: ExplorerFilters = {
    country: country === 'all' ? undefined : country,
    platform: str(sp.platform),
    niche: str(sp.niche),
    q: str(sp.q),
    active: (str(sp.active) as ExplorerFilters['active']) ?? 'all',
    minScore: sp.minScore ? Number(sp.minScore) : undefined,
    minDays: sp.minDays ? Number(sp.minDays) : undefined,
  };

  const [ads, niches] = await Promise.all([getExplorerAds(filters), getNiches()]);

  return (
    <>
      <h1 className="as-h1">Ad Explorer</h1>
      <p className="as-sub">חיפוש וסינון בכל המודעות שנקלטו — נתונים אמיתיים בלבד.</p>

      <form className="as-drawer" method="get">
        <div className="as-field">
          <label htmlFor="f-country">מדינה</label>
          <select id="f-country" name="country" defaultValue={country} className="as-select">
            <option value="IL">🇮🇱 ישראל</option>
            <option value="all">כל המדינות</option>
            <option value="NL">🇳🇱 הולנד (EU)</option>
            <option value="DE">🇩🇪 גרמניה (EU)</option>
            <option value="FR">🇫🇷 צרפת (EU)</option>
            <option value="ES">🇪🇸 ספרד (EU)</option>
          </select>
        </div>
        <div className="as-field">
          <label htmlFor="f-platform">פלטפורמה</label>
          <select id="f-platform" name="platform" defaultValue={filters.platform ?? ''} className="as-select">
            <option value="">הכול</option>
            <option value="meta">Meta</option>
            <option value="tiktok">TikTok</option>
          </select>
        </div>
        <div className="as-field">
          <label htmlFor="f-niche">תחום</label>
          <select id="f-niche" name="niche" defaultValue={filters.niche ?? ''} className="as-select">
            <option value="">הכול</option>
            {niches.map((n) => (
              <option key={n.key} value={n.key}>{n.name_he}</option>
            ))}
          </select>
        </div>
        <div className="as-field">
          <label htmlFor="f-active">סטטוס</label>
          <select id="f-active" name="active" defaultValue={filters.active} className="as-select">
            <option value="all">הכול</option>
            <option value="active">פעילות</option>
            <option value="inactive">הופסקו</option>
          </select>
        </div>
        <div className="as-field">
          <label htmlFor="f-q">מילת מפתח בקריאייטיב</label>
          <input id="f-q" name="q" defaultValue={filters.q ?? ''} className="as-input" placeholder="למשל: ניקוי ספות" />
        </div>
        <div className="as-field">
          <label htmlFor="f-minScore">Hot Score מינימלי</label>
          <input id="f-minScore" name="minScore" type="number" min={0} max={100} defaultValue={filters.minScore ?? ''} className="as-input" />
        </div>
        <div className="as-field">
          <label htmlFor="f-minDays">ימי ריצה מינימום</label>
          <input id="f-minDays" name="minDays" type="number" min={0} defaultValue={filters.minDays ?? ''} className="as-input" />
        </div>
        <div className="as-field" style={{ justifyContent: 'flex-end' }}>
          <button className="as-btn solid" type="submit">סנן</button>
        </div>
      </form>

      {ads.length ? (
        <div className="as-grid cards">
          {ads.map((ad, i) => (
            <AdCard key={ad.id} ad={ad} alt={i % 2 === 1} />
          ))}
        </div>
      ) : (
        <Empty title="אין מודעות שתואמות לסינון">
          {filters.country === 'IL' ? (
            <>
              עבור ישראל: ה־API הרשמי של Meta מחזיר רק מודעות פוליטיות/נושאים חברתיים — מודעות
              מסחריות ישראליות אינן זמינות ב־API (זו מגבלה של Meta, לא של המערכת). נסה לסנן על
              מדינת EU, או עקוב אחרי מפרסמים ישראלים דרך{' '}
              <Link href="/adsignal/competitors" style={{ color: 'var(--as-hot)' }}>Competitor Watch</Link>.
            </>
          ) : (
            <>ודא שהסנכרון רץ (מסך <Link href="/adsignal/status" style={{ color: 'var(--as-hot)' }}>חיבורים</Link>) או הרחב את הסינון.</>
          )}
        </Empty>
      )}
    </>
  );
}
