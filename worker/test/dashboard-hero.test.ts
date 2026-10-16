/*
 * THE DASHBOARD'S RUN CARD, MEASURED IN A REAL BROWSER AT PHONE WIDTH.
 *
 * The owner sent a reference image of the MAIN screen with a "תזמון פרסום"
 * block and a "הפרסום הבא יתחיל ב:" strip inside the run card, and called it a
 * binding spec: "אם התוצאה אינה תואמת כמעט 1:1 לתמונה המצורפת, המשימה עדיין
 * לא הסתיימה." He also named the screen twice, because the scheduling area
 * already existed one screen over: "זהו המסך הראשי / Dashboard של התוכנה. זה
 * לא מסך 'קמפיינים'."
 *
 * "1:1" is a claim about pixels, and pixels are the one thing a source-drift
 * guard cannot check. So this renders the real LiveCampaignHero with the real
 * compiled stylesheet and measures it in Chromium, the way campaign-card.test
 * does for the campaigns screen. Everything asserted below is something the
 * image shows or the brief writes in words:
 *
 *   • the block is INSIDE the card — "אל תפתח Modal. אל תפתח Popup. אל תיצור
 *     מסך חדש" — under the progress and above the two buttons;
 *   • the strip is a container of its own directly under it;
 *   • three readouts, in the image's order, none of them clipped;
 *   • seven day chips on one row;
 *   • the next instant is large and purple, with its date and the day it
 *     falls on beside it;
 *   • nothing above the block moved: the cover, the name, the pill, the two
 *     figures and the bar are where they were;
 *   • no horizontal overflow, and no control under 40px, at any phone width.
 *
 * AND WHAT IT MUST NOT SAY. A card whose schedule permits no day may not print
 * the stored instant — the engine will not publish at it — and a round with
 * nothing queued may not print one at all. "אל תציג זמן שגוי או זמן ישן."
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

/* ───────────────────────────── source guards (no browser needed) ───────── */

/** A file with its comments stripped, so a negative check cannot match the
    prose that explains it — the trap this suite has fallen into four times. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

const hero = code('src/components/social/LiveCampaignHero.tsx');
const board = code('src/components/social/CampaignScheduleBoard.tsx');
const page = code('src/app/social/page.tsx');

let checks = 0;
function is(ok: boolean, claim: string): void {
  checks += 1;
  assert.ok(ok, claim);
}

/* IT IS THE DASHBOARD'S CARD. LiveCampaignHero is what /social draws for the
   featured run; CampaignCard is the campaigns screen's. The block has to be in
   the first one, which is the whole point of this pass. */
is(/<CampaignScheduleBoard/.test(hero), 'the dashboard run card renders the schedule block itself');
/* `scheduleOf(run.campaign)`, inside the map: the dashboard draws every live
   round in a swipe strip now, so each card is handed ITS OWN campaign's
   schedule. A value read from outside the map would write one round's days and
   hours onto whichever card the strip happened to open on. */
is(/LiveCampaignHero/.test(page) && /schedule=\{scheduleOf\(run\.campaign\)\}/.test(page), 'and the dashboard page hands each card its own run\'s schedule');

/* NOT A MODAL, NOT A SHEET, NOT A ROUTE. The board and the editor under it are
   plain children of the card. A <Sheet> or a router push here would be the one
   thing the brief rules out by name, three times over. */
is(!/<Sheet/.test(board) && !/<Sheet/.test(hero.slice(hero.indexOf('CampaignScheduleBoard'))), 'the block opens no sheet');
is(!/useRouter|router\.push/.test(board), 'and navigates nowhere');

/*
 * ONE SCHEDULING MECHANISM — "אל תיצור מנגנון תזמון שני במקביל" — AND NOW ONE
 * PLACE THAT DECIDES WHAT TO SAY ABOUT IT.
 *
 * "תסדר את הבעית שורש הזאת פעם אחת ולתמיד ובכל הקמפיינים שיש."
 *
 * The rule used to be "the cards call the engine's own function", and both of
 * them did — and both were wrong in the same way, separately. nextPublishAt()
 * answers "when would this row be allowed out"; nobody owned the question
 * BEFORE it, which is whether there is a row at all. So the dashboard printed
 * a window edge over a spent queue and the campaigns list printed "אין פרסום
 * ממתין" over rows waiting for a person, and fixing either left the other.
 *
 * So the invariant is stronger than an import: NO COMPONENT MAY COMPUTE AN
 * INSTANT. campaign-schedule.ts holds the arithmetic, schedule-readout.ts
 * holds the decision, and every card is a switch over the result. The negative
 * checks below are what make that true rather than intended — and they run on
 * comment-stripped source, so the paragraph you are reading cannot satisfy
 * them.
 */
