# מודול פרסום לפייסבוק — `/social`

מערכת ניהול ופרסום תוכן ל"הפתרון המבריק": מכינים פוסט פעם אחת, מאשרים גרסאות,
בוחרים יעדים, והמערכת מפרסמת אוטומטית את כל מה ש-Meta מאפשרת דרך ה-API
הרשמי — ומכינה ערכת פרסום ידני לכל השאר.

## 1. מה Meta מאפשרת היום (נבדק ספטמבר 2026)

| יעד | אוטומטי דרך Graph API? | מה המערכת עושה |
| --- | --- | --- |
| **דף פייסבוק** שאתם מנהלים (תפקיד עם `CREATE_CONTENT`) | **כן** — `POST /{page-id}/feed`, `/photos`, `/videos` עם Page Access Token והרשאת `pages_manage_posts` | מפרסמת טקסט, קישור, תמונה אחת, כמה תמונות (`attached_media`), סרטון (`file_url`); כפתור CTA כ-best-effort |
| **קבוצת פייסבוק** (כל קבוצה, גם כזו שאתם מנהלים) | **לא דרך API** — Meta מחקה את Groups API ואת ההרשאה `publish_to_groups` ב-22.4.2024 | **שלב 2:** worker מקומי (Playwright) שמפרסם מהדפדפן שלכם, בחשבון שלכם, בקצב שמרני. ראו §9 |
| **פרופיל אישי** | לא (הוסר ב-2018) | לא נתמך |
| **Instagram Business** | כן, דרך Instagram Graph API (מודול נפרד) | מוכן כ-`channel = 'instagram'` בסכמה וב-registry, עדיין ללא adapter |

עובדות נוספות שהמערכת מתבססת עליהן:

- הרשאות מינימליות: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
  אפליקציה במצב Development מאפשרת אותן למי שיש לו תפקיד באפליקציה (Admin/Developer/Tester)
  בלי App Review — מספיק לעסק אחד. לשימוש ציבורי נדרש App Review.
- Page Access Token שנגזר מ-User Token ארוך-טווח (60 יום) **לא פג** מעצמו. המערכת שומרת
  את שניהם מוצפנים ומציגה תאריך תפוגה.
- Rate limits: Pages API מוגבל ל-`4800 × מספר משתמשים מעורבים` קריאות ב-24 שעות; קודי
  שגיאה 4 / 17 / 32 / 613 = האטה. המערכת קוראת גם את ה-headers
  `X-App-Usage` / `X-Business-Use-Case-Usage` ומשהה את התור כשהשימוש עובר 85%.
- קוד 506 = Meta זיהתה פוסט כפול (הפריט מסומן Skipped). קוד 368 = חסימה זמנית על
  ספאם (התור מושהה ל-24 שעות).
- תזמון native של Meta (`scheduled_publish_time`, 10 דק׳–30 יום) **לא** בשימוש: התור
  הפנימי נותן מרווחים, מכסות, מניעת כפילות ועצירה בלחיצה — דברים ש-Meta לא נותנת.

**מה המערכת לא עושה, בכוונה:** לא עוקפת CAPTCHA / Checkpoint / 2FA / חסימות, לא
משתמשת ב-stealth או בזיוף user-agent, לא מייבאת/מייצאת cookies, ולא שומרת סיסמת
Facebook. דפים = Graph API רשמי עם `appsecret_proof`; קבוצות = הדפדפן האמיתי שלכם
(§9), וכל מסך אבטחה של Facebook עוצר את המערכת ומחזיר אתכם לטפל בו ידנית.

> **שקיפות:** תנאי השימוש של Meta אוסרים גישה אוטומטית ללא אישור. הפרסום לקבוצות
> דרך הדפדפן הוא על אחריות בעל החשבון; Facebook עלולה להגביל את החשבון או להסיר
> פוסטים גם בקצב שמרני. לכן ברירות המחדל הן TEST MODE + אישור ידני + קבוצה אחת.

## 2. Architecture

