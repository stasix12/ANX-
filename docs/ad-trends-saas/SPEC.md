# AdSignal — אפיון מערכת SaaS לניטור מודעות, קריאייטיבים וטרנדים

> מסמך זה הוא שלבים 1–8 של המשימה: ניתוח הרעיון, מקורות המידע האמיתיים, ארכיטקטורה, סכמת DB,
> אלגוריתמים, UI/UX ותוכנית שלבים. שלב 9 — ה-Master Development Prompt המלא — נמצא בקובץ
> [`MASTER_PROMPT.md`](./MASTER_PROMPT.md) באותה תיקייה.
>
> "AdSignal" הוא שם עבודה בלבד — אפשר להחליף.

---

## 1. ניתוח הרעיון

הערך של המערכת הוא לא "להציג מודעות" (זה קיים ב-Ad Library בחינם) אלא לזהות **מומנטום מוקדם**:

1. **Hot Score למודעה בודדת** — כמה סימנים יש שהמודעה "עובדת" (אריכות ימים, וריאציות, האצה).
2. **Creative Clusters** — קיבוץ מודעות דומות (Hook/Offer/קונספט) כדי לראות מתי *קונספט* מתפשט
   בין מפרסמים — זה הסיגנל החזק ביותר שמשהו עובד, והוא נגזר מדאטה שכן זמין לנו.
3. **Opportunity Finder** — הצלבה של ביקוש עולה (Trends) עם פעילות פרסומית עולה ותחרות נמוכה יחסית.

עקרון הליבה: **שקיפות מקור הנתון**. כל מספר במערכת מסווג כאחד משלושה:

| סיווג | משמעות | דוגמה |
|---|---|---|
| `REAL` | הגיע ישירות מ-API רשמי | תאריך התחלת מודעה מ-Meta Ad Library |
| `DERIVED` | חושב על ידינו מנתוני REAL | Hot Score, Days Running, קצב צמיחה |
| `AI_ESTIMATE` | הערכת מודל AI | קהל יעד משוער, "High Performance Probability" |

המערכת **לעולם לא** מציגה לידים/מכירות/ROAS של מפרסם זר — אין שום מקור חוקי לנתון כזה.

---

## 2. מקורות מידע — מה באמת אפשר לקבל (נכון לתחילת 2026)

זה החלק הקריטי והכי פחות נעים לשמוע, אז הוא ראשון:

### 2.1 Meta (Facebook / Instagram) — Ad Library API
- **מה זמין ב-API הרשמי (`ads_archive`)**:
  - **מודעות פוליטיות/נושאים חברתיים** — בכל המדינות, כולל ישראל: טקסט, קריאייטיב, תאריכים,
    טווחי הוצאה וטווחי impressions.
  - **כל המודעות (מסחריות כולל) שמוצגות ב-EU** (בזכות ה-DSA): טקסטים, כותרות, פלטפורמות,
    תאריכי ריצה, `eu_total_reach` + פילוחי דמוגרפיה, מוטב/משלם. אין likes/comments/shares.
- **מה לא זמין ב-API**: מודעות מסחריות שרצות רק בישראל (או בכל מדינה מחוץ ל-EU).
  הן **כן** מופיעות ב-Ad Library ב-web, אבל scraping מפר את תנאי השימוש של Meta — לא בונים את זה.
- **דרישות**: אימות זהות של המפתח + אישור אפליקציה. Rate limits קיימים אך סבירים.
- **מסקנה**: עמוד השדרה של המערכת. סיגנלים חזקים: start/stop dates, מספר וריאציות
  (מודעות עם אותו טקסט/עמוד), התמדה של מפרסם, reach ב-EU.

### 2.2 TikTok
- **Creative Center — Top Ads**: כלי web ציבורי שמציג מודעות מנצחות לפי מדינה/תעשייה עם
  likes/comments/shares ו-CTR יחסי. **אין API רשמי** ל-Top Ads; שימוש אוטומטי דורש בדיקת ToS.
  כיסוי מדינות חלקי — יש לוודא אם ישראל נתמכת (לא מובטח).
- **Commercial Content API** (DSA): API רשמי לכל המודעות שמוצגות ב-EU — מפרסם, תאריכים,
  פרמטרי טרגוט, טווחי משתמשים שנחשפו. דורש אישור. זה הערוץ החוקי האוטומטי.
- **מסקנה**: מקור טוב ל-EU דרך API רשמי; Top Ads כהעשרה ידנית/עתידית.

### 2.3 Google Ads
- **Ads Transparency Center**: web בלבד, כולל ישראל. **אין API ציבורי**. קיים dataset ציבורי
  ב-BigQuery למודעות פוליטיות בלבד.
- **Google Ads API**: נתונים של החשבונות שלך בלבד — אבל כולל **Keyword Planner**:
  נפחי חיפוש היסטוריים, YoY growth, תחרות ו-CPC משוער **לפי geo כולל ישראל**. זהו סיגנל
  ביקוש + תחרות אמיתי ומצוין ל-Hot Niches, וזמין חוקית (דורש חשבון Google Ads עם Standard access).
