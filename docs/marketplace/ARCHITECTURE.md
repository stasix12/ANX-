# Cleango (קלינגו) — Marketplace לשירותי ניקוי

מסמך התכנון של פלטפורמת ה-Marketplace שמחברת לקוחות לבעלי מקצוע בתחום הניקוי,
בהשראת חוויית Uber/Gett/Wolt. שם המותג זמני — מוחלף במקום אחד:
`src/lib/market/config.ts`.

המערכת חיה בריפו הזה לצד החנות (`/`) וה-CRM (`/crm`), כאפליקציה עצמאית
תחת `/market`, `/pro` ו-`/market/admin`.

---

## 1. Product Architecture

שלוש אפליקציות על בסיס נתונים אחד:

| אפליקציה | נתיב | קהל |
|---|---|---|
| Customer App | `/market` | לקוחות — הזמנה, מעקב, צ'אט, דירוג |
| Pro App | `/pro/app` | בעלי מקצוע — עבודות, זמינות, הכנסות |
| Admin Panel | `/market/admin` | מפעילי הפלטפורמה |
| Public profiles | `/pro/[slug]` | עמוד ציבורי לכל בעל מקצוע (SEO) |
| SEO pages | `/[service]/[city]` | עמודי שירות×עיר לקידום אורגני |

### שכבות

```
UI (App Router, RSC + client components, RTL, mobile-first)
│
├─ src/lib/market/engine.ts      מכונת מצבים של הזמנה + Dispatch
├─ src/lib/market/matching.ts    אלגוריתם התאמה וניקוד
├─ src/lib/market/services.ts    קטלוג שירותים + שאלות תמחור + הצעת מחיר
├─ src/lib/market/payments.ts    Payment abstraction (Tranzila/Meshulam/…)
├─ src/lib/market/notifications.ts  Notification abstraction (Push/SMS/WhatsApp)
├─ src/lib/market/analytics.ts   Event tracking (GA/Meta/TikTok בעתיד)
│
└─ src/lib/market/store.ts       Repository interface
   ├─ DemoStore    localStorage + BroadcastChannel (realtime בין טאבים)
   └─ SupabaseStore  Postgres + RLS + Realtime (כשמפתחות מוגדרים)
```

**עקרון מפתח:** כל ה-UI מדבר עם `MarketStore` בלבד. במצב פיתוח/דמו (ללא
מפתחות Supabase) הכול עובד מקומית כולל "זמן אמת" בין טאב הלקוח לטאב בעל
המקצוע. הוספת `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
ב-`.env.local` מעבירה את ליבת הזרימה ל-Supabase אמיתי
(`supabase/marketplace-schema.sql`).

### הרחבת שירותים

שירות חדש (וילונות, חלונות…) = רשומה אחת ב-`services.ts` (שם, אייקון, מחיר
בסיס, שאלות תמחור). כל המסכים, ה-SEO וה-Matching נגזרים מהקטלוג.

---

## 2. Sitemap

```
/market                        בית לקוח: כתובת → בחירת שירות
/market/book                   אשף הזמנה (פרטים → מחיר → שיבוץ)
/market/pros                   "בחר בעל מקצוע" — רשימה + מפה
/market/orders                 ההזמנות שלי
/market/orders/[id]            מעקב חי: סטטוסים, צ'אט, דירוג, תשלום
/market/favorites              מועדפים — הזמנה חוזרת בלחיצה
/market/profile                פרופיל לקוח, שפה, קרדיט, הפניות

/pro                           נחיתה לבעלי מקצוע ("הצטרף כמקצוען")
/pro/join                      Onboarding — 8 שלבים עם Progress bar
/pro/app                       Dashboard: סטטיסטיקות + Online/Offline
/pro/app/jobs                  עבודות (חדשות/היום/היסטוריה) + Route planner
/pro/app/earnings              הכנסות, ארנק, עמלות, משיכות
/pro/app/profile               עריכת פרופיל, אזורים, מחירים, גלריה
/pro/[slug]                    פרופיל ציבורי (SEO)

