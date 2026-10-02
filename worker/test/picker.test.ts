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
  pin("const shownLabel = query.trim() ? 'המוצגים' : [city, category].filter(Boolean).join(' · ') || 'כל המוצגים';", 'names the set its first chip replaces');
  pin('{ label: shownLabel, items: visible },', 'labels that chip with it');
  /* `less` must not borrow enabledIds — see the note above. Matched on the
     call, not the word, so the comment explaining it cannot satisfy this. */
  assert.ok(!/const less = \(items: SocialTarget\[\]\) => \{[\s\S]{0,200}enabledIds\(/.test(src), 'subtraction must not skip a disabled target — it would be unremovable');
}

/* ───────── and the row still fits a phone, measured ─────────────────────
 *
 * Each quick set grew a third button and the first chip's label grew a
 * category, so the widest this row can be went from "רק באר שבע (138)" to
 * "רק באר שבע · דוברי רוסית (138) + −". Whether that still fits 360px is a
 * question about pixels, and the rule it could break is the one this module
 * does not bend: "אין ליצור Horizontal Overflow".
 */
async function measure(): Promise<void> {
  const { execFileSync } = await import('node:child_process');
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
    console.log('target-picker tests OK (measurement SKIPPED — run `npm run build` first)');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'picker-'));
  copyFileSync(best.file, path.join(dir, 'app.css'));
  writeFileSync(path.join(dir, 'index.html'), execFileSync('npx', ['tsx', 'worker/test/render-picker.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 }));
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    for (const width of [360, 390, 430]) {
      const view = await browser.newPage({ viewport: { width, height: 1000 } });
      await view.goto(`file://${path.join(dir, 'index.html')}`);
      const seen = await view.evaluate(() => ({
        over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        /* Every control on this screen, the two new one-character buttons
           included, carries the product's 40px floor. A "−" is the easiest
           thing in the world to draw at 24px. */
        small: [...document.querySelectorAll('button')]
          .map((e) => e.getBoundingClientRect())
          .filter((b) => b.width > 0 && (b.height < 40 || b.width < 24)).length,
        /* Both signs are drawn, and they are the real minus (U+2212) rather
           than a hyphen, which at this weight reads as a dash in a word. */
        minus: (document.body.textContent ?? '').includes('\u2212'),
        plus: (document.body.textContent ?? '').includes('+'),
      }));
      assert.equal(seen.over, false, `${width}: the quick-set row widened the page`);
      assert.equal(seen.small, 0, `${width}: a control under the 40px floor`);
      assert.ok(seen.minus, `${width}: the "−" is missing`);
      assert.ok(seen.plus, `${width}: the "+" is missing`);
      await view.close();
    }
  } finally {
    await browser.close();
  }
  console.log('target-picker tests OK — set operations, plus the row measured at 360/390/430');
}

void measure();
