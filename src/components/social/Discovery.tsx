'use client';

import { useEffect, useRef } from 'react';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import { Badge, Button, ButtonLink, CARD_ELEVATED, Card } from '@/components/social/ui';
import { MEMBERSHIP_SHORT, PRIVACY_LABEL, membersText, type Membership } from '@/lib/social/discovery';
import type { DiscoveredGroupRow } from '@/lib/social/types';
import { CheckIcon, ClockIcon, CloseIcon, SparklesIcon, TargetIcon, UsersIcon } from '@/components/icons';

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

/*
 * VISUAL ONLY — the props, the values and the three tones are untouched.
 *
 * The tile was a bordered box with a coloured number in it. The brief asks for
 * three mini dashboard cards, each tinted by what it counts, with the number
 * large and the words small under it. Same data, same order of magnitude of
 * space, read in one glance instead of three.
 *
 * The icon is DERIVED FROM `tone` rather than passed in, so no caller changes
 * and no prop is added: a tile's tone already says what it counts.
 */
const FIGURE_SKIN: Record<'good' | 'warn' | 'brand', { tint: string; text: string; chip: string }> = {
  good: { tint: 'border-success-400/25 bg-success-400/[0.07]', text: 'text-success-400', chip: 'bg-success-400/12' },
  warn: { tint: 'border-warning-400/25 bg-warning-400/[0.07]', text: 'text-warning-400', chip: 'bg-warning-400/12' },
  brand: { tint: 'border-brand-400/25 bg-brand-400/[0.07]', text: 'text-brand-400', chip: 'bg-brand-400/12' },
};

