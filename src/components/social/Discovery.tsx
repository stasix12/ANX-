'use client';

import { useEffect, useRef } from 'react';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import { Badge, Button, ButtonLink, CARD_ELEVATED, Card, inputClass } from '@/components/social/ui';
import { MEMBERSHIP_SHORT, PRIVACY_LABEL, membersText, normalizeQuery, type Membership } from '@/lib/social/discovery';
import type { DiscoveredGroupRow } from '@/lib/social/types';
import { CheckIcon, ChevronDownIcon, ClockIcon, CloseIcon, GlobeIcon, MoreIcon, PlusIcon, SearchIcon, SparklesIcon, StarIcon, TargetIcon, UsersIcon } from '@/components/icons';

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
  const Glyph = tone === 'good' ? UsersIcon : tone === 'warn' ? ClockIcon : SparklesIcon;
  /* The reference's tile: a round glyph and the number on one line, the words
     under both. Same props, same value, same tone — this is where they sit. */
  return (
    /* A notch tighter than it was, and the same tile: px-2 py-1.5 instead of
       py-2, a 24px glyph instead of 28 and a 19px figure instead of 22. The
       three of them are 64px of the top of this screen and the owner asked for
       the top back — measured, this is twelve of them, with nothing about the
       design language changed. */
    /* data-figure: the three of them have to agree on four numbers, and
       worker/test/discovery-row.test.ts finds them by this rather than by
       position — by position the check could never fail. */
    <div data-figure className={`rounded-tile border px-2 py-1.5 ${skin.tint}`}>
      <div className="flex items-center justify-center gap-1.5">
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${skin.chip} ${skin.text}`}>
          <Glyph aria-hidden className="h-3.5 w-3.5" />
        </span>
        <p className={`text-[19px] font-extrabold leading-none tabular-nums ${skin.text}`}>{value}</p>
      </div>
      {/* nowrap, not leading-tight: a label that wraps on one tile and not on
          its neighbour makes three tiles of two different heights, which is
          exactly what "בדיוק באותו גובה" is about. 10.5px is what lets the
          longest of the three — "בקשות ממתינות" — sit on one line inside the
          80px a tile has at 360. Measured, and measured for overflow too. */}
      <p className="mt-1 whitespace-nowrap text-center text-[10.5px] font-bold leading-[14px] text-mist-500">{label}</p>
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
  fallbackImage = null,
  onToggle,
  onAdopt,
  onHide,
}: {
  row: DiscoveredGroupRow;
  picked: boolean;
  already: boolean;
  busy: boolean;
  /**
   * The picture the PUBLISHING LIST already holds for this same group.
   *
   * "בקוביה הסגולה איפה שהאות תכניס לשם את התמונה של הקבוצה (כמו שאתה מושך
   *  מקבוצות שאני מכניס ידני)." For every row marked "במערכת" the app has
   * already opened that group's page once and stored its cover — and the row
   * was drawing a letter beside it. Behind the row's own picture, never in
   * front of it: what discovery stored is the newer of the two.
   */
  fallbackImage?: string | null;
  onToggle: () => void;
  onAdopt: () => void;
  onHide: () => void;
}) {
  /*
   * ADDED ONLY WHERE THE SEARCH SAID HE IS A MEMBER. Not "not proven
   * otherwise" — SAID. The owner read the old behaviour exactly as it looked:
   * "זה נותן לי לצרף לרשימה קבוצות שאני עדיין לא חבר בהם". A screen that has
   * nothing to say about a group must not offer an action whose whole meaning
   * is "you are in this one", or every such row becomes a publishing target
   * that fails once a day with a sensible-looking reason.
   */
  const canAdd = !already && row.membership === 'member';

  const facts = [
    row.members !== null ? `${membersText(row.members)} חברים` : '',
    PRIVACY_LABEL[row.privacy],
  ].filter(Boolean);

  /*
   * THE REFERENCE'S LAYOUT, and only its layout.
   *
   * Every handler, condition and string below is the one that was here. What
   * the design specification changed is where things sit: the checkbox opens
   * the row at the start, the name and its facts take the middle, the picture
   * moves to the far side, and the action sits under it rather than beside the
   * badges. The ✕ became a ⋮ — the same onHide, in a mark that reads as "more"
   * instead of "close", which is what the brief asked for and why it is not
   * simply deleted.
   */
  return (
    <div
      className={`relative rounded-card border px-2 py-1.5 transition-all ${
        picked
          ? 'border-brand-400 bg-brand-400/[0.06] shadow-[0_2px_10px_-2px_rgba(46,16,101,0.14)]'
          : 'border-ink-700 bg-ink-850 shadow-[0_1px_2px_rgba(46,16,101,0.04),0_8px_20px_-14px_rgba(46,16,101,0.18)]'
      }`}
    >
      <div className="flex items-stretch gap-2">
        {/* ─── the start of the row (right in RTL): pick it, then act on it ───
             The reference stacks these two — the checkbox at the head of the
             card and the one action at its foot, with the group's name between
             them and its picture on the far side. */}
        {/* ─── the start of the row (RIGHT in RTL): the group's picture ───
             "התמונות של הקבוצה יהיה בצד ימין וכפתורים בצד שמאל." Same
             TargetAvatar, same sources, same size — it simply opens the row
             now instead of closing it. */}
        <TargetAvatar name={row.name} imageUrl={row.image_url || fallbackImage || null} channel="facebook_group" size={54} />
        {/* ─── the middle: what the group is ─── */}
        <div className="min-w-0 flex-1 self-center">
          {/*
            `data-group-name` is a measurement hook and nothing else.
            worker/test/discovery-row.test.ts asserts that the browser RESOLVES
            this element's direction to ltr for a Cyrillic name and rtl for a
            Hebrew one — the whole of "תבדוק שהפיצ'ר עובד גם בשמות קבוצות
            ברוסית". Found by its dir attribute, the test could not tell a
            deleted attribute from a name that never rendered.
          */}
          <p data-group-name dir="auto" className="line-clamp-2 text-sm font-extrabold leading-tight text-mist-100">
            {row.name}
          </p>

          {facts.length > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-mist-500">
              <GlobeIcon aria-hidden className="h-3 w-3 shrink-0 text-brand-300" />
              <span className="truncate">{facts.join(' · ')}</span>
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1">
            {row.membership !== 'unknown' && (
              <Badge tone={MEMBERSHIP_TONE[row.membership]}>{MEMBERSHIP_SHORT[row.membership]}</Badge>
            )}
            {already && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-400/10 px-1.5 py-0.5 text-[11px] font-bold text-success-400">
                <CheckIcon aria-hidden className="h-3 w-3" />
                כבר במערכת
              </span>
            )}
            {/*
              THE WAY TO OPEN THE GROUP, KEPT — AND KEPT WHERE IT IS CHEAP.
              The first pass at this layout dropped it, and a diff of every href
              in the file is what caught it: on a row he CAN add, the only
              control left was "add", so a group he wanted to look at before
              committing to it had nowhere to be opened from.
              Beside the badges rather than under the button: the start column
              is what sets this card's height, and a third control there
              measured 150px against the 102 of every other row. Here the
              middle column has the room already, and it stays at 123.
            */}
            {canAdd && (
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center whitespace-nowrap text-[11px] font-bold text-brand-400"
              >
                פתח קבוצה
              </a>
            )}
          </div>
        </div>

        {/* ─── the far side (LEFT in RTL): pick it, then act on it ───
             The checkbox at the head of this column and the one action at its
             foot, which is where they were before the picture and they traded
             places. Every handler below is untouched. */}
        <div className="flex w-[94px] shrink-0 flex-col items-end justify-between gap-1">
          <button
            type="button"
            role="checkbox"
            aria-checked={picked}
            aria-label={`בחר את ${row.name}`}
            onClick={onToggle}
            /* No negative margin here any more. It was `-ms-1`, which nudged
               the 22px box out toward the card's edge when this column sat at
               the row's START; from the END side the mirror of it (`-me-1`)
               would pull the 40px tap box to within 4px of the ⋮ beside it,
               and those two mean opposite things. Flush instead: measured, the
               box's outer edge lands exactly on the action button's below it. */
            /* Same trick, and only where it is free: 4px toward the middle,
               where the column holds nothing beside it, and 2px top and
               bottom. Nothing toward the ⋮ — the two mean opposite things and
               their targets must not touch. */
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl after:absolute after:-start-1 after:end-0 after:-top-0.5 after:-bottom-0.5 after:content-['']"
          >
            <span
              className={`grid h-[22px] w-[22px] place-items-center rounded-md border-2 transition-colors ${
                picked ? 'border-brand-500 bg-brand-500 text-on-brand shadow-[0_2px_6px_-1px_rgba(124,58,237,0.5)]' : 'border-ink-600 bg-ink-900'
              }`}
            >
              {picked && <CheckIcon aria-hidden className="h-3 w-3" />}
            </span>
          </button>

          {/*
            ONE CONTROL, NEVER TWO. At phone width the room left once the
            checkbox, the picture and the ⋮ have taken theirs is about 165px;
            two filled buttons need two hundred, and
            worker/test/discovery-row.test.ts caught what that costs — the row
            went to 178px, or a button left the card.
          */}
          {canAdd ? (
            <>
              <Button size="sm" variant="primary" busy={busy} onClick={onAdopt} className="w-full whitespace-nowrap px-1 text-[11px]">
                הוסף לרשימה
              </Button>
            </>
          ) : (
            <ButtonLink
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              variant={row.membership === 'member' ? 'secondary' : 'primary'}
              /* The two skins the brief names, chosen by the SAME condition as
                 before. `!` on the border because the secondary variant carries
                 border-ink-700 and both are one-class border-colour utilities in
                 the same layer — the later one wins. Measured in a browser:
                 without it the purple edge never appeared at all. */
              className={`w-full whitespace-nowrap px-1 text-[11px] ${
                row.membership === 'member' ? '!border-brand-400/35 text-brand-400' : ''
              }`}
            >
              {row.membership === 'member' ? 'פתח קבוצה' : 'פתח להצטרפות'}
            </ButtonLink>
          )}
        </div>

        {/* ─── and the quiet one ───
             "כרגע יש X בצד הכרטיס. מבחינה ויזואלית הוא נראה כמו 'סגור'." The
             same onHide, as a ⋮. In the row's flow and never floating over it:
             floated, it measured 36×23px on top of "פתח להצטרפות" at every
             width, so a thumb aiming at the button hid the group instead. */}
        <button
          type="button"
          aria-label={`הסתר את ${row.name}`}
          title="לא רלוונטי"
          onClick={onHide}
          disabled={busy}
          /*
             28×40 PAINTED, 44×44 TO A THUMB.
             The ✕ this replaced was 44×44. As a ⋮ it is drawn 28px wide, and
             w-11 cannot buy the rest back: the 16px comes out of the middle
             column, which is where the name wraps, and the worst row at 360px
             measured 123 → 146 — past both MAX_ROW and the 110-130 the brief
             asked for. So the glyph stays 28px and the ::after carries the
             target, into the gutter on one side and into the 8px of dead card
             on the other, stopping exactly at the checkbox's own edge. */
          className="relative -me-1.5 grid w-7 shrink-0 place-items-center self-start rounded-xl py-3 text-mist-500 transition-colors after:absolute after:-inset-x-2 after:-inset-y-0.5 after:content-[''] hover:bg-ink-800 hover:text-mist-300 disabled:opacity-50"
        >
          <MoreIcon aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function WalkThrough({
  rows,
  at,
  already,
  pictures,
  onNext,
  onClose,
}: {
  rows: DiscoveredGroupRow[];
  at: number;
  already: Set<string>;
  /** Same fallback as the rows behind it — see GroupRow.fallbackImage. */
  pictures?: Map<string, string>;
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
          <TargetAvatar name={row.name} imageUrl={row.image_url || pictures?.get(row.external_id) || null} channel="facebook_group" size={52} />
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
/**
 * THE SEARCH BOX, as its own component — and the reason is a promise I made
 * twice and could not keep.
 *
 * "את הגובה של הכרטיסייה להוריד בכ-15-20%" was answered with a measured
 * number for the card below and a COMPUTED one for this: "the saving in the
 * search card is calculated from the spacing changes and not measured in a
 * browser, because measuring it would mean extracting this JSX into a
 * component." The owner's answer, one version later, was "החלק העליון עדיין
 * לא הצטמצם" — and he was right, because an arithmetic estimate is not a
 * measurement and I had no way to tell.
 *
 * So it is a component. Every value and every handler is the page's own,
 * passed in; nothing here decides anything. What it buys is that
 * worker/test/discovery-row.test.ts can put the real thing in a real browser
 * and read its height, which is the only kind of claim about pixels worth
 * making.
 */
export function SearchCard({
  text,
  searching,
  searches,
  activeQuery,
  onText,
  onRun,
}: {
  text: string;
  searching: boolean;
  searches: { id: string; query: string; normalized: string }[];
  /** The phrase whose results are on screen, for the chip that is lit. */
  activeQuery: string;
  onText: (v: string) => void;
  onRun: (q: string) => void;
}) {
  return (
    <Card padded={false} className="px-3 py-2.5">
      {/*
        ONE ROW, NOT TWO. The button was full width on a line of its own under
        the field: 54 pixels of button plus the gap above it, every time this
        screen is opened, to say a word the field beside it already says.
        Measured at 390px, moving it alongside is the single biggest piece of
        the top this pass gives back.
      */}
      <div className="flex items-center gap-1.5">
        <div className="relative min-w-0 grow">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-mist-500 start-3" />
          {/* dir="auto" and not "rtl": he searches in Hebrew, and the
              results are Hebrew and Russian alike — a Cyrillic phrase
              typed into a field forced to RTL has its punctuation thrown
              to the wrong end while he is typing it. */}
          <input
            aria-label="חפש עיר, אזור או נושא"
            placeholder="חפש עיר, אזור או נושא…"
            dir="auto"
            inputMode="search"
            enterKeyHint="search"
            value={text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRun(text);
            }}
            className={`${inputClass} h-11 rounded-tile pe-10 ps-10 text-base`}
          />
          {/* The reference's clear button. It writes the same state the
              field does and runs no search of its own. */}
          {text && (
            <button
              type="button"
              aria-label="נקה את תיבת החיפוש"
              onClick={() => onText('')}
              className="absolute top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-300 end-0.5"
            >
              <CloseIcon aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Same onClick, same busy, same word. The gradient is the theme's own
            `.social-theme .grad-primary`, which a bg-gradient-* beside it
            would not change — two classes beat one. Measured. */}
        <Button
          size="lg"
          busy={searching}
          onClick={() => onRun(text)}
          /* 48×63 → 44×56, which is the 10-15% the brief asks for, and every
             pixel of it goes to the field beside it. Still over the 44px
             floor; worker/test/discovery-row.test.ts measures that. */
          className="h-11 shrink-0 whitespace-nowrap rounded-tile !min-h-11 !px-3 shadow-[0_4px_14px_-3px_rgba(124,58,237,0.5)]"
        >
          {searching ? 'מחפש…' : 'חפש'}
        </Button>
      </div>

      {/* ───────────────────────── recent searches ────────────────────── */}
      {searches.length > 0 && (
        /*
          THE LABEL RIDES WITH THE CHIPS instead of standing on a line of its
          own above them — twenty more pixels, and the words are still there.
          ONE ROW THAT SCROLLS, never a second line: wrapped, a sixth saved
          search silently added 44px to this card. The bleed and padding keep a
          chip's focus ring from being clipped by the overflow.
        */
        /* EDGE TO EDGE OF THE CARD. The scroller used to sit inside the
           card's own padding, so the first and last chip were cut by it mid-
           word — "נחתכת בקצוות". Bleeding out by the padding and putting it
           back inside the scroller lets a chip scroll all the way to the
           card's edge and stop there. */
        <div className="-mx-3 mt-2 min-w-0 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max items-center gap-1.5">
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-mist-500">
              <ClockIcon aria-hidden className="h-3.5 w-3.5" />
              אחרונים
            </span>
            {searches.map((s) => {
              const on = s.normalized === normalizeQuery(activeQuery);
              return (
                <button
                  key={s.id}
                  type="button"
                  dir="auto"
                  onClick={() => {
                    onText(s.query);
                    onRun(s.query);
                  }}
                  className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-3 text-[11px] font-bold transition-colors ${
                    on
                      ? 'border-brand-400 bg-brand-400/10 text-brand-400 shadow-[0_1px_4px_-1px_rgba(109,40,217,0.3)]'
                      : 'border-ink-700 bg-ink-900 text-mist-300 hover:border-ink-600 hover:bg-ink-800'
                  }`}
                >
                  {s.query}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * THE FILTER ROW AND THE SORT UNDER IT.
 *
 * A component for the same reason SearchCard is: it is part of the top of this
 * screen, the owner asked for the top to be smaller, and a claim about pixels
 * has to be measured. Every value and handler is the page's own.
 */
