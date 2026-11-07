/*
 * THE HAMBURGER IS GONE, AND NOTHING WENT WITH IT.
 *
 * "את התפריט המבורגר למטה בצד ימין למחוק, ההגדרות להשאיר למעלה כמו שזה עכשיו.
 *  את היציאה מהחשבון להעביר איפה שלוחצים על תמונת פרופיל משתמש" — 07.11.2026.
 *
 * The "עוד" tab was the fifth of five, and the sheet behind it was the only
 * way a PHONE reached eight things. Deleting the tab without rehoming them
 * would have been the same defect this product keeps removing: a screen that
 * exists, that the system can send you to, and that you can then never find
 * again.
 *
 * So this file pins the deletion AND the eight destinations. Six of them were
 * already reachable from the screen they belong to — that is why they are not
 * in the panel under the face, and each of those links is pinned HERE rather
 * than trusted, because the day one of them is removed is the day the screen
 * goes dark with nothing failing.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.equal(a, b, msg); };

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const shell = read('src/components/social/SocialShell.tsx');

// ───────────────── 1. The tab and its sheet are gone ───────────────────────
is(!shell.includes('<MenuIcon'), 'the hamburger icon is not rendered anywhere in the shell');
is(!/moreOpen/.test(shell), 'and the state that opened it is gone, so no stale branch can hold a half-deleted menu');
is(!/moreActive/.test(shell.replace(/NO moreActive ANY MORE[\s\S]*?\*\//, '')), 'as is the active-state helper that existed only for that tab');
is(!/<Sheet /.test(shell), 'the overflow sheet itself is gone');
/* The bar is four tabs, and it is the SAME four the list has always named —
   a bar that quietly lost a real tab would also pass the checks above. */
eq(
  (shell.match(/const MOBILE_TABS = \[[^\]]+\]/) ?? [''])[0],
  "const MOBILE_TABS = ['/social', '/social/campaigns', '/social/groups', '/social/library']",
  'the four tabs that remain are exactly the four that were always tabs',
);
const bar = shell.slice(shell.indexOf('aria-label="ניווט ראשי"'), shell.indexOf('</nav>', shell.indexOf('aria-label="ניווט ראשי"')));
is(bar.includes('MOBILE_TABS.includes(n.href)'), 'and the bar still renders them from that one list');
is(!bar.includes('<button'), 'with no button left in it — every tab in the bar is a link to a screen');

// ───────────────── 2. "ההגדרות להשאיר למעלה כמו שזה עכשיו" ─────────────────
/*
 * Settings was in the sheet AND in the header. He asked for the header one to
 * stay exactly as it is, which makes it the only way in on a phone — so it is
 * pinned harder than it was when it had a twin.
 */
is(/href="\/social\/settings"/.test(shell), 'the header still links to settings');
is(/aria-label="הגדרות"/.test(shell), 'with the label that makes the gear reachable by name');
is(/settingsActive={isActive\('\/social\/settings', false\)}/.test(shell), 'and it still lights up on its own screen');

// ───────────────── 3. The way out moved under the face ─────────────────────
/*
 * The avatar's panel, not the bar. Pinned on the three things that make it a
 * real exit rather than a decorative one: it asks first, it ends the session,
 * and it lands on THIS product's login.
 */
const panel = shell.slice(shell.indexOf('menu={'), shell.indexOf('{/*\n          THE CONNECTION, AS A PANEL'));
is(panel.length > 500, 'the account panel under the face was located');
/*
 * BOUNDED TO THE BUTTON, not to the panel. Two earlier versions of these two
 * pins were green on a broken screen and it was measured, not argued: a pin
 * on `panel.includes('יציאה מהחשבון')` survived deleting the button,
 * because the same words appear inside the confirmation's own body text, and
 * a pin on `confirm.ask({` survived removing this one because there is a
 * second confirm in the file. The label a person reads and the guard a
 * mis-tap meets both live inside ONE element, so that element is the slice.
 */
const exit = (() => {
  const from = panel.indexOf('disabled={leaving}');
  is(from > 0, 'the way out is in the panel under the profile picture, where he asked for it');
  const to = panel.indexOf('</button>', from);
  is(to > from, 'and it is a real button that closes');
  return panel.slice(from, to);
})();
is(exit.includes("{leaving ? 'יוצא…' : 'יציאה מהחשבון'}"),
  'it is labelled in his own words, and says so while it is working');
is(/const ok = await confirm\.ask\(\{[\s\S]{0,200}לצאת מהחשבון\?/.test(exit),
  'it asks before it goes — a mis-tap under a thumb must not end the session');
is(/if \(!ok\) return;/.test(exit), 'and a "no" really stops it, rather than only being asked');
is(/await signOut\(\);/.test(exit), 'it really signs out rather than only navigating');
is(/window\.location\.href = '\/social\/login'/.test(exit),
  "a full load to THIS product's login — not router.replace over a cache of the account being left, and not the CRM's door");

// ───────────────── 4. The one screen that had nowhere else to go ───────────
/*
 * דפי פייסבוק. Every other route the sheet held is reachable from the screen
 * it belongs to; this one was reachable from the sheet and from nothing else,
 * which is why it is in the panel rather than merely deleted with it.
 */
is(/href="\/social\/targets"/.test(panel), 'דפי פייסבוק has a way in on a phone, because it had none anywhere else');
/* And the build stamp, which is how a cached copy is told from a deployed
   one. It was at the foot of the sheet; losing it loses that answer. */
is(panel.includes('NEXT_PUBLIC_BUILD_STAMP'), 'the build stamp survived the sheet it was printed in');

// ───────────────── 5. THE SIX THAT WERE ALREADY REACHABLE ──────────────────
/*
 * This is the load-bearing section. The deletion was only safe because each
 * of these has a real entry point on the screen it belongs to — so each of
 * those is pinned, in its own file. If one is removed, this fails here rather
 * than the screen silently becoming unreachable.
 */
for (const [route, file, what] of [
  ['/social/discover', 'src/app/social/groups/page.tsx', 'the groups screen carries the button people actually use'],
  ['/social/history', 'src/components/social/LiveBoard.tsx', 'the dashboard board links to the history'],
  ['/social/activity', 'src/components/social/NotificationBell.tsx', 'the bell opens the activity log'],
  ['/social/posts/new', 'src/app/social/library/page.tsx', 'the library is where a new post starts'],
] as const) {
  is(read(file).includes(`href="${route}"`), `${route}: ${what}`);
}
is(read('src/app/social/page.tsx').includes('href="/social/activity"'), 'and the dashboard has its own activity card');
is(read('src/components/social/LiveFlow.tsx').includes('href="/social/history"'), 'as does the live flow');

// ───────────────── 6. The desktop toolbar is untouched ─────────────────────
/*
 * It renders the WHOLE nav array and never used the sheet, so a phone-only
 * change must not have thinned it. Ten entries, including the two that are
 * now phone-reachable only from the panel.
 */
eq((shell.match(/\{ href: '\/social/g) ?? []).length, 9, 'the nav array still holds all nine routes — the desktop toolbar renders every one of them');
for (const route of ['/social/discover', '/social/history', '/social/activity', '/social/targets', '/social/settings']) {
  is(new RegExp(`\\{ href: '${route}'`).test(shell), `${route} is still in the array, so a desktop still has a tab for it`);
}
is(/nav\.map\(\(\{ href, label, icon: Icon, exact \}\)/.test(shell), 'and still renders it whole rather than a filtered copy');

console.log(`nav / more-menu OK — ${checks} checks`);
