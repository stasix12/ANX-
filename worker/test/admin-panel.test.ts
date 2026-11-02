/**
 * THE GATE IN FRONT OF OTHER PEOPLE'S DATA.
 *
 * "ותוסיף רק אצלי, לא אצל הלקוחות. בהגדרות פאנל אדמין שאני ידע כל רגע נתון מי
 *  מחובר באפליקציה ומאיזה משתמש." — the owner, 02.11.2026.
 *
 * The panel he asked for answers a question that spans every business in the
 * database, and this product has customers in it. So it is the one surface
 * where getting the gate wrong does not show a wrong number — it shows one
 * customer another customer's machines, their business name and the Facebook
 * account they publish from.
 *
 * AND THE GUARD THAT LOOKED LIKE THE RIGHT ONE IS NOT. server/auth.ts exports
 * `requireAdmin`, whose name has promised too much since before there were
 * customers: it verifies that the caller is SIGNED IN and nothing else. Every
 * route in the product uses it correctly, because every other route acts on
 * the caller's own business and RLS decides which rows that is. A panel built
 * behind it would have been a cross-business leak with a reassuring name.
 *
 * So this file pins four things:
 *
 *   1. the predicate itself, which FAILS CLOSED when unconfigured;
 *   2. that the route checks it, and does not merely check requireAdmin;
 *   3. that a customer gets an empty 200 rather than a 403 — because the
 *      client helper turns a status code into a Hebrew sentence, and an admin
 *      panel must not make customers' screens say anything at all;
 *   4. that the payload carries presence and identity and NOT the login
 *      screenshot column, which can hold a picture of a person's own screen.
 *
 *   npx tsx worker/test/admin-panel.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isPlatformAdmin } from '../../src/lib/social/admin-allowlist';

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};
const is = (c: unknown, msg: string) => {
  checks += 1;
  assert.ok(c, msg);
};

/**
 * ─── THE SOURCE WITHOUT ITS OWN EXPLANATIONS ───────────────────────────────
 *
 * The first run of this file failed on "the payload never carries the login
 * screenshot column" — and the route is innocent. It carries a COMMENT saying
 * why login_shot is excluded, and a grep for the column found the sentence
 * explaining its absence. That is the third time in this session that a
 * comment has answered a guard about code: a guard that reads prose is not
 * reading the program.
 *
 * So every assertion below reads the source with comments removed. String
 * literals are skipped rather than scanned, because `'https://…'` inside one
 * is not a line comment and a naive strip would cut the rest of the line.
 */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (two === '//') {
      const end = src.indexOf('\n', i);
      i = end === -1 ? src.length : end;
      continue;
    }
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      out += ch;
      i += 1;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += src[i];
        i += 1;
      }
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const ID = '7a1e4f2c-0b55-4d41-9c33-2f6b8e5a1d90';
const OTHER = '0c9d2b71-5a3e-4f88-b210-7e4a6c1f9b32';
const user = (over: Partial<{ id: string; email: string | null }> = {}) => ({ id: ID, email: 'stas@example.com', ...over });

/** The env var is read on every call, so each case sets it and clears it. */
function withAllowlist<T>(value: string | undefined, run: () => T): T {
  const before = process.env.SOCIAL_ADMIN_USERS;
  if (value === undefined) delete process.env.SOCIAL_ADMIN_USERS;
  else process.env.SOCIAL_ADMIN_USERS = value;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.SOCIAL_ADMIN_USERS;
    else process.env.SOCIAL_ADMIN_USERS = before;
  }
}