/market/admin                  Dashboard KPI + גרפים
/market/admin/pros             ניהול בעלי מקצוע (אישור/חסימה/עמלה/Badges)
/market/admin/customers        ניהול לקוחות
/market/admin/bookings         כל העבודות (שינוי סטטוס, Refund)
/market/admin/areas            אזורי פעילות + Waitlist
/market/admin/coupons          קופונים
/market/admin/settings         מודל עסקי, אמצעי תשלום, Dispatch

/sofa-cleaning/beer-sheva      SEO: [service]/[city] לכל צירוף פעיל
/mattress-cleaning/arad        …
```

## 3. User Flows

### לקוח — Core Flow ("מצא לי מנקה" הוא ה-CTA הראשי)

```
בית → כתובת (GPS/ידני) → בחירת שירות → שאלות תמחור (מושבים? כתמים? חיות?)
→ תמונות (אופציונלי) → זמן רצוי (עכשיו/מתוזמן) → טווח מחיר משוער
→ [מצא לי מנקה]  ← ברירת מחדל, המערכת משבצת לבד
   או [בחר בעל מקצוע] ← רשימה/מפה עם כרטיסים מלאים
→ Dispatch רץ → בעל מקצוע אישר → מעקב חי (בדרך/הגיע/התחילה/הסתיימה)
→ תשלום → דירוג (איכות/זמנים/שירות/מחיר + טקסט)
```

אם אין זמינים: "כרגע אין מנקה זמין" → קבל הצעות מחיר (Bid mode) /
קבע למועד אחר / הודע לי כשמתפנה. באזור לא מכוסה → Waitlist.

### בעל מקצוע

```
הרשמה (8 שלבים) → סטטוס "ממתין לאישור" → אדמין מאשר → Online
→ Popup "עבודה חדשה" עם ספירה לאחור 30ש' → קבל/דחה
→ קיבל: כפתורי התקדמות (יצאתי → הגעתי → התחלתי → סיימתי) → תשלום → ביקורת
```

### אדמין

אישור מקצוענים → מעקב עבודות חיות → קביעת עמלות/מודל עסקי → ניהול
אזורים/קופונים → Refund/התערבות ידנית.

## 4. Database Schema

הסכמה המלאה, כולל RLS: `supabase/marketplace-schema.sql`. ישויות:

- **profiles** (מרחיב auth.users): role = customer / professional / admin / super_admin
- **service_categories, services** — קטלוג; מחיר בסיס, שאלות תמחור (jsonb)
- **service_areas** — עיר/אזור/רדיוס, active, waitlist_only
- **professionals** — פרופיל עסקי, slug, סטטוס (pending/active/blocked), badges,
  אחוז עמלה פרטני, דירוג ומונים דנורמליזציה
- **professional_services** — שירות×מקצוען + מחיר
- **professional_areas** — אזורי עבודה
- **professional_availability** — Online/Offline + heartbeat + מיקום אחרון
- **bookings** — ההזמנה: לקוח, שירות, כתובת+geo, תשובות תמחור (jsonb),
  quote_low/high, מחיר סופי, עמלה, סטטוס, זמנים
- **booking_offers** — הצעה לבעל מקצוע (dispatch) או הצעת מחיר (bid): סטטוס,
  ttl, מחיר מוצע, הודעה
- **booking_events** — היסטוריית סטטוסים (audit + timeline)
- **messages** — צ'אט פנימי (טקסט/תמונה/מיקום/מערכת)
- **reviews** — 4 ממדים 1–5 + טקסט + תמונה; רק להזמנה שהושלמה
- **payments, wallet_transactions** — תשלומים וארנק
- **coupons, coupon_redemptions**
- **referrals** — חבר מביא חבר
- **favorites**
- **notifications**
- **waitlist** — טלפונים לאזורים לא מכוסים
- **platform_settings** — singleton jsonb: מודל עסקי, אמצעי תשלום, Dispatch

## 5. Roles & Permissions

| יכולת | Customer | Professional | Admin | Super Admin |
|---|---|---|---|---|
| יצירת הזמנה, צ'אט, דירוג | ✔ | — | ✔ | ✔ |
| קבלת/דחיית עבודה, עדכון סטטוס ביצוע | — | ✔ (שלו) | ✔ | ✔ |
| צפייה בפרטי קשר של הצד השני | אחרי שיבוץ | אחרי שיבוץ | ✔ | ✔ |
| אישור/חסימת מקצוענים, Refund, קופונים, אזורים | — | — | ✔ | ✔ |
| שינוי מודל עסקי, ניהול אדמינים | — | — | — | ✔ |

נאכף פעמיים: ב-UI (routing + session) וב-DB (RLS policies בסכמה).

## 6. Booking State Machine

```
draft ─→ searching ─→ offered ─→ accepted ─→ en_route ─→ arrived
              │           │          │
              │   (timeout/declined: │ (ביטול לפני יציאה → canceled,
              │    חוזר ל-searching, │  חוזר ל-searching אם הלקוח רוצה)
              │    הצעה לבא בתור)    ▼
              ▼                  in_progress ─→ completed ─→ paid ─→ reviewed
        no_pros_available
        (→ bidding / scheduled / notify_me)          כל שלב לא-סופי → canceled
