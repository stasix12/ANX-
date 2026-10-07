/*
 * THE COMMENT RAIL, MEASURED IN A REAL BROWSER.
 *
 * "אני רוצה לראות טיימלין של תזמון התגובות ומה שכבר בוצע / נכשל אם קישור מהיר
 * לתגובה בעמוד".
 *
 * Three of the things this pins have been real defects on this screen before,
 * in the publications rail or the comments card:
 *
 *   - A CAPPED READ PRINTED AS A TOTAL. The dashboard once said "6 shown,
 *     ועוד 34 אחריהם" when the real remainder was 55, because the footer
 *     subtracted from an array that was itself a window. This card is fed two
 *     reads capped at 60 and 40 against an owner holding 271 comments, so the
 *     footer has to count the database.
 *   - THE SAME ROW DRAWN TWICE. Its two reads overlap by design; undeduped,
 *     the rail claims two comments under one post.
 *   - A TAP TARGET UNDER 40px. The one that caught a 20px campaign name.
 *
 * And one that is specific to this card: the queue numbering has to start at 1
 * for the next comment out. Numbered off the whole list instead of off the
 * waiting block, the first one queued would be "#6" behind five finished ones.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

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
    console.log('comment-timeline measurement SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'comment-timeline-'));
  copyFileSync(css, path.join(dir, 'app.css'));
  const html = execFileSync('npx', ['tsx', 'worker/test/render-comment-timeline.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 });
  writeFileSync(path.join(dir, 'index.html'), html);

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    for (const width of [360, 390, 430, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`file://${path.join(dir, 'index.html')}`);
      await page.waitForTimeout(200);

      const seen = await page.evaluate(() => {
        const card = document.querySelector('.probe > section') as HTMLElement | null;
        const items = [...(card?.querySelectorAll('ol > li') ?? [])] as HTMLElement[];
        
        return {
          found: Boolean(card),
          rows: items.length,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          /* The rail lives in a box that scrolls; the card itself must not
             grow to the height of the queue. */
          box: (() => {
            const el = card?.querySelector('ol')?.parentElement as HTMLElement | null;
            return el
              ? {
                  scrolls: el.scrollHeight > el.clientHeight + 1,
                  h: Math.round(el.getBoundingClientRect().height),
                  /* The same box "מה קרה היום" uses: reachable by keyboard and
                     announced as a scrollable list, not a silent overflow. */
                  focusable: el.tabIndex === 0,
                  labelled: Boolean(el.getAttribute('aria-label')),
                  maxH: getComputedStyle(el).maxHeight,
                }
              : null;
          })(),
          /* No fold: the owner asked for the scroll back — "את העיצוב והגלילה
             תשאיר ככה" — so a "הצג עוד" button reappearing is a regression. */
          folds: [...(card?.querySelectorAll('button') ?? [])].map((b) => (b.textContent ?? '').trim()).filter((t) => t.startsWith('הצג')),
          /* Rows for a publication that has not gone out yet. The rail has no
             section headings, so they are counted by the only thing that
             marks them. */
          aheadRows: [...(card?.querySelectorAll('ol > li p') ?? [])].filter((p) => (p.textContent ?? '').trim() === 'תגובה אחרי הפרסום').length,
          cardHeight: card ? Math.round(card.getBoundingClientRect().height) : 0,
          /* Every "לתגובה" link, and where it points. */
          links: [...(card?.querySelectorAll('a') ?? [])].map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
          /* The queue positions, in the order they are drawn. */
          places: items
            .map((li) => (li.querySelector('span[dir="ltr"]')?.textContent ?? '').trim())
            .filter((t) => t.startsWith('#')),
          /* Text overflowing its box, excluding what is allowed to clamp. */
          clipped: [...(card?.querySelectorAll('p') ?? [])]
            .filter((e) => !/truncate|line-clamp/.test(String((e as HTMLElement).className)))
            .filter((e) => e.scrollWidth > e.clientWidth + 1)
            .map((e) => (e.textContent ?? '').slice(0, 30)),
          /*
           * THE TAP TARGET, WHICH IS NOT THE SAME THING AS THE PAINTED BOX.
           *
           * A control may be drawn smaller than it is tapped, and the good ones
           * are: the "לתגובה" link is 36px of chrome so it does not shout next
           * to a 13px group name, with a ::before layer extending its hit area
           * past the 40px floor. Measuring only the border box would have
           * failed that — and, worse, would have passed a control that shrank
           * its hit area to match, which is the failure this check exists for.
           *
           * So the negative insets on ::before are read and added back. A
           * control with no such layer measures exactly as before.
           */
          smallTargets: [...(card?.querySelectorAll('a,button') ?? [])]
            .map((e) => {
              const box = e.getBoundingClientRect().height;
              const pseudo = getComputedStyle(e, '::before');
              /* NO NAMED HELPER IN HERE: tsx's esbuild rewrites `const f = () =>`
                 into `__name(…)`, and a function handed to page.evaluate ships
                 as source — so the call travels into the page and the helper
                 does not. This codebase has paid for that more than once. */
              const layer = pseudo.content !== 'none';
              const top = Number.parseFloat(pseudo.getPropertyValue('top'));
              const bottom = Number.parseFloat(pseudo.getPropertyValue('bottom'));
              /* Only a real layer counts, and only where it reaches OUT. */
              const up = layer && Number.isFinite(top) && top < 0 ? -top : 0;
              const down = layer && Number.isFinite(bottom) && bottom < 0 ? -bottom : 0;
              return { h: Math.round(box), hit: Math.round(box + up + down), t: (e.textContent ?? '').slice(0, 14) };
            })
            .filter((t) => t.h > 0 && t.hit < 40),
          bar: Boolean(card?.querySelector('[role="img"]')),
          /* Every group name drawn, so the 24-hour filter can be checked by
             what it left OUT rather than only by a count. */
          names: [...(card?.querySelectorAll('ol > li p[dir="auto"]') ?? [])].map((p) => (p.textContent ?? '').trim()),
          text: card?.textContent ?? '',
        };
      });
      await page.close();

      assert.ok(seen.found, `${width}px: the fixture rendered no card`);
      assert.equal(seen.pageOverflow, false, `${width}px: the page scrolls sideways`);
      /*
       * EIGHT ROWS FROM NINE INPUTS. The fixture hands the card two rows in
       * `done` and seven in `rows`, and publication 'a' appears in both — as
       * it does on any busy day, since the two reads overlap by design. Drawn
       * twice it would be the rail claiming two comments under one post.
       */
      /*
       * THE QUEUE COMES FROM ITS OWN READ — and the fixture is the owner's
       * account in miniature: `rows` carries not one pending comment, because
       * listCommentQueue asks for every comment state oldest-publication-first
       * capped at sixty, and with 482 such rows the sixty oldest were all long
       * finished. The queue fell outside the window every time, so the rail
       * showed nothing waiting while the bar above it counted 75 in the queue.
       *
       * "לא מראה", and it was right. If the component goes back to deriving
       * the queue from `rows`, these four vanish and this fails.
       */
      assert.ok(seen.text.includes('הבא בתור'), `${width}px: the head of the queue must be named without scrolling for it`);
      assert.equal(
        seen.places.length,
        7,
        `${width}px: all seven waiting comments must be on the rail — got ${JSON.stringify(seen.places)}. They come from their own read; derived from \`rows\` there are none.`,
      );
      /*
       * EVERY ROW THAT WAS READ IS DRAWN — the rail scrolls rather than
       * folding. Seven finished inside the 24-hour window, seven queued, and
       * two publications still due whose round is owed a comment.
       */
      assert.equal(seen.rows, 15, `${width}px: the rail drew ${seen.rows} rows — 6 finished today + 7 queued + 2 scheduled ahead`);
      /*
       * TWENTY-FOUR HOURS ONLY. The fixture carries a comment from forty hours
       * ago; it must not be drawn. Checked by NAME rather than by a count, so
       * the assertion fails for the right reason when the filter goes.
       */
      /*
       * ASSERTED ON THE COUNT, not on the absence of the old row's name.
       *
       * The name check alone is worthless here and I nearly shipped it: the
       * forty-hour-old comment sorts LAST among the finished ones, so with the
       * filter deleted it still falls outside the three that are drawn and the
       * assertion passes over the bug. The subtitle states the size of the
       * filtered set — eight finished are loaded, seven are inside the window
       * — so it moves the moment the filter does.
       */
      /*
       * RE-POINTED, NOT DELETED. This used to say "the one comment the
       * 24-hour window excluded". The window is now the local DAY — "ציר זמן
       * לעשות נתונים רק מה שקשור לאותו היום" — so there are two: the one from
       * the day before, and the twenty-hour-old one that was inside the
       * rolling window and is outside today. The PLURAL is the assertion: the
       * singular wording would still pass against a card that had quietly
       * gone back to 24 hours.
       */
      assert.ok(
        seen.text.includes('2 תגובות קודמות לא מוצגות'),
        `${width}px: both comments outside today must be accounted for, not silently dropped — ${seen.text.slice(0, 200)}`,
      );
      assert.ok(
        !seen.names.includes('קבוצה מלפני יומיים'),
        `${width}px: a comment older than a day is on the list — ${JSON.stringify(seen.names)}`,
      );
      assert.ok(
        !seen.names.includes('АРАД НАШ И РЕШАЕМ МЫ'),
        `${width}px: a comment from 22:30 last night is on today's rail — it is inside a rolling 24 hours and outside today, which is the whole of this change`,
      );
      /* Re-pointed with the window itself: the card used to state "24
         השעות האחרונות". It must still state its scope — a filter nobody is
         told about reads as data going missing. */
      assert.ok(seen.text.includes('מציגים את היום'), `${width}px: the window must be stated, not silently applied`);
      assert.ok(
        seen.text.includes('התור כפי שהוא עכשיו'),
        `${width}px: and the one number that is NOT scoped to today — the queue — must say so, or the line is a claim the card does not keep`,
      );

      /*
       * SCHEDULED AHEAD — "וגם את התגובות המתוזמנות קדימה". A comment is
       * queued onto a publication, so until that publication goes out there is
       * no comment row at all; these were invisible here.
       *
       * The fixture offers three due publications and only two belong to a
       * round carrying comment_text. The third must not appear however
       * imminent it is — checked by name, because a count alone would pass on
       * a filter that dropped the wrong one.
       */
      assert.equal(
        seen.aheadRows,
        2,
        `${width}px: exactly the two due publications whose round carries comment_text are owed a comment — the third round has none and must not appear`,
      );
      assert.ok(
        seen.names.includes('ניקוי מזגנים — באר שבע'),
        `${width}px: a scheduled-ahead row must name its group — ${JSON.stringify(seen.names)}`,
      );
      assert.ok(
        !seen.names.includes('קבוצה של מחר'),
        `${width}px: a comment following a post due TOMORROW is on today's rail — ${JSON.stringify(seen.names)}`,
      );
      assert.deepEqual(seen.clipped, [], `${width}px: text is cut off — ${JSON.stringify(seen.clipped)}`);
      assert.deepEqual(seen.smallTargets, [], `${width}px: tap target under 40px — ${JSON.stringify(seen.smallTargets)}`);

      /*
       * THE QUEUE NUMBERS START AT 1. Four rows are still waiting and they are
       * the last four on the rail; numbered off the whole list they would read
       * #4 #5 #6 #7 behind the three that already happened.
       */
      assert.deepEqual(
        seen.places,
        ['#1', '#2', '#3', '#4', '#5', '#6', '#7'],
        `${width}px: the queue numbers are ${JSON.stringify(seen.places)}`,
      );

      /* Eight folded — four finished and four waiting — and the button says
         so exactly, the way "הצג עוד 36" does in the card above. */
      /*
       * THE SCROLL, NOT A FOLD. "את העיצוב והגלילה תשאיר ככה" — I had replaced
       * the scrolling rail with tiles ending in "הצג עוד N", having read a
       * screenshot captioned "כמו כאן" as a request to match the section above.
       * It was not, and a fold button reappearing here is that regression.
       */
      assert.deepEqual(seen.folds, [], `${width}px: the rail must scroll, not fold — found ${JSON.stringify(seen.folds)}`);
      assert.ok(seen.box?.scrolls, `${width}px: the rail must scroll inside its box rather than grow to the height of the queue`);
      /*
       * THE SAME BOX AS "מה קרה היום" — asked for directly. 21rem is that
       * card's max-height; a keyboard must be able to reach this list and a
       * screen reader must be told it scrolls, which is what the publications
       * rail already does and what this one was missing.
       */
      assert.equal(seen.box?.maxH, '336px', `${width}px: the scroll box must be 21rem, the same depth as "מה קרה היום" — got ${seen.box?.maxH}`);
      assert.ok(seen.box?.focusable, `${width}px: the scroll box must be reachable by keyboard`);
      assert.ok(seen.box?.labelled, `${width}px: the scroll box must announce itself as a scrollable list`);

      /*
       * WHAT IS NEXT, AND IN HOW LONG — "אני רוצה לראות גם את התגובות שאמורות
       * לצאת הבאות בתור ובעוד כמה זמן".
       *
       * The queued rows were always on the rail, but the owner's screen had
       * forty-eight finished comments above them, so "what is about to happen"
       * was six swipes down a box that refreshes every thirty seconds. The
       * line at the top is the answer without the scrolling.
       */

      /*
       * THE PACE IS MEASURED, AND SAYS SO ONLY WHEN IT IS.
       *
       * The fixture's finished comments are two minutes apart — the owner's
       * real spacing — which gives the three usable intervals the median
       * needs. So the card must report the measured pace, not the 30-second
       * default the round is configured with: an estimate built on the setting
       * told them forty minutes for a queue that is really closer to three
       * hours.
       *
       * This also pins a bug of my own: the seconds were computed from the
       * usable INTERVALS while "measured" was decided by the row COUNT, so a
       * day with a publishing run in it fell back to the configured gap while
       * telling the owner it was reading today's pace.
       */
      assert.ok(seen.text.includes('לפי הקצב היום'), `${width}px: with four comments two minutes apart the pace must be measured, not assumed`);
      assert.ok(seen.text.includes('בערך ~2 דק׳ לכל תגובה'), `${width}px: the measured pace must be the median interval (2 minutes), not the configured 30s gap`);

      /* And the estimate compounds down the queue at that pace: #2 is one
         pace out, #3 two, #4 three — "בעוד ~2/4/6 דק׳". */
      for (const label of ['בעוד ~2 דק׳', 'בעוד ~4 דק׳']) {
        assert.ok(seen.text.includes(label), `${width}px: a queued comment must say how long until it goes — "${label}" is missing`);
      }
      /*
       * THE REAL INVARIANT IS THAT HEIGHT IS BOUNDED BY THE FOLD, NOT BY THE
       * QUEUE. Fourteen rows are loaded and the database holds 271; unfolded
       * and unclamped this card would be tens of thousands of pixels. Folded
       * it is six rows, two headers and a button, whatever the owner's backlog
       * — which is the property worth pinning.
       *
       * 650px, down from the 1000 the folded tile version needed. The rail
       * puts sixteen rows in a 22rem scroll box; the tiles put six on the page
       * and still measured 966. That difference is the argument for the shape
       * the owner asked to keep, and pinning the smaller number is what stops
       * it drifting back.
       */
      assert.ok(
        seen.cardHeight <= 650,
        `${width}px: the card is ${seen.cardHeight}px — folded it must stay a card, not become the page`,
      );

      /*
       * THE LINK IS THE POST'S. permalink when there is one, the group address
       * when there is not, and NO link at all when there is neither — an href
       * of "" is a control that looks alive and goes nowhere.
       */
      assert.ok(!seen.links.includes(''), `${width}px: a "לתגובה" link with an empty address`);
      /* d's permalink, not a's: the finished list folds at two and a is third,
         so asserting a's address was asserting something not on screen. */
      assert.ok(
        seen.links.includes('https://facebook.com/groups/4/posts/7'),
        `${width}px: a comment with a permalink must link to the POST, not to the group — got ${JSON.stringify(seen.links)}`,
      );
      assert.ok(
        seen.links.includes('https://facebook.com/groups/3'),
        `${width}px: a comment with no permalink must fall back to the group address`,
      );

      /*
       * THE BAR COUNTS THE DATABASE, NOT THIS CARD. Asked for: "סרגל התקדמות
       * של התגובות כמה מתוך כמה הגיב וכמה בתור". The list below is one day
       * deep and folded at three, so a bar built from the drawn rows would
       * report "3 מתוך 6" to an owner holding 271 comments.
       */
      assert.ok(seen.bar, `${width}px: the progress bar is missing`);
      /*
       * RE-POINTED, NOT DELETED. It used to read "18 מתוך 271 הגיבו · 126
       * בתור · 127 דורשות טיפול" — lifetime counts on a card whose every other
       * number is about one day, and 127 in particular is every comment that
       * ever needed a person, back to the first week. "ציר זמן לעשות נתונים
       * רק מה שקשור לאותו היום."
       *
       * The fixture's `today` is nothing like its `totals` on purpose: if the
       * card ever fell back to the lifetime figures these three numbers would
       * read 18 and 127 instead of 9 and 3, so the assertion moves the moment
       * the scope does.
       *
       * THE QUEUE IS STILL THE WHOLE QUEUE, and that is the one deliberate
       * exception: a comment owed on last night's post is still owed this
       * morning, and scoping it to today would shrink the number at midnight
       * while the work behind it had not moved at all.
       */
      assert.ok(seen.text.includes('9 הגיבו היום'), `${width}px: the bar's line must count TODAY's comments, not every comment ever written`);
      assert.ok(!seen.text.includes('18 מתוך'), `${width}px: the lifetime total is back on the line`);
      assert.ok(seen.text.includes('126 בתור'), `${width}px: it must say how many are still queued — the queue has no day`);
      assert.ok(seen.text.includes('3 דורשות טיפול היום'), `${width}px: failed and unverified are counted together as needing a person, for today`);

      /* "צריך לבדוק", never "לא הצליח": an unverified comment may already be
         under the post, and wording it as a failure is what put it in the bulk
         retry and posted a second one. */
      assert.ok(seen.text.includes('צריך לבדוק'), `${width}px: the unverified state lost its own wording`);

      /*
       * THE FOLD, NOT A SCROLL BOX. This card first put its rows in a box that
       * scrolled; the owner sent a screenshot of "תגובות שהועלו" — which ends
       * in "הצג עוד 36" — and wrote "כמו כאן". Six of the eight rows are drawn
       * (six finished capped, four waiting capped at six, so nothing is folded
       * here) and the button appears only when something actually is.
       */


      console.log(`  ✓ ${width}px — ${seen.rows} rows, card ${seen.cardHeight}px, no overflow, no clipped text`);
    }
  } finally {
    await browser.close();
  }
  console.log('comment-timeline layout tests OK');
}

void main();
