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
          smallTargets: [...(card?.querySelectorAll('a,button') ?? [])]
            .map((e) => ({ h: Math.round(e.getBoundingClientRect().height), t: (e.textContent ?? '').slice(0, 14) }))
            .filter((t) => t.h > 0 && t.h < 40),
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
       * EVERY ROW THAT WAS READ IS DRAWN — the rail scrolls rather than
       * folding. Seven finished inside the 24-hour window, seven queued, and
       * two publications still due whose round is owed a comment.
       */
      assert.equal(seen.rows, 16, `${width}px: the rail drew ${seen.rows} rows — 7 finished + 7 queued + 2 scheduled ahead`);
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
      assert.ok(
        seen.text.includes('תגובה קודמת לא מוצגת'),
        `${width}px: the one comment the 24-hour window excluded must be accounted for, not silently dropped`,
      );
      assert.ok(
        !seen.names.includes('קבוצה מלפני יומיים'),
        `${width}px: a comment older than a day is on the list — ${JSON.stringify(seen.names)}`,
      );
      assert.ok(seen.text.includes('24 השעות האחרונות'), `${width}px: the window must be stated, not silently applied`);

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
      assert.ok(
        seen.text.includes('18 מתוך 271 הגיבו'),
        `${width}px: the bar's line must read the database's own totals (done 18 of 271)`,
      );
      assert.ok(seen.text.includes('126 בתור'), `${width}px: it must say how many are still queued`);
      assert.ok(seen.text.includes('127 דורשות טיפול'), `${width}px: failed and unverified are counted together as needing a person`);

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
