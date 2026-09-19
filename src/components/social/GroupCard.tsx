'use client';

import Link from 'next/link';
import { formatDayMonthHe } from '@/lib/social/time';
import type { SocialTarget } from '@/lib/social/types';
import { TargetAvatar } from './TargetAvatar';
import { Badge, OverflowMenu, type MenuAction } from './ui';

/**
 * A group, reduced to what identifies it: picture, name, where it belongs,
 * whether it is on, and when it last published. Everything else — pause,
 * favourite, category, history, remove — lives behind the "⋯", because a
 * hundred cards each carrying six controls is a wall, not a list.
 *
 * The whole tile is a link to the group's profile; the checkbox, the star
 * and the menu stop the event so they never navigate by accident.
 */
export function GroupCard({
  group,
  selected,
  onSelect,
  onToggleFavorite,
  actions,
  nextAt,
}: {
  group: SocialTarget;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onToggleFavorite: () => void;
  actions: MenuAction[];
  nextAt?: string;
}) {
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <li className="relative">
      <Link
        href={`/social/groups/${group.id}`}
        className={`surface flex h-full flex-col items-center rounded-tile border p-3 pt-8 text-center transition-[border-color,transform] active:scale-[0.98] ${
          selected ? 'border-brand-300 bg-brand-300/8' : 'border-ink-700'
        } ${group.enabled ? '' : 'opacity-55'}`}
      >
        <TargetAvatar name={group.name} imageUrl={group.image_url} channel={group.channel} size={72} />
        <p dir="auto" className="mt-2 line-clamp-2 w-full text-sm font-bold leading-tight text-mist-100" title={group.name}>
          {group.name}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
          {group.city && <Badge tone="neutral"><span dir="auto" className="block max-w-[6.5rem] truncate">{group.city}</span></Badge>}
          {group.category && <Badge tone="brand"><span dir="auto" className="block max-w-[6.5rem] truncate">{group.category}</span></Badge>}
        </div>
        <p className="mt-1.5 text-[11px] leading-tight text-mist-500">
          {!group.last_synced_at
            ? 'מושך פרטים…'
            : group.last_published_at
              ? `פורסם ${formatDayMonthHe(group.last_published_at)}`
              : 'טרם פורסם'}
        </p>
        {nextAt && <p className="text-[11px] font-bold leading-tight text-brand-400">הבא: {formatDayMonthHe(nextAt)}</p>}
      </Link>

      {/* Controls float above the link so the tile stays one big target. */}
      <div className="absolute start-2 top-2 flex items-center gap-1">
        <span
          aria-hidden
          title={group.enabled ? 'פעילה' : 'מושהית'}
          className={`block h-2.5 w-2.5 rounded-full ${group.enabled ? 'bg-success-400' : 'bg-mist-500'}`}
        />
        <button
          type="button"
          aria-label={group.favorite ? `הסר את ${group.name} מהמועדפות` : `הוסף את ${group.name} למועדפות`}
          onClick={(e) => {
            stop(e);
            onToggleFavorite();
          }}
          className="grid h-11 w-11 place-items-center text-sm leading-none"
        >
          {group.favorite ? '⭐' : '☆'}
        </button>
      </div>

      <label
        className={`absolute end-12 top-1 grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-ink-950/70 ring-1 backdrop-blur-sm ${
          selected ? 'ring-brand-300' : 'ring-ink-600'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          aria-label={`בחר את ${group.name}`}
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="h-5 w-5 accent-brand-300"
        />
      </label>

      <div className="absolute end-1 top-1" onClick={stop}>
        <OverflowMenu label={group.name} actions={actions} />
      </div>
    </li>
  );
}
