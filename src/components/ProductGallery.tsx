'use client';

import Image from 'next/image';
import { useState } from 'react';

interface ProductGalleryProps {
  images: string[];
  productName: string;
}

export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-card border border-ink-700 bg-ink-850">
        <Image
          key={images[activeIndex]}
          src={images[activeIndex]}
          alt={`${productName} — תמונה ${activeIndex + 1} מתוך ${images.length}`}
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="animate-rise object-cover"
        />
      </div>

      {images.length > 1 ? (
        <div className="mt-4 grid grid-cols-4 gap-3">
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
