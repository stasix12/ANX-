/**
 * The ANX3D wordmark: wide, geometric, squared-off letterforms with even
 * stroke weight and generous tracking — the extended-technical style used by
 * equipment brands, set upright and flat.
 *
 * Drawn as paths instead of set in a webfont so five glyphs do not cost an
 * extra font download, and so it stays sharp at any size.
 *
 * Every glyph is 90 wide on a 100 baseline with a 20-unit stroke, spaced 30
 * apart, which is what keeps the weight even across the lockup.
 */
const glyphs = [
  {
    key: 'a',
    x: 0,
    // evenodd: the counter has to punch through the letter body
    fillRule: 'evenodd' as const,
    d: 'M0,100 L14,0 L76,0 L90,100 L68,100 L63,74 L27,74 L22,100 Z M32,56 L38,20 L52,20 L58,56 Z',
  },
  {
    key: 'n',
    x: 120,
    fillRule: 'nonzero' as const,
    d: 'M0,0 L20,0 L70,66 L70,0 L90,0 L90,100 L70,100 L20,34 L20,100 L0,100 Z',
  },
  {
    key: 'x',
    x: 240,
    // nonzero: the two bars must merge where they cross, not cancel out
    fillRule: 'nonzero' as const,
    d: 'M0,0 L22,0 L90,100 L68,100 Z M68,0 L90,0 L22,100 L0,100 Z',
  },
  {
    key: 'three',
    x: 360,
    /*
     * Three bars plus two right-hand connectors, overlapping slightly so the
     * joins do not show a seam; nonzero unions them into one solid glyph.
     *
     * The angled left terminals on the top and bottom bars are what make this
     * a numeral: squared off flat, a 3 built this way is geometrically the
     * same shape as a mirrored E and reads as one.
     */
    fillRule: 'nonzero' as const,
    d:
      'M30,0 L90,0 L90,21 L10,21 Z ' +
      'M70,19 H90 V41 H70 Z ' +
      'M34,39 H90 V61 H34 Z ' +
      'M70,59 H90 V81 H70 Z ' +
      'M10,79 L90,79 L90,100 L30,100 Z',
  },
  {
    key: 'd',
    x: 480,
    fillRule: 'evenodd' as const,
    d: 'M0,0 L66,0 L90,24 L90,76 L66,100 L0,100 Z M20,20 L58,20 L70,32 L70,68 L58,80 L20,80 Z',
  },
];

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 570 100"
      role="img"
      aria-label="ANX3D"
      className={className}
      fill="currentColor"
    >
      {glyphs.map(({ key, d, x, fillRule }) => (
        <path key={key} d={d} transform={`translate(${x},0)`} fillRule={fillRule} />
      ))}
    </svg>
  );
}
