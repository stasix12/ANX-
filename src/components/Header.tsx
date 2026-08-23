import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';
import { PhoneIcon, WhatsAppIcon } from '@/components/icons';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import { generalWhatsappLink, site } from '@/lib/site';

/**
 * Wordmark centred, with one bare action icon on each side.
 *
 * Chosen over two other centred layouts that were built and compared:
 *
 *   - A stacked version, wordmark alone above a contact strip carrying the
 *     phone number as text, looked the most like a brand — and stood 94px tall
 *     against this one's 65px. The header is sticky and the order bar is fixed
 *     to the bottom, so that is a permanent bite out of a phone screen.
 *   - A version with a filled green order button in the header. Every product
 *     card already carries a green order button and the bottom bar is another;
 *     a fourth stops any of them meaning much.
 *
 * Equal weight on both sides is what makes the wordmark read as centred rather
 * than merely positioned there. There is no search, account or cart: this shop
 * has no search index, no accounts and no basket — ordering goes through
 * WhatsApp — so those would be buttons that do nothing.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-700 bg-ink-850/90 backdrop-blur-lg">
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-3 items-center px-4 sm:h-[72px] sm:px-6">
        <div className="justify-self-start">
          <WhatsAppLink
            href={generalWhatsappLink}
            aria-label="הזמנה בוואטסאפ"
            className="grid h-10 w-10 place-items-center rounded-lg text-mist-100 transition-colors duration-200 hover:text-[#25D366]"
          >
            <WhatsAppIcon className="h-[22px] w-[22px]" />
          </WhatsAppLink>
        </div>

        <Link
          href="/"
          aria-label={`${site.name} — לעמוד הבית`}
          className="justify-self-center rounded-lg text-mist-100 transition-opacity duration-200 hover:opacity-70"
        >
          <Wordmark className="h-5 w-auto sm:h-6" />
        </Link>

        <div className="justify-self-end">
          <a
            href={`tel:+${site.whatsappNumber}`}
            aria-label={`התקשרו ${site.phoneDisplay}`}
            className="grid h-10 w-10 place-items-center rounded-lg text-mist-100 transition-colors duration-200 hover:text-brand-600"
          >
            <PhoneIcon className="h-[22px] w-[22px]" />
          </a>
        </div>
      </div>
    </header>
  );
}
