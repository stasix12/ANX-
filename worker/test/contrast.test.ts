import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * A source guard, not a unit test.
 *
 * The palette carried a comment claiming every pair passed WCAG AA. Two did
 * not: fine print on a card in the storefront theme sat at 4.04, and white on
 * the primary button in the theme /social runs in sat at 4.10 — the
 * most-pressed control in the product. A claim in a comment is not a check,
 * so the ratios are computed here from the tokens themselves.
 */
const css = readFileSync('src/app/globals.css', 'utf8');

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The tokens a theme block declares, by name. */
function tokensOf(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--color-[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}

/**
 * A theme block, bounded by its own braces.
 *
 * This used to slice from one block's opening brace to the next one's, and
 * gave the last theme a flat 1500-character window. Both are traps: adding a
 * theme anywhere but the end silently folded its tokens into the block above
 * it (last declaration wins in `tokensOf`, so the guard would have reported
 * one theme's name while measuring another's palette), and the 1500 window
 * already ran well past `.platform-theme` into rules that follow it. Matching
 * the closing brace means a block is exactly itself, wherever it is written.
 */
function blockOf(selector: string): string {
  const start = css.indexOf(selector);
  assert.ok(start > -1, `theme block not found: ${selector}`);
  const open = css.indexOf('{', start);
  const end = css.indexOf('\n}', open);
  assert.ok(end > -1, `theme block never closes: ${selector}`);
  return css.slice(open, end);
}

const THEMES: [string, string][] = [
  ['storefront (@theme)', blockOf('@theme {')],
  ['crm-theme — /crm and the sofa-cleaning landing page', blockOf('.crm-theme {')],
  ['platform-theme — /clean, /pro, /hq', blockOf('.platform-theme {')],
  ['social-theme — the theme /social runs in', blockOf('.social-theme {')],
];

/**
 * Foreground on background, as the UI actually renders them.
 *
 * `only` narrows a pair to the themes where the pairing is real. It is not an
 * escape hatch for a failing ratio: ink-800 is the ELEVATED SURFACE (sheets,
 * toasts, the overflow menu) in social-theme, which is why fine print lands
 * on it there, while in the three light themes ink-800 is a chip and track
 * fill that never carries 11px text. Asserting it everywhere would be
 * asserting something the light themes do not do.
 *
 * Deliberately absent: brand-300 and error-300. They measure 4.49 and 4.57 on
 * a card in social-theme and are declared NON-TEXT — indicator fills, dots,
 * bar segments, focus rings, where the threshold is 3:1. Listing them here
 * would either fail the build or, worse, be "fixed" by someone using them as
 * text because the guard said they were fine.
 */
type Pair = { fg: string; bg: string; what: string; only?: string };
const PAIRS: Pair[] = [
  { fg: 'mist-500', bg: 'ink-950', what: 'fine print on the page' },
  { fg: 'mist-500', bg: 'ink-850', what: 'fine print on a card' },
  { fg: 'mist-300', bg: 'ink-850', what: 'secondary text on a card' },
  { fg: 'mist-100', bg: 'ink-950', what: 'body text on the page' },
  { fg: 'brand-400', bg: 'ink-850', what: 'link on a card' },
  { fg: 'on-brand', bg: 'brand-500', what: 'label on the primary button' },

  // Status colour. These were hardcoded Tailwind palette classes until this
  // palette; unguarded, `text-emerald-700` on a navy card measured 2.4.
  { fg: 'success-400', bg: 'ink-850', what: 'success text on a card' },
  { fg: 'error-400', bg: 'ink-850', what: 'error text on a card' },
  { fg: 'warning-400', bg: 'ink-850', what: 'warning text on a card' },
  { fg: 'on-state', bg: 'success-500', what: 'label on a success surface' },
  { fg: 'on-state', bg: 'error-500', what: 'label on a danger button' },

  // The elevated surface — a sheet is where an error gets explained, so every
  // text step has to survive one step up from the card, not just on it.
  { fg: 'mist-100', bg: 'ink-800', what: 'body text on a sheet', only: 'social-theme' },
  { fg: 'mist-300', bg: 'ink-800', what: 'secondary text on a sheet', only: 'social-theme' },
  { fg: 'mist-500', bg: 'ink-800', what: 'fine print on a sheet', only: 'social-theme' },
  { fg: 'brand-400', bg: 'ink-800', what: 'link on a sheet', only: 'social-theme' },
  { fg: 'success-400', bg: 'ink-800', what: 'success text on a sheet', only: 'social-theme' },
  { fg: 'error-400', bg: 'ink-800', what: 'error text on a sheet', only: 'social-theme' },
  { fg: 'warning-400', bg: 'ink-800', what: 'warning text on a sheet', only: 'social-theme' },
];

// 4.5:1 is the AA threshold for body text. Everything checked here is body
// text or smaller — the fine print is 11px — so the large-text allowance of
// 3.0 deliberately does not apply.
const AA = 4.5;
const failures: string[] = [];
let checked = 0;

for (const [themeName, block] of THEMES) {
  const t = tokensOf(block);
  for (const { fg, bg, what, only } of PAIRS) {
    if (only && !themeName.startsWith(only)) continue;
    const f = t[`--color-${fg}`];
    const b = t[`--color-${bg}`];
    if (!f || !b) continue;
    checked += 1;
    const ratio = contrast(f, b);
    if (ratio < AA) failures.push(`${themeName}: ${fg} on ${bg} (${what}) = ${ratio.toFixed(2)}, needs ${AA}`);
  }
}

assert.deepEqual(failures, [], `palette pairs below WCAG AA:\n  ${failures.join('\n  ')}`);

// A typo in a token name would silently skip its pair rather than fail, so the
// count is asserted too: 11 universal pairs across 4 themes, plus 7 that only
// social-theme declares an elevated surface for.
assert.equal(checked, 11 * 4 + 7, `expected 51 measured pairs, got ${checked}`);

console.log(`contrast guard OK — ${THEMES.length} themes, ${checked} pairs, 0 below AA`);
