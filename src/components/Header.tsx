import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';
import { site } from '@/lib/site';

/**
 * Deliberately bare: a single centred wordmark, nothing else. The catalog is
 * the only page, so there is nothing to navigate to, and the social links live
 * in the footer where they belong.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-700 bg-ink-950/85 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-center px-4 sm:h-20 sm:px-6">
        <Link
          href="/"
          aria-label={`${site.name} — לעמוד הבית`}
          className="rounded-lg transition-opacity duration-200 hover:opacity-85"
        >
          <Wordmark className="h-7 w-auto sm:h-9" />
        </Link>
      </div>
    </header>
  );
}
