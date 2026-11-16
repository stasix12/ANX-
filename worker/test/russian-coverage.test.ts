/*
 * ─── "תעבור על הכל ותבדוק את עצמך עמוד עמוד" ──────────────────────────────
 *
 * THE MEASUREMENT I SHOULD HAVE HAD FROM THE START.
 *
 * I told him the screens were translated once before, and he had to correct
 * me: "התוכנה לא עוברת לרוסית מלאה … עדיין יש כפתורים והרבה דברים בעברית."
 * He was right. What I had measured was the dictionary against the sentences
 * I had WRAPPED — which is a count of my own work, not of the app. Two
 * thousand sentences the codemod never touched were invisible to it.
 *
 * So this walks the real source of every publishing screen, with the
 * TypeScript parser rather than a regex, and asks the only question that
 * matters: is there a Russian answer for every Hebrew string the customer
 * can be shown? It counts the app, not the effort.
 *
 * TWO KINDS OF STRING, because the screens hold two kinds:
 *
 *   · a fixed sentence  — `'אין קבוצות פעילות'`      → the plain dictionary
 *   · one built around a value — `` `נשארו ${n} דקות` `` → a § pattern
 *
 * WHAT IT DELIBERATELY DOES NOT COUNT, each named and reasoned below rather
 * than filtered away quietly: single letters and connectors, the brand name,
 * the word "עברית" itself, and strings that are DATA rather than text.
 *
 * If this fails, the honest answer to "סיימתה לתרגם?" is no.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { translate, translatedKeys, translatedPatterns, translatedPatternValue, translatedValue, PH, PH_THIN_OK } from '../../src/lib/social/i18n';

const NAME = 'russian coverage';
let checks = 0;
const is = (c: unknown, what: string) => {
  checks += 1;
  assert.ok(c, what);
};
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};

/* Every file the customer's publishing screens are built from. */
const ROOTS = ['src/app/social', 'src/components/social', 'src/lib/social'];
const HEBREW = /[֐-׿]/;

/*
 * ─── NOT TEXT ON A SCREEN ──────────────────────────────────────────────────
 *
 * Each of these is skipped for a stated reason, and the list is short on
 * purpose: a long one is how "translated" stops meaning anything.
 */
const SKIP = new Set([
  /* The product's name. "אין לשנות את הלוגו או שם האפליקציה" — and a name is
     not a word to translate anyway. */
  'הפתרון המבריק',
  /* A language is named in its own language, on every screen, in every
     language. Translating "עברית" to "иврит" would be a bug on the switch. */
  'עברית',
]);

/*
 * A pattern shape the parser sees but that is answered by more specific
 * patterns instead. `${counted(…)} ל${…}` is built from a helper that
 * returns one of three fixed openings, so the three real shapes are in the
 * dictionary ("פרסומים הוזזו ל§" and its singular and dual) and carry the
 * value correctly. The bare shape has one Hebrew letter of its own and would
 * match almost anything, so it is deliberately not a pattern.
 */
const HANDLED_MORE_SPECIFICALLY = new Set([`${PH} ל${PH}${PH}`]);

/* A connector or a single letter is not a sentence, and as a dictionary key
   it would be actively harmful: the DOM translator matches whole text nodes,
   and a one-character key would claim any node that happened to equal it. */
const isConnector = (s: string) => (s.match(/[֐-׿]/g) ?? []).length < 3;

