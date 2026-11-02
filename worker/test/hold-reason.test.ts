/*
 * "עדיין לא מפרסם כלום …"
 *
 * Sent at 23:43 with a screenshot: a queue of 94 waiting, 68 of them due
 * inside the day, a Facebook session reporting green, and nothing coming out.
 * By then it was the ninth message of that shape in one evening, and every
 * one of them had been answered the same way — by me asking him to go to his
 * machine and photograph a terminal.
 *
 * He did not need to. The worker KNEW. There are exactly three ways the gate
 * at the top of tick() closes, each of them already carrying a correct Hebrew
 * sentence naming itself, and all three were being written to `console.log`
 * on a Windows box in another country, once, behind a latch that stopped them
 * ever printing again. Two defects sat in that gap:
 *
 * ONE — THE REASON WENT NOWHERE. idle(state, reason) printed and returned.
 * No row, no log, no screen. The one question this product is asked more than
 * any other had an answer the product refused to give.
 *
 * TWO — A WARNING CLOSED THE GATE, AND COULD NOT BE REOPENED.
 * learnAccountScope() writes a true and useful sentence when a second
 * Facebook account exists and some groups belong to it. It wrote that
 * sentence into `state.attention` — the field the top of tick() returns on.
 * So news about SOME groups stopped ALL publishing, in every campaign, and
 * stopped every chore with it. And it could not be cleared: every command
 * that blanks `attention` (login, check, logout, switch, resume) runs a login
 * check on the way, which calls recordAccount → learnAccountScope → sets it
 * again. "המשך סבב" bought exactly one tick.
 *
 * Source-level assertions, deliberately. Reproducing either needs a live
 * Facebook session and a second real account; what a test CAN do is refuse to
 * let the two shapes back in.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');

/**
 * The same file with every comment removed.
 *
 * This file explains at length the exact lines it forbids, so a bare search
 * finds its own prose and passes on nothing. Four times in this project a
 * guard has been anchored on a string that only ever appeared in a comment.
 */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, ''))
  .join('\n');

/** The body of a named function in the comment-stripped source. */
function body(name: string): string {
  /* `(` OR `<`: getSetting is generic (`function getSetting<T>(`), and anchoring
     on the paren alone silently found nothing and reported the function gone. */
  const at = Math.max(code.indexOf(`function ${name}(`), code.indexOf(`function ${name}<`));
  assert.ok(at > -1, `${name} is gone — re-point this test rather than deleting it`);
  const next = code.indexOf('\nasync function ', at + 10);
  const next2 = code.indexOf('\nfunction ', at + 10);
  const end = [next, next2].filter((n) => n > -1).sort((a, b) => a - b)[0] ?? code.length;
  return code.slice(at, end);
}

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a: unknown, b: unknown, msg: string) => {
  assert.equal(a, b, msg);
  checks++;
};

/* ───────────────────────────── one: the reason reaches a human ──────────── */

const idle = body('idle');

