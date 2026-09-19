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
    return <img src={imageUrl} alt="" style={style} className={`shrink-0 ${shape} object-cover object-center ring-1 ring-ink-700 ${className}`} />;
  }
  const tone = channel === 'facebook_page' ? 'bg-success-500 text-on-state' : 'bg-brand-500 text-on-brand';
  return (
    <span style={style} className={`grid shrink-0 place-items-center ${shape} ${tone} text-sm font-extrabold ${className}`}>
      {(name || '?').trim().slice(0, 1)}
    </span>
  );
}
