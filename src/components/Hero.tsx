import Image from 'next/image';
import Link from 'next/link';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { TruckIcon } from '@/components/icons';
import { site } from '@/lib/site';

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/*
        Kept faint rather than masked behind a directional scrim: object-cover
        crops this differently at every viewport width, so a fixed gradient
        can line up with the headline on one screen and miss it on the next.
        Low opacity reads as a watermark everywhere the crop lands, so the
        dark navy headline always stays clear of the linework beneath it.
        Placeholder artwork — replace public/hero/machine.svg with a real photo.
      */}
      <Image
        src="/hero/machine.svg"
        alt="מכונת ניקוי אקסטרקציה מקצועית בסגנון תעשייתי"
        fill
        priority
        sizes="100vw"
        className="hero-fade -z-10 object-cover object-[center_78%] opacity-30 sm:object-center"
      />
      <div
        aria-hidden
        className="absolute -top-40 start-1/4 -z-10 h-[26rem] w-[26rem] rounded-full bg-brand-400/35 blur-3xl animate-glow"
      />

      <div className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:pt-28 lg:pb-32">
        <div className="max-w-2xl animate-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold tracking-[0.14em] text-brand-700 uppercase">
            {site.tagline}
          </p>

          <h1 className="mt-6 text-4xl leading-[1.12] font-extrabold tracking-tight text-balance-he sm:text-5xl lg:text-6xl">
            משדרגים את ה-<span className="text-brand-600">Sabrina</span> שלך.
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist-300 sm:text-xl">
            ידיות שאיבה, צינורות ומתאמים שפותחו עבור אנשי מקצוע.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="#products"
              className="inline-flex items-center justify-center rounded-full bg-brand-500 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-brand-700/35 transition-colors duration-200 hover:bg-brand-400"
            >
              לצפייה במוצרים
            </Link>
            <WhatsAppButton size="lg" label="הזמנה ב-WhatsApp" />
          </div>

          <p className="mt-8 flex items-center gap-2.5 text-sm font-medium text-mist-500">
            <TruckIcon className="h-5 w-5 shrink-0 text-brand-600" />
            <span>
              {site.shippingNote} · הזמנות בוואטסאפ{' '}
              <span dir="ltr" className="whitespace-nowrap">
                {site.phoneDisplay}
              </span>
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
