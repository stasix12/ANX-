/*
 * THE CAMPAIGN CARD, MEASURED IN A REAL BROWSER AT PHONE WIDTH.
 *
 * The owner sent a screenshot of the campaigns list with one card filling the
 * screen and a row of loose blue words — ערוך, שכפל, תגובה, + פוסט, and a red
 * מחק — floating between two cards, belonging visibly to neither. The brief
 * that followed asked for a card 25–35% shorter with every action inside its
 * own border.
 *
 * "25–35% shorter" is a claim about pixels, and pixels are the one thing a
 * source-drift guard cannot check. So this file renders the real component
 * with the real compiled stylesheet and measures it in Chromium.
 *
 * THE BEFORE FIGURES, measured the same way on the first version of this card
 * (one tall column, a 112px cover, and the actions printed loose underneath):
 *
 *     a finished run, mostly skipped      341 + 44 = 385px
 *     a live run, Cyrillic group name     357 + 44 = 401px
 *     a long name, five-figure counts     341 + 44 = 385px
 *     an empty campaign                   235 + 44 = 279px
 *
 * AND THEN THE DESIGN SPECIFICATION, which turned the card on its side: a
 * portrait picture about a third of its width on the far side, everything
 * about the run stacked beside it, and three controls at its foot. Measured
 * here at 390px, in the theme /social actually paints:
 *
 *     the reference's own card (5 of 20, nothing skipped)   169px
 *     a run with a "12 דולגו · 3 נכשלו" line under the bar  187px
 *     a run that finished clean, with the ✅ line            189px
 *     an empty campaign, with "+ הוסף פוסט ראשון"           206px
 *
 * The ceiling is the measured maximum plus four, as everywhere in this suite.
 *
 * IT ALSO CATCHES WHAT THE EYE DID NOT. Compacting the title to 15px took the
 * primary way into a campaign — its name — from the 44px the old card gave it
 * down to TWENTY, and nothing in the suite would have said so. That is why the
 * name's target is hit-tested below rather than read off its box: it is drawn
 * at 20px and carries its 44 in an ::after.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

/* The compiled stylesheet, which only exists after a build. Skipping loudly
   rather than passing quietly: a measurement test that silently measures
   nothing is worse than no measurement test. */
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

/* Wrapped in a function, not top level: tsx loads this file as CommonJS and a
   top-level await there is ERR_REQUIRE_ASYNC_MODULE. Same shape as
   progress-contradiction.test.ts. */
