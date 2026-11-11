import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { leaveOneGroup } from '../facebook/leave';

/**
 * LEAVING A GROUP — DRIVEN IN A BROWSER, BECAUSE IT CANNOT BE UNDONE.
 *
 * "תוסיף כאן אופציה מהירה לצאת מהקבוצות שכשלו ולא ניתן לפרסם בהן."
 *
 * Every other browser errand in this product adds something or reads
 * something. This one ENDS A MEMBERSHIP, and plenty of his groups re-admit
 * only through an admin — so a wrong click here costs him a group for good
 * and there is no repair path in the app. That is the whole reason this file
 * exists and the reason it drives a real browser rather than reading the
 * source:
 *
 *   • A PRESS IS NOT AN OUTCOME. The page is re-read afterwards and "left" is
 *     claimed only where Facebook then offers the way back in. Without that,
 *     a layout change reports fifteen successful exits that never happened
 *     and fifteen groups get switched off for nothing.
 *
 *   • THE LABELS ARE ANCHORED. "עזיבת הקבוצה" appears inside other groups'
 *     cards in the sidebar; an unanchored match leaves the WRONG group, which
 *     is the worst thing this file could allow.
 *
 *   • NOTHING IS PRESSED ON A PAGE WE HAVE MISREAD. A page offering both the
 *     join and the leave control is not a page we understand.
 *
 *   npx tsx worker/test/leave.test.ts
 */

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};

const PAGE = (body: string) =>
  `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>קבוצה | Facebook</title></head>
<body><main>${body}</main></body></html>`;

/*
 * A group page shaped like Facebook's: the leave control behind the "…", and
 * a confirmation over it whose own button repeats the word. `after` is what
 * the page becomes once the confirmation is pressed — which is the only
 * thing the code is allowed to read as success.
 */
const group = (opts: { inMenu?: boolean; confirm?: boolean; after: string }) =>
  PAGE(`<h1>קבוצת באר שבע</h1>
<div role="button" id="more" aria-label="אפשרויות נוספות">…</div>
<div id="leavewrap" ${opts.inMenu ? 'hidden' : ''}><div role="button" id="leave" aria-label="עזיבת הקבוצה">עזיבת הקבוצה</div></div>
<script>
  var left = sessionStorage.getItem('left') === '1';
  if (left) {
    document.getElementById('leavewrap').remove();
    document.getElementById('more').remove();
    document.body.innerHTML += ${JSON.stringify(`<div role="button" aria-label="הצטרפות לקבוצה">הצטרפות לקבוצה</div>`)};
  } else {
    document.getElementById('more').addEventListener('click', function () {
      document.getElementById('leavewrap').hidden = false;
    });
    document.getElementById('leave').addEventListener('click', function () {
      ${
        opts.confirm === false
          ? `sessionStorage.setItem('left', ${JSON.stringify(opts.after)});`
          : `var d = document.createElement('div');
        d.setAttribute('role', 'dialog');
        d.innerHTML = '<p>לעזוב את הקבוצה?</p>' +
          '<div role="button" aria-label="ביטול">ביטול</div>' +
          '<div role="button" id="yes" aria-label="עזיבת הקבוצה">עזיבת הקבוצה</div>';
        document.body.appendChild(d);
        document.getElementById('yes').addEventListener('click', function () {
          sessionStorage.setItem('left', ${JSON.stringify(opts.after)});
        });`
      }
    });
  }
</script>`);

/*
 * HIS OWN PAGE, 11.11 — the shape that produced "לא נמצא כפתור יציאה"
 * on a group he is a member of. There is NO "…" anywhere: the header carries
 * a "הצטרפת" button, and that is what opens the menu. The first version
 * looked only for the overflow mark, so on every group this feature exists
 * for, the menu was never opened at all.
 *
 * AND A DECOY BEFORE IT, which is the second half of the same bug: `.find()`
 * took the first matching opener and stopped, so one wrong guess ended the
 * attempt even once the right label was listed.
 */
