// End-to-end journey test for /shop: home → category → product → color → cart →
// checkout → order, plus filters, unpriced (WhatsApp) products, search,
// favorites, auth and admin (incl. a product with a diameter choice).
// Usage: BASE=http://localhost:3000 node scripts/shop-e2e.cjs <screenshot-dir> [width] [height]
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.argv[2] || 'shots';
const W = +(process.argv[3] || 390), H = +(process.argv[4] || 844);
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok -', m); };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: W < 800, hasTouch: W < 800, locale: 'he-IL' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(page.url() + ' :: ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(page.url() + ' :: pageerror ' + e.message));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
  const shot = async (name) => {
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
    await page.waitForTimeout(600);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (sw > 0) errors.push(`HORIZONTAL OVERFLOW ${sw}px on ${page.url()}`);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };
  const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); };
  const badge = async (n) => (await page.locator('header').first().getByRole('link', { name: new RegExp(`עגלת קניות, ${n} פריטים`) }).count()) > 0;

  console.log('1 home');
  await go('/shop');
  await page.evaluate(() => localStorage.clear());
  await go('/shop');
  await shot('01-home');
  assert(await page.getByRole('heading', { name: /הדור הבא של/ }).isVisible(), 'hero title visible');
  assert((await page.getByText(/דרקון|עציץ|תמנון/).count()) === 0, 'no decorative products left');

  console.log('2 categories');
  await page.getByRole('navigation', { name: 'ניווט תחתון' }).getByRole('link', { name: 'קטגוריות' }).click();
  await page.waitForURL('**/shop/categories');
  await shot('02-categories');
  assert((await page.locator('main ul[dir=ltr] > li').count()) === 6, 'six cleaning categories');

  console.log('3 catalog');
  await page.getByRole('link', { name: /^ידיות לניקוי ספות/ }).first().click();
  await page.waitForURL('**/shop/c/handles');
  await shot('03-catalog');
  const count = await page.locator('article').count();
  assert(count >= 2, `handles shows ${count} products`);

  console.log('8 filters');
  await page.getByRole('button', { name: 'סינון מוצרים' }).click();
  await page.waitForTimeout(400);
  await shot('08-filters');
  await page.getByRole('button', { name: 'משלימים', exact: true }).click();
  await page.getByRole('button', { name: /^הצג \d+ מוצרים$/ }).click();
  const after = await page.locator('article').count();
  assert(after === 1, `filter applied: ${count} -> ${after}`);

  console.log('4 product');
  await go('/shop/p/anaconda');
  await shot('04-product');
  const mainSrc = async () => page.locator('[aria-roledescription="גלריה"] img').first().getAttribute('src');
  assert((await mainSrc()).includes('anx-anaconda/1'), 'real ANACONDA photo first');
  await page.getByRole('button', { name: 'שחור', exact: true }).click();
  await page.waitForTimeout(300);
  assert((await mainSrc()).includes('anx-anaconda/5'), 'black swatch shows the black handle photos');
  assert((await page.locator('video').count()) === 1, 'demo video in gallery');
  await page.getByRole('button', { name: 'הוסף כמות' }).click();
  await page.getByRole('button', { name: /הוסף לסל/ }).click();
  await page.waitForTimeout(300);
  assert(await badge(2), 'cart badge shows 2 items');

  console.log('unpriced product');
  await go('/shop/p/wand-of-troy');
  assert((await page.getByText('מחיר יעודכן בקרוב').count()) > 0, 'unpriced product says price will be updated');
  const wa = await page.getByRole('link', { name: /בוואטסאפ/ }).getAttribute('href');
  assert(wa.startsWith('https://wa.me/') && decodeURIComponent(wa).includes('Wand of Troy'), 'WhatsApp order link carries the product');
  assert((await page.getByRole('button', { name: /הוסף לסל/ }).count()) === 0, 'no add-to-cart without a price');
  assert((await page.getByText('תמונה להמחשה').count()) > 0, 'mock-up image is captioned as illustrative');

  console.log('7 favorites');
  await go('/shop/c/all');
  for (const n of ['ANACONDA', 'Wand of Troy', 'ראש שאיבה לחריצים', 'קופסה למשאבת Shurflo']) {
    await page.getByRole('button', { name: `הוספת ${n} למועדפים` }).first().click();
  }
  await page.getByRole('button', { name: 'הוספת סט קליפסים לצינורות לסל' }).first().click();
  await page.getByRole('button', { name: 'לפרטים ולהזמנה — Wand of Troy' }).first().click();
  await page.waitForURL('**/shop/p/wand-of-troy');
  await go('/shop/favorites');
  await shot('07-favorites');
  assert((await page.locator('article').count()) === 4, 'favorites shows 4');
  await page.getByRole('button', { name: 'הסרת ראש שאיבה לחריצים מהמועדפים' }).click();
  assert((await page.locator('article').count()) === 3, 'remove from favorites works');

  console.log('5 cart');
  await go('/shop/cart');
  await page.getByRole('button', { name: 'הפחת כמות' }).first().click();
  await shot('05-cart');
  assert((await page.locator('main').getByText(/1144/).count()) > 0, 'total 850 + 279 + 15 shipping = 1144');
  await page.getByRole('button', { name: 'הוסף כמות' }).nth(1).click();
  assert((await page.locator('main').getByText(/1423/).count()) > 0, 'qty change recalculates (850 + 558 + 15 = 1423)');
  await page.getByRole('button', { name: 'הפחת כמות' }).nth(1).click();
  await page.getByLabel('קוד קופון').fill('BADCODE');
  await page.getByRole('button', { name: 'הפעל' }).click();
  assert((await page.getByText('קוד הקופון אינו בתוקף').count()) > 0, 'invalid coupon rejected');

  console.log('6 search');
  await go('/shop/search');
  await page.getByRole('combobox').fill('ידית');
  await page.waitForTimeout(300);
  await shot('06-search');
  assert((await page.getByRole('option').count()) >= 1, 'autocomplete suggestions');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  assert((await page.locator('article').count()) >= 1, 'search results for ידית');
  await page.getByRole('combobox').fill('שטיחים');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  assert((await page.locator('article').count()) >= 1, 'search by category name');

  console.log('9 checkout');
  await go('/shop/checkout');
  await shot('09-checkout');
  await page.getByRole('button', { name: 'המשך לתשלום' }).click();
  assert((await page.getByText('נא להזין שם מלא').count()) > 0, 'checkout validation');
  await page.getByPlaceholder('שם מלא').fill('ישראל ישראלי');
  await page.getByPlaceholder('טלפון').fill('050-1234567');
  await page.getByPlaceholder('אימייל (לאישור ההזמנה)').fill('test@example.com');
  await page.getByPlaceholder('כתובת (רחוב ומספר בית)').fill('הרצל 10');
  await page.locator('select').selectOption('חיפה');
  await page.getByRole('button', { name: 'המשך לתשלום' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('checkbox').last().check();
  await page.getByRole('button', { name: /לתשלום מאובטח/ }).click();
  await page.getByRole('button', { name: 'סירוב (בדיקה)' }).click();
  assert((await page.getByText(/התשלום נדחה/).count()) > 0, 'declined payment shows error, no success');
  await page.getByRole('button', { name: /לתשלום מאובטח/ }).click();
  await page.getByRole('button', { name: 'אישור תשלום (הדגמה)' }).click();
  await page.waitForURL('**/shop/order?id=**', { timeout: 5000 });

  console.log('10 success');
  await page.waitForTimeout(1600);
  await shot('10-success');
  assert((await page.getByText('ההזמנה בוצעה בהצלחה!').count()) > 0, 'success screen after approved payment');
  assert(await badge(0), 'cart cleared after order');
  await page.getByRole('link', { name: 'מעקב אחר ההזמנה' }).click();
  await page.waitForURL('**/shop/track**');
  assert((await page.getByText('ANACONDA').count()) > 0, 'tracking shows ordered items');
  await go('/shop/order?id=nonexistent');
  assert((await page.getByText('ההזמנה לא נמצאה').count()) > 0, 'fake order id shows no success');

  console.log('11 account');
  await go('/shop/account');
  await page.waitForURL('**/shop/login**');
  await page.getByRole('tab', { name: 'הרשמה' }).click();
  await page.getByPlaceholder('שם מלא').fill('סטס');
  await page.getByPlaceholder('אימייל').fill('stas@example.com');
  await page.getByPlaceholder(/סיסמה/).fill('password123');
  await page.getByRole('button', { name: 'יצירת חשבון' }).click();
  await page.waitForURL('**/shop/account');
  await shot('11-account');
  await page.getByRole('button', { name: 'התנתק' }).click();
  await page.waitForURL(BASE + '/shop');

  console.log('admin');
  await go('/shop/login');
  await page.getByPlaceholder('אימייל').fill('admin@anx3d.demo');
  await page.getByPlaceholder('סיסמה').fill('anx3d-admin');
  await page.getByRole('button', { name: 'התחברות', exact: true }).last().click();
  await page.waitForURL('**/shop/account');
  await go('/shop/admin');
  await shot('12-admin');
  await page.getByRole('button', { name: '+ מוצר חדש' }).click();
  await page.locator('label:has-text("שם המוצר") input').fill('מתאם בדיקה');
  await page.locator('label:has-text("מזהה URL") input').fill('test-adapter');
  await page.locator('label:has-text("מחיר (₪)") input').fill('120');
  await page.getByRole('button', { name: 'מתאמים ומחברים' }).click();
  await page.getByPlaceholder(/או כתובת תמונה/).fill('/shop/img2/cat-adapters.webp');
  await page.getByRole('button', { name: 'הוספה' }).click();
  await page.getByRole('button', { name: '+ בחירה' }).click();
  await page.getByLabel('אפשרויות, מופרדות בפסיק').fill('32 מ״מ, 36 מ״מ, 38 מ״מ');
  await page.getByRole('button', { name: 'שמירה' }).click();
  assert((await page.getByText('מתאם בדיקה').count()) > 0, 'admin created product');
  await go('/shop/item?s=test-adapter');
  await page.getByRole('button', { name: /הוסף לסל/ }).click();
  assert((await page.getByText('יש לבחור קוטר חיבור').count()) > 0, 'diameter must be chosen');
  await page.getByRole('button', { name: '36 מ״מ' }).click();
  await page.getByRole('button', { name: /הוסף לסל/ }).click();
  await go('/shop/cart');
  assert((await page.getByText('קוטר חיבור: 36 מ״מ').count()) > 0, 'cart line carries the chosen diameter');

  console.log('\nCONSOLE/NETWORK ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
