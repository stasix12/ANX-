import { PhoneLink, WaButton } from '@/components/hamavrik/CtaLinks';
import { Reveal } from '@/components/hamavrik/Reveal';
import { PhoneIcon } from '@/components/icons';
import { business } from '@/lib/hamavrik/config';
import { waLinkFor } from '@/lib/hamavrik/links';

/** The closing ask: one big green button and the phone number as a plain alternative. */
export function FinalCta() {
  return (
    <Reveal>
      <div className="relative">
        <span aria-hidden className="shine-glow" />
        <div className="surface rounded-[1.75rem] px-5 py-9 text-center sm:px-10 sm:py-12">
          <h2 className="mx-auto max-w-2xl text-[1.75rem] font-black leading-tight text-balance-he sm:text-4xl">
            רוצים לדעת כמה יעלה לנקות את הספה שלכם?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-mist-300 sm:text-lg">
            שלחו לנו תמונה ב-WhatsApp וקבלו הצעת מחיר מהירה.
          </p>
          <WaButton location="final-cta" href={waLinkFor('מצרפ/ת תמונה 📷')} size="lg" shimmer className="mt-6 w-full max-w-md sm:text-xl">
            שלחו תמונה וקבלו מחיר
          </WaButton>
          <p className="mt-4 text-sm font-bold text-mist-500">
            או חייגו:{' '}
            <PhoneLink location="final-cta" className="inline-flex items-center gap-1.5 text-xl font-black text-brand-400 hover:underline">
              <PhoneIcon className="h-5 w-5" />
              <span dir="ltr">{business.phoneDisplay}</span>
            </PhoneLink>
          </p>
        </div>
      </div>
    </Reveal>
  );
}
