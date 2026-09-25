import Link from 'next/link';
import { COMMENT_TONE, commentLabel, type CommentStatus } from '@/lib/social/comments';
import { TONE_TEXT } from './ui';

/**
 * A comment's state — and, where we know where it went, the way to go and see it.
 *
 * THE OWNER ASKED FOR PROOF, and the first answer was a screenshot of the
 * page taken at the moment the comment went up. They pointed out the better
 * one: send me to the comment. It costs no storage, it cannot go stale, it
 * shows replies a picture never would, and it is the thing itself rather than
 * a picture of the thing.
 *
 * The address is the POST's — already stored on every publication this
 * version made, so this works on comments that went out before it existed and
 * needs nothing run in Supabase.
 *
 * A row with no address renders as plain text, never as a link that does
 * nothing: a word that looks tappable and is not is worse than a word that
 * does not look tappable.
 *
 * One component for both screens. The round's card and the dashboard's card
 * have drifted apart twice already — different labels, different sort,
 * different markup — and this is the third thing they would each have had to
 * grow on their own.
 */
export function CommentState({ status, permalink }: { status?: string | null; permalink?: string | null }) {
  const label = commentLabel(status);
  if (!label) return null;

  const tone = TONE_TEXT[COMMENT_TONE[status as CommentStatus] ?? 'neutral'];
  if (!permalink) return <span className={`shrink-0 text-[11px] font-bold ${tone}`}>{label}</span>;

  return (
    <Link
      href={permalink}
      target="_blank"
      rel="noreferrer"
      /* The state stays the word, so the row still reads at a glance; the
         underline and the arrow are what say it is a door. brand-400 rather
         than the state's own colour would have made every row look the same. */
      aria-label={`${label} — פתחו את הפוסט בפייסבוק`}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1 text-[11px] font-bold underline underline-offset-2 ${tone}`}
    >
      {label}
      <ShareGlyph />
    </Link>
  );
}

/** Small enough to sit inside an 11px label without pushing the row around. */
function ShareGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
      <path d="M14 4h6v6" />
      <path d="M20 4l-8 8" />
      <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
    </svg>
  );
}
