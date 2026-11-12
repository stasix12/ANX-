import assert from 'node:assert/strict';
import { chromium, type Route } from 'playwright-core';
import { searchGroups } from '../facebook/discover';
import { readMyGroups } from '../facebook/mygroups';

/**
 * "המנגנון חיפוש קבוצות עובד לאט ולא מוצא את כל הקבוצות שיש" — 12.11.
 *
 * THREE THINGS ONLY A BROWSER CAN ANSWER. Every one of the 355 assertions in
 * discovery.test.ts reads the SOURCE, which is why none of them caught any of
 * these: they live in code that runs inside a page.
 *
 *   1. THE PHRASE FILTER. searchGroups kept only the results whose name
 *      contained the phrase. Measured on his own account that threw away 37
 *      of 56 — "נמצאו 19 קבוצות. (37 תוצאות שלא הכילו את המילה סוננו)" — and
 *      what it threw away was ב״ש for באר שבע, ק. גת for קריית גת, and every
 *      group whose name is written in English. His decision: "להראות הכל,
 *      לסמן מה מדויק".
 *
 *   2. A SIBLING HEADING. readMyGroups decides whether a card is his or a
 *      suggestion by the heading above it, and it tested EVERY heading at the
 *      level, joined into one string. Facebook's own layout puts "הקבוצות שלך"
 *      and "קבוצות מומלצות" under one ancestor, so the joined string matched
 *      and every card under it was dropped — his own groups included. Worse
 *      than a missing row: reconcileJoined reads this list as Facebook's
 *      enumeration of his memberships.
 *
 *   3. THE CLOCK. "עובד לאט" was the other half of the complaint, and showing
 *      everything instead of a third of it is MORE work: the picture pass went
 *      from walking 19 cards to walking 56. Completeness bought with a
 *      two-minute search is not a fix, so the time is measured — both for a
 *      first search and for the re-run that is the common case.
 *
 * Each part is reported even when another fails. The first version of this
 * file wrapped all of them in one try, and reverting the filter hid the
 * heading bug completely — a suite that reports one bug per run turns a
 * morning into a week.
 *
 *   npx tsx worker/test/discovery-complete.test.ts
 */

/* ── the search results page ──────────────────────────────────────────────
   Four cards: two carry the phrase, two are the kind Facebook offers around it
   and the old filter deleted. Facts present from the first paint here, because
   this fixture is about WHICH cards survive — mock-group-search.html and
   discover-scan.test.ts cover lazy rendering. */
const SEARCH = `<!doctype html><html lang="he" dir="rtl"><body>
  <div id="list">
    <div><a href="/groups/s1/"><img src="https://x/p.png" width="60" height="60">באר שבע ביחד</a><span>25 אלפי חברים · קבוצה ציבורית</span></div>
    <div><a href="/groups/s2/"><img src="https://x/p.png" width="60" height="60">ב״ש - לוח מודעות</a><span>8 אלפי חברים · קבוצה ציבורית</span></div>
    <div><a href="/groups/s3/"><img src="https://x/p.png" width="60" height="60">דרושים בבאר שבע</a><span>3 אלפי חברים · קבוצה פרטית</span></div>
    <div><a href="/groups/s4/"><img src="https://x/p.png" width="60" height="60">Beer Sheva Business Board</a><span>1 אלפי חברים · קבוצה ציבורית</span></div>
  </div>
</body></html>`;

/* ── his own groups page, laid out the way that broke it ──────────────────
   ONE ancestor, #both, holding his section and the suggestions section. The
   old walk joined "הקבוצות שלך" and "קבוצות מומלצות" and matched. */
const MINE = `<!doctype html><html lang="he" dir="rtl"><body>
  <div id="both">
    <h2>הקבוצות שלך</h2>
    <div><a href="/groups/m1/"><img src="https://x/p.png" width="60" height="60">נדל"ן בדימונה</a><span>4 אלפי חברים · קבוצה ציבורית</span></div>
    <div><a href="/groups/m2/"><img src="https://x/p.png" width="60" height="60">עסקים בערד</a><span>900 חברים · קבוצה ציבורית</span></div>
    <h2>קבוצות מומלצות בשבילך</h2>
    <div><a href="/groups/m9/"><img src="https://x/p.png" width="60" height="60">שוק יד שנייה אשקלון</a><span>7 אלפי חברים · קבוצה ציבורית</span></div>
  </div>
</body></html>`;

/* ── and a page the size his really is, to time it ────────────────────────
   Fifty-six results, twenty carrying the phrase: the shape measured on his own
   account, where 56 results became "נמצאו 19 קבוצות". It lazy-renders exactly
   like mock-group-search.html — link and name from the first paint, counts line
   and real picture two seconds after the card comes near the viewport — and
   the 900px spacers make it a deliberately pessimistic page: one card per
   screenful, where the real one holds about eight. */
