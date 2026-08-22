import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';
import { PhoneIcon, WhatsAppIcon } from '@/components/icons';
import { generalWhatsappLink, site } from '@/lib/site';

/**
 * Wordmark on one side, bare outline action icons on the other, over a plain
 * white bar with a hairline rule.
 *
 * The reference this follows also carries search, account and cart icons.
 * They are left out on purpose: this shop has no search index, no accounts and
 * no cart — ordering goes through WhatsApp — so those would be buttons that
 * do nothing. The two here are the actions that actually exist.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-700 bg-white/90 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:h-[72px] sm:px-6">
        <Link
          href="/"
          aria-label={`${site.name} — לעמוד הבית`}
          className="rounded-lg text-mist-100 transition-opacity duration-200 hover:opacity-70"
        >
          <Wordmark className="h-5 w-auto sm:h-6" />
        </Link>

        <div className="flex items-center gap-1">
          <a
            href={`tel:+${site.whatsappNumber}`}
            aria-label={`התקשרו ${site.phoneDisplay}`}
            className="grid h-10 w-10 place-items-center rounded-lg text-mist-100 transition-colors duration-200 hover:text-brand-600"
          >
            <PhoneIcon className="h-[22px] w-[22px]" />
          </a>
          <a
            href={generalWhatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="הזמנה בוואטסאפ"
            className="grid h-10 w-10 place-items-center rounded-lg text-mist-100 transition-colors duration-200 hover:text-[#25D366]"
          >
            <WhatsAppIcon className="h-[22px] w-[22px]" />
          </a>
        </div>
      </div>
    </header>
  );
}
