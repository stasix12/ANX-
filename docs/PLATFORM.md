# פלטפורמת עבודות סגורות — ארכיטקטורה

מסמך התכנון של המערכת החדשה: החברה מביאה את הלקוח, סוגרת מחיר ומועד, והמערכת
מוכרת את העבודה הסגורה לבעל מקצוע. המסמך עונה על 14 סעיפי התכנון שנדרשו לפני
כתיבת קוד, ומתאר בדיוק מה נבנה ב-MVP, מה הוכן כתשתית, ואיפה מכניסים מפתחות.

---

## 1. System Architecture

```
                      ┌─────────────────────────────────────────────┐
                      │                 Next.js App                 │
                      │                                             │
  לקוח ──────────────▶│  /clean   אתר מכירות + Funnel הצעת מחיר      │
  נציג מכירות ───────▶│  /hq      CRM, סגירת עבודות, Admin, כלכלה    │
  מנקה ──────────────▶│  /pro     אפליקציית בעלי מקצוע (PWA)         │
  מנקה חדש ──────────▶│  /pro/join  דף גיוס + Onboarding             │
                      └───────────────────┬─────────────────────────┘
                                          │
                          ┌───────────────▼───────────────┐
                          │      Core Engine (טהור)        │
                          │  src/lib/platform/             │
                          │  stateMachine · dispatch ·     │
                          │  pricing · leadScore · wallet  │
                          └───────────────┬───────────────┘
                                          │  PlatformDB (interface)
                        ┌─────────────────┴──────────────────┐
                        │                                    │
              ┌─────────▼─────────┐               ┌──────────▼──────────┐
              │   Demo Adapter    │               │  Supabase Adapter    │
              │ localStorage +     │               │ PostgreSQL + RLS +   │
              │ seeded demo data   │               │ RPC (take_job וכו')  │
              └───────────────────┘               └─────────────────────┘
```

עקרונות:

- **Core Engine גנרי** — כל הלוגיקה העסקית (Lead → Sale → Job → Dispatch →
  Completion → Profit) כתובה כפונקציות טהורות שלא יודעות כלום על "ניקוי ספות".
  ה"vertical" (ניקוי / אינסטלציה / הובלות…) הוא שדה בקטלוג השירותים בלבד, כך
  שהעתקת המודל לתחום אחר = הוספת קטגוריות בקטלוג, בלי לגעת במנוע.