function main() {
  /* ─────────────────────── 1. FAIL CLOSED ─────────────────────────────── */

  /*
   * THE DEFAULT IS "NOBODY", INCLUDING THE OWNER.
   *
   * The opposite default is the one that looks harmless in review: with no
   * allowlist configured there is "no customer to protect from yet", so an
   * open default costs nothing — until the day a customer signs up and the
   * panel they can now see has been open the whole time. A gate whose
   * unconfigured state is "everyone" was never a gate.
   */
  is(!withAllowlist(undefined, () => isPlatformAdmin(user())), 'with SOCIAL_ADMIN_USERS unset, nobody is a platform admin');
  is(!withAllowlist('', () => isPlatformAdmin(user())), 'and an empty one is the same as unset');
  is(!withAllowlist('   \n  ', () => isPlatformAdmin(user())), 'and so is whitespace — not an allowlist of one blank entry');

  /* ─────────────────────── 2. WHAT MATCHES ────────────────────────────── */

  is(withAllowlist(ID, () => isPlatformAdmin(user())), 'a user id on the list matches');
  is(!withAllowlist(OTHER, () => isPlatformAdmin(user())), 'and a different id does not');
  is(withAllowlist(`${OTHER}, ${ID}`, () => isPlatformAdmin(user())), 'a comma-separated list matches any entry');
  is(withAllowlist(`${OTHER}\n${ID}`, () => isPlatformAdmin(user())), 'and so does one separated by newlines — a pasted list is still a list');

  is(withAllowlist('stas@example.com', () => isPlatformAdmin(user())), 'an email on the list matches');
  is(withAllowlist('STAS@EXAMPLE.COM', () => isPlatformAdmin(user())), 'case-insensitively, because an address is not case-sensitive');
  is(withAllowlist('stas@example.com', () => isPlatformAdmin(user({ email: 'STAS@Example.com' }))), 'on both sides of the comparison');
  is(!withAllowlist('someone@else.com', () => isPlatformAdmin(user())), 'and a different address does not');

  /*
   * AN ACCOUNT WITH NO EMAIL IS NOT A MATCH FOR AN EMAIL ENTRY.
   *
   * Supabase users can exist without one — a phone sign-up, or a provider
   * that did not return an address. If an absent email compared equal to an
   * absent entry, the first such account created would have been an
   * administrator by accident.
   */
  is(!withAllowlist('stas@example.com', () => isPlatformAdmin(user({ email: null }))), 'a user with no email never matches an email entry');
  is(!withAllowlist('stas@example.com', () => isPlatformAdmin(user({ email: '' }))), 'and neither does an empty one');

  /*
   * AND AN ENTRY WITHOUT '@' IS AN ID, NEVER AN EMAIL.
   *
   * The two forms share one variable, so the test that separates them is the
   * one that keeps a uuid from ever being compared against an address.
   */
  is(!withAllowlist(ID, () => isPlatformAdmin(user({ id: '', email: ID }))), 'a uuid entry is matched against the id, not against the email');
  is(!withAllowlist('stas@example.com', () => isPlatformAdmin(user({ id: 'stas@example.com', email: null }))), 'and an email entry is not matched against the id');

  /* ─────────────── 3. THE ROUTE ACTUALLY ASKS, AND ANSWERS EMPTY ───────── */

  const route = stripComments(readFileSync(new URL('../../src/app/api/social/admin/presence/route.ts', import.meta.url), 'utf8'));

  is(/\brequireAdmin\(request\)/.test(route), 'the route still establishes WHO is calling, server-side, from the token');
  is(/\bisPlatformAdmin\(user\)/.test(route), 'and then asks whether that person may see across businesses — requireAdmin alone is only "signed in"');
  /*
   * The order matters: the allowlist is checked against the user Supabase
   * resolved from the token, never against anything the browser said about
   * itself. "אסור לסמוך על ID שנשלח מה-Frontend בלבד."
   */
  is(route.indexOf('requireAdmin(request)') < route.indexOf('isPlatformAdmin(user)'), 'in that order — the identity is resolved before it is judged');

  /*
   * A CUSTOMER GETS DATA, NOT AN ERROR. callSocialApi() folds a non-2xx into
   * a Hebrew sentence and throws it, so a 403 here would surface on the
   * customer's own settings screen as a failure to display. `admin: false`
   * arrives as an ordinary payload and the screen draws nothing.
   */
  is(/admin:\s*false/.test(route), 'a signed-in non-admin is answered with admin: false');
  is(!/throw new HttpError\(403/.test(route), 'and not with a 403 the client would have to read out of an error string');

  /*
   * WHAT MAY NOT TRAVEL. login_shot holds a screenshot of whatever Facebook
   * was asking during a login challenge — it can show a person's own screen,
   * and a panel about presence has no business carrying it. The secrets table
   * is not referenced at all.
   */
  is(!/login_shot/.test(route), 'the payload never carries the login screenshot column');
  is(!/social_secrets/.test(route), 'and never reads the secrets table');
  is(!/select\(['"`]\*/.test(route), 'and never selects * from the workers table, which is how login_shot would arrive by accident');

  /*
   * ONE DEFINITION OF "מחובר". The dashboard chip means "spoke recently AND
   * did not say goodbye" (listWorkers), and a panel that used only the
   * timestamp would draw a cleanly shut-down machine as connected for a
   * further ninety seconds — the same fault the heartbeat fix removed, in a
   * second place.
   */
  is(/WORKER_OFFLINE_AFTER_SECONDS/.test(route), 'the online rule uses the product-wide cutoff');
  is(/status\s*!==\s*'offline'/.test(route), "and the machine's own last word, not the timestamp alone");

  /* ─────────────── 4. THE SCREEN DRAWS IT ONLY FOR HIM ────────────────── */

  const page = stripComments(readFileSync(new URL('../../src/app/social/settings/page.tsx', import.meta.url), 'utf8'));

  is(/presence\?\.admin === true/.test(page), "the screen's own notion of admin is the server's answer, not a local guess");
  is(/isAdmin \? \[\{ value: 'admin'/.test(page), 'the tab exists only when the server said so');
  is(/tab === 'admin' && isAdmin && presence/.test(page), 'and the panel itself re-checks, so a stale tab cannot draw an empty one');
  /*
   * The poll is conditional on BOTH, or every customer pays a request every
   * ten seconds for an answer they are not allowed to have.
   */
  is(/if \(!isAdmin \|\| tab !== 'admin'\) return;/.test(page), 'the live poll runs only while the panel is open, and only for an admin');
  is(/loadAdminPresence\(\)\.catch\(\(\) => null\)/.test(page), 'a customer’s failed ask is swallowed — they must not see an error about a panel they never had');

  console.log(`admin panel OK — ${checks} assertions, the gate failing closed and the payload carrying nothing it should not`);
}

main();
