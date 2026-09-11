'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { asset } from '@/lib/site';

/**
 * The hero's real-footage loop, loaded the polite way: the poster is the
 * LCP image (preloaded, painted immediately) and the 1.6 MB video only
 * starts fetching after the page has finished loading — never on a
 * data-saver connection, never for reduced-motion users. Until then, and
 * for anyone who never gets the video, the poster is the hero.
 */
export function HeroVideo({
  webm,
  mp4,
  poster,
  alt,
}: {
  webm: string;
  mp4: string;
  poster: string;
  alt: string;
}) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;

    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => setReady(true), 400);
    };
    if (document.readyState === 'complete') arm();
    else window.addEventListener('load', arm, { once: true });
    return () => {
      window.removeEventListener('load', arm);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      /* autoplay refused — the poster stays; nothing to do */
    });
  }, [ready]);

  return (
    <div className="relative aspect-4/3 w-full overflow-hidden bg-ink-900">
      <Image
        src={poster}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 560px"
        preload
        className={`object-cover transition-opacity duration-700 ${playing ? 'opacity-0' : 'opacity-100'}`}
      />
      {ready ? (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="auto"
          onPlaying={() => setPlaying(true)}
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={asset(webm)} type="video/webm" />
          <source src={asset(mp4)} type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