const readoutSrc = code('src/lib/social/schedule-readout.ts');
const listCard = code('src/components/social/CampaignCard.tsx');
is(/scheduleReadout\(schedule, state/.test(hero), 'the dashboard card asks scheduleReadout what to say');
is(/scheduleReadout\(schedule, state/.test(listCard), 'and so does the campaigns list, from the same call');
/*
 * AND THE ARITHMETIC MOVED ONE MODULE ALONG, for exactly the reason this
 * paragraph gives: the DASHBOARD'S QUEUE LIST turned out to be a third reader,
 * and it was reading `scheduled_at` out of the column with no schedule in
 * sight. With 217 rows re-spaced at 06:25 under a window that opens at 08:00
 * the card said 08:00 and the list said "באיחור" about every one of them —
 * this file's own fault, found again in the one place it had not been looked
 * for. lib/social/projection.ts holds the composition now, schedule-readout.ts
 * asks it, and the invariant below is the same invariant: NO COMPONENT MAY
 * COMPUTE AN INSTANT.
 */
const projectionSrc = code('src/lib/social/projection.ts');
is(/projectOne\(\{/.test(readoutSrc), 'which asks the one place that composes the gates');
is(/nextPublishAt\(schedule, from,/.test(projectionSrc), 'and that place resolves the instant with the engine\'s own function, not a second rule');
for (const [name, src] of [['LiveCampaignHero', hero], ['CampaignScheduleBoard', board], ['CampaignCard', listCard], ['NextPublication', code('src/components/social/NextPublication.tsx')]] as const) {
  is(!/nextPublishAt\(|nextAllowedAt\(|windowClosesAt\(/.test(src), `${name} computes no instant of its own`);
}
is(!/setHours|\+ 7 \* 24|86400000|getDay\(\)/.test(board), 'the board does no date arithmetic of its own');
/* THE QUEUE LIST IS HELD TO THE SAME RULE, which it was not before: it must
   draw the instant it is handed and compute none. */
const timelineSrc = code('src/components/social/Timeline.tsx');
is(!/nextPublishAt\(|nextAllowedAt\(|windowClosesAt\(|projectOne\(|projectQueue\(/.test(timelineSrc), 'Timeline computes no instant of its own either — it draws the one it is given');
is(/projected\?: Map<string, string \| null>/.test(timelineSrc), 'and it is given one, per row');

/* NOTHING HARDCODED. "אסור לקודד Hardcoded: 08:10 / 01.10.2026 / 08:00–22:00 /
   10 דקות / א׳ ב׳ ג׳ ה׳ — אלה רק נתוני הדוגמה שבתמונה." */
for (const literal of ['08:10', '01.10.2026', '08:00', '22:00', '10 דקות']) {
  is(!board.includes(literal), `the image's example value "${literal}" appears nowhere in the board`);
}

/* THE WORDS ARE THE BRIEF'S — the board's own, and the block's.

   "הפרסום הבא" AND ITS STATES MOVED OUT OF THIS FILE. The board carried its
   own strip and the campaigns card carried a second version of the same
   sentences; they are one component now (NextPublication), which is what
   "אסור שהתקלה הזאת תחזור" asks for about the two screens disagreeing. So
   the words are pinned where they live.

   And "שעות פרסום" became "שעת התחלה": there is no closing hour left to make
   it a plural. "יש להסיר לחלוטין את אפשרות שעת הסיום מממשק הכרטיס." */
const nextPubSrc = code('src/components/social/NextPublication.tsx');
for (const word of ['תזמון פרסום', 'פעיל', 'כבוי', 'ימי פרסום', 'הפרש בין פרסומים', 'שעת התחלה']) {
  is(board.includes(word), `the board prints "${word}", in the brief's own wording`);
}
is(!board.includes('שעות פרסום'), 'and no longer offers a RANGE of hours — there is one hour now');
for (const word of ['הפרסום הבא', 'אין פרסומים מתוזמנים', 'מושהה', 'הסבב הסתיים', 'הסבב הופסק', 'לא נבחר יום פרסום', 'בעוד']) {
  is(nextPubSrc.includes(word), `the next-publication block prints "${word}"`);
}
is(/<NextPublication/.test(board), 'and the board draws that block rather than a second copy of it');
is(/<NextPublication/.test(code('src/components/social/CampaignSchedulePanel.tsx')), 'as does the panel the campaigns card builds on');

/* "ערוך מועד" OPENS THE SCHEDULE, which is what the owner asked it to do —
   and the queue tuner it used to open is still reachable from inside. */
is(/canSchedule \? \(/.test(hero) && /setEditingSchedule/.test(hero), '"ערוך מועד" opens the schedule editor');
is(/<CampaignSchedulePanel/.test(hero), 'and the editor is the panel this product already had, not a new one');
is(/onTune && \(/.test(hero), 'with the queue\'s own advanced settings kept inside it');

/* BACKWARD COMPATIBLE. Without a schedule the card is the card as it was. */
is(/schedule && onScheduleChange && \(/.test(hero), 'no schedule, no block — every other caller gets the old card');
is(/schedule\?: CampaignSchedule;/.test(hero), 'and the prop is optional');

/*
 * THE WRITE IS THE PAGE'S, debounced, and put back when the row refuses it.
 *
 * PER CAMPAIGN NOW, which is what the swipe strip forced. One timer and one
 * patch meant the second card's edit CANCELLED the first card's pending save:
 * two campaigns touched inside 600ms and only the later one was ever written,
 * while the card he had just left snapped back to the stored row. "בדוק שני
 * קמפיינים פעילים במקביל" is exactly that case.
 */
is(/scheduleTimers\.current\[campaign\.id\] = setTimeout\(run, 600\);/.test(page), 'the dashboard debounces the schedule write, per campaign');
is(/await saveCampaign\(\{ id: campaign\.id, name: campaign\.name, \.\.\.columns \}\);/.test(page), 'and the debounced body is the write itself');
is(/const \[schedulePatch, setSchedulePatch\] = useState<Record<string, Required<ScheduleFields>>>\(\{\}\);/.test(page), 'and the optimistic overlay is keyed by campaign too');
/*
 * AND THE REVERT IS SCOPED TO THE WRITE THAT FAILED. One try/catch around all
 * four steps put the card back to the old hours and said "שמירת התזמון נכשלה"
 * whenever a LATER step threw — over a database that held exactly what he
 * asked for.
 */
is(/\} catch \(err\) \{[\s\S]{0,400}delete copy\[campaign\.id\];[\s\S]{0,300}'שמירת התזמון נכשלה\.'/.test(page), 'and puts that one card back when the campaign write itself fails');
is(/'התזמון נשמר, אבל עדכון התור לא הושלם\.'/.test(page), 'while a failure AFTER the save says so, instead of claiming nothing was saved');
/* THE PENDING SAVE SURVIVES LEAVING THE SCREEN. The cleanup cleared the timer
   and stopped, so a tap followed by a swipe inside 600ms was lost silently. */
is(/clearTimeout\(timer\);[\s\S]{0,120}schedulePending\.current\[id\]\?\.\(\)/.test(page), 'and an unmount FLUSHES what was pending rather than dropping it');

/* ───────────────────────────── contrast, computed from the tokens ──────── */

const css = readFileSync('src/app/globals.css', 'utf8');
const themeStart = css.indexOf('.social-theme {');
const themeBlock = css.slice(css.indexOf('{', themeStart), css.indexOf('\n}', css.indexOf('{', themeStart)));
const token = (name: string): string => {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(themeBlock);
  assert.ok(m, `token --color-${name} not found in .social-theme`);
  return m![1];
};
const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]): number => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: number[], b: number[]): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** What `bg-<token>/<pct>` actually paints, over the white card under it. */
const over = (fg: string, alpha: number, bg: string): number[] =>
  rgb(fg).map((f, i) => Math.round(f * alpha + rgb(bg)[i] * (1 - alpha)));

const card = token('ink-850');
const tint10 = over(token('brand-300'), 0.1, card);
const tint20 = over(token('brand-300'), 0.2, card);

/*
 * Every pair this block introduces, with the threshold that applies to it:
 * 4.5 for text (all of it is 12px or smaller, so the large-text allowance of
 * 3.0 does not), 3.0 for an edge, which is what WCAG 1.4.11 asks of a UI
 * boundary. Two of these were BELOW when first written and are the reason the
 * file says what it says: warning-400 on the 20% tint measured 4.21, and the
 * boxes' first border — the decorative hairline — measured 1.12, which is the
 * same as having drawn no border at all.
 */
const pairs: [string, number[], number[], number][] = [
  ['brand-400 on the strip — the label, the time and the date', rgb(token('brand-400')), tint20, 4.5],
  ['warning-400 on the strip at 10% — "לא נבחר יום פרסום"', rgb(token('warning-400')), tint10, 4.5],
  ['mist-300 on the strip — the day under the date', rgb(token('mist-300')), tint20, 4.5],
  ['mist-300 on the strip — "לא מתוזמן"', rgb(token('mist-300')), tint20, 4.5],
  ['brand-400 on the block — the title', rgb(token('brand-400')), tint10, 4.5],
  ['mist-100 on the block — the word "פעיל"', rgb(token('mist-100')), tint10, 4.5],
  ['mist-300 on the block — the word "כבוי"', rgb(token('mist-300')), tint10, 4.5],
  ['mist-300 on a readout box — its label, and an unselected chip', rgb(token('mist-300')), rgb(token('ink-900')), 4.5],
  ['mist-100 on a readout box — its value', rgb(token('mist-100')), rgb(token('ink-900')), 4.5],
  ['on-brand on brand-500 — a selected chip at the gradient\'s lightest end', rgb(token('on-brand')), rgb(token('brand-500')), 4.5],
  ['ink-600 over the block — a readout box\'s edge', rgb(token('ink-600')), tint10, 3],
  ['ink-600 on a readout box — an unselected chip\'s edge', rgb(token('ink-600')), rgb(token('ink-900')), 3],
];
for (const [what, fg, bg, bar] of pairs) {
  const r = ratio(fg, bg);
  is(r >= bar, `${what} measures ${r.toFixed(2)}, needs ${bar}`);
}

/* And the component actually uses the colours that were measured: a ratio
   computed off tokens the file does not reference proves nothing. */
is(/bg-brand-300\/10/.test(board), 'the block uses the 10% tint measured above');
is(/bg-brand-300\/10/.test(nextPubSrc), 'and so does the next-publication block, which is the one that has to be able to turn amber (4.80 at 10%, 4.21 at 20%)');
is(/bg-brand-300\/20/.test(code('src/components/social/CampaignSchedulePanel.tsx')), 'while the summary strip keeps the 20% one');
is(/border-ink-600/.test(board) && !/border-ink-700/.test(board), 'and the boxes carry the control edge, not the decorative hairline');
is(/text-warning-400/.test(nextPubSrc), 'with the warning in the token whose ratio was checked');

/* ───────────────────────────── the browser pass ─────────────────────────── */

const CHUNKS = path.resolve('.next/static/chunks');
function builtCss(): string | null {
  let best: { file: string; size: number } | null = null;
  try {
    for (const name of readdirSync(CHUNKS)) {
      if (!name.endsWith('.css')) continue;
      const file = path.join(CHUNKS, name);
      const size = statSync(file).size;
      if (!best || size > best.size) best = { file, size };
    }
  } catch {
    return null;
  }
  return best?.file ?? null;
}

async function main(): Promise<void> {
  const css = builtCss();
  if (!css) {
    console.log(`dashboard hero guards OK — ${checks} assertions (measurement SKIPPED, run \`npm run build\` first)`);
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'dashboard-hero-'));
  copyFileSync(css, path.join(dir, 'app.css'));
  const html = execFileSync('npx', ['tsx', 'worker/test/render-hero.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 });
  writeFileSync(path.join(dir, 'index.html'), html);

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    /* 360 is the narrowest Android still worth supporting, 390 is the iPhone
       the owner used to be on, and 430 is the phone the reference screenshot
       was taken on — the width the image has to match at. */
    for (const width of [360, 390, 430]) {
      const view = await browser.newPage({ viewport: { width, height: 900 } });
      await view.goto(`file://${path.join(dir, 'index.html')}`);
      await view.waitForTimeout(150);
      const seen = await view.evaluate(() => {
        const cards = [...document.querySelectorAll('.hero-probe > section')];
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          cards: cards.map((c) => {
            const box = c.getBoundingClientRect();
            const b = c.querySelector('[data-schedule-board]');
            const br = b?.getBoundingClientRect();
            const boxes = b ? [...b.querySelectorAll('button[aria-expanded]')].map((e) => e.getBoundingClientRect()) : [];
            const chips = b ? [...b.querySelectorAll('[data-must-fit]')].filter((e) => /^[א-ת]׳$/.test((e.textContent || '').trim())) : [];
            /* BY ITS OWN ATTRIBUTE. It used to be "the board's last child",
               which was true while the board drew its own strip; the block is
               a shared component now and the probe names it. */
            const strip = b?.querySelector('[data-next-publication]');
            const sr = strip?.getBoundingClientRect();
            const bar = c.querySelector('[role="progressbar"], [aria-label*="הושלמו"], .h-2\\.5');
            const actions = [...c.querySelectorAll('a,button')].filter((e) => /פתח סבב|ערוך מועד|השהה סבב|המשך סבב/.test(e.textContent || ''));
            return {
              height: Math.round(box.height),
              text: (c.textContent || '').replace(/\s+/g, ' '),
              /*
               * THE STRIP'S OWN TEXT, SEPARATELY FROM THE CARD'S.
               *
               * "a finished round prints no time" cannot be asserted against
               * the whole card: the readout boxes above the strip legitimately
               * carry "08:00 – 22:00", which is the setting and not a promise.
               * Scoped here, the assertion is the real rule — no clock reading
               * in the place that answers "when" — and a future state that
               * invents a fourth way to print one fails it without anyone
               * having to list the sentence.
               */
              strip: (strip?.textContent || '').replace(/\s+/g, ' '),
              hasBoard: !!b,
              /* INSIDE the card, within its padding, on both edges. */
              inside: br ? br.left >= box.left - 1 && br.right <= box.right + 1 : true,
              /* Under the progress bar and above the action row — the order
                 the reference draws and the brief writes out. */
              belowProgress: br && bar ? br.top >= bar.getBoundingClientRect().bottom - 1 : true,
              aboveActions: br && actions.length ? br.bottom <= Math.min(...actions.map((e) => e.getBoundingClientRect().top)) + 1 : true,
              /* The strip is its own container directly under the block. */
              stripIsOwnBlock: sr && br ? sr.width > 0 && sr.bottom <= br.bottom + 1 : true,
              readouts: boxes.length,
              /* The three sit on ONE row above 300px of space. Below that the
                 days take a row of their own, which is two. */
              readoutRows: new Set(boxes.map((r) => Math.round(r.top))).size,
              chips: chips.length,
              chipRows: new Set(chips.map((e) => Math.round(e.getBoundingClientRect().top))).size,
              /* Nothing this product WROTE may be cut: a window read as
                 "08:00 – 2…" is a window nobody can act on. */
              clipped: b
                ? [...b.querySelectorAll('[data-must-fit]')]
                    .filter((e) => e.scrollWidth > e.clientWidth + 1)
                    .map((e) => (e.textContent || '').trim().slice(0, 24))
                : [],
              /* Every control on the card, including the chips' own boxes and
                 the switch, carries the product's 40px floor. */
              small: [...c.querySelectorAll('a,button,select,[role="switch"]')]
                .map((e) => e.getBoundingClientRect())
                .filter((r) => r.width > 0 && (r.height < 40 || r.width < 24))
                .length,
              /* And nothing escapes the card's own box. */
              escaped: [...c.querySelectorAll('a,button')].filter((e) => {
                const r = e.getBoundingClientRect();
                return r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1);
              }).length,
            };
          }),
        };
      });

      assert.equal(seen.overflow, false, `${width}: the page scrolls sideways`);
      assert.equal(seen.cards.length, 16, `${width}: expected 16 cards, got ${seen.cards.length}`);

      seen.cards.forEach((c, i) => {
        const at = `${width}px, card ${i + 1}`;
        assert.equal(c.escaped, 0, `${at}: a control escaped the card`);
        assert.equal(c.small, 0, `${at}: a control under the 40px floor`);
        assert.deepEqual(c.clipped, [], `${at}: text this product wrote was cut off`);
        /* Card 7 is the one mounted with no schedule at all — the card as it
           was, which is the backward-compatibility case. */
        if (i === 6) {
          assert.equal(c.hasBoard, false, `${at}: a card with no schedule must draw no block`);
          return;
        }
        assert.ok(c.hasBoard, `${at}: the schedule block is missing`);
        assert.ok(c.inside, `${at}: the block is not inside the card`);
        assert.ok(c.belowProgress, `${at}: the block is not under the progress bar`);
        assert.ok(c.aboveActions, `${at}: the block is not above the action row`);
        assert.ok(c.stripIsOwnBlock, `${at}: "הפרסום הבא" is not its own container under the block`);
        assert.equal(c.readouts, 3, `${at}: expected three readouts, got ${c.readouts}`);
        assert.equal(c.chips, 7, `${at}: expected seven day chips, got ${c.chips}`);
        assert.equal(c.chipRows, 1, `${at}: the seven days must stay on one row`);
        /* THE REFERENCE'S OWN ROW, at the widths the owner's phone reports.
           360 is allowed the two-row fallback and nothing else is. */
        assert.equal(c.readoutRows, width >= 390 ? 1 : 2, `${at}: readouts on ${c.readoutRows} row(s)`);
        assert.ok(c.text.includes('תזמון פרסום'), `${at}: the block has lost its title`);
        /*
         * THE BLOCK ALWAYS LEADS WITH ITS OWN NAME, and then says one of the
         * things it is allowed to say. Neither half is optional: a block with
         * a bare time and no label is a number nobody can act on, and a label
         * with no state under it is a heading over nothing.
         */
        assert.ok(c.strip.trim().startsWith('הפרסום הבא'), `${at}: the block has lost its heading — "${c.strip.slice(0, 40)}"`);
        assert.ok(
          /בעוד |אמור לצאת עכשיו|באיחור/.test(c.strip) ||
            c.strip.includes('אין פרסומים מתוזמנים') ||
            c.strip.includes('הסבב הסתיים') ||
            c.strip.includes('הסבב הופסק') ||
            c.strip.includes('ממתינים לך') ||
            c.strip.includes('מושהה') ||
            c.strip.includes('לא נבחר יום פרסום') ||
            c.strip.includes('הסבב עוד לא הושק') ||
            c.strip.includes('לא ידוע מתי הפרסום הבא'),
          `${at}: the block has lost its state — "${c.strip.slice(0, 60)}"`,
        );
      });

      /* ─── what each case must, and must not, say ─────────────────────── */
      const [reference, , , noDay, off, nothingQueued, , scheduleOff, , windowOpen, ended, halted, awaitingHand, approximate, subMinute, neverLaunched] = seen.cards;

      /* 1 — the reference's own card: a time, a date, and the day it falls on. */
      /* The day, the date, the hour and a live countdown — "הפרסום הבא: יום
         ראשון, 18.10 בשעה 09:00 … בעוד 8 שעות ו-2 דקות". */
      assert.match(reference.strip, / בשעה \d{2}:\d{2}/, `${width}: the reference card prints no time`);
      assert.match(reference.strip, /\d{2}\.\d{2}/, `${width}: the reference card prints no date`);
      assert.match(reference.strip, /היום \(|מחר \(|מחרתיים \(|יום |שבת/, `${width}: the reference card does not say which day`);
      assert.match(reference.strip, /בעוד |אמור לצאת עכשיו|באיחור/, `${width}: the reference card has no countdown under its instant`);
      assert.ok(reference.text.includes('פעיל'), `${width}: a live schedule must read "פעיל"`);
      /* And nothing above it moved. */
      assert.ok(reference.text.includes('50 / 50') || reference.text.includes('50 /'), `${width}: the card's own figures changed`);
      assert.ok(reference.text.includes('40 מתוך 50 פורסמו'), `${width}: the breakdown line changed`);

      /* 4 — no day chosen. The stored instant may NOT be printed: the engine
             will not publish at it. */
      assert.ok(noDay.text.includes('לא נבחר יום פרסום'), `${width}: a schedule with no day must say so`);
      assert.doesNotMatch(noDay.strip, /\d{1,2}:\d{2}/, `${width}: a schedule with no day printed a time anyway`);

      /* 5 — the switch off. The word is "כבוי", and the queue's own instant is
             still the truth, so it is still shown. */
      assert.ok(off.text.includes('כבוי'), `${width}: a schedule that is off must read "כבוי"`);
      assert.match(off.strip, / בשעה \d{2}:\d{2}/, `${width}: a queued publication is still a fact when the schedule is off`);

      /*
       * 6 — A FINISHED ROUND WITH NOTHING QUEUED, and the schedule still on.
       *
       * "אז ברגע שסיים שיראה את הסבב הקרוב .. הגיוני לא ?" — so it shows when
       * the window next opens. BOTH halves have to be on screen: the time on
       * its own would read as a publication that is about to happen, and
       * nothing will happen at it until a post is launched.
       */
      assert.ok(nothingQueued.strip.includes('אין פרסומים מתוזמנים'), `${width}: an empty queue must say nothing is waiting`);
      assert.ok(nothingQueued.strip.includes('יום הפרסום הבא:'), `${width}: and must name what the time beside it is`);
      assert.match(nothingQueued.strip, /יום הפרסום הבא: ?\d{2}\.\d{2} בשעה \d{2}:\d{2}/, `${width}: the next publishing day's own instant is missing`);
      /* And it may NOT borrow the countdown a queued publication gets. */
      assert.doesNotMatch(nothingQueued.strip, /בעוד |אמור לצאת עכשיו/, `${width}: an empty queue counted down to a publication`);
      /* Drawn at Friday noon against a Sunday–Thursday window, so the window
         it names is genuinely ahead: 08:00 on Sunday, never the present
         minute. Before 4.0.1 this card also produced the next assertion's
         wording whenever the suite happened to run inside the window, and the
         line above would have failed — which is exactly what the owner saw on
         his screen and what the clock in render-hero.tsx now pins. */
      assert.ok(!nothingQueued.strip.includes('ברגע שייכנסו'), `${width}: a shut window was described as one with nothing to say`);

      /*
       * 10 — THE SAME EMPTY QUEUE, INSIDE AN OPEN WINDOW. The owner's 17:12.
       *
       * "למה זה 17:12 הפרסום יסתיים כבר" — nothing was queued, his window was
       * open, and the strip printed the present minute under "חלון הפרסום
       * הבא:". The instant was right and the sentence was false, and a minute
       * later the instant was in the past too.
       *
       * Drawn at Wednesday 10:00 against 08:00–22:00, so there is no future
       * opening to name and the only fact left is when it shuts. The close is
       * what must be on screen — 22:00 — and the word must be "פתוח עד".
       */
      assert.ok(windowOpen.strip.includes('אין פרסומים מתוזמנים'), `${width}: an open window with an empty queue must still say nothing is waiting`);
      /*
       * AND IT NAMES NO HOUR AT ALL NOW, which is the honest answer once the
       * closing hour is gone: "חלון הפרסום פתוח עד: 22:00" was a real fact
       * while 22:00 was a setting the owner had chosen. The day runs to
       * midnight for every campaign, so "open until 00:00" is a sentence about
       * nothing — and printing an hour in the place an appointment goes is
       * precisely the 17:12 this strip was rewritten for.
       */
      assert.ok(windowOpen.strip.includes('ברגע שייכנסו פרסומים לתור'), `${width}: an open window must say what would make something appear here`);
      assert.doesNotMatch(windowOpen.strip, /\d{1,2}:\d{2}/, `${width}: an open window with an empty queue printed an hour`);
      assert.ok(!windowOpen.strip.includes('יום הפרסום הבא:'), `${width}: an open window was announced as the next one`);

      /* 8 — nothing queued and the switch off. No queue, no window, no time. */
      assert.ok(scheduleOff.strip.includes('אין פרסומים מתוזמנים'), `${width}: with no queue and no schedule it must say nothing is scheduled`);
      /* Scoped to the BLOCK. A bare /\d\d:\d\d/ matches the readout boxes
         above it — "משעה 08:00" is the hour this campaign is set to, and it is
         correct for it to be on screen. */
      assert.doesNotMatch(scheduleOff.strip, /\d{1,2}:\d{2}/, `${width}: a card with nothing scheduled printed a publication time`);
      assert.ok(!scheduleOff.strip.includes('יום הפרסום הבא:'), `${width}: a switched-off schedule has no window to open`);

      /*
       * ───── 11 — HIS SCREEN, AND THE RULE THE WHOLE STRIP NOW OBEYS ──────
       *
       * "הקמפיין פעיל, אמור לצאת כל יום מ-8 בבוקר עד 22 בלילה כל דקה. למה זה
       *  מראה לי שסבב פרסום מתחיל ב-22:00? מה זה כל הבאגים האלה של התזמונים!"
       *
       * 219 of 219 handled, the switch on, Tuesday 10:12 inside 08:00–22:00.
       * Card 10 above is the SAME schedule at the SAME minute and it correctly
       * prints "חלון הפרסום פתוח עד: 22:00"; the only difference here is that
       * this round has ended. So the pair is the claim: a window is a fact
       * about publications that exist, and with none left it is not an answer
       * to any question the owner is asking.
       *
       * THE STRIP MAY PRINT NO TIME AT ALL. That is the assertion that
       * matters, and it is written as "no clock reading anywhere in the strip"
       * rather than as a list of forbidden sentences — a future state that
       * invents a fourth way to print 22:00 has to fail this too.
       */
      assert.ok(ended.strip.includes('הסבב הסתיים'), `${width}: a finished round must say so where the clock used to be`);
      assert.ok(ended.strip.includes('אין פרסומים מתוזמנים'), `${width}: and must say that nothing is coming`);
      /* THE OTHER HALF OF HIS MISUNDERSTANDING. The three boxes above still
         read "א׳…ה׳ · 08:00 – 22:00 · כל דקה" over a spent queue; without this
         line they read as a promise about today. */
      assert.ok(ended.strip.includes('התזמון יחול על הסבב הבא'), `${width}: the card does not say what the setting above it still does`);
      assert.doesNotMatch(ended.strip, /\d{1,2}:\d{2}/, `${width}: THE BUG — a finished round printed a time: "${ended.strip.replace(/\s+/g, ' ')}"`);
      assert.ok(!ended.strip.includes('יום הפרסום הבא'), `${width}: a finished round was told about a window`);
      /* And the numbers above it did not move. */
      assert.ok(ended.text.includes('196 מתוך 219 פורסמו'), `${width}: the breakdown line changed`);
      /* A ROUND CANNOT HAVE STARTED IN THE FUTURE, and a card that says it did
         is a card drawn at a minute the fixture does not agree with. This
         caught exactly that: "התחיל בעוד 5 ימים" over a finished round. */
      assert.doesNotMatch(ended.text, /התחיל בעוד/, `${width}: a finished round reports that it starts in the future`);
      assert.doesNotMatch(halted.text, /התחיל בעוד/, `${width}: a stopped round reports that it starts in the future`);

      /*
       * ───── 9 — A PAUSED ROUND, which was promising a time all along ─────
       *
       * rules.ts:185 hands every row of a paused round straight back and
       * pushes it forward again on each poll, so its stored instant is not
       * when it publishes — nothing publishes until he presses resume. The
       * card counted down to it anyway, which is the same fault as the 22:00
       * and harder to notice: the time is real, it simply never happens.
       */
      /*
       * AND THE BRIEF ASKS FOR THE PLANNED MINUTE BESIDE THE WORD, which is a
       * change: "אם הקמפיין מושהה, יש להציג את המועד המתוכנן לצד סטטוס מושהה,
       * בלי להציג אותו כפרסום שעומד להתבצע." So the minute may be there — and
       * the countdown may NOT, because that is what turns a plan into a
       * promise.
       */
      const [, , , , , , , , bigPaused] = seen.cards;
      assert.ok(bigPaused.strip.includes('מושהה'), `${width}: a paused round must say so where the clock was`);
      assert.ok(
        bigPaused.strip.includes('לא ייצא עד שתמשיכו') || bigPaused.strip.includes('אין פרסום עד שתמשיכו'),
        `${width}: and must say that nothing goes out meanwhile`,
      );
      assert.doesNotMatch(bigPaused.strip, /בעוד |אמור לצאת עכשיו/, `${width}: a paused round counted down to a minute it will not publish at`);
      assert.ok(!bigPaused.strip.includes('הפרסום הבא:'), `${width}: a paused round's planned minute was presented as the next publication`);

      /* 12 — stopped by hand. Same silence about time, its own word. */
      assert.ok(halted.strip.includes('הסבב הופסק'), `${width}: a round he stopped must say it was stopped, not that it finished`);
      assert.doesNotMatch(halted.strip, /\d{1,2}:\d{2}/, `${width}: a stopped round printed a time`);

      /*
       * 13 — WAITING ON A PERSON, which the window sentences called "אין פרסום
       * ממתין". Seven publications were waiting; they were waiting for him.
       */
      assert.match(awaitingHand.strip, /7 פרסומים ממתינים לך/, `${width}: rows waiting for a person were not named, or not counted`);
      assert.ok(awaitingHand.strip.includes('ממתינים לאישור שלכם'), `${width}: and the block does not say WHAT they are waiting for`);
      assert.ok(!awaitingHand.strip.includes('אין פרסומים מתוזמנים'), `${width}: publications that ARE waiting were reported as none`);
      assert.doesNotMatch(awaitingHand.strip, /\d{1,2}:\d{2}/, `${width}: a hand-waiting round printed a clock time`);

      /*
       * 14 — A COUNT THAT IS NOT THE ROUND'S, rendered rather than grepped.
       *
       * Every other guard on this is a substring search for `state.truncated`
       * in LiveCampaignHero's source, and that token appears three times in
       * the file — so the paragraph could be deleted outright and they would
       * all still pass. This reads the pixels.
       *
       * And it must be the RIGHT sentence. The owner's round is 39 rows; the
       * reason his numbers are approximate is that the counting views are not
       * in his database, which he can fix in half a minute. "הסבב גדול מדי"
       * is false there, and it is the sentence the card used to print.
       */
      assert.ok(
        approximate.text.includes('הספירה כאן מקורבת'),
        `${width}: a card whose numbers are not the round's said nothing about it`,
      );
      assert.ok(
        approximate.text.includes('social-latest.sql'),
        `${width}: the one cause the owner can act on did not name the remedy`,
      );
      assert.ok(
        !approximate.text.includes('גדול מדי') && !approximate.text.includes('גדול מכדי'),
        `${width}: a 39-row round was told it is too big to count`,
      );
      /* Only that card. A disclaimer that leaks onto rounds whose numbers ARE
         exact is the noise this whole change is about. */
      seen.cards.forEach((c, i) => {
        if (i === 13) return;
        assert.ok(
          !c.text.includes('הספירה כאן מקורבת') && !c.text.includes('ספירה מקורבת'),
          `${width}: card ${i + 1} hedges a count nobody said was partial`,
        );
      });
      /* And it still refuses to name an instant it cannot stand behind. */
      assert.doesNotMatch(approximate.strip, /\d{1,2}:\d{2}/, `${width}: an unprovable count printed a clock time`);

      /*
       * 15 — THE SUB-MINUTE INSTANT, measured rather than asserted in source.
       *
       * At a thirty-second cadence the stamp is 10:00:30, and the strip's
       * figure is 22px tabular digits in a fixed column. The seconds are not
       * optional — a strip reading 10:00 over a list reading 10:00:30 is one
       * screen disagreeing with another about one row — so the figure shrinks
       * and the clipping guard above decides whether that was enough.
       */
      assert.match(subMinute.strip, /\d{1,2}:\d{2}:\d{2}/, `${width}: a sub-minute round lost the seconds off its next instant`);
      /* AND THE COUNTDOWN UNDER IT IS LIVE TO THE SECOND TOO — mm:ss under an
         hour, words above it. "בעוד 00:30" and "בעוד 8 שעות ו-2 דקות" are the
         same control at two scales. */
      assert.match(subMinute.strip, /בעוד \d{1,2}:\d{2}|בעוד .*(שעה|שעות|שעתיים|דקה|דקות)|אמור לצאת עכשיו|באיחור/, `${width}: a sub-minute round has no countdown`);

      /*
       * 16 — NEVER LAUNCHED. The state cases 6, 9 and 10 used to be in, and
       * the one the dashboard had no words for: "אין פרסומים מתוזמנים" is
       * true, reads as a lull, and nothing will end it. A campaign owns no
       * group list, so until a round is launched once neither the window nor
       * the daily repeat can produce a publication — which is why no window
       * sentence may be printed over it.
       */
      assert.ok(neverLaunched.strip.includes('הסבב עוד לא הושק'), `${width}: a round that has never gone out was reported as a lull`);
      assert.ok(neverLaunched.strip.includes('בחרו קבוצות ושלחו'), `${width}: and was not told the one action that ends it`);
      assert.ok(!neverLaunched.strip.includes('יום הפרסום הבא:'), `${width}: a never-launched round was promised a publishing day`);
      assert.doesNotMatch(neverLaunched.strip, /\d{1,2}:\d{2}/, `${width}: a never-launched round printed a time`);

      await view.close();
      checks += 35;
    }
  } finally {
    await browser.close();
  }

  console.log(`dashboard hero OK — ${checks} assertions, measured at 360/390/430`);
}

void main();