ok(/logActivity\(/.test(idle), 'idle() writes the reason to the activity log — not only to a terminal nobody is sitting at');
ok(/'worker_holding'/.test(idle), "the event is named 'worker_holding', so the feed can say what it is");
ok(/console\.log\(/.test(idle), 'the terminal line stays: it is what somebody watching the machine reads');

/*
 * LEVEL MATTERS, because NotificationBell filters on it.
 *
 * Its predicate is `NOTABLE.has(e.event) || e.level !== 'info'`, so a 'warn'
 * reaches the bell with no change to the bell at all — and an 'info' is
 * dropped unless the event is in that set. 'worker_holding' is not, and must
 * not need to be: the default is 'warn' precisely so the sentence that
 * explains a stopped queue cannot be filtered out of the one place he looks.
 */
ok(/level: 'info' \| 'warn' = 'warn'/.test(idle), "the default level is 'warn', which is what clears NotificationBell's own predicate");

/* ONCE PER EPISODE. The latch has to be set before the await, or a database
   error turns one notice into one per tick — a feed that buries itself. */
const latchAt = idle.indexOf('state.idleNoticeShown = true');
const logAt = idle.indexOf('logActivity(');
ok(latchAt > -1 && logAt > -1, 'both the latch and the write are present');
ok(latchAt < logAt, 'the latch is set BEFORE the write, so a failed write cannot log once per tick');
ok(/if \(state\.idleNoticeShown\) return;/.test(idle), 'a tick that already reported returns at once');

/* And the latch is still cleared in exactly one place — the tick that reaches
   real work. More than one, and "once per episode" stops meaning anything. */
eq((code.match(/state\.idleNoticeShown = false/g) ?? []).length, 1, 'the latch is cleared in exactly one place');

/* ──────────────────── two: all three gates report, and the pause is quiet ─ */

const tick = body('tick');
const gates = [...tick.matchAll(/return idle\(state, ([^;]+)\);/g)].map((m) => m[1]);
eq(gates.length, 3, 'the three gates at the top of tick() are the only ways the worker holds back');

ok(
  gates.some((g) => /התורים מושהים/.test(g) && /'info'/.test(g)),
  "a deliberate pause is logged at 'info': he pressed that button himself and the dashboard already says so",
);
ok(
  gates.some((g) => /ממתין לטיפול ידני/.test(g) && !/'info'/.test(g)),
  'the manual-intervention gate is a warning — it is the one that answers "למה לא מפרסם"',
);
ok(
  gates.some((g) => /אין חיבור לפייסבוק/.test(g) && !/'info'/.test(g)),
  'a dead Facebook session is a warning',
);

/* idle() is awaited, or the log write races the next tick and the process may
   exit with it unsent. `return idle(...)` inside an async tick() does that. */
ok(/async function idle\(/.test(code), 'idle() is async, so the gates can return its promise and the write is not dropped');

/* ──────────────── three: a notice is not the gate, and never becomes it ─── */

const scope = body('learnAccountScope');

ok(
  !/state\.attention\s*=/.test(scope),
  'learnAccountScope() must NEVER write state.attention: that field stops every campaign, and this sentence is about some groups',
);
ok(/state\.notice\s*=\s*says/.test(scope), 'the narrowing is a notice');
ok(/logActivity\('warn', 'account_scope_narrowed'/.test(scope), 'and it still announces itself — the comment above it calls that the one thing this step cannot ship without');

/* IT IS RETRACTED. A notice nobody takes back is a notice nobody believes —
   and this one survived a switch back to the right account, for ever. */
eq(
  (scope.match(/else if \(state\.notice\) \{\s*state\.notice = '';/g) ?? []).length,
  2,
  "the notice is cleared on both ways out — and the clearing is REACHABLE: `else if (state.notice)`, not a branch that can never be taken",
);

/* THE REAL PROTECTION IS UNTOUCHED. queueScope() is what stops this browser
   publishing another identity's group; nothing here may widen it. */
ok(/const scope = queueScope\(state\)/.test(code), 'the due query is still scoped by queueScope()');
ok(/account_id\.eq\.\$\{scope\},account_id\.is\.null/.test(code), "and still only takes this account's groups plus the unassigned ones");

/* THE SECOND NUMBER — "can this machine publish anything at all?" */
ok(/mine === 0/.test(scope), 'the message distinguishes "most groups still work" from "this computer will publish nothing"');
ok(/mineCount/.test(scope), 'and it counts that, rather than asserting it');

/* ─────────────────── four: the gate still has its real reasons ──────────── */

ok(/state\.attention = `התוכנה פתחה/.test(code), 'the window-storm breaker still closes the gate — that one IS a reason to stop');
ok(/if \(err instanceof SessionError\) \{\s*state\.attention = message;/.test(code), 'a lost Facebook session still closes the gate');

/* ──────────────────────── five: the dashboard can read it ───────────────── */

const card = readFileSync(new URL('../../src/components/social/BrowserStatusCard.tsx', import.meta.url), 'utf8');
ok(/attention_message: state\.attention \|\| state\.notice/.test(code), 'the heartbeat carries the block if there is one, otherwise the news');
ok(/!needsHuman && worker\?\.online && worker\.attention_message/.test(card), 'and the card draws the news when it is not a fault');
ok(
  card.indexOf('needsHuman && (') < card.indexOf('!needsHuman && worker?.online'),
  'the fault branch is still first, so a real authentication problem is never drawn as mere news',
);

/* The status is NOT raised by a notice: that is what would turn news back
   into "נדרשת התערבות" on every screen in the product. */
const heartbeat = body('heartbeat');
ok(!/status = /.test(heartbeat), 'heartbeat() does not rewrite the status it was given');
ok(/state\.attention \? 'needs_attention' : 'online'/.test(code), 'and the callers still decide it from state.attention alone');

/* ───────── six: the factory defaults do not arrive silently ────────────── */

/*
 * DEFAULT_BROWSER is the first-run posture and every value in it is hostile
 * to publishing — test mode, manual confirmation before every click, eight a
 * day, a twenty-minute surcharge between group posts. getSetting() returned
 * it without a word when the row was absent, so "this tenant never saved its
 * settings" and "the system is broken" were the same screen: online worker,
 * green Facebook light, rows due, nothing coming out.
 */
const settings = body('getSetting');
ok(/'settings_defaulted'/.test(settings), 'a settings row that is absent says so — the defaults stop the queue, so arriving at them silently is a stopped queue with no explanation');
ok(/defaultedSettings\.has\(key\)/.test(settings), 'once per key per process: the ticks are five seconds apart, and a fact about configuration is not an event');
ok(/defaultedSettings\.add\(key\)/.test(code), 'and the key is remembered before the write, so a failed write cannot repeat it every tick');
ok(/מצב בדיקה ואישור ידני/.test(settings), 'and it names the two defaults that actually stop the queue, rather than saying "defaults"');

const browserDefaults = readFileSync(new URL('../../src/lib/social/types.ts', import.meta.url), 'utf8');
const block = browserDefaults.slice(browserDefaults.indexOf('export const DEFAULT_BROWSER'), browserDefaults.indexOf('export interface ActivityEntry'));
ok(/testMode: true/.test(block) && /requireConfirmation: true/.test(block), 'the defaults are still the cautious ones — this test exists to make the fallback LOUD, not to loosen it');

console.log(`✓ hold-reason: ${checks} בדיקות עברו`);
