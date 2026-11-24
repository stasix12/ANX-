/**
 * Highlighted product advantages (ANACONDA, BIG MAMBA): full-width light cards
 * with a blue icon panel cut on a diagonal at the start (right in RTL).
 *
 * Each entry is 'title|accent'. A one-word accent belongs to the title and is
 * underlined in blue ("לחץ שאיבה מוגבר"); a longer one is a grey second line.
 */

type Kind = 'suction' | 'spray' | 'power';

function kindOf(text: string): Kind {
  if (/פטנט|ויסות|עוצמת/.test(text)) return 'power';
  if (/התזה/.test(text)) return 'spray';
  return 'suction';
}

function Icon({ kind }: { kind: Kind }) {
  const common = { width: 32, height: 32, viewBox: '0 0 32 32', fill: 'none', 'aria-hidden': true } as const;
  if (kind === 'power')
    return (
      <svg {...common} fill="currentColor">
        <rect x="5" y="19" width="4.2" height="8" rx="1" />
        <rect x="11.6" y="14" width="4.2" height="13" rx="1" />
        <rect x="18.2" y="9" width="4.2" height="18" rx="1" />
        <rect x="24.8" y="4" width="4.2" height="23" rx="1" />
      </svg>
    );
  if (kind === 'spray')
    return (
      <svg {...common}>
        <path d="M4 16 11 12.5v7z" fill="currentColor" />
        <g fill="currentColor">
          {[
            [15, 16], [18, 12.5], [18, 19.5], [21, 9.5], [21, 16], [21, 22.5],
            [24.5, 7], [24.5, 12.5], [24.5, 19.5], [24.5, 25], [28, 10], [28, 16], [28, 22],
          ].map(([cx, cy]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.25} />
          ))}
        </g>
      </svg>
    );
  return (
    <svg {...common} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M3.5 11.5h15a3.5 3.5 0 1 0-3.5-3.5" />
      <path d="M3.5 16.5h21a3.5 3.5 0 1 1-3.5 3.5" />
      <path d="M7 21.5h7" />
    </svg>
  );
}

export function BenefitCards({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 space-y-2.5">
      {items.map((raw) => {
        const [title, accent = ''] = raw.split('|');
        const inline = accent && !accent.trim().includes(' ');
        return (
          <li
            key={raw}
            className="relative flex min-h-[58px] items-stretch overflow-hidden rounded-[14px] border border-[#a9bcf3] bg-linear-to-b from-white to-[#eef2f9] shadow-[0_3px_10px_rgb(30_60_160/0.08)]"
          >
            {/* Blue icon panel; the white sliver behind it draws the diagonal cut line. */}
            <span aria-hidden="true" className="relative w-[76px] shrink-0 lg:w-[88px]">
              <span className="absolute inset-y-0 right-0 left-0 bg-white [clip-path:polygon(16px_0,100%_0,100%_100%,0_100%)]" />
              <span className="absolute inset-y-0 right-0 left-[4px] grid place-items-center bg-linear-to-br from-[#5a85fa] via-[#2f5dfb] to-[#1a3a9a] pl-2 text-white [clip-path:polygon(16px_0,100%_0,100%_100%,0_100%)]">
                <Icon kind={kindOf(raw)} />
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-center px-3.5 py-2.5">
              <span className="text-[clamp(15.5px,4.6vw,18px)] leading-tight font-black text-x-ink lg:text-[20px]">
                {title}
                {inline && (
                  <>
                    {' '}
                    <span className="relative inline-block">
                      {accent}
                      <span className="absolute -bottom-1 left-1/2 h-[3px] w-[62%] -translate-x-1/2 rounded-full bg-x-blue" />
                    </span>
                  </>
                )}
              </span>
              {accent && !inline && <span className="mt-0.5 text-[13.5px] leading-snug font-medium text-x-ink-2 lg:text-[15px]">{accent}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
