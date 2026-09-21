'use client';

import { runProgress } from '@/lib/social/campaign';
import type { CampaignProgress } from '@/lib/social/types';
import { TONE_FILL, TONE_TEXT, type Tone } from './ui';

/**
 * How far the round has got, then what it actually produced — in that order,
 * because they are two different numbers and the card was printing three.
 *
 * ABOVE THE BAR: the PROGRESS figure — "1 מתוך 29 טופלו", handled rows over
 * the total, from runProgress(). The bar's segments were always drawn over
 * handled rows (green published + red failed + grey skipped), while the
 * caption 7px above counted publications alone: a run of 29 rows that all
 * failed drew a bar filled to its full width with "0%" printed beside it, and
 * the same run looked 100% full on the campaigns list and 0% full on the
 * dashboard, one tap apart. The caption now counts the same rows the segments
 * do, so the two cannot disagree.
 *
 * BELOW THE BAR: the SUCCESS figure and the rest of the outcome, "0 פורסמו ·
 * 28 ממתינים · 1 דולג · 0 נכשלו". "הושלמו" is not used for either: it is
 * reserved for publications (INV-2), and the handled figure is worded "טופלו".
 *
 * The third statement that used to sit here — "{finished} מתוך {total} כבר
 * הסתיימו — לא כולם פורסמו" — is gone: it was the handled figure in a second
 * sentence, which is now the headline.
 */
export function CampaignProgressBar({ progress }: { progress: CampaignProgress }) {
  const { total, published, failed, skipped, scheduled, running, manual } = progress;
  if (!total) return <p className="text-sm text-mist-500">עוד לא נוצרו פרסומים לסבב הזה.</p>;
  const view = runProgress(progress);
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        {/* Spelled out rather than "4 / 7": a bare fraction flips order in
            RTL and reads as if the larger number came first. */}
        <p className="text-sm font-bold text-mist-100">{view.handledLabel}</p>
        <p className="text-xs tabular-nums text-mist-500">{view.percent}%</p>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-ink-700" role="img" aria-label={view.ariaLabel}>
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

        The first four always render, zeros included, and in this fixed order:
        it is the one line on the card the owner reads as a sentence, and a
        line whose words move depending on the run is a line that has to be
        re-read every time. "רצים" and "דורשים פעולה" stay conditional — they
        are states a run is usually not in, and the live dot beside the run's
        name already says a publication is in flight.
      */}
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
        <LegendItem tone="good" count={published} one="פורסם" many="פורסמו" always />
        <LegendItem tone="brand" count={scheduled} one="ממתין" many="ממתינים" always />
        <LegendItem tone="neutral" count={skipped} one="דולג" many="דולגו" always />
        <LegendItem tone="bad" count={failed} one="נכשל" many="נכשלו" always />
        <LegendItem tone="brand" count={running} one="רץ" many="רצים" />
        {/* "דורשים פעולה", the run screen's own wording for this bucket, not
            "ידניים": the latter names how the row is published rather than
            what the owner has to do about it. */}
        <LegendItem tone="warn" count={manual} one="דורש פעולה" many="דורשים פעולה" />
      </ul>
    </div>
  );
}

/**
 * One legend line.
 *
 * Hebrew has no bare-numeral singular, so a fixed plural prints "1 דולגו" —
 * and 1 is the commonest value here. The label agrees with its own count.
 */
function LegendItem({
  tone,
  count,
  one,
  many,
  always = false,
}: {
  tone: Tone;
  count: number;
  one: string;
  many: string;
  always?: boolean;
}) {
  if (count <= 0 && !always) return null;
  return (
    <li className={`flex items-center gap-1.5 ${TONE_TEXT[tone]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_FILL[tone]}`} />
      <span className="tabular-nums">{count}</span> {count === 1 ? one : many}
    </li>
  );
}
