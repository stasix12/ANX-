import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * A source guard, not a unit test.
 *
 * FIVE separate user-visible bugs in this module were the same mistake: a
 * grid or flex child cannot shrink below its content, because CSS gives it
 * `min-width: auto`. One long Russian group name, one <code> block, one
 * min-w-max chip row — and the track widens, the page scrolls sideways, and
 * the header and buttons slide off a phone. It was reported four times by
 * the person using it before it was understood.
 *
 * The fifth was reported on 06/11, from the queue on the home screen:
 * "גם פה בתור פרסומים במלבן של הקבוצה יוצא ממסגרת". Same mistake, one layer
 * down — the grid was declared in globals.css rather than in a className, so
 * the rule below could not see it. Now there are two rules, one per layer.
 *
 * So the rules are enforced here rather than remembered:
 *   - every multi-column grid declares [&>*]:min-w-0
 *   - every grid in globals.css declares its columns, and a single column is
 *     written minmax(0, 1fr) — an implicit `auto` track is never narrower
 *     than the longest name in it
 *   - every horizontal scroller declares min-w-0 on itself
 *   - the shell clips horizontally as a last line of defence
 *   - sheets render through a portal, outside the page's transform
 *   - a name that can arrive in Latin script carries dir="auto"
 *   - no raw exception text reaches the screen
 *   - the compact control sizes still clear a 40px tap target
 *   - every form control has an accessible name
 */
const ROOTS = ['src/app/social', 'src/components/social'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

const files = ROOTS.flatMap(walk).filter((f) => !f.includes('zzaudit'));
assert.ok(files.length > 15, `expected the social module, found ${files.length} files`);

const classAttr = /className=[{"`]([^"`]*?)["`}]/g;
const gridOffenders: string[] = [];
const scrollerOffenders: string[] = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const [, cls] of src.matchAll(classAttr)) {
    const has = (c: string) => cls.includes(c);
    if (has('grid-cols-') && !has('[&>*]:min-w-0')) {
      gridOffenders.push(`${file}: ${cls.slice(0, 70)}`);
    }
    if ((has('overflow-x-auto') || has('overflow-x-scroll')) && !has('min-w-0')) {
      scrollerOffenders.push(`${file}: ${cls.slice(0, 70)}`);
    }
  }
}

assert.deepEqual(
  gridOffenders,
  [],
  `multi-column grids missing [&>*]:min-w-0 — their children cannot shrink and will widen the page:\n  ${gridOffenders.join('\n  ')}`,
);
assert.deepEqual(
  scrollerOffenders,
  [],
  `horizontal scrollers missing min-w-0 — they will stretch their parent instead of scrolling:\n  ${scrollerOffenders.join('\n  ')}`,
);

/*
 * A truncated element must say dir="auto" when what it shows can arrive in
 * Latin script. Inside an RTL box an LTR string is clipped at its START, so
 * all 34 Russian groups rendered as the same "…и Негев, мы вместе".
 */
const truncOffenders: string[] = [];
for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('truncate') && !line.includes('line-clamp-')) continue;
    if (line.includes('dir=')) continue;
    // Only the elements that render a name, a title or free text — counters,
    // dates and labels we write ourselves are always Hebrew.
    if (!/\{[^}]*\b(name|title|label|text|query|url|category|city)\b/i.test(line)) continue;
    truncOffenders.push(`${file}: ${line.trim().slice(0, 80)}`);
  }
}
assert.deepEqual(
  truncOffenders,
  [],
  `truncated user text without dir="auto" — an LTR name in an RTL box clips at the wrong end:\n  ${truncOffenders.join('\n  ')}`,
);

/*
 * Raw exception text must never reach the screen: no stack traces, no SQL
 * constraint names, no "Failed to fetch". Everything the owner reads goes
 * through friendlyMessage() first.
 */
const rawErrorOffenders: string[] = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const line of src.split('\n')) {
    if (/instanceof Error \? \w+\.message/.test(line)) rawErrorOffenders.push(`${file}: ${line.trim().slice(0, 80)}`);
  }
}
assert.deepEqual(
  rawErrorOffenders,
  [],
  `raw exception text shown to the user — route it through friendlyMessage():\n  ${rawErrorOffenders.join('\n  ')}`,
);

/*
 * Every input, textarea and select needs an accessible name: wrapped in a
 * <Field>/<label>, or carrying aria-label / placeholder / id. Without one a
 * screen reader announces "edit text, blank" and the field is unusable.
 * Elements marked `hidden` are not in the accessibility tree, so they are
 * exempt — the media uploader's file input is one, opened by a labelled button.
 */
const unlabelled: string[] = [];
/*
 * COMMENTS ARE BLANKED FIRST, AND THE LINE NUMBERS SURVIVE IT.
 *
 * This walked the raw source, so a comment that MENTIONS a control was read
 * as one: a block comment in CampaignSchedulePanel.tsx explaining that the
 * rounds card deliberately contains no <select> was reported as an unlabelled
 * <select>, and the only way to satisfy it would have been to delete the
 * explanation. That is the fourth guard in this suite to be fooled by a
 * sentence quoting code, which is why every one of them now strips.
 *
 * Block comments are replaced by their own newlines rather than removed, so
 * `${file}:${i + 1}` still points at the real line.
 */
