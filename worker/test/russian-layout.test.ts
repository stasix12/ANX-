/*
 * ─── DOES THE RUSSIAN FIT? ─────────────────────────────────────────────────
 *
 * "תבדוק גם שהטקסט נכנס גם בכל המשבצות ומתאים לעיצוב."
 *
 * A dictionary with an answer for every sentence is not a translated app.
 * Russian runs about 46% longer than the Hebrew on the short strings — the
 * ones inside buttons, chips, tabs and stat tiles, where there is no room —
 * and some of them more than double. A caption that no longer fits does not
 * throw, does not fail a coverage guard and does not look wrong in the
 * dictionary file. It just comes out cut in half on a phone.
 *
 * SO THIS MEASURES, rather than reasons about it. Every fixture the layout
 * suites already drive is loaded twice at each width — once in Hebrew, once
 * in Russian — and the two are compared in a real browser:
 *
 *   · the page must not scroll sideways (the bug he reported four times)
 *   · no element may be wider than the box that holds it
 *   · no text may be clipped or ellipsised that was not clipped in Hebrew
 *   · no text may spill out of a fixed-height box
 *   · a tap target must still clear 40px
 *
 * HEBREW IS THE BASELINE, deliberately. A caption that is already ellipsised
 * in Hebrew is a decision somebody made; the question this answers is
 * whether RUSSIAN broke something, and the diff is the only honest way to
 * ask it. Every new breakage is reported with the element, the screen, the
 * width and the text, so it can be fixed rather than guessed at.
 */
import assert from 'node:assert/strict';

const NAME = 'russian layout';
let checks = 0;
const is = (c: unknown, what: string) => {
  checks += 1;
  assert.ok(c, what);
};
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};

/* Each fixture, and what it puts on screen. */
const SCREENS = [
  { m: 'auth', what: 'the sign-in screen' },
  { m: 'cycle', what: 'the live queue and the cycle control' },
  { m: 'frozen', what: 'the next-publication line' },
  { m: 'picker', what: 'the target picker' },
  { m: 'pull', what: 'the pull-to-refresh shell' },
  { m: 'scene', what: 'the dashboard hero and its scenes' },
  { m: 'schedule', what: 'the campaign schedule panel' },
  { m: 'swiper', what: 'the campaign card swiper' },
  { m: 'tile', what: 'the campaign tile' },
  { m: 'timepick', what: 'the time picker' },
  { m: 'toggle', what: 'the switches' },
] as const;

/*
 * And the screens this repo measures as static HTML. render-dash.tsx and its
 * siblings print the real components with the real class names — it is how
 * the dashboard's own height is measured, because the screen itself sits
 * behind a Supabase session and an app router. They have no React runtime
 * and do not need one: what puts this app into Russian is a DOM translator,
 * and a DOM is what they have.
 */
/*
 * render-crm is deliberately NOT here. The CRM is its own route and has no
 * language switch — src/app/social/layout.tsx is the only place LangBoundary
 * is mounted — so putting the translator over it would measure something the
 * app never does, and every finding would be an artefact of this harness.
 */
const SNAPSHOTS = [
  { r: 'render-dash', what: 'the dashboard' },
  { r: 'render-hero', what: 'the campaign hero card' },
  { r: 'render-stats', what: 'the figures strip' },
  { r: 'render-card', what: 'the campaign card' },
  { r: 'render-discovery', what: 'group discovery' },
  { r: 'render-discover-top', what: 'the discovery header' },
  { r: 'render-comment-timeline', what: 'the comment timeline' },
  { r: 'render-quick-comments', what: 'the quick-comment sheet' },
  { r: 'render-rounds', what: 'the publishing rounds' },
  /*
   * ─── AND THE TWENTY-ONE SCREENS NOTHING MEASURED UNTIL NOW ──────────────
   *
   * The nine above are the screens the dashboard is built from. They left
   * most of the product unmeasured: the composer, the sheets that publish,
   * the queue itself, the activity feed, the first-run cards, and the two
   * narrowest boxes in the app — the content card and the group tile. Each
   * of these fixtures prints its real component with its real classes, at
   * the data shape that makes its tightest box tightest, and its own header
   * records which props could not be reached on a server pass and why.
   */
  { r: 'render-post-editor', what: 'the post composer' },
  { r: 'render-media-uploader', what: 'the media uploader' },
  { r: 'render-post-preview', what: 'the Facebook preview' },
  { r: 'render-quick-publish-sheet', what: 'the publish-now sheet' },
  { r: 'render-queue-tuner-sheet', what: 'the queue tuner' },
  { r: 'render-schedule-picker', what: 'the schedule picker' },
  { r: 'render-pre-launch-review', what: 'the pre-launch review' },
  { r: 'render-start-from-library', what: 'starting from the library' },
  { r: 'render-activity-feed', what: 'the activity feed' },
  { r: 'render-activity-detail-sheet', what: 'one activity line, opened' },
  { r: 'render-timeline', what: 'the publishing order' },
  { r: 'render-campaign-comment-sheet', what: 'the cycle comment sheet' },
  { r: 'render-campaign-progress-bar', what: 'the campaign progress bar' },
  { r: 'render-campaign-reach', what: 'the reach card' },
  { r: 'render-queue-sections', what: 'the queue, section by section' },
  { r: 'render-live-board', what: 'the live board' },
  { r: 'render-pair-worker-card', what: 'pairing the PC' },
  { r: 'render-profile-upload-card', what: 'handing the profile to the cloud worker' },
  { r: 'render-setup-checklist', what: 'the first-run checklist' },
  { r: 'render-content-card', what: 'the content card' },
  { r: 'render-group-card', what: 'the group tile' },
] as const;

