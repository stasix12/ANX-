/**
 * THE 100-PUBLICATION CYCLE — THE ARITHMETIC, THE WIRING AND THE CARD.
 *
 * worker/test/cycle-db.test.ts proves the mechanism against a real Postgres:
 * the lock, the two ceilings, the window, the switch. This file covers the
 * three things that live outside the database and are just as easy to get
 * wrong:
 *
 *   · the pure functions the card counts down with;
 *   · the ENGINE WIRING — where the gate sits, what it does and does not
 *     switch off, and that the counter is advanced in exactly one place;
 *   · the card, rendered in a browser at the three phone widths, in all
 *     three of its states.
 *
 *   npx tsx worker/test/cycle.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CYCLE_LIMIT, CYCLE_REST_HOURS, CYCLE_ROUNDS_PER_WINDOW, cycleCountdown, cycleRestLeftMs, cycleResting, type PublishCycle } from '@/lib/social/publish-cycle';

let checks = 0;
const is = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};
const src = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

/* ══════════════ 1. THE OWNER'S NUMBERS ══════════════════════════════════ */

eq(CYCLE_LIMIT, 100, '"כל 100 פרסומים מוצלחים"');
/*
 * EIGHT IN THE BRIEF, SIX BY HIS DECISION ON 12.11 — after he had watched a
 * real round close on his own account. Pinned rather than left loose because
 * the engine and the card read the same constant, and a pause the card
 * promises and the engine does not keep is the worst of both.
 */
eq(CYCLE_REST_HOURS, 6, 'the pause is six hours — "תקטין את ההפסקה של ה 8 שעות", 12.11');
/*
 * "ביממה של 24 שעות אפשר עד שתי סבבים (200) קבוצות ככה אנחנו בסדר."
 *
 * The second ceiling, and it is not decoration. Eight hours alone does NOT
 * guarantee two rounds: measured on his own ten days, at the fast end of his
 * pace (31/hour on 11.11) a hundred publications take 3.2 hours, so a cycle
 * is 11.2 hours and a third round starts at hour 22.4 — about 214 in the day,
 * inside the 210–265 band where every rate limit on both accounts landed.
 */
eq(CYCLE_ROUNDS_PER_WINDOW, 2, 'and at most two rounds in twenty-four hours');

/* ══════════════ 2. THE COUNTDOWN IS A VIEW OF A STORED INSTANT ══════════ */

const at = (restUntil: string | null, enabled = true, resting = false): PublishCycle => ({
  ok: true, enabled, crossed: false, count: 0, limit: 100,
  restUntil, resting, roundsInWindow: 0, roundsPerWindow: 2, windowStartedAt: null, cycleStartedAt: null,
});
const T = 1_800_000_000_000;

is(!cycleResting(null), 'no state is not a hold');
is(!cycleResting(at(null)), 'no instant is not a hold');
is(!cycleResting(at(new Date(T + 60_000).toISOString(), false), T), 'and a switched-off mechanism never holds, whatever instant it carries');
is(cycleResting(at(new Date(T + 60_000).toISOString()), T), 'an instant in the future holds');
is(!cycleResting(at(new Date(T - 1).toISOString()), T), 'an instant that has passed does not');
/*
 * THE CLOCK IS COMPARED, NEVER COUNTED DOWN. This is the whole of "זמן
 * ההפסקה חייב להישמר בצד השרת ובמסד הנתונים, ולא להסתמך על טיימר מקומי
 * בדפדפן": refresh, close the tab, change the system clock — the answer is
 * recomputed from the row every time, so it cannot drift and cannot be lost.
 */
