import Image from 'next/image';
import Link from 'next/link';
import { asset, site } from '@/lib/site';

/**
 * The brand badge plus the wordmark. The badge art is detailed, so the name
 * is set as text alongside it rather than relying on the lettering inside the
 * circle, which stops being legible at header size.
 */
export function Logo({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2.5 rounded-lg"
      aria-label={`${site.name} — לעמוד הבית`}
    >
      <Image
        src={asset('/brand/anx-logo.webp')}
        alt=""
        aria-hidden
        width={256}
        height={256}
        priority
        sizes="48px"
        className={`shrink-0 transition-transform duration-300 group-hover:scale-105 ${
          withTagline ? 'h-12 w-12' : 'h-10 w-10 sm:h-11 sm:w-11'
        }`}
      />
      <span className="flex flex-col leading-none">
        <span className="text-lg font-extrabold tracking-[0.14em] text-mist-100 sm:text-xl">
          ANX3D
        </span>
        {withTagline ? (
          <span className="mt-1.5 text-[11px] font-medium tracking-[0.18em] text-mist-500 uppercase">
            {site.tagline}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
