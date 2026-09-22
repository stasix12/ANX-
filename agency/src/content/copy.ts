/**
 * All site copy in one place (Hebrew). Section components read from here so
 * wording changes never require touching markup. Brand/contact values come
 * from src/config/site.ts.
 */

export const nav = {
  skip: 'דילוג לתוכן הראשי',
  logoTagline: 'בניית אתרים וקידום בגוגל לעסקים',
  links: [
    { label: 'שירותים', href: '#services' },
    { label: 'איך זה עובד', href: '#process' },
    { label: 'עבודות', href: '#portfolio' },
    { label: 'חבילות', href: '#pricing' },
    { label: 'שאלות נפוצות', href: '#faq' },
  ],
  cta: 'קבלו הצעה',
  mobileCta: 'קבלו הצעה לאתר',
  mobileWhatsApp: 'דברו איתנו ב-⁠WhatsApp',
  whatsapp: 'WhatsApp',
  menuOpen: 'פתיחת תפריט',
  menuClose: 'סגירת תפריט',
} as const;

export const hero = {
  eyebrow: 'בניית אתרים לעסקים + Google Ads',
  /** The single h1 on the page. "לקוחות" gets the accent underline. */
  h1Start: 'אתרים שבנויים להביא לעסק שלכם',
  h1Accent: 'לקוחות',
  h1End: '.',
  sub: 'בניית אתרים מקצועיים לעסקים עם אפשרות לקידום ממומן בגוגל — משלב האפיון ועד שהלקוחות מתחילים להגיע.',
  ctaPrimary: 'קבלו הצעה לאתר',
  ctaSecondary: 'דברו איתנו ב-⁠WhatsApp',
  reassurance: 'ללא התחייבות. שיחה קצרה, ואחריה הצעה מסודרת.',
  trust: ['מותאם למובייל', 'מותאם לגוגל', 'WhatsApp מובנה', 'בנוי ליצירת לידים'],
  mockupAlt: 'אתר עסקי מודרני מוצג על מחשב נייד ועל טלפון, עם כפתור WhatsApp וטופס יצירת קשר',
} as const;

export const problem = {
  eyebrow: 'למה זה חשוב',
  title: 'האתר שלכם צריך לעשות יותר מלהיראות טוב.',
  intro: 'לקוחות מחפשים את השירות שלכם בגוגל ונכנסים לאתר. יש לכם כמה שניות לגרום להם להבין ארבעה דברים:',
  points: [
    { title: 'מי אתם', text: 'עסק אמיתי, עם שם, פנים ותחום ברור.' },
    { title: 'מה אתם מציעים', text: 'השירות המרכזי, במילים פשוטות, בלי לגלול.' },
    { title: 'למה לבחור בכם', text: 'מה מבדיל אתכם, ולמה אפשר לסמוך עליכם.' },
    { title: 'איך ליצור קשר', text: 'כפתור ברור, WhatsApp או טופס — במרחק לחיצה אחת.' },
  ],
  closing: 'לכן אנחנו בונים את האתר סביב דבר אחד: להפוך מבקרים ללקוחות פוטנציאליים.',
} as const;

export const services = {
  eyebrow: 'השירותים שלנו',
  title: 'שני מסלולים: בניית אתר לעסק, או אתר + קידום ממומן בגוגל.',
  intro: 'מתחילים מאתר שבנוי נכון. מי שרוצה גם תנועה מגוגל — מוסיף קמפיין שמנוהל ונמדד מהיום הראשון.',
  website: {
    title: 'בניית אתר לעסק',
    description: 'אתר מקצועי, מהיר ומותאם למובייל, שבנוי להפוך מבקרים לפניות.',
    features: [
      'אפיון העסק והלקוחות',
      'עיצוב UI/UX מותאם לעסק',
      'התאמה מלאה למובייל',
      'WhatsApp וכפתורי יצירת קשר',
      'SEO בסיסי',
      'מהירות טעינה גבוהה',
      'חיבור Google Analytics',
      'טפסי לידים',
      'אבטחה ו-⁠HTTPS',
      'חיבור דומיין',
      'מבנה שמותאם לפרסום עתידי',
    ],
    cta: 'אני רוצה אתר',
  },
  google: {
    badge: 'מומלץ',
    title: 'אתר + Google Ads לעסקים',
    description: 'כל מה שכלול באתר, ובנוסף קמפיין בגוגל שמביא תנועה רלוונטית ומודד כל פנייה.',
    featuresLead: 'כל מה שכלול בבניית האתר, ובנוסף:',
    features: [
      'הקמת קמפיין Google Ads',
      'מחקר מילות מפתח',
      'כתיבת מודעות',
      'הגדרת Conversion Tracking',
      'הגדרת GA4',
      'Google Tag Manager',
      'אופטימיזציה לקמפיין',
      'מעקב אחרי לידים',
      'שיפור מתמשך של האתר והקמפיין',
    ],
    cta: 'אני רוצה אתר + Google',
  },
  budgetNote: 'תקציב הפרסום בגוגל אינו כלול בדמי הניהול ומשולם ישירות ל-⁠Google.',
  googleWhatsApp: 'שאלות על החבילה? כתבו לנו ב-⁠WhatsApp',
} as const;