- **מסקנה**: לא מקור למודעות של אחרים, אבל מקור מעולה לביקוש ותחרות ברמת נישה.

### 2.4 Google Trends
- API רשמי הוכרז ב-2025 (alpha, בהרשמה). עד לזמינות מלאה: ספריות לא-רשמיות (pytrends) שבירות,
  או ספקים מסחריים (SerpApi). תומך בישראל וברזולוציית ערים חלקית.
- **מסקנה**: סיגנל הביקוש המרכזי ל-Hot Niches ול-Opportunity Score. לתכנן connector עם
  interface שמאפשר להחליף ספק.

### 2.5 YouTube
- **YouTube Data API v3**: סטטיסטיקות ציבוריות של סרטונים (views/likes/comments), חיפוש,
  trending — לפי מדינה כולל ישראל. **לא נתוני מודעות** — אבל סיגנל אורגני מצוין לקונספטים
  ונישות שמתחממות (למשל עלייה בסרטוני "ניקוי ספות" בישראל). מכסה: 10,000 units/יום.

### 2.6 סיכום פערים — ובמיוחד ישראל
| צורך | זמין? | דרך |
|---|---|---|
| מודעות מסחריות EU (Meta/TikTok) | ✅ REAL | APIs רשמיים (DSA) |
| מודעות פוליטיות בכל העולם | ✅ REAL | Meta Ad Library API |
| **מודעות מסחריות בישראל (Meta)** | ⚠️ חלקי | אין API. פתרון: Watchlist עם deep-links ל-Ad Library + ייבוא ידני/בעזרת המשתמש + ספק דאטה מורשה בעתיד |
| Engagement על מודעות | ⚠️ חלקי | TikTok Top Ads בלבד; ב-Meta אין |
| ביקוש חיפוש בישראל | ✅ REAL | Google Trends + Keyword Planner |
| סיגנל אורגני בישראל | ✅ REAL | YouTube Data API |
| לידים/מכירות של מפרסם זר | ❌ | לא קיים. מציגים רק "High Performance Probability" (AI_ESTIMATE) |

לכן לשוק הישראלי האסטרטגיה היא: **Trends + Keyword Planner + YouTube כסיגנל נישה (אוטומטי)**,
ו**מודעות דרך Watchlist מפרסמים + ייבוא** — עם תיוג שקוף של מה חסר.

---

## 3. ארכיטקטורה

```
┌────────────────────────────────────────────────────────────┐
│  Next.js App (Vercel) — Dashboard, Feed, Filters, Alerts   │
│  RSC + Server Actions · Supabase Auth · Tailwind           │
└──────────────┬─────────────────────────────────────────────┘
               │ SQL/RPC (RLS)
┌──────────────▼─────────────────────────────────────────────┐
│  Supabase Postgres  (+ pgvector, pg_cron, pgmq)            │
│  raw_ingest → normalized tables → daily metric rollups     │
└──────────────┬─────────────────────────────────────────────┘
               │ queue jobs
┌──────────────▼─────────────────────────────────────────────┐
│  Worker (Node/TS, Railway/Fly) — BullMQ או pgmq consumer   │
│  • Connectors: meta_ad_library, tiktok_ccl, google_trends, │
│    keyword_planner, youtube                                │
│  • Scoring: hot_score, opportunity_score (מחזורי)          │
│  • AI pipeline: analysis, embeddings, clustering, offers   │
│  • Alert evaluator                                         │
└──────────────┬─────────────────────────────────────────────┘
               │
        Claude API (analysis + embeddings דרך ספק embeddings)
```

עקרונות לקנה מידה של מיליוני מודעות:
- **Ingest גולמי נפרד מנרמול** — `raw_ingest` שומר JSON כמו שהגיע (idempotent, ניתן לעיבוד חוזר).
- **טבלת snapshots יומית** ממודדת לפי חודש (partitioning) — לעולם לא דורסים היסטוריה.
- **Connector interface אחיד** (`fetchSince(cursor)`) — הוספת פלטפורמה = קובץ אחד.
- AI רץ **רק** על מודעות שעברו סף עניין (חוסך עלויות) + cache לפי content-hash.

---

## 4. סכמת DB (תמצית — DDL מלא בפרומפט)

`users/orgs` → `platforms` → `advertisers` → `ads` → `ad_snapshots` (היסטוריה)
`creatives` (+embedding) → `creative_clusters`/`cluster_members`
`niches` → `niche_metrics_daily` · `trend_series` (Google Trends/Keyword Planner)
`offers` → `ad_offers` · `ai_analyses` · `alerts`/`alert_events` · `competitor_watches`
`raw_ingest` · לכל מדד: עמודת `provenance` (`REAL | DERIVED | AI_ESTIMATE`).

