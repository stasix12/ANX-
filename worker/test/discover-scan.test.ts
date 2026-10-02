import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { searchGroups } from '../facebook/discover';

/**
 * THE SCAN ITSELF, DRIVEN AGAINST A PAGE THAT LAZY-RENDERS.
 *
 * "עדיין יש קבוצות שלא מראה את המספר חברים, וגם לא תמונות. נמאס לי מבאגים
 *  חוזרים."
 *
 * Three rounds of fixes went into parseMembers — אלפי, the newline in the digit
 * run, the bidi marks — and every one of them was real, and the owner's screen
 * still showed groups with no count and no picture. The reason none of them
 * finished the job is that the parser was never the whole problem: it can only
 * read text the SCAN brought back, and the scan was not bringing it back.
 *
 * Every unit test in this suite hands parseMembers a string. Nothing until now
 * drove `searchGroups` — the loop, the scrolling, the stop condition, the
 * picture pass — against a page that behaves like Facebook's. That is the test
 * that would have prevented this whole episode, and it is this one.
 *
 * WHAT THE FIXTURE REPRODUCES. On the real results page a card's LINK and NAME
 * are in the DOM immediately; its "25 אלפי חברים · ציבורית" line and its real
 * avatar are filled in only when the card comes near the viewport. So after one
 * screenful the reader knows about every group and the facts of almost none of
 * them — and the loop's stop condition counts GROUPS FOUND, not facts learned.
 *
 * Served from facebook.com through a route, because searchGroups builds its own
 * address and refuses to be pointed anywhere else — which is right.
 *
 *   npx tsx worker/test/discover-scan.test.ts
 */

/* What the fixture says each group really is. The test asserts the scan
   recovers exactly this, which is the only thing the owner cares about. */
const EXPECTED: Record<string, { name: string; members: number }> = {
  g1: { name: 'באר שבע ביחד', members: 25_000 },
  g2: { name: 'דירות להשכרה בבאר שבע', members: 12_000 },
  g3: { name: 'באר שבע נדל"ן', members: 2_000 },
  g4: { name: 'דרושים בבאר שבע', members: 9_000 },
  g5: { name: 'עדכונים באר שבע והסביבה', members: 10_000 },
  /* The group that advertises its phone number in its name — the count must be
     6,000 and not the phone number, and not nothing. */
  g6: { name: 'דירות למכירה בבאר שבע 0546329669', members: 6_000 },
  /* The owner's real bilingual group: a Hebrew name with a Russian counts line
     grouped by an ordinary space. */
  g7: { name: 'באר שבע לכולם ! Беэр-Шева Для Всех', members: 1_000 },
  g8: { name: 'באר שבע העיר שלי', members: 41_000 },
  /* Its avatar was already drawn, so a second pass that chases only missing
     PICTURES never stops on it — and its count stays unread for good. */
  g9: { name: 'השכרת דירות בבאר שבע והסביבה', members: 12_000 },
};

async function main(): Promise<void> {
  const html = readFileSync(path.resolve(__dirname, 'mock-group-search.html'), 'utf8');
  /* A real PNG, one violet pixel, so the avatar passes the reader's "bigger
     than 24px and an http address" test without reaching the network. */
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route('https://**', (route) => {
      const url = route.request().url();
      if (url.includes('/search/groups/')) {
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      }
      if (/\.png($|\?)/i.test(url)) {
        return route.fulfill({ status: 200, contentType: 'image/png', body: png });
      }
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html></html>' });
    });

    const outcome = await searchGroups(page, 'באר שבע');
    const byId = new Map(outcome.groups.map((g) => [g.externalId, g]));

    /* 1 — every group is found at all. This half has always worked: the links
           are in the DOM from the first paint. */
    assert.equal(
      byId.size,
      Object.keys(EXPECTED).length,
      `expected ${Object.keys(EXPECTED).length} groups, got ${byId.size}: ${[...byId.keys()].join(', ')}`,
    );

    /* 2 — AND EVERY ONE OF THEM CAME BACK WITH ITS MEMBER COUNT.
           This is the owner's complaint, and it is the half that was failing:
           a card whose counts line had not rendered when the reader walked past
           it keeps its half-read sighting for good. */
    const missing: string[] = [];
    const wrong: string[] = [];
    for (const [id, want] of Object.entries(EXPECTED)) {
      const got = byId.get(id);
      assert.ok(got, `group ${id} (${want.name}) was not found at all`);
      assert.equal(got.name, want.name, `group ${id} came back with the wrong name`);
      if (got.members === null) missing.push(`${id} (${want.name})`);
      else if (got.members !== want.members) wrong.push(`${id}: ${got.members} instead of ${want.members}`);
    }
    assert.deepEqual(wrong, [], `a member count was misread:\n  ${wrong.join('\n  ')}`);
    assert.deepEqual(
      missing,
      [],
      `THE OWNER'S BUG: ${missing.length} of ${Object.keys(EXPECTED).length} groups came back with no member count at all:\n  ${missing.join('\n  ')}`,
    );

    /* 3 — AND WITH A PICTURE. Same cause, same cure: the avatar is a
           placeholder until the card is near the viewport. */
    const pictureless = [...byId.values()].filter((g) => !/^https?:\/\//i.test(g.image)).map((g) => g.name);
    assert.deepEqual(
      pictureless,
      [],
      `${pictureless.length} groups came back with no picture:\n  ${pictureless.join('\n  ')}`,
    );

    /* 4 — and the privacy word, which rides on the same line as the count and
           is therefore lost and found with it. */
    const unknownPrivacy = [...byId.values()].filter((g) => g.privacy === 'unknown').map((g) => g.name);
    assert.deepEqual(unknownPrivacy, [], `privacy unread for:\n  ${unknownPrivacy.join('\n  ')}`);

    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`discovery scan OK — ${Object.keys(EXPECTED).length} groups read off a lazy-rendering results page, with counts, pictures and privacy`);
}

void main();
