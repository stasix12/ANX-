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
        const box = card?.querySelector('ol')?.parentElement as HTMLElement | null;
        return {
          found: Boolean(card),
          rows: items.length,
          pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          /* The list lives in a box that scrolls; the card itself must not
             grow to the height of 271 comments. */
          scrolls: box ? box.scrollHeight > box.clientHeight + 1 : false,
          cardHeight: card ? Math.round(card.getBoundingClientRect().height) : 0,
          /* Every "לתגובה" link, and where it points. */
          links: [...(card?.querySelectorAll('a') ?? [])].map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
          /* The queue numbers, in the order they are drawn. */
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
          footer: (card?.textContent ?? '').includes('ועוד'),
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
      assert.equal(seen.rows, 8, `${width}px: the rail drew ${seen.rows} rows from 9 inputs — the row present in both reads must be drawn once`);
      assert.deepEqual(seen.clipped, [], `${width}px: text is cut off — ${JSON.stringify(seen.clipped)}`);
      assert.deepEqual(seen.smallTargets, [], `${width}px: tap target under 40px — ${JSON.stringify(seen.smallTargets)}`);

      /*
       * THE QUEUE NUMBERS START AT 1. Four rows are still waiting and they are
       * the last four on the rail; numbered off the whole list they would read
       * #4 #5 #6 #7 behind the three that already happened.
       */
      assert.deepEqual(seen.places, ['#1', '#2', '#3', '#4'], `${width}px: the queue numbers are ${JSON.stringify(seen.places)}`);

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
       * THE FOOTER COUNTS THE DATABASE. totals is 271 against 8 drawn, so the
       * remainder is 263. Subtracting from the array would print a far smaller
       * number and call a window a total.
       */
      assert.ok(seen.footer, `${width}px: no remainder footer, though the reads are a window onto 271 comments`);
      assert.ok(seen.text.includes('263'), `${width}px: the remainder must be counted from totals (271 - 8 = 263), not from the array`);

      /* "צריך לבדוק", never "לא הצליח": an unverified comment may already be
         under the post, and wording it as a failure is what put it in the bulk
         retry and posted a second one. */
      assert.ok(seen.text.includes('צריך לבדוק'), `${width}px: the unverified state lost its own wording`);

      assert.equal(seen.scrolls, true, `${width}px: the rail must scroll inside the card rather than grow to the height of the queue`);
      assert.ok(seen.cardHeight <= 560, `${width}px: the card is ${seen.cardHeight}px — it must stay a card, not become the page`);

      console.log(`  ✓ ${width}px — ${seen.rows} rows, card ${seen.cardHeight}px, scrolls, no overflow, no clipped text`);
    }
  } finally {
    await browser.close();
  }
  console.log('comment-timeline layout tests OK');
}

void main();