```

מעברים חוקיים מקודדים ב-`engine.ts` (`BOOKING_TRANSITIONS`); כל מעבר כותב
`booking_events` ומשדר realtime לשני הצדדים. אדמין רשאי override לכל סטטוס.

## 7. Matching Algorithm

`matching.ts` — ניקוד 0–100 לכל מקצוען זמין שמכסה את השירות והאזור:

| רכיב | משקל | הערות |
|---|---|---|
| מרחק / זמן הגעה | 30 | דעיכה לינארית עד רדיוס העבודה |
| דירוג | 20 | 4.0 ומטה נענש חזק, בונוס ל-4.8+ |
| ניסיון (מס' עבודות) | 10 | לוגריתמי — 30 עבודות ≈ מקסימום |
| אחוז קבלת עבודות | 10 | |
| התאמת מחיר להצעה | 10 | קרוב ל-quote = גבוה |
| הוגנות | 10 | זמן שעבר מהעבודה האחרונה — מפזר עבודות, לא תמיד הקרוב ביותר |
| קידום (Premium/boost) | 10 | נשלט מהאדמין |

Dispatch (ב-`engine.ts`): ההצעה נשלחת למוביל עם TTL של 30 שניות
(ניתן לשינוי ב-settings); דחייה/פקיעה → הבא בתור; נגמרו המועמדים →
`no_pros_available` עם שלושת המוצאים. Bid mode שולח לכמה מקצוענים במקביל
והלקוח בוחר הצעה.

## 8. Folder Structure

```
src/lib/market/        config, types, i18n, geo, services, demoData,
                       store (+adapters), matching, engine, session,
                       payments, notifications, analytics
src/components/market/ MarketShell, ProShell, AdminShell, MapCanvas,
                       ProCard, StatusTimeline, ChatPanel, JobOfferPopup,
                       RatingStars, ui (כפתורים/כרטיסים/סקלטונים)
src/app/market/        אפליקציית לקוח + /market/admin
src/app/pro/           אפליקציית מקצוען + פרופיל ציבורי
src/app/[service]/[city]/  עמודי SEO
supabase/marketplace-schema.sql
docs/marketplace/
```

## 9. MVP Scope

**בפנים (עובד מקצה לקצה):** Core Flow מלא בזמן אמת, שני מסלולי הזמנה
(מצא-לי / בחר-מקצוען), Dispatch עם countdown, מכונת מצבים, צ'אט, דירוגים,
Onboarding + אישור אדמין, Online/Offline, ארנק (רישום עמלות), קופונים,
מועדפים, Waitlist, no-pros-flow, SEO pages, PWA, i18n (he ברירת מחדל +
ru/ar/en למסכי הלקוח המרכזיים), Demo data דרומי (באר שבע/ערד/דימונה…).

**מוכן כ-abstraction, לא מופעל:** סליקה אמיתית (Mock provider; מקום למפתח
מסומן ב-`payments.ts`), WhatsApp Business API, Push אמיתי (SW מוכן), מפות
Google/Mapbox (MapCanvas מקומי; מקום למפתח ב-`config.ts`), Dynamic pricing
(hooks קיימים ב-`services.ts`), Fraud rules (מונים נאספים), Group booking.

**גיאוגרפיה להשקה:** דרום — באר שבע, ערד, דימונה, אשקלון, אשדוד (ניתן
להרחבה מהאדמין); שירותי השקה: ספות, מזרנים, מזגנים (השאר קיימים כ"בקרוב").