```
 דפדפן (admin, RLS)                    Next.js server (route handlers)              Meta
 ───────────────────                    ────────────────────────────────            ────
 /social/*  ── supabase-js ──▶ Postgres (social_*)                                  
     │                              ▲                                               
     │ Bearer <supabase JWT>        │ service role                                   
     └──▶ /api/social/facebook/connect ─── state cookie (HMAC) ───▶ Facebook Login  
          /api/social/facebook/callback ◀── code ──── exchange ─────▶ /oauth/access_token
          /api/social/targets/sync      ─── /me/permissions, /me/accounts ─────────▶
          /api/social/run               ─┐                                          
 GitHub Actions ─▶ /api/social/cron     ─┴─▶ worker ─▶ planner ─▶ queue ─▶ channel adapter ─▶ /{page}/feed
          /api/social/facebook/revoke   ─── DELETE /me/permissions ───────────────▶
```

שכבות (`src/lib/social/`):

| קובץ | תפקיד |
| --- | --- |
| `types.ts`, `compose.ts`, `time.ts`, `slots.ts` | טיפוסים, בניית טקסט הפוסט (טלפון + WhatsApp בסוף), אזור זמן Asia/Jerusalem כולל DST, חישוב מועדי תזמון (טהור, נבדק) |
| `client.ts` | גישה לנתונים מהדפדפן דרך RLS + `callSocialApi()` |
| `server/crypto.ts` | AES-256-GCM לטוקנים, HMAC ל-state |
| `server/db.ts` | לקוח service-role, קריאה/כתיבה של `social_secrets` |
| `server/graph.ts` | לקוח Graph API: appsecret_proof, מיפוי שגיאות, headers של rate limit → cooldown |
| `server/oauth.ts`, `server/sync.ts` | state/CSRF, סנכרון דפים והרשאות, ניתוק |
| `server/planner.ts` | הופך תזמונים לשורות תור (idempotent, רוטציית גרסאות A→B→C→D) |
| `server/worker.ts` | מריץ את התור: claim אטומי, מניעת ספאם, פרסום דרך adapter, לוג |
| `channels/*` | `ChannelAdapter` — `facebookPage` (API), `manualGroup` (ידני); Instagram נכנס כאן |

## 3. מבנה DB (`supabase/social-schema.sql`)

| טבלה | מה יש בה |
| --- | --- |
| `social_accounts` | חשבון Meta מחובר: שם, מזהה, הרשאות שאושרו/נדחו, תפוגת טוקן. **בלי טוקן** |
| `social_secrets` | הטוקנים המוצפנים (`owner_kind` = account/target). **אין policies** → רק service role |
| `social_targets` | יעדים: `channel`, `external_id`, שם, `tasks`, `permission_status`, `can_api_publish`, `enabled` |
| `social_campaigns` | קמפיין: שם, שירות, עיר, שפה |
| `social_posts` | פוסט: טקסט בסיסי, קישור, CTA, טלפון, WhatsApp, `media` (jsonb), סטטוס |
| `social_variants` | גרסאות A/B/C/D: טקסט, שפה, `approval` (pending/approved/rejected) |
| `social_schedules` | תזמון: now / once / weekly (`{"0":["09:00"]}`) / interval (כל N ימים), `target_ids[]` |
| `social_queue` | הפרסומים עצמם: `scheduled_at`, סטטוס (Scheduled/Publishing/Published/Failed/Skipped/manual_pending), `dedupe_hash`, `rendered_text`, `permalink`, `error` |
| `social_activity_log` | יומן פעילות (עובר scrub — טוקנים לעולם לא נכתבים) |
| `social_settings` | `limits` (מכסות/מרווח/כפילות), `control` (paused, cooldown), `business` |

RLS: כל הטבלאות פתוחות רק ל-`authenticated` (המנהל). Storage bucket `social-media`
ציבורי לקריאה (Meta מושכת מדיה לפי URL), כתיבה רק למנהל.

## 4. Flow ההתחברות (Facebook Login / OAuth)

1. המנהל (מחובר ל-Supabase Auth) לוחץ "התחבר עם פייסבוק". הדפדפן קורא
   `POST /api/social/facebook/connect` עם ה-JWT שלו.
2. השרת מאמת את ה-JWT, מייצר `state` אקראי, חותם עליו (HMAC) ושומר ב-cookie
   `httpOnly` (10 דק׳), ומחזיר את כתובת ה-dialog עם `scope` המינימלי.
