/**
 * The campaign's progress as a ring — the headline figure on its own screen.
 *
 * SVG rather than a conic gradient so the stroke stays crisp at any density
 * and the whole thing can be given a real accessible value. The circle is
 * drawn from the top and, in an RTL layout, fills clockwise like a clock —
 * the direction people expect of elapsed progress regardless of text
 * direction, so it is deliberately not mirrored.
 */
export function ProgressRing({
  percent,
  label,
  sub,
  size = 132,
  stroke = 12,
  tone = 'default',
}: {
  percent: number;
  /** The big figure inside the ring. */
  label: string;
  sub?: string;
  size?: number;
  stroke?: number;
  /**
   * WHICH GROUND THE RING IS SITTING ON.
   *
   * 'default' is a white card: a pale track, the brand fill, dark figures.
   * 'on-brand' is the hero's blue gradient, where every one of those three
   * disappears — brand-300 on brand-300 is an invisible ring and mist-100 on
   * blue is unreadable. It is a TONE and not a set of className props on
   * purpose: a caller passing its own colours is a caller that can pass an
   * unmeasured pair, and these two are measured. White on the gradient's
   * three stops reads 11.11 / 6.24 / 5.17; the track is white at 30%, which
   * is a shape and carries no text.
   */
  tone?: 'default' | 'on-brand';
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  /*
   * ─── THE FIGURE INSIDE HAS TO KNOW HOW BIG THE RING IS ──────────────────
   *
   * `text-2xl` was hard-coded here while `size` was a prop, which held for as
   * long as every caller drew the ring at 132. The dashboard's campaign card
   * now draws it at 58 — the reference's own size — and a 24px "80%" over an
   * 11px word inside a 46px hole does not overflow politely: it spilled out of
   * the circle and over the edge of the card, which is what the first
   * screenshot of the compacted card showed.
   *
   * Two steps rather than a formula: the ring is either the headline of a
   * screen or a glance inside a row, and 18/9 is what the reference draws in
   * the second case (measured off it at ~18.5 and ~9 CSS px). 84 is between
   * the only two sizes this component is ever given.
   */
  const small = size < 84;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${pct}% הושלמו`}
        /* -90deg puts 0% at twelve o'clock; scaleX(-1) keeps it clockwise
           after the rotation, in both text directions. */
        style={{ transform: 'rotate(-90deg) scaleX(-1)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={tone === 'on-brand' ? 'stroke-white/30' : 'stroke-ink-700'}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={`transition-[stroke-dashoffset] duration-700 ${tone === 'on-brand' ? 'stroke-white' : 'stroke-brand-300'}`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className={`${small ? 'text-[18px]' : 'text-2xl'} font-extrabold tabular-nums leading-none ${tone === 'on-brand' ? 'text-white' : 'text-mist-100'}`}>{label}</p>
          {/* dir="ltr": "18 / 125" is digits around a neutral slash, which an
              RTL paragraph reorders to "125 / 18". */}
          {sub && (
            <p dir="ltr" className={`${small ? 'mt-px text-[9px] leading-3' : 'mt-1 text-[11px]'} font-bold ${tone === 'on-brand' ? 'text-white/85' : 'text-mist-500'}`}>
              {sub}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
