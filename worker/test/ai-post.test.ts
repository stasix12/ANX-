/*
 * ─── THE AI POST GENERATOR ─────────────────────────────────────────────────
 *
 * "שילוב מנגנון AI לכתיבת פוסטים" — 07.11.2026, with a screenshot sent as a
 * binding design specification and a long list of conditions.
 *
 * Three of those conditions are what this file is mostly about, because each
 * one is a promise that cannot be kept by looking at the screen:
 *
 *   "אין להציג תוכן דמה כאילו נוצר באמצעות AI."
 *   "יש להשתמש במנגנון מאובטח למפתחות API, ללא חשיפת מפתחות בדפדפן."
 *   "אין ליצור מנוע פרסום מקביל."
 *
 * A screenshot proves none of them. A fallback string would look exactly like
 * a generated post; a leaked key looks like nothing at all; a second
 * publishing path looks like the first one working. So they are pinned here,
 * in the code, where a later change has to walk past them.
 *
 * The geometry section measures the REAL component against the reference, in
 * Chromium, at the widths the owner's phone actually is.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import {
  AI_POST_KINDS,
  AI_POST_SERVICES,
  AI_POST_TONES,
  AI_TOPIC_MAX,
  CUSTOM_SERVICE,
  validateAiRequest,
} from '../../src/lib/social/ai-post';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.equal(a, b, msg); };

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const route = read('src/app/api/social/ai/post/route.ts');
const routeCode = strip(route);
const composer = read('src/components/social/AiPostComposer.tsx');
const composerCode = strip(composer);
const editor = read('src/components/social/PostEditor.tsx');
const editorCode = strip(editor);
const contract = read('src/lib/social/ai-post.ts');

// ───────────────── 1. THE KEY NEVER REACHES A BROWSER ──────────────────────
/*
 * The one rule with no second chance: a key in a bundle is readable by every
 * visitor of every customer, and it cannot be un-leaked.
 */
is(/process\.env\.ANTHROPIC_API_KEY/.test(routeCode), 'the key is read on the server, in the route');
for (const src of [composerCode, editorCode]) {
  is(!/ANTHROPIC/.test(src), 'and nowhere in any client component — not even by name');
}
is(!/NEXT_PUBLIC_[A-Z_]*ANTHROPIC|NEXT_PUBLIC_[A-Z_]*API_KEY/.test(routeCode + composerCode),
  'and never behind a NEXT_PUBLIC_ prefix, which is exactly what puts a value in the browser');
/* The route is server-only by construction: it imports the server auth module,
   which is itself `import 'server-only'` transitively through server/db. */
is(/from '@\/lib\/social\/server\/auth'/.test(routeCode), 'the route uses the server-side auth module');
is(/export const runtime = 'nodejs'/.test(routeCode), 'and runs on Node, where that module can exist at all');

// ───────────────── 2. AN UNPAID-FOR REQUEST COSTS NOTHING ──────────────────
/*
 * requireAdmin BEFORE the key is read and before the client is built. This
 * route spends real money on every call, so the gate has to come first — not
 * merely be present. Position is the assertion.
 */
/* Measured inside the HANDLER, not the file: `validateAiRequest` first
   appears in the import list at the top, so a whole-file indexOf put it
   before the gate and failed an order that was in fact correct. The handler
   body is the only place where order means anything. */
const handler = routeCode.slice(routeCode.indexOf('export async function POST'));
is(handler.length > 200, 'the POST handler was located');
const gateAt = handler.indexOf('await requireAdmin(request)');
const keyAt = handler.indexOf('process.env.ANTHROPIC_API_KEY');
const clientAt = handler.indexOf('new Anthropic(');
const validateAt = handler.indexOf('validateAiRequest(');
is(gateAt > 0 && keyAt > gateAt, 'the caller is authenticated before the key is even read');
is(clientAt > keyAt, 'and before an SDK client is built, so an anonymous request reaches no network at all');
is(validateAt > gateAt && validateAt < clientAt, 'the body is validated between the two, so a malformed request never reaches the model');

// ───────────────── 3. NO FAKE POSTS, EVER ──────────────────────────────────
/*
 * "אין להציג תוכן דמה כאילו נוצר באמצעות AI." A fallback string is
 * indistinguishable from a generated one on screen, which is what makes it
 * the most dangerous shortcut available here. The shape that forbids it: the
 * route's success path has exactly ONE source of text, and every failure
 * answers with a reason instead.
 */
