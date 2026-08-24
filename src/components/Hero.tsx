import { IsraelFlagIcon } from '@/components/icons';
import { asset } from '@/lib/site';

/**
 * The top of the home page: what is sold and who it is for, over the tools
 * actually working.
 *
 * The clip is the shop's own two recordings joined into one. Both were shot in
 * portrait; they are cropped to a landscape band rather than letterboxed, which
 * costs two thirds of the frame height and is worth it twice over — the band
 * keeps the head of the tool and the clear window where the dirty water shows,
 * and it loses the room clutter above it that had nothing to do with the
 * product.
 *
 * Framed rather than run edge to edge: held to the same column as everything
 * else on the page, with the border and rounding the product cards use.
 */
export function Hero() {
  return (
    <section className="border-b border-ink-700">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="text-center">
          {/*
            The flag keeps its own colours, so it sits on a surface chip with a
            hairline rather than directly on the page — on a pale aqua ground
            its white field would otherwise bleed into the background and leave
            two blue stripes floating.
          */}
          <p className="inline-flex items-center gap-2 rounded-full border border-ink-700 bg-ink-850 py-1.5 pe-3 ps-1.5 text-xs font-bold shadow-sm sm:text-sm">
            <IsraelFlagIcon className="h-4 w-[22px] shrink-0 rounded-[2px] ring-1 ring-ink-700 sm:h-[18px] sm:w-6" />
            <span>מיוצר בישראל · ייצור מקומי</span>
          </p>

          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-balance-he sm:text-4xl">
            ציוד שאיבה למכונות Sabrina
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-mist-300 sm:text-base">
            ידיות, צינורות ומתאמים מחומרים חזקים שעומדים בחום ובשחיקה של עבודה
            יומיומית. מיוצרים כאן בארץ, ישירות מהיצרן, בלי מתווכים, והזמנה
            בוואטסאפ.
          </p>
        </div>

        <div className="mt-6 overflow-hidden rounded-card border border-ink-700 bg-black shadow-xl sm:mt-7">
          <video
            /* 16:9 on a phone, where that is already a short band; squeezed
               further on a wide screen, where 16:9 across the full column
               would stand taller than the fold and bury the catalogue. */
            className="block aspect-video w-full object-cover lg:aspect-[2.4/1]"
            autoPlay
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
        </div>

        <div className="mt-6 text-center">
          <a
            href="#products"
            className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-bold text-on-brand transition-colors duration-200 hover:bg-brand-400"
          >
            לצפייה במוצרים
          </a>
        </div>
      </div>
    </section>
  );
}
