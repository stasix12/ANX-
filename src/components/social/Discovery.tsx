'use client';

import { useEffect, useRef } from 'react';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import { Badge, Button, ButtonLink, CARD_ELEVATED } from '@/components/social/ui';
import { MEMBERSHIP_SHORT, PRIVACY_LABEL, membersText, type Membership } from '@/lib/social/discovery';
import type { DiscoveredGroupRow } from '@/lib/social/types';
import { CheckIcon, CloseIcon } from '@/components/icons';

/*
 * THE PARTS OF גילוי קבוצות THAT ARE WORTH MEASURING.
 *
 * Their own file rather than locals inside the page, for the reason
 * worker/test/render-card.tsx gives about the campaign card: the row's height
 * and its tap targets are claims about pixels, and the only way to check a
 * claim about pixels is to render the REAL component with the real compiled
 * stylesheet. A copy of it written inside a test measures the copy, and a copy
 * is exactly what stops failing when the component changes.
 *
 * worker/test/discovery-row.test.ts renders these at 360, 390 and 430 with
 * Hebrew, Russian and English names in the same list.
 */

/** The tone each membership is drawn in — the product's own four, unchanged. */
const MEMBERSHIP_TONE: Record<Membership, 'good' | 'warn' | 'brand' | 'neutral'> = {
  member: 'good',
  requested: 'warn',
  none: 'brand',
  unknown: 'neutral',
};

export function Figure({ tone, value, label }: { tone: 'good' | 'warn' | 'brand'; value: number; label: string }) {
  const colour = tone === 'good' ? 'text-success-400' : tone === 'warn' ? 'text-warning-400' : 'text-brand-400';
  return (
    <div className="rounded-tile border border-ink-700 bg-ink-900 px-2 py-2 text-center">
      <p className={`text-xl font-extrabold leading-none ${colour}`}>{value}</p>
      <p className="mt-1 text-[11px] font-bold leading-tight text-mist-500">{label}</p>
    </div>
  );
}

/**
 * One result.
 *
 * COMPACT ON PURPOSE — "לא לבזבז יותר מדי גובה לכל קבוצה". Picture 44px, one
 * line of name, one line of facts, and the actions on the same row as the
 * facts rather than under them. A phone shows five of these without scrolling.
 *
 * `dir="auto"` on the name is the whole of the Russian support: the page is
 * RTL, and "Наша Беэр-Шева" in an RTL paragraph has its punctuation and any
 * trailing digits thrown to the wrong end. Per-element, because the row around
 * it stays Hebrew.
 */