const BIG = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><style>
  .card{background:#fff;padding:12px;margin-bottom:12px;display:flex;gap:12px;min-height:92px}
  .card img{width:60px;height:60px}
  .spacer{height:900px}
</style></head><body><main id="results"></main><script>
const PIC = 'https://scontent.example.com/group-avatar.png';
const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const GROUPS = [];
for (let i = 1; i <= 20; i += 1) GROUPS.push({ id: 'e' + i, name: 'באר שבע — קבוצה ' + i, sub: (i + 1) + ' אלפי חברים · ציבורית' });
for (let i = 1; i <= 36; i += 1) GROUPS.push({ id: 'n' + i, name: 'ב״ש לוח ' + i, sub: (i + 1) + ' אלפי חברים · ציבורית' });
const results = document.getElementById('results');
const cards = [];
for (const g of GROUPS) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    '<a href="/groups/' + g.id + '/" aria-label="' + g.name + '"><img src="' + PLACEHOLDER + '" alt=""></a>' +
    '<div><a class="title" href="/groups/' + g.id + '/">' + g.name + '</a><div class="sub"></div>' +
    '<div role="button" aria-label="הצטרפות לקבוצה">הצטרפות לקבוצה</div></div>';
  results.appendChild(card);
  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  results.appendChild(spacer);
  cards.push({ g: g, card: card, filled: false });
}
function reveal() {
  for (const c of cards) {
    if (c.filled) continue;
    const r = c.card.getBoundingClientRect();
    if (r.top > window.innerHeight * 2 || r.bottom < -window.innerHeight) continue;
    c.filled = true;
    setTimeout(function () {
      c.card.querySelector('.sub').textContent = c.g.sub;
      c.card.querySelector('img').setAttribute('src', PIC);
    }, 2000);
  }
}
reveal();
window.addEventListener('scroll', reveal, { passive: true });
setInterval(reveal, 200);
</script></body></html>`;

/* A real PNG, one violet pixel, so an avatar passes the reader's "bigger than
   24px and an http address" test without reaching the network. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let failures = 0;

async function check(what: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (err) {
    failures += 1;
    console.error(`FAIL — ${what}\n  ${err instanceof Error ? err.message : String(err)}`);
  }
}

function routeTo(body: string) {
  return (route: Route) => {
    const url = route.request().url();
    if (url.includes('/search/groups/')) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
    if (/\.png($|\?)/i.test(url)) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html></html>' });
  };
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('https://**', (route) => {
      const url = route.request().url();
      if (url.includes('/search/groups/')) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: SEARCH });
      if (url.includes('/groups/joins')) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MINE });
      if (/\.png($|\?)/i.test(url)) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html></html>' });
    });

    /* ─── 1. NOTHING IS DROPPED FOR NOT CARRYING THE PHRASE ─────────────── */
    await check('the search drops results that do not carry the phrase', async () => {
      const found = await searchGroups(page, 'באר שבע');
      const ids = found.groups.map((g) => g.externalId);

      assert.deepEqual(
        [...ids].sort(),
        ['s1', 's2', 's3', 's4'],
        `THE OWNER'S BUG: the search returned ${ids.length} of 4 — ${ids.join(', ')}. ` +
          'ב״ש and the English name are the ones the filter used to delete.',
      );

      /* The two that really carry it are MARKED — by the same nameMatches the
         filter used, as a label instead of a gate. */
      const exact = found.groups.filter((g) => g.exact).map((g) => g.externalId);
      assert.deepEqual([...exact].sort(), ['s1', 's3'], `wrong groups marked exact: ${exact.join(', ')}`);

      /* AND THEY COME FIRST, which is what makes showing everything readable:
         56 rows with the 19 real ones scattered through is not an answer. */
      assert.deepEqual(ids.slice(0, 2).sort(), ['s1', 's3'], `the exact matches are not first: ${ids.join(', ')}`);

      /* And the number he is told counts the rows that came back, not the ones
         that did not — the old sentence named 37 groups as missing. */
      assert.equal(found.offTopic, 2, `offTopic said ${found.offTopic}, and 2 of the 4 rows returned are near matches`);

      /* The near ones are whole rows, not husks: a row with no count and no
         picture is a row he cannot judge. */
      for (const id of ['s2', 's4']) {
        const g = found.groups.find((x) => x.externalId === id);
        assert.ok(g, `${id} missing`);
        assert.ok(g.members !== null, `${id} (${g.name}) came back with no member count`);
        assert.ok(/^https?:\/\//i.test(g.image), `${id} (${g.name}) came back with no picture`);
      }
    });

    /* ─── 2. A SIBLING HEADING DOES NOT DELETE HIS OWN SECTION ──────────── */
    await check('a sibling heading deletes his own groups', async () => {
      const mine = await readMyGroups(page);
      const ids = mine.groups.map((g) => g.externalId);

      assert.ok(
        ids.includes('m1') && ids.includes('m2'),
        `THE OWNER'S BUG: his own groups were dropped as suggestions because "קבוצות מומלצות" ` +
          `sits under the same ancestor as "הקבוצות שלך". Came back: ${ids.join(', ') || '(nothing)'}`,
      );

      /* And the suggestion is still refused. This fix must not buy
         completeness by reporting a group he is not in — that is a row that
         fails every publication with "you are not a member". */
      assert.ok(!ids.includes('m9'), `a suggested group was reported as his: ${ids.join(', ')}`);
    });

    /* ─── 3. AND IT STILL COMES BACK IN A TIME HE WILL WAIT ──────────────── */
    await check('a 56-result page takes too long, or loses the exact matches', async () => {
      const big = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await big.route('https://**', routeTo(BIG));
      const started = Date.now();
      const out = await searchGroups(big, 'באר שבע');
      const seconds = (Date.now() - started) / 1000;
      await big.close();

      assert.equal(out.groups.length, 56, `56 results on the page, ${out.groups.length} came back`);
      assert.equal(out.offTopic, 36, `36 of them are near matches, offTopic said ${out.offTopic}`);

      /*
       * THE TWENTY HE ASKED FOR COME BACK WHOLE.
       *
       * The picture pass spends its budget in the order of `groups`, which is
       * now exact first — so when a page is too big to finish, what gets
       * finished is the part he typed the phrase for. That property is the
       * only reason the ceiling below can be as low as it is.
       */
      const thin = out.groups
        .filter((g) => g.exact)
        .filter((g) => g.members === null || !/^https?:\/\//i.test(g.image))
        .map((g) => g.name);
      assert.deepEqual(thin, [], `${thin.length} of the 20 exact matches came back thin:\n  ${thin.join('\n  ')}`);

      /* THE CLOCK. Asserted rather than hoped for: the ceiling is well above
         what this fixture measures, so an ordinary machine does not fail on
         noise, and far below the two minutes the picture pass is allowed — a
         search that takes two minutes is one he stops using. */
      assert.ok(seconds < 75, `the search took ${seconds.toFixed(1)}s on a 56-result page`);
      console.log(`  56 results, 20 exact, first run in ${seconds.toFixed(1)}s`);

      /*
       * ─── AND RUNNING IT AGAIN COSTS MUCH LESS ───────────────────────────
       *
       * Which is the common case: the ⭐ button exists so he re-runs a saved
       * phrase, and a watched search is re-offered every time he opens the
       * screen. The 450ms-per-card stop is only worth paying for a card the
       * database cannot already answer, so the second run is told what it
       * already has.
       *
       * This is the assertion that would have caught showing-everything
       * making the search slower, which is half of what he reported.
       */
      const again = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await again.route('https://**', routeTo(BIG));
      const ids = out.groups.map((g) => g.externalId);
      const reRunStarted = Date.now();
      const reRun = await searchGroups(again, 'באר שבע', { havePictures: ids, haveFacts: ids });
      const reRunSeconds = (Date.now() - reRunStarted) / 1000;
      await again.close();

      assert.equal(reRun.groups.length, 56, `the re-run lost rows: ${reRun.groups.length} of 56`);
      /*
       * AN ABSOLUTE SAVING, NOT A RATIO. What the two runs share is the
       * collect loop, whose cost is a fixed waitForTimeout per pass and
       * therefore the same on any machine; what they differ by is the picture
       * pass, which is real work and is not. So the assertion is on the
       * DIFFERENCE — the seconds that telling the search what it already has
       * actually saves, which is the quantity this change is about.
       */
      assert.ok(
        seconds - reRunSeconds > 8,
        `telling the search that all 56 rows are already stored saved only ${(seconds - reRunSeconds).toFixed(1)}s ` +
          `(${seconds.toFixed(1)}s → ${reRunSeconds.toFixed(1)}s) — it is still stopping on cards it has nothing to learn from`,
      );
      console.log(`  the same search again, all 56 already stored, in ${reRunSeconds.toFixed(1)}s`);
    });
  } catch (err) {
    failures += 1;
    console.error(err instanceof Error ? err.message : err);
  } finally {
    await browser.close();
  }
  if (failures) process.exit(1);
  console.log('discovery-complete OK — nothing dropped by the phrase, nothing dropped by a sibling heading, and timed on a 56-result page');
}

void main();