export const process = {
  eyebrow: 'התהליך',
  title: 'איך זה עובד',
  intro: 'ארבעה שלבים ברורים. אתם יודעים בכל רגע איפה הפרויקט עומד.',
  steps: [
    {
      n: '01',
      title: 'מכירים את העסק',
      text: 'מבינים מה העסק מוכר, מי הלקוח האידיאלי ומה גורם לו לפנות.',
      needs: 'שיחת היכרות קצרה',
    },
    {
      n: '02',
      title: 'בונים אסטרטגיה',
      text: 'מחליטים איזה מבנה אתר, אילו מסרים ואילו כפתורים יגרמו ליותר אנשים ליצור קשר.',
      needs: 'אישור המבנה והמסרים',
    },
    {
      n: '03',
      title: 'מעצבים ובונים',
      text: 'אתר מהיר, מקצועי ומותאם לכל מסך. אתם רואים את העיצוב ומאשרים לפני הפיתוח.',
      needs: 'לוגו ותמונות אם יש, ואישור העיצוב',
    },
    {
      n: '04',
      title: 'עולים לאוויר',
      text: 'מחברים Analytics, WhatsApp וטפסים, בודקים שהכול עובד ומעלים את האתר לדומיין שלכם.',
      needs: 'גישה לדומיין',
    },
  ],
  googleNoteLead: 'בחרתם גם Google Ads?',
  googleNote: 'במקביל לעלייה לאוויר מקימים את הקמפיין, מחברים מדידת לידים ומתחילים להביא תנועה רלוונטית.',
  needsLabel: 'מה צריך מכם:',
  cta: 'רוצים להתחיל? קבלו הצעה',
} as const;

export const portfolio = {
  eyebrow: 'עבודות',
  title: 'אתרים שבנינו',
  intro: 'פרויקטים נבחרים שבנינו לעסקים. הגלריה מתעדכנת עם כל פרויקט שעולה לאוויר.',
  introEmpty: 'הגלריה מתעדכנת עם כל פרויקט שעולה לאוויר.',
  /** PLACEHOLDER card labels — shown on preview builds only (content/portfolio.ts). */
  placeholder: {
    name: 'שם העסק',
    field: 'תחום העסק · עיר',
    mediaCaption: 'כאן יוצג צילום מסך של הפרויקט',
    badge: 'בקרוב',
  },
  emptyState: 'העבודות הראשונות יעלו לכאן בקרוב. רוצים לראות דוגמאות רלוונטיות לתחום שלכם? דברו איתנו.',
  emptyCta: 'דברו איתנו ב-⁠WhatsApp',
  toggleDesktop: 'דסקטופ',
  toggleMobile: 'מובייל',
  view: 'צפייה באתר',
  viewAria: (name: string) => `צפייה באתר של ${name} (נפתח בחלון חדש)`,
} as const;

export const whyUs = {
  eyebrow: 'למה אנחנו',
  title: 'אתר תדמית שנבנה סביב העסק שלכם, לא סביב תבנית.',
  items: [
    {
      title: 'לא Template גנרי',
      text: 'כל אתר מתחיל מאפיון של העסק והלקוחות שלו. המבנה, המסרים והעיצוב נבנים סביב מה שאתם מוכרים ולמי.',
    },
    {
      title: 'Mobile First',
      text: 'רוב הלקוחות שלכם יגיעו מהטלפון. לכן מתכננים קודם את המסך הקטן, ורק אחר כך את הדסקטופ.',
    },
    {
      title: 'בנוי להמרות',
      text: 'מבנה העמוד, הכפתורים והטפסים מתוכננים כך שמבקר יבין מהר מה אתם מציעים ויידע איך לפנות.',
    },
    {
      title: 'Google Ready',
      text: 'האתר מוכן מראש לקמפיינים: עמודי נחיתה, מדידת המרות וחיבור ל-⁠Google Ads, כך שכל ליד נמדד.',
    },
  ],
  proofLine: 'האתר הזה בנוי בדיוק לפי העקרונות האלה — נסו אותו בטלפון.',
} as const;

