import { PhoneLink, WaLink } from '@/components/hamavrik/CtaLinks';
import { PhoneIcon, WhatsAppIcon } from '@/components/icons';
import { waLinkFor } from '@/lib/hamavrik/links';

/**
 * Mobile: a fixed two-button bar — [WhatsApp] [התקשר עכשיו] — always one
 * thumb away. Desktop: a single floating WhatsApp button, bottom-left,
 * that grows a label on hover. The page reserves bottom padding for the bar.
 */
export function StickyCta() {
  return (
    <>
      <div
        className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-800 bg-white/95 px-3 pt-2.5 backdrop-blur-lg sm:hidden"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.625rem)' }}
      >
        <div className="grid grid-cols-2 gap-2.5">
          <WaLink
            href={waLinkFor('(מהכפתור התחתון)')}
            location="sticky-mobile"
            className="shine-pulse flex items-center justify-center gap-2 rounded-full bg-wa-500 py-3.5 text-base font-extrabold text-white"
          >
            <WhatsAppIcon className="h-5 w-5" />
            WhatsApp
          </WaLink>
          <PhoneLink
            location="sticky-mobile"
            className="flex items-center justify-center gap-2 rounded-full bg-brand-500 py-3.5 text-base font-extrabold text-white"
          >
            <PhoneIcon className="h-5 w-5" />
            התקשר עכשיו
          </PhoneLink>
        </div>
      </div>

      <WaLink
        href={waLinkFor('(מהכפתור הצף)')}
        location="floating-desktop"
        aria-label="שליחת הודעה ב-WhatsApp"
        className="shine-pulse group fixed bottom-6 left-6 z-50 hidden h-16 items-center gap-3 rounded-full bg-wa-500 pe-5 ps-4 text-white shadow-2xl shadow-wa-500/40 transition-all hover:bg-wa-600 sm:flex"
      >
        <WhatsAppIcon className="h-8 w-8" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-base font-extrabold opacity-0 transition-all duration-300 group-hover:max-w-xs group-hover:opacity-100">
          שלחו תמונה, קבלו מחיר
        </span>
      </WaLink>
    </>
  );
}
