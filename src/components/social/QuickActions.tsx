'use client';

import Link from 'next/link';
import { CalendarIcon, PlusIcon, UsersIcon } from '@/components/icons';

/**
 * The four things the owner does on a normal morning, one tap each. Sits
 * directly under the stat tiles so the dashboard answers "what now?" without
 * a trip through the menu.
 */
export function QuickActions({ onRunNow, running }: { onRunNow: () => void; running: boolean }) {
  const tile =
    'flex flex-col items-center justify-center gap-1 rounded-2xl border border-ink-600 bg-ink-850 px-2 py-3 text-center text-[11px] font-bold leading-tight text-mist-100 transition-[transform,box-shadow] active:scale-[0.98] hover:border-brand-500 sm:gap-1.5 sm:px-3 sm:py-4 sm:text-sm';
  return (
    <div className="grid grid-cols-4 gap-2 sm:gap-2.5 [&>*]:min-w-0">
      <Link href="/social/posts/new" className={tile}>
        <span aria-hidden className="grid h-8 w-8 place-items-center sm:h-9 sm:w-9 rounded-full bg-brand-500/10 text-brand-400">
          <PlusIcon className="h-5 w-5" strokeWidth={2.4} />
        </span>
        פוסט חדש
      </Link>
      <Link href="/social/groups" className={tile}>
        <span aria-hidden className="grid h-8 w-8 place-items-center sm:h-9 sm:w-9 rounded-full bg-sky-500/10 text-sky-700">
          <UsersIcon className="h-5 w-5" />
        </span>
        הוסף קבוצות
      </Link>
      <Link href="/social/campaigns" className={tile}>
        <span aria-hidden className="grid h-8 w-8 place-items-center sm:h-9 sm:w-9 rounded-full bg-violet-500/10 text-violet-700">
          <CalendarIcon className="h-5 w-5" />
        </span>
        תזמן קמפיין
      </Link>
      <button type="button" onClick={onRunNow} disabled={running} className={`${tile} disabled:opacity-60`}>
        <span aria-hidden className="grid h-8 w-8 place-items-center sm:h-9 sm:w-9 rounded-full bg-emerald-500/10 text-emerald-700">
          {running ? '⏳' : '🚀'}
        </span>
        {running ? 'רץ…' : 'פרסם עכשיו'}
      </button>
    </div>
  );
}