export function FilterRow<F extends string, S extends string>({
  filters,
  filterLabel,
  filter,
  onFilter,
  sorts,
  sortLabel,
  sort,
  onSort,
}: {
  filters: readonly F[];
  filterLabel: Record<F, string>;
  filter: F;
  onFilter: (f: F) => void;
  sorts: readonly S[];
  sortLabel: Record<S, string>;
  sort: S;
  onSort: (s: S) => void;
}) {
  return (
    <div className="space-y-1.5">
      {/* EDGE TO EDGE OF THE SCREEN, not of the page's padding. Inside it the
          first and last chip were cut mid-word by the gutter; bleeding out by
          the gutter and putting it back inside the scroller lets a chip reach
          the screen's edge and stop there. */}
      <div className="-mx-4 min-w-0 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-1.5">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFilter(f)}
              className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-full border px-3 text-[11px] font-bold transition-colors ${
                filter === f
                  /* brand-600 → brand-500, NOT → brand-300.
                     White on brand-300 measures 4.23:1 and the pill's 12px
                     label came out at 4.40 — under the 4.5 AA asks for.
                     globals.css says it outright: brand-300 is the indicator
                     step, "using the bright accent as text is exactly the
                     mistake the split exists to prevent". Both ends here are
                     fills a white label sits on. */
                  ? 'border-transparent bg-gradient-to-l from-brand-600 to-brand-500 text-on-brand shadow-[0_2px_8px_-2px_rgba(124,58,237,0.45)]'
                  : 'border-ink-700 bg-ink-900 text-mist-300 hover:border-ink-600'
              }`}
            >
              {filterLabel[f]}
            </button>
          ))}
        </div>
      </div>
      {/*
        "במקום 3 כפתורים גדולים: הצג שורה קטנה — מיון: הכי רלוונטיות ▼".
        The same state, the same setter, the same list and the same labels; a
        native select so the options open as the phone's own list.

        QUIETER THAN IT WAS — "לא להפוך אותה לאלמנט בולט". The pill had a
        border and a fill of its own, which made a sort control look like one
        of the filters above it. It is plain text now, and the 44px the select
        overlay already had is what a thumb still gets.
      */}
      <div className="flex justify-center">
        <label className="relative inline-flex items-center gap-1 rounded-full px-2 text-[11px] font-bold text-mist-500">
          <span>מיון:</span>
          <span className="text-mist-300">{sortLabel[sort]}</span>
          <ChevronDownIcon aria-hidden className="pointer-events-none h-3 w-3" />
          <select
            aria-label="סדר התוצאות"
            value={sort}
            onChange={(e) => onSort(e.target.value as S)}
            className="absolute inset-0 h-11 w-full cursor-pointer opacity-0"
          >
            {sorts.map((o) => (
              <option key={o} value={o}>
                {sortLabel[o]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/**
 * WHAT THE SEARCH FOUND. Same component reason as SearchCard above: it is
 * measured in a browser rather than estimated in a comment.
 */
export function ResultsCard({
  query,
  fresh,
  totals,
  watching,
  onToggleWatch,
  joinedNotListed,
  adoptBusy,
  onAdoptAll,
}: {
  query: string;
  /** Groups new since the PREVIOUS run of this search — not totals.fresh. */
  fresh: number;
  totals: { total: number; fresh: number; requested: number; member: number; unknown: number };
  watching?: boolean;
  onToggleWatch?: () => void;
  joinedNotListed: number;
  adoptBusy: boolean;
  onAdoptAll: () => void;
}) {
  return (
    <Card padded={false} className="px-3 py-2.5">
      {/*
        THE STAR MOVED UP ONE LINE. It is a 40px control and it was sitting on
        the 16px line below, which made that line 40px tall for nothing. On the
        title's line it costs nothing at all: the heading is taller than it is.
      */}
      <div className="flex items-center gap-2">
        <p className="min-w-0 grow text-[19px] font-extrabold leading-tight text-mist-100">
          נמצאו <span className="tabular-nums">{totals.total}</span> קבוצות
        </p>
        {onToggleWatch && (
          <button
            type="button"
            aria-pressed={watching}
            aria-label={watching ? 'הפסק לעקוב אחרי החיפוש הזה' : 'עקוב אחרי החיפוש הזה'}
            title={watching ? 'במעקב' : 'עקוב אחרי החיפוש הזה'}
            onClick={onToggleWatch}
            className={`-me-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors hover:bg-ink-900 ${
              watching ? 'text-warning-400' : 'text-mist-500'
            }`}
          >
            <StarIcon aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* THE BADGE RODE DOWN HERE. On the heading's line it was a second
          bold thing on the row the heading owns — "לוודא שה-badge לא מתחרה עם
          הכותרת" — and it pushed the heading off centre when the count was
          long. Beside the quiet line it reads as what it is: a note about the
          same search. The heading now has the row to itself and the star. */}
      <div className="flex items-center gap-2">
        <p dir="auto" className="min-w-0 grow truncate text-xs text-mist-500">
          עבור החיפוש “{query}”
        </p>
        {fresh > 0 && <Badge tone="brand">{fresh === 1 ? 'אחת חדשה' : `${fresh} חדשות`}</Badge>}
      </div>
      {/* The brief's order, read right-to-left as the page is: new,
          waiting, already joined. Same three values, same three tones,
          same labels — only the order they sit in. */}
      <div className="mt-2 grid grid-cols-3 gap-2 [&>*]:min-w-0">
        <Figure tone="brand" value={totals.fresh} label="קבוצות חדשות" />
        <Figure tone="warn" value={totals.requested} label="בקשות ממתינות" />
        <Figure tone="good" value={totals.member} label="כבר הצטרפת" />
      </div>
      {/*
        ONE PRESS FOR THE ONES HE IS ALREADY IN.

        "אני חבר ב-9 מאלה ואני רוצה לפרסם בהן" was nine taps through a
        list, and the per-row button is easy to miss because it only
        appears on the rows that can use it. The count is in the label,
        so the promise and the set are the same thing.
      */}
      {joinedNotListed > 0 && (
        /* "להוסיף אייקון + קטן, להקטין מעט את הגובה, לשמור על outline סגול."
           The variant is the outline; the height is 44 → 40, which is still a
           target; the label and the handler are the ones that were here. */
        <Button variant="secondary" busy={adoptBusy} onClick={onAdoptAll} className="mt-2 h-10 w-full !min-h-10 !gap-1.5 !text-[12.5px]">
          <PlusIcon aria-hidden className="h-3.5 w-3.5" />
          הוסף לרשימה את {joinedNotListed} הקבוצות שאתה כבר חבר בהן
        </Button>
      )}
      {totals.unknown > 0 && (
        <p className="mt-1.5 text-[11px] leading-4 text-mist-500">
          ב-{totals.unknown} קבוצות תוצאות החיפוש לא אמרו אם אתם חברים. פתחו אותן כדי לראות.
        </p>
      )}
    </Card>
  );
}

export function MyGroupsCard({
  joined,
  missing,
  scanning,
  busy,
  onScan,
  onAdopt,
  onHide,
  busyId,
  pictures,
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
  /** Pictures the publishing list already holds — see GroupRow.fallbackImage. */
  pictures?: Map<string, string>;
}) {
  return (
      /* py-2.5 → py-2: the 20% of vertical padding the brief asks for, off a
         card that is mostly one sentence. */
      <Card padded={false} className="px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {/* The target glyph from the brief's first panel. Decoration only —
              aria-hidden, no handler, and the heading beside it is the same
              text it always was. */}
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-tile bg-gradient-to-br from-brand-500 to-brand-300 text-on-brand shadow-[0_3px_10px_-3px_rgba(124,58,237,0.5)]"
          >
            <TargetIcon className="h-4 w-4" />
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
          <Button size="sm" variant="secondary" busy={scanning} onClick={onScan} className="h-10 whitespace-nowrap !min-h-10 !px-2.5 !text-[12px]">
            {joined && joined.length ? 'בדוק שוב' : 'בדוק את הקבוצות שלי'}
          </Button>
        </div>

        {missing.length > 0 && (
          <>
            {/* The names, so the press is not blind. Facebook mixes
                suggestions into some layouts of that page and the reader
                drops them by their section heading — but a list he can read
                is the honest second lock. */}
            <ul className="mt-2 space-y-1">
              {missing.slice(0, 8).map((row) => (
                <li key={row.id} className="flex items-center gap-2 rounded-xl bg-ink-800/60 px-1.5 py-0.5">
                  <TargetAvatar name={row.name} imageUrl={row.image_url || pictures?.get(row.external_id) || null} channel="facebook_group" size={28} />
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
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-mist-500 hover:bg-ink-900 disabled:opacity-40"
                  >
                    <CloseIcon aria-hidden className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            {missing.length > 8 && (
              <p className="mt-1 text-xs text-mist-500">ועוד {missing.length - 8}…</p>
            )}
            {/* Same onClick, same busy, same label and the same count in it. */}
            <Button
              busy={busy}
              onClick={onAdopt}
              className="mt-2 h-11 w-full rounded-tile shadow-[0_4px_14px_-3px_rgba(124,58,237,0.5)]"
            >
              הוסף את {missing.length} הקבוצות לרשימת הפרסום
            </Button>
          </>
        )}
      </Card>
  );
}