- **Adapter Layer** — כל גישה לנתונים עוברת דרך interface אחד (`PlatformDB`).
  כשמוגדרים `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  ב-`.env.local` המערכת עוברת ל-Supabase אמיתי; בלעדיהם רץ Demo Mode מלא
  (נתונים נשמרים ב-localStorage, כל כפתור עובד באמת מקצה לקצה).
- **אינטגרציות חיצוניות** (WhatsApp Business API, סליקה, מפות, Push) — כולן
  מאחורי abstraction (ראו `src/lib/platform/integrations.ts`): לכל ספק יש
  Adapter עם Mock שמתעד את הפעולה, וממשק אחד להחלפת ספק.

## 2. Database Schema

הסכימה המלאה: `supabase/platform-schema.sql` (+ דמו: `platform-seed.sql`).
טבלאות עיקריות:

| קבוצה | טבלאות |
| --- | --- |
| זהות והרשאות | `platform_users` (role לכל משתמש Auth), `audit_logs` |
| קטלוג | `service_categories` (עם `vertical`), `services`, `service_areas` |
| לקוחות | `customers` (פרופיל, הזמנות, AOV, הזמנה אחרונה — ל-Reactivation) |
| מכירות | `leads`, `lead_status_history`, `lead_notes`, `lead_activities`, `followups`, `sales_agents` |
| שיווק | `marketing_sources`, `campaigns`, `ad_spend` (UTM נשמר על הליד) |
| עבודות | `jobs`, `job_status_history`, `job_dispatches` (Waves), `job_offers`, `job_assignments` |
| בעלי מקצוע | `professionals`, `professional_services`, `professional_service_areas` |
| כספים | `wallets`, `wallet_transactions` (Ledger), `payments`, `refunds`, `pricing_rules` |
| איכות | `reviews`, `complaints`, `notifications`, `customer_reactivation` |

נקודות חשובות:

- **Ledger** — `wallets.balance` הוא cache בלבד; כל תנועה היא שורה ב-
  `wallet_transactions` (`TOP_UP / JOB_PURCHASE / REFUND / BONUS / ADJUSTMENT / PAYOUT`)
  עם `balance_after`. פונקציית SQL `wallet_apply` מבצעת את שתי הכתיבות
  בטרנזקציה אחת ונכשלת על יתרה שלילית.
- **`take_job(job_id)`** — RPC אטומי: נועל את העבודה, בודק שהיא עדיין פנויה
  ושלמנקה יש יתרה, מחייב את הארנק, יוצר assignment, ומחזיר את פרטי הלקוח.
  שני מנקים שלוחצים יחד — רק הראשון מקבל.
- **State machine בטריגר** — מעבר סטטוס לא חוקי ב-`jobs` נדחה ברמת ה-DB.
- **RLS** — ראו סעיף 14.

## 3. User Roles

`super_admin` · `admin` · `sales_manager` · `sales_agent` · `support_agent` ·
`professional` · `customer`.

- לקוח: רק ה-funnel ודף הביקורת שלו. לא רואה מנקים ולא מחירי קבלן.
- מנקה: רק עבודות שהוצעו לו/נלקחו על ידו. פרטי לקוח — רק אחרי רכישה.
- נציג: לידים ועבודות; לא רואה הגדרות תמחור ולא כלכלה.
- מנהל מכירות: כמו נציג + דוחות נציגים.
- Admin / Super Admin: הכול, כולל Pricing Engine, Dispatch Config וכלכלה.

בדמו יש מסך "כניסה" בכל אפליקציה שבוחר תפקיד; ב-Supabase זה Supabase Auth +
טבלת `platform_users` + RLS.

## 4. Customer Flow

```
מודעה (UTM) → /clean (Landing) → "קבלו מחיר לניקוי"
→ Funnel ‎7 שלבים: שירות → כמות → מצב (כתמים/ריחות/בע"ח) → תמונות
  → עיר+כתובת → מועד (היום/מחר/תאריך) → שם+טלפון+WhatsApp
→ "הבקשה התקבלה, נציג יחזור אליך עם מחיר"
→ הליד נכנס ל-CRM עם Score, מקור ו-UTM
→ אחרי ביצוע: SMS/WhatsApp עם קישור לדירוג (/clean/review/[jobId])
→ אחרי X חודשים: Reactivation ("הגיע הזמן לרענן את הספה")
```

הלקוח פוגש מותג אחד. אין רשימת מנקים בשום מסך לקוח.

## 5. Sales Flow

```
ליד חדש (HOT למעלה) → נציג לוחץ "התקשר" → תוצאה:
  אין מענה → Follow-up (10ד'/שעה/3ש'/מחר/מותאם) + תבנית WhatsApp
  בשיחה → הצעת מחיר (המנוע מציע טווח לפי הקטלוג) → נשלחה
  מעוניין → "סגור עבודה":
     מחיר ללקוח, מועד, חלון שעות, אמצעי תשלום, הערות
     + Upsell אוטומטי (ספה? ← הצע מזרן/שטיח/מזגן)
     + Fee Model לבחירה: המנקה משלם X ▸ או ▸ החברה גובה ומשלמת למנקה Y
     המנוע מציע את מחיר מכירת העבודה (Pricing Engine) — הנציג יכול לדרוס
  אישור → נוצרת JOB במצב WAITING_FOR_PROFESSIONAL וההפצה מתחילה
```

## 6. Professional Flow

```
/pro/join → טופס Onboarding (עסק, אזורים, רדיוס, שירותים, מסמכים)
→ ממתין לאישור Admin → אושר
→ /pro: כפתור "זמין לקבל עבודות" (Online/Offline)
→ Feed: עבודות סגורות בלבד — עיר/אזור, מועד, שירות, מחיר ללקוח,
   מחיר קבלת העבודה, "נשאר לך", מרחק, תמונות. בלי שם/טלפון/כתובת מדויקת.
→ "קח את העבודה" → חיוב ארנק אטומי → פרטי הלקוח נפתחים
→ בדרך → הגעתי → בעבודה → הושלם → הלקוח מדרג
→ ביטול מנקה → העבודה חוזרת ל-Marketplace (שעה לפני? 🚨 URGENT + הוזלה)
```

## 7. Job State Machine

`src/lib/platform/stateMachine.ts` — מפת מעברים אחת שגם ה-UI וגם ה-DB אוכפים:

```
LEAD → CONTACTED → QUOTE_SENT → CLOSED → JOB_CREATED
JOB_CREATED → WAITING_FOR_PROFESSIONAL → OFFERED → ACCEPTED
ACCEPTED → PROFESSIONAL_ASSIGNED → ON_THE_WAY → ARRIVED → IN_PROGRESS
IN_PROGRESS → COMPLETED → CUSTOMER_CONFIRMED
כל שלב פעיל → CANCELLED → (REFUNDED | חזרה ל-WAITING_FOR_PROFESSIONAL)
```

מעבר שלא במפה נזרק עם שגיאה (וב-SQL — נדחה בטריגר).

## 8. Dispatch Algorithm

`src/lib/platform/dispatch.ts`:

1. **סינון זכאות** — Online, מאושר, מבצע את השירות, העיר באזורי הפעילות או
   בתוך רדיוס הנסיעה.
2. **דירוג** — ציון משוקלל: מרחק, Professional Score, אחוז השלמה, ביטולים,
   מהירות תגובה, עומס אחרון (fairness), התאמת העדפות (Smart Notifications —
   המנקה נוטה לקחת עבודות כאלה?). כל המשקולות ב-`dispatch_config`.
3. **Waves** — ‎Wave 1: N הטובים (ברירת מחדל 5) · אחרי T שניות (60) Wave 2:
   ‎+10 · אחרי T נוסף Wave 3: כל הזכאים. כל המספרים ניתנים לשינוי מ-Admin.
4. **מחיר יורד** — במקביל ל-Waves, לוח הוזלות מה-Pricing Engine מוריד את
   מחיר קבלת העבודה מדרגה-מדרגה עד רצפה מוגדרת.
5. **Emergency Re-Dispatch** — ביטול מנקה סמוך למועד ⇒ 🚨 URGENT, פתיחה מיידית
   לכל הזכאים והוזלה אגרסיבית.

בדמו ה-Waves מחושבים דטרמיניסטית מ-(עבודה, שעה נוכחית) — פונקציה טהורה שקל
להעביר לג'וב שרת (cron / Supabase Edge Function) בפרודקשן.

## 9. Pricing Engine

`src/lib/platform/pricing.ts` + טבלת `pricing_rules`. אין מספרים קשיחים בקוד:

- חוק = היקף (קטגוריה? עיר? דחיפות? טווח מחיר-לקוח?) + שיטה
  (אחוז / סכום קבוע / טווח אחוז) + עדיפות. החוק הספציפי ביותר מנצח.
- ברירת המחדל בדמו: ‎20–28% ממחיר הלקוח, מעוגל ל-₪5 — מייצר בדיוק את הטבלה
  מהאפיון (300₪ → 60–80₪ … 1,000₪ → 200–280₪) אבל הכול עריך ב-`/hq/settings`.
- לוח הוזלות: אחרי X דקות ירידה ל-Y% מהמחיר ההתחלתי, עד רצפה. עריך.
- שני מודלים לכל עבודה: **Fee** (המנקה משלם ולוקח) או **Payout** (החברה גובה
  מהלקוח ומשלמת למנקה סכום ביצוע). הבחירה פר-עבודה במסך סגירה; ברירת מחדל
  ב-Settings.

## 10. Wallet Architecture

- ארנק פר-מנקה, `balance` נגזר תמיד מה-Ledger.
- רכישת עבודה: `JOB_PURCHASE` שלילי בטרנזקציה אטומית עם ה-assignment.
- ביטול לקוח לפני יציאה ⇒ `REFUND` מלא אוטומטי. ביטול מנקה ⇒ אין החזר
  (Cancellation Score נפגע) והעבודה חוזרת להפצה.
- `Minimum Balance` עריך; אין יתרה ⇒ "טען ארנק כדי לקבל את העבודה".
- טעינה: בדמו — כפתור טעינה מדומה שמייצר `TOP_UP`; בפרודקשן — Adapter סליקה
  (`integrations.ts` → `payments`) שמוכן לחיבור ספק ישראלי (Tranzila/Grow/
  Meshulam) — מוסיפים מפתח ב-`.env.local` ומממשים `charge()` באדפטר.

## 11. Unit Economics Tracking

- `ad_spend` — הוצאת פרסום יומית פר מקור/קמפיין (קלט ידני ב-MVP, API בהמשך).
- לכל עבודה נשמרים: `customer_price`, `contractor_fee` (הכנסת הפלטפורמה),
  `advertising_cost` (הוצאה/עבודות-סגורות באותו מקור), `payment_fee`,
  `refunds`, `discounts` ⇒ `gross_profit` פר עבודה.
- `/hq/economics`: Spend, Leads, CPL, Closed, Conversion, CPA, הכנסות קבלנים,
  Gross Profit, Profit/Job — גם פר מקור/קמפיין.
- `/hq` (Dashboard בעלים): מספרי היום — לידים, נסגרו, נמכרו, Revenue,
  Ad Spend, Gross Profit, רווח ממוצע לעבודה + עבודות ממתינות, מנקים Online,
  בעיות וביטולים.

## 12. MVP Scope (מה עובד עכשיו מקצה לקצה)

Phase 1 — **הכול פונקציונלי בדמו, עם אותו קוד מנוע שירוץ מול Supabase**:

ליד מה-funnel → CRM (ציון, Pipeline, Follow-ups) → סגירת עבודה (תמחור מוצע,
Upsell, בחירת מודל) → הפצה ב-Waves + מחיר יורד → המנקה רואה ולוקח → חיוב
ארנק → חשיפת פרטי לקוח → התקדמות סטטוסים → הושלם → דירוג לקוח → הכנסה ורווח
ב-Dashboard. בנוסף: ביטולים + Re-Dispatch, תלונות, ניהול מנקים, הגדרות
תמחור/הפצה, כלכלה, מפת ביקוש/היצע לפי עיר, דף גיוס, Reactivation list.

Phase 2 (תשתית מוכנה, לא מחווט): WhatsApp Business API, סליקה אמיתית, Push
אמיתי (Service Worker קיים), מפה גרפית (Google Maps/Mapbox — דורש מפתח),
Gamification מלא, קמפיינים אוטומטיים.

## 13. Folder Structure

```
src/lib/platform/          # Core Engine — טהור, גנרי
  types.ts                 # כל טיפוסי הדומיין
  catalog.ts               # שירותים, ערים+קואורדינטות, verticals
  stateMachine.ts          # מפת המעברים + guard
  leadScore.ts             # HOT/WARM/COLD
  pricing.ts               # Pricing Engine + לוח הוזלות
  dispatch.ts              # זכאות, דירוג, Waves, Urgent
  demoData.ts              # Seed לדמו
  store.ts                 # Demo Adapter + פעולות + React hook
  db/adapter.ts            # PlatformDB interface
  db/supabase.ts           # Supabase Adapter (env keys ⇒ פעיל)
  integrations.ts          # WhatsApp / Payments / Maps / Push adapters
src/app/clean/             # אתר לקוח + funnel + review
src/app/pro/               # אפליקציית מנקים + join
src/app/hq/                # CRM + Admin
supabase/platform-schema.sql
supabase/platform-seed.sql
```

## 14. Security Model

- **Supabase Auth** לכל התפקידים; `platform_users.role` הוא מקור האמת.
- **RLS על כל טבלה**: מנקה קורא רק עבודות שהוצעו לו (ורק שדות מוסתרים —
  view `jobs_marketplace` בלי פרטי לקוח) או שנלקחו על ידו; נציג לא קורא
  `pricing_rules`/`ad_spend`; לקוח לא קורא כלום מלבד הביקורת שלו.
- **Server-side validation**: כל פעולה כספית/סטטוס עוברת RPC (SECURITY
  DEFINER) שבודק הרשאות ותקינות — לא סומכים על הקליינט.
- **Audit log** לכל פעולה רגישה; Rate limiting ברמת ה-API (Vercel/WAF) על
  ה-funnel נגד ספאם לידים.
- אין מפתחות בקוד: הכול ב-`.env.local` (ראו `.env.example`).

---

## איפה מכניסים מפתחות

| מה | איפה | מה נפתח |
| --- | --- | --- |
| Supabase URL + anon key | `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` + הרצת `supabase/platform-schema.sql` | DB אמיתי, Auth, Realtime במקום דמו |
| WhatsApp Business API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` + מימוש `whatsappAdapter.send()` ב-`integrations.ts` | שליחת Follow-ups/התראות אמיתית |
| סליקה | מפתח הספק + מימוש `paymentsAdapter.charge()` | טעינת ארנק אמיתית |
| מפות | `NEXT_PUBLIC_MAPS_KEY` + מימוש `mapsAdapter` | מפה גרפית ומרחקים מדויקים |
