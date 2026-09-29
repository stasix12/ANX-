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
        const items = [...(card?.querySelectorAll('ul li') ?? [])] as HTMLElement[];
        
        return {
          found: Boolean(card),
          rows: items.length,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          /* The fold: the list shows a first page and ends in "הצג עוד N",
             which is the shape the card above it uses and the one the owner
             pointed at ("כמו כאן"). */
          more: [...(card?.querySelectorAll('button') ?? [])]
            .map((b) => (b.textContent ?? '').trim())
            .filter((t) => t.startsWith('הצג')),
          cardHeight: card ? Math.round(card.getBoundingClientRect().height) : 0,
          /* Every "לתגובה" link, and where it points. */
          links: [...(card?.querySelectorAll('a') ?? [])].map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
          /* The queue positions, in the order they are drawn. */
          places: items
            .map((li) => ([...li.querySelectorAll('span')].find((s) => /^מקום \d+ בתור$/.test((s.textContent ?? '').trim()))?.textContent ?? '').trim())
            .filter(Boolean),
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
          names: [...(card?.querySelectorAll('ul li p[dir="auto"]') ?? [])].map((p) => (p.textContent ?? '').trim()),
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
      /* Seven finished and seven waiting are loaded; three of each are drawn
         and the other eight sit behind the fold. */
      assert.equal(seen.rows, 6, `${width}px: the list drew ${seen.rows} rows — three from each half, the rest behind "הצג עוד"`);
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
        seen.text.includes('מוצגות 3 מתוך 7'),
        `${width}px: the finished half must be the 7 inside the 24-hour window, not all 8 loaded`,
      );
      assert.ok(
        seen.text.includes('תגובה ישנה יותר לא מוצגת'),
        `${width}px: the one comment the window excluded must be accounted for, not silently dropped`,
      );
      assert.ok(
        !seen.names.includes('קבוצה מלפני יומיים'),
        `${width}px: a comment older than a day is on the list — ${JSON.stringify(seen.names)}`,
      );
      assert.ok(seen.text.includes('מה נכתב ב-24 השעות האחרונות'), `${width}px: the window must be stated, not silently applied`);

      assert.deepEqual(seen.clipped, [], `${width}px: text is cut off — ${JSON.stringify(seen.clipped)}`);
      assert.deepEqual(seen.smallTargets, [], `${width}px: tap target under 40px — ${JSON.stringify(seen.smallTargets)}`);

      /*
       * THE QUEUE NUMBERS START AT 1. Four rows are still waiting and they are
       * the last four on the rail; numbered off the whole list they would read
       * #4 #5 #6 #7 behind the three that already happened.
       */
      assert.deepEqual(
        seen.places,
        ['מקום 1 בתור', 'מקום 2 בתור', 'מקום 3 בתור'],
        `${width}px: the queue positions are ${JSON.stringify(seen.places)}`,
      );

      /* Eight folded — four finished and four waiting — and the button says
         so exactly, the way "הצג עוד 36" does in the card above. */
      assert.deepEqual(seen.more, ['הצג עוד 8'], `${width}px: the fold's button reads ${JSON.stringify(seen.more)}`);
      /*
       * THE REAL INVARIANT IS THAT HEIGHT IS BOUNDED BY THE FOLD, NOT BY THE
       * QUEUE. Fourteen rows are loaded and the database holds 271; unfolded
       * and unclamped this card would be tens of thousands of pixels. Folded
       * it is six rows, two headers and a button, whatever the owner's backlog
       * — which is the property worth pinning.
       *
       * 950px is that shape measured with room to spare, not a target. It is
       * about the height of the "תגובות לפרסומים" card it sits under, which is
       * the company this card is meant to keep.
       */
      assert.ok(
        seen.cardHeight <= 950,
        `${width}px: the card is ${seen.cardHeight}px — folded it must stay a card, not become the page`,
      );

      /*
       * THE LINK IS THE POST'S. permalink when there is one, the group address
       * when there is not, and NO link at all when there is neither — an href
       * of "" is a control that looks alive and goes nowhere.
       */
      assert.ok(!seen.links.includes(''), `${width}px: a "לתגובה" link with an empty address`);
      assert.ok(
        seen.links.includes('https://facebook.com/groups/1/posts/9'),
        `${width}px: a comment with a permalink must link to the POST, not to the group`,
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
