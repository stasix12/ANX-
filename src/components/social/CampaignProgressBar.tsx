'use client';

import { percentPublished } from '@/lib/social/campaign';
import type { CampaignProgress } from '@/lib/social/types';
import { TONE_FILL, TONE_TEXT } from './ui';

/**
 * "37 of 80 publications published" with a segmented bar underneath: green
 * for published, red for failed, neutral for skipped, and the remainder left
 * empty for what is still queued. The hues come from the shared tone maps, so
 * a segment and the legend line naming it can never drift apart.
 *
 * The segments and the legend were always honest; the headline above them was
 * not. It read "הושלמו {done}" where `done` was published + failed + skipped,
 * so a run that skipped everything announced itself complete four lines above
 * a legend that said "⏭️ 84 דולגו". The headline now counts publications, and
 * the second line says how much of the run has ended — two numbers, two
 * sentences, neither standing in for the other.
 */
export function CampaignProgressBar({ progress }: { progress: CampaignProgress }) {
  const { total, published, failed, skipped, scheduled, running, manual, finished } = progress;
  if (!total) return <p className="text-sm text-mist-500">עוד לא נוצרו פרסומים לסבב הזה.</p>;
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        {/* Spelled out rather than "4 / 7": a bare fraction flips order in
            RTL and reads as if the larger number came first. */}
        <p className="text-sm font-bold text-mist-100">
          פורסמו {published} מתוך {total} פרסומים
        </p>
        <p className="text-xs text-mist-500">{percentPublished(progress)}%</p>
      </div>
      {finished > published && (
        <p className="mt-0.5 text-xs text-mist-500">
          {finished} מתוך {total} כבר הסתיימו — לא כולם פורסמו
        </p>
      )}
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-ink-700" role="img" aria-label={`${published} מתוך ${total} פורסמו`}>
        {published > 0 && <span className={TONE_FILL.good} style={{ width: pct(published) }} />}
        {failed > 0 && <span className={TONE_FILL.bad} style={{ width: pct(failed) }} />}
        {skipped > 0 && <span className={TONE_FILL.neutral} style={{ width: pct(skipped) }} />}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
        <li className={TONE_TEXT.good}>✅ {published} פורסמו</li>
        {running > 0 && <li className={TONE_TEXT.brand}>⏳ {running} רצים</li>}
        {scheduled > 0 && <li className={TONE_TEXT.brand}>🕐 {scheduled} ממתינים</li>}
        {manual > 0 && <li className={TONE_TEXT.warn}>✋ {manual} ידניים</li>}
        {failed > 0 && <li className={TONE_TEXT.bad}>❌ {failed} נכשלו</li>}
        {skipped > 0 && <li className={TONE_TEXT.neutral}>⏭️ {skipped} דולגו</li>}
      </ul>
    </div>
  );
}
