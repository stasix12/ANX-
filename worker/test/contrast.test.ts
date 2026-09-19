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

const at = (needle: string) => {
  const i = css.indexOf(needle);
  assert.ok(i > -1, `theme block not found: ${needle}`);
  return i;
};
const [iStore, iCrm, iPlatform] = [at('@theme {'), at('.crm-theme {'), at('.platform-theme {')];

const THEMES: [string, string][] = [
  ['storefront (@theme)', css.slice(iStore, iCrm)],
  ['crm-theme — the theme /social runs in', css.slice(iCrm, iPlatform)],
  ['platform-theme', css.slice(iPlatform, iPlatform + 1500)],
];

/** Foreground on background, as the UI actually renders them. */
const PAIRS: [string, string, string][] = [
  ['mist-500', 'ink-950', 'fine print on the page'],
  ['mist-500', 'ink-850', 'fine print on a card'],
  ['mist-300', 'ink-850', 'secondary text on a card'],
  ['mist-100', 'ink-950', 'body text on the page'],
  ['brand-400', 'ink-850', 'link on a card'],
  ['on-brand', 'brand-500', 'text on the primary button'],
];

// 4.5:1 is the AA threshold for body text. Everything checked here is body
// text or smaller — the fine print is 11px — so the large-text allowance of
// 3.0 deliberately does not apply.
const AA = 4.5;
const failures: string[] = [];

for (const [themeName, block] of THEMES) {
  const t = tokensOf(block);
  for (const [fg, bg, what] of PAIRS) {
    const f = t[`--color-${fg}`];
    const b = t[`--color-${bg}`];
    if (!f || !b) continue;
    const ratio = contrast(f, b);
    if (ratio < AA) failures.push(`${themeName}: ${fg} on ${bg} (${what}) = ${ratio.toFixed(2)}, needs ${AA}`);
  }
}

assert.deepEqual(failures, [], `palette pairs below WCAG AA:\n  ${failures.join('\n  ')}`);

console.log('contrast guard OK — 3 themes, 0 pairs below AA');
