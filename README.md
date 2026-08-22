# ANX3D — Professional Cleaning Equipment

אתר חנות למותג **ANX3D**: ידיות שאיבה, צינורות ומתאמים למכונות Sabrina, לאנשי מקצוע בתחום ניקוי הספות והריפודים.

בנוי ב-Next.js (App Router) + TypeScript + Tailwind CSS, ללא ספריות UI כבדות — כל האייקונים והאנימציות מקומיים.

## הפעלה

```bash
npm install
npm run dev      # http://localhost:3000
```

פקודות נוספות:

| פקודה | מה היא עושה |
| --- | --- |
| `npm run build` | בניית גרסת פרודקשן (כל עמודי המוצר נוצרים סטטית) |
| `npm start` | הרצת גרסת הפרודקשן שנבנתה |
| `npm run typecheck` | בדיקת טיפוסים בלבד |
| `npm run placeholders` | יצירה מחדש של כל קבצי ה-placeholder |

## החלפת התמונות בתמונות אמיתיות

כל התמונות באתר הן **placeholders ממוספרים** — לא תמונות סטוק. כל אחד מהם מציג את מספר התמונה בגלריה ואת שם המוצר, כדי שיהיה ברור איזו תמונה אמיתית מחליפה איזה קובץ.

**תמונות מוצר** — לכל מוצר שלוש תמונות תחת `public/products/<slug>/`:

```
public/products/anx-pro-handle/1.svg   ← התמונה הראשית (מופיעה גם בכרטיס המוצר)
public/products/anx-pro-handle/2.svg
public/products/anx-pro-handle/3.svg
```

להחלפה: שימו את הקובץ האמיתי באותה תיקייה (למשל `1.jpg`) ועדכנו את הנתיב במערך `images` של המוצר ב-`src/lib/products.ts`. מומלץ יחס 1:1 (ריבוע), לפחות 1000×1000.

**תמונת ה-Hero** — `public/hero/machine.svg`. הנתיב מוגדר ב-`src/components/Hero.tsx`. מומלץ יחס רחב, לפחות 1920×1080.

**תמונת OG לשיתופים** — נוצרת אוטומטית כ-PNG ב-`src/app/opengraph-image.tsx`. אפשר להחליף אותה בקובץ תמונה קבוע.

**Favicon** — `src/app/icon.svg`.

> אחרי שמחליפים קובץ SVG בקובץ JPG/PNG אפשר להסיר את הדגל `dangerouslyAllowSVG` מ-`next.config.mjs`. הוא נדרש רק כדי ש-`next/image` יטען את ה-placeholders שהם SVG.

## עריכת תוכן

| מה לערוך | איפה |
| --- | --- |
| מוצרים, מחירים, מפרטים, וריאציות | `src/lib/products.ts` |
| מספר וואטסאפ, קישורי רשתות, שם מותג | `src/lib/site.ts` |
| שאלות נפוצות | `src/components/Faq.tsx` |
| אזור "למה ANX3D" | `src/components/WhyUs.tsx` |

מחיר הוא שדה אופציונלי — מוצר בלי `price` יציג "לפרטי מחיר בוואטסאפ" במקום מחיר.

## הזמנות ב-WhatsApp

כל כפתור הזמנה פותח קישור בפורמט:

```
https://wa.me/972535257250?text=<הודעה מקודדת>
```

ההודעה נבנית ב-`src/lib/site.ts` דרך `encodeURIComponent`, כך שהעברית עוברת תקין בכל המכשירים. שינוי המספר במקום אחד (`site.whatsappNumber`) מתעדכן בכל האתר.

## מבנה הפרויקט

```
src/
├── app/
│   ├── layout.tsx              # <html lang="he" dir="rtl">, פונט, מטא-דאטה
│   ├── page.tsx                # דף הבית
│   ├── products/[slug]/page.tsx# עמוד מוצר מלא
│   ├── opengraph-image.tsx     # תמונת OG
│   ├── sitemap.ts / robots.ts
│   └── globals.css             # טוקנים של העיצוב
├── components/                 # Header, Hero, ProductCard, ProductGrid, ...
└── lib/
    ├── products.ts             # נתוני המוצרים
    └── site.ts                 # קונפיגורציית מותג + קישורי WhatsApp
```

## הערות טכניות

- **RTL מלא**: הפריסה משתמשת ב-logical properties (`ps-`, `me-`, `start-`) כך שהיישור, האייקונים והניווט מתהפכים נכון.
- **Mobile first**: כל הפריסות נבנו קודם למובייל ומתרחבות מעלה.
- **ביצועים**: `next/image` עם `sizes` מדויק, lazy loading לכל התמונות פרט ל-Hero, ופונט Heebo עם `display: swap`.
- **נגישות**: קישור דילוג לתוכן, `alt` לכל התמונות, פוקוס נראה למקלדת, סינון המוצרים ממומש כ-`radiogroup`, ותפריט המובייל נסגר ב-Escape.
- **SEO**: title/description לכל עמוד, Open Graph ו-Twitter cards, `sitemap.xml`, `robots.txt` ו-JSON-LD (Product, FAQPage, Store).

לפני עלייה לאוויר כדאי להגדיר את כתובת האתר האמיתית:

```bash
NEXT_PUBLIC_SITE_URL=https://anx3d.co.il
```
