/** "מיוצר בישראל" badge with a small flag, for products made in-house. */
export function MadeInIsrael({ size = 'md', className = '' }: { size?: 'sm' | 'md'; className?: string }) {
  const sm = size === 'sm';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-white/95 font-bold text-x-ink shadow-[0_1px_4px_rgb(0_0_0/0.12)] ring-1 ring-x-line ${
        sm ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2.5 py-1 text-[12.5px]'
      } ${className}`}
    >
      <svg width={sm ? 13 : 17} height={sm ? 9 : 12} viewBox="0 0 22 16" aria-hidden="true" className="shrink-0 rounded-[2px] ring-1 ring-black/10">
        <rect width="22" height="16" fill="#fff" />
        <rect y="1.6" width="22" height="2.2" fill="#0038b8" />
        <rect y="12.2" width="22" height="2.2" fill="#0038b8" />
        <path d="M11 4.9 13.6 9.4H8.4ZM11 11.1 8.4 6.6H13.6Z" fill="none" stroke="#0038b8" strokeWidth="0.9" />
      </svg>
      מיוצר בישראל
    </span>
  );
}