is(!/setTimeout|Date\.now\(\) \+/.test(src('src/lib/social/publish-cycle.ts').replace(/\/\*[\s\S]*?\*\//g, '')), 'nothing in the module starts a timer or stores a deadline of its own');

/*
 * ─── A CLOCK THAT MOVED · "שינוי שעה במערכת (Clock change) לא משבש את
 *     ההפסקה" ──────────────────────────────────────────────────────────────
 *
 * The engine runs on a Windows PC in his living room. Nobody audits its
 * clock, and a machine three hours fast would, on a naive comparison, decide
 * the eight hours were up and publish straight back into the limit. So the
 * DATABASE says whether it is holding, against its own clock, inside the
 * lock that wrote the instant — and that answer can only ever add a hold.
 */
is(cycleResting(at(new Date(T - 4 * 3600_000).toISOString(), true, true), T), 'a machine four hours fast cannot end a hold the server still reports');
is(cycleResting(at(null, true, true), T), 'and the verdict stands even if the instant itself failed to arrive');
is(!cycleResting(at(new Date(T - 1).toISOString(), true, false), T), 'while a server that says it is done is believed too — the hold ends on time');
is(!cycleResting(at(new Date(T + 3600_000).toISOString(), false, true), T), 'and a switched-off mechanism holds nothing, whatever the server last said');

eq(cycleRestLeftMs(at(new Date(T + 125_000).toISOString()), T), 125_000, 'the time left is the stored instant minus now');
eq(cycleRestLeftMs(at(new Date(T - 5).toISOString()), T), 0, 'and never negative');
eq(cycleCountdown(0), '00:00:00', 'zero reads as zero rather than empty');
eq(cycleCountdown(8 * 3600_000), '08:00:00', 'eight hours');
eq(cycleCountdown(7 * 3600_000 + 59 * 60_000 + 59_000), '07:59:59', 'a second under eight, the reference image\'s own figure');
eq(cycleCountdown(61_000), '00:01:01', 'and the small numbers are padded, so the chip never changes width');

/* ══════════════ 3. THE ENGINE: ONE COUNTER, AND A GATE THAT SPARES THE
 *                   CHORES ══════════════════════════════════════════════ */

{
  const worker = src('worker/social-worker.ts');

  /*
   * COUNTED IN EXACTLY ONE PLACE, and that place is below the write the
   * DATABASE accepted — not the one the composer believed. A second call
   * site would be a second opinion about the number that decides whether his
   * account keeps publishing.
   */
  const counts = [...worker.matchAll(/cycleTick\(db, true\)/g)];
  eq(counts.length, 1, 'the cursor is advanced in exactly one place');
  const countAt = worker.indexOf('cycleTick(db, true)');
  const recordedAt = worker.indexOf('if (!recorded) {');
  is(recordedAt > -1 && countAt > recordedAt, 'and it sits AFTER the guard that returns when the row would not save — an unrecorded publication must not count');

  /* The read is a read. A tick that counted would climb while nothing published. */
  is(/cycleTick\(db, false\)/.test(worker), 'the per-tick read asks without advancing');

  /*
   * ─── AND A PUBLICATION MARKED BY HAND COUNTS TOO ────────────────────────
   *
   * "פרסומים שסומנו ידנית — כן, נספר", decided by the owner on 11.11.
   *
   * It is the same account and the same quota, and Facebook cannot tell which
   * of our two hands posted it. This was MISSING from the first version of
   * the feature — the counter lived only in the engine, so a day with twenty
   * hand-marked publications would have run twenty past the ceiling without
   * the mechanism ever knowing. Caught by writing this report, not by the
   * suite, which is why the assertion exists now.
   */
  const client = src('src/lib/social/client.ts');
  const markAt = client.indexOf('export async function markManualPublished');
  const mark = client.slice(markAt, client.indexOf('export ', markAt + 40));
  is(markAt > -1 && /cycleTick\(db\(\), true\)/.test(mark), 'a hand-marked publication advances the cursor as well');
  is(
    mark.indexOf('updateQueueItem') > -1 && mark.indexOf('updateQueueItem') < mark.indexOf('cycleTick'),
    'and only AFTER the row saved — updateQueueItem throws when it did not, so a failed mark cannot spend a slot',
  );
  is(/cycleTick\(db\(\), false\)/.test(client), 'while the screen reads the state without advancing it');

  /*
   * THE GATE SPARES THE IDLE CHORES, which is the whole reason it is not a
   * `return idle(...)` at the top of the tick. One of those chores is
   * verifySubmitted — the sweep that CONFIRMS a parked publication — so a
   * pause that switched the chores off would have stopped the very thing
   * that tells this mechanism a publication succeeded.
   */
  is(
    /if \(\(!due\?\.length \|\| holdingForGap \|\| holdingForCycle\) && state\.lanes\.every/.test(worker),
    'the rest enters the idle-chore branch rather than returning above it',
  );
  /* And nothing new is claimed. Reached only when a lane is still in flight. */
  /*
   * ANCHORED ON THE PUBLISHING sessionReady AND NOT THE FIRST ONE IN THE
   * FILE. There are two: the chore branch verifies the login before running a
   * chore, and the publish path verifies it before claiming. indexOf finds
   * the chore one, which sits ABOVE this gate and made the first version of
   * this assertion fail on correct code. The publishing one is the line that
   * clears the idle latch straight after.
   */
  const gateAt = worker.indexOf('if (holdingForCycle) return;');
  const claimAt = worker.indexOf("state.idleNoticeShown = false;", gateAt);
  is(gateAt > -1 && claimAt > gateAt, 'and no new publication is claimed while it holds');
  is(worker.slice(gateAt, claimAt).includes('sessionReady'), 'the gate sits immediately before the publish path, not somewhere earlier');

  /*
   * A FAILED READ KEEPS THE LAST ANSWER. A dropped connection on a home line
   * must not read as "nothing is holding" — that turns one bad second into a
   * hundred publications past the ceiling.
   */
  is(/if \(cycleNow\) \{\s*state\.cycle = cycleNow;/.test(worker), 'state.cycle is replaced only when the database answered');
  is(!/state\.cycle = null/.test(worker), 'and nothing clears it on a failure');

  /*
   * THE ENGINE NEVER COMPARES THE STORED INSTANT TO ITS OWN CLOCK. Every
   * decision goes through cycleResting(), which prefers the server's verdict.
   * A `restUntil > Date.now()` anywhere in this file would be the clock-skew
   * hole reopening quietly, so it is forbidden outright rather than reviewed.
   */
  is(
    !/restUntil\s*[<>]|Date\.parse\([^)]*restUntil|restUntil[^\n]*getTime\(\)/.test(worker),
    'the engine asks the database whether it is holding — it never does the clock arithmetic itself',
  );

  /*
   * ─── "אין פרסומים כפולים לאחר חזרה מהפסקה" ───────────────────────────
   *
   * The reason there cannot be: the hold does not touch the queue. It is a
   * bare `return` taken BEFORE anything is claimed, so every row it passed
   * over is still exactly `pending` when the eight hours end, and the same
   * claim that would have run now runs then. Nothing is marked, reserved,
   * consumed or re-queued, which is the only way a resume cannot double.
   */
  const gateEnd = gateAt + 'if (holdingForCycle) return;'.length;
  const holdPath = worker.slice(worker.indexOf('const cycleNow = await cycleTick(db, false);'), gateEnd);
  is(holdPath.length > 0 && !/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(holdPath), 'the whole hold path writes no row at all — the queue it paused is the queue it resumes, untouched');
  is(!/social_queue/.test(src('src/lib/social/publish-cycle.ts')), 'and the mechanism itself never names the queue table');

  /* ONE LOG LINE PER PAUSE, latched on the instant. The removed rest left
     this lesson behind in its own comment: "eighty identical rows in the log
     the owner reads to find out whether anything is broken". */
  is(/state\.cycleNoticeFor !== state\.cycle\?\.restUntil/.test(worker), 'the pause is announced once per pause, not once per tick');
}

/* ══════════════ 4. THE REMOVED REST IS STILL REMOVED ════════════════════ */

/*
 * THE DECISIVE SECTION. A burst-and-rest inside a pace profile was removed on
 * 08.11.2026 after a measurement, and worker/test/smart-pace.test.ts §4 pins
 * its absence. This mechanism is a DIFFERENT thing — a volume ceiling held in
 * its own table, counted from real publications, with no pace profile
 * anywhere near it — and the proof that it is different is that every one of
 * those assertions still passes untouched. None of them was weakened to make
 * room for this.
 */
{
  const rules = src('src/lib/social/rules.ts');
  is(!/paceRestRemainingMs|paceRestLabel/.test(rules), 'the removed rest is still gone from rules.ts');
  const worker = src('worker/social-worker.ts');
  is(!/paceRestRemainingMs|paceRestLabel|restMs/.test(worker), "and from the worker's pre-claim gate");
  for (const p of ['src/components/social/SmartPaceCard.tsx', 'src/app/social/campaigns/page.tsx']) {
    is(!/הפסקה אוטומטית/.test(src(p)), `${p} still promises no automatic rest of its own`);
  }
  /*
   * AND THE NEW TITLE LIVES IN THE COMPONENT, NOT ON THE PAGE. smart-pace's
   * loop forbids that sentence in four named files, the dashboard among them.
   * Putting the card in its own file is not a way round the rule — it is the
   * rule being satisfied: the dashboard still promises nothing, and the thing
   * that does promise is the thing that implements it.
   */
  is(!/הפסקה אוטומטית/.test(src('src/app/social/page.tsx')), 'the dashboard page carries no such sentence');
  is(/הפסקה אוטומטית אחרי \{cycle\.limit\} פרסומים/.test(src('src/components/social/CycleCard.tsx')), 'the card does, and counts it off the database');

  /*
   * ─── ONE TIMER, AND IT MOVES DIGITS ─────────────────────────────────────
   *
   * THE REASON THIS FILE EXISTS AT ALL. scene-states.test.ts holds
   * LiveFlow.tsx to one setInterval and no clock read, and threw this card
   * out when it was written in there — correctly: on the flow, every number
   * is a fact the worker wrote, and a card reading a clock would be advancing
   * a publication by itself. A countdown cannot live under that rule.
   *
   * So the same rule is enforced here in the form this card can honestly
   * keep: the clock may move the DIGITS, the hold itself is the database's
   * verdict, and the interval may not run while nothing is holding.
   */
  const cc = src('src/components/social/CycleCard.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const timers = cc.match(/setInterval\([\s\S]{0,60}/g) ?? [];
  eq(timers.length, 1, 'exactly one timer on the cycle card');
  is(/setNow/.test(timers[0] ?? ''), 'and all it does is move the clock the digits are drawn from');
  is(/if \(!cycleResting\(cycle, Date\.now\(\)\)\) return;/.test(cc), 'and it does not run at all while nothing is holding — an idle interval is a wake-up a minute on a phone left open all day');
  is(!/count\s*[+-]|limit\s*[+-]|\bDate\.now\(\) \+/.test(cc), 'nothing on the card does arithmetic on the count, the ceiling or the instant');
  /* AND LIVEFLOW KEEPS ITS OWN RULE UNTOUCHED, which is the point of the split. */
  const lf = src('src/components/social/LiveFlow.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  is(!/Date\.now|new Date\(/.test(lf), 'and the flow itself still reads no clock');
  is(/<CycleCard /.test(lf), 'while still rendering the card between the stage rail and the queue');
}

/* ══════════════ 5. THE CARD, IN A BROWSER ══════════════════════════════ */

async function main(): Promise<void> {
  const { build } = await import('esbuild');
  const { mkdtempSync, readdirSync, statSync, writeFileSync, copyFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;
  const { chromium } = await import('playwright-core');

  const CHUNKS = path.resolve('.next/static/chunks');
  let best: { file: string; size: number } | null = null;
  try {
    for (const name of readdirSync(CHUNKS)) {
      if (!name.endsWith('.css')) continue;
      const file = path.join(CHUNKS, name);
      const size = statSync(file).size;
      if (!best || size > best.size) best = { file, size };
    }
  } catch {
    best = null;
  }
  if (!best) {
    console.log(`publish cycle OK — ${checks} assertions (the card was SKIPPED — run \`npm run build\` first)`);
    return;
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'cycle-'));
  copyFileSync(best.file, path.join(dir, 'app.css'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-cycle.tsx')],
    outfile: path.join(dir, 'm.js'),
    bundle: true, format: 'iife', jsx: 'automatic', keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css"><body class="bg-ink-950"><div id="root"></div><script src="m.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    for (const width of [360, 390, 430]) {
      const w = `${width}px`;
      for (const which of ['running', 'resting', 'off']) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const crashes: string[] = [];
        page.on('pageerror', (e) => crashes.push(String(e)));
        await page.goto(`file://${path.join(dir, 'index.html')}?s=${which}`);
        await page.waitForSelector('.anxc-card');

        const seen = await page.evaluate(() => ({
          over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          /* Every control on this screen carries the product's 40px floor,
             and the switch carries 44 because it decides eight hours. */
          small: [...document.querySelectorAll('button')].map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0 && (b.height < 44 || b.width < 44)).length,
          /* A label cut off is a number nobody can read; measured rather than
             eyeballed, the same way every other card on this screen is. */
          cut: [...document.querySelectorAll('.anxc-card p, .anxc-card h3, .anxc-rest span')].filter((e) => e.scrollWidth > e.clientWidth + 1).length,
          rest: document.querySelectorAll('.anxc-rest').length,
          clock: document.querySelector('.anxc-clock')?.textContent?.trim() ?? '',
          count: document.querySelector('.anxc-count')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          /* The sentence that PROMISES the pause, read off the rendered card.
             A hardcoded number here and a different constant in the engine
             would be the card lying about something the owner plans around. */
          promise: document.querySelector('.anxc-sub')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
          barPct: (() => {
            const t = document.querySelector('.anxc-track') as HTMLElement | null;
            const f = document.querySelector('.anxc-bar') as HTMLElement | null;
            if (!t || !f) return -1;
            return Math.round((f.getBoundingClientRect().width / t.getBoundingClientRect().width) * 100);
          })(),
          switchOn: document.querySelector('.anxc-switch')?.getAttribute('aria-checked') ?? '',
          /* RTL: the card has to be laid out right-to-left like the screen
             around it, not merely contain Hebrew. */
          rtl: getComputedStyle(document.querySelector('.anxc-card') as Element).direction,
        }));

        eq(seen.over, false, `${w}/${which}: the card widened the page`);
        eq(seen.small, 0, `${w}/${which}: a control under the 44px floor`);
        eq(seen.cut, 0, `${w}/${which}: a line is cut off`);
        eq(seen.rtl, 'rtl', `${w}/${which}: the card is not laid out right-to-left`);
        eq(crashes, [], `${w}/${which}: the card threw`);

        if (which === 'running') {
          eq(seen.count, '37 / 100', `${w}: the meter prints the database's own two numbers`);
          /* THE BAR IS THE COUNT, not a decoration. 37 of 100 is 37% of the
             track, measured in pixels off the rendered element. */
          is(Math.abs(seen.barPct - 37) <= 2, `${w}: the bar is ${seen.barPct}% for 37/100`);
          eq(seen.rest, 0, `${w}: nothing is holding, so no hold band is drawn`);
          eq(seen.switchOn, 'true', `${w}: the switch reads as on`);
          /*
           * THE CARD PROMISES THE ENGINE'S OWN NUMBER. Added on 12.11 with
           * the move from eight hours to six: the subtitle is the only place
           * the owner is TOLD how long a pause lasts, and he schedules his
           * day around it. Measured off the rendered text, so a literal
           * typed into the JSX fails here rather than on his screen.
           */
          is(
            seen.promise.includes(`${CYCLE_REST_HOURS} שעות`),
            `${w}: the card promises the engine's own pause (${CYCLE_REST_HOURS}h) — got "${seen.promise}"`,
          );
          is(seen.promise.includes(String(CYCLE_LIMIT)), `${w}: and the engine's own ceiling`);
        }
        if (which === 'resting') {
          eq(seen.rest, 1, `${w}: the hold band is drawn`);
          is(/^0[78]:\d\d:\d\d$/.test(seen.clock), `${w}: the countdown reads HH:MM:SS — got "${seen.clock}"`);
          eq(seen.barPct, 0, `${w}: a fresh round after the pause began reads zero`);
        }
        if (which === 'off') {
          eq(seen.switchOn, 'false', `${w}: the switch reads as off`);
          /* OFF IS A STATE WORTH SAYING. A dormant meter reads as "nothing has
             published yet", which is a different and much more alarming
             sentence than "this is switched off". */
          is((await page.locator('.anxc-off').count()) === 1, `${w}: an off mechanism says so in words`);
          eq(seen.rest, 0, `${w}: and holds nothing`);
        }
        await page.close();
      }
    }

    /* ─── A REFRESH IN THE MIDDLE OF A PAUSE ─────────────────────────────
     *
     * "רענון דף (Refresh) באמצע הפסקה."
     *
     * The failure this rules out is a countdown that is really a local timer:
     * it would show the full eight hours again on every load, and the owner
     * would watch a pause that never ends. The page is handed an ABSOLUTE
     * instant here precisely so the second load cannot recompute it — if the
     * digits after a reload are not LOWER than the digits before it, the
     * clock is being started rather than read.
     */
    {
      const secs = (t: string) => {
        const m = /^(\d\d):(\d\d):(\d\d)$/.exec(t.trim());
        return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : -1;
      };
      const until = new Date(Date.now() + 2 * 3600_000 + 30 * 60_000).toISOString();
      const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
      const crashes: string[] = [];
      page.on('pageerror', (e) => crashes.push(String(e)));
      const url = `file://${path.join(dir, 'index.html')}?s=resting&until=${encodeURIComponent(until)}`;
      await page.goto(url);
      await page.waitForSelector('.anxc-clock');
      const first = secs((await page.textContent('.anxc-clock')) ?? '');
      is(first > 2 * 3600 && first <= 2 * 3600 + 30 * 60, `the stored instant reads as about two and a half hours — got ${first}s`);

      await page.waitForTimeout(2200);
      const ticked = secs((await page.textContent('.anxc-clock')) ?? '');
      is(ticked < first, `the digits move on their own — ${first}s then ${ticked}s`);

      await page.reload();
      await page.waitForSelector('.anxc-clock');
      const after = secs((await page.textContent('.anxc-clock')) ?? '');
      is(after <= ticked, `a refresh CONTINUES the pause instead of restarting it — ${ticked}s before the reload, ${after}s after`);
      is(after < first, 'and the reloaded page does not show the full pause again');
      eq(await page.locator('.anxc-rest').count(), 1, 'the hold band is still drawn after the refresh');
      eq(crashes, [], 'and nothing threw across the reload');
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`publish cycle OK — ${checks} assertions, the card measured at 360/390/430 in all three states, and a pause survived a refresh`);
}

void main();