export const beforeAfter = {
  eyebrow: 'ההבדל',
  title: 'אתר עסקי ישן מול אתר שבנוי להמרות',
  intro: 'לא מדובר רק בעיצוב. ההבדל הוא במה שקורה אחרי שלקוח נכנס לאתר.',
  beforeLabel: 'לפני',
  afterLabel: 'אחרי',
  illustration: 'המחשה',
  beforeCaption: 'טקסט צפוף · אין קריאה לפעולה · לא מותאם למובייל',
  afterCaption: 'כותרת ברורה · כפתור WhatsApp · טופס פנייה · מותאם למובייל',
  pairs: [
    { before: 'לא מותאם למובייל', after: 'Mobile First' },
    { before: 'טעינה איטית', after: 'טעינה מהירה בכל מכשיר' },
    { before: 'הפרטים ליצירת קשר חבויים', after: 'WhatsApp וטופס בכל מסך' },
    { before: 'עיצוב שנראה ישן', after: 'עיצוב נקי ומקצועי' },
    { before: 'אי אפשר לדעת מאיפה הגיעו הפניות', after: 'כל ליד נמדד ב-⁠Analytics' },
    { before: 'לא מוכן לפרסום בגוגל', after: 'Google Ready' },
  ],
  cta: 'רוצים אתר כזה? קבלו הצעה',
} as const;

export const pricingCopy = {
  eyebrow: 'חבילות',
  title: 'חבילות בניית אתרים ו-⁠Google Ads לעסקים',
  intro:
    'בוחרים מסלול, מקבלים הצעה מסודרת. כל פרויקט מתומחר לפי אפיון, כי אין שני עסקים זהים. בוחרים את המסלול שמתאים לכם, ואנחנו חוזרים אליכם עם הצעה ברורה.',
  noPrice: 'הצעת מחיר לפי אפיון',
  noPriceSub: 'הצעת מחיר מדויקת אחרי שיחה קצרה.',
  from: 'החל מ-',
  monthlyPrefix: '+ דמי ניהול חודשיים החל מ-',
  website: {
    name: 'אתר מקצועי',
    tagline: 'לעסק שצריך אתר שנראה מקצועי ומביא פניות.',
    features: [
      'אפיון העסק והלקוחות',
      'עיצוב UI/UX מותאם',
      'אתר מהיר ומותאם למובייל',
      'WhatsApp, טפסים וכפתורי יצירת קשר',
      'SEO בסיסי ו-⁠Google Analytics',
      'אבטחה, דומיין ועלייה לאוויר',
    ],
    cta: 'קבלו הצעה',
  },
  google: {
    name: 'אתר + Google Ads',
    /** TODO (client): "הבחירה הפופולרית" implies sales data — "החבילה המומלצת" is the honest default until there is. */
    badge: 'הבחירה הפופולרית',
    tagline: 'לעסק שרוצה גם אתר וגם תנועה רלוונטית מגוגל, עם מדידה של כל פנייה.',
    features: [
      'כל מה שכלול ב"אתר מקצועי"',
      'הקמת קמפיין Google Ads',
      'מחקר מילות מפתח וכתיבת מודעות',
      'GA4, Google Tag Manager ו-⁠Conversion Tracking',
      'ניהול, אופטימיזציה ושיפור מתמשך',
      'מעקב ודיווח על לידים',
    ],
    cta: 'קבלו הצעה',
  },
  budgetNote: 'תקציב הפרסום בגוגל אינו כלול בדמי הניהול ומשולם ישירות ל-⁠Google.',
  /** TODO (client): confirm ownership terms (code, hosting, domain). */
  ownership: 'האתר, הדומיין והתכנים נשארים שלכם.',
  helpLine: 'לא בטוחים איזה מסלול מתאים? דברו איתנו ונעזור לכם להחליט.',
  helpCta: 'שאלו אותנו ב-⁠WhatsApp',
} as const;

