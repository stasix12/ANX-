import assert from 'node:assert/strict';
import type { SocialTarget } from '@/lib/social/types';

/**
 * The TargetPicker's set operations, isolated. The bug these cover: a post
 * reopened with Arad still selected, then "all of Be'er Sheva" tapped —
 * the quick set merged instead of replacing, so Arad came along, and with
 * the filter on Be'er Sheva those rows were off-screen and unremovable.
 */
const mk = (id: string, city: string): Pick<SocialTarget, 'id' | 'city' | 'enabled' | 'channel'> => ({
  id,
  city,
  enabled: true,
  channel: 'facebook_group',
});
const all = [...['b1', 'b2', 'b3'].map((id) => mk(id, 'באר שבע')), ...['a1', 'a2'].map((id) => mk(id, 'ערד'))];
const visibleIn = (city: string) => all.filter((t) => t.city === city);

const enabledIds = (items: typeof all) => items.filter((t) => t.enabled).map((t) => t.id);
const only = (items: typeof all) => enabledIds(items);
const also = (selected: string[], items: typeof all) => Array.from(new Set([...selected, ...enabledIds(items)]));
const hidden = (selected: string[], visible: typeof all) => selected.filter((id) => !visible.some((t) => t.id === id));

// "Only Be'er Sheva" replaces — Arad does not survive it.
assert.deepEqual(only(visibleIn('באר שבע')), ['b1', 'b2', 'b3'], 'replace drops the previous selection');

// The explicit "+" still merges, for someone who wants both cities.
assert.deepEqual(also(['a1', 'a2'], visibleIn('באר שבע')), ['a1', 'a2', 'b1', 'b2', 'b3'], 'the + button merges');
assert.deepEqual(also(['b1'], visibleIn('באר שבע')), ['b1', 'b2', 'b3'], 'merging is idempotent');

// Anything selected but filtered out is detected, so it can be shown or removed.
assert.deepEqual(hidden(['a1', 'a2', 'b1'], visibleIn('באר שבע')), ['a1', 'a2'], 'off-screen selections are found');
assert.deepEqual(hidden(['b1', 'b2'], visibleIn('באר שבע')), [], 'nothing hidden when the filter covers the selection');

// Removing them keeps exactly what is on screen.
const afterRemove = ['a1', 'a2', 'b1'].filter((id) => visibleIn('באר שבע').some((t) => t.id === id));
assert.deepEqual(afterRemove, ['b1'], 'remove strips only the hidden ones');

/* ───────── "−" : taking a whole set OUT of the selection ─────────────────
 *
 * "תוסיף כאן גם את האופציה להסיר את הקטגוריה כמו הדוברי רוסית."
 *
 * The screen had three ways to ADD and exactly one way to subtract — "נקה
 * הכל", which throws the whole selection away. Deciding that the
 * Russian-speaking groups should not get this post meant either starting over
 * or un-ticking 138 rows one at a time.
 */
const less = (selected: string[], items: { id: string }[]) => {
  const drop = new Set(items.map((t) => t.id));
  return selected.filter((id) => !drop.has(id));
};
const chosenIn = (selected: string[], items: { id: string }[]) => items.filter((t) => selected.includes(t.id)).length;

assert.deepEqual(less(['a1', 'a2', 'b1', 'b2'], visibleIn('באר שבע')), ['a1', 'a2'], 'removing a set leaves every other selection alone');
assert.deepEqual(less(['a1', 'a2'], visibleIn('באר שבע')), ['a1', 'a2'], 'removing a set nothing was selected from changes nothing');
assert.deepEqual(less(less(['a1', 'b1'], visibleIn('באר שבע')), visibleIn('באר שבע')), ['a1'], 'and doing it twice is the same as doing it once');
/* ORDER IS PRESERVED. The selection is an array the campaign is built from,
   and a subtraction that reordered it would reorder the queue. */
assert.deepEqual(less(['b3', 'a1', 'b1'], [{ id: 'b1' }]), ['b3', 'a1'], 'the surviving selection keeps its order');

/*
 * A SWITCHED-OFF TARGET IS STILL REMOVABLE. `only` and `also` skip one on
 * purpose — there is no sense adding somewhere that cannot publish — but a
 * disabled target that is somehow already selected is exactly what the owner
 * wants gone, and `enabledIds` here would leave it ticked with no way to
 * untick it from this row.
 */