const joinedShaped = PAGE(`<h1>דירות להשכרה שכונות טובות באר שבע</h1>
<div role="button" id="decoy" aria-label="עוד">עוד</div>
<div role="button" id="joined" aria-label="הצטרפת">הצטרפת</div>
<div id="menu" hidden><div role="menuitem" id="leave" aria-label="עזיבת הקבוצה">עזיבת הקבוצה</div></div>
<script>
  var left = sessionStorage.getItem('left') === '1';
  if (left) {
    document.getElementById('joined').remove();
    document.getElementById('menu').remove();
    document.body.innerHTML += '<div role="button" aria-label="הצטרפות לקבוצה">הצטרפות לקבוצה</div>';
  } else {
    /* The decoy opens an overlay that reveals NOTHING and, like Facebook's
       own menus, covers the page until Escape closes it. */
    document.getElementById('decoy').addEventListener('click', function () {
      var o = document.createElement('div');
      o.id = 'overlay'; o.setAttribute('role','dialog');
      o.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9';
      document.body.appendChild(o);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { var o = document.getElementById('overlay'); if (o) o.remove(); }
    });
    document.getElementById('joined').addEventListener('click', function () {
      document.getElementById('menu').hidden = false;
    });
    document.getElementById('leave').addEventListener('click', function () {
      var d = document.createElement('div');
      d.setAttribute('role','dialog');
      d.innerHTML = '<div role="button" aria-label="ביטול">ביטול</div>' +
                    '<div role="button" id="yes" aria-label="עזיבת הקבוצה">עזיבת הקבוצה</div>';
      document.body.appendChild(d);
      document.getElementById('yes').addEventListener('click', function () { sessionStorage.setItem('left','1'); });
    });
  }
</script>`);

const PAGES: Record<string, string> = {
  /* THE 11.11 CASE. */
  joinedbtn: joinedShaped,
  /* The ordinary case: "…" → "עזיבת הקבוצה" → confirm → we are out. */
  ok: group({ inMenu: true, after: '1' }),
  /* Same, but the control is on the page itself rather than in the menu. */
  direct: group({ inMenu: false, after: '1' }),
  /*
   * PRESSED AND THE PAGE WILL NOT SAY. The leave control is still there on
   * the reload. Reporting success here is how a group he is still in gets
   * switched off and silently stops receiving posts.
   */
  silent: group({ inMenu: true, after: '0' }),
  /* Not a member to begin with — nothing may be pressed. */
  notmember: PAGE('<h1>קבוצה</h1><div role="button" aria-label="הצטרפות לקבוצה">הצטרפות לקבוצה</div>'),
  /* No control of any kind. */
  none: PAGE('<h1>קבוצה</h1><p>שלום</p>'),
  /* Facebook limiting US. Nothing is touched. */
  blocked: PAGE('<h1>קבוצה</h1><p>אתם מוגבלים זמנית.</p><div role="button" aria-label="עזיבת הקבוצה">עזיבת הקבוצה</div>'),
  /*
   * THE TRAP. The sidebar carries another group's card whose text contains
   * the words. An unanchored or uncapped match leaves the wrong group — and
   * this page has no leave control of its own, so the only honest answer is
   * "no-button".
   */
  sidebar: PAGE(`<h1>קבוצה</h1>
<div role="button" aria-label="קבוצות מוצעות: אפשר לבצע עזיבת הקבוצה בכל רגע מתוך ההגדרות שלה">קבוצה מוצעת</div>
<a role="button" aria-label="מידע על עזיבת קבוצות">עזרה</a>`),
};

