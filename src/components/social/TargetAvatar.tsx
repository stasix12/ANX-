'use client';

import type { Channel } from '@/lib/social/types';

/**
 * Picture of a group/page, with a lettered fallback. Groups get a rounded
 * square like the Facebook app (their picture is a wide cover photo, which a
 * small circle turns into a smear); pages keep the circle.
 */
export function TargetAvatar({ name, imageUrl, channel, size = 36 }: { name: string; imageUrl?: string | null; channel?: Channel; size?: number }) {
  const style = { width: size, height: size };
  const shape = channel === 'facebook_page' ? 'rounded-full' : 'rounded-xl';
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" style={style} className={`shrink-0 ${shape} object-cover object-center ring-1 ring-ink-600`} />;
  }
  const tone = channel === 'facebook_page' ? 'from-emerald-500 to-teal-400' : 'from-blue-600 to-sky-400';
  return (
    <span style={style} className={`grid shrink-0 place-items-center ${shape} bg-gradient-to-br ${tone} text-sm font-extrabold text-white`}>
      {(name || '?').trim().slice(0, 1)}
    </span>
  );
}
