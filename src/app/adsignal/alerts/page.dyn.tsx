import Link from 'next/link';
import { createAlertAction, deleteAlertAction, toggleAlertAction } from '@/lib/adsignal/actions';
import { Empty } from '@/components/adsignal/ui';
import { dbConfigured, getAlerts, getNiches } from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: '🔔 Alerts' };

export default async function AlertsPage() {
  if (!dbConfigured()) {
    return <Empty title="Supabase אינו מוגדר">ראה את שלבי ההתקנה ב<Link href="/adsignal" style={{ color: 'var(--as-hot)' }}>דשבורד</Link>.</Empty>;
  }
  const [{ alerts, events }, niches] = await Promise.all([getAlerts(), getNiches()]);
  const nicheName = (key: string | undefined) => niches.find((n) => n.key === key)?.name_he ?? key ?? 'כל תחום';

  return (
    <>
      <h1 className="as-h1">🔔 Alerts</h1>
      <p className="as-sub">חוקים שנבדקים בכל ריצת עיבוד יומית. אירוע נוצר פעם אחת ביום לכל התאמה.</p>

      <form action={createAlertAction} className="as-drawer">
        <div className="as-field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="a-name">שם ההתראה</label>
          <input id="a-name" name="name" required className="as-input" placeholder='למשל: "ניקוי ספות בישראל מעל 80"' />
        </div>
        <div className="as-field">
          <label htmlFor="a-type">סוג</label>
          <select id="a-type" name="type" className="as-select" defaultValue="niche_opportunity">
            <option value="niche_opportunity">נישה חוצה סף Opportunity</option>
            <option value="hot_ad">מודעה חוצה סף Hot Score</option>
            <option value="offer_adoption">Offer מתפשט בין מפרסמים</option>
          </select>
        </div>
        <div className="as-field">
          <label htmlFor="a-niche">תחום (אופציונלי)</label>
          <select id="a-niche" name="niche_key" className="as-select" defaultValue="">
            <option value="">כל תחום</option>
            {niches.map((n) => (
              <option key={n.key} value={n.key}>{n.name_he}</option>
            ))}
          </select>
        </div>
        <div className="as-field">
          <label htmlFor="a-country">מדינה</label>
          <select id="a-country" name="country" className="as-select" defaultValue="IL">
            <option value="IL">🇮🇱 ישראל</option>
            <option value="NL">🇳🇱 הולנד</option>
            <option value="DE">🇩🇪 גרמניה</option>
          </select>
        </div>
        <div className="as-field">
          <label htmlFor="a-threshold">סף (ציון / מספר מפרסמים)</label>
          <input id="a-threshold" name="threshold" type="number" defaultValue={80} className="as-input" />
        </div>
        <div className="as-field" style={{ justifyContent: 'flex-end' }}>
          <button className="as-btn solid" type="submit">צור התראה</button>
        </div>
      </form>

      {alerts.length === 0 ? (
        <Empty title="אין עדיין התראות">
          דוגמאות: ״מודעות ניקוי ספות בישראל עם Hot Score מעל 80״, ״התראה כש־5 מפרסמים משתמשים
          באותו Offer בתוך שבוע״, ״נישה שחוצה Opportunity Score‏ 80 בישראל״.
        </Empty>
      ) : (
        <div className="as-card as-rows">
          {alerts.map((a) => (
            <div key={a.id} className="as-row">
              <div className="grow">
                <div className="nm">{a.name}</div>
                <div className="sm">
                  {a.rule.type === 'niche_opportunity' && `Opportunity ≥ ${a.rule.min_opportunity} · ${nicheName(a.rule.niche_key)} · ${a.rule.country}`}
                  {a.rule.type === 'hot_ad' && `Hot Score ≥ ${a.rule.min_score}`}
                  {a.rule.type === 'offer_adoption' && `Offer אצל ≥ ${a.rule.min_advertisers} מפרסמים ב־${a.rule.window_days} ימים`}
                  {!a.is_active && ' · מושהית'}
                </div>
              </div>
              <form action={toggleAlertAction.bind(null, a.id, !a.is_active)}>
                <button className="as-btn ghost" type="submit">{a.is_active ? 'השהה' : 'הפעל'}</button>
              </form>
              <form action={deleteAlertAction.bind(null, a.id)}>
                <button className="as-btn ghost" type="submit">מחק</button>
              </form>
            </div>
          ))}
        </div>
      )}

      <section className="as-section">
        <div className="as-section-head"><h2>אירועים אחרונים</h2></div>
        {events.length ? (
          <div className="as-card as-rows">
            {events.map((e) => {
              const alert = alerts.find((a) => a.id === e.alert_id);
              return (
                <div key={e.id} className="as-row">
                  <div className="grow">
                    <div className="nm">{alert?.name ?? 'התראה'}</div>
                    <div className="sm">{new Date(e.triggered_at).toLocaleString('he-IL')}</div>
                  </div>
                  {typeof e.payload.ad_id === 'string' && (
                    <Link href={`/adsignal/ads/${e.payload.ad_id}`} style={{ color: 'var(--as-hot)', fontSize: 13 }}>למודעה ←</Link>
                  )}
                  {typeof e.payload.hot_score === 'number' && <span className="as-num hotc">{Math.round(e.payload.hot_score as number)}</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>עדיין לא נורו התראות. הן נבדקות בסוף כל ריצת סנכרון/עיבוד.</Empty>
        )}
      </section>
    </>
  );
}
