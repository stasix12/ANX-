import Link from 'next/link';
import { site } from '@/config/site';
import { nav } from '@/content/copy';

/**
 * Text wordmark with a small blue mark. Replace with the real logo (SVG in
 * /public/logo.svg via next/image) once supplied — keep the aria-label.
 */
export function Logo({ onClick, light = false }: { onClick?: () => void; light?: boolean }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      aria-label={`${site.name} — ${nav.logoTagline}`}
      className={`inline-flex items-center gap-2.5 text-xl font-bold tracking-tight ${light ? 'text-navy' : 'text-fg'}`}
    >
      <span aria-hidden className="inline-block h-3 w-3 rounded-[3px] bg-accent" />
      <span dir="ltr">{site.name}</span>
    </Link>
  );
}
