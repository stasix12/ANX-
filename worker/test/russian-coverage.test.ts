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

import { translate, translatedKeys, translatedPatterns, translatedPatternValue, translatedValue, keep, PH, PH_THIN_OK } from '../../src/lib/social/i18n';

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
/*
 * ─── WORDS THAT GO TO FACEBOOK, NOT TO THE SCREEN ─────────────────────────
 *
 * src/lib/social/compose.ts writes post text. These five strings are the
 * service names and benefit lines it puts INSIDE a Hebrew post — they are
 * published, not displayed as interface, and a Russian translation of one
 * would be a lie: the preview would read Russian while Hebrew went out to
 * the group. The post text is marked data-no-translate wherever it is shown
 * (PostPreview, PreLaunchReview, PublicationItem), and these must stay out
 * of the dictionary as well, which the assertion below enforces.
 *
 * The tone titles in the same file ("מכירתי", "אישי") are NOT here: those
 * label the variant on screen, so they are interface and must be translated.
 */
const POST_CONTENT = [
  'ניקוי ספות וריפודים',
  'ניקוי מזגנים',
  'הסרת כתמים, ריחות וקרדית האבק — הספה חוזרת להיות חדשה',
  'אוויר נקי, פחות חשמל ובלי ריח של עובש',
  'תוצאה מקצועית שרואים מיד',
];