export function GroupRow({
  row,
  picked,
  already,
  busy,
  onToggle,
  onAdopt,
  onHide,
}: {
  row: DiscoveredGroupRow;
  picked: boolean;
  already: boolean;
  busy: boolean;
  onToggle: () => void;
  onAdopt: () => void;
  onHide: () => void;
}) {
  /*
   * ADDED ONLY WHERE THE SEARCH SAID HE IS A MEMBER. Not "not proven
   * otherwise" — SAID.
   *
   * This read `!== 'none' && !== 'requested'`, so a row whose membership the
   * card did not state got the button too, on the reasoning that the search
   * did not know and he does. The owner read the result exactly as it looks:
   * "זה נותן לי לצרף לרשימה קבוצות שאני עדיין לא חבר בהם". He was right and
   * the reasoning was wrong — a screen that has nothing to say about a group
   * must not offer an action whose whole meaning is "you are in this one".
   * Every such row would have become a publishing target that fails once a
   * day, with a sensible-looking reason, for ever.
   *
   * The same rule as the bulk button above the list, deliberately: two
   * controls that add groups may not disagree about which groups they mean.
   *
   * A group he IS in that the card stayed silent about is not lost — it
   * resolves on the next search, and "+ הוסף" on the groups screen takes its
   * link. Both cost him a step. Neither queues a publication that cannot work.
   */
  const canAdd = !already && row.membership === 'member';

  const facts = [
    row.members !== null ? `${membersText(row.members)} חברים` : '',
    PRIVACY_LABEL[row.privacy],
  ].filter(Boolean);

  return (
    <div className={`${picked ? 'border-brand-400 bg-brand-400/[0.06]' : 'border-ink-700 bg-ink-850'} rounded-card border px-2.5 py-2.5 transition-colors`}>
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={picked}
          aria-label={`בחר את ${row.name}`}
          onClick={onToggle}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
        >
          <span
            className={`grid h-5 w-5 place-items-center rounded-md border-2 transition-colors ${
              picked ? 'border-brand-400 bg-brand-400 text-on-brand' : 'border-ink-600'
            }`}
          >
            {picked && <CheckIcon aria-hidden className="h-3 w-3" />}
          </span>
        </button>

        <TargetAvatar name={row.name} imageUrl={row.image_url || null} channel="facebook_group" size={44} />

        <div className="min-w-0 flex-1">
          {/*
            `data-group-name` is a measurement hook and nothing else.

            worker/test/discovery-row.test.ts asserts that the browser RESOLVES
            this element's direction to ltr for a Cyrillic name and rtl for a
            Hebrew one — which is the whole of the owner's "תבדוק שהפיצ'ר עובד
            גם בשמות קבוצות ברוסית". Found by its dir attribute, the test could
            not tell "the attribute was deleted" from "the name did not render"
            and reported the wrong failure for the right bug. Found by this, it
            says exactly which.
          */}
          <p data-group-name dir="auto" className="truncate text-sm font-extrabold leading-tight text-mist-100">
            {row.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {facts.length > 0 && <span className="text-xs text-mist-500">{facts.join(' · ')}</span>}
            {row.membership !== 'unknown' && (
              <Badge tone={MEMBERSHIP_TONE[row.membership]}>{MEMBERSHIP_SHORT[row.membership]}</Badge>
            )}
            {already && (
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-success-400">
                <CheckIcon aria-hidden className="h-3.5 w-3.5" />
                כבר במערכת
              </span>
            )}
          </div>

          {/*
            TWO CONTROLS, NEVER THREE — measured, not guessed.

            It was three, and worker/test/discovery-row.test.ts caught what
            that costs: with "הוסף לקבוצות שלי" beside the open link the row
            wrapped to a second and third line of buttons and measured 208px
            at 360, against 116 for the same row without them. Nine rows would
            not fit a phone screen; four would.

            So "לא רלוונטי" moved out of this line and became the ✕ at the top
            of the row, where the avatar has already paid for the height — and
            the add button lost four words it did not need. Both are still
            44px targets.
          */}
          {/*
            NEVER TWO BUTTONS, and the measurement is why.

            At 360px the content column is about 165 wide once the checkbox,
            the picture and the dismiss have taken their 44 each. Two filled
            buttons need two hundred. Told not to wrap they left the card;
            allowed to wrap they took the row to 178px. Both were caught by
            worker/test/discovery-row.test.ts rather than by looking.

            So the row asks ONE question. For a group he is not in, that is
            "open it so you can join". For one he is already in and has not
            added to the publishing list, adding it is the useful act and
            opening it is the afterthought — so they swap, and the afterthought
            becomes a text link. A link still carries its own 44px.
          */}
          <div className="mt-2 flex min-w-0 items-center gap-2">
            {canAdd ? (
              <>
                <Button size="sm" variant="primary" busy={busy} onClick={onAdopt} className="whitespace-nowrap">
                  הוסף לרשימה
                </Button>
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center whitespace-nowrap text-[13px] font-bold text-brand-400"
                >
                  פתח קבוצה
                </a>
              </>
            ) : (
              <ButtonLink
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                size="sm"
                variant={row.membership === 'member' ? 'secondary' : 'primary'}
                className="whitespace-nowrap"
              >
                {row.membership === 'member' ? 'פתח קבוצה' : 'פתח להצטרפות'}
              </ButtonLink>
            )}
          </div>
        </div>

        {/* The dismiss, level with the name rather than under the buttons. */}
        <button
          type="button"
          aria-label={`הסתר את ${row.name}`}
          title="לא רלוונטי"
          onClick={onHide}
          disabled={busy}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-300 disabled:opacity-50"
        >
          <CloseIcon aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * "מעבר מהיר בין קבוצות" — one group, then the next.
 *
 * ONE AT A TIME AND NOT ALL AT ONCE, which is the point of it: opening twelve
 * tabs at a stroke is what a pop-up blocker exists to stop, and what Facebook
 * would read as a script. Each step is a link he presses, so each new tab is
 * opened by a real gesture.
 */
export function WalkThrough({
  rows,
  at,
  already,
  onNext,
  onClose,
}: {
  rows: DiscoveredGroupRow[];
  at: number;
  already: Set<string>;
  onNext: () => void;
  onClose: () => void;
}) {
  const row = rows[at];
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!row) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/70 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="מעבר מהיר בין קבוצות">
      <div className={`${CARD_ELEVATED} w-full max-w-md px-4 py-4`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-bold text-mist-500">
            קבוצה {at + 1} מתוך {rows.length}
          </p>
          <button
            ref={closeRef}
            type="button"
            aria-label="סגור"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-mist-500 hover:bg-ink-900"
          >
            <CloseIcon aria-hidden className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-1 flex items-center gap-3">
          <TargetAvatar name={row.name} imageUrl={row.image_url || null} channel="facebook_group" size={52} />
          <div className="min-w-0">
            <p dir="auto" className="text-base font-extrabold leading-tight text-mist-100">
              {row.name}
            </p>
            <p className="mt-0.5 text-xs text-mist-500">
              {[row.members !== null ? `${membersText(row.members)} חברים` : '', PRIVACY_LABEL[row.privacy]].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {already.has(row.external_id) && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-success-400">
            <CheckIcon aria-hidden className="h-3.5 w-3.5" />
            כבר ברשימת הקבוצות שלך
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2">
          <ButtonLink href={row.url} target="_blank" rel="noopener noreferrer" size="lg" className="w-full">
            פתח להצטרפות
          </ButtonLink>
          <Button variant="secondary" size="lg" className="w-full" onClick={onNext}>
            {at + 1 >= rows.length ? 'סיימתי' : 'הקבוצה הבאה →'}
          </Button>
        </div>

        <p className="mt-2 text-center text-[11px] leading-4 text-mist-500">
          ההצטרפות נעשית בפייסבוק עצמו — המערכת לא שולחת בקשות הצטרפות בשמכם.
        </p>
      </div>
    </div>
  );
}