3. Meta מחזירה ל-`/api/social/facebook/callback?code&state`. השרת משווה `state`
   ל-cookie (CSRF), מחליף `code` → User Token קצר → **User Token ארוך (60 יום)**.
4. השרת קורא `/me`, שומר את החשבון ואת הטוקן **מוצפן** ב-`social_secrets`, ואז
   `/me/permissions` + `/me/accounts` → כל דף נכנס ל-`social_targets` עם ה-Page Token
   שלו (מוצפן, בנפרד). `can_api_publish = true` רק אם `pages_manage_posts` אושר
   **וגם** ל-Page יש task `CREATE_CONTENT`.
5. חזרה ל-`/social/targets?connect=ok`. שום טוקן לא עובר בדפדפן.
6. **ניתוק**: `POST /api/social/facebook/revoke` → `DELETE /me/permissions` אצל Meta,
   מחיקת כל השורות ב-`social_secrets`, סימון היעדים כ-`revoked`.

## 5. מניעת ספאם (ב-worker, לכל פריט לפני פרסום)

- `paused` → כלום לא יוצא. `rateLimitedUntil` → ממתינים.
- מכסה יומית כללית ולכל יעד (יום לפי Asia/Jerusalem) → Skipped עם סיבה.
- מרווח מינימלי מהפרסום האחרון → הפריט **נדחה** (לא נמחק) לזמן המתאים.
- `dedupe_hash` (יעד + טקסט מנורמל + מדיה) שכבר פורסם ב-N ימים → Skipped.
- Meta 506 (כפול) → Skipped; 4/17/32/613 → דחייה + cooldown; 368 → השהיה 24 שעות.
- "עצור הכל" בלוח הבקרה: `paused = true` + ביטול כל ה-Scheduled.

## 6. הקמה

