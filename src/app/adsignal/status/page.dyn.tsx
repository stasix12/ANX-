import { SyncButton } from '@/components/adsignal/buttons';
import { Empty, Prov } from '@/components/adsignal/ui';
import { CONNECTORS } from '@/lib/adsignal/sync';
import { dbConfigured, getConnectorStates, getCounts } from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const metadata = { title: 'חיבורים ונתונים' };

/**
 * The honesty screen: which connector is configured, what each source truly
 * provides for which market, when it last ran, and what broke.
 */
export default async function StatusPage() {
  const configured = dbConfigured();
  const [states, counts] = await Promise.all([getConnectorStates(), getCounts()]);
  const stateBySource = new Map(states.map((s) => [s.source, s]));

  return (
    <>
      <h1 className="as-h1">חיבורים ונתונים</h1>
      <p className="as-sub">מה מחובר, מה כל מקור באמת מספק — ומה לא. בלי הפתעות.</p>

      <div className="as-card" style={{ marginBottom: 14 }}>
        <div className="as-adline" style={{ marginBottom: 8 }}>
          <b>Supabase (מסד נתונים)</b>
          <span className={`as-badge ${configured ? 'real' : 'import'}`}>{configured ? 'CONNECTED' : 'NOT CONFIGURED'}</span>
        </div>
        {configured ? (
          <div className="sm" style={{ fontSize: 13, color: 'var(--as-muted)' }}>
            {counts.ads.toLocaleString()} מודעות · {counts.advertisers.toLocaleString()} מפרסמים ·{' '}
            {counts.offers.toLocaleString()} הצעות · {counts.trendPoints.toLocaleString()} נקודות טרנד
          </div>
        ) : (
          <Empty>
            הגדר <code>NEXT_PUBLIC_SUPABASE_URL</code> ו־<code>SUPABASE_SERVICE_ROLE_KEY</code>,
            והרץ את <code>supabase/adsignal-schema.sql</code> ב־SQL Editor.
          </Empty>
        )}
      </div>

      {CONNECTORS.map((c) => {
        const state = stateBySource.get(c.source);
        const ok = c.isConfigured();
        return (
          <div key={c.source} className="as-card" style={{ marginBottom: 12 }}>
            <div className="as-adline" style={{ marginBottom: 8 }}>
              <b>{c.name}</b>
              <span className={`as-badge ${ok ? 'real' : 'import'}`}>{ok ? 'CONFIGURED' : 'MISSING KEY'}</span>
            </div>
            {!ok && (
              <Empty>
                כדי להפעיל: הוסף <code>{c.requiredEnv.join('</code> + <code>')}</code> ל־Environment Variables.
              </Empty>
            )}
            <dl className="as-kv" style={{ marginTop: 8, fontSize: 12.5 }}>
              <dt>מה זמין <Prov kind="REAL" /></dt><dd>{c.coverage.provides}</dd>
              <dt>מה לא זמין</dt><dd>{c.coverage.limits}</dd>
              {state?.last_ok_at && (
                <>
                  <dt>ריצה מוצלחת אחרונה</dt>
                  <dd className="as-num">{new Date(state.last_ok_at).toLocaleString('he-IL')}</dd>
                </>
              )}
              {state?.stats && Object.keys(state.stats).length > 0 && (
                <>
                  <dt>סטטיסטיקות</dt>
                  <dd className="as-num" style={{ direction: 'ltr', textAlign: 'end' }}>
                    {Object.entries(state.stats).map(([k, v]) => `${k}=${v}`).join(' · ')}
                  </dd>
                </>
              )}
              {state?.last_error && (
                <>
                  <dt style={{ color: 'var(--as-red)' }}>שגיאה אחרונה</dt>
                  <dd style={{ color: 'var(--as-red)', direction: 'ltr', textAlign: 'end', overflowWrap: 'anywhere' }}>{state.last_error}</dd>
                </>
              )}
            </dl>
          </div>
        );
      })}

      <div className="as-card" style={{ marginBottom: 12 }}>
        <div className="as-adline" style={{ marginBottom: 8 }}>
          <b>Claude AI (ניתוח מודעות)</b>
          <span className={`as-badge ${process.env.ANTHROPIC_API_KEY ? 'real' : 'import'}`}>
            {process.env.ANTHROPIC_API_KEY ? 'CONFIGURED' : 'MISSING KEY'}
          </span>
        </div>
        <div className="sm" style={{ fontSize: 12.5, color: 'var(--as-muted)' }}>
          מפעיל את ״Analyze with AI״. דורש <code style={{ direction: 'ltr' }}>ANTHROPIC_API_KEY</code>.
          כל פלט מסומן <Prov kind="AI_ESTIMATE" /> ולעולם לא מוצג כנתון אמיתי.
        </div>
      </div>

      {configured && (
        <div className="as-card">
          <b style={{ display: 'block', marginBottom: 10 }}>סנכרון</b>
          <SyncButton />
          <div className="sm" style={{ fontSize: 12, color: 'var(--as-muted)', marginTop: 8 }}>
            רץ אוטומטית פעם ביום (Vercel Cron, ‎03:00 UTC). הרצה ידנית מפעילה את כל הקונקטורים
            המוגדרים ואז את חישוב הציונים, המדדים וההתראות.
          </div>
        </div>
      )}
    </>
  );
}