export function Figure({ tone, value, label }: { tone: 'good' | 'warn' | 'brand'; value: number; label: string }) {
  const skin = FIGURE_SKIN[tone];
  const Glyph = tone === 'good' ? CheckIcon : tone === 'warn' ? ClockIcon : SparklesIcon;
  return (
    <div className={`rounded-tile border px-2 py-2.5 text-center ${skin.tint}`}>
      <span className={`mx-auto mb-1.5 grid h-7 w-7 place-items-center rounded-lg ${skin.chip} ${skin.text}`}>
        <Glyph aria-hidden className="h-3.5 w-3.5" />
      </span>
      <p className={`text-[22px] font-extrabold leading-none tabular-nums ${skin.text}`}>{value}</p>
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
    /* VISUAL ONLY. Every handler, every condition and every string below is the
       one that was here — what changed is the skin: a lifted white card with a
       soft violet shadow instead of a flat bordered box, a larger picture, a
       roomier checkbox, and the facts as a quiet line under a bolder name. */
    <div
      className={`rounded-card border px-3 py-2.5 transition-all ${
        picked
          ? 'border-brand-400 bg-brand-400/[0.06] shadow-[0_2px_10px_-2px_rgba(46,16,101,0.14)]'
          : 'border-ink-700 bg-ink-850 shadow-[0_1px_2px_rgba(46,16,101,0.04),0_8px_20px_-14px_rgba(46,16,101,0.18)]'
      }`}
    >
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
            className={`grid h-[26px] w-[26px] place-items-center rounded-lg border-2 transition-colors ${
              picked ? 'border-brand-500 bg-brand-500 text-on-brand shadow-[0_2px_6px_-1px_rgba(124,58,237,0.5)]' : 'border-ink-600 bg-ink-900'
            }`}
          >
            {picked && <CheckIcon aria-hidden className="h-3.5 w-3.5" />}
          </span>
        </button>

        <TargetAvatar name={row.name} imageUrl={row.image_url || null} channel="facebook_group" size={52} />

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
          {/* Two lines rather than one, clamped. A long Hebrew name used to end
              in an ellipsis halfway through the town it names; the brief asks
              for up to two lines, and the row is measured at all three phone
              widths so the extra line cannot push the card out of shape. */}
          <p data-group-name dir="auto" className="line-clamp-2 text-sm font-extrabold leading-tight text-mist-100">
            {row.name}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {facts.length > 0 && <span className="text-xs text-mist-500">{facts.join(' · ')}</span>}
            {row.membership !== 'unknown' && (
              <Badge tone={MEMBERSHIP_TONE[row.membership]}>{MEMBERSHIP_SHORT[row.membership]}</Badge>
            )}
            {already && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-400/10 px-2 py-0.5 text-[11px] font-bold text-success-400">
                <CheckIcon aria-hidden className="h-3 w-3" />
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
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            {canAdd ? (
              <>
                {/* Same onClick, same busy, same label — a gradient fill and a
                    softer shadow on top of them. */}
                <Button
                  size="sm"
                  variant="primary"
                  busy={busy}
                  onClick={onAdopt}
                  className="whitespace-nowrap bg-gradient-to-l from-brand-500 to-brand-300 shadow-[0_3px_10px_-2px_rgba(124,58,237,0.45)]"
                >
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
                /* The brief's two skins, chosen by the SAME condition as before:
                   "פתח להצטרפות" is the gradient call to action, "פתח קבוצה"
                   is the quiet white button with a purple edge. */
                className={`whitespace-nowrap ${
                  row.membership === 'member'
                    ? 'border-brand-400/35 text-brand-400'
                    : 'bg-gradient-to-l from-brand-500 to-brand-300 shadow-[0_3px_10px_-2px_rgba(124,58,237,0.45)]'
                }`}
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

/**
 * "הקבוצות שלך בפייסבוק" — what this account is in, and what the publishing
 * list is still missing.
 *
 * NOT A SEARCH, and that is the whole of its value. Facebook's own list of a
 * person's groups contains only groups they are in, by construction, so
 * "which of mine is not in the publishing list" is a set difference rather
 * than a guess about the wording on a card. The membership parser has been
 * wrong about that twice on this owner's account — 0 of 92 — and this cannot
 * be wrong in the same way.
 *
 * THE NAMES ARE ON SCREEN BEFORE THE BUTTON IS PRESSED. Facebook mixes
 * suggested groups into some layouts of that page; the reader drops them by
 * the heading of the section they sit under, and this list is the second lock:
 * a bulk add he cannot read first is not a bulk add, it is a leap.
 *
 * Its own component rather than JSX inside the page so that the fixture can
 * put the REAL card in a browser and measure it, for the reason
 * render-card.tsx gives: a copy written inside a test stops failing when the
 * component changes.
 */
export function MyGroupsCard({
  joined,
  missing,
  scanning,
  busy,
  onScan,
  onAdopt,
  onHide,
  busyId,
}: {
  /** Everything the scan has ever found. null = not read yet. */
  joined: DiscoveredGroupRow[] | null;
  /** Of those, the ones the publishing list does not have. */
  missing: DiscoveredGroupRow[];
  scanning: boolean;
  busy: boolean;
  onScan: () => void;
  onAdopt: () => void;
  /** "זאת לא קבוצה שלי" — one name off this list. See hideJoined. */
  onHide: (row: DiscoveredGroupRow) => void;
  busyId: string | null;
}) {
  return (
      <Card padded={false} className="px-3 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {/* The target glyph from the brief's first panel. Decoration only —
              aria-hidden, no handler, and the heading beside it is the same
              text it always was. */}
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-tile bg-gradient-to-br from-brand-500 to-brand-300 text-on-brand shadow-[0_3px_10px_-3px_rgba(124,58,237,0.5)]"
          >
            <TargetIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold text-mist-100">הקבוצות שלך בפייסבוק</p>
            <p className="mt-0.5 text-xs leading-relaxed text-mist-500">
              {joined === null
                ? 'טוען…'
                : joined.length === 0
                  ? 'עוד לא קראנו אילו קבוצות אתם חברים בהן. אחרי שהצטרפתם לקבוצות חדשות, לחצו כאן ונראה מה עוד לא נמצא ברשימת הפרסום.'
                  : missing.length === 0
                    ? `כל ${joined.length} הקבוצות שאתם חברים בהן כבר ברשימת הפרסום.`
                    : `מתוך ${joined.length} קבוצות שאתם חברים בהן, ${missing.length} עוד לא ברשימת הפרסום.`}
            </p>
          </div>
          <Button size="sm" variant="secondary" busy={scanning} onClick={onScan} className="whitespace-nowrap">
            {joined && joined.length ? 'בדוק שוב' : 'בדוק את הקבוצות שלי'}
          </Button>
        </div>

        {missing.length > 0 && (
          <>
            {/* The names, so the press is not blind. Facebook mixes
                suggestions into some layouts of that page and the reader
                drops them by their section heading — but a list he can read
                is the honest second lock. */}
            <ul className="mt-2.5 space-y-1.5">
              {missing.slice(0, 8).map((row) => (
                <li key={row.id} className="flex items-center gap-2 rounded-xl bg-ink-800/60 px-1.5 py-1">
                  <TargetAvatar name={row.name} imageUrl={row.image_url || null} channel="facebook_group" size={28} />
                  <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] text-mist-300">
                    {row.name}
                  </span>
                  {/* The one control on this card that is not mine to get
                      right: a name he can see is wrong, gone in one tap,
                      instead of waiting for the next version. */}
                  <button
                    type="button"
                    aria-label={`זאת לא קבוצה שלי: ${row.name}`}
                    disabled={busyId === row.id}
                    onClick={() => onHide(row)}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-mist-500 hover:bg-ink-900 disabled:opacity-40"
                  >
                    <CloseIcon aria-hidden className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            {missing.length > 8 && (
              <p className="mt-1.5 text-xs text-mist-500">ועוד {missing.length - 8}…</p>
            )}
            {/* Same onClick, same busy, same label and the same count in it. */}
            <Button
              busy={busy}
              onClick={onAdopt}
              className="mt-3 h-12 w-full rounded-tile bg-gradient-to-l from-brand-500 to-brand-300 shadow-[0_4px_14px_-3px_rgba(124,58,237,0.5)]"
            >
              הוסף את {missing.length} הקבוצות לרשימת הפרסום
            </Button>
          </>
        )}
      </Card>
  );
}
