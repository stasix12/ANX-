'use client';

import { useEffect, useRef, useState } from 'react';
import { asset } from '@/lib/site';

/** Sits over the footage — a small white label, legible over any frame. */
function VideoBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-bold text-mist-100 shadow-[0_1px_3px_rgb(0_0_0/0.12)]">
      {children}
    </span>
  );
}

/**
 * The shop's own footage of a handle at work, framed like a product image.
 *
 * It autoplays muted and loops — except for visitors who asked for reduced
 * motion, who get the poster frame and the play button. The pause control is
 * always there: looping motion that cannot be stopped fails WCAG 2.2.2.
 */
export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    video.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, []);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setPlaying(true), () => undefined);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-800 shadow-[0_24px_48px_-28px_rgb(0_0_0/0.35)]">
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap gap-1.5 sm:inset-x-4 sm:top-4">
        <VideoBadge>שאיבה מוגברת</VideoBadge>
        <VideoBadge>התזה בלחץ מלא</VideoBadge>
      </div>
      <video
        ref={videoRef}
        /* 16:10 on a phone; wider on the desktop split so it matches the
           height of the headline column instead of towering over it. */
        className="block aspect-[16/10] w-full object-cover lg:aspect-[4/3]"
        muted
        loop
        playsInline
        preload="metadata"
        poster={asset('/video/anx-hero-poster.jpg')}
        aria-label="ידית ANX3D שואבת ריפוד של כיסא"
      >
        {/* Chrome and Firefox take the WebM; Safari falls to the MP4. */}
        <source src={asset('/video/anx-hero.webm')} type="video/webm" />
        <source src={asset('/video/anx-hero.mp4')} type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'עצירת הסרטון' : 'הפעלת הסרטון'}
        className="absolute bottom-3 end-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-mist-100 shadow-[0_1px_3px_rgb(0_0_0/0.15)] transition-colors hover:bg-white"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="currentColor">
            <path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" />
          </svg>
        )}
      </button>
    </div>
  );
}
