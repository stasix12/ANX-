'use client';

import { useEffect, useRef, useState } from 'react';
import { WaButton } from '@/components/hamavrik/CtaLinks';
import { CheckIcon, PlayIcon } from '@/components/icons';
import { track } from '@/lib/hamavrik/analytics';
import { featuredVideo } from '@/lib/hamavrik/config';
import { waLinkFor } from '@/lib/hamavrik/links';
import { asset } from '@/lib/site';

const POINTS = ['צילום אמיתי, ללא עריכה של הבד', 'הזרקה-יניקה בלחץ מקצועי', 'הריפוד יבש תוך שעות'];

/**
 * The real before→after clip, placed as the first proof on the page. The
 * markup is a plain <video> with a poster and preload="none": nothing is
 * fetched until the card scrolls into view, then it plays muted on a loop
 * and pauses again when it leaves the screen. A tap toggles pause/play.
 */
export function FeaturedVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const tracked = useRef(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  if (!featuredVideo) return null;
  const v = featuredVideo;

  function toggle() {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
    if (!tracked.current) {
      tracked.current = true;
      track('before_after_interaction', { job: 'featured-video', service: v.service });
    }
  }

  return (
    <div className="surface mb-6 grid overflow-hidden rounded-2xl sm:mb-8 lg:grid-cols-[minmax(0,420px)_1fr]">
      <button
        type="button"
        onClick={toggle}
        aria-label={paused ? 'הפעלת הסרטון' : 'השהיית הסרטון'}
        className="relative block w-full bg-ink-900 text-start"
        style={{ aspectRatio: v.aspect }}
      >
        <video
          ref={ref}
          muted
          loop
          playsInline
          preload="none"
          poster={asset(v.poster)}
          className="absolute inset-0 h-full w-full object-cover"
        >
          {v.webm ? <source src={asset(v.webm)} type="video/webm" /> : null}
          <source src={asset(v.mp4)} type="video/mp4" />
        </video>
        {paused ? (
          <span className="absolute inset-0 grid place-items-center bg-black/25">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95 text-brand-500 shadow-xl">
              <PlayIcon className="h-7 w-7" />
            </span>
          </span>
        ) : null}
        <span className="pointer-events-none absolute bottom-3 start-3 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
          🎥 צילום אמיתי מעבודה שלנו
        </span>
      </button>

      <div className="flex flex-col justify-center gap-3 p-5 sm:p-7">
        <span className="shine-eyebrow self-start">לפני ואחרי בווידאו</span>
        <h3 className="text-2xl font-black leading-tight sm:text-3xl">ככה זה נראה באמת.</h3>
        <p className="text-mist-300">
          <span className="font-extrabold text-mist-100">{v.itemLabel}</span>
          {v.city ? <span className="text-mist-500"> | {v.city}</span> : null} — {v.problem}. אותה ספה, לפני ואחרי ניקוי עמוק בבית הלקוח.
        </p>
        <ul className="grid gap-1.5 text-sm font-bold">
          {POINTS.map((p) => (
            <li key={p} className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-wa-100 text-wa-600">
                <CheckIcon className="h-3 w-3" />
              </span>
              {p}
            </li>
          ))}
        </ul>
        <WaButton location="featured-video" href={waLinkFor('ראיתי את הסרטון — מצרפ/ת תמונה של הספה שלי 📷')} className="mt-1 self-start">
          רוצים תוצאה כזאת? שלחו תמונה
        </WaButton>
      </div>
    </div>
  );
}