1. הריצו `supabase/social-schema.sql` ב-SQL Editor (בטוח להרצה חוזרת).
2. ב-[developers.facebook.com](https://developers.facebook.com) צרו אפליקציה מסוג
   **Business**, הוסיפו את מוצר **Facebook Login for Business** (או Facebook Login),
   וב-*Valid OAuth Redirect URIs* הכניסו `https://<הדומיין>/api/social/facebook/callback`.
   הוסיפו את המשתמש שלכם כ-Admin של האפליקציה.
3. משתני סביבה (ראו `.env.example`): `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SOCIAL_ENCRYPTION_KEY`, `SOCIAL_CRON_SECRET`
   (ואופציונלית `FACEBOOK_REDIRECT_URI`, `FACEBOOK_GRAPH_VERSION`).
4. טיקר: ב-GitHub → Settings → Secrets הוסיפו `SOCIAL_APP_URL` ו-`SOCIAL_CRON_SECRET`,
   וב-Variables הגדירו `SOCIAL_CRON_ENABLED = true`. ה-workflow
   `.github/workflows/social-cron.yml` קורא ל-`/api/social/cron` כל 5 דקות.
   (חלופה: Vercel Cron ב-Pro; ב-Hobby מותר פעם ביום בלבד.)
5. היכנסו ל-`/social` (אותו משתמש כמו `/crm`), **יעדים → התחבר עם פייסבוק**.

## 7. שגרת בוקר

1. **פוסט חדש** → קמפיין ("ניקוי ספות באר שבע"), טקסט, תמונות.
2. **צור 4 גרסאות** (קצר / מכירתי / אישי / לעיר) → עריכה → **אשר** רק מה שטוב.
3. סימון היעדים (דפים = אוטומטי, קבוצות = ידני) → **פרסם עכשיו** או תזמון.
4. בלוח הבקרה: הפרסום הבא, מה פורסם, מה נכשל, ומה ממתין לפרסום ידני — עם ערכה מוכנה.

## 8. הרחבה עתידית (Instagram וערוצים נוספים)

1. `channels/instagram.ts` שמממש `ChannelAdapter` (יצירת container ב-`/{ig-user-id}/media`
   ואז `media_publish`).
2. רישום ב-`channels/registry.ts`.
3. ב-`sync.ts`: לכל דף, `GET /{page-id}?fields=instagram_business_account` → שורת
   `social_targets` עם `channel = 'instagram'`.
4. הרשאות: `instagram_basic`, `instagram_content_publish`.
   התור, התזמון, מניעת הספאם וה-UI לא משתנים.

## 9. שלב 2 — קבוצות פייסבוק דרך worker מקומי (Playwright)

### ארכיטקטורה

```
 Web App (Vercel)  ──▶  Supabase queue (social_queue, social_workers, social_worker_commands)
                                   ▲                         │
                                   │ heartbeat / status      │ jobs + commands (login / check / logout / resume)
                                   │                         ▼
                        Dedicated Browser Worker — המחשב שלכם: `npm run social-worker`
                                   │
                                   ▼
                     Playwright (playwright-core) + פרופיל Chrome מתמיד (~/.hapitaron-social/facebook-profile)
                                   │
                                   ▼
                              facebook.com/groups/…
```

- **למה לא ב-Vercel / GitHub Actions?** serverless ו-CI אינם מתאימים ל-session מתמיד של
  דפדפן (אין דיסק קבוע, אין חלון להתחברות ידנית, זמן ריצה מוגבל). לכן ה-worker רץ
  על המחשב שלכם (או VPS עם desktop), וה-Dashboard מדבר איתו רק דרך Supabase.
- **דפים** ממשיכים לעבוד בדיוק כמו קודם (Graph API, `src/lib/social/server/worker.ts`).
  אותו תור, אותן מכסות, אותו מרווח — `src/lib/social/rules.ts` משותף לשניהם.
- **קבצי ה-worker** (`worker/`):

| קובץ | תפקיד |
| --- | --- |
| `social-worker.ts` | הלולאה: heartbeat, פקודות מהלוח, claim אטומי של עבודות `facebook_group`, תוצאות ולוג |
| `adapters/facebookGroupBrowser.ts` | `FacebookGroupBrowserAdapter` — group URL + טקסט + מדיה + campaign/variant → תוצאה |
| `facebook/composer.ts` | הכוריאוגרפיה: פתיחת קבוצה → composer → טקסט → העלאת מדיה → (אישור) → Publish → אימות |
| `facebook/selectors.ts` | **כל** ה-DOM של Facebook במקום אחד: roles, accessible names (EN/HE/RU), text, fallbacks |
| `facebook/session.ts` | פרופיל Chrome מתמיד, זיהוי login/checkpoint, התחברות ידנית, ניתוק |
| `media.ts`, `screenshots.ts`, `db.ts`, `env.ts` | הורדת מדיה מה-Storage לקבצים זמניים, צילומי תקלה ל-bucket פרטי, Supabase, env |
| `test/composer.test.ts` + `test/mock-group.html` | בדיקה מקומית של הכוריאוגרפיה מול דף שמחקה את Facebook |

### מצבי תור (social_queue)

`status`: Scheduled → Publishing → Published / Failed / Skipped, ובנוסף
**awaiting_confirmation** (ממתין לאישור שלכם לפני הלחיצה הסופית),
**needs_attention** (Facebook דרש פעולה ידנית / כישלון אחרי לחיצה על Publish — לא
מנסים שוב אוטומטית כדי לא לפרסם פעמיים), **paused**.
`step` (רק לקבוצות): pending → opening → composer_opened → uploading_media →
ready_to_publish → publishing → verifying → published.

### אבטחה

- ה-session של Facebook = פרופיל Chrome בתיקייה מקומית מחוץ ל-repo. אין storageState
  ב-Git, ב-Supabase או בלוגים (`.gitignore` מעודכן; `db.ts` מסנן cookies/tokens מהלוג).
- ה-worker מתחבר ל-Supabase כמשתמש ה-admin (אימייל+סיסמה של Supabase, לא של Facebook)
  ולכן כפוף ל-RLS. אין service-role key על המחשב.
- צילומי מסך של תקלות נשמרים ב-bucket **פרטי** `social-debug` ונפתחים רק בקישור חתום
  ל-10 דקות.
- "נתק" מוחק את הפרופיל המקומי כולו.

### התקנה והפעלה (פעם אחת)

1. הריצו `supabase/social-schema-v2.sql` ב-SQL Editor (אחרי `social-schema.sql`).
2. במחשב שמריץ את ה-worker: `git clone`, `npm install`, ו-`.env.local` עם
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SOCIAL_WORKER_EMAIL`,
   `SOCIAL_WORKER_PASSWORD` (משתמש ה-Supabase שפותח את /crm).
3. Google Chrome מותקן (ברירת מחדל `SOCIAL_BROWSER_CHANNEL=chrome`). בלי Chrome:
   `npx playwright-core install chromium` ו-`SOCIAL_BROWSER_CHANNEL=chromium`.
4. `npm run social-worker` — משאירים את הטרמינל פתוח. בלוח הבקרה כרטיס
   **Facebook Browser** יראה 🟢/🟡/🔴.
5. בלוח הבקרה: **התחבר לפייסבוק** → נפתח חלון Chrome אמיתי על המחשב → מתחברים בעצמכם
   (כולל 2FA אם יש) → הכרטיס עובר ל-🟢 מחובר. **בדוק חיבור** בודק בלי לגעת בכלום;
   **נתק** מוחק את הפרופיל.

### הפעלה יומיומית (Windows)

**`start-worker.cmd`** — זה הקובץ לשימוש יומיומי כשהלוח רץ בענן (Vercel). הוא מפעיל
רק את ה-worker, בחלון אחד. אם הוא נופל, הוא עולה מחדש לבד אחרי 10 שניות; אם הוא
נופל חמש פעמים ברצף מיד אחרי ההפעלה, הוא עוצר ואומר מה לבדוק במקום להיתקע בלולאה.
בהרצה ראשונה הוא מתקין תלויות לבד.

**`start-social.cmd`** — לפיתוח מקומי בלבד: מפעיל גם `next dev` וגם את ה-worker,
ופותח `localhost:3000/social`. אין צורך בו כשעובדים מול הכתובת בענן.

**`update-social.cmd`** מושך את הגרסה האחרונה של הקוד ומתקין תלויות.

**`install-shortcut.cmd`** — להריץ פעם אחת. יוצר סמל על שולחן העבודה בשם
"הפתרון המבריק - פרסום" עם אייקון של המערכת, ושואל אם להוסיף גם הפעלה אוטומטית
עם ההדלקה של המחשב. מהרגע הזה ההפעלה היומיומית היא לחיצה כפולה על הסמל.

### בדיקה ראשונה (TEST MODE — ברירת מחדל)

1. **קבוצות** → הוסיפו קישור לקבוצה אחת שמותר לכם לפרסם בה.
2. **פוסט חדש** → טקסט + תמונה → בחרו את הקבוצה (TEST MODE מאפשר אחת בלבד) →
   **🚀 התחל פרסום**.
3. ה-worker (במצב Debug, חלון גלוי) פותח את הקבוצה, מכניס טקסט, מעלה תמונה, ועוצר
   ב-**ready_to_publish**. בלוח הבקרה מופיע צילום מסך + **אשר פרסום** / **בטל**.
4. אחרי "אשר פרסום" הוא לוחץ Publish, מאמת בפיד, והשורה עוברת ל-✅ Published.
5. עבר? **הגדרות → Browser Automation**: כבו TEST MODE (ואם תרצו גם את האישור הידני
   ואת Debug Mode).

### Checkpoint / CAPTCHA / 2FA / חסימה

ה-worker לא מנסה לעקוף. הוא מסמן את העבודה `needs_attention`, שומר צילום מסך, מעדכן
את הכרטיס ל-🟡 "Facebook דורש פעולה ידנית", ולא מתחיל עבודות חדשות. אתם פותחים את
החלון (או "התחבר לפייסבוק"), מטפלים, ואז **בדוק שוב** → **המשך קמפיין** (מחזיר את
העבודות שסומנו לתור).

### Stop / Pause

- **Pause / Resume / Stop** לכל קמפיין (בקמפיינים ובלוח "פרסום בזמן אמת").
- **עצור הכל** (לוח בקרה): `paused=true` + ביטול כל מה שממתין. עבודה שכבר רצה מסתיימת
  בבטחה (ה-worker בודק את ההשהיה רק בין עבודות).

### קצב (ברירות מחדל שמרניות)

`limits`: 6 ביום, 2 ליעד ביום, 45 דק׳ מרווח, כפילות 14 יום.
`browser`: קבוצות מקבלות +20 דק׳ מרווח, 8 לקמפיין ביום, עבודה אחת במקביל.
כפילות: אותו פוסט לאותה קבוצה לא יוצא פעמיים (גם לא ב-retry), ובנוסף hash של
טקסט+מדיה+יעד.

### הפצה להרבה קבוצות (drip)

מצב תזמון **"הפצה הדרגתית"** נותן לכל קבוצה שעה משלה: הראשונה בשעת ההתחלה,
ואחריה קבוצה כל X דקות (ברירת מחדל 20), עד המכסה היומית (0 = ללא) או סוף חלון
השעות; השאר ממשיך מחר. המכסות בהגדרות → מניעת ספאם עדיין חלות — לפני הפצה גדולה
העלו שם את "מקסימום פרסומים ביום". דורש `social-schema-v3.sql` + `v6.sql`.
המלצה: 6–8 קבוצות ביום, 4 גרסאות מאושרות עם "Distribute variants", ואותה קבוצה
לא יותר מפעם בשבוע-שבועיים. בקבוצות מוסיפים הרבה קישורים בבת אחת דרך
"הוספה של הרבה קבוצות בבת אחת".

### שם ותמונה של קבוצות

קבוצה שהודבקה מקבלת מה-worker, כשהוא פנוי, את השם והתמונה שלה מפייסבוק (ביקור
קריאה בלבד, 2 קבוצות בכל סבב). התמונה נשמרת ב-Storage שלנו כי קישורי ה-CDN של
פייסבוק פגים. "רענן שם ותמונה" במסך הקבוצות מבקש משיכה מחדש. דורש
`supabase/social-schema-v4.sql`.

### מהאייפון (Vercel + אפליקציית מסך בית)

הלוח יושב באינטרנט (Vercel, חינם); ה-worker נשאר על המחשב בבית עם ההתחברות
לפייסבוק, ושניהם מדברים דרך Supabase.

1. vercel.com → Sign up with GitHub → **Add New → Project** → בוחרים `ANX-` →
   Branch: `claude/facebook-content-manager-gqtv66` (או main אחרי מיזוג).
2. **Environment Variables**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SOCIAL_ENCRYPTION_KEY`, `SOCIAL_CRON_SECRET` (אותם ערכים
   כמו ב-`.env.local`; **לא** את `SOCIAL_WORKER_*`, הם רק למחשב). **Deploy**.
3. באייפון, Safari → `https://<הכתובת>.vercel.app/social` → כניסה → כפתור שיתוף →
   **הוספה למסך הבית**. נפתח כאפליקציה בשם "פרסום" עם ניווט תחתון.
4. ה-worker במחשב ממשיך כרגיל (`start-worker.cmd`); הלוח בטלפון מראה את המצב שלו
   בזמן אמת, מאשר פרסומים, מוסיף קבוצות ומתחיל הפצות.

### הפעלה אוטומטית עם Windows

`install-shortcut.cmd` מציע את זה בסוף ההתקנה. ידנית: Win+R → `shell:startup` →
Enter → לגרור לשם קיצור דרך ל-`start-worker.cmd`. לביטול — למחוק את הסמל מאותה
תיקייה. בכל מקרה המחשב צריך להישאר דלוק (לא במצב שינה) בשעות ההפצה.

## 10. שדרוג SaaS — שלב P0 (ספטמבר 2026)

דורש `supabase/social-schema-v7.sql`.

| מה | איפה |
| --- | --- |
| לוח בקרה: 8 אריחים, פעולות מהירות, 5 הפרסומים הקרובים, יומן פעילות עם אייקונים | `src/app/social/page.tsx`, `components/social/{QuickActions,ActivityFeed}.tsx` |
| התקדמות קמפיין (הושלמו X מתוך Y + פילוח) | `components/social/CampaignProgressBar.tsx`, `client.ts → campaignProgress()` |
| תור פרסום ידני ("קבוצה 7 מתוך 32", סמן ← הבא) | `src/app/social/manual/[id]/page.tsx`, `client.ts → manualQueue()` |
| מועדפים + קטגוריה לקבוצות, "הפרסום הבא" לכל קבוצה | `src/app/social/groups/page.tsx` |
| שגיאות בשפה אנושית (כותרת, מה לעשות, האם לנסות שוב) | `components/social/ErrorDetail.tsx` |
| פעמון התראות עם מונה לא-נקראו (per-device ב-localStorage) | `components/social/NotificationBell.tsx` |
| תפריט "עוד" במובייל, אריחים קומפקטיים | `components/social/SocialShell.tsx`, `ui.tsx` |
| שכפול פוסט (כולל גרסאות) ושכפול קמפיין | `client.ts → duplicatePost/duplicateCampaign` |
| היסטוריה: עמודות קמפיין ושיטה, טווחי תאריך מהירים | `src/app/social/history/page.tsx` |

**מה עוד לא נבנה** (ומסומן ככזה, לא כמוכן): אשף יצירת פוסט בשלבים, לוח שנה
עם גרירה, מסך Analytics, Onboarding למשתמש חדש, ותשתית AI. הערוצים
Instagram/LinkedIn/Telegram **אינם** מוצגים כזמינים — יש רק ממשק
`ChannelAdapter` שמאפשר להוסיף אותם.

### כש-Facebook משנה ממשק

הכל ב-`worker/facebook/selectors.ts`. הריצו `npx tsx worker/test/composer.test.ts`
אחרי כל שינוי; הלוג ב-Dashboard מציין באיזה שלב נפל וצילום המסך מראה מה היה במסך.

## 11. ספריית תוכן (`/social/library`)

דורש `supabase/social-schema-v8.sql`. הריצו `supabase/social-schema-v8.sql`
ב-SQL Editor (אחרי v7, בטוח להרצה חוזרת). בלי זה הספרייה עדיין עובדת אבל בלי
קטגוריות, וניסיון ליצור קטגוריה יחזיר "מבנה הנתונים לא מעודכן".

הספרייה **מחליפה** את "פוסטים" בתפריט. היא לא טבלה חדשה ולא מודל פוסט שני — זו
תצוגה על `social_posts`, אותה שורה שהעורך ב-`/social/posts/[id]` עורך. מה שנוסף:

| מה | איפה |
| --- | --- |
| רשת כרטיסים עם המדיה כנושא, חיפוש, סינון, מיון ובחירה מרובה | `src/app/social/library/page.tsx`, `components/social/ContentCard.tsx` |
| קטגוריות תוכן של הבעלים (יצירה, שינוי שם, מחיקה) | `social_content_categories` + `social_posts.category_id`, `lib/social/library.ts` |
| "פורסם X פעמים ב-Y קבוצות, אחרון בתאריך" | נספר מ-`social_queue` בקריאה אחת (`postUsage()`), בלי עמודת מונה שיכולה להיות לא נכונה |
| פרסום מהיר: קבוצות, שעה, מרווח, תצוגת לוח הזמנים ואישור | `components/social/QuickPublishSheet.tsx`, `library.ts → quickPublish()` |

**קטגוריה = שתי משמעויות שונות.** "קטגוריית תוכן" כאן מתארת פוסטים;
"קטגוריית קבוצה" במסך הקבוצות (v7, `social_targets.category`) מתארת קבוצות.
שני שדות שונים, ובכוונה לא מאוחדים.

**הפרסום המהיר לא בונה מתזמן שני.** הוא הולך באותו מסלול של העורך:
`savePost(status:'ready')` → `hasPendingQueue()` → `applyGapSettings(gap)` →
`createSchedule()` → `/api/social/run`. תצוגת לוח הזמנים מחושבת ב-`dripSlots()`
מ-`lib/social/slots.ts` — אותה פונקציה שהמתזמן עצמו (`plan.ts → planDrip`) מריץ,
מאותו draft — כך שמה שרואים הוא מה שייווצר בתור.

**המרווח הוא הגדרה גלובלית.** `applyGapSettings()` כותב את
`limits.minGapMinutes` ואת `browser.groupMinGapMinutes` כך ש-`rules.ts` ידרוש
בדיוק את המספר שנבחר. בלי זה כל שורה נדחית שוב ושוב ואחרי 40 ניסיונות מדולגת.
המרווח חל על כל החשבון — לא על פרסום אחד. אם התוספת לקבוצות משתנה, המסך אומר זאת
במילים.

**אחרי שהתור נבנה** — שינוי מרווח או הוספת קבוצות נעשים ב"כוונון התור"
(`QueueTunerSheet`), לא בהרצת פרסום מהיר נוסף על אותו פוסט.