/* The widths the rest of this repo measures at — a small phone through a desk. */
const WIDTHS = [320, 360, 390, 430, 768, 1280];

/*
 * ─── THE SAME FAULT AT TWO SEVERITIES IS STILL THE SAME FAULT ─────────────
 *
 * "clipped", "crushed" and "spilled" are one problem — text that does not fit
 * its box — reported at different severities so a fix can be aimed properly.
 * Comparing kind-and-place against Hebrew therefore reported a Russian
 * regression where there was none: on the hero card with the longest status,
 * Hebrew gives the caption 0px (crushed) and Russian gives it 9px (clipped).
 * Russian is BETTER there, and the suite called it a break because the label
 * changed.
 *
 * So for that family the baseline is the PLACE alone: a box that already
 * fails to hold its text in Hebrew is not Russian's doing, however the
 * severity lands. "escaped" and "tiny-tap" are different faults and keep
 * their own keys — a control that shrank under a thumb is not the same thing
 * as a caption that is a few pixels too long.
 */
const FITTING = new Set(['clipped', 'crushed', 'spilled']);
const baselineKey = (n: { kind: string; p: string }) => (FITTING.has(n.kind) ? `fit|${n.p}` : `${n.kind}|${n.p}`);

type Finding = {
  screen: string;
  width: number;
  kind: string;
  tag: string;
  text: string;
  detail: string;
};

/*
 * One screen at a time, for whoever is fixing one. ANX_RU_LAYOUT_ONLY takes a
 * comma-separated list of fixture or snapshot names; empty means all of them,
 * which is what CI runs.
 */