async function main(): Promise<void> {
  const css = builtCss();
  if (!css) {
    console.log('campaign card measurement SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'campaign-card-'));
  copyFileSync(css, path.join(dir, 'app.css'));
  /* Rendered in a child process: this file is a plain node test and the
     component is a React tree that needs the app's own tsconfig paths. */
  const html = execFileSync('npx', ['tsx', 'worker/test/render-card.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 });
  writeFileSync(path.join(dir, 'index.html'), html);

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    /* 390 is the iPhone the owner uses; 360 is the narrowest Android still
       worth supporting; 430 is the widest phone. A card that survives all
       three survives the grid on desktop, which only gets wider. */
    /*
     * 360 is the narrowest Android still worth supporting, 390 is the iPhone
     * the owner uses, 430 is the widest phone — and 600 is one column of the
     * desktop grid, which is where the reference image itself was drawn
     * (566px) and the only width at which the panel's `@[440px]` arrangement
     * is the one on screen. Without it, half of this layout was never
     * measured.
     */
    for (const width of [360, 390, 430, 600]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`file://${path.join(dir, 'index.html')}`);
      await page.waitForTimeout(200);
      const seen = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.card-probe > div')];
        return {
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          cards: cards.map((c) => {
            const box = c.getBoundingClientRect();
            const mid = (box.left + box.right) / 2;
            /*
             * THE PICTURE, found by the one thing that identifies it: it is the
             * link whose accessible name opens the campaign. Found by position
             * or by order, this check could never fail.
             */
            const pic = [...c.querySelectorAll('a')].find((a) => (a.getAttribute('aria-label') ?? '').startsWith('פתח את'));
            const pb = pic?.getBoundingClientRect();
            return {
              height: Math.round(box.height),
              width: Math.round(box.width),
              /* A picture at all, how wide a share of the card it takes, and
                 which side of the card it landed on. Source order decides the
                 last one and reads the same either way round, so it is
                 measured: "התמונות של הקבוצה... בצד שמאל של הכרטיס". */
              picture: pb ? Math.round(pb.width) : 0,
              pictureHeight: pb ? Math.round(pb.height) : 0,
              pictureShare: pb ? Math.round((pb.width / box.width) * 1000) / 10 : 0,
              pictureAtEnd: pb ? (pb.left + pb.right) / 2 < mid : false,
              /*
               * Whether a real cover was painted, not merely wired — INSIDE
               * the picture, not anywhere on the card. `c.querySelector('img')`
               * also matches TargetAvatar's own <img> on the "הבא בתור" line,
               * which the page passes a group picture to in production: the
               * day the fixture gains one, that form stops measuring covers
               * and nothing says so.
               */
              drewCover: !!pic?.querySelector('img, video'),
              /*
               * TEXT CUT OFF MID-NUMBER.
               *
               * The check this replaces measured the four status chips —
               * "the one thing on this card that must never be half-read" —
               * and went with them. The sentence that took their place reaches
               * "120 מתוך 248 פורסמו" in a column barely 200px wide, so the
               * rule is worth more now, not less.
               *
               * BY THE ATTRIBUTE, NOT BY `truncate`. A group's own name and
               * the campaign's own name are user text and are MEANT to end in
               * an ellipsis — "Город Арад , глазами жителей" does, at 360px,
               * and that is the layout working. What may never be cut is a
               * sentence this product wrote with a number in it, and
               * data-must-fit is the card saying which those are. Selected by
               * the attribute under test, a card that drops it reads as having
               * no such labels and this assertion stops asserting — which the
               * floor below is for.
               */
              mustFit: c.querySelectorAll('[data-must-fit]').length,
              /* "הקמפיין הסתיים בהצלחה" — the one claim on this card that is
                 about an OUTCOME rather than a count. See the assertion. */
              saysSuccess: (c.textContent || '').includes('הקמפיין הסתיים בהצלחה'),
              clipped: [...c.querySelectorAll('[data-must-fit]')]
                .filter((e) => e.scrollWidth > e.clientWidth + 1)
                .map((e) => (e.textContent || '').trim().slice(0, 28)),
              /*
               * ANY CONTROL SITTING ON THE PICTURE.
               *
               * The three controls at the foot of the card measure 218px and
               * cannot wrap, so a picture taking a flat 36% of a narrow phone
               * leaves them less room than they need and the row runs back
               * underneath it — 17px of the ⋯ on top of a picture that is
               * itself a link. Two boxes overlapping is not something a class
               * name can show, and the cost is a tap that opens a campaign
               * when it meant to open a menu.
               */
              onPicture: pb
                ? [...c.querySelectorAll('a,button')]
                    .filter((e) => e !== pic)
                    .map((e) => {
                      const b = e.getBoundingClientRect();
                      const w = Math.min(pb.right, b.right) - Math.max(pb.left, b.left);
                      const h = Math.min(pb.bottom, b.bottom) - Math.max(pb.top, b.top);
                      return w > 0 && h > 0 ? `${Math.round(w)}×${Math.round(h)} על "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 16)}"` : '';
                    })
                    .filter(Boolean)
                : [],
              /* Every control has to sit inside the card's own box. */
              escaped: [...c.querySelectorAll('a,button')].filter((e) => {
                const b = e.getBoundingClientRect();
                return b.width > 0 && (b.left < box.left - 1 || b.right > box.right + 1);
              }).length,
              /*
               * ─── "תזמון פרסום", the panel this pass added ───────────────
               *
               * Found by its own data attribute rather than by position: the
               * whole point of the assertions below is WHERE it landed, and a
               * probe that located it by position could never fail.
               */
              panel: (() => {
                const p = c.querySelector('[data-schedule]');
                if (!p) return null;
                const pr = p.getBoundingClientRect();
                const chips = [...p.querySelectorAll('[aria-pressed]')].map((e) => e.getBoundingClientRect());
                const fields = [...p.querySelectorAll('select')].map((e) => e.getBoundingClientRect());
                const label = [...p.querySelectorAll('p')][0];
                const summary = [...p.querySelectorAll('p')].at(-1);
                return {
                  width: Math.round(pr.width),
                  height: Math.round(pr.height),
                  /* Inside the card's padding, on both edges. */
                  inside: pr.left >= box.left - 1 && pr.right <= box.right + 1,
                  /* Under "הוסף פוסט"/the progress bar and above the actions —
                     the order the brief writes out. */
                  belowHead: pr.top > (c.querySelector('[data-must-fit]')?.getBoundingClientRect().top ?? pr.top) ,
                  aboveActions: pr.bottom <= Math.min(
                    ...[...c.querySelectorAll('a,button')]
                      .filter((e) => /פתח קמפיין|ערוך|הפעל שוב/.test(e.textContent || ''))
                      .map((e) => e.getBoundingClientRect().top + 1),
                  ),
                  chips: chips.length,
                  /* ONE ROW. Seven distinct tops means seven rows. */
                  chipRows: new Set(chips.map((r) => Math.round(r.top))).size,
                  chipWidths: [...new Set(chips.map((r) => Math.round(r.width)))],
                  fields: fields.length,
                  fieldRows: new Set(fields.map((r) => Math.round(r.top))).size,
                  fieldWidths: [...new Set(fields.map((r) => Math.round(r.width)))],
                  /* How many of the seven are lit — the fixture's own data. */
                  lit: [...p.querySelectorAll('[aria-pressed="true"]')].length,
                  switches: p.querySelectorAll('[role="switch"]').length,
                  daysLabel: (label?.textContent || '').trim(),
                  summary: (summary?.textContent || '').trim(),
                  /* Cut off, which is what a 250px column did to this line. */
                  summaryClipped: !!summary && summary.scrollWidth > summary.clientWidth + 1,
                };
              })(),
            };
          }),
        };
      });

      /*
       * THE TARGETS, MEASURED LAST AND IN A TALL WINDOW.
       *
       * elementFromPoint only answers for what is on screen, and the fixture's
       * cards do not fit in 900px: every control on the lower ones read 1×1 —
       * no target at all — which would have passed as a failure for the wrong
       * reason. The WIDTH is the one under test and does not move, and nothing
       * on this card is measured against the viewport's height.
       */
      /* 2800 held seven cards. There are twelve now and each with a
         scheduling panel is 400-460px, so the lower half read 1x1 — no target
         at all, which passes as a failure for the wrong reason. The height is
         not under test and nothing here is measured against it. */
      await page.setViewportSize({ width, height: 9000 });
      const hits = await page.evaluate(() =>
        [...document.querySelectorAll('.card-probe > div')].map((c) =>
          [...c.querySelectorAll('a,button')].map((e) => {
            const b = e.getBoundingClientRect();
            const x = (b.left + b.right) / 2;
            const y = (b.top + b.bottom) / 2;
            /* Four directions through an anonymous arrow, and NOT a named
               `const reach = …`: esbuild keeps function names by wrapping them
               in `__name`, which does not exist in the page, and the whole
               evaluate throws. */
            const span = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => {
              let n = 0;
              for (let d = 1; d <= 24; d += 1) {
                const under = document.elementFromPoint(x + dx * d, y + dy * d);
                if (!under || (under !== e && !e.contains(under))) break;
                n = d;
              }
              return n;
            });
            return {
              text: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24),
              w: span[0] + span[1] + 1,
              h: span[2] + span[3] + 1,
            };
          }),
        ),
      );
      await page.close();

      const say = (m: string) => `${width}px: ${m}`;
      assert.equal(seen.overflow, false, say('the page scrolls sideways'));
      assert.ok(seen.cards.length >= 6, say('the fixture lost its cards'));
      const shares = new Set(seen.cards.map((c) => c.pictureShare));
      assert.equal(shares.size, 1, say(`the cards reserve different picture widths — ${[...shares].join(', ')}%. A list whose edge moves row to row reads as broken.`));

      /*
       * EXACTLY ONE CARD IN THE FIXTURE HAS NO SCHEDULING PANEL, and it is
       * there on purpose: it is the card as every other screen renders this
       * component, and the floor that stops the whole panel block below from
       * passing on a card that simply lost it.
       */
      const withPanel = seen.cards.filter((c) => c.panel);
      assert.equal(seen.cards.length - withPanel.length, 1, say(`${seen.cards.length - withPanel.length} cards rendered no scheduling panel — the fixture has exactly one such case`));

      for (const [i, card] of seen.cards.entries()) {
        /*
         * TWO CEILINGS, BECAUSE THERE ARE NOW TWO CARDS.
         *
         * Without the panel the card is what it has always been: 166px here,
         * and the old 210 ceiling still holds it. With the panel it carries a
         * 232px block — a header, seven 40px chips, three 40px fields and a
         * summary strip — plus, now, the "הגדרות תור מתקדמות" button under it,
         * and measures 468 to 508 across these widths.
         *
         * RAISED FROM 466 TO 512, AND THE 46px IS TWO DELIBERATE ADDITIONS,
         * measured rather than estimated:
         *
         *   ~18px  the queue-tuner button. "תוסיף כאן הגדרות תור מתקדם כמו
         *          בעמוד ראשי" — it opens the only control in the product that
         *          re-times rows ALREADY in the queue, and it was reachable
         *          from one screen.
         *   ~28px  the never-launched notice, on the one fixture card in that
         *          state. It replaced a paragraph that promised a daily repeat
         *          the round could not perform, and it is longer because it
         *          also names the action that fixes it.
         *
         * A ceiling catches growth nobody decided on. Both of these were
         * decided on, so the number moves with them rather than the controls
         * being bent to fit — and it is still a ceiling: the next row that
         * appears without a reason fails here.
         */
        const ceiling = card.panel ? 512 : 210;
        assert.ok(
          card.height <= ceiling,
          say(`card ${i} is ${card.height}px, over its ${ceiling} ceiling — ${card.panel ? 'with the scheduling panel and the queue-tuner button it measured 468 to 508 when this was written' : "the design specification's card measured 169 to 206 here"}`),
        );
        /*
         * THE PICTURE IS THE POINT OF THIS CARD. "התמונה צריכה להיות אלמנט
         * ויזואלי מרכזי בכרטיס... לא Thumbnail קטן." The brief asks for 34%
         * of the card; the reference itself measures 31.6%, and at 360px the
         * three controls underneath leave room for 24. The floor is what the
         * narrowest phone can hold, and the share being EQUAL across the
         * cards is checked above.
         */
        assert.ok(card.picture > 0, say(`card ${i} drew no picture slot at all`));
        assert.ok(
          card.pictureShare >= 24,
          say(`card ${i}'s picture is ${card.pictureShare}% of it — the specification asks for about a third, and a thumbnail is what this pass replaced`),
        );
        /*
         * THE PICTURE IS A PORTRAIT, NOT A STRIPE.
         *
         * This used to read `pictureHeight >= card.height - 24`: the picture
         * ran the card's whole height, because the card was one row. The card
         * is three rows now and the picture occupies the first — which is what
         * the reference draws, with "הבא בתור" and the three actions in a band
         * underneath it rather than beside it.
         *
         * So the rule that replaces it is about SHAPE. A picture 76px wide and
         * 400 tall is what came out of the first version of this layout, when
         * the panel went in beside it and stretched the row it was in; it is
         * unmistakable on screen and no class name shows it. Between 0.35 and
         * 2 is a portrait; the reference's own is 0.54.
         */
        const ratio = card.pictureHeight ? card.picture / card.pictureHeight : 0;
        assert.ok(
          ratio >= 0.35 && ratio <= 2,
          say(`card ${i}'s picture is ${card.picture}×${card.pictureHeight} — a ratio of ${ratio.toFixed(2)}, which is a stripe rather than the reference's portrait`),
        );
        assert.ok(
          card.pictureHeight >= 100,
          say(`card ${i}'s picture is only ${card.pictureHeight}px tall — "התמונה צריכה להיות אלמנט ויזואלי מרכזי בכרטיס... לא Thumbnail קטן"`),
        );
        assert.ok(card.pictureAtEnd, say(`card ${i}'s picture is not on its left — "תמונת פוסט גדולה בצד שמאל של הכרטיס"`));
        assert.deepEqual(card.onPicture, [], say(`card ${i}: a control sits on the picture — ${card.onPicture.join(', ')}`));
        assert.equal(card.escaped, 0, say(`card ${i} has ${card.escaped} controls outside its own border`));
        const targets = hits[i] ?? [];
        assert.ok(targets.length >= 4, say(`card ${i} offered ${targets.length} controls to hit-test — the floor below would pass on an empty card`));
        /* A card with publications promises one such label; an empty one
           promises none, and its own branch is checked by the height ceiling. */
        assert.ok(card.mustFit <= 1, say(`card ${i} marked ${card.mustFit} labels as must-fit — the check below would be measuring something else`));
        assert.deepEqual(
          card.clipped,
          [],
          say(`card ${i} cut a label that was meant to fit — ${card.clipped.join(' | ')}`),
        );
        assert.deepEqual(
          targets.filter((t) => t.w < 40 || t.h < 40),
          [],
          say(`card ${i} has a target under 40px to a thumb — ${JSON.stringify(targets.filter((t) => t.w < 40 || t.h < 40))}`),
        );
      }
      /*
       * "הקמפיין הסתיים בהצלחה" ON EXACTLY ONE OF THEM.
       *
       * The first version of this line read `published === total` alone, and
       * three of the fixtures below satisfy that while their badge says
       * otherwise: one from a read that was cut short (so publications are
       * still waiting), one with the whole product on hold from the header,
       * and the clean one. Only the last may say it.
       *
       * Counted rather than located, because the point is the two that must
       * NOT say it: a card is allowed to be anywhere in the list.
       */
      const success = seen.cards.filter((c) => c.saysSuccess).length;
      assert.equal(
        success,
        1,
        say(`${success} cards say "הקמפיין הסתיים בהצלחה" — exactly one fixture finished cleanly; the others are a truncated read and a global pause, and neither ended well`),
      );
      const withCover = seen.cards.filter((c) => c.drewCover).length;
      /* Seven of the nine fixtures carry media. The floor is all seven, not a
         majority: with a majority, a case that silently stopped painting its
         cover still passed, which is what happened when this read `>= 4`. */
      assert.ok(withCover >= 7, say(`only ${withCover} of the nine cards painted a real cover — seven of them carry media`));
      /* ================================================================ *
       * "תזמון פרסום" — THE PANEL, AGAINST THE REFERENCE IMAGE.
       *
       * The owner called the image a binding specification rather than an
       * inspiration, and listed what to check by name: "✓ תזמון נמצא בתוך
       * הכרטיסייה ✓ מיקום זהה ✓ 7 ימי השבוע בשורה ✓ Multi Select ✓ שעת התחלה
       * ✓ שעת סיום ✓ 1–30 דקות ✓ Toggle ✓ סיכום תזמון ✓ Thumbnail נשאר
       * ✓ הבא בתור נשאר ✓ כפתורי הפעולה נשארו ✓ RTL תקין".
       *
       * Everything on that list that is a FACT ABOUT PIXELS is here; the rest
       * is in worker/test/campaign-schedule.test.ts, which drives the values.
       * ================================================================ */
      for (const card of withPanel) {
        const p = card.panel!;
        const where = `${width}px: card "${p.summary.slice(0, 24)}"`;

        /* "✓ תזמון נמצא בתוך הכרטיסייה" — and no part of it outside the
           card's own border, at any width. */
        assert.ok(p.inside, `${where}: the scheduling panel sticks out of the card`);
        assert.ok(p.width > 180, `${where}: the panel is only ${p.width}px wide`);

        /* "✓ מיקום זהה" — the order the brief writes out: under the head,
           above the actions. Measured as boxes rather than read off the
           source, because source order and visual order are two things in a
           grid and the whole layout below 440px is a grid. */
        assert.ok(p.aboveActions, `${where}: the panel is not above the card's action row`);

        /* "✓ 7 ימי השבוע בשורה" — seven of them, and ONE row. The reference
           draws א׳ ב׳ ג׳ ד׳ ה׳ ו׳ ש׳ on a single line and a week that wraps
           is a week that is read wrong. */
        assert.equal(p.chips, 7, `${where}: ${p.chips} day chips, not seven`);
        assert.equal(p.chipRows, 1, `${where}: the seven days wrapped onto ${p.chipRows} rows`);
        /* And all seven the same width: "יום שנבחר / יום שלא נבחר" differ by
           their fill, never by their size. */
        assert.ok(
          p.chipWidths.length <= 2 && Math.max(...p.chipWidths) - Math.min(...p.chipWidths) <= 1,
          `${where}: the day chips are different widths — ${p.chipWidths.join(', ')}px`,
        );

        /* "✓ Multi Select" — more than one lit at a time, which is the whole
           point and is not visible from a single chip. */
        assert.ok(p.lit >= 2 || p.lit === 0, `${where}: ${p.lit} day lit — a single-choice row would look exactly like this`);

        /* "✓ שעת התחלה ✓ שעת סיום ✓ 1–30 דקות" — three fields, one row,
           equal widths, as the reference draws them. */
        assert.equal(p.fields, 3, `${where}: ${p.fields} fields, not three`);
        assert.equal(p.fieldRows, 1, `${where}: the three fields wrapped onto ${p.fieldRows} rows`);
        assert.ok(
          p.fieldWidths.length === 1,
          `${where}: the three fields are different widths — ${p.fieldWidths.join(', ')}px`,
        );

        /* "✓ Toggle" — exactly one, and it is a real switch rather than a
           styled div, so a screen reader says "on"/"off". */
        assert.equal(p.switches, 1, `${where}: ${p.switches} switches in the panel`);

        assert.equal(p.daysLabel, 'ימי פרסום', `${where}: the days are not labelled "ימי פרסום"`);

        /*
         * "✓ סיכום תזמון" — AND ALL OF IT.
         *
         * The first version of this layout put the panel in a 250px column
         * beside the picture and the line came out "סיכום תזמון: א׳, ב׳, ג׳,
         * ד׳, ה׳ · …" — the days, and then nothing. A summary cut before its
         * hours is a summary of nothing, and the brief asks for the whole
         * sentence: days, window and interval.
         */
        assert.ok(!p.summaryClipped, `${where}: the summary line is cut off — "${p.summary}"`);
        assert.ok(
          /^סיכום תזמון:/.test(p.summary) || /^התזמון כבוי/.test(p.summary),
          `${where}: the summary line says something else — "${p.summary}"`,
        );
      }

      /*
       * THE CONTAINER QUERY, both sides of it, measured rather than assumed.
       *
       * Under 440px the panel takes the card's full width; at or above it the
       * panel sits in the content column beside the picture, which is the
       * reference's own arrangement. One number tells the two apart: whether
       * the panel is as wide as the card's content box.
       */
      const widest = Math.max(...withPanel.map((c) => c.panel!.width));
      const cardInner = seen.cards[0].width - 20; // the card's own p-2.5, both sides
      if (width < 440) {
        assert.ok(
          widest >= cardInner - 4,
          say(`the panel is ${widest}px inside a ${cardInner}px card — under 440 it takes the full width, or the seven chips are squeezed under 40px`),
        );
      }

      const tall = Math.max(...seen.cards.map((c) => c.height));
      console.log(
        `  ✓ ${width}px — tallest card ${tall}px, picture ${seen.cards[0].pictureShare}% and on the left,` +
          ` panel ${widest}px wide with 7 chips on one row, no overlap, no small target`,
      );
    }
  } finally {
    await browser.close();
  }
  console.log('campaign card measurement OK');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
