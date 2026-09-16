import { business } from '@/lib/hamavrik/config';

/**
 * Typographic wordmark with a small "spark" mark: navy first word, green
 * second – the two colours of the brand (deep clean / fresh). `light` flips
 * to white for the dark hero and footer.
 */
export function Logo({ light = false, className = '' }: { light?: boolean; className?: string }) {
  const [a, b] = business.wordmark;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          light ? 'bg-white/15 text-aqua-300' : 'bg-brand-500 text-white'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
          <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
          <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity="0.8" />
        </svg>
      </span>
      <span className="text-xl font-black leading-none tracking-tight">
        <span className={light ? 'text-white' : 'text-brand-400'}>{a}</span>{' '}
        <span className={light ? 'text-aqua-300' : 'text-wa-600'}>{b}</span>
      </span>
    </span>
  );
}
