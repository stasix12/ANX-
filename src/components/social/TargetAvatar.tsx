'use client';

import type { Channel } from '@/lib/social/types';

/**
 * Picture of a group/page, with a lettered fallback. Groups get a rounded
 * square like the Facebook app (their picture is a wide cover photo, which a
 * small circle turns into a smear); pages keep the circle.
 *
 * The fallback used to be a two-stop gradient (`from-blue-600 to-sky-400`,
 * `from-emerald-500 to-teal-400`) — the only channel-identity colour in the
 * product and the last gradient in it. Both are now flat surface steps from
 * the palette: a group is blue, a page is green, and the letter on each is the
 * surface's own label token (4.95 and 5.35). The gradients' light ends carried
 * white at 2.2:1, so on half of each tile the letter was not actually legible.
 */
export function TargetAvatar({
  name,
  imageUrl,
  channel,
  size = 36,
  className = '',
}: {
  name: string;
  imageUrl?: string | null;
  channel?: Channel;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  const shape = channel === 'facebook_page' ? 'rounded-full' : 'rounded-xl';
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    /* loading="lazy" — this is the one <img> every group picture in the
       product goes through, and the dashboard's two rails mount ~190 and ~160
       rows of them while showing about six. The pictures are unresized PNG
       crops of a Facebook cover with a ?v= cache-buster, so without this a
       dashboard load fetched megabytes of thumbnails nobody scrolled to. The
       element already carries explicit width/height, so nothing shifts.
       PostCover and ContentCard already do this; this one was missed. */
    return <img src={imageUrl} alt="" loading="lazy" decoding="async" style={style} className={`shrink-0 ${shape} object-cover object-center ring-1 ring-ink-700 ${className}`} />;
  }
  const tone = channel === 'facebook_page' ? 'bg-success-500 text-on-state' : 'bg-brand-500 text-on-brand';
  return (
    <span style={style} className={`grid shrink-0 place-items-center ${shape} ${tone} text-sm font-extrabold ${className}`}>
      {initial(name)}
    </span>
  );
}

/**
 * The one character on the fallback tile.
 *
 * `slice(0, 1)` takes one UTF-16 unit, and a great many group names open with
 * an emoji — "🏠 נדל״ן באר שבע". An emoji is a surrogate pair, so half of one
 * was being rendered and every tile for that group drew a U+FFFD box.
 *
 * Skipping to the first letter or digit also reads better than the emoji
 * would: the tile is meant to say WHICH group, and the star or house at the
 * front of a name is the part every such name shares. A name made only of
 * symbols keeps its first WHOLE code point, so that case shows the symbol
 * rather than nothing.
 */
function initial(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const letter = trimmed.match(/[\p{L}\p{N}]/u);
  if (letter) return letter[0];
  return Array.from(trimmed)[0] ?? '?';
}
