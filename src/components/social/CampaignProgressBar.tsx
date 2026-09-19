'use client';

import { percentPublished } from '@/lib/social/campaign';
import type { CampaignProgress } from '@/lib/social/types';
import { TONE_FILL, TONE_TEXT, type Tone } from './ui';

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
      {/*
        A dot in the segment's own colour, not an emoji.
        
        The legend was ✅ ⏳ 🕐 ✋ ❌ ⏭️ — six full-colour Apple glyphs carrying
        the meaning, so the amber ⏳ sat beside blue text and the legend
        disagreed with the bar it was labelling. The dot is TONE_FILL, which is
        literally the colour of the matching bar segment, so a legend line and
        its segment cannot drift apart.
      */}
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
        <LegendItem tone="good" count={published} label="פורסמו" />
        <LegendItem tone="brand" count={running} label="רצים" />
        <LegendItem tone="brand" count={scheduled} label="ממתינים" />
        <LegendItem tone="warn" count={manual} label="ידניים" />
        <LegendItem tone="bad" count={failed} label="נכשלו" />
        <LegendItem tone="neutral" count={skipped} label="דולגו" />
      </ul>
    </div>
  );
}

/**
 * One legend line. Nothing is printed when the count is zero — a legend full
 * of zeros is noise, and "0 נכשלו" invites a second look at a run that is
 * fine. `published` is the exception, handled by the caller: it is the number
 * the whole bar is about.
 */
function LegendItem({ tone, count, label }: { tone: Tone; count: number; label: string }) {
  if (count <= 0 && tone !== 'good') return null;
  return (
    <li className={`flex items-center gap-1.5 ${TONE_TEXT[tone]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_FILL[tone]}`} />
      <span className="tabular-nums">{count}</span> {label}
    </li>
  );
}
