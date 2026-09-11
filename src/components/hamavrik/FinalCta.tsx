import { PhoneLink, WaButton } from '@/components/hamavrik/CtaLinks';
import { Reveal } from '@/components/hamavrik/Reveal';
import { PhoneIcon } from '@/components/icons';
import { business } from '@/lib/hamavrik/config';
import { waLinkFor } from '@/lib/hamavrik/links';

/** The closing ask: one huge WhatsApp button and the phone number in full. */
export function FinalCta() {
  return (
    <Reveal>
      <div className="relative">
        <span aria-hidden className="shine-glow" />
        <div className="surface rounded-[2rem] px-5 py-12 text-center sm:px-10 sm:py-16">
          <h2 className="mx-auto max-w-2xl text-3xl font-black leading-tight text-balance-he sm:text-4xl lg:text-5xl">
            רוצים לדעת כמה יעלה להחזיר לספה את המראה הנקי?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-mist-300">
            שלחו לנו תמונה ב-WhatsApp ונחזור אליכם עם הצעת מחיר.
          </p>
          <WaButton
            location="final-cta"
            href={waLinkFor('מצרפ/ת תמונה 📷')}
            size="xl"
            shimmer
            className="mt-8 w-full max-w-md sm:text-2xl"
          >
            שליחת תמונה ב-WhatsApp
          </WaButton>
          <p className="mt-6 text-sm font-bold text-mist-500">או התקשרו:</p>
          <PhoneLink
            location="final-cta"
            className="mt-1 inline-flex items-center gap-2 text-3xl font-black text-brand-400 hover:underline sm:text-4xl"
          >
            <PhoneIcon className="h-7 w-7" />
            <span dir="ltr">{business.phoneDisplay}</span>
          </PhoneLink>
        </div>
      </div>
    </Reveal>
  );
}
