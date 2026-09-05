# LeadCloser AI — מדריך הפעלה במצב חי (Supabase + WhatsApp)

המדריך הזה לוקח את המערכת מסביבת הדמו למערכת אמיתית: משתמשים, נתונים בענן, והודעות
WhatsApp שנכנסות ויוצאות מהמספר של העסק. סדר הפעולות חשוב. זמן משוער: 45–60 דקות,
רובו המתנה לאישורים של Meta.

---

## שלב 1 — Supabase (10 דקות)

1. פתחו את פרויקט ה-Supabase (זה שכבר משמש את החנות מתאים).
2. **SQL Editor → New query**, הדביקו את כל התוכן של `supabase/leadcloser-schema.sql` ולחצו **Run**.
   הקובץ בטוח להרצה חוזרת. הוא יוצר את כל טבלאות `lc_*`, את פוליסות ה-RLS, את הבאקט `lc-photos`
   ומפעיל Realtime על טבלאות ההודעות.
3. **Authentication → Providers → Email**: ודאו שהרשמה במייל פעילה. אם לא רוצים שכל אחד יירשם,
   בטלו "Enable sign ups" ותצרו משתמשים ידנית ב-**Users → Add user**.
4. **Project Settings → API**: העתיקו שלושה ערכים:
   - `Project URL`
   - `anon public` key
   - `service_role` key (סודי! רק לשרת)

## שלב 2 — פריסה ב-Vercel (10 דקות)

1. vercel.com → **Add New → Project** → המאגר `ANX-` → הענף `claude/leadcloser-ai-saas-o0rsly`.
2. לפני Deploy, ב-**Environment Variables** הוסיפו:

| משתנה | ערך |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `WHATSAPP_VERIFY_TOKEN` | מחרוזת סודית שאתם בוחרים, למשל `lc-verify-8f3k2` |
| `WHATSAPP_APP_SECRET` | App Secret מ-Meta (שלב 3, אפשר להוסיף אחר כך) |
| `ANTHROPIC_API_KEY` | אופציונלי, לניסוח טבעי יותר של הסוכן |

3. **Deploy**. הכתובת שתקבלו נקראת בהמשך `https://<host>`.
   הפריסה הראשונה נבנית מהענף הראשי של המאגר. כדי לפרוס את LeadCloser: **Settings → Environments → Production →
   Branch Tracking** = `claude/leadcloser-ai-saas-o0rsly`, ואז כל push לענף נפרס אוטומטית. אם "Redeploy" מתלונן
   שאין פריסה של הענף, די בקומיט אחד חדש לענף כדי להתחיל את הבנייה הראשונה.
4. כניסה: `https://<host>/lc/login` → **יצירת חשבון** → onboarding בשבעה צעדים → **הפעלה**.
   עד שהעסק מופעל, ה-webhook מתעלם מהודעות שלו.

## שלב 3 — WhatsApp Cloud API של Meta (30 דקות + אישורים)

**מה צריך לפני:** חשבון Facebook, Meta Business Portfolio, ומספר טלפון לעסק שיכול לקבל SMS/שיחה לאימות.
המספר **לא יכול** להיות פעיל כרגע באפליקציית WhatsApp / WhatsApp Business בטלפון. אם זה המספר שלכם,
מחקו את החשבון באפליקציה (הגדרות → חשבון → מחיקת חשבון) ורק אז המשיכו. מספר חדש (SIM נוסף או מספר וירטואלי) פשוט יותר.

1. **developers.facebook.com → My Apps → Create App** → סוג **Business** → בחרו את ה-Business Portfolio.
2. בלוח האפליקציה: **Add product → WhatsApp → Set up**. נוצר WhatsApp Business Account (WABA) ומספר בדיקה.
3. **WhatsApp → API Setup**:
   - **Add phone number** → הזינו את מספר העסק, אמתו ב-SMS.
   - העתיקו את **Phone number ID** ואת **WhatsApp Business Account ID**.
4. **טוקן קבוע** (הטוקן בדף API Setup פג תוך 24 שעות, לא להשתמש בו):
   - business.facebook.com → **Settings → Users → System users → Add** (Admin).
   - **Assign assets** → האפליקציה שלכם (Full control) → וגם ה-WhatsApp Account.
   - **Generate new token** → בחרו את האפליקציה → הרשאות `whatsapp_business_messaging`, `whatsapp_business_management` → **Never expire**.
   - העתיקו את הטוקן. הוא מוצג פעם אחת.
5. **Webhook**: בלוח האפליקציה **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://<host>/api/lc/whatsapp/webhook`
   - Verify token: הערך של `WHATSAPP_VERIFY_TOKEN` מ-Vercel
   - **Verify and save**. אם נכשל: בדקו שה-deploy ב-Vercel כולל את המשתנה (אחרי הוספת משתנה צריך Redeploy).
   - **Manage → messages → Subscribe**.
6. **App Secret**: **App settings → Basic → App secret → Show** → הדביקו ב-Vercel כ-`WHATSAPP_APP_SECRET` → Redeploy.
   בלי זה ה-webhook עובד אבל לא מאמת חתימות.
