import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';
import { site } from '@/lib/site';

/**
 * The two-tone wordmark ("ANX" charcoal, "3D" orange), optionally with the
 * Hebrew descriptor under it. Hebrew is set without letter-spacing — tracking
 * that suits Latin capitals pulls Hebrew words apart.
 */
export function Logo({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex flex-col gap-2 rounded-lg text-mist-100 transition-opacity duration-200 hover:opacity-75"
      aria-label={`${site.name} — לעמוד הבית`}
    >
      <Wordmark className="h-6 w-auto self-start" />
      {withTagline ? <span className="text-xs font-medium text-mist-500">ציוד מקצועי לניקוי ריפודים</span> : null}
    </Link>
  );
}