const withDisabled = [{ id: 'b1', enabled: false }, { id: 'b2', enabled: true }];
assert.deepEqual(less(['b1', 'b2', 'a1'], withDisabled), ['a1'], 'subtraction takes the set as it is, enabled or not');

/* The button appears only when it would do something. A control that can only
   no-op is the one pressed twice and then reported as broken. */
assert.equal(chosenIn(['a1', 'a2'], visibleIn('באר שבע')), 0, 'nothing of this set is selected, so no "−" is offered');
assert.equal(chosenIn(['a1', 'b2'], visibleIn('באר שבע')), 1, 'and it says how many it would take');

/* ───────── the chip must name the set it actually replaces ──────────────
 *
 * `visible` is narrowed by city, category, channel AND the search box, and the
 * chip was labelled with the city alone: with "דוברי רוסית" chosen it read
 * "רק באר שבע (18)" over a set that was the Russian-speaking part of Be'er
 * Sheva, and pressing it replaced the whole selection with that.
 */
const shownLabel = (query: string, city: string, category: string) =>
  query.trim() ? 'המוצגים' : [city, category].filter(Boolean).join(' · ') || 'כל המוצגים';
assert.equal(shownLabel('', 'באר שבע', ''), 'באר שבע', 'a city filter alone still reads as the city');
assert.equal(shownLabel('', 'באר שבע', 'דוברי רוסית'), 'באר שבע · דוברי רוסית', 'a category narrows it, so the chip says so');
assert.equal(shownLabel('', '', 'דוברי רוסית'), 'דוברי רוסית', 'and a category on its own names itself');
assert.equal(shownLabel('', '', ''), 'כל המוצגים', 'with no filter it is everything on screen');
assert.equal(shownLabel('ספות', 'באר שבע', 'דוברי רוסית'), 'המוצגים', 'a search narrows by words no chip can hold, so the label steps back');

