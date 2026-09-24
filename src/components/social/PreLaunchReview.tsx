'use client';

import { Stamp } from './DateTime';
import { counted } from '@/lib/social/time';
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
  const groups = targets;
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
            התחל פרסום
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

        <Row label="סבב">{campaignName || 'ללא סבב'}</Row>
        <Row label="פוסט">{postTitle || 'ללא כותרת'}</Row>

        <section>
          <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-mist-500">הטקסט שיוצא</p>
          <div className="flex gap-2.5 rounded-xl border border-ink-700 bg-ink-900 p-3">
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
{/* One line, because there is one kind of target and one way it goes
              out. The row used to be two badges splitting the launch into
              Pages via the API and groups via the browser. */}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {groups.length > 0 && (
              <Badge tone="info">
                {counted(groups.length, 'קבוצה אחת', 'קבוצות', 'שתי קבוצות')} · <MethodBadge method="browser" />
              </Badge>
            )}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {targets.slice(0, 12).map((t) => (
              <li key={t.id} className="flex items-center gap-1.5 rounded-full bg-ink-800 py-1 pe-2.5 ps-1">
                <TargetAvatar name={t.name} imageUrl={t.image_url} channel={t.channel} size={22} />
                <span dir="auto" className="max-w-32 truncate text-xs font-bold text-mist-100">{t.name}</span>
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
              {/* This used to say quotas "עשויים לדחות" — may POSTPONE —
                  publications. They do not. rules.ts returns {action:'skip'}
                  on maxPerDay, maxPerTargetPerDay and maxPerCampaignPerDay:
                  the row is finished permanently and never runs. Only the
                  minimum-gap rule defers. Telling the owner their work would
                  be postponed when it is in fact discarded is the difference
                  between a delay and 16 groups that never hear from them. */}
              סיום משוער: <strong className="text-mist-300"><Stamp iso={plan.lastAt} /></strong> — לפי המרווח שהגדרתם. המרווח בין
              פרסומים עשוי לדחות פרסומים ולהאריך את הטווח; חריגה מהמכסות שהגדרתם בהגדרות נדחית ליום הראשון שיש בו מקום.
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
      <span dir="auto" className="min-w-0 truncate text-sm font-bold text-mist-100">
        {children}
      </span>
    </div>
  );
}