7. **הזנת הפרטים ב-LeadCloser**: `https://<host>/lc/settings` → כרטיס **WhatsApp Business → חיבור WhatsApp**:
   הדביקו Phone number ID, WABA ID והטוקן הקבוע → **בדיקת חיבור** (המערכת קוראת ל-Graph API ומציגה את המספר והשם המאומת) → **שמירה**.

**בדיקה:** שלחו הודעה מהטלפון הפרטי למספר העסק, למשל "כמה עולה ניקוי ספה פינתית?". תוך שניות:
תשובת הסוכן מגיעה לוואטסאפ, וב-`/lc/inbox` נפתחת שיחה חדשה עם הליד. בשלב ה-Development של האפליקציה
Meta מאפשרת לשלוח רק למספרים שנוספו ב-**API Setup → To** (עד 5). כדי לשלוח לכל לקוח יש להעביר את
האפליקציה ל-**Live** ולאמת את העסק (Business verification), תהליך של יום-יומיים.

## שלב 4 — תבניות הודעה (חובה לתזכורות ולמעקבים)

WhatsApp מאפשר לעסק לשלוח טקסט חופשי רק בתוך **24 שעות** מההודעה האחרונה של הלקוח. תשובות הסוכן
בשיחה חיה תמיד בתוך החלון. תזכורת 24 שעות לפני, מעקב אחרי 24 שעות ו-3 ימים, בקשת ביקורת ומעקב
30 יום — מחוץ לחלון, ודורשים **תבנית מאושרת**.

1. **WhatsApp Manager → Message templates → Create template** → קטגוריה **Utility** (תזכורות/אישורים) או **Marketing** (מעקבים/הצעות).
2. שפה: עברית (ובנוסף רוסית/אנגלית אם הסוכן מדבר בהן). גוף התבנית: פרמטר אחד בלבד, `{{1}}`.
   דוגמה בשם `lc_reminder`:
   > `{{1}}`
   Meta לפעמים דוחה תבנית שהיא רק פרמטר. במקרה כזה: `הודעה מ-הפתרון המבריק: {{1}}`.
3. אחרי אישור: `/lc/automations` → עריכת האוטומציה → שדה **תבנית WhatsApp מאושרת** → שם התבנית.
   הטקסט של האוטומציה נשלח כפרמטר `{{1}}`.

בלי תבנית, הודעה מחוץ לחלון לא נשלחת, והמערכת מציגה על זה הודעת שגיאה במסך (ולא שולחת שום דבר בטעות).

## שלב 5 — מעבר ל-Live ב-Meta

1. **App settings → Basic**: מלאו Privacy policy URL (אפשר דף פשוט באתר) ו-App icon.
2. **Business verification** ב-Business Settings → Security Center. נדרש מסמך של העסק.
3. **App Mode → Live**. מרגע זה כל מספר יכול לכתוב לעסק.
4. **Display name** של המספר מאושר אוטומטית ברוב המקרים.

## עלויות

- Supabase: תוכנית חינמית מספיקה לעשרות עסקים קטנים.
- Vercel: חינם לפרויקט אחד.
- WhatsApp: 1,000 שיחות שירות (לקוח פותח) בחודש בחינם, אחר כך אגורות בודדות לשיחה. הודעות Utility/Marketing
  יוזמות מתומחרות בנפרד לפי מדינה (ישראל בסביבות 0.05–0.07 $ להודעת Utility). הכל בחיוב ישיר ל-Meta.

## פתרון תקלות

| תופעה | סיבה נפוצה | פתרון |
| --- | --- | --- |
| Verify and save נכשל | המשתנה לא ב-deploy | Redeploy ב-Vercel ובדקו `GET https://<host>/api/lc/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=1` מחזיר `1` |
| הודעה נכנסת לא מופיעה | העסק לא מופעל / Phone number ID לא תואם / מנוי messages לא סומן | ודאו "הסוכן פעיל" בסיידבר; השוו את ה-ID בהגדרות; Webhook → Manage → messages |
| הסוכן ענה אבל הלקוח לא קיבל | האפליקציה ב-Development והמספר לא ברשימת To | הוסיפו את המספר או עברו ל-Live |
| `(#131030) Recipient phone number not in allowed list` | כמו למעלה | כמו למעלה |
| `(#100) ... template name does not exist` | שם התבנית שגוי או לא אושר | בדקו ב-Message templates |
| הודעות מגיעות רק אחרי רענון | Realtime לא פעיל | הריצו שוב את ה-SQL (הבלוק `supabase_realtime`) |

## מה המערכת עושה מאחורי הקלעים

- `POST /api/lc/whatsapp/webhook` מקבל את ההודעה, מוצא את העסק לפי `phone_number_id`, ממשיך שיחה
  פתוחה של אותו מספר (עד 30 יום) או פותח ליד חדש, מריץ את מנוע הסוכן, שומר הכל ב-Supabase ושולח
  את התשובה דרך Graph API. תמונות נשמרות בבאקט `lc-photos` ומופיעות בשיחה ובעבודה.
- כשאתם עונים מה-Inbox או כשאוטומציה יוצאת, הדפדפן קורא ל-`POST /api/lc/whatsapp/send` עם ה-JWT שלכם;
  השרת מאמת חברות בעסק, בודק את חלון ה-24 שעות, ושולח טקסט או תבנית.
- הטוקן של Meta נשמר בטבלת `lc_integrations` המוגנת ב-RLS ומשומש רק בצד השרת.
