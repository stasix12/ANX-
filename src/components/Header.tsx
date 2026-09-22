'use client';

import Link from 'next/link';
import { useOrderList } from '@/components/OrderListProvider';
import { Wordmark } from '@/components/Wordmark';
import { CartIcon, PhoneIcon, WhatsAppIcon } from '@/components/icons';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import { orderItemCount } from '@/lib/order';
import { generalWhatsappLink, site } from '@/lib/site';

const iconButton =
  'relative grid h-11 w-11 place-items-center rounded-xl text-mist-100 transition-colors duration-200 hover:bg-ink-800';

/**
 * Slim white bar: contact on one side, the two-tone wordmark centred, the
 * order list ("cart") on the other.
 *
 * The cart is the store's order list — the same sheet the bottom bar opens —
 * so it is reachable from the top of any page, including on desktop where
 * nobody looks for a bar at the bottom of the window. Sending still happens
 * in WhatsApp; this only makes the list feel like a basket.
 */
export function Header() {
  const { lines, ready, setSheetOpen } = useOrderList();
  const count = ready ? orderItemCount(lines) : 0;

  return (
    <header className="sticky top-0 z-50 border-b pt-[env(safe-area-inset-top)] border-ink-700 bg-white/90 shadow-[0_1px_10px_rgb(0_0_0/0.03)] backdrop-blur-lg">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-3 sm:h-[72px] sm:px-6 lg:px-8">
        <div className="flex items-center gap-0.5 justify-self-start">
          <WhatsAppLink
            href={generalWhatsappLink}
            aria-label="שיחה בוואטסאפ"
            className={`${iconButton} hover:text-[#1a9e4f]`}
          >
            <WhatsAppIcon className="h-[22px] w-[22px]" />
          </WhatsAppLink>
          <a href={`tel:+${site.whatsappNumber}`} aria-label={`התקשרו ${site.phoneDisplay}`} className={iconButton}>
            <PhoneIcon className="h-[21px] w-[21px]" />
          </a>
        </div>

        <Link
          href="/"
          aria-label={`${site.name} — לעמוד הבית`}
          className="justify-self-center rounded-lg px-1 py-2 text-mist-100 transition-opacity duration-200 hover:opacity-75"
        >
          <Wordmark className="h-[18px] w-auto sm:h-[22px]" />
        </Link>

        <div className="justify-self-end">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={count > 0 ? `ההזמנה שלי — ${count} מוצרים` : 'ההזמנה שלי — ריקה'}
            className={iconButton}
          >
            <CartIcon className="h-[23px] w-[23px]" />
            {count > 0 ? (
              <span className="absolute top-1 end-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-500 px-1 text-[11px] leading-none font-extrabold text-on-brand tabular-nums">
                {count}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </header>
  );
}