export const roi = {
  eyebrow: 'מחשבון',
  title: 'כמה לקוח חדש שווה לעסק שלכם?',
  intro: 'הזינו שני מספרים וראו כמה הכנסה חודשית עומדת מאחורי כל לקוח חדש שהאתר מביא.',
  valueLabel: 'שווי עסקה ממוצעת (₪)',
  valueHelper: 'כמה לקוח אחד משלם לכם בממוצע על שירות או עסקה.',
  customersLabel: 'לקוחות חדשים רצויים בחודש',
  customersHelper: 'כמה לקוחות חדשים בחודש יעשו לכם הבדל אמיתי.',
  resultLabel: 'פוטנציאל הכנסה חודשי',
  yearly: 'בשנה',
  dynamicCta: (customers: string) => `רוצים לדבר על איך מגיעים ל-${customers} לקוחות בחודש?`,
  whatsappMessage: (monthly: string, customers: string, value: string) =>
    `היי, הגעתי דרך האתר. לפי המחשבון הפוטנציאל שלי הוא כ-${monthly} ₪ בחודש (${customers} לקוחות × ${value} ₪). אשמח לשמוע איך מגיעים לזה.`,
  whatsappCta: 'דברו איתנו ב-⁠WhatsApp',
  empty: 'מלאו את שני השדות כדי לראות את החישוב.',
  invalid: 'הזינו מספר גדול מאפס.',
  customersUnit: 'לקוחות',
  disclaimer: 'המחשה בלבד. החישוב מבוסס על המספרים שהזנתם ואינו מהווה הבטחה או תחזית לתוצאות.',
  cta: 'בואו נדבר על איך מגיעים לשם',
} as const;

export const reviewsCopy = {
  eyebrow: 'לקוחות',
  title: 'מה לקוחות אומרים',
  titleWithReviews: 'ביקורות מ-⁠Google',
  emptyTitle: 'ביקורות מלקוחות יוצגו כאן',
  empty: 'אנחנו מציגים כאן רק ביקורות אמיתיות של לקוחות מ-⁠Google. ברגע שיהיו — הן יופיעו במקום הזה.',
  emptySecondary: 'עבדתם איתנו? נשמח אם תשאירו ביקורת.',
  googleCta: 'לביקורות שלנו ב-⁠Google',
  ratingAria: (n: number) => `דירוג ${n} מתוך 5`,
  original: 'לביקורת המקורית',
} as const;

export const faqCopy = {
  eyebrow: 'שאלות ותשובות',
  title: 'שאלות נפוצות על בניית אתר לעסק ופרסום בגוגל',
  whatsappLine: 'יש שאלה שלא ענינו עליה?',
  whatsappCta: 'כתבו לנו ב-⁠WhatsApp',
} as const;

