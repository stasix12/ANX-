# אתר הסוכנות — בניית אתרים לעסקים + Google Ads

אתר נחיתה בעברית (RTL) שמטרתו להפוך בעלי עסקים ללידים דרך WhatsApp וטופס קצר.
אפליקציית Next.js 16 עצמאית (App Router, React 19, Tailwind 4, TypeScript), ללא ספריות UI חיצוניות.

## הפעלה

```bash
cd agency
npm install
cp .env.example .env.local   # ומלאו את הערכים
npm run dev                  # http://localhost:3000
```

| פקודה | מה היא עושה |
| --- | --- |
| `npm run build` | בניית פרודקשן — כל העמודים סטטיים |
| `npm start` | הרצת גרסת הפרודקשן |
| `npm run typecheck` | בדיקת טיפוסים |
| `npm run lint` | ESLint (כולל בדיקות נגישות) |
| `npm run qa` | בדיקות דפדפן (Playwright) מול שרת שרץ על פורט 3100 — ראו `scripts/qa.mjs` |

## איפה משנים מה

| מה | איפה |
| --- | --- |
| שם המותג, טלפון, WhatsApp, אימייל, רשתות, קישור לביקורות Google | `src/config/site.ts` (ו-`.env.local` למספרים) |
| מחירים לחבילות (`null` = "הצעת מחיר לפי אפיון") | `src/config/site.ts` → `pricing` |
| כל הטקסטים באתר | `src/content/copy.ts` |
| שאלות נפוצות (מזין גם את ה-Schema) | `src/content/faq.ts` |
| תיק עבודות (פרויקטים אמיתיים בלבד) | `src/content/portfolio.ts` + תמונות ב-`public/portfolio/` |
| ביקורות Google (אמיתיות בלבד) | `src/content/reviews.ts` |
| עמודי ערים עתידיים (`/website-building-beer-sheva`) | `src/content/cities.ts` + שינוי שם התיקייה `src/app/_[slug]` ל-`[slug]` |
| עיצוב: צבעים, טיפוגרפיה, כפתורים | `src/app/globals.css` (`@theme`) |
| מזהי Analytics ו-endpoint לטופס | `.env.local` (ראו `.env.example`) |

### לפני עלייה לאוויר

1. `NEXT_PUBLIC_SITE_URL` — כתובת הדומיין (canonical, sitemap, OG).
2. `NEXT_PUBLIC_WHATSAPP_NUMBER` — עד שהוא מוגדר, כל כפתורי ה-WhatsApp מובילים לטופס.
3. `NEXT_PUBLIC_LEAD_ENDPOINT` — לאן נשלח הטופס (Web3Forms / Formspree / Apps Script). בלי endpoint הטופס נפתח ב-WhatsApp עם הפרטים.
4. `showPlaceholders` ב-`portfolio.ts` ו-`showWhenEmpty` ב-`reviews.ts` — להעביר ל-`false` אם עדיין אין תוכן אמיתי.
5. מזהי GTM / GA4 / Google Ads / Meta Pixel — כל תג נטען רק כשהמזהה שלו קיים.
6. לוגו אמיתי: להחליף את `src/components/layout/Logo.tsx`, את `src/app/icon.svg`, ולהוסיף `src/app/apple-icon.png`.
7. תמונת OG מעוצבת (אופציונלי): `src/app/opengraph-image.png` במקום ה-TSX.

## אירועי מעקב (dataLayer)

`whatsapp_click`, `phone_click`, `form_start`, `form_error`, `form_submit`, `form_submit_error`,
`pricing_cta_click`, `google_package_cta_click`, `website_package_cta_click`, `cta_click`,
`roi_calculate`, `faq_open`, `portfolio_click`. הכול עובר דרך `track()` ב-`src/lib/analytics.ts`.
המרות מומלצות: `form_submit` (ראשי), `whatsapp_click`, `phone_click`.

## מבנה

```
src/app          עמודים, metadata, sitemap/robots/manifest, OG image, [slug] לעמודי ערים
src/components   layout (Header, Footer, StickyBar), sections (כל סקשן בעמוד), ui
src/content      טקסטים ונתונים — בלי JSX
src/config       site.ts — ההגדרות של העסק
src/lib          analytics, leads, phone, whatsapp, schema (JSON-LD), intent
```
