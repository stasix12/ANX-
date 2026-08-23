import { IsraelFlagIcon } from '@/components/icons';
import { asset } from '@/lib/site';

/**
 * The top of the home page: what is sold and who it is for, beside the tools
 * actually working.
 *
 * The clip is the shop's own two recordings joined into one, held in a frame
 * rather than run edge to edge — portrait footage across the full width would
 * push the catalogue most of a screen down, and the catalogue is what the page
 * is for. It plays muted and loops with no controls, so it reads as a moving
 * picture rather than as something to operate.
 */
export function Hero() {
  return (
    <section className="border-b border-ink-700">
      <div className="mx-auto grid max-w-6xl items-center gap-7 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-2 lg:gap-10">
        <div className="text-center lg:text-start">
          {/*
            The flag keeps its own colours, so it sits on a white chip with a
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
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-mist-300 sm:text-base lg:mx-0 lg:max-w-lg">
            ידיות, צינורות ומתאמים שמודפסים בתלת־מימד כאן בארץ. ישירות מהיצרן,
            בלי מתווכים, והזמנה בוואטסאפ.
          </p>

          <a
            href="#products"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-bold text-on-brand transition-colors duration-200 hover:bg-brand-400"
          >
            לצפייה במוצרים
          </a>
        </div>

        <div className="mx-auto w-[220px] shrink-0 sm:w-[260px] lg:w-[300px] lg:justify-self-center">
          <div className="overflow-hidden rounded-card border border-ink-700 bg-black shadow-xl">
            <video
              className="block h-auto w-full"
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster={asset('/video/anx-hero-poster.jpg')}
              aria-label="ידיות ANX3D מנקות ריפוד"
            >
              {/* Chrome and Firefox take the WebM; Safari falls to the MP4. */}
              <source src={asset('/video/anx-hero.webm')} type="video/webm" />
              <source src={asset('/video/anx-hero.mp4')} type="video/mp4" />
            </video>
          </div>
        </div>
      </div>
    </section>
  );
}