const SKIP = new Set([
  ...POST_CONTENT,
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
const HANDLED_MORE_SPECIFICALLY = new Set([
  `${PH} ל${PH}${PH}`,
  /*
   * ─── THE THIN TWO-SLOT SHAPES, DELIBERATELY NOT PATTERNS ──────────────
   *
   * `${a} ${b} היום` and its four siblings are two values with one short
   * word between them. As patterns they matched almost anything, and on the
   * real dashboard one of them took a line of six facts and printed half of
   * it in Russian: "162 פרסומים ממתינים вам", "קבוצות Получили היום".
   * worker/test/russian-rendered.test.ts measures that line now and would
   * fail if it came back.
   *
   * The sentences those shapes really produce are in the dictionary in full
   * — "§ פרסומים ממתינים לכם", "קבוצות קיבלו היום" — so the screens are
   * covered and the dangerous shapes are gone.
   */
  `${PH} ${PH} היום`,
  `${PH} ${PH} טיפול`,
  `${PH} ${PH} תגובה`,
  `${PH} ${PH} לתגובה`,
  `${PH} ${PH} לכם`,
  /*
   * ─── 'לפני §' IS NOT A PATTERN ANY MORE, AND MUST NOT BECOME ONE ───────
   *
   * relativeHe() (src/lib/social/time.ts:292) builds `לפני ${label}`, so the
   * parser sees this shape. It was a pattern once, and as a pattern it
   * rewrote the customer's own words: "לפני" is a preposition, so any text
   * node starting with it was swallowed —
   *
   *   'לפני ואחרי'   ->  'ואחרי назад'      ("and after ago")
   *   'לפני ההפעלה'  ->  'ההפעלה назад'
   *
   * and "לפני ואחרי" is the commonest phrase in a cleaning business's own
   * posts and variant labels. The label set relativeHe can produce is finite
   * and closed, and every member of it is in the dictionary in full — along
   * with the seconds and שע׳ forms the other two clocks produce:
   *
   *   לפני פחות מדקה · לפני שנייה · לפני שתי שניות · לפני § שניות ·
   *   לפני § שנ׳ · לפני דקה · לפני שתי דקות · לפני § דקות · לפני § דק׳ ·
   *   לפני שעה · לפני שעתיים · לפני § שעות · לפני § שע׳ ·
   *   לפני יום · לפני יומיים · לפני § ימים · לפני שבוע
   *
   * Thirty-four labels across both directions of the clock are measured in
   * worker/test/russian-clock.test.ts, which also holds the customer's own
   * phrases and requires them to come back untouched.
   */
  `לפני ${PH}`,
]);

/* A connector or a single letter is not a sentence, and as a dictionary key
   it would be actively harmful: the DOM translator matches whole text nodes,
   and a one-character key would claim any node that happened to equal it. */
const isConnector = (s: string) => (s.match(/[֐-׿]/g) ?? []).length < 3;

function files(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    /*
     * ─── TWO FILES THAT ARE DATA, NOT SENTENCES ───────────────────────────
     *
     * i18n.ts is the dictionary itself. cities-data.ts is every locality in
     * the country — 413 place names, which this file's own header already
     * excludes by kind: "WHAT IT DELIBERATELY DOES NOT COUNT ... a city
     * ('באר שבע' → 'Беэр-Шева' is a place and reads better in Russian)".
     *
     * A place name is translated where it is SHOWN, not where it is stored:
     * the catalog's city chips put it through keep(), the same way a group's
     * own name is kept. Counting the table as 413 untranslated sentences
     * would mean adding 413 dictionary keys that no screen ever looks up,
     * and the dictionary is matched against whole text nodes — a key like
     * "מגדל" would then claim any node that happened to equal it.
     */
    else if (/\.(ts|tsx)$/.test(e.name) && !/i18n\.ts$/.test(e.name) && !/cities-data\.ts$/.test(e.name)) out.push(p);
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

/* The inverse: none of them may have a translation, or the protection above
   is undone by the dictionary. */
const translatedContent = POST_CONTENT.filter((x) => haveExact.has(x));
eq(translatedContent, [], 'no words that get published to Facebook have a Russian translation');

const missingPlain = plain
  .filter((f) => !haveExact.has(f.text) && !SKIP.has(f.text) && !isConnector(f.text))
  .map((f) => `${f.file}:${f.line}  ${f.text}`);
eq(missingPlain, [], 'every Hebrew sentence on a publishing screen has a Russian translation');

const missingPattern = patterns
  .filter((f) => !havePattern.has(f.text) && !HANDLED_MORE_SPECIFICALLY.has(f.text))
  .map((f) => `${f.file}:${f.line}  ${f.text}`);
eq(missingPattern, [], 'and so does every sentence built around a value');

/*
 * ─── WHY THERE IS NO "DEAD PATTERN" CHECK HERE ANY MORE ───────────────────
 *
 * There was one, and it was wrong. It asserted that every pattern in the
 * dictionary describes a shape that appears in the source, on the reasoning
 * that a pattern for a sentence nothing shows is a claim of coverage with
 * nothing behind it.
 *
 * Measuring the rendered screens disproved the premise. The screens build
 * sentences at RUNTIME out of pieces — a helper returns "טופלו" and the
 * screen appends " היום", or a list of facts is joined with bullets — and the
 * finished sentence appears nowhere in any file. "טופלו היום" and
 * "פורסם ל-§ מתוך § קבוצות" are real lines on the real dashboard and the
 * source cannot be asked about either. A check built on the source would push
 * whoever reads it into deleting patterns that are doing their job.
 *
 * So the question "is this pattern used?" is answered where it can be:
 * worker/test/russian-rendered.test.ts renders twenty screens in Russian and
 * fails if any line of the app's own words is still Hebrew, or if any line
 * comes out half Russian. A pattern that is genuinely dead costs one line in
 * a file; a pattern wrongly deleted costs a Hebrew sentence on a Russian
 * screen, and that is the failure he has reported three times.
 */

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
/*
 * THE VERB AGREES TOO, which is the half this table used to let through. The
 * engine settles EVERY brace in the stretch after a §, so one sentence can
 * carry both forms — and Russian needs both: "1 группа приостановлена" and
 * "5 групп приостановлены". Seventeen sentences in the dictionary had a
 * plural-only verb standing next to a noun that does change, so at one they
 * read "1 группа не получили". Each row below pins the noun AND the verb.
 */
const agreement: [number, string][] = [
  [1, '1 группа приостановлена'],
  [2, '2 группы приостановлены'],
  [3, '3 группы приостановлены'],
  [4, '4 группы приостановлены'],
  [5, '5 групп приостановлены'],
  [11, '11 групп приостановлены'],
  [14, '14 групп приостановлены'],
  [21, '21 группа приостановлена'],
  [22, '22 группы приостановлены'],
  [25, '25 групп приостановлены'],
  [101, '101 группа приостановлена'],
  [112, '112 групп приостановлены'],
];
const wrongForm = agreement
  .filter(([n, want]) => translate('ru', `${n} קבוצות הושהו`) !== want)
  .map(([n, want]) => `${n}: got "${translate('ru', `${n} קבוצות הושהו`)}", want "${want}"`);
eq(wrongForm, [], "a count and its noun agree, by Russian's own rule and not by one form for all");

/* A value that is not a whole number has nothing to agree with, and must
   not produce a brace or an empty gap on the screen. */
const notACount = translate('ru', 'לפני 08:30 דקות');
eq(notACount.includes('{'), false, 'a value that is not a count never leaves a brace on the screen');
/* "мин" and not "минут назад": the minute and hour ages are the abbreviated
   form now, measured against the 62px age pill — worker/test/russian-clock
   carries the measurement. What this line guards is unchanged: a value that
   is not a whole number still comes out as a plain string. */
eq(notACount, '08:30 мин', 'and falls back to the form Russian uses when the count is unknown');

/*
 * ─── A NAME BUILT INTO AN ATTRIBUTE ───────────────────────────────────────
 *
 * data-no-translate protects what is painted, because an element can carry an
 * attribute. An aria-label cannot: it is ONE string, and some of them are our
 * words and the customer's joined together —
 *
 *     aria-label={`בחר את ${group.name}`}
 *
 * — so the dictionary answered the whole thing and a group the customer
 * really called "באר שבע ביחד" was announced to a screen reader, and shown in
 * a desktop tooltip, as "Выбрать наш район". keep() marks the customer's part
 * (i18n.ts), and this is what stops the next such attribute from being
 * written without it.
 *
 * The rule is narrow on purpose: a template inside an attribute that reads
 * .name, .query or .base_text is reading the customer's words, and those
 * three are never ours. A Card's own `title` is not in the list, because a
 * card title IS ours.
 *
 * AND A BARE IDENTIFIER COUNTS TOO, which is how three more got through the
 * first version of this guard: `aria-label={`ימי פרסום ל${campaignName}`}`
 * reads no property, so the rule above never looked at it — and a campaign
 * he called "דפים" was announced as "Страницы". Anything whose NAME ends in
 * Name is a name.
 */
const ATTR_DATA = /\.(name|query|base_text)\b|\b[a-z][A-Za-z]*Name\b/;
/*
 * MARKED ONE STEP EARLIER, not here. These two take campaignName as a PROP
 * and use it in four labels and one visible line between them; marking it at
 * the five call sites that pass campaign.name (CampaignCard, CampaignTile,
 * LiveCampaignHero ×2, campaigns/page, PostEditor) protects all five uses at
 * once, and the marks travel inside the string. The count is pinned so a new
 * unmarked label in either file still fails.
 */
const MARKED_BY_CALLER = new Map([
  ['src/components/social/CampaignSchedulePanel.tsx', 3],
  ['src/components/social/CampaignScheduleBoard.tsx', 3],
  ['src/components/social/CampaignHoursSheet.tsx', 1],
]);
/* `aria` is this app's own prop for an aria-label (ui.tsx puts it there), and
   leaving it out hid three more labels in CampaignScheduleBoard. */
const ATTRS_WITH_TEXT = new Set(['aria-label', 'aria', 'title', 'label', 'placeholder', 'alt']);
function unkeptNames(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
        continue;
      }
      if (!e.name.endsWith('.tsx')) continue;
      const text = readFileSync(full, 'utf8');
      if (!/\$\{/.test(text)) continue;
      const src = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: ts.Node): void => {
        if (
          ts.isJsxAttribute(n) &&
          ATTRS_WITH_TEXT.has(n.name.getText(src)) &&
          n.initializer &&
          ts.isJsxExpression(n.initializer) &&
          n.initializer.expression
        ) {
          const whole = n.initializer.expression;
          const spans: ts.Node[] = [];
          const collect = (x: ts.Node): void => {
            if (ts.isTemplateExpression(x)) for (const sp of x.templateSpans) spans.push(sp.expression);
            ts.forEachChild(x, collect);
          };
          collect(whole);
          for (const sp of spans) {
            const code = sp.getText(src);
            if (!ATTR_DATA.test(code)) continue;
            if (code.includes('keep(')) continue;
            const line = src.getLineAndCharacterOfPosition(sp.getStart(src)).line + 1;
            out.push(`${path.relative(process.cwd(), full)}:${line}  ${code.slice(0, 60)}`);
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(src);
    }
  };
  walk(path.resolve('src/components/social'));
  walk(path.resolve('src/app/social'));
  /* the pinned files are allowed exactly as many as they have today */
  const left: string[] = [];
  const seen = new Map<string, number>();
  for (const line of out.sort()) {
    const file = line.slice(0, line.indexOf(':'));
    const allowed = MARKED_BY_CALLER.get(file) ?? 0;
    const used = seen.get(file) ?? 0;
    if (used < allowed) seen.set(file, used + 1);
    else left.push(line);
  }
  for (const [file, allowed] of MARKED_BY_CALLER) {
    const used = seen.get(file) ?? 0;
    if (used !== allowed) left.push(`${file}  is pinned at ${allowed} caller-marked labels and has ${used}`);
  }
  return left.sort();
}
eq(unkeptNames(), [], 'every name built into an attribute goes through keep(), or the dictionary rewrites it');

/* And the mechanism itself, both ways round. */
eq(
  translate('ru', `בחר את ${keep('באר שבע ביחד')}`),
  'Выбрать באר שבע ביחד',
  'a marked name comes through a translated sentence untouched',
);
eq(translate('he', `בחר את ${keep('באר שבע ביחד')}`), 'בחר את באר שבע ביחד', 'and the marks never reach the Hebrew screen');

/*
 * ─── A PLURAL-ONLY VERB STANDING NEXT TO A COUNT THAT CHANGES ─────────────
 *
 * The table above pins one sentence. This reads all 2,427 and asks the same
 * question of each, because the table could only ever pin what I thought to
 * write down — and what I had not thought of was the verb. Seventeen
 * sentences carried a noun with three forms and a verb with one:
 *
 *     § {публикация|публикации|публикаций} не записаны в очередь
 *                  ↳ at 1:  "1 публикация не записаны"
 *
 * Wrong in the way he cannot check and a Russian reader cannot miss. The
 * engine settles EVERY brace in the stretch after a §, so the verb can have
 * its three forms too; this guard is what makes the next one fail here
 * instead of on his screen.
 *
 * WHAT IT LOOKS AT: the stretch between a count-sensitive brace and the next
 * value or sentence end — the span the brace actually governs. A word in it
 * that can only be plural, and is not itself braced, is the bug.
 */
const PLURAL_ONLY = /^[а-яё]+(?:ли|ют|ут|ят|ат|ены|аны|ись)$/;
/* The same bug wearing a pronoun: "В 1 группе … состоите ли вы в них".
   "каждые" is left out on purpose — in "по одной каждые §" it agrees with the
   interval, which is a different value. */
const PLURAL_PRONOUN = new Set(['них', 'они', 'ними', 'свои', 'эти']);
/* Words that end that way and are not verbs. Named rather than screened out
   by length, because "ждут" and "вышли" are short and real. */
const NOT_A_VERB = new Set([
  'или', 'если', 'либо', 'ли', 'едва', 'ибо', 'хотя', 'между', 'тем', 'чтобы', 'пусть',
  /* a noun, in the fixed phrase "две недели" */ 'недели',
]);
/* A clause that opens with one of these has its own subject — "…, но плитки
   показывают §" is about the tiles, not about the count — so the span the
   brace governs ends there. */
const NEW_SUBJECT = /\s(?:но|а|однако|поэтому|чтобы|пока|когда|если)\s/;
/* Russian's impersonal neuter — "обработано", "написано", "отнесено" — is
   invariant on purpose and is how this dictionary says a thing about "§ из §",
   where the number the verb belongs to is not the one next to it. */
function disagreeing(ru: string): string[] {
  const out: string[] = [];
  for (const chunk of ru.split(PH)) {
    const braces = [...chunk.matchAll(/\{([^{}]*)\}/g)];
    if (!braces.length) continue;
    const counted = braces.filter((b) => new Set(b[1].split('|')).size > 1);
    if (!counted.length) continue;
    /* only the span the first counted brace governs: up to the end of its
       sentence, since a full stop starts a clause with its own subject */
    const after = chunk.slice((counted[0].index ?? 0) + counted[0][0].length);
    const span = after.split(/[.!?]/)[0].split(NEW_SUBJECT)[0];
    /* A quoted name is the name of something on screen — «Ждут вас» is a
       queue bucket, not a clause — and a name is never conjugated. */
    const bare = span.replace(/\{[^{}]*\}/g, ' ').replace(/[«"][^«»"]*[»"]/g, ' ');
    for (const w of bare.toLowerCase().match(/[а-яё]+/g) ?? []) {
      const wrong = (PLURAL_ONLY.test(w) && !NOT_A_VERB.has(w)) || PLURAL_PRONOUN.has(w);
      if (wrong) out.push(`${w}  ←  ${ru.slice(0, 80)}`);
    }
  }
  return out;
}
const disagree: string[] = [];
for (const k of translatedKeys()) disagree.push(...disagreeing(translatedValue(k) ?? ''));
for (const p of translatedPatterns()) disagree.push(...disagreeing(translatedPatternValue(p) ?? ''));
eq(disagree, [], 'no sentence puts a plural-only verb next to a count that can be one');

console.log(`${NAME} OK — ${checks} assertions over ${plain.length} sentences and ${patterns.length} value shapes`);
