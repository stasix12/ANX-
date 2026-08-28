import Link from 'next/link';
import { addCompetitorAction, removeCompetitorAction } from '@/lib/adsignal/actions';
import { Empty } from '@/components/adsignal/ui';
import { dbConfigured, getCompetitors, searchAdvertisers } from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: '🕵️ Competitor Watch' };

const EVENT_LABEL: Record<string, string> = {
  new_ad: '🟢 מודעה חדשה',
  ad_stopped: '⏹ מודעה הופסקה',
  new_offer: '🎯 Offer חדש',
};

export default async function CompetitorsPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await props.searchParams;
  if (!dbConfigured()) {
    return <Empty title="Supabase אינו מוגדר">ראה את שלבי ההתקנה ב<Link href="/adsignal" style={{ color: 'var(--as-hot)' }}>דשבורד</Link>.</Empty>;
  }
  const q = typeof sp.q === 'string' ? sp.q : '';
  const [watches, results] = await Promise.all([getCompetitors(), searchAdvertisers(q)]);

  return (
    <>
      <h1 className="as-h1">🕵️ Competitor Watch</h1>
      <p className="as-sub">מעקב אחרי מפרסמים: מודעות חדשות, מודעות שהופסקו ושינויים — עם Timeline לכל עסק.</p>

      <form method="get" className="as-card" style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input name="q" defaultValue={q} className="as-input" placeholder="חפש מפרסם שנקלט במסד…" />
        <button className="as-btn" type="submit">חפש</button>
      </form>

      {q && (
        <div className="as-card as-rows" style={{ marginBottom: 14 }}>
          {results.length ? results.map((advertiser) => (
            <div key={advertiser.id} className="as-row">
              <div className="grow">
                <div className="nm">{advertiser.name}</div>
                <div className="sm">{advertiser.platform.toUpperCase()}</div>
              </div>
              <form action={addCompetitorAction.bind(null, advertiser.id, advertiser.name)}>
                <button className="as-btn" type="submit">+ עקוב</button>
              </form>
            </div>
          )) : (
            <Empty>
              לא נמצא מפרסם בשם ״{q}״ במסד. הוסף אותו דרך{' '}
              <Link href="/adsignal/import" style={{ color: 'var(--as-hot)' }}>＋ ייבוא מודעה</Link> —
              סמן שם ״הוסף ל־Competitor Watch״ והוא יופיע כאן עם Timeline.
            </Empty>
          )}
        </div>
      )}

      {watches.length === 0 ? (
        <Empty title="אין עדיין מפרסמים במעקב">
          חפש מפרסם למעלה והוסף אותו. מרגע ההוספה — כל סנכרון יומי יתעד מודעות חדשות ומודעות
          שהופסקו ב־Timeline.
        </Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {watches.map((w) => (
            <div key={w.id} className="as-card">
              <div className="as-adline" style={{ marginBottom: 6 }}>
                <div>
                  <div className="nm" style={{ fontWeight: 700 }}>{w.advertiser.name}</div>
                  <div className="sm" style={{ color: 'var(--as-muted)', fontSize: 12 }}>
                    {w.advertiser.platform.toUpperCase()} · {w.activeAds} פעילות מתוך {w.totalAds} שנקלטו
                  </div>
                </div>
                <form action={removeCompetitorAction.bind(null, w.id)}>
                  <button className="as-btn ghost" type="submit">הסר</button>
                </form>
              </div>
              {w.advertiser.page_url && (
                <a href={w.advertiser.page_url} target="_blank" rel="noreferrer" style={{ color: 'var(--as-hot)', fontSize: 12.5 }}>
                  עמוד המפרסם ↗
                </a>
              )}
              <div style={{ marginTop: 10 }}>
                {w.events.length ? (
                  <div className="as-timeline">
                    {w.events.map((e, i) => (
                      <div key={i} className="ev">
                        <b>{EVENT_LABEL[e.kind] ?? e.kind}</b>
                        <span style={{ color: 'var(--as-muted)' }}> · {new Date(e.detected_at).toLocaleDateString('he-IL')}</span>
                        {typeof e.payload.ad_id === 'string' && (
                          <> · <Link href={`/adsignal/ads/${e.payload.ad_id}`} style={{ color: 'var(--as-hot)' }}>למודעה</Link></>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="sm" style={{ fontSize: 12.5, color: 'var(--as-muted)' }}>
                    אין עדיין אירועים — ייאספו בסנכרונים הבאים.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
