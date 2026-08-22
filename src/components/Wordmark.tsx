/**
 * The ANX wordmark: wide, geometric, squared-off letterforms with even stroke
 * weight and generous tracking — the extended-technical style used by
 * equipment brands, set upright and flat rather than italic and extruded.
 *
 * Drawn as paths instead of set in a webfont so three letters do not cost an
 * extra font download, and so it stays sharp at any size.
 */
const letters = [
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
];

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 330 100"
      role="img"
      aria-label="ANX"
      className={className}
      fill="currentColor"
    >
      {letters.map(({ key, d, x, fillRule }) => (
        <path key={key} d={d} transform={`translate(${x},0)`} fillRule={fillRule} />
      ))}
    </svg>
  );
}
