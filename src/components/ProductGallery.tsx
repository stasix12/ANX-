'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { PlayIcon } from '@/components/icons';
import type { Product } from '@/lib/products';
import { asset } from '@/lib/site';

interface ProductGalleryProps {
  images: string[];
  productName: string;
  /** When present, it leads the thumbnail row and plays in the main frame. */
  video?: Product['video'];
}

export function ProductGallery({ images, productName, video }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  // -1 is the video tile; anything else indexes into images.
  const showVideo = activeIndex === -1;
  const imageIndex = showVideo ? 0 : activeIndex;
  const player = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = player.current;
    if (!element) return;

    if (showVideo) {
      // Muted, so this is allowed to start on its own.
      void element.play().catch(() => {});
    } else {
      element.pause();
    }
  }, [showVideo]);

  return (
    <div>
      <div className="relative aspect-[3/4] overflow-hidden rounded-card border border-ink-700 bg-ink-850">
        <Image
          key={images[imageIndex]}
          src={images[imageIndex]}
          alt={`${productName} — תמונה ${imageIndex + 1} מתוך ${images.length}`}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="animate-rise object-cover"
          hidden={showVideo}
          data-gallery-image
        />

        {video ? (
          /*
           * Kept mounted rather than swapped in, so the static preview can show
           * it by toggling `hidden` instead of rebuilding the element. object-
           * contain because the clip is 9:16 inside a 3:4 frame — covering it
           * would cut the top and bottom off the shot.
           */
          <video
            ref={player}
            className="absolute inset-0 h-full w-full bg-black object-contain"
            controls
            muted
            loop
            playsInline
            preload="none"
            poster={asset(video.poster)}
            aria-label={`${productName} מנקה ריפוד`}
            hidden={!showVideo}
            data-gallery-video
          >
            {/* Chrome and Firefox take the smaller WebM; Safari falls to the MP4. */}
            <source src={asset(video.webm)} type="video/webm" />
            <source src={asset(video.mp4)} type="video/mp4" />
          </video>
        ) : null}
      </div>

      {images.length > 1 || video ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {video ? (
            <button
              type="button"
              onClick={() => setActiveIndex(-1)}
              aria-label={`הצגת סרטון של ${productName}`}
              aria-current={showVideo}
              data-gallery-video-thumb
              className={`relative aspect-square overflow-hidden rounded-xl border transition-colors duration-200 ${
                showVideo ? 'border-brand-500' : 'border-ink-700 hover:border-ink-600'
              }`}
            >
              <Image
                src={asset(video.poster)}
                alt=""
                fill
                loading="lazy"
                sizes="120px"
                className="object-cover"
              />
              <span className="absolute inset-0 grid place-items-center bg-black/35">
                <PlayIcon className="h-7 w-7 text-white drop-shadow" />
              </span>
            </button>
          ) : null}

          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`הצגת תמונה ${index + 1} של ${productName}`}
              aria-current={index === activeIndex}
              className={`relative aspect-square overflow-hidden rounded-xl border transition-colors duration-200 ${
                index === activeIndex
                  ? 'border-brand-500'
                  : 'border-ink-700 hover:border-ink-600'
              }`}
            >
              <Image
                src={image}
                alt=""
                fill
                loading="lazy"
                sizes="120px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
