import { formatDateTimeHe } from '@/lib/social/time';

/**
 * Timestamps, rendered so the bidi algorithm leaves them alone.
 *
 * `formatDateTimeHe` returns "19.09.2026, 14:05" — TWO European-number runs
 * around a neutral comma. Inside an RTL paragraph rule N1 resolves that
 * separator to R, I2 puts each number run a level deeper, and L2's double
 * reversal renders the string as "14:05 ,19.09.2026": the time jumps in front
 * of the date and the comma lands on the wrong side.
 *
 * It is not a truncation bug, and `dir="auto"` does NOT fix it — the string
 * has no strong character, so auto falls back to the parent's direction, which
 * is the RTL that caused it. The fix is an explicit LTR island at the render
 * layer, exactly what QueueTunerSheet's <Clock> already does for a bare time.
 *
 * Formatting itself is untouched: nothing here decides what a timestamp says,
 * only which way round it is read.
 */

/** U+2066 LEFT-TO-RIGHT ISOLATE … U+2069 POP DIRECTIONAL ISOLATE. */
const LRI = '\u2066';
const PDI = '\u2069';

/**
 * The character-level equivalent of `dir="ltr"`, for the places a timestamp
 * has to stay a plain string: an `aria-label`, a `title=`, or a prop typed
 * `string` such as AlertBar's `body`. You cannot put a <span> inside a string.
 */
export function ltr(text: string): string {
  return `${LRI}${text}${PDI}`;
}

/** The same, for a full date-and-time that is built into a Hebrew sentence. */
export function stampText(iso: string | Date | null | undefined): string {
  return ltr(formatDateTimeHe(iso));
}

/** A full timestamp as an element, for the ordinary JSX case. */
export function Stamp({
  iso,
  className = '',
}: {
  iso: string | Date | null | undefined;
  className?: string;
}) {
  return (
    <span dir="ltr" className={`inline-block tabular-nums ${className}`}>
      {formatDateTimeHe(iso)}
    </span>
  );
}
