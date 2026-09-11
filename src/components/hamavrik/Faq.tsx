import { ChevronDownIcon } from '@/components/icons';
import { faq } from '@/lib/hamavrik/config';

/**
 * Native <details> accordion: zero JavaScript, keyboard accessible, and the
 * answers are in the HTML for crawlers (matching the FAQPage JSON-LD).
 */
export function Faq({ items = faq }: { items?: readonly { q: string; a: string }[] }) {
  return (
    <div className="shine-faq mx-auto max-w-3xl space-y-2.5">
      {items.map((item, i) => (
        <details
          key={item.q}
          open={i === 0}
          className="surface group rounded-2xl transition-shadow open:shadow-[0_2px_4px_rgba(11,26,51,0.06),0_20px_40px_-20px_rgba(11,26,51,0.25)]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 text-start text-[15px] font-extrabold sm:px-5 sm:text-lg [&::-webkit-details-marker]:hidden">
            <span>{item.q}</span>
            <span className="shine-faq-chevron grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-900 text-brand-500 transition-transform duration-300">
              <ChevronDownIcon className="h-5 w-5" />
            </span>
          </summary>
          <div className="px-4 pb-4 sm:px-5">
            <p className="text-[15px] leading-relaxed text-mist-300">{item.a}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
