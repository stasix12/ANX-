'use client';

import { formatDateTimeHe } from '@/lib/social/time';
import type { MediaItem, SocialTarget } from '@/lib/social/types';
import { SchedulePlanPreview, type SchedulePlan } from './SchedulePicker';
import { TargetAvatar } from './TargetAvatar';
import { Badge, Button, MethodBadge, Notice, Sheet } from './ui';

/**
 * The last screen before anything goes out. Starting a campaign across a
 * hundred groups is not undoable in any practical sense, so the owner sees
 * exactly what they are about to do — the text, the media, who receives it,
 * when, and by which method — and confirms once.
 *
 * Every figure comes from the same plan the planner will materialise; this
 * is a summary of the real thing, not a mock-up of it.
 */
export function PreLaunchReview({
  open,
  onClose,
  onStart,
  busy,
  campaignName,
  postTitle,
  text,
  media,
  targets,
  plan,
  warnings = [],
  requireConfirmation,
}: {
  open: boolean;
  onClose: () => void;
  onStart: () => void;
  busy: boolean;
  campaignName: string;
  postTitle: string;
  text: string;
  media: MediaItem[];
  targets: SocialTarget[];
  plan: SchedulePlan;
  warnings?: string[];
  requireConfirmation: boolean;
}) {
  const pages = targets.filter((t) => t.channel === 'facebook_page');
  const groups = targets.filter((t) => t.channel !== 'facebook_page');
  const cover = media.find((m) => m.kind === 'image');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="לפני שמתחילים"
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button size="lg" className="grow" busy={busy} onClick={onStart} disabled={!targets.length}>
            🚀 התחל פרסום
          </Button>
          <Button size="lg" variant="secondary" onClick={onClose}>
            חזור
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {warnings.map((w) => (
          <Notice key={w} tone="warn">
            {w}
          </Notice>
        ))}

        <Row label="קמפיין">{campaignName || 'ללא קמפיין'}</Row>
        <Row label="פוסט">{postTitle || 'ללא כותרת'}</Row>

        <section>
          <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-mist-500">הטקסט שיוצא</p>
          <div className="flex gap-2.5 rounded-xl border border-ink-600 bg-ink-900 p-3">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover.url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            )}
            <p dir="auto" className="max-h-40 min-w-0 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-mist-100">
              {text || '(ריק — ייצא רק מדיה)'}
            </p>
          </div>
          {media.length > 0 && (
            <p className="mt-1 text-[11px] text-mist-500">
              {media.filter((m) => m.kind === 'image').length} תמונות · {media.filter((m) => m.kind === 'video').length} סרטונים
            </p>
          )}
        </section>

        <section>
          <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-mist-500">יעדים ({targets.length})</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pages.length > 0 && (
              <Badge tone="good">
                {pages.length} דפים · <MethodBadge method="api" />
              </Badge>
            )}
            {groups.length > 0 && (
              <Badge tone="info">
                {groups.length} קבוצות · <MethodBadge method="browser" />
              </Badge>
            )}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {targets.slice(0, 12).map((t) => (
              <li key={t.id} className="flex items-center gap-1.5 rounded-full bg-ink-800 py-1 pe-2.5 ps-1">
                <TargetAvatar name={t.name} imageUrl={t.image_url} channel={t.channel} size={22} />
                <span className="max-w-32 truncate text-xs font-bold text-mist-100">{t.name}</span>
              </li>
            ))}
            {targets.length > 12 && <li className="self-center text-xs font-bold text-mist-500">ועוד {targets.length - 12}</li>}
          </ul>
        </section>

        <section>
          <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-mist-500">התזמון</p>
          <SchedulePlanPreview plan={plan} names={targets.map((t) => t.name)} />
          {plan.lastAt && (
            <p className="mt-1.5 text-xs text-mist-500">
              סיום משוער: <strong className="text-mist-300">{formatDateTimeHe(plan.lastAt)}</strong> — לפי המרווח שהגדרתם. מכסות ומרווחים
              בהגדרות עשויים לדחות פרסומים ולהאריך את הטווח.
            </p>
          )}
        </section>

        <Notice tone="info">
          דפים מתפרסמים דרך Graph API הרשמי של Meta. קבוצות מתפרסמות דרך חלון Chrome אמיתי על המחשב שלכם — זו אינה אינטגרציה רשמית של
          פייסבוק, והשימוש בה באחריותכם.
          {requireConfirmation && ' לפני כל לחיצת "פרסום" בקבוצה, המערכת תעצור ותחכה לאישור שלכם.'}
        </Notice>
      </div>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-700 pb-2">
      <span className="text-xs font-bold text-mist-500">{label}</span>
      <span className="min-w-0 truncate text-sm font-bold text-mist-100">{children}</span>
    </div>
  );
}