export const form = {
  eyebrow: 'צרו קשר',
  title: 'קבלו הצעה לאתר לעסק שלכם',
  sub: 'השאירו פרטים ונחזור אליכם לשיחה קצרה על העסק שלכם. ללא התחייבות.',
  name: { label: 'שם', placeholder: 'איך לפנות אליכם?' },
  phone: { label: 'טלפון', placeholder: '050-0000000' },
  business: { label: 'שם העסק', optional: '(לא חובה)', placeholder: 'לדוגמה: קליניקת שיניים' },
  interestLabel: 'מה מתאים לכם?',
  interests: [
    { value: 'website', label: 'אני צריך אתר' },
    { value: 'website_ads', label: 'אתר + Google Ads' },
    { value: 'unsure', label: 'עדיין לא בטוח' },
  ],
  consent: 'בשליחת הטופס אתם מאשרים שניצור איתכם קשר בטלפון או ב-⁠WhatsApp. הפרטים ישמשו למענה לפנייה בלבד.',
  privacyLink: 'מדיניות פרטיות',
  submit: 'קבלו הצעה',
  submitWhatsApp: 'שלחו ב-⁠WhatsApp',
  submitting: 'שולחים...',
  fallbackNote: 'הטופס ייפתח ב-⁠WhatsApp עם הפרטים שמילאתם.',
  altWhatsApp: 'מעדיפים לדבר?',
  altWhatsAppCta: 'דברו איתנו ב-⁠WhatsApp',
  altPhone: 'או התקשרו:',
  errors: {
    nameEmpty: 'נא להזין שם',
    nameShort: 'השם קצר מדי',
    phoneEmpty: 'נא להזין מספר טלפון',
    phoneInvalid: 'המספר לא נראה תקין. לדוגמה: 050-1234567',
    interest: 'בחרו אפשרות אחת כדי שנדע איך לעזור',
    network: 'לא הצלחנו לשלוח את הטופס. נסו שוב, או שלחו לנו את הפרטים ישירות ב-⁠WhatsApp:',
    networkNoWhatsApp: 'לא הצלחנו לשלוח את הטופס. נסו שוב בעוד רגע.',
    networkWhatsAppCta: 'שלחו את הפרטים ב-⁠WhatsApp',
    summary: (n: number) => (n === 1 ? 'יש שדה אחד שצריך לתקן.' : `יש ${n} שדות שצריך לתקן.`),
  },
  success: {
    title: 'הפרטים התקבלו. תודה!',
    text: 'נחזור אליכם בהקדם לשיחה קצרה. רוצים לזרז? אפשר להמשיך איתנו עכשיו ב-⁠WhatsApp.',
    whatNext: 'מה עכשיו?',
    steps: ['שיחה קצרה להכיר את העסק ואת המטרות', 'הצעה מותאמת בכתב', 'מחליטים בלי לחץ'],
    whatsappCta: 'להמשיך ב-⁠WhatsApp',
    again: 'שליחת פנייה נוספת',
  },
  /** Shown when the details were handed to WhatsApp (no endpoint) — nothing was received yet. */
  handoff: {
    title: 'פתחנו לכם את WhatsApp עם הפרטים',
    text: 'לחצו "שליחה" בחלון של WhatsApp כדי שנקבל את הפנייה. לא נפתח? אפשר לפתוח שוב.',
    reopen: 'פתיחת WhatsApp שוב',
    call: 'או התקשרו:',
  },
} as const;

export const finalCta = {
  title: 'יש לכם עסק. עכשיו צריך לגרום ליותר לקוחות למצוא אותו.',
  text: 'בואו נבנה לכם אתר שנראה מקצועי — ובעיקר יודע להפוך כניסות לפניות.',
  primary: 'קבלו הצעה לאתר',
  whatsapp: 'דברו איתנו עכשיו',
} as const;

export const footer = {
  about: 'בניית אתרים מקצועיים לעסקים וניהול קמפיינים ב-⁠Google Ads. אתרים שנבנים כדי להביא פניות, לא רק להיראות טוב.',
  navTitle: 'ניווט',
  servicesTitle: 'שירותים',
  services: [
    { label: 'בניית אתר לעסק', href: '#services' },
    { label: 'אתר + Google Ads', href: '#pricing' },
  ],
  contactTitle: 'יצירת קשר',
  contactFallback: 'השאירו פרטים בטופס ונחזור אליכם.',
  phoneAria: 'התקשרו אלינו',
  whatsappAria: 'שלחו לנו הודעה ב-⁠WhatsApp',
  areaLabel: 'אזור פעילות:',
  hoursLabel: 'שעות פעילות:',
  accessibility: 'הצהרת נגישות',
  privacy: 'מדיניות פרטיות',
  rights: 'כל הזכויות שמורות.',
  toTop: 'חזרה לראש העמוד',
} as const;

export const sticky = {
  whatsapp: 'WhatsApp',
  cta: 'קבלו הצעה',
} as const;

export const seo = {
  title: 'בניית אתרים לעסקים וקידום ממומן בגוגל',
  description:
    'בניית אתרים מקצועיים לעסקים, מותאמים למובייל ובנויים להביא פניות. אפשרות לקמפיין Google Ads עם מדידת לידים. קבלו הצעה ללא התחייבות.',
  ogTitle: 'אתרים שבנויים להביא לעסק שלכם לקוחות',
  ogDescription:
    'בניית אתרים מקצועיים לעסקים בישראל, עם אפשרות לקידום ממומן בגוגל. משלב האפיון ועד שהלקוחות מתחילים להגיע.',
  ogAlt: 'תצוגה של אתר עסקי מודרני על מחשב נייד וטלפון, לצד הכותרת: אתרים שבנויים להביא לעסק שלכם לקוחות',
  serviceDescription: 'בניית אתרים מקצועיים לעסקים וניהול קמפיינים ב-⁠Google Ads.',
} as const;
