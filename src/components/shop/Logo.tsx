/**
 * The ANX3D wordmark from the design: heavy italic "ANX" in ink (white on the
 * dark hero) with "3D" in the blue→violet brand gradient.
 */
export function Logo({
  tone = 'dark',
  className = '',
  upright = false,
}: {
  tone?: 'dark' | 'light';
  className?: string;
  /** Upright cut with a blue "3D", as in the home hero design. */
  upright?: boolean;
}) {
  return (
    <span
      dir="ltr"
      aria-label="ANX3D"
      className={`inline-block select-none font-black leading-none tracking-[-0.04em] ${className}`}
      style={upright ? undefined : { transform: 'skewX(-12deg)' }}
    >
      <span aria-hidden="true" className={tone === 'light' ? 'text-white' : 'text-x-ink'}>
        ANX
      </span>
      <span
        aria-hidden="true"
        className={`bg-clip-text pe-[0.06em] text-transparent ${upright ? 'bg-linear-to-r from-[#3a5cff] to-[#3f3ff0]' : 'bg-linear-to-r from-[#3b5bff] via-[#4b55fb] to-[#7a4cff]'}`}
      >
        3D
      </span>
    </span>
  );
}