async function browserPass(): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const at = (k: string) => `https://www.facebook.com/groups/${k}`;
    for (const key of Object.keys(PAGES)) {
      /* A fresh context per page: sessionStorage is how the fixture remembers
         that it was left, and it must not leak into the next case. */
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.route('https://www.facebook.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGES[key] ?? PAGE('<h1>?</h1>') }),
      );
      const r = await leaveOneGroup(page, at(key));

      if (key === 'ok' || key === 'direct' || key === 'joinedbtn') {
        eq(r.outcome, 'left', `${key}: a confirmed exit is reported as one`);
      } else if (key === 'silent') {
        /* THE ONE THAT MATTERS MOST. */
        eq(r.outcome, 'unconfirmed', 'silent: pressed and unconfirmed is NEVER reported as left');
      } else if (key === 'notmember') {
        eq(r.outcome, 'not-member', 'notmember: a group we are not in is recognised, not pressed');
      } else if (key === 'none' || key === 'sidebar') {
        eq(r.outcome, 'no-button', `${key}: no leave control means no-button, never a guess`);
        /*
         * AND IT SAYS WHAT IT SAW. On 11.11 the whole report was "לא נמצא
         * כפתור יציאה", and the reason — the menu hiding behind
         * "הצטרפת" — could only be found by asking the owner what was on
         * his screen. The labels cost nothing: they were already read.
         */
        if (key === 'sidebar') {
          is(/מה שהיה בעמוד/.test(r.detail), 'sidebar: a dead end reports the labels the page offered');
          /* The reader prefers aria-label over the visible text, so this is
             what the page really offered. The long one beside it is over the
             40-character cap and is correctly absent: that cap is what stops
             a paragraph containing the words from being treated as a button. */
          is(r.detail.includes('מידע על עזיבת קבוצות'), `sidebar: the labels reported are the page's own — got: ${r.detail}`);
          is(!r.detail.includes('בכל רגע מתוך ההגדרות'), 'sidebar: and prose too long to be a button never reaches the report');
        }
      } else if (key === 'blocked') {
        eq(r.outcome, 'unavailable', 'blocked: Facebook limiting us stops the run before anything is pressed');
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

/* ─────────────────────── the rules, read off the source ─────────────────── */

function sourcePass(): void {
  const src = readFileSync(new URL('../facebook/leave.ts', import.meta.url), 'utf8');

  /*
   * EVERY LABEL IS ANCHORED AT THE START. The sidebar fixture above proves
   * the behaviour; this proves the rule, so a sixth language added later
   * cannot quietly arrive unanchored.
   */
  const labels = src.slice(src.indexOf('const LEAVE_LABEL'), src.indexOf('const BLOCKED'));
  const alternatives = [...labels.matchAll(/'([^']*)'/g)].map((m) => m[1]).filter((t) => t && !t.startsWith('|'));
  is(alternatives.length > 0, 'the label lists were located');
  for (const alt of alternatives) {
    if (alt === '|' || alt === 'i') continue;
    is(alt.startsWith('^'), `every label alternative is anchored — "${alt}" is not, and would match inside another group's card`);
  }

  /* A label longer than a short phrase is a paragraph that merely contains
     the words. join.ts caps at 40 for the same reason and the two must agree. */
  is(/label\.length > 40/.test(src), 'a long label is not a button label — it is prose that contains the words');

  /* MEMBERSHIP IS CHECKED BEFORE ANYTHING IS PRESSED, and a page offering
     both controls is a page we have misread. */
  const beforeClick = src.slice(0, src.indexOf('await leave.click()'));
  is(/JOIN_LABEL\.test\(b\.label\)\) && !buttons\.some\(\(b\) => LEAVE_LABEL\.test\(b\.label\)\)/.test(beforeClick),
    'already-out is decided before the press, and only when the leave control is absent too');

  /* THE CONFIRMATION IS FOUND BY ITS OWN WORD, inside the dialog. "the
     primary button in whatever opened" is how the wrong thing gets pressed. */
  is(/CONFIRM_LABEL\.test\(label\)/.test(src), "the dialog's button is matched on what it says, not on where it sits");
  is(/dialog\.locator\(/.test(src), 'and it is looked for INSIDE the dialog');

  /*
   * AND THE ANSWER COMES FROM A FRESH LOAD. Reading the live DOM after the
   * click can show a header Facebook has not swapped yet, which is a success
   * reported on a page that has not changed.
   */
  const afterClick = src.slice(src.indexOf('await leave.click()'));
  is(/page\.goto\(url/.test(afterClick), 'the page is loaded again before the outcome is decided');
  is(
    afterClick.indexOf("say('left'") > afterClick.indexOf('page.goto(url'),
    'and "left" is only ever returned after that reload — never from the click',
  );
  is(/if \(after\.some\(\(b\) => LEAVE_LABEL\.test\(b\.label\)\)\) return say\('unconfirmed'/.test(afterClick),
    'a leave control still on the page after the press is reported as unconfirmed');
}

/* ───────────────── the worker branch, and what it is allowed to do ──────── */

function workerPass(): void {
  const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  const branch = worker.slice(worker.indexOf("} else if (cmd.command === 'leave') {"), worker.indexOf("} else if (cmd.command === 'resume') {"));
  is(branch.length > 200, 'the leave branch was located');

  /*
   * THE ADDRESS IS CHECKED HERE. "אסור לסמוך על ID שנשלח מה-Frontend בלבד" —
   * and this branch opens a page in his live session and presses a button
   * that ends a membership, so it is the sharpest case of that rule in the
   * product. The row is found BY THE ADDRESS, inside this worker's own
   * tenant; an id in the payload would let a caller name any group at all.
   */
  is(/parseGroupUrl\(String\(cmd\.payload\?\.url \?\? ''\)\)/.test(branch), 'the address is re-parsed here and not trusted');
  is(!/payload\?\.(id|targetId)/.test(branch), 'and no id from the dashboard is used to decide which group to leave');
  is(/\.eq\('url', group\.url\)/.test(branch), 'the group row is found by the address the worker itself validated');

  /*
   * THE GROUP IS SWITCHED OFF ONLY ON AN ANSWER THE PAGE GAVE. Switching it
   * off on `unconfirmed` would hide a working group behind a failure that
   * never happened; leaving it ON after a real exit means the queue keeps
   * trying a group he is no longer in.
   */
  is(/outcome === 'left' \|\| outcome === 'not-member'/.test(branch), "only 'left' and 'not-member' switch the group off");
  is(/enabled: false/.test(branch), 'and that is what switching it off means');
  is(/logActivity\('warn', 'target_left'/.test(branch), 'and it is written to the log the owner reads');
  const off = branch.indexOf('enabled: false');
  is(branch.lastIndexOf("outcome === 'left'", off) > -1, 'the switch-off sits inside that condition, not beside it');
}

/* ─────────────────────── the screen asks before it does it ──────────────── */

function screenPass(): void {
  const item = readFileSync(new URL('../../src/components/social/PublicationItem.tsx', import.meta.url), 'utf8');

  /*
   * THE MENU ITEM OPENS THE QUESTION; IT DOES NOT DO THE THING. A one-tap
   * leave in an overflow menu is a membership ended by a mis-tap.
   */
  is(/onSelect: \(\) => setLeaving\(true\)/.test(item), 'the menu item opens the confirmation rather than leaving');
  is(/actions\.onLeaveGroup\?\.\(row\)/.test(item), 'and the callback runs from inside the sheet');
  const sheet = item.slice(item.indexOf('open={leaving}'), item.indexOf('open={open}'));
  is(sheet.length > 200, 'the confirmation sheet was located');
  is(/אישור מנהל/.test(sheet), 'and it names the cost: some groups re-admit only through an admin');
  is(/variant="danger"/.test(sheet), 'the confirming button is marked as the destructive one');

  /*
   * AND THE SOFTER ACTION IS REACHABLE FROM THE SAME SHEET. Most of these
   * rows need "stop trying", not "leave" — a person who opened this sheet is
   * one tap from the irreversible one and must be able to take the other.
   */
  is(/actions\.onStopTarget\?\.\(row\)/.test(sheet), 'and "just stop trying" is offered beside it');

  /* Both are offered only on the statuses he is looking at when he wants
     them. On a published row the group is not the subject. */
  for (const fn of ['onStopTarget', 'onLeaveGroup']) {
    const at = item.indexOf(`actions.${fn} &&`);
    is(at > -1, `${fn} is drawn`);
    const line = item.slice(at, at + 260);
    is(/row\.status === 'failed'/.test(line) && /'needs_attention'/.test(line), `${fn} is offered on a row that went wrong, not on every row`);
  }
}

async function main(): Promise<void> {
  sourcePass();
  workerPass();
  screenPass();
  await browserPass();
  console.log(`leave-group OK — ${checks} assertions, every outcome driven in a real browser`);
}

void main();