const strip = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');
for (const file of files) {
  const lines = strip(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    if (!/<(input|textarea|select)\b/.test(line)) return;
    const chunk = lines.slice(i, i + 6).join('\n');
    if (/\bhidden\b/.test(chunk)) return;
    const named = /aria-label|aria-labelledby|placeholder|id=/.test(chunk);
    const wrapped = /<Field|<label/.test(lines.slice(Math.max(0, i - 4), i).join('\n'));
    if (!named && !wrapped) unlabelled.push(`${file}:${i + 1} ${line.trim().slice(0, 70)}`);
  });
}
assert.deepEqual(
  unlabelled,
  [],
  `form controls with no accessible name:\n  ${unlabelled.join('\n  ')}`,
);

/*
 * ─────────────────────────────────────────────────────────────────────────
 * AND THE SAME RULE ONE LAYER DOWN: THE GRIDS DECLARED IN globals.css.
 *
 * The rule above reads classNames, so it only ever saw the grids written in
 * Tailwind. `.anxf-queue` — the publication queue on the home screen — is a
 * grid declared in the stylesheet, and it had no columns at all.
 *
 * A grid with no `grid-template-columns` gets one implicit `auto` column, and
 * an auto track is never narrower than its item's min-content. The row's
 * min-content is the group's name on one line (the name is `nowrap`, so it
 * has no break points), and `min-width: 0` on the words column lets the name
 * shrink during layout without lowering what it CONTRIBUTES to that
 * measurement. So one long name — "דרושים ערד /עבודה בערד והסביבה" — made
 * every row in the queue 399px wide inside a 344px card and pushed the page
 * to 422px on a 390px screen.
 *
 * `minmax(0, 1fr)` is the fix and the rule: say the column may be as narrow
 * as nothing. A rule that centres one glyph (`place-items`) needs no columns
 * and is exempt; anything else must declare them.
 */
const css = readFileSync('src/app/globals.css', 'utf8');
const unboundedGrids: string[] = [];
for (let at = css.indexOf('display: grid'); at >= 0; at = css.indexOf('display: grid', at + 1)) {
  const open = css.lastIndexOf('{', at);
  const selector = css.slice(css.lastIndexOf('}', open) + 1, open).trim().split('\n').pop()?.trim() ?? '?';
  let depth = 1;
  let end = open + 1;
  while (depth > 0 && end < css.length) {
    if (css[end] === '{') depth += 1;
    else if (css[end] === '}') depth -= 1;
    end += 1;
  }
  const block = css.slice(open, end);
  /* One centred glyph needs no columns; so does a rule that only stacks
     children on top of each other with grid-area. */
  if (/place-items|place-content|grid-area|grid-template:/.test(block)) continue;
  if (!/grid-template-columns/.test(block)) unboundedGrids.push(`${selector} — no grid-template-columns`);
  else if (/grid-template-columns:\s*(auto|1fr)\s*;/.test(block)) unboundedGrids.push(`${selector} — a single bare track`);
}
assert.deepEqual(
  unboundedGrids,
  [],
  `grids in globals.css whose track is sized by their longest content — one long group name widens the row and carries it out of its card. Declare minmax(0, 1fr):\n  ${unboundedGrids.join('\n  ')}`,
);

const shell = readFileSync('src/components/social/SocialShell.tsx', 'utf8');
assert.ok(shell.includes('overflow-x-clip'), 'the shell must clip horizontally as a last line of defence');

// Sheets must stay portalled: rendered in place they inherit the page's
// entrance animation, whose transform breaks `position: fixed` and pushed the
// publish button off the bottom of the screen.
const ui = readFileSync('src/components/social/ui.tsx', 'utf8');
assert.ok(ui.includes('createPortal'), 'Sheet must render through a portal, outside the animated page');
assert.ok(ui.includes('document.body'), 'Sheet must portal to document.body');

/*
 * ...and must carry its theme across. Palettes are scoped class overrides, so
 * portalling to <body> leaves the scope: every sheet in this light-themed
 * product rendered with the storefront's dark tokens until the wrapper below
 * was added. Measured: the dialog resolved --color-ink-850 to #24272b while
 * the card behind it resolved the same token to #fff.
 */
assert.ok(/\[class\*="-theme"\]/.test(ui), 'Sheet must find the theme it is portalling out of');
assert.ok(/createPortal\(\s*<div className=\{themeClass\}>/.test(ui), 'the portal must be wrapped in that theme class');

/*
 * Compact controls are still tapped with a thumb. Every one of these measured
 * 24-36px on a 390px screen before; 40px is the floor.
 */
for (const token of ["sm: 'min-h-10", "size === 'sm' ? 'min-h-10", "flex h-11 w-12"]) {
  assert.ok(ui.includes(token), `a compact control dropped below a 40px tap target (missing: ${token})`);
}

console.log(`layout guard OK — ${files.length} files, 0 offenders`);