is(/message\.content/.test(routeCode), 'the text comes from the model response and from nothing else');
is(/if \(!text\) return fail\('upstream', 502\)/.test(routeCode),
  'an empty answer is a FAILURE, not an empty post — returning it would put a blank card on screen that looks like success');
is(/stop_reason === 'refusal'/.test(routeCode), 'a safety decline is reported as its own reason, not swallowed');
/* The client half: nothing renders a result it did not receive. */
is(!/const (FALLBACK|SAMPLE|DEMO|MOCK)/i.test(composerCode), 'the screen carries no canned post to fall back on');
is(/if \(!text\) \{/.test(composerCode), 'and a 200 with no text is shown as a failure there too');

// ───────────────── 4. NO SECOND PUBLISHING ENGINE ──────────────────────────
/*
 * "אין ליצור מנוע פרסום מקביל. אין לשנות את הלוגיקה של התורים, המתזמן,
 *  החיבור למחשב או מנגנון הפרסום בפייסבוק."
 *
 * The generator writes text. The proof is negative and it is the strongest
 * pin in this file: the component knows no word of the publishing vocabulary.
 */
/* Named precisely, because a bare word is not the vocabulary: `target` alone
   matched `e.target.value` on six select elements and failed a component that
   is doing exactly the right thing. These are the real symbols. */
for (const forbidden of [
  'social_queue', 'quickPublish', 'savePost', 'createSchedule', 'listTargets', 'listCampaigns',
  'selectedTargets', 'SocialTarget', 'Campaign', 'Schedule', 'publish',
]) {
  is(!composerCode.includes(forbidden), `the generator never touches ${forbidden} — it writes text and hands it over`);
}
/* And it imports nothing from the publishing side at all. */
const imports = composerCode.slice(0, composerCode.indexOf('export function'));
for (const mod of ['library', 'campaign', 'plan', 'rules']) {
  is(!new RegExp(`from '@/lib/social/${mod}`).test(imports), `nor import from ${mod}`);
}
/* The one way out, and it is the editor's own field. */
is(/onAccept\(result\)/.test(composerCode), 'its single exit hands the text to the parent');
is(/onAccept=\{\(text\) => \{\s*update\('base_text', text\)/.test(editorCode),
  "and the parent puts it in base_text — the same field a typed post uses, so everything downstream is unchanged");
/* The route writes nothing at all. */
for (const write of ['setSetting', 'insert(', 'update(', 'upsert(', 'delete(']) {
  is(!routeCode.includes(write), `the route never calls ${write} — generating a post changes no row anywhere`);
}

// ───────────────── 5. THE TENANT, AND WHY IT IS NOT getSetting ─────────────
/*
 * getSetting() in server/db.ts is NOT tenant-aware: its own docblock says the
 * service role bypasses RLS and `.maybeSingle()` throws once a second business
 * exists. There are eight. Using it here would have made this route answer 500
 * for every customer on its first day, and the failure would have looked like
 * the model being down.
 */
is(!/getSetting/.test(routeCode), 'the route does not use the non-tenant-aware settings reader');
is(/social_tenant_members/.test(routeCode), 'it resolves the tenant from the authenticated user');
is(/\.eq\('user_id', userId\)/.test(routeCode), 'by the user id the token proved — never by anything the body said');
is(/\.eq\('tenant_id', member\.tenant_id\)/.test(routeCode), 'and reads the business row for that tenant alone');
/* The business details come from the row, so a browser cannot put another
   business's name on a post published from this account. */
is(!/business:/.test(strip(composerCode)), 'the screen never sends business details — the server reads them');

// ───────────────── 6. THE PROMPT TREATS THE OWNER'S TEXT AS DATA ───────────
is(/<נושא_מהמשתמש>/.test(routeCode), 'free text arrives inside a tagged block');
is(/לא כהוראות לך/.test(route), 'and the instructions above it say to treat that block as content, not as instructions');
is(/אל תמציא מחירים/.test(route), 'the model is told not to invent prices — a made-up price is a promise the owner has to keep');
is(/אל תכתוב מספר טלפון/.test(route),
  'nor a phone number or link: the publisher appends the real ones, and a second copy in the body would double them');

// ───────────────── 7. THE VALIDATOR, EXECUTED ──────────────────────────────
/*
 * Not a text pin — the real function, against the inputs that matter. It is
 * the only thing between a browser and a prompt.
 */
const good = { kind: AI_POST_KINDS[0], service: AI_POST_SERVICES[0], tone: AI_POST_TONES[0] };
is(validateAiRequest(good).ok, 'a well-formed request passes');
is(!validateAiRequest(null).ok, 'null does not');
is(!validateAiRequest({ ...good, kind: 'מה שבא לי' }).ok, 'an unknown post kind is refused rather than interpolated into a prompt');
is(!validateAiRequest({ ...good, service: 'דרופשיפינג' }).ok, 'and an unknown service');
is(!validateAiRequest({ ...good, tone: '<script>' }).ok, 'and an unknown tone');
is(!validateAiRequest({ ...good, service: CUSTOM_SERVICE }).ok, 'a custom service with nothing typed is not a choice yet');
is(validateAiRequest({ ...good, service: CUSTOM_SERVICE, serviceOther: 'פוליש לרכב' }).ok, 'with text, it is');
{
  const long = validateAiRequest({ ...good, topic: 'א'.repeat(5000) });
  is(long.ok && (long.value.topic ?? '').length === AI_TOPIC_MAX,
    'a pasted document is capped, not rejected — the cap is the cost control, and what he types is his business');
}
{
  const many = validateAiRequest({ ...good, previous: ['a', 'b', 'c', 'd', 'e'] });
  is(many.ok && (many.value.previous ?? []).length === 3,
    'and only the last three versions travel, so the fifth press is not the most expensive one');
}
{
  const trimmed = validateAiRequest({ ...good, topic: '   ' });
  is(trimmed.ok && trimmed.value.topic === undefined, 'whitespace is not a topic');
}
/* Both sides share this function, which is the point of it living in lib. */
is(/validateAiRequest/.test(routeCode), 'the server validates with it');
is(/from '@\/lib\/social\/ai-post'/.test(composerCode), 'and the screen draws its lists from the same file, so they cannot drift');
eq(AI_POST_KINDS.length, 6, 'six post kinds, as specified');
eq(AI_POST_TONES.length, 6, 'six tones, as specified');
is(AI_POST_SERVICES.length >= 5 && !(AI_POST_SERVICES as readonly string[]).includes(CUSTOM_SERVICE),
  'five services plus a custom option that is not one of them');

// ───────────────── 8. MODE SWITCHING LOSES NOTHING ─────────────────────────
/*
 * "המעבר בין המצבים חייב להיות מיידי, ללא רענון עמוד וללא מחיקת תוכן שהמשתמש
 *  כבר כתב." The textarea must not be inside the switched branch — if it were,
 * React would unmount it and the draft would be gone.
 */
const aiBranchAt = editorCode.indexOf("{writeMode === 'ai' && (");
const textareaAt = editorCode.indexOf("value={post.base_text}");
is(aiBranchAt > 0 && textareaAt > 0, 'both the switched branch and the text box were found');
is(textareaAt > aiBranchAt, 'the text box is rendered AFTER the branch, not inside it');
{
  /* And genuinely outside it: the branch must close before the textarea. */
  const branchEnd = editorCode.indexOf('            )}', aiBranchAt);
  is(branchEnd > aiBranchAt && branchEnd < textareaAt,
    'the AI block closes before the text box begins — switching modes cannot unmount a draft');
}
is(/useState<'ai' \| 'manual'>\(postId \? 'manual' : 'ai'\)/.test(editorCode),
  'a post being edited opens by hand, so its existing text is not pushed off the screen by a generator');
is(!/initialResult/.test(editorCode), 'and the editor never passes the test-only seed');

// ───────────────── 9. THE HANDOFF WARNS BEFORE IT OVERWRITES ───────────────
is(/hasText && !window\.confirm\(/.test(composerCode),
  'accepting a post over existing text asks first — a silent replace is how an afternoon of writing disappears');
is(/hasText=\{Boolean\(post\.base_text\.trim\(\)\)\}/.test(editorCode), 'and the editor tells it whether there is anything to lose');

// ───────────────── 10. VERSIONS ARE KEPT, NOT REPLACED ─────────────────────
/*
 * "יש לאפשר יצירת גרסאות נוספות מבלי למחוק את הגרסה הקודמת, עד שהמשתמש בוחר
 *  להחליף אותה."
 */
is(/setHistory\(\(h\) => \[\.\.\.h, text\]\)/.test(composerCode), 'a new version is appended to the history, never written over it');
is(/history\.map\(\(h, i\)/.test(composerCode), 'every version stays reachable');
is(/previous: history\.slice\(-3\)/.test(composerCode), 'and the model is shown what it already wrote, so "צור גרסה נוספת" differs');

// ───────────────── 11. THE REAL COMPONENT, MEASURED ───────────────────────
/*
 * "התאמה מושלמת למסכים ניידים... ללא טקסט שנחתך. ללא כפתורים שיוצאים מגבולות
 *  המסך. ללא גלילה אופקית."
 *
 * Rendered from the actual component with the actual stylesheet, in Chromium,
 * at the widths his phone is. This caught a real defect the first time it ran:
 * "צור גרסה נוספת" wrapped onto two lines inside its own 105px button at
 * 390px, because three flex-1 buttons cannot share 358px.
 */
async function measure(): Promise<void> {
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
    console.log('ai post geometry SKIPPED — no built CSS (run `npm run build` first)');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'ai-post-'));
  copyFileSync(best.file, path.join(dir, 'app.css'));
  writeFileSync(
    path.join(dir, 'index.html'),
    execFileSync('npx', ['tsx', 'worker/test/render-ai-post.tsx'], { encoding: 'utf8', maxBuffer: 8 << 20 }),
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    /* 360 the narrowest Android worth supporting, 390 his iPhone, 430 the
       widest phone, 700 the tablet breakpoint where the row goes to three. */
    for (const width of [360, 390, 430, 700]) {
      const page = await browser.newPage({ viewport: { width, height: 1700 }, deviceScaleFactor: 1 });
      await page.goto('file://' + path.join(dir, 'index.html'));
      const r = await page.evaluate(() => {
        const doc = document.documentElement;
        const small: string[] = [];
        const outside: string[] = [];
        for (const el of Array.from(document.querySelectorAll('button, select, input, textarea'))) {
          const b = el.getBoundingClientRect();
          if (b.height > 0 && b.height < 44) small.push((el.textContent || el.tagName).trim().slice(0, 20));
          if (b.right > doc.clientWidth + 1 || b.left < -1) outside.push((el.textContent || el.tagName).trim().slice(0, 20));
        }
        /* Every label in the action row, and how many lines it really takes —
           the buttons have a fixed min-height, so height proves nothing. */
        const row = document.querySelector('#result div.grid-cols-2');
        const wrapped: string[] = [];
        for (const btn of Array.from(row?.querySelectorAll('button') ?? [])) {
          const text = Array.from(btn.childNodes).find((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
          if (!text) continue;
          const range = document.createRange();
          range.selectNodeContents(text);
          if (range.getClientRects().length > 1) wrapped.push((btn.textContent ?? '').trim());
        }
        /* Measured against its OWN CONTAINER, not the viewport: the card sits
           in a max-width column on a wide screen, so "full width" means the
           card's width and comparing to the window fails at 700px for the
           wrong reason. */
        const btn = document.querySelector('#idle button.bg-gradient-to-l');
        const cta = btn?.getBoundingClientRect();
        return {
          scrolls: doc.scrollWidth > doc.clientWidth + 1,
          small,
          outside,
          wrapped,
          ctaWidth: cta ? Math.round(cta.width) : 0,
          ctaHeight: cta ? Math.round(cta.height) : 0,
          cardWidth: btn?.parentElement ? Math.round(btn.parentElement.getBoundingClientRect().width) : -1,
        };
      });
      is(!r.scrolls, `${width}px: no horizontal scrolling`);
      eq(r.small.length, 0, `${width}px: every control is at least 44px tall — got ${JSON.stringify(r.small)}`);
      eq(r.outside.length, 0, `${width}px: nothing runs off the screen — got ${JSON.stringify(r.outside)}`);
      eq(r.wrapped.length, 0, `${width}px: no button label wraps onto a second line — got ${JSON.stringify(r.wrapped)}`);
      /* The reference's own shape: one full-width gradient button, 48px. */
      eq(r.ctaWidth, r.cardWidth, `${width}px: the AI button spans its card's full width`);
      eq(r.ctaHeight, 48, `${width}px: and is 48px tall, as the reference draws it`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

/* Not a top-level await: tsx loads this file as CommonJS and a top-level
   await there is ERR_REQUIRE_ASYNC_MODULE — the same trap campaign-card and
   progress-contradiction carry a note about. A rejection must still fail the
   run, so it is re-thrown out of the process rather than swallowed. */
measure().then(
  () => console.log(`ai post generator OK — ${checks} checks`),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
