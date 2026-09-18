'use client';

import type { CampaignProgress } from '@/lib/social/types';

/**
 * "37 / 80 publications completed" with a segmented bar underneath: green
 * for published, rose for failed, slate for skipped, and the remainder left
 * empty for what is still queued.
 */
export function CampaignProgressBar({ progress }: { progress: CampaignProgress }) {
  const { total, published, failed, skipped, scheduled, running, manual, done } = progress;
  if (!total) return <p className="text-sm text-mist-500">עוד לא נוצרו פרסומים לקמפיין הזה.</p>;
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-mist-100">
          {done} / {total} פרסומים הושלמו
        </p>
        <p className="text-xs text-mist-500">{Math.round((done / total) * 100)}%</p>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-ink-700" role="img" aria-label={`${done} מתוך ${total} הושלמו`}>
        {published > 0 && <span className="bg-emerald-500" style={{ width: pct(published) }} />}
        {failed > 0 && <span className="bg-rose-500" style={{ width: pct(failed) }} />}
        {skipped > 0 && <span className="bg-slate-400" style={{ width: pct(skipped) }} />}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
        <li className="text-emerald-700">✅ {published} פורסמו</li>
        {running > 0 && <li className="text-amber-700">⏳ {running} רצים</li>}
        {scheduled > 0 && <li className="text-sky-700">🕐 {scheduled} ממתינים</li>}
        {manual > 0 && <li className="text-violet-700">✋ {manual} ידניים</li>}
        {failed > 0 && <li className="text-rose-700">❌ {failed} נכשלו</li>}
        {skipped > 0 && <li className="text-slate-600">⏭️ {skipped} דולגו</li>}
      </ul>
    </div>
  );
}
