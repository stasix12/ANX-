/**
 * The ANX wordmark, drawn to match the brand logo's lettering: heavy angular
 * bars, an italic lean and a solid extrude behind the faces.
 *
 * Vector rather than a crop of the logo artwork — it has to stay crisp from a
 * 32px header to a retina display, and it picks up the theme's brand colours
 * instead of baking in the ones from the source image.
 */

/*
 * Letterforms are built from heavy bars, the way the logo's are.
 *
 * The fill rule differs per glyph and is not incidental: the A is one outline
 * plus a counter that has to punch through (evenodd), while the X is two bars
 * that have to merge where they cross — under evenodd their overlap cancels
 * out and leaves a hole in the middle of the letter.
 */
const letters = [
  {
    key: 'a',
    x: 0,
    fillRule: 'evenodd' as const,
    d: 'M30,0 L55,0 L85,100 L62,100 L56,80 L29,80 L23,100 L0,100 Z M42.5,22 L53,62 L32,62 Z',
  },
  {
    key: 'n',
    x: 101,
    fillRule: 'nonzero' as const,
    d: 'M0,0 L22,0 L58,62 L58,0 L80,0 L80,100 L58,100 L22,38 L22,100 L0,100 Z',
  },
  {
    key: 'x',
    x: 197,
    fillRule: 'nonzero' as const,
    d: 'M0,0 L24,0 L80,100 L56,100 Z M56,0 L80,0 L24,100 L0,100 Z',
  },
];

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 -10 308 126" role="img" aria-label="ANX" className={className} fill="none">
      <defs>
        <linearGradient id="anx-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-500)" />
          <stop offset="100%" stopColor="var(--color-brand-600)" />
        </linearGradient>
      </defs>

      {/* translate compensates for the lean so the glyphs stay in the viewBox */}
      <g transform="translate(20,0) skewX(-10)">
        {/* Extrude, drawn first so the faces sit on top of it. */}
        <g transform="translate(5,6)" fill="var(--color-brand-700)">
          {letters.map(({ key, d, x, fillRule }) => (
            <path key={key} d={d} transform={`translate(${x},0)`} fillRule={fillRule} />
          ))}
        </g>

        <g fill="url(#anx-face)">
          {letters.map(({ key, d, x, fillRule }) => (
            <path key={key} d={d} transform={`translate(${x},0)`} fillRule={fillRule} />
          ))}
        </g>
      </g>
    </svg>
  );
}