function files(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/i18n\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

type Found = { text: string; file: string; line: number };

function collect(): { plain: Found[]; patterns: Found[] } {
  const plain: Found[] = [];
  const patterns: Found[] = [];
  const seenPlain = new Set<string>();
  const seenPat = new Set<string>();

  for (const file of ROOTS.flatMap((r) => files(r))) {
    const src = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const at = (n: ts.Node) => src.getLineAndCharacterOfPosition(n.getStart()).line + 1;

    const visit = (n: ts.Node): void => {
      /* `...${x}...` — one runtime string, and on screen one text node. */
      if (ts.isTemplateExpression(n)) {
        let shape = n.head.text;
        for (const span of n.templateSpans) shape += PH + span.literal.text;
        shape = tidy(shape);
        if (HEBREW.test(shape) && !seenPat.has(shape)) {
          seenPat.add(shape);
          patterns.push({ text: shape, file, line: at(n) });
        }
      }
      /* 'a' + x + 'b' — the same thing written the other way. */
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const parts: string[] = [];
        const flatten = (e: ts.Expression): void => {
          if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            flatten(e.left);
            flatten(e.right);
          } else if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) parts.push(e.text);
          else parts.push(PH);
        };
        flatten(n);
        const shape = tidy(parts.join(''));
        if (HEBREW.test(shape) && shape.includes(PH) && !seenPat.has(shape)) {
          seenPat.add(shape);
          patterns.push({ text: shape, file, line: at(n) });
        }
      }

      let literal: string | null = null;
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) literal = n.text;
      else if (ts.isJsxText(n)) literal = n.text;
      if (literal !== null) {
        const text = tidy(literal);
        if (HEBREW.test(text) && !seenPlain.has(text)) {
          seenPlain.add(text);
          plain.push({ text, file, line: at(n) });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return { plain, patterns };
}

const { plain, patterns } = collect();

/* The measurement only means something if it actually read the app. */
is(plain.length > 1500, `the parser read the screens — ${plain.length} distinct Hebrew sentences`);
is(patterns.length > 300, `and the sentences built around a value — ${patterns.length} distinct shapes`);

const haveExact = new Set(translatedKeys());
const havePattern = new Set(translatedPatterns());

const missingPlain = plain
  .filter((f) => !haveExact.has(f.text) && !SKIP.has(f.text) && !isConnector(f.text))
  .map((f) => `${f.file}:${f.line}  ${f.text}`);
eq(missingPlain, [], 'every Hebrew sentence on a publishing screen has a Russian translation');

const missingPattern = patterns
  .filter((f) => !havePattern.has(f.text) && !HANDLED_MORE_SPECIFICALLY.has(f.text))
  .map((f) => `${f.file}:${f.line}  ${f.text}`);
eq(missingPattern, [], 'and so does every sentence built around a value');

/*
 * ─── AND NOTHING IN THE DICTIONARY IS DEAD ────────────────────────────────
 *
 * The other direction, which matters for a different reason: an entry for a
 * sentence no screen shows any more is not harmless, it is a claim of
 * coverage that nothing backs. The patterns are the ones worth checking —
 * a plain entry can legitimately be a value the engine produces at runtime,
 * but a pattern is written against a shape that exists in the source.
 */
const shapes = new Set(patterns.map((f) => f.text));
const deadPatterns = [...havePattern].filter((p) => !shapes.has(p) && !PH_THIN_OK.includes(p));
/* The three "הוזזו" shapes are produced by a helper, so the parser sees the
   generic shape rather than them; they are expected here and named. */
const expectedAbsent = new Set([
  `פרסום אחד הוזז ל${PH}`,
  `פרסומים הוזזו ל${PH}`,
  `שני פרסומים הוזזו ל${PH}`,
]);
eq(
  deadPatterns.filter((p) => !expectedAbsent.has(p)),
  [],
  'no pattern in the dictionary describes a shape the screens no longer have',
);

/*
 * ─── NO PATTERN STEALS ANOTHER SENTENCE ───────────────────────────────────
 *
 * This is the one real danger in matching by shape. A pattern is a regex
 * with `(.*?)` where the value goes, and a regex does not know what a value
 * is: `§ קבוצות הושהו` would happily match a longer sentence that merely
 * ENDS that way, capture half of it, and print the other half in Russian
 * around Hebrew words. Nothing about the dictionary file would look wrong.
 *
 * So each pattern is filled with a marker and run back through the engine,
 * and the result has to be that pattern's own Russian with the marker in it.
 * If a different pattern claims the sentence first, the marker lands in the
 * wrong place or the wrong words come out, and this fails and names both.
 *
 * It also checks the other direction: no pattern may claim a sentence that
 * the plain dictionary has an exact answer for. The exact lookup runs first
 * so the screen would be right anyway, but a pattern that can match a fixed
 * sentence of ours is a pattern that will one day match the next one.
 */
const MARKER = 'ЗНАЧЕНИЕ';

/* The marker is not a number, so a counted noun takes its third form —
   the same choice the engine makes for a value it cannot count. */
const resolve = (ru: string) => ru.replace(/\{[^{}|]*\|[^{}|]*\|([^{}|]*)\}/g, '$1');

const stolen: string[] = [];
for (const shape of havePattern) {
  const filled = shape.split(PH).join(MARKER);
  const got = translate('ru', filled);
  const want = resolve(translatedPatternValue(shape) ?? '').split(PH).join(MARKER);
  if (got !== want) stolen.push(`${shape}\n      filled: ${filled}\n      got:    ${got}\n      want:   ${want}`);
}
eq(stolen, [], 'every pattern matches its own sentence — none is claimed by a different pattern first');

/*
 * ─── AND A FIXED SENTENCE IS NEVER TOUCHED BY A PATTERN ───────────────────
 *
 * The companion danger, measured on the output rather than on the regexes:
 * a thin pattern like `כל §` matches dozens of this app's real sentences as
 * a regex. It never gets the chance — an exact entry is looked up first, and
 * the patterns are tried longest-literal-first so the thin ones come last —
 * but "it never gets the chance" is a claim, and a claim about the one thing
 * that would silently mangle a screen deserves to be measured.
 *
 * So every sentence the dictionary answers is run through the real engine
 * and has to come back as its own translation, untouched by any pattern.
 */
const mangled: string[] = [];
for (const sentence of haveExact) {
  const got = translate('ru', sentence);
  const want = translatedValue(sentence);
  if (got !== want) mangled.push(`${sentence}\n      got:  ${got}\n      want: ${want}`);
}
eq(mangled, [], 'every fixed sentence comes back as its own translation — no pattern reaches it');

/*
 * The same for the sentences the screens show that the dictionary does NOT
 * answer: the connectors and the brand name it deliberately skips. A pattern
 * must leave those alone too, or the one place I chose not to translate
 * would be the one place that comes out half-Russian.
 */
const skipped = plain
  /* Not everything short is skipped: 'א׳' is a weekday and 'רץ' is a status,
     and both have a Russian. What is left in Hebrew is what has no entry. */
  .filter((f) => !haveExact.has(f.text) && (SKIP.has(f.text) || isConnector(f.text)))
  .map((f) => f.text);
is(skipped.length > 0, `there are sentences deliberately left in Hebrew — ${skipped.length}`);
const brandBroken = skipped.filter((text) => translate('ru', text) !== text);
eq(brandBroken, [], 'and a pattern never reaches one of them either — the brand name stays the brand name');

/*
 * ─── AND THE NUMBER AGREES WITH ITS NOUN ──────────────────────────────────
 *
 * Russian picks one of three forms by the last digits of the number. A single
 * form would be wrong for most counts on screen, and wrong in a way no
 * coverage guard can see: the sentence IS translated, it just reads as broken
 * software to the people this was built for. These are the cases the rule
 * turns on, each run through the real engine.
 */
const agreement: [number, string][] = [
  [3, '3 группы приостановлено'],
  [4, '4 группы приостановлено'],
  [5, '5 групп приостановлено'],
  [11, '11 групп приостановлено'],
  [14, '14 групп приостановлено'],
  [21, '21 группа приостановлено'],
  [22, '22 группы приостановлено'],
  [25, '25 групп приостановлено'],
  [101, '101 группа приостановлено'],
  [112, '112 групп приостановлено'],
];
const wrongForm = agreement
  .filter(([n, want]) => translate('ru', `${n} קבוצות הושהו`) !== want)
  .map(([n, want]) => `${n}: got "${translate('ru', `${n} קבוצות הושהו`)}", want "${want}"`);
eq(wrongForm, [], "a count and its noun agree, by Russian's own rule and not by one form for all");

/* A value that is not a whole number has nothing to agree with, and must
   not produce a brace or an empty gap on the screen. */
const notACount = translate('ru', 'לפני 08:30 דקות');
eq(notACount.includes('{'), false, 'a value that is not a count never leaves a brace on the screen');
eq(notACount, '08:30 минут назад', 'and falls back to the form Russian uses when the count is unknown');

console.log(`${NAME} OK — ${checks} assertions over ${plain.length} sentences and ${patterns.length} value shapes`);
