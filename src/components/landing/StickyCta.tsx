import { PhoneIcon, WhatsAppIcon } from '@/components/icons';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import { site, whatsappLink } from '@/lib/site';

const message = whatsappLink('היי 🙂 מצרפ/ת תמונה של הספה — אשמח לקבל מחיר');

/**
 * Floating mobile CTA: one loud WhatsApp pill plus a round call button,
 * hovering over the page rather than walling off its bottom edge — content
 * stays visible around it and the page reserves just enough bottom padding.
 * The soft lp-pulse ring is the "notice me" that doesn't nag. Desktop hides
 * it; the hero and the form are always within reach there.
 */
export function StickyCta() {
  return (
    <div
      className="fixed inset-x-4 bottom-4 z-50 flex gap-3 sm:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <WhatsAppLink
        href={message}
        aria-label="שליחת תמונה בוואטסאפ לקבלת מחיר"
        className="lp-pulse flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-500 px-5 py-4 text-base font-extrabold text-white shadow-xl shadow-emerald-500/30 active:scale-[0.97]"
      >
        <WhatsAppIcon className="h-5 w-5 shrink-0" />
        📸 שלחו תמונה וקבלו מחיר
      </WhatsAppLink>
      <a
        href={`tel:+${site.whatsappNumber}`}
        aria-label={`התקשרו: ${site.phoneDisplay}`}
        className="flex h-14 w-14 shrink-0 items-center justify-center self-center rounded-full bg-brand-500 text-on-brand shadow-xl active:scale-[0.97]"
      >
        <PhoneIcon className="h-6 w-6" />
      </a>
    </div>
  );
}
