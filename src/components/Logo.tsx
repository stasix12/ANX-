import Link from 'next/link';
import { site } from '@/lib/site';

/** Wordmark used in the header and the footer. */
export function Logo({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <Link
      href="/"
      className="group flex items-center gap-3 rounded-lg"
      aria-label={`${site.name} — לעמוד הבית`}
    >
      <span
        aria-hidden
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand-500 to-brand-700 text-base font-extrabold tracking-tight text-white shadow-lg shadow-brand-700/30 transition-transform duration-300 group-hover:scale-105"
      >
        A
        <span className="absolute inset-0 rounded-xl ring-1 ring-white/20" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-xl font-extrabold tracking-[0.14em] text-mist-100">ANX3D</span>
        {withTagline ? (
          <span className="mt-1.5 text-[11px] font-medium tracking-[0.18em] text-mist-500 uppercase">
            {site.tagline}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
