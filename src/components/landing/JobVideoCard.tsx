'use client';

import { useRef, useState } from 'react';
import { asset } from '@/lib/site';

/**
 * One real-work video in the "recent jobs" rail. Shows only the poster frame
 * (preload="none") until tapped, so four videos on the page cost four small
 * JPGs, not megabytes — then plays with native controls. asset() prefixes the
 * GitHub Pages base path that a plain <video> doesn't get from Next.
 */
export function JobVideoCard({
  src,
  poster,
  title,
  chips,
}: {
  /** Path under /public without extension; .webm and .mp4 must both exist. */
  src: string;
  poster: string;
  title: string;
  chips: string[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  function start() {
    setPlaying(true);
    // play() after the state flip so the controls the user sees are live.
    requestAnimationFrame(() => videoRef.current?.play().catch(() => {}));
  }

  return (
    <figure className="group relative w-72 shrink-0 snap-center overflow-hidden rounded-card bg-ink-800 shadow-lg transition-transform duration-300 sm:w-80 sm:hover:-translate-y-1.5 sm:hover:shadow-xl">
      <div className="relative aspect-3/4">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          poster={asset(poster)}
          preload="none"
          playsInline
          controls={playing}
          onEnded={() => setPlaying(false)}
        >
          <source src={asset(`${src}.webm`)} type="video/webm" />
          <source src={asset(`${src}.mp4`)} type="video/mp4" />
        </video>

        {playing ? null : (
          <button
            type="button"
            onClick={start}
            aria-label={`הפעלת סרטון: ${title}`}
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-black/10 to-transparent"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-xl transition-transform duration-300 group-hover:scale-110">
              <svg viewBox="0 0 24 24" className="ms-1 h-7 w-7 text-brand-500" fill="currentColor" aria-hidden>
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
          </button>
        )}

        {playing ? null : (
          <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 p-4 text-white">
            <p className="font-extrabold drop-shadow">{title}</p>
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span key={chip} className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold backdrop-blur-sm">
                  {chip}
                </span>
              ))}
            </p>
          </figcaption>
        )}
      </div>
    </figure>
  );
}
