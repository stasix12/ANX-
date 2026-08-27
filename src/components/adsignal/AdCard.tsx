import Link from 'next/link';
import type { AdWithScore } from '@/lib/adsignal/queries';
import { Prov, ScoreBar, daysRunning } from './ui';

const PLATFORM_LABEL: Record<string, string> = { meta: 'META', tiktok: 'TIKTOK', google: 'GOOGLE' };

export function AdCard({ ad, alt }: { ad: AdWithScore; alt?: boolean }) {
  const days = daysRunning(ad.started_at, ad.ended_at);
  const text = ad.body ?? ad.title;
  return (
    <Link href={`/adsignal/ads/${ad.id}`} className="as-adcard">
      <div className={`creative${alt ? ' alt' : ''}`}>
        {text ? (text.length > 160 ? `${text.slice(0, 160)}…` : text) : 'ללא טקסט קריאייטיב'}
      </div>
      <div className="bodyrow">
        <div className="as-adline">
          <span className="adv">{ad.advertiser?.name ?? 'מפרסם לא ידוע'}</span>
          <span className="as-meta">
            {PLATFORM_LABEL[ad.platform] ?? ad.platform.toUpperCase()} · {ad.country ?? '—'}
            {days !== null && ` · ${days}d`}
          </span>
        </div>
        <div className="as-tags">
          {ad.started_at && <Prov kind="REAL" label="REAL · dates" />}
          {ad.source_kind === 'user_imported' && <Prov kind="USER_IMPORTED" />}
          {!ad.is_active && <span className="as-offerchip">לא פעילה</span>}
        </div>
        {ad.hot_score !== null ? (
          <ScoreBar score={ad.hot_score} confidence={ad.score_confidence} />
        ) : (
          <span className="sm" style={{ fontSize: 11.5, color: 'var(--as-muted)' }}>
            Hot Score יחושב בריצת העיבוד הבאה
          </span>
        )}
      </div>
    </Link>
  );
}