---

## 5. אלגוריתמים ראשוניים

### Hot Score (0–100) — ברמת מודעה
ממוצע משוקלל של רכיבים זמינים בלבד, עם **Confidence** לפי כמה סיגנלים היו:

| רכיב | משקל | מקור |
|---|---|---|
| Longevity (ימי ריצה, רוויה לוגריתמית ~60 יום) | 25 | REAL |
| Variant count (וריאציות של אותה מודעה/עמוד) | 20 | REAL |
| Advertiser persistence (המפרסם מרחיב/מחדש) | 15 | DERIVED |
| Cluster momentum (מפרסמים חדשים באותו קונספט, 7 ימים) | 20 | DERIVED |
| Engagement velocity (אם קיים — TikTok/reach EU) | 10 | REAL |
| Search-trend delta של הנישה | 10 | REAL |

רכיב חסר ⇒ המשקל מנורמל מחדש על הקיימים, ו-Confidence יורד. מוצג תמיד: ציון + Confidence + פירוק רכיבים.

### Opportunity Score (0–100) — ברמת נישה×מדינה
`0.35·DemandGrowth + 0.25·AdActivityGrowth + 0.15·OfferInnovation + 0.25·(100 − Saturation)`
- DemandGrowth: שיפוע Trends 30 יום מול baseline שנתי.
- AdActivityGrowth: Δ מודעות פעילות/מפרסמים חדשים בנישה.
- OfferInnovation: הופעת offers חדשים שמתפשטים.
- Saturation: מספר מפרסמים פעילים מול חציון הנישות (תחרות גבוהה = ציון הזדמנות נמוך).

### Creative Clusters
1. AI מחלץ מכל מודעה JSON מובנה (hook/offer/cta/angle/pain point).
2. Embedding על `hook+offer+angle` → pgvector.
3. שיוך greedy: דמיון קוסינוסי ≥ 0.83 לצנטרואיד קיים ⇒ הצטרפות, אחרת cluster חדש; ריכוז מחדש שבועי.
4. מדדי cluster: מפרסמים ייחודיים, קצב הצטרפות, גיל — אלה מזינים את ה-Hot Score.

---

## 6. UI/UX (עיקרי המסכים)

1. **Dashboard** — 5 כרטיסי KPI (Trending Now / Fastest Growing / Opportunity / Emerging Niches /
   Winning Offers) + Feed כרטיסי מודעות עם badge לכל נתון (REAL/DERIVED/AI) וכפתור Analyze with AI.
2. **🔥 Hot Niches** — טבלת נישות עם Trend/Competition/Ad Activity/Growth/Opportunity + "Why trending".
3. **Trending Offers** — offers שחוזרים אצל מפרסמים רבים + גרף התפשטות.
4. **Clusters** — קונספטים קריאייטיביים עם דוגמאות ומומנטום.
5. **Ad Detail** — ניתוח AI מלא (Hook/Offer/CTA/Creative/Audience/Pain/Why it works) + היסטוריית snapshots.
6. **Alerts** — בונה חוקים (נישה+מדינה+סף Hot Score / נישה מתפרצת / offer מתפשט).
7. **Competitor Watch** — מפרסמים במעקב: New/Removed/Longest Running Ads, offers חדשים, שינויי קריאייטיב.
8. **Filters** גלובליים: Country (ישראל ברירת מחדל נתמכת), Language, Industry, Platform, Date,
   Ad Type, Hot Score, Trend Score, Advertiser. עברית = RTL מלא.

Empty states כנים: כשאין דאטה לישראל ממקור מסוים — מסבירים למה ומה האלטרנטיבה, לא ממציאים.

---

## 7. שלבי פיתוח

| שלב | תוכן | קריטריון סיום |
|---|---|---|
| 0 | Foundation: פרויקט, Auth, סכמה+RLS, design system, provenance badges | משתמש נרשם ורואה shell ריק אמיתי |
| 1 | Ingest: Meta Ad Library (EU+פוליטי), Google Trends, YouTube; raw→normalized | מודעות אמיתיות נשמרות עם snapshots |
| 2 | Scoring + Feed + Filters: Hot Score יומי, dashboard, פילטרים | ציון עם breakdown על דאטה אמיתי |
| 3 | AI: ניתוח מודעה, חילוץ offers, embeddings, clusters | Analyze with AI + מסך Clusters חיים |
| 4 | Hot Niches + Opportunity Finder (+Keyword Planner) | מסכי נישות והזדמנויות מדאטה אמיתי |
| 5 | Alerts + Competitor Watch (+TikTok CCL) | התראות email/in-app רצות ב-cron |
| 6 | Scale & Commercial: partitioning, billing (Stripe), team seats, ספק דאטה לישראל | מוכן למשתמשים משלמים |

---

*המשך: [`MASTER_PROMPT.md`](./MASTER_PROMPT.md) — הפרומפט המלא למסירה ל-Claude Code.*
