import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AnalyzeButton } from '@/components/adsignal/buttons';
import { Empty, Prov, ScoreBar, daysRunning } from '@/components/adsignal/ui';
import { getAdDetail } from '@/lib/adsignal/queries';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'פרטי מודעה' };

export default async function AdDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const detail = await getAdDetail(id);
  if (!detail) notFound();
  const { ad, snapshots, offers, analysis, variantCount } = detail;
  const days = daysRunning(ad.started_at, ad.ended_at);
  const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('he-IL') : '—');

  return (
    <>
      <p className="as-sub" style={{ marginBottom: 8 }}>
        <Link href="/adsignal/ads" style={{ color: 'var(--as-hot)' }}>→ חזרה למודעות</Link>
      </p>
      <h1 className="as-h1">{ad.advertiser?.name ?? 'מפרסם לא ידוע'}</h1>
      <p className="as-sub">
        {ad.platform.toUpperCase()} · {ad.country ?? '—'} · {ad.is_active ? 'פעילה' : 'הופסקה'}
      </p>

      <div className="as-card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {ad.body ?? ad.title ?? 'למודעה זו לא נקלט טקסט קריאייטיב.'}
        </div>
      </div>

      <div className="as-card" style={{ marginBottom: 12 }}>
        <dl className="as-kv">
          <dt>First Seen</dt><dd>{fmtDate(ad.first_seen_at)} <Prov kind="DERIVED" /></dd>
          <dt>Start Date</dt><dd>{fmtDate(ad.started_at)} <Prov kind="REAL" /></dd>
          <dt>Last Seen</dt><dd>{fmtDate(ad.last_seen_at)} <Prov kind="DERIVED" /></dd>
          <dt>Days Running</dt><dd>{days ?? '—'} <Prov kind="DERIVED" /></dd>
          <dt>Variants</dt><dd>{variantCount} <Prov kind="DERIVED" /></dd>
          <dt>Offer</dt>
          <dd>
            {offers.length ? offers.map((o) => (
              <span key={o.normalized_text} className="as-offerchip" style={{ marginInlineEnd: 6 }}>{o.normalized_text}</span>
            )) : '—'}{' '}
            <Prov kind="DERIVED" label="RULE" />
          </dd>
          <dt>Landing</dt>
          <dd style={{ direction: 'ltr', textAlign: 'end', overflowWrap: 'anywhere' }}>{ad.landing_url ?? '—'}</dd>
          {ad.snapshot_url && (
            <>
              <dt>מקור</dt>
              <dd><a href={ad.snapshot_url} target="_blank" rel="noreferrer" style={{ color: 'var(--as-hot)' }}>צפייה ב־Ad Library ↗</a></dd>
            </>
          )}
        </dl>
      </div>

      {ad.hot_score !== null && (
        <div className="as-card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <b>Hot Score</b> <Prov kind="DERIVED" />
          </div>
          <ScoreBar score={ad.hot_score} confidence={ad.score_confidence} />
          {ad.score_components && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(ad.score_components).map(([k, v]) => (
                <span key={k} className="as-offerchip" style={{ direction: 'ltr' }}>{k}: {v}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="as-card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <b>היסטוריית Snapshots</b> <Prov kind="REAL" />
        </div>
        {snapshots.length ? (
          <div className="as-rows">
            {snapshots.slice(-14).map((s) => (
              <div key={s.captured_at} className="as-row" style={{ padding: '7px 2px' }}>
                <span className="as-num">{new Date(s.captured_at).toLocaleDateString('he-IL')}</span>
                <span className="grow sm">{s.is_active ? 'פעילה' : 'לא פעילה'}</span>
                <span className="as-num">
                  {s.reach_lower != null
                    ? `reach ${Number(s.reach_lower).toLocaleString()}`
                    : s.impressions_lower != null
                      ? `imp ${Number(s.impressions_lower).toLocaleString()}–${Number(s.impressions_upper).toLocaleString()}`
                      : 'ללא נתוני חשיפה'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty>אין עדיין snapshots — נשמרים אוטומטית בכל סנכרון יומי.</Empty>
        )}
        <div className="sm" style={{ marginTop: 8, fontSize: 11.5, color: 'var(--as-muted)' }}>
          Engagement (לייקים/תגובות/שיתופים) — לא זמין: אף API רשמי לא חושף זאת למודעות של מפרסמים אחרים.
        </div>
      </div>

      <div className="as-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <b>AI Breakdown</b> <Prov kind="AI_ESTIMATE" />
        </div>
        {analysis ? (
          <>
            <dl className="as-kv" style={{ marginBottom: 12 }}>
              <dt>Hook</dt><dd>{analysis.hook}</dd>
              <dt>Offer</dt><dd>{analysis.offer_text}</dd>
              <dt>Pain Point</dt><dd>{analysis.pain_point}</dd>
              <dt>Audience</dt><dd>{analysis.target_audience}</dd>
              <dt>CTA</dt><dd>{analysis.cta}</dd>
              <dt>Creative Strategy</dt><dd>{analysis.creative_notes}</dd>
              <dt>Why it may work</dt><dd>{analysis.why_it_works}</dd>
              <dt>How to adapt</dt><dd>{analysis.adaptation}</dd>
              {analysis.performance_probability != null && (
                <>
                  <dt>High-Perf Probability</dt>
                  <dd className="as-num">
                    {analysis.performance_probability.toFixed(2)} (conf {analysis.confidence?.toFixed(2) ?? '—'})
                  </dd>
                </>
              )}
            </dl>
            <div className="sm" style={{ fontSize: 11.5, color: 'var(--as-muted)', marginBottom: 10 }}>
              הערכת מודל בלבד, מבוססת על הקריאייטיב והמטא־דאטה שנאספו — לא על נתוני ביצועים של המפרסם.
            </div>
          </>
        ) : (
          <p className="sm" style={{ color: 'var(--as-muted)', fontSize: 13, margin: '0 0 12px' }}>
            עדיין לא נותחה. הניתוח מבוסס אך ורק על הטקסט והמטא־דאטה שנאספו, ומסומן כהערכת AI.
          </p>
        )}
        <AnalyzeButton adId={ad.id} hasAnalysis={Boolean(analysis)} />
      </div>
    </>
  );
}
