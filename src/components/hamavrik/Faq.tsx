import { PhoneLink } from '@/components/hamavrik/CtaLinks';
import { ChevronDownIcon } from '@/components/icons';
import { business, faq } from '@/lib/hamavrik/config';

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * Swaps in the questions a landing page answers differently – a mattress page
 * should not open with "how much does cleaning a SOFA cost". Anything not
 * overridden falls through to the shared list, so nothing silently disappears.
 */
export function faqFor(overrides?: { q: string; a: string; replaces: string }[]): FaqItem[] {
  if (!overrides?.length) return faq.map((item) => ({ ...item }));
  return faq.map((item) => {
    const swap = overrides.find((o) => o.replaces === item.q);
    return swap ? { q: swap.q, a: swap.a } : { ...item };
  });
}

/** Renders the phone number inside an answer as a real tel: link – on a phone,
 *  a number you cannot tap is a number you do not call. */
function answer(text: string) {
  const parts = text.split(business.phoneDisplay);
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <PhoneLink key={i} location="faq" className="font-bold text-brand-400 hover:underline">
            <span dir="ltr">{business.phoneDisplay}</span>
          </PhoneLink>,
          part,
        ],
  );
}

/**
 * Native <details> accordion: zero JavaScript, keyboard accessible, and the
 * answers are in the HTML for crawlers (matching the FAQPage JSON-LD).
 *
 * Every panel starts closed. The price question leads because it is the
 * question people arrive with – but by the time anyone reaches the FAQ the
 * price has already been stated in the hero, the price list and the form, so
 * opening it by default would cost 180px to repeat what they know and push the
 * question that actually blocks the deal ("will my stain come out") down.
 */
export function Faq({ items = faq as readonly FaqItem[] }: { items?: readonly FaqItem[] }) {
  return (
    <div className="shine-faq mx-auto max-w-3xl space-y-2.5">
      {items.map((item) => (
        <details
          key={item.q}
          className="surface group rounded-2xl transition-shadow open:shadow-[0_2px_4px_rgba(11,26,51,0.06),0_20px_40px_-20px_rgba(11,26,51,0.25)]"
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 text-start text-[15px] font-extrabold sm:px-5 sm:text-lg [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <span className="shine-faq-chevron grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-900 text-brand-500 transition-transform duration-300">
              <ChevronDownIcon className="h-5 w-5" />
            </span>
          </summary>
          <div className="px-4 pb-4 sm:px-5">
            <p className="text-[15px] leading-relaxed text-mist-300">{answer(item.a)}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
