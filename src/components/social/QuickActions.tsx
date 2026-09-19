'use client';

import Link from 'next/link';
import { CalendarIcon, PlusIcon, SendIcon, SpinnerIcon, UsersIcon } from '@/components/icons';

/**
 * The four things the owner does on a normal morning, one tap each. Sits
 * directly under the stat tiles so the dashboard answers "what now?" without
 * a trip through the menu.
 *
 * Every label here names what the destination can actually do. Two of them
 * used not to: "תזמן סבב" ("schedule a round") went to a LIST of rounds,
 * which cannot schedule anything — from there the owner still had to open the
 * library, add a post, pick groups and set a time. And "פרסם עכשיו"
 * ("publish everything now") runs one worker tick over rows whose time has
 * already come, for Pages only; it neither publishes everything nor brings
 * anything forward. A label that promises more than the tap delivers is the
 * same defect as a number that is not in the database.
 */
export function QuickActions({ onRunNow, running }: { onRunNow: () => void; running: boolean }) {
  const tile =
    'flex flex-col items-center justify-center gap-1 rounded-tile border border-ink-700 bg-ink-850 px-2 py-3 text-center text-[11px] font-bold leading-tight text-mist-100 transition-[transform,box-shadow] active:scale-[0.98] hover:border-brand-300 sm:gap-1.5 sm:px-3 sm:py-4 sm:text-sm';
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-2.5 [&>*]:min-w-0">
      <Link href="/social/posts/new" className={tile}>
        <span aria-hidden className="grid h-8 w-8 place-items-center sm:h-9 sm:w-9 rounded-full bg-brand-300/12 text-brand-400">
          <PlusIcon className="h-5 w-5" strokeWidth={2.4} />
        </span>
        פוסט חדש
      </Link>
      <Link href="/social/groups" className={tile}>
        <span aria-hidden className="grid h-8 w-8 place-items-center sm:h-9 sm:w-9 rounded-full bg-brand-300/12 text-brand-400">
          <UsersIcon className="h-5 w-5" />
        </span>
        הוסף קבוצות
      </Link>
      <Link href="/social/campaigns" className={tile}>
        <span aria-hidden className="grid h-8 w-8 place-items-center sm:h-9 sm:w-9 rounded-full bg-brand-300/12 text-brand-400">
          <CalendarIcon className="h-5 w-5" />
        </span>
        סבבי פרסום
      </Link>
      <button type="button" onClick={onRunNow} disabled={running} className={`${tile} disabled:opacity-50`}>
        <span aria-hidden className="grid h-8 w-8 place-items-center sm:h-9 sm:w-9 rounded-full bg-success-400/12 text-success-400">
          {running ? <SpinnerIcon className="h-4.5 w-4.5 animate-spin" /> : <SendIcon className="h-4.5 w-4.5" />}
        </span>
        {running ? 'רץ…' : 'הרץ עכשיו'}
      </button>
    </div>
  );
}
