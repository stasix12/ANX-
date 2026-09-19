import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * A source guard, not a unit test.
 *
 * Four separate user-visible bugs in this module were the same mistake: a
 * grid or flex child cannot shrink below its content, because CSS gives it
 * `min-width: auto`. One long Russian group name, one <code> block, one
 * min-w-max chip row — and the track widens, the page scrolls sideways, and
 * the header and buttons slide off a phone. It was reported four times by
 * the person using it before it was understood.
 *
 * So the rules are enforced here rather than remembered:
 *   - every multi-column grid declares [&>*]:min-w-0
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
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
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
