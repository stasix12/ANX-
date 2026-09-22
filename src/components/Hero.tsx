import { HeroVideo } from '@/components/HeroVideo';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import { ArrowEndIcon, IsraelFlagIcon, WhatsAppIcon } from '@/components/icons';
import { generalWhatsappLink } from '@/lib/site';

/**
 * The top of the home page: what is sold and who it is for, next to the tool
 * actually working.
 *
 * Light and quiet on purpose — a near-white band, one black headline, one
 * short line and one orange button — so the product footage is the loudest
 * thing on the screen. Side by side from lg up; on a phone the words come
 * first and the footage right under them, both inside the first screen.
 */
export function Hero() {
  return (
    <section className="border-b border-ink-700 bg-ink-900">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 pt-8 pb-10 sm:px-6 sm:pt-12 sm:pb-14 lg:grid-cols-[1fr_1.15fr] lg:gap-14 lg:px-8 lg:py-20">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-bold text-brand-700">
            <IsraelFlagIcon className="h-3.5 w-[19px] shrink-0 rounded-[2px] ring-1 ring-ink-700" />
            ציוד מקצועי לניקוי ריפודים
          </p>

          <h1 className="mt-4 text-[32px] leading-[1.12] font-extrabold tracking-tight text-balance-he text-mist-100 sm:text-5xl lg:text-[56px]">
            ציוד שאיבה מקצועי למכונות Sabrina
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-mist-500 sm:text-lg">
            ידיות, צינורות ומתאמים שמיוצרים בישראל ועומדים בעבודת שטח יומיומית. ישירות מהיצרן.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <a
              href="#products"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-500 px-7 text-base font-bold text-on-brand transition-colors duration-200 hover:bg-brand-600 active:scale-[0.98] sm:h-13 sm:px-8"
            >
              צפייה במוצרים
              <ArrowEndIcon className="h-[18px] w-[18px]" />
            </a>
            <WhatsAppLink
              href={generalWhatsappLink}
              className="inline-flex h-12 items-center gap-2 rounded-xl px-1 text-sm font-bold text-mist-100 transition-colors duration-200 hover:text-[#1a9e4f]"
            >
              <WhatsAppIcon className="h-[18px] w-[18px]" />
              ייעוץ טכני בוואטסאפ
            </WhatsAppLink>
          </div>
        </div>

        <HeroVideo />
      </div>
    </section>
  );
}