/* ───────── and the component still does what this file simulates ────────
 *
 * Everything above is a copy of the picker's set operations. A copy stops
 * being a test the moment the original changes, so each one is pinned to the
 * line it stands for.
 */
{
  const src = require('node:fs').readFileSync(new URL('../../src/components/social/TargetPicker.tsx', import.meta.url), 'utf8') as string;
  const pin = (needle: string, what: string) => assert.ok(src.includes(needle), `TargetPicker.tsx no longer ${what}`);
  pin('const drop = new Set(items.map((t) => t.id));', 'subtracts by id');
  pin('onChange(selected.filter((id) => !drop.has(id)));', 'keeps the rest of the selection when removing a set');
  pin('const chosenIn = (items: SocialTarget[]) => items.filter((t) => selected.includes(t.id)).length;', 'counts what a removal would take');
  pin('{chosenIn(q.items) > 0 && (', 'hides "−" when it would do nothing');
  pin('const inSet = new Set(items.map((t) => t.id));', 'builds the complement by id');
  pin('return enabledIds(targets.filter((t) => !inSet.has(t.id)));', 'and takes only targets that can publish');
  pin('{q.except && complementOf(q.items).length > 0 && (', 'hides "הכל חוץ מ…" when there is nothing left over, or when the set is not the filter');
  pin('{ label: shownLabel, items: visible, except: true },', 'labels that chip with it, and offers the complement of exactly that set');
  pin("const shownLabel = query.trim() ? 'המוצגים' : [city, category].filter(Boolean).join(' · ') || 'כל המוצגים';", 'names the set its first chip replaces');
  /* `less` must not borrow enabledIds — see the note above. Matched on the
     call, not the word, so the comment explaining it cannot satisfy this. */
  assert.ok(!/const less = \(items: SocialTarget\[\]\) => \{[\s\S]{0,200}enabledIds\(/.test(src), 'subtraction must not skip a disabled target — it would be unremovable');
}

/* ───────── EVERYTHING EXCEPT THIS SET, pressed in a browser ─────────────
 *
 * "אני רוצה לפרסם את זה בכל הקבוצות אבל לא נותן לי למחוק קטגוריות רק (רק
 *  להוסיף) .. תטפל בזה כמה שצריך ותבדוק את עצמך הפעם."
 *
 * HOW A MISSING BUTTON PASSED EVERY TEST IN THIS FILE. Everything above is a
 * copy of the picker's set operations, pinned to the lines it stands for, and
 * what came after it rendered the component once with renderToStaticMarkup and
 * measured the pixels. Neither can reach a control that only exists once a
 * CATEGORY HAS BEEN CHOSEN — and the complement is nothing else: there is no
 * "everything except" until there is a "this", and the only way to say which
 * is to press a chip. A static render presses nothing, so the half of this
 * screen he was complaining about was outside anything this suite could see.
 *
 * So the measurement moved into a page with React running behind it, and the
 * buttons are pressed. The assertions are about what the picker HANDED BACK —
 * the id list the post editor turns into a campaign — not about which rows
 * look ticked, because the list is what publishes.
 */
async function drive(): Promise<void> {
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
    console.log('target-picker tests OK (interaction SKIPPED — run `npm run build` first)');
    return;
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'picker-'));
  copyFileSync(best.file, path.join(dir, 'app.css'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-picker.tsx')],
    outfile: path.join(dir, 'picker.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div id="root"></div><script src="picker.js"></script></body></html>`,
  );

  let checks = 0;
  const eq = (a: unknown, b: unknown, msg: string) => {
    checks += 1;
    assert.deepEqual(a, b, msg);
  };
  const is = (cond: unknown, msg: string) => {
    checks += 1;
    assert.ok(cond, msg);
  };

  const RUSSIAN = 'דוברי רוסית';
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    for (const width of [360, 390, 430]) {
      const at = `${width}px`;
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const crashes: string[] = [];
      page.on('pageerror', (e) => crashes.push(String(e)));
      await page.goto(`file://${path.join(dir, 'index.html')}`);
      await page.waitForSelector('input[aria-label="חיפוש יעד"]');

      const out = () => page.evaluate(() => window.__selected);
      /* The expected answers, derived from the fixture's own rows rather than
         written down as numbers — a literal would quietly stop being the right
         answer the day the fixture changes, and still pass. */
      const data = await page.evaluate(() => window.__targets);
      const russian = data.filter((t) => t.category === RUSSIAN);
      const rest = data.filter((t) => t.category !== RUSSIAN);
      const restEnabled = rest.filter((t) => t.enabled).map((t) => t.id);
      const btn = (text: string) => page.locator('button', { hasText: text });

      /* ── the state he is actually in: nothing selected ───────────────── */
      is(await page.getByText('נבחרו 0').count(), `${at}: the picker opens with nothing selected`);
      /* THE COMPLAINT, AS AN ASSERTION. From an empty selection "−" cannot do
         anything, so it is not drawn — which is right, and which is why the
         row has to carry an action that does not need a selection first. */
      eq(await page.locator('button', { hasText: '−' }).count(), 0, `${at}: "−" is drawn where it could only no-op`);

      /* ── choose the category, exactly as he did ──────────────────────── */
      await page.locator(`[aria-label="קטגוריה"] button`, { hasText: RUSSIAN }).first().click();
      await page.waitForFunction(
        (n) => [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').includes(`רק ${n}`)),
        RUSSIAN,
      );
      is(await btn(`רק ${RUSSIAN} (${russian.length})`).count(), `${at}: the filtered set is not named`);

      /*
       * ── AND THE BUTTON HE WAS LOOKING FOR IS THERE ──────────────────
       * Named with the set it leaves out and counted with what it takes,
       * because that count is the whole decision he is making.
       */
      /*
       * FOUND BY ITS NAME, CHECKED BY ITS COUNT, SEPARATELY. Locating it by
       * the whole label — count included — looked tidier and was weaker: a
       * complement that came back with the wrong SET had the wrong count too,
       * so the locator missed, and every assertion below about what it
       * actually selects was skipped. The button is found by the set it
       * leaves out, and then everything about it is asserted.
       */
      const exceptBtn = btn(`הכל חוץ מ${RUSSIAN}`);
      const exceptLabel = `הכל חוץ מ${RUSSIAN} (${restEnabled.length})`;
      is(await exceptBtn.count(), `${at}: "${exceptLabel}" — the only action on this row that works from an empty selection — is missing`);
      const exceptText = (await exceptBtn.first().innerText()).trim();

      /* ── pressed, from zero, in one tap ──────────────────────────────── */
      await exceptBtn.first().click();
      await page.waitForFunction(() => window.__selected.length > 0);
      const picked = await out();
      /*
       * WHAT WENT WRONG, IN THE ORDER IT MATTERS. The last of these subsumes
       * all of them, so what the order buys is the message: a run that fails
       * should name the damage — a group that should not have been posted to,
       * a dead target in the queue — rather than a count that is off by one
       * and leaves the reason to be worked out.
       */
      eq(
        picked.filter((id) => russian.some((t) => t.id === id)),
        [],
        `${at}: THE WHOLE POINT — a Russian-speaking group survived "${exceptLabel}"`,
      );
      /* The switched-off group is one of `rest` and must NOT be in there: this
         button selects, and selecting somewhere that cannot publish is a
         failure with no cause on screen. */
      const off = data.find((t) => !t.enabled)!;
      is(!picked.includes(off.id), `${at}: a switched-off target was selected`);
      eq(picked.length, restEnabled.length, `${at}: one tap did not select every other group`);
      eq([...picked].sort(), [...restEnabled].sort(), `${at}: the selection is not exactly the other groups`);
      /* It works across the whole filtered list, not the 60 rows drawn. */
      is(picked.length > 60, `${at}: the set operation stopped at the drawn page`);
      /*
       * AND THE FACE MATCHED THE ACT. Checked here, AFTER the selection it
       * produced, on purpose: a wrong complement has a wrong count too, so a
       * label assertion placed before the click catches those mutations first
       * and the four lines above — the ones that say what actually went into
       * the campaign — never run. Read in this order the failure names the
       * damage; the label is the last and smallest of the claims.
       */
      eq(exceptText, exceptLabel, `${at}: the button promised a different number than it selected`);

      /*
       * AND THE RESULT IS ON SCREEN, NOT BEHIND THE FILTER THAT DEFINED IT.
       *
       * Everything this button selects is by definition outside the set the
       * filter is showing, so leaving the filter on ends the tap he wanted on
       * a warning bar — "151 יעדים נבחרים לא מוצגים בסינון הנוכחי" — whose
       * remedy button is "הסר אותם". A warning that fires on success, next to
       * a button that undoes it, is how a working feature gets reported as
       * broken.
       */
      eq(await page.locator('text=לא מוצגים').count(), 0, `${at}: the result of the tap was hidden behind the filter, under a warning`);
      is(
        await page.locator('[aria-label="קטגוריה"] button[aria-pressed="true"]', { hasText: 'כל הקטגוריות' }).count(),
        `${at}: the filter did not step aside, so he cannot see what he just selected`,
      );
      /* And he can see them: the drawn page is the top of the new selection. */
      is(await page.locator('input[type="checkbox"]:checked').count(), `${at}: nothing on screen is ticked after the tap`);

      /* ── and the other direction still works, now that there IS a
       *    selection: "−" appears and takes the category back out ─────── */
      await page.locator(`[aria-label="קטגוריה"] button`, { hasText: 'כל הקטגוריות' }).first().click();
      await btn('רק כל המוצגים').first().click();
      await page.waitForFunction((n) => window.__selected.length === n, data.filter((t) => t.enabled).length);
      await page.locator(`[aria-label="קטגוריה"] button`, { hasText: RUSSIAN }).first().click();
      const minus = page.locator(`button[aria-label="הסר את ${RUSSIAN} מהבחירה (${russian.length})"]`);
      await minus.waitFor();
      await minus.click();
      await page.waitForFunction((n) => window.__selected.length === n, restEnabled.length);
      eq([...(await out())].sort(), [...restEnabled].sort(), `${at}: "−" and "הכל חוץ מ…" disagree about the same set`);

      /*
       * ── NO "EXCEPT" WHERE THERE IS NOTHING LEFT OVER ────────────────
       * With the filter cleared the first set is every target, so its
       * complement is empty and the button would select nothing. A control
       * that can only no-op is the one he presses twice and reports as broken
       * — the same rule "−" already follows.
       */
      await page.locator(`[aria-label="קטגוריה"] button`, { hasText: 'כל הקטגוריות' }).first().click();
      await page.waitForFunction(
        () => [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').includes('רק כל המוצגים')),
      );
      eq(
        await page.locator('button', { hasText: 'הכל חוץ מכל המוצגים' }).count(),
        0,
        `${at}: an "except" button was offered over an empty complement`,
      );

      /*
       * ── AND NOWHERE ELSE ON THE ROW ─────────────────────────────────
       * The fixture has favourites, so a complement offered on every set
       * would draw "הכל חוץ ממועדפות" here. It is a coherent sentence and
       * one nobody has ever needed, and this row is read every time a post
       * is sent — "הכל חוץ מדפים" is likewise just the "קבוצות" button three
       * rows up. The complement belongs to the set he filtered to, which is
       * the only one whose membership he just chose.
       */
      eq(
        await page.locator('button', { hasText: 'הכל חוץ ממועדפות' }).count(),
        0,
        `${at}: the complement was offered on a set that is not the filter`,
      );

      /*
       * ── TWO FILTERS AT ONCE, which is what proves "step aside" means ALL
       *    of them ───────────────────────────────────────────────────────
       *
       * With only the category cleared, a city filter left standing hides
       * every Arad group the tap just selected — the same warning-over-success
       * as before, from the half of the state the single-filter case above
       * cannot see. It passed a mutation that cleared the category alone, so
       * this is the case that was missing rather than an extra one.
       */
      await page.locator(`[aria-label="עיר"] button`, { hasText: 'באר שבע' }).first().click();
      await page.locator(`[aria-label="קטגוריה"] button`, { hasText: RUSSIAN }).first().click();
      const bothLabel = `באר שבע · ${RUSSIAN}`;
      const bothSet = data.filter((t) => t.city === 'באר שבע' && t.category === RUSSIAN);
      const bothRest = data.filter((t) => t.enabled && !bothSet.some((b) => b.id === t.id)).map((t) => t.id);
      const bothBtn = btn(`הכל חוץ מ${bothLabel}`);
      await bothBtn.waitFor();
      eq((await bothBtn.first().innerText()).trim(), `הכל חוץ מ${bothLabel} (${bothRest.length})`, `${at}: two filters, one wrong count`);
      await bothBtn.first().click();
      await page.waitForFunction((n) => window.__selected.length === n, bothRest.length);
      eq([...(await out())].sort(), [...bothRest].sort(), `${at}: the complement of a city-and-category set is wrong`);
      eq(await page.locator('text=לא מוצגים').count(), 0, `${at}: a city filter was left on, hiding what the tap selected`);
      is(
        await page.locator('[aria-label="עיר"] button[aria-pressed="true"]', { hasText: 'כל הערים' }).count(),
        `${at}: the city filter did not step aside`,
      );

      /* ── and the row still fits the phone, WITH the new chip on it ──── */
      await page.locator(`[aria-label="קטגוריה"] button`, { hasText: RUSSIAN }).first().click();
      await page.waitForFunction(
        (n) => [...document.querySelectorAll('button')].some((b) => (b.textContent ?? '').includes(`הכל חוץ מ${n}`)),
        RUSSIAN,
      );
      const seen = await page.evaluate(() => ({
        over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        /* Every control on this screen carries the product's 40px floor. */
        small: [...document.querySelectorAll('button')]
          .map((e) => e.getBoundingClientRect())
          .filter((b) => b.width > 0 && (b.height < 40 || b.width < 24)).length,
        /* The real minus (U+2212), not a hyphen, which at this weight reads as
           a dash inside a word. */
        minus: (document.body.textContent ?? '').includes('−'),
        plus: (document.body.textContent ?? '').includes('+'),
      }));
      eq(seen.over, false, `${at}: the quick-set row widened the page`);
      eq(seen.small, 0, `${at}: a control under the 40px floor`);
      is(seen.minus, `${at}: the "−" is missing`);
      is(seen.plus, `${at}: the "+" is missing`);

      eq(crashes, [], `${at}: the picker threw`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`target-picker tests OK — set operations, plus ${checks} assertions pressed at 360/390/430`);
}

void drive();
