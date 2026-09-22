/**
 * Browser QA for the agency site. Run against a production server:
 *   npx next build && PORT=3100 npx next start &  →  BASE=http://localhost:3100 node scripts/qa.mjs
 *
 * Checks, per viewport: no horizontal overflow, exactly one h1, every in-page
 * anchor resolves, the mobile menu opens/closes with Escape, the accordion
 * toggles aria-expanded, form validation blocks an empty submit, the sticky
 * bar hides while the form is in view, and CLS stays tiny. Writes screenshots
 * to .qa/.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  const globalRoot = execSync('npm root -g').toString().trim();
  ({ chromium } = require(`${globalRoot}/playwright`));
}

const BASE = process.env.BASE ?? 'http://localhost:3100';
const OUT = '.qa';
mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: 'iphone', width: 390, height: 844, mobile: true },
  { name: 'android', width: 360, height: 800, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: true },
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'wide', width: 1536, height: 900, mobile: false },
];

const failures = [];
const note = (ok, msg) => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });

for (const vp of viewports) {
  console.log(`\n▶ ${vp.name} ${vp.width}×${vp.height}`);
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    deviceScaleFactor: 2,
    locale: 'he-IL',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  const dir = await page.getAttribute('html', 'dir');
  note(dir === 'rtl', `html[dir=rtl] (${dir})`);
  note((await page.locator('h1').count()) === 1, 'exactly one h1');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  note(overflow <= 0, `no horizontal overflow (Δ=${overflow}px)`);

  const anchors = await page.$$eval('a[href^="#"], a[href^="/#"]', (as) =>
    as.map((a) => a.getAttribute('href').replace(/^\//, '')),
  );
  const missing = [];
  for (const href of new Set(anchors)) {
    if (href === '#') continue;
    const exists = await page.evaluate((h) => Boolean(document.getElementById(h.slice(1))), href);
    if (!exists) missing.push(href);
  }
  note(
    missing.length === 0,
    `all ${new Set(anchors).size} in-page anchors resolve ${missing.length ? missing.join(',') : ''}`,
  );

  const unconfigured = await page.locator('[data-whatsapp-unconfigured]').count();
  console.log(`  ℹ WhatsApp buttons falling back to the form: ${unconfigured}`);

  // Sections present
  for (const id of [
    'hero',
    'problem',
    'services',
    'process',
    'before-after',
    'why-us',
    'roi',
    'pricing',
    'faq',
    'final-cta',
    'contact',
  ]) {
    const visible = await page.locator(`#${id}`).isVisible();
    if (!visible) note(false, `section #${id} visible`);
  }

  // CLS
  const cls = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let total = 0;
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value;
        });
        po.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => resolve(total), 800);
      }),
  );
  note(cls < 0.05, `CLS ${cls.toFixed(4)} < 0.05`);

  // Tap targets ≥ 44px for buttons/links in sticky bar + header (mobile)
  if (vp.mobile) {
    const small = await page.$$eval('nav[aria-label="פעולות מהירות"] a, header button', (els) =>
      els
        .filter((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().height < 44)
        .map((e) => e.textContent.trim() || e.getAttribute('aria-label')),
    );
    note(small.length === 0, `sticky/header tap targets ≥44px ${small.join(',')}`);

    // Mobile menu
    const toggle = page.locator('header button[aria-controls="mobile-menu"]');
    await toggle.click();
    await page.waitForTimeout(250);
    note(await page.locator('#mobile-menu').evaluate((d) => d.open), 'mobile menu opens');
    note((await toggle.getAttribute('aria-expanded')) === 'true', 'toggle aria-expanded=true');
    await page.screenshot({ path: `${OUT}/${vp.name}-menu.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    note(!(await page.locator('#mobile-menu').evaluate((d) => d.open)), 'Escape closes mobile menu');

    // Sticky bar hides when the form is in view
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    const hiddenAttr = await page.locator('nav[aria-label="פעולות מהירות"]').getAttribute('aria-hidden');
    note(hiddenAttr === 'true', 'sticky bar hidden while form in view');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(400);
    const shown = await page.locator('nav[aria-label="פעולות מהירות"]').getAttribute('aria-hidden');
    note(shown !== 'true', 'sticky bar visible at top');

    // Content not hidden behind the bar: last footer element bottom must be above the bar when scrolled to end
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(400);
    const ok = await page.evaluate(() => {
      const bar = document.querySelector('nav[aria-label="פעולות מהירות"]');
      const footer = document.querySelector('footer');
      const barTop = bar.getBoundingClientRect().top;
      const footerBottom = footer.getBoundingClientRect().bottom;
      return { barTop, footerBottom, ok: footerBottom <= barTop + 1 || bar.getAttribute('aria-hidden') === 'true' };
    });
    note(
      ok.ok,
      `footer not covered by sticky bar (footer ${Math.round(ok.footerBottom)} / bar ${Math.round(ok.barTop)})`,
    );
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  }

  // FAQ accordion
  // The first item is open by default; exercise the second one.
  const faqBtn = page.locator('#faq h3 button').nth(1);
  await faqBtn.scrollIntoViewIfNeeded();
  await faqBtn.click();
  await page.waitForTimeout(400);
  note((await faqBtn.getAttribute('aria-expanded')) === 'true', 'FAQ opens (aria-expanded)');
  const panelId = await faqBtn.getAttribute('aria-controls');
  const panelVisible = await page.locator(`#${panelId} p`).isVisible();
  note(panelVisible, 'FAQ answer visible');
  await faqBtn.click();
  await page.waitForTimeout(400);
  note((await faqBtn.getAttribute('aria-expanded')) === 'false', 'FAQ closes');

  // ROI calculator
  const roiValue = page.locator('#roi input[type="number"]').first();
  await roiValue.scrollIntoViewIfNeeded();
  await roiValue.fill('2500');
  await page.waitForTimeout(200);
  const roiText = await page.locator('#roi [role="status"]').textContent();
  note(roiText.includes('25,000'), `ROI updates live (${roiText.replace(/\s+/g, ' ').trim().slice(0, 60)})`);

  // Pricing CTA preselects the package
  const adsCta = page.locator('#pricing article').filter({ hasText: 'Google Ads' }).locator('a[href="/#contact"]');
  await adsCta.scrollIntoViewIfNeeded();
  await adsCta.click();
  await page.waitForTimeout(600);
  const checked = await page.locator('#contact input[name="interest"]:checked').getAttribute('value');
  note(checked === 'website_ads', `pricing CTA pre-selects package (${checked})`);

  // Form validation
  await page.locator('#contact button[type="submit"]').click();
  await page.waitForTimeout(300);
  const errs = await page.locator('#contact [aria-invalid="true"]').count();
  note(errs >= 2, `empty submit shows validation (${errs} invalid fields)`);
  await page.locator('#contact input[name="name"]').fill('בדיקה');
  await page.locator('#contact input[name="phone"]').fill('050-123-4567');
  await page.waitForTimeout(200);
  const errsAfter = await page.locator('#contact [aria-invalid="true"]').count();
  note(errsAfter === 0, `valid input clears errors (${errsAfter})`);
  await page.screenshot({ path: `${OUT}/${vp.name}-form.png` });

  // Full-page screenshot
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(300);
  // Make reveal elements visible for the screenshot
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in')));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${vp.name}-full.png`, fullPage: true });

  const lcp = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const po = new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1);
          resolve(last?.element ? `${last.element.tagName.toLowerCase()}#${last.element.id}` : 'unknown');
        });
        po.observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolve('none'), 1500);
      }),
  );
  console.log(`  ℹ LCP element: ${lcp}`);
  note(consoleErrors.length === 0, `no console errors ${consoleErrors.slice(0, 3).join(' | ')}`);
  await context.close();
}

// Legal pages
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const page = await context.newPage();
for (const path of [
  '/accessibility',
  '/privacy',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
  '/opengraph-image',
  '/does-not-exist',
]) {
  const res = await page.goto(`${BASE}${path}`);
  const expected = path === '/does-not-exist' ? 404 : 200;
  note(res.status() === expected, `${path} → ${res.status()}`);
}
await context.close();
await browser.close();

console.log(`\n${failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} FAILURES`}`);
process.exit(failures.length ? 1 : 0);
