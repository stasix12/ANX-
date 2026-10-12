// End-to-end journey test for /shop (home → category → product → color → cart → checkout → order),
// plus search, favorites, filters, auth and admin. Usage: BASE=http://localhost:3000 node scripts/shop-e2e.cjs <screenshot-dir>
// Full user-journey test + screenshots of all 11 screens at 390x844.
const { chromium } = require(process.env.PW_CORE || 'playwright-core');
const BASE = process.env.BASE || 'http://localhost:3100';
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

  console.log('1 home');
  await go('/shop');
  await page.evaluate(() => localStorage.clear());
  await go('/shop');
  await shot('01-home');
  assert(await page.getByRole('heading', { name: /מודלים תלת מימד/ }).isVisible(), 'hero title visible');

  console.log('2 categories');
  await page.getByRole('navigation', { name: 'ניווט תחתון' }).getByRole('link', { name: 'קטגוריות' }).click();
  await page.waitForURL('**/shop/categories');
  await shot('02-categories');

  console.log('3 catalog');
  await page.getByRole('link', { name: /^דמויות/ }).first().click();
  await page.waitForURL('**/shop/c/figurines');
  await shot('03-catalog');
  const count = await page.locator('article').count();
  assert(count > 0, `catalog shows ${count} products`);

  console.log('8 filters');
  await page.getByRole('button', { name: 'סינון מוצרים' }).click();
  await page.waitForTimeout(400);
  await shot('08-filters');
  await page.getByRole('button', { name: 'חיות', exact: true }).click();
  const btnText = await page.getByRole('button', { name: /^הצג \d+ מוצרים$/ }).textContent();
  console.log('   filter button:', btnText);
  await page.getByRole('button', { name: /^הצג \d+ מוצרים$/ }).click();
  const after = await page.locator('article').count();
  assert(after > 0 && after <= count, `filter applied: ${count} -> ${after}`);

  console.log('4 product');
  await go('/shop/p/flex-dragon');
  await shot('04-product');
  const mainSrc = async () => page.locator('[aria-roledescription="גלריה"] img').first().getAttribute('src');
  const before = await mainSrc();
  await page.getByRole('button', { name: 'אדום', exact: true }).click();
  await page.waitForTimeout(300);
  const red = await mainSrc();
  assert(before !== red && red.includes('dragon-red'), 'color change swaps gallery image');
  await page.getByRole('button', { name: 'הוסף כמות' }).click();
  await page.getByRole('button', { name: /הוסף לסל/ }).click();
  await page.waitForTimeout(300);
  const badge = await page.locator('header').first().getByRole('link', { name: /עגלת קניות, 2 פריטים/ }).count();
  assert(badge > 0, 'cart badge shows 2 items');

  console.log('7 favorites');
  await go('/shop/c/all');
  for (const n of ['דרקון גמיש', 'עציץ גרוט', 'תמנון גמיש', 'דרקון אדום']) {
    await page.getByRole('button', { name: `הוספת ${n} למועדפים` }).first().click();
  }
  await page.getByRole('button', { name: 'הוספת עציץ גרוט לסל' }).first().click();
  await page.getByRole('button', { name: 'הוספת מעמד לטלפון לסל' }).first().click();
  await go('/shop/favorites');
  await shot('07-favorites');
  assert((await page.locator('article').count()) === 4, 'favorites shows 4');
  await page.getByRole('button', { name: 'הסרת תמנון גמיש מהמועדפים' }).click();
  assert((await page.locator('article').count()) === 3, 'remove from favorites works');
  await page.getByRole('button', { name: 'הוספת תמנון גמיש למועדפים' }).count();

  console.log('5 cart');
  await go('/shop/cart');
  // set dragon qty back to 1 so totals mirror the design (89+69+59)
  const rows = page.locator('main li');
  await page.getByRole('button', { name: 'הפחת כמות' }).first().click();
  await shot('05-cart');
  const total = await page.locator('main').getByText(/232/).count();
  assert(total > 0, 'cart total 217 + 15 = 232');
  await page.getByRole('button', { name: 'הוסף כמות' }).nth(1).click();
  assert((await page.locator('main').getByText(/301/).count()) > 0, 'qty change recalculates (286+15=301)');
  await page.getByRole('button', { name: 'הפחת כמות' }).nth(1).click();
  await page.getByLabel('קוד קופון').fill('BADCODE');
  await page.getByRole('button', { name: 'הפעל' }).click();
  assert((await page.getByText('קוד הקופון אינו בתוקף').count()) > 0, 'invalid coupon rejected');
  await page.getByLabel('קוד קופון').fill('anx10');
  await page.getByRole('button', { name: 'הפעל' }).click();
  assert((await page.getByText(/הנחת קופון/).count()) > 0, 'valid coupon applied');
  await page.getByRole('button', { name: 'הסרת הקופון' }).click();

  console.log('6 search');
  await go('/shop/search');
  await page.getByRole('combobox').fill('דרקון');
  await page.waitForTimeout(300);
  await shot('06-search');
  const sugg = await page.getByRole('option').count();
  assert(sugg >= 2, `autocomplete shows ${sugg} suggestions`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  assert((await page.locator('article').count()) >= 3, 'search results for דרקון');
  await page.getByRole('combobox').fill('גיימינג');
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
  await shot('09b-payment');
  await page.getByRole('button', { name: /לתשלום מאובטח/ }).click();
  assert((await page.getByText('יש לאשר את תנאי השימוש').count()) > 0, 'terms required');
  await page.getByRole('checkbox').last().check();
  await page.getByRole('button', { name: /לתשלום מאובטח/ }).click();
  await page.getByRole('button', { name: 'סירוב (בדיקה)' }).click();
  assert((await page.getByText(/התשלום נדחה/).count()) > 0, 'declined payment shows error, no success');
  assert(page.url().includes('/checkout'), 'stayed on checkout after decline');
  await page.getByRole('button', { name: /לתשלום מאובטח/ }).click();
  await page.getByRole('button', { name: 'אישור תשלום (הדגמה)' }).click();
  await page.waitForURL('**/shop/order?id=**', { timeout: 5000 });

  console.log('10 success');
  await page.waitForTimeout(1600);
  await shot('10-success');
  assert((await page.getByText('ההזמנה בוצעה בהצלחה!').count()) > 0, 'success screen after approved payment');
  const num = await page.locator('p[dir=ltr]').first().textContent();
  console.log('   order number', num);
  assert((await page.locator('header').first().getByRole('link', { name: /עגלת קניות, 0 פריטים/ }).count()) > 0, 'cart cleared after order');
  await page.getByRole('link', { name: 'מעקב אחר ההזמנה' }).click();
  await page.waitForURL('**/shop/track**');
  await shot('10b-track');
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
  await page.getByRole('link', { name: 'כתובות משלוח' }).click();
  await page.getByRole('button', { name: '+ הוספת כתובת' }).click();
  await page.getByPlaceholder('רחוב ומספר בית').fill('דיזנגוף 50');
  await page.getByPlaceholder('עיר').fill('תל אביב-יפו');
  await page.getByRole('button', { name: 'שמירה' }).click();
  assert((await page.getByText('דיזנגוף 50').count()) > 0, 'address saved');
  await go('/shop/account');
  await page.getByRole('button', { name: 'התנתק' }).click();
  await page.waitForURL(BASE + '/shop');
  await go('/shop/login');
  await page.getByPlaceholder('אימייל').fill('stas@example.com');
  await page.getByPlaceholder('סיסמה').fill('wrongpass1');
  await page.getByRole('button', { name: 'התחברות', exact: true }).last().click();
  assert((await page.getByText('אימייל או סיסמה שגויים').count()) > 0, 'wrong password rejected');

  console.log('admin');
  await page.getByPlaceholder('אימייל').fill('admin@anx3d.demo');
  await page.getByPlaceholder('סיסמה').fill('anx3d-admin');
  await page.getByRole('button', { name: 'התחברות', exact: true }).last().click();
  await page.waitForURL('**/shop/account');
  await go('/shop/admin');
  await shot('12-admin');
  await page.getByRole('button', { name: '+ מוצר חדש' }).click();
  await page.locator('label:has-text("שם המוצר") input').fill('מחזיק אוזניות');
  await page.locator('label:has-text("מזהה URL") input').fill('headphone-holder');
  await page.locator('label:has-text("מחיר (₪)") input').fill('55');
  await page.locator('label:has-text("מלאי") input[type=number]').first().fill('7');
  await page.getByRole('button', { name: 'גיימינג' }).click();
  await page.getByPlaceholder(/או כתובת תמונה/).fill('/shop/img/phone-stand.webp');
  await page.getByRole('button', { name: 'הוספה' }).click();
  await page.getByRole('button', { name: 'שמירה' }).click();
  assert((await page.getByText('מחזיק אוזניות').count()) > 0, 'admin created product');
  await go('/shop/c/gaming');
  assert((await page.getByText('מחזיק אוזניות').count()) > 0, 'new product visible in storefront');
  await page.getByRole('link', { name: 'מחזיק אוזניות' }).click();
  await page.waitForURL('**/shop/item?s=headphone-holder');
  assert((await page.getByRole('heading', { name: 'מחזיק אוזניות' }).count()) > 0, 'new product page works');

  console.log('empty cart');
  await go('/shop/cart');
  assert((await page.getByText('העגלה ריקה').count()) > 0, 'empty cart state');
  await go('/shop/p/does-not-exist');
  console.log('\nCONSOLE/NETWORK ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
