import { asset } from '@/lib/site';
import type { Product } from '@/lib/products';

/**
 * The product in use, under the gallery.
 *
 * Controls are on and the clip starts muted: it plays by itself so the page is
 * not just stills, and anyone who wants the sound can turn it on. Portrait, so
 * it is held to a phone-shaped column rather than stretched across a desktop
 * page.
 */
export function ProductVideo({
  video,
  productName,
}: {
  video: NonNullable<Product['video']>;
  productName: string;
}) {
  return (
    <section aria-labelledby="video-title" className="mt-14">
      <h2 id="video-title" className="text-xl font-bold">
        {productName} בעבודה
      </h2>
      <p className="mt-2 text-sm text-mist-300">צילום אמיתי, ללא עריכה.</p>

      <div className="mt-5 overflow-hidden rounded-card border border-ink-700 bg-ink-850 sm:max-w-[360px]">
        <video
          className="block h-auto w-full"
          controls
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={asset(video.poster)}
          aria-label={`${productName} מנקה ריפוד`}
        >
          {/* Chrome and Firefox take the smaller WebM; Safari falls to the MP4. */}
          <source src={asset(video.webm)} type="video/webm" />
          <source src={asset(video.mp4)} type="video/mp4" />
        </video>
      </div>
    </section>
  );
}
