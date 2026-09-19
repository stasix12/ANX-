'use client';

import { TargetAvatar } from '@/components/social/TargetAvatar';
import { AlertTriangleIcon, CheckCircleIcon, ClockIcon, SendIcon, UsersIcon } from '@/components/icons';
import { Badge, Button, ButtonLink, CARD } from '@/components/social/ui';
import { friendlyMessage } from '@/lib/social/errors';
import { formatDayMonthHe } from '@/lib/social/time';
import type { DiscoveredGroup, Membership } from '@/lib/social/discovery';

const MEMBERSHIP_LABEL: Record<Membership, string> = {
  MEMBER: 'אני חבר',
  JOIN_REQUEST_SENT: 'בקשה נשלחה',
  NOT_MEMBER: 'לא חבר',
  REJECTED: 'הבקשה נדחתה',
  UNKNOWN: 'לא ידוע',
};

const MEMBERSHIP_TONE: Record<Membership, 'good' | 'warn' | 'neutral' | 'bad' | 'info'> = {
  MEMBER: 'good',
  JOIN_REQUEST_SENT: 'warn',
  NOT_MEMBER: 'neutral',
  REJECTED: 'bad',
  UNKNOWN: 'info',
};

/**
 * One discovered group.
 *
 * Every figure on it is read from the database: the member count and the
 * public/private badge appear only when the worker actually read them off the
 * page, and are simply absent otherwise — there is no placeholder standing in
 * for a number nobody has.
 *
 * The join button opens Facebook. It does not join: there is no API for that,
 * and the card says so instead of implying otherwise.
 */
export function DiscoveryGroupCard({
  group,
  selected,
  onSelect,
  onMark,
  onPromote,
  onIgnore,
  onEnrich,
  busyKey,
}: {
  group: DiscoveredGroup;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onMark: (membership: Membership) => void;
  onPromote: () => void;
  onIgnore: () => void;
  onEnrich: () => void;
  /** The action currently running on this card, or null. */
  busyKey: string | null;
}) {
  const title = group.name || group.fbGroupId || 'קבוצה';
  const isMember = group.membership === 'MEMBER';
  const inLibrary = Boolean(group.targetId);

  return (
    <li className={`${CARD} flex min-w-0 flex-col gap-2.5 p-3`}>
      <div className="flex min-w-0 items-start gap-2.5">
        <input
          type="checkbox"
          aria-label={`בחר את ${title}`}
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-brand-500"
        />
        <TargetAvatar name={title} imageUrl={group.imageUrl} size={44} />
        <div className="min-w-0 grow">
          <p dir="auto" className="truncate text-sm font-bold text-mist-100">
            {title}
          </p>
          {!group.name && <p className="mt-0.5 text-[11px] text-mist-500">השם עוד לא נקרא מפייסבוק.</p>}
          <p dir="auto" className="mt-0.5 truncate text-[11px] text-mist-500">
            {group.city || 'עיר לא ידועה'}
            {group.category ? ` · ${group.category}` : ''} · נמצאה {formatDayMonthHe(group.discoveredAt)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={MEMBERSHIP_TONE[group.membership]}>{MEMBERSHIP_LABEL[group.membership]}</Badge>
        {inLibrary && <Badge tone="brand">כבר במאגר</Badge>}
        {group.privacy === 'public' && <Badge tone="neutral">ציבורית</Badge>}
        {group.privacy === 'private' && <Badge tone="neutral">פרטית</Badge>}
        {typeof group.membersCount === 'number' && (
          <Badge tone="neutral">
            <UsersIcon className="h-3 w-3" />
            <span dir="ltr" className="tabular-nums">
              {group.membersCount.toLocaleString('he-IL')}
            </span>
            חברים
          </Badge>
        )}
        {group.enrichState === 'queued' && (
          <Badge tone="info">
            <ClockIcon className="h-3 w-3" />
            בתור לבדיקה
          </Badge>
        )}
      </div>

      {/* last_error carries two different things and BOTH must reach the owner.
          On a failed read it is the reason the read failed. On a SUCCESSFUL read
          it is a finding the worker recorded but deliberately did not apply:
          the page contradicted the membership the owner set by hand (the owner
          always wins — see rule D), or the group turned out to be a duplicate of
          another row and was hidden. Showing it only on 'failed' meant the
          worker wrote those sentences into a column nothing ever rendered, and a
          group could be auto-hidden with no explanation anywhere. */}
      {group.enrichState === 'failed' && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-rose-700">
          <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {friendlyMessage(group.lastError, 'בדיקת הקבוצה לא הצליחה. אפשר לנסות שוב.')}
        </p>
      )}
      {group.enrichState !== 'failed' && group.lastError && (
        <p dir="auto" className="flex items-start gap-1.5 text-[11px] leading-snug text-orange-700">
          <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {friendlyMessage(group.lastError, 'הבדיקה מצאה משהו שלא מסתדר עם הסימון שלכם.')}
        </p>
      )}
      {group.enrichState === 'done' && group.lastCheckedAt && (
        <p className="text-[11px] text-mist-500">נבדק {formatDayMonthHe(group.lastCheckedAt)}</p>
      )}

      <div className="mt-auto space-y-1.5">
        <ButtonLink
          href={group.url}
          target="_blank"
          rel="noreferrer"
          size="sm"
          variant={isMember ? 'secondary' : 'primary'}
          className="w-full"
        >
          <SendIcon className="h-4 w-4" />
          {isMember ? 'פתח בפייסבוק' : 'פתח והצטרפו בפייסבוק'}
        </ButtonLink>

        {!isMember && (
          <div className="flex min-w-0 gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="grow"
              busy={busyKey === 'request'}
              onClick={() => onMark('JOIN_REQUEST_SENT')}
            >
              שלחתי בקשה
            </Button>
            <Button size="sm" variant="secondary" className="grow" busy={busyKey === 'member'} onClick={() => onMark('MEMBER')}>
              <CheckCircleIcon className="h-4 w-4" />
              אני חבר
            </Button>
          </div>
        )}

        {isMember && !inLibrary && (
          <Button size="sm" className="w-full" busy={busyKey === 'promote'} onClick={onPromote}>
            הוסף למאגר הפרסום
          </Button>
        )}
        {isMember && inLibrary && (
          <ButtonLink href="/social/groups" size="sm" variant="secondary" className="w-full">
            הקבוצה במאגר — פתח
          </ButtonLink>
        )}
        {!isMember && (
          <p className="text-[11px] leading-snug text-mist-500">
            אפשר להוסיף למאגר הפרסום רק קבוצה שסימנתם שאתם חברים בה.
          </p>
        )}

        <div className="flex min-w-0 gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="grow"
            busy={busyKey === 'enrich'}
            disabled={group.enrichState === 'queued'}
            onClick={onEnrich}
          >
            בדוק סטטוס
          </Button>
          <Button size="sm" variant="ghost" className="grow" busy={busyKey === 'ignore'} onClick={onIgnore}>
            {group.ignored ? 'החזר לרשימה' : 'התעלם'}
          </Button>
        </div>
      </div>
    </li>
  );
}
