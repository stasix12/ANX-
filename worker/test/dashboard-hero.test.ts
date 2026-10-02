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

/* ONE SCHEDULING MECHANISM. "אל תיצור מנגנון תזמון שני במקביל." Every value
   the board prints comes out of campaign-schedule.ts, and the next instant is
   nextPublishAt() — the same call rules.ts makes before releasing a row. */
is(/from '@\/lib\/social\/campaign-schedule'/.test(board), 'the board reads the shared scheduling module');
is(/nextPublishAt\(schedule, from, lastPublishedAt/.test(hero), 'and the next instant is the engine\'s own function, not a second rule');
is(!/setHours|\+ 7 \* 24|86400000|getDay\(\)/.test(board), 'the board does no date arithmetic of its own');

/* NOTHING HARDCODED. "אסור לקודד Hardcoded: 08:10 / 01.10.2026 / 08:00–22:00 /
   10 דקות / א׳ ב׳ ג׳ ה׳ — אלה רק נתוני הדוגמה שבתמונה." */
for (const literal of ['08:10', '01.10.2026', '08:00', '22:00', '10 דקות']) {
  is(!board.includes(literal), `the image's example value "${literal}" appears nowhere in the board`);
}

/* THE WORDS ARE THE BRIEF'S. */
for (const word of ['תזמון פרסום', 'פעיל', 'כבוי', 'ימי פרסום', 'הפרש בין פוסטים', 'שעות פרסום', 'הפרסום הבא יתחיל ב:', 'לא מתוזמן']) {
  is(board.includes(word), `the board prints "${word}", in the brief's own wording`);
}

/* "ערוך מועד" OPENS THE SCHEDULE, which is what the owner asked it to do —
   and the queue tuner it used to open is still reachable from inside. */
is(/canSchedule \? \(/.test(hero) && /setEditingSchedule/.test(hero), '"ערוך מועד" opens the schedule editor');
is(/<CampaignSchedulePanel/.test(hero), 'and the editor is the panel this product already had, not a new one');
is(/onTune && \(/.test(hero), 'with the queue\'s own advanced settings kept inside it');

/* BACKWARD COMPATIBLE. Without a schedule the card is the card as it was. */
is(/schedule && onScheduleChange && \(/.test(hero), 'no schedule, no block — every other caller gets the old card');
is(/schedule\?: CampaignSchedule;/.test(hero), 'and the prop is optional');

/* THE WRITE IS THE PAGE'S, debounced, and put back when the row refuses it. */
is(/setTimeout\(async \(\) => \{[\s\S]{0,400}saveCampaign\(\{ id: campaign\.id/.test(page), 'the dashboard debounces the schedule write');
is(/catch \(err\) \{[\s\S]{0,200}setSchedulePatch\(null\)/.test(page), 'and puts the card back when the write fails');

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
is(/bg-brand-300\/10/.test(board) && /bg-brand-300\/20/.test(board), 'the block and the strip use the two tints measured above');
is(/border-ink-600/.test(board) && !/border-ink-700/.test(board), 'and the boxes carry the control edge, not the decorative hairline');
is(/text-warning-400/.test(board), 'with the warning in the token whose ratio was checked');

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
            const strip = b?.lastElementChild;
            const sr = strip?.getBoundingClientRect();
            const bar = c.querySelector('[role="progressbar"], [aria-label*="הושלמו"], .h-2\\.5');
            const actions = [...c.querySelectorAll('a,button')].filter((e) => /פתח סבב|ערוך מועד|השהה סבב|המשך סבב/.test(e.textContent || ''));
            return {
              height: Math.round(box.height),
              text: (c.textContent || '').replace(/\s+/g, ' '),
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
      assert.equal(seen.cards.length, 10, `${width}: expected 10 cards, got ${seen.cards.length}`);

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
        assert.ok(c.stripIsOwnBlock, `${at}: "הפרסום הבא יתחיל ב:" is not its own container under the block`);
        assert.equal(c.readouts, 3, `${at}: expected three readouts, got ${c.readouts}`);
        assert.equal(c.chips, 7, `${at}: expected seven day chips, got ${c.chips}`);
        assert.equal(c.chipRows, 1, `${at}: the seven days must stay on one row`);
        /* THE REFERENCE'S OWN ROW, at the widths the owner's phone reports.
           360 is allowed the two-row fallback and nothing else is. */
        assert.equal(c.readoutRows, width >= 390 ? 1 : 2, `${at}: readouts on ${c.readoutRows} row(s)`);
        assert.ok(c.text.includes('תזמון פרסום'), `${at}: the block has lost its title`);
        /* One of the two labels — a queued publication's, or the window's for a
           round with nothing waiting. Neither is optional: a strip with a bare
           time and no label is a number nobody can act on. */
        /* One of the three — a queued publication's, the next window's, or the
           open window's close. None is optional: a strip with a bare time and
           no label is a number nobody can act on. */
        assert.ok(
          c.text.includes('הפרסום הבא יתחיל ב:') ||
            c.text.includes('חלון הפרסום הבא:') ||
            c.text.includes('חלון הפרסום פתוח עד:'),
          `${at}: the strip has lost its label`,
        );
      });

      /* ─── what each case must, and must not, say ─────────────────────── */
      const [reference, , , noDay, off, nothingQueued, , scheduleOff, , windowOpen] = seen.cards;

      /* 1 — the reference's own card: a time, a date, and the day it falls on. */
      assert.match(reference.text, /הפרסום הבא יתחיל ב: ?\d{2}:\d{2}/, `${width}: the reference card prints no time`);
      assert.match(reference.text, /\d{2}\.\d{2}\.\d{4}/, `${width}: the reference card prints no date`);
      assert.match(reference.text, /היום \(|מחר \(|מחרתיים \(|יום |שבת/, `${width}: the reference card does not say which day`);
      assert.ok(reference.text.includes('פעיל'), `${width}: a live schedule must read "פעיל"`);
      /* And nothing above it moved. */
      assert.ok(reference.text.includes('50 / 50') || reference.text.includes('50 /'), `${width}: the card's own figures changed`);
      assert.ok(reference.text.includes('40 מתוך 50 פורסמו'), `${width}: the breakdown line changed`);

      /* 4 — no day chosen. The stored instant may NOT be printed: the engine
             will not publish at it. */
      assert.ok(noDay.text.includes('לא נבחר יום פרסום'), `${width}: a schedule with no day must say so`);
      assert.doesNotMatch(noDay.text, /יתחיל ב: ?\d{2}:\d{2}/, `${width}: a schedule with no day printed a time anyway`);

      /* 5 — the switch off. The word is "כבוי", and the queue's own instant is
             still the truth, so it is still shown. */
      assert.ok(off.text.includes('כבוי'), `${width}: a schedule that is off must read "כבוי"`);
      assert.match(off.text, /יתחיל ב: ?\d{2}:\d{2}/, `${width}: a queued publication is still a fact when the schedule is off`);

      /*
       * 6 — A FINISHED ROUND WITH NOTHING QUEUED, and the schedule still on.
       *
       * "אז ברגע שסיים שיראה את הסבב הקרוב .. הגיוני לא ?" — so it shows when
       * the window next opens. BOTH halves have to be on screen: the time on
       * its own would read as a publication that is about to happen, and
       * nothing will happen at it until a post is launched.
       */
      assert.ok(nothingQueued.text.includes('אין פרסום ממתין'), `${width}: an empty queue must say nothing is waiting`);
      assert.ok(nothingQueued.text.includes('חלון הפרסום הבא:'), `${width}: and must name what the time beside it is`);
      assert.match(nothingQueued.text, /חלון הפרסום הבא: ?\d{2}:\d{2}/, `${width}: the window's own instant is missing`);
      /* And it may NOT borrow the words a queued publication uses. */
      assert.doesNotMatch(nothingQueued.text, /הפרסום הבא יתחיל ב:/, `${width}: an empty queue promised a publication`);
      /* Drawn at Friday noon against a Sunday–Thursday window, so the window
         it names is genuinely ahead: 08:00 on Sunday, never the present
         minute. Before 4.0.1 this card also produced the next assertion's
         wording whenever the suite happened to run inside the window, and the
         line above would have failed — which is exactly what the owner saw on
         his screen and what the clock in render-hero.tsx now pins. */
      assert.ok(!nothingQueued.text.includes('פתוח עד:'), `${width}: a shut window was called open`);

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
      assert.ok(windowOpen.text.includes('אין פרסום ממתין'), `${width}: an open window with an empty queue must still say nothing is waiting`);
      assert.ok(windowOpen.text.includes('חלון הפרסום פתוח עד:'), `${width}: an open window must say it is open, not when it opens`);
      /* THE INSTANT IS THE CLOSE, NOT THE CLOCK. 22:00 is this schedule's own
         end; 10:00 is the pinned minute, and printing it is the bug. */
      assert.match(windowOpen.text, /חלון הפרסום פתוח עד: ?22:00/, `${width}: an open window did not print its closing time`);
      assert.doesNotMatch(windowOpen.text, /פתוח עד: ?10:00/, `${width}: the strip printed the current minute as the window's edge`);
      /* And neither of the two sentences it is not. */
      assert.ok(!windowOpen.text.includes('חלון הפרסום הבא:'), `${width}: an open window was announced as the next one`);
      assert.doesNotMatch(windowOpen.text, /הפרסום הבא יתחיל ב:/, `${width}: an open window promised a publication`);

      /* 8 — nothing queued and the switch off. No queue, no window, no time. */
      assert.ok(scheduleOff.text.includes('לא מתוזמן'), `${width}: with no queue and no schedule it must read "לא מתוזמן"`);
      /* Scoped to the STRIP's own labels. A bare /\d\d:\d\d/ matches the
         readout boxes above it — "08:00 – 22:00" is the window this campaign
         is set to, and it is correct for it to be on screen. */
      assert.doesNotMatch(scheduleOff.text, /יתחיל ב: ?\d{2}:\d{2}/, `${width}: a card with nothing scheduled printed a publication time`);
      assert.ok(!scheduleOff.text.includes('חלון הפרסום הבא:'), `${width}: a switched-off schedule has no window to open`);

      await view.close();
      checks += 20;
    }
  } finally {
    await browser.close();
  }

  console.log(`dashboard hero OK — ${checks} assertions, measured at 360/390/430`);
}

void main();
