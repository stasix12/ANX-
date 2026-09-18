'use client';

import type { Channel } from '@/lib/social/types';

/** Round picture of a group/page, with a lettered fallback like Facebook's. */
export function TargetAvatar({ name, imageUrl, channel, size = 36 }: { name: string; imageUrl?: string | null; channel?: Channel; size?: number }) {
  const style = { width: size, height: size };
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" style={style} className="shrink-0 rounded-full object-cover ring-1 ring-ink-600" />;
  }
  const tone = channel === 'facebook_page' ? 'from-emerald-500 to-teal-400' : 'from-blue-600 to-sky-400';
  return (
    <span style={style} className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${tone} text-sm font-extrabold text-white`}>
      {(name || '?').trim().slice(0, 1)}
    </span>
  );
}