const ONLY = (process.env.ANX_RU_LAYOUT_ONLY ?? '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const wanted = (name: string) => ONLY.length === 0 || ONLY.includes(name);

async function main(): Promise<void> {
  const { build } = await import('esbuild');
  const { mkdtempSync, readdirSync, statSync, writeFileSync, copyFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;
  const { chromium } = await import('playwright-core');

  /* The app's real stylesheet, as the other browser suites do it. Without it
     nothing is styled and a width measurement means nothing. */
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
    console.log(`${NAME} OK — ${checks} assertions (SKIPPED — run \`npm run build\` first)`);
    return;
  }

  const dir = mkdtempSync(path.join(tmpdir(), 'rulayout-'));
  copyFileSync(best.file, path.join(dir, 'app.css'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-lang-shim.tsx')],
    outfile: path.join(dir, 'm.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    keepNames: false,
    splitting: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    /* The same stubs auth-screen.test.ts uses: the sign-in page is a real
       Next.js page and asks for a router and for the auth module, neither of
       which exists in a bare browser. Everything else is the real code. */
    alias: {
      'next/navigation': path.resolve('worker/test/stubs/next-navigation.ts'),
      '@/lib/social/auth': path.resolve('worker/test/stubs/social-auth.ts'),
      '@': path.resolve('src'),
    },
    logLevel: 'silent',
  });
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<link rel="stylesheet" href="app.css"><body class="social-theme"><div id="root"></div><script src="m.js"></script></body></html>`,
  );

  /* The same translator, for the pages that arrive already drawn. */
  await build({
    entryPoints: [path.resolve('worker/test/mount-lang-static.ts')],
    outfile: path.join(dir, 'lang.js'),
    bundle: true,
    format: 'iife',
    keepNames: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });

  /*
   * Each snapshot, rendered once and then read twice. The script goes in
   * before </body> so it runs after the markup exists.
   */
  const { execFileSync } = await import('node:child_process');
  const snapshotFiles: { r: string; what: string; file: string }[] = [];
  for (const snap of SNAPSHOTS.filter((x) => wanted(x.r))) {
    /* ANX_SPLIT_TEXT: the text-node boundaries a client render produces, so
       the translator answers here what it answers in the app and the box is
       measured around the string the customer would actually see. See
       worker/test/render-html.ts. */
    const html = execFileSync('npx', ['tsx', `worker/test/${snap.r}.tsx`], {
      encoding: 'utf8',
      maxBuffer: 32 << 20,
      env: { ...process.env, ANX_SPLIT_TEXT: '1' },
    });
    const withLang = html.includes('</body>')
      ? html.replace('</body>', '<script src="lang.js"></script></body>')
      : `${html}<script src="lang.js"></script>`;
    const file = `${snap.r}.html`;
    writeFileSync(path.join(dir, file), withLang);
    snapshotFiles.push({ r: snap.r, what: snap.what, file });
  }

  /*
   * ─── WHAT COUNTS AS NOT FITTING ───────────────────────────────────────
   *
   * Measured in the page, because only the browser knows where the text
   * actually landed. Four separate failures, each a different way a longer
   * caption shows up to the person using it:
   *
   *   clipped    — the text is wider than its box AND the box hides it, so
   *                a word is cut off or replaced by an ellipsis
   *   spilled    — the text is taller than its box and the box hides it, so
   *                a line is simply missing
   *   escaped    — the element sticks out past the box that holds it, which
   *                is what pushes a phone into scrolling sideways
   *   tiny-tap   — a control shrank under 40px, so it is hard to hit
   *
   * A node is identified by a path through the tree rather than by text, so
   * the Hebrew and Russian runs can be compared element by element even
   * though every caption differs.
   */
  const PROBE = `(() => {
    const out = [];
    const path = (el) => {
      const parts = [];
      let n = el;
      while (n && n !== document.body && parts.length < 12) {
        const p = n.parentElement;
        const i = p ? [...p.children].indexOf(n) : 0;
        parts.unshift(n.tagName.toLowerCase() + ':' + i);
        n = p;
      }
      return parts.join('>');
    };
    const text = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
    const all = [...document.querySelectorAll('body *')];
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;

      const hidesX = cs.overflowX === 'hidden' || cs.overflowX === 'clip' || cs.textOverflow === 'ellipsis';
      const hidesY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      /* A scroller is allowed to be wider than its box — that is its job. */
      const scrollsX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
      const scrollsY = cs.overflowY === 'auto' || cs.overflowY === 'scroll';

      if (hidesX && !scrollsX && el.scrollWidth > el.clientWidth + 1) {
        /* Under 8px there is no caption left at all — the box was squeezed to
           nothing by a sibling, which is a layout fault rather than a word
           that is a few pixels too long. Named apart so each gets its own
           fix. */
        const kind = el.clientWidth < 8 ? 'crushed' : 'clipped';
        out.push({ p: path(el), kind, tag: el.tagName.toLowerCase(), text: text(el),
                   detail: el.scrollWidth + ' > ' + el.clientWidth });
      }
      if (hidesY && !scrollsY && el.scrollHeight > el.clientHeight + 1) {
        out.push({ p: path(el), kind: 'spilled', tag: el.tagName.toLowerCase(), text: text(el),
                   detail: el.scrollHeight + ' > ' + el.clientHeight });
      }
      /*
       * Past the edge of the viewport — but only when nothing above it
       * scrolls sideways. A city chip in a filter row is MEANT to sit past
       * the edge; that is what the row scrolling means. Counting those would
       * send a fix at the one thing already working.
       */
      let inScroller = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.overflowX === 'auto' || acs.overflowX === 'scroll') { inScroller = true; break; }
      }
      if (!inScroller && (r.right > window.innerWidth + 1 || r.left < -1)) {
        out.push({ p: path(el), kind: 'escaped', tag: el.tagName.toLowerCase(), text: text(el),
                   detail: 'left ' + Math.round(r.left) + ', right ' + Math.round(r.right) + ', viewport ' + window.innerWidth });
      }
      /* A control that shrank below a comfortable tap. */
      const tappable = el.matches('button, a[href], [role="button"], input:not([type="hidden"]), select');
      /* 39.5, not 40: a control laid out at 39.98px is a sub-pixel of
         rounding, not a tap target that shrank, and reporting it sends a fix
         at nothing. Anything genuinely short of a comfortable tap is still
         caught. */
      if (tappable && r.height > 0 && r.height < 39.5) {
        out.push({ p: path(el), kind: 'tiny-tap', tag: el.tagName.toLowerCase(), text: text(el),
                   detail: Math.round(r.height) + 'px tall' });
      }
    }
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      nodes: out,
    };
  })()`;

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium',
  });
  const newFindings: Finding[] = [];
  const sidewaysScroll: string[] = [];
  /* Overflow a fixture has in Hebrew too — printed, never hidden. */
  const shared: string[] = [];
  const crashed: string[] = [];
  let measured = 0;

  try {
    for (const screen of SCREENS.filter((x) => wanted(x.m))) {
      for (const width of WIDTHS) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        page.on('pageerror', (e) => crashed.push(`${screen.m} @${width}: ${String(e).slice(0, 120)}`));

        const read = async (lang: 'he' | 'ru') => {
          await page.goto(`file://${path.join(dir, 'index.html')}?m=${screen.m}&lang=${lang}`);
          await page.waitForFunction('window.__langReady === true', null, { timeout: 20000 });
          /* One more frame, so a layout that settles after the paint is settled. */
          await page.waitForTimeout(150);
          return (await page.evaluate(PROBE)) as {
            page: number;
            nodes: { p: string; kind: string; tag: string; text: string; detail: string }[];
          };
        };

        const he = await read('he');
        const ru = await read('ru');
        measured += 1;

        /*
         * Sideways scroll, measured as a difference. A fixture can carry a
         * harness of its own that is wider than a 320px phone, and that is
         * the fixture's doing in both languages; what this suite is for is
         * the scroll RUSSIAN adds. The pre-existing kind is still printed,
         * so it is not quietly folded into "everything fits".
         */
        if (ru.page > he.page + 1) {
          sidewaysScroll.push(
            `${screen.what} (${screen.m}) at ${width}px — Russian scrolls ${ru.page}px sideways where Hebrew scrolls ${he.page}px`,
          );
        } else if (ru.page > 1) {
          shared.push(`${screen.what} (${screen.m}) at ${width}px — ${ru.page}px in both languages`);
        }

        /* Element by element, by position in the tree. */
        const before = new Set(he.nodes.map(baselineKey));
        for (const n of ru.nodes) {
          if (before.has(baselineKey(n))) continue;
          newFindings.push({
            screen: `${screen.what} (${screen.m})`,
            width,
            kind: n.kind,
            tag: n.tag,
            text: n.text,
            detail: n.detail,
          });
        }
        await page.close();
      }
    }

    /* ─── and the static snapshots, the same way ───────────────────── */
    for (const snap of snapshotFiles) {
      for (const width of WIDTHS) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        page.on('pageerror', (e) => crashed.push(`${snap.r} @${width}: ${String(e).slice(0, 120)}`));

        const read = async (lang: 'he' | 'ru') => {
          await page.goto(`file://${path.join(dir, snap.file)}?lang=${lang}`);
          await page.waitForFunction('window.__langReady === true', null, { timeout: 20000 });
          await page.waitForTimeout(120);
          return (await page.evaluate(PROBE)) as {
            page: number;
            nodes: { p: string; kind: string; tag: string; text: string; detail: string }[];
          };
        };

        const he = await read('he');
        const ru = await read('ru');
        measured += 1;

        if (ru.page > he.page + 1) {
          sidewaysScroll.push(
            `${snap.what} (${snap.r}) at ${width}px — Russian scrolls ${ru.page}px sideways where Hebrew scrolls ${he.page}px`,
          );
        } else if (ru.page > 1) {
          shared.push(`${snap.what} (${snap.r}) at ${width}px — ${ru.page}px in both languages`);
        }

        const before = new Set(he.nodes.map(baselineKey));
        for (const n of ru.nodes) {
          if (before.has(baselineKey(n))) continue;
          newFindings.push({
            screen: `${snap.what} (${snap.r})`,
            width,
            kind: n.kind,
            tag: n.tag,
            text: n.text,
            detail: n.detail,
          });
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  const expected =
    (SCREENS.filter((x) => wanted(x.m)).length + SNAPSHOTS.filter((x) => wanted(x.r)).length) * WIDTHS.length;
  is(measured === expected, `every screen measured at every width — ${measured} of ${expected} measurements`);
  eq(crashed, [], 'no screen throws in either language');

  /* Grouped, so one caption that does not fit at five widths reads as one
     thing to fix rather than five. */
  const grouped = new Map<string, Finding[]>();
  for (const f of newFindings) {
    const key = `${f.kind}|${f.screen}|${f.text}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(f);
  }
  const report = [...grouped.values()].map((fs) => {
    const widths = fs.map((f) => f.width).join(', ');
    const f = fs[0];
    return `${f.kind}: ${f.screen} at ${widths}px — <${f.tag}> "${f.text}" (${f.detail})`;
  });

  /*
   * ─── FOUR PLACES WHERE CUTTING THE TEXT OFF IS THE RIGHT ANSWER ───────────
   *
   * Everything else on this list is a defect to fix with a shorter word or a
   * rule in globals.css. These four are not, and each is here with its own
   * reason rather than as a blanket exception — a finding that does not match
   * one of them, by kind AND screen AND text, is still a failure.
   *
   * A NAME AND A DOMAIN ARE NOT OURS TO REWORD. Three of the four are the
   * customer's own strings: a group called
   * "БеэрШеваОбъявленияКуплюПродамОтдамБесплатноБарахолкаЮгИзраил" — one
   * closed compound with nowhere to break, written that way on purpose by
   * the fixture — and a Hebrew board name of sixty characters. Both are
   * truncated in Hebrew as well; Russian reaches the cut a little earlier
   * because the status words beside them are wider, and the alternative is a
   * row that grows with every long name somebody types.
   *
   * THE FOURTH IS A FACEBOOK CARD, and Facebook truncates the domain in it
   * too. Wrapping "hapitaron-hamavrik.co.il" across two lines would make the
   * preview LESS like the post it is previewing, which is the one thing that
   * screen exists for.
   */
  const ACCEPTED: { kind: string; screen: string; text: string; why: string }[] = [
    {
      kind: 'clipped',
      screen: 'the post composer (render-post-editor)',
      text: 'hapitaron-hamavrik.co.il',
      why: 'the domain in a Facebook link card — Facebook truncates it as well',
    },
    {
      kind: 'clipped',
      screen: 'the Facebook preview (render-post-preview)',
      text: 'hapitaron-hamavrik.co.il',
      why: 'the same card, shown on its own',
    },
    {
      kind: 'clipped',
      screen: 'the queue, section by section (render-queue-sections)',
      text: 'БеэрШеваОбъявленияКуплюПродамОтдамБесплатноБарахолкаЮгИзраил',
      why: 'the customer’s group name, one unbreakable compound; truncated in Hebrew too',
    },
    {
      kind: 'clipped',
      screen: 'the queue, section by section (render-queue-sections)',
      text: 'קבוצת תושבי שכונת נווה זאב ורמות באר שבע — קניה, מכירה, המלצ',
      why: 'the customer’s group name, sixty characters; truncated in Hebrew too',
    },
  ];
  const accepted: string[] = [];
  const left = report.filter((line) => {
    const hit = ACCEPTED.find((a) => line.startsWith(`${a.kind}: ${a.screen} at`) && line.includes(`"${a.text}"`));
    if (!hit) return true;
    accepted.push(`${hit.text.slice(0, 28)} — ${hit.why}`);
    return false;
  });
  if (accepted.length) console.log(`  (cut off on purpose: ${accepted.join(' · ')})`);
  /* An accepted line that stops happening is also news: the list may not
     carry an entry that no longer describes the screen. */
  const stale = ACCEPTED.filter((a) => !report.some((line) => line.includes(`"${a.text}"`) && line.startsWith(`${a.kind}: ${a.screen} at`))).map(
    (a) => `${a.kind} / ${a.screen} / ${a.text.slice(0, 28)}`,
  );
  eq(stale, [], 'every accepted cut is still a cut this screen really makes');

  if (shared.length) {
    console.log(`  (pre-existing in both languages, not Russian's doing: ${[...new Set(shared)].join(' · ')})`);
  }
  eq(sidewaysScroll, [], 'Russian adds no sideways scroll to any screen');
  eq(left, [], 'Russian breaks nothing that Hebrew does not already break');

  console.log(`${NAME} OK — ${checks} assertions, ${measured} screen/width pairs measured in both languages`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
