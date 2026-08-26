import { PhoneIcon, WhatsAppIcon } from '@/components/icons';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import { site, whatsappLink } from '@/lib/site';

const message = whatsappLink('היי, אשמח להצעת מחיר לניקוי ספה 🛋️');

/**
 * Fixed call/WhatsApp bar. On a phone — where nearly all ad traffic lands —
 * the two actions that close a lead stay under the thumb through the whole
 * scroll; on desktop the hero and the form are always in reach, so it hides.
 */
export function StickyCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-700 bg-ink-850/95 p-3 backdrop-blur sm:hidden">
      <div className="mx-auto flex max-w-md gap-3">
        <a
          href={`tel:+${site.whatsappNumber}`}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3.5 font-extrabold text-on-brand active:scale-[0.98]"
        >
          <PhoneIcon className="h-5 w-5" />
          התקשרו עכשיו
        </a>
        <WhatsAppLink
          href={message}
          aria-label="שליחת הודעת וואטסאפ"
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 font-extrabold text-white active:scale-[0.98]"
        >
          <WhatsAppIcon className="h-5 w-5" />
          וואטסאפ
        </WhatsAppLink>
      </div>
    </div>
  );
}
