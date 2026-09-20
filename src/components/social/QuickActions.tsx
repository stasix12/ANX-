'use client';

import Link from 'next/link';
import { ClipboardListIcon, GearIcon, TargetIcon, UsersIcon } from '@/components/icons';

/**
 * Four taps, compact, under the answers rather than instead of them.
 *
 * Every label here names what the destination can actually do, and every
 * destination exists. The owner's reference mockup lists
 * statistics / groups / library / settings — and there is no /social/stats in
 * this product (it returns 404, verified).
 *
 * The first tile was היסטוריה, which made four links to /social/history from
 * one dashboard: two card actions, the bottom-nav tab, and this. A shortcut
 * row is worth its quarter of the screen only for somewhere you cannot
 * already get to, so it now points at דפי פייסבוק — the screen that holds the
 * Facebook connection, the granted permissions and the page sync, and the one
 * place on this dashboard's map that was reachable only by opening "עוד" and
 * reading a list. Same name the bottom sheet and the shell nav use for it.
 *
 * Two tiles left this row:
 *   - "פוסט חדש" is the system card's primary button now. A third copy here
 *     (it was also in the page header and in the "עוד" sheet) spent a quarter
 *     of the row on the least frequent task in this business.
 *   - "הרץ עכשיו" moved onto the system card, and only appears there when a
 *     row is actually due. It runs one worker tick over rows whose time has
 *     ALREADY come, for Pages only; as a permanent tile it was a button that
 *     did nothing for 99% of the day.
 */
export function QuickActions() {
  const tile =
    'flex min-h-16 flex-col items-center justify-center gap-1 rounded-tile border border-ink-700 bg-ink-850 px-1 py-2 text-center text-[11px] font-bold leading-[13px] text-mist-100 transition-[transform,box-shadow] duration-150 active:scale-[0.98] hover:border-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 sm:gap-1.5 sm:px-3 sm:py-3 sm:text-sm';
  const puck = 'grid h-7 w-7 place-items-center rounded-full bg-brand-300/12 text-brand-400 sm:h-9 sm:w-9';
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-2.5 [&>*]:min-w-0">
      <Link href="/social/targets" className={tile}>
        <span aria-hidden className={puck}>
          <TargetIcon className="h-4.5 w-4.5" />
        </span>
        דפי פייסבוק
      </Link>
      <Link href="/social/groups" className={tile}>
        <span aria-hidden className={puck}>
          <UsersIcon className="h-4.5 w-4.5" />
        </span>
        קבוצות
      </Link>
      {/* "ספרייה", not "ספריית תוכן": at text-[11px] in a 79px tile the longer
          label wraps to two lines and breaks the row's height parity. */}
      <Link href="/social/library" className={tile}>
        <span aria-hidden className={puck}>
          <ClipboardListIcon className="h-4.5 w-4.5" />
        </span>
        ספרייה
      </Link>
      <Link href="/social/settings" className={tile}>
        <span aria-hidden className={puck}>
          <GearIcon className="h-4.5 w-4.5" />
        </span>
        הגדרות
      </Link>
    </div>
  );
}
