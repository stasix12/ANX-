import { supabase } from '@/lib/supabase';
import { asset } from '@/lib/site';

export type CategoryId = 'handles' | 'hoses' | 'adapters' | 'courses';

export interface Category {
  id: CategoryId;
  name: string;
  blurb: string;
}

export interface SpecRow {
  label: string;
  value: string;
}

export interface VariantGroup {
  id: string;
  label: string;
  options: string[];
}

/**
 * The Sabrina models a part can be ordered for. Buyers pick one on the product
 * card and the choice rides along into the WhatsApp order message.
 */
export const sabrinaModels = ['סברינה מקסי', 'סברינה מיני'] as const;

export type SabrinaModel = (typeof sabrinaModels)[number];

export interface Product {
  /** Database row id — absent only for a not-yet-saved draft in the admin form. */
  id?: string;
  slug: string;
  name: string;
  /** One line for the product card. */
  tagline: string;
  /** Full paragraph for the product page. */
  description: string;
  category: CategoryId;
  /** Optional — omit and the card shows "לפרטי מחיר בוואטסאפ". */
  price?: number;
  /** Optional discounted price. Shown struck-through against `price` when set and lower. */
  salePrice?: number;
  badge?: string;
  /**
   * Which Sabrina models this part is offered for. Defaults to all of them —
   * narrow it here (e.g. `fitsModels: ['סברינה מיני']`) for a part that only
   * fits one, and the card will offer just that option.
   */
  fitsModels?: SabrinaModel[];
  compatibility: string[];
  variants: VariantGroup[];
  highlights: string[];
  specs: SpecRow[];
  /** Image paths, already prefixed for the current deployment (see asset()). */
  images: string[];
  /**
   * Optional clip of the product in use, shown under the gallery. Both formats
   * are needed — Safari plays the MP4, Chrome and Firefox take the smaller
   * WebM — and the paths are prefixed by the component, not here.
   */
  video?: { webm: string; mp4: string; poster: string };
  inStock: boolean;
  featured: boolean;
  /** Unpublished products never reach the public site — the admin list shows them, storefront queries never do. */
  published: boolean;
}

export const categories: Category[] = [
  {
    id: 'handles',
    name: 'ידיות שאיבה',
    blurb: 'ידיות בגוף שקוף עם זרימת אוויר מיטבית וסגירה אטומה.',
  },
  {
    id: 'hoses',
    name: 'צינורות',
    blurb: 'צינורות שאיבה ולחץ מחוזקים, גמישים גם בעבודה ממושכת.',
  },
  {
    id: 'adapters',
    name: 'מתאמים',
    blurb: 'מתאמים וחיבורים מהירים בין המכונה לאביזרים.',
  },
  {
    id: 'courses',
    name: 'קורסים',
    blurb: 'קורסים מקצועיים אונליין להסרת כתמים וטיפול בריפודים.',
  },
];

export const categoryName = (id: CategoryId): string =>
  categories.find((c) => c.id === id)?.name ?? '';

export const formatPrice = (price: number): string => `₪${price.toLocaleString('he-IL')}`;

const gallery = (slug: string): string[] => [
  asset(`/products/${slug}/1.svg`),
  asset(`/products/${slug}/2.svg`),
  asset(`/products/${slug}/3.svg`),
];

/**
 * The original catalog, kept as a safety net for `fetchPublishedProducts()` /
 * `fetchProductBySlug()`: if Supabase returns nothing — not yet seeded,
 * temporarily unreachable, or misconfigured — the storefront falls back to
 * this instead of showing an empty shop. The moment the database actually
 * has published rows, those take over and this stops being used.
 */
const fallbackProducts: Product[] = [
  {
    slug: 'anx-anaconda',
    name: 'ANX ANACONDA',
    tagline: 'ידית שאיבה עמידה לחום ולשחיקה, בירוק ג׳ונגל או בשחור — עם אטם קצף היקפי והדק לשליטה מלאה.',
    description:
      'ANX ANACONDA היא ידית השאיבה שלנו לניקוי ספות וריפודים. הגוף מיוצר בישראל מחומרים חזקים ועמידים במיוחד לחום ולשחיקה של עבודה יומיומית, עם אטם קצף היקפי סביב פתח השאיבה שנצמד לבד ושומר על ואקום מלא לאורך המשיכה. ההדק מאפשר לשלוט בהתזה תוך כדי עבודה בלי להוריד את היד מהידית, והחיבור המהיר בבסיס מתחבר ומתנתק בלי כלים. הידית מגיעה בשני צבעים: ירוק ג׳ונגל, שקל לאתר באתר עבודה עמוס, ושחור נקי ומקצועי.',
    category: 'handles',
    price: 850,
    compatibility: ['Sabrina — ידית שאיבה לניקוי ספות וריפודים'],
    variants: [{ id: 'color', label: 'צבע', options: ['ירוק ג׳ונגל', 'שחור'] }],
    highlights: [
      'אטם קצף היקפי סביב פתח השאיבה',
      'הדק לשליטה בהתזה תוך כדי עבודה',
      'חיבור מהיר — מתחבר ומתנתק בלי כלים',
      'גוף עמיד לחום ולשחיקה, מיוצר בישראל',
    ],
    specs: [
      { label: 'צבעים', value: 'ירוק ג׳ונגל · שחור' },
      { label: 'ייצור', value: 'מיוצר בישראל · עמיד לחום ולשחיקה' },
      { label: 'אטימה', value: 'אטם קצף היקפי' },
      { label: 'שליטה', value: 'הדק התזה מובנה' },
    ],
    images: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => asset(`/products/anx-anaconda/${n}.webp`)),
    video: {
      webm: '/video/anaconda-demo.webm',
      mp4: '/video/anaconda-demo.mp4',
      poster: '/video/anaconda-demo-poster.jpg',
    },
    inStock: true,
    featured: true,
    published: true,
  },
  {
    slug: 'anx-anaconda-set',
    name: 'סט ANACONDA מלא',
    tagline: 'ידית ANACONDA, צינור הזרקה בתוך צינור שאיבה ומחבר 360° — הכל בערכה אחת.',
    description:
      'הסט המלא של ANACONDA: ידית השאיבה, צינור הזרקה שעובר בתוך צינור השאיבה, ומחבר מסתובב 360° בין הידית לצינור. צינור אחד במקום שניים מקבילים — פחות סיבוכים מתחת לרגליים ופחות מה לגרור בין חדר לחדר. המחבר המסתובב מאפשר לסובב את הידית לכל כיוון בלי שהצינור יתפתל או ימשוך את היד אחורה, וזה מה שמרגישים אחרי שעה של עבודה רצופה.',
    category: 'handles',
    price: 1600,
    badge: 'סט מלא',
    compatibility: ['Sabrina — סט שאיבה והזרקה לניקוי ספות וריפודים'],
    variants: [{ id: 'color', label: 'צבע הידית', options: ['ירוק ג׳ונגל', 'שחור'] }],
    highlights: [
      'ידית ANACONDA כלולה בסט',
      'צינור הזרקה עובר בתוך צינור השאיבה',
      'מחבר מסתובב 360° לתנועה חופשית של הידית',
      'חיבור מהיר — מתחבר ומתנתק בלי כלים',
    ],
    specs: [
      { label: 'כולל', value: 'ידית · צינור שאיבה עם צינור הזרקה פנימי · מחבר 360°' },
      { label: 'צבעי הידית', value: 'ירוק ג׳ונגל · שחור' },
      { label: 'ייצור', value: 'מיוצר בישראל · עמיד לחום ולשחיקה' },
    ],
    images: [1, 2, 3, 4].map((n) => asset(`/products/anx-anaconda-set/${n}.webp`)),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'anx-hose-clips',
    name: 'סט קליפסים לצינורות — 6 יחידות',
    tagline: 'מאחדים את צינור השאיבה וצינור ההזרקה לקו אחד — בלי שיתפרקו ויסתבכו.',
    description:
      'הקליפסים מחברים את צינור השאיבה וצינור ההזרקה לקו אחד לאורך כל המשיכה. במקום שני צינורות שנפרדים באמצע העבודה, נתפסים ברגל של ספה ומסתבכים ביד — קו אחד שנגרר נקי אחריך בין חדר לחדר.\n\nההבדל מורגש בעיקר בשני מקומות: בזמן העבודה, כשאתה לא עוצר כל כמה דקות כדי להפריד ולסדר, ובסוף — כשגלגול הציוד לוקח פחות זמן כי הכל כבר מאוגד. גם צינור ההזרקה הדק פחות חשוף לדריכה ולמעיכה כשהוא צמוד לצינור השאיבה במקום להסתובב לבד על הרצפה.\n\nהקליפס נפתח בצד: לוחצים אותו על הצינורות ביד, בלי כלים ובלי אזיקונים לחתוך. שש יחידות בסט מאפשרות לפרוס אותם לאורך הצינור — צפוף יותר קרוב לידית, שם התנועה הכי גדולה — ולהזיז אותם בכל רגע.',
    category: 'hoses',
    price: 279,
    badge: 'סט 6 יחידות',
    compatibility: [
      'מאחד צינור שאיבה וצינור הזרקה',
      'נסגר ביד — בלי כלים ובלי אזיקונים',
      'ניתן להוסיף לסט צינורות קיים',
    ],
    variants: [{ id: 'quantity', label: 'כמות', options: ['סט 6 יחידות'] }],
    highlights: [
      'שני צינורות נגררים כקו אחד',
      'פחות עצירות באמצע העבודה לסידור הצינורות',
      'צינור ההזרקה צמוד ומוגן במקום חופשי על הרצפה',
      'נפתח ונסגר ביד, וזז לאורך הצינור בכל רגע',
    ],
    specs: [
      { label: 'כמות בסט', value: '6 יחידות' },
      { label: 'התקנה', value: 'הצמדה ביד, ללא כלים' },
      { label: 'ייצור', value: 'מיוצר בישראל · עמיד לחום ולשחיקה' },
    ],
    images: [1, 2, 3, 4].map((n) => asset(`/products/anx-hose-clips/${n}.webp`)),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'anx-pro-handle',
    name: 'ידית שאיבה ANX PRO',
    tagline: 'ידית הדגל שלנו — חלון שקוף, שאיבה חזקה ואחיזה נוחה לאורך יום עבודה.',
    description:
      'ידית השאיבה ANX PRO תוכננה מאפס עבור עבודה יומיומית בניקוי ספות וריפודים. הגוף השקוף מאפשר לראות בדיוק מה נשאב ומתי המים יוצאים נקיים, כך שאפשר לדעת מתי הסיום אמיתי. פרופיל השפה מותאם לזווית עבודה טבעית ומקטין עייפות בכף היד, ומעבר האוויר הפנימי עוצב למניעת סתימות גם בשאריות סיבים ושיער.',
    category: 'handles',
    price: 349,
    badge: 'הנמכר ביותר',
    compatibility: [
      'Sabrina — כל הדגמים בחיבור סטנדרטי',
      'מכונות אקסטרקציה עם צינור ״1.5',
      'מתאים לשימוש עם מתאמי ANX3D לכל חיבור אחר',
    ],
    variants: [
      { id: 'color', label: 'צבע גוף', options: ['שחור', 'כחול ANX', 'שקוף מלא'] },
      { id: 'connection', label: 'סוג חיבור', options: ['חיבור מהיר', 'חיבור מוברג'] },
      { id: 'width', label: 'רוחב שפה', options: ['רגיל', 'רחב'] },
    ],
    highlights: [
      'חלון שקוף לבקרת ניקיון בזמן אמת',
      'זרימת אוויר מיטבית ללא נקודות סתימה',
      'אחיזה ארגונומית להפחתת עומס על כף היד',
      'שפה מוחלקת שאינה משאירה סימנים על הבד',
    ],
    specs: [
      { label: 'חומר', value: 'פוליקרבונט מוקשח + ABS' },
      { label: 'רוחב שאיבה', value: '11 ס״מ' },
      { label: 'משקל', value: '340 גרם' },
      { label: 'חיבור', value: '״1.5 סטנדרטי' },
      { label: 'לחץ עבודה מומלץ', value: 'עד 60 בר' },
      { label: 'אחריות', value: '12 חודשים' },
    ],
    images: gallery('anx-pro-handle'),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'anx-mini-handle',
    name: 'ידית שאיבה MINI',
    tagline: 'ידית קומפקטית לפינות, מושבי רכב ומקומות צרים.',
    description:
      'ה-MINI נבנתה בדיוק לאותם מקומות שבהם הידית הרגילה גדולה מדי: פינות ספה, תפרים, מושבי רכב ובין המשענות. למרות הגודל הקטן היא שומרת על אותה עוצמת שאיבה, בזכות ערוץ פנימי צר שמאיץ את זרימת האוויר במקום לחנוק אותה.',
    category: 'handles',
    price: 289,
    compatibility: [
      'Sabrina — כל הדגמים בחיבור סטנדרטי',
      'מתאימה לעבודה עם צינור ANX3D בקוטר ״1.5',
    ],
    variants: [
      { id: 'color', label: 'צבע גוף', options: ['שחור', 'כחול ANX'] },
      { id: 'connection', label: 'סוג חיבור', options: ['חיבור מהיר', 'חיבור מוברג'] },
    ],
    highlights: [
      'גישה לפינות ותפרים שלא מגיעים אליהם אחרת',
      'שאיבה חזקה למרות מידות קומפקטיות',
      'קלה במיוחד — נוחה לעבודה מעל הראש',
      'מושלמת לניקוי פנים רכב',
    ],
    specs: [
      { label: 'חומר', value: 'פוליקרבונט מוקשח' },
      { label: 'רוחב שאיבה', value: '6 ס״מ' },
      { label: 'משקל', value: '210 גרם' },
      { label: 'חיבור', value: '״1.5 סטנדרטי' },
      { label: 'אחריות', value: '12 חודשים' },
    ],
    images: gallery('anx-mini-handle'),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'anx-crystal-handle',
    name: 'ידית שאיבה CRYSTAL VIEW',
    tagline: 'גוף שקוף לחלוטין — שליטה מלאה על מה שיוצא מהריפוד.',
    description:
      'CRYSTAL VIEW היא הידית לאנשי מקצוע שרוצים להראות ללקוח את התוצאה. הגוף שקוף לכל אורכו, כך שכל טיפת מים מלוכלכת נראית בבירור בדרך לצינור. מעבר לאפקט מול הלקוח, השקיפות המלאה עוזרת לזהות סתימה מתחילה עוד לפני שהיא עוצרת את העבודה.',
    category: 'handles',
    price: 379,
    badge: 'חדש',
    compatibility: ['Sabrina — כל הדגמים בחיבור סטנדרטי', 'מכונות אקסטרקציה מקצועיות ״1.5'],
    variants: [
      { id: 'color', label: 'גימור', options: ['שקוף מלא', 'שקוף עם מסגרת כחולה'] },
      { id: 'connection', label: 'סוג חיבור', options: ['חיבור מהיר', 'חיבור מוברג'] },
    ],
    highlights: [
      'שקיפות מלאה — הלקוח רואה את התוצאה',
      'זיהוי מוקדם של סתימות',
      'עמידות גבוהה לשריטות',
      'ניקוי פנימי קל בסוף יום עבודה',
    ],
    specs: [
      { label: 'חומר', value: 'פוליקרבונט שקוף מוקשח' },
      { label: 'רוחב שאיבה', value: '10 ס״מ' },
      { label: 'משקל', value: '325 גרם' },
      { label: 'חיבור', value: '״1.5 סטנדרטי' },
      { label: 'אחריות', value: '12 חודשים' },
    ],
    images: gallery('anx-crystal-handle'),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'anx-hose-3m',
    name: 'צינור שאיבה מחוזק 3 מ׳',
    tagline: 'צינור עבודה יומיומי — קל, גמיש ולא מתקפל בסיבוב.',
    description:
      'צינור השאיבה של ANX3D בנוי משכבה פנימית חלקה שמונעת הצטברות לכלוך ומספירלה מחוזקת ששומרת על הקוטר גם כשמושכים אותו סביב רהיט. אורך 3 מטר הוא נקודת האיזון לעבודה בסלון ממוצע — מספיק טווח בלי עודף שמתגלגל על הרצפה.',
    category: 'hoses',
    price: 249,
    compatibility: ['Sabrina — כל הדגמים', 'תואם לכל ידיות השאיבה של ANX3D'],
    variants: [
      { id: 'length', label: 'אורך', options: ['3 מטר', '5 מטר', '8 מטר'] },
      { id: 'color', label: 'צבע', options: ['שחור', 'כחול ANX'] },
    ],
    highlights: [
      'ספירלה מחוזקת שלא נמעכת בסיבוב',
      'דופן פנימית חלקה — פחות הצטברות לכלוך',
      'גמיש גם בטמפרטורות נמוכות',
      'קל למשקל — פחות עומס בגרירה',
    ],
    specs: [
      { label: 'אורך', value: '3 מטר' },
      { label: 'קוטר פנימי', value: '38 מ״מ (״1.5)' },
      { label: 'חומר', value: 'PVC מחוזק בספירלה' },
      { label: 'טווח טמפרטורה', value: '5°C עד 70°C' },
      { label: 'אחריות', value: '12 חודשים' },
    ],
    images: gallery('anx-hose-3m'),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'anx-hose-5m',
    name: 'צינור שאיבה מחוזק 5 מ׳',
    tagline: 'טווח עבודה ארוך לחללים גדולים ולעבודה בקומות.',
    description:
      'אותה בנייה של צינור ה-3 מטר, בטווח שמאפשר להשאיר את המכונה במקום אחד ולעבוד על סלון שלם, על מדרגות או מתוך הרכב. מומלץ למי שעובד הרבה בבתים פרטיים או במשרדים.',
    category: 'hoses',
    price: 329,
    compatibility: ['Sabrina — כל הדגמים', 'תואם לכל ידיות השאיבה של ANX3D'],
    variants: [
      { id: 'length', label: 'אורך', options: ['5 מטר', '8 מטר'] },
      { id: 'color', label: 'צבע', options: ['שחור', 'כחול ANX'] },
    ],
    highlights: [
      'טווח עבודה שמונע הזזה של המכונה',
      'שמירה על עוצמת שאיבה לכל האורך',
      'מתאים לעבודה במדרגות ובקומות',
      'ניתן לחבר בהמשכיות עם מתאם ANX3D',
    ],
    specs: [
      { label: 'אורך', value: '5 מטר' },
      { label: 'קוטר פנימי', value: '38 מ״מ (״1.5)' },
      { label: 'חומר', value: 'PVC מחוזק בספירלה' },
      { label: 'טווח טמפרטורה', value: '5°C עד 70°C' },
      { label: 'אחריות', value: '12 חודשים' },
    ],
    images: gallery('anx-hose-5m'),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'anx-hose-combo',
    name: 'צינור משולב שאיבה + לחץ',
    tagline: 'שני קווים בשרוול אחד — פחות כבלים מתפתלים על הרצפה.',
    description:
      'הצינור המשולב מאגד את קו הלחץ וקו השאיבה בשרוול אחד מסודר. במקום שני צינורות שנסבכים זה בזה מתחת לספה, נשאר קו עבודה אחד נקי. השרוול החיצוני מגן על קו הלחץ משפשוף ומאריך את חיי הצינור.',
    category: 'hoses',
    price: 399,
    badge: 'שדרוג מומלץ',
    compatibility: ['Sabrina — כל הדגמים', 'מתאים לעבודה עם ידיות ANX PRO ו-CRYSTAL VIEW'],
    variants: [
      { id: 'length', label: 'אורך', options: ['3 מטר', '5 מטר'] },
      { id: 'connection', label: 'חיבור לחץ', options: ['ניתוק מהיר', 'מוברג'] },
    ],
    highlights: [
      'קו עבודה אחד במקום שניים',
      'שרוול מגן מפני שפשוף ובלאי',
      'התחברות מהירה בתחילת יום עבודה',
      'פחות סיכון להיתקלות בכבלים בבית הלקוח',
    ],
    specs: [
      { label: 'אורך', value: '3 מטר' },
      { label: 'קו שאיבה', value: '38 מ״מ (״1.5)' },
      { label: 'קו לחץ', value: 'עד 70 בר' },
      { label: 'חומר שרוול', value: 'ניילון קלוע' },
      { label: 'אחריות', value: '12 חודשים' },
    ],
    images: gallery('anx-hose-combo'),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'anx-adapter-sabrina',
    name: 'מתאם Sabrina ↔ ידית',
    tagline: 'המתאם הבסיסי שמחבר כל ידית ANX3D למכונה שלך.',
    description:
      'מתאם ההתאמה הסטנדרטי בין יציאת ה-Sabrina לכל ידית שאיבה של ANX3D. אטימה כפולה מונעת אובדן ואקום, וזה מורגש ישירות בעוצמת השאיבה. אם זו ההזמנה הראשונה שלך אצלנו — זה החלק שכדאי להוסיף לעגלה.',
    category: 'adapters',
    price: 89,
    compatibility: ['Sabrina — כל הדגמים', 'כל ידיות השאיבה של ANX3D'],
    variants: [
      { id: 'color', label: 'צבע', options: ['שחור', 'כחול ANX'] },
      { id: 'seal', label: 'אטימה', options: ['O-Ring כפול', 'O-Ring בודד'] },
    ],
    highlights: [
      'אטימה כפולה — בלי אובדן ואקום',
      'מתחבר ומתנתק בלי כלים',
      'עמיד לחומרי ניקוי מקצועיים',
      'החלק הראשון שכדאי להוסיף לערכה',
    ],
    specs: [
      { label: 'חומר', value: 'ABS מוקשח + אטמי NBR' },
      { label: 'קוטר', value: '38 מ״מ (״1.5)' },
      { label: 'משקל', value: '75 גרם' },
      { label: 'אחריות', value: '12 חודשים' },
    ],
    images: gallery('anx-adapter-sabrina'),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'anx-adapter-quick',
    name: 'מתאם ניתוק מהיר QUICK-LOCK',
    tagline: 'מחליף ידית תוך שנייה, בלי לעצור את המכונה.',
    description:
      'מנגנון הניתוק המהיר מאפשר להחליף בין ידית רגילה לידית MINI באמצע עבודה, בלי להוריד לחץ ובלי להתעסק בהברגות. נעילה בסיבוב רבע וקליק ברור שמאשר שהחיבור נעול.',
    category: 'adapters',
    price: 129,
    badge: 'חוסך זמן',
    compatibility: ['Sabrina — כל הדגמים', 'כל ידיות וצינורות ANX3D'],
    variants: [
      { id: 'color', label: 'צבע', options: ['שחור', 'כחול ANX'] },
      { id: 'kit', label: 'תצורה', options: ['יחידה בודדת', 'זוג (זכר + נקבה)'] },
    ],
    highlights: [
      'החלפת אביזר בשנייה אחת',
      'נעילת רבע סיבוב עם קליק מאשר',
      'מונע נזק להברגות משימוש חוזר',
      'מתאים לעבודה עם מספר ידיות ביום',
    ],
    specs: [
      { label: 'חומר', value: 'ABS מוקשח + נירוסטה' },
      { label: 'קוטר', value: '38 מ״מ (״1.5)' },
      { label: 'מנגנון', value: 'נעילת רבע סיבוב' },
      { label: 'אחריות', value: '12 חודשים' },
    ],
    images: gallery('anx-adapter-quick'),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'anx-adapter-90',
    name: 'מתאם זווית 90°',
    tagline: 'מוריד את גובה העבודה מתחת לרהיטים ובין המשענות.',
    description:
      'מתאם הזווית מפנה את קו השאיבה בתשעים מעלות ומאפשר להגיע מתחת לספות נמוכות, בין משענות ובתוך רכב, בלי לכופף את פרק כף היד. משתלב עם כל ידיות ANX3D וניתן לשלב אותו עם מתאם ה-QUICK-LOCK.',
    category: 'adapters',
    price: 79,
    compatibility: ['Sabrina — כל הדגמים', 'כל ידיות ANX3D', 'ניתן לשלב עם QUICK-LOCK'],
    variants: [
      { id: 'angle', label: 'זווית', options: ['90°', '45°'] },
      { id: 'color', label: 'צבע', options: ['שחור', 'כחול ANX'] },
    ],
    highlights: [
      'הגעה למקומות נמוכים בלי לכופף את היד',
      'מפחית עומס על פרק כף היד',
      'ניתן לשלב עם ניתוק מהיר',
      'זרימה פנימית מעוגלת שלא חונקת את השאיבה',
    ],
    specs: [
      { label: 'חומר', value: 'ABS מוקשח' },
      { label: 'זווית', value: '90 מעלות' },
      { label: 'קוטר', value: '38 מ״מ (״1.5)' },
      { label: 'משקל', value: '85 גרם' },
      { label: 'אחריות', value: '12 חודשים' },
    ],
    images: gallery('anx-adapter-90'),
    inStock: true,
    featured: false,
    published: true,
  },
  {
    slug: 'course-stain-removal',
    name: 'קורס הסרת כתמי השחמות – 1 על 1',
    tagline: 'קורס אונליין אישי 1 על 1 להסרת כתמי השחמות ממזרנים, בלי אבקות.',
    description:
      'נמאס לכם כל פעם להתאכזב שהחומרים שקניתם לא מביאים לכם תוצאות? אצלנו תמצאו את הפתרון בהמצאות הנוסחה הבלעדית שפיתחנו. קורס 1 על 1 אונליין איתי, שבו אתם מקבלים ידע 100% בהסרת כתמי השחמות ממזרנים — בלי אבקות.',
    category: 'courses',
    price: 1480,
    compatibility: [],
    variants: [],
    highlights: [
      'ידע מלא (100%) בהסרת כתמי השחמות ממזרנים',
      'שיטה בלי אבקות',
      'נוסחה בלעדית שפותחה על ידינו',
      'קורס אונליין אישי, 1 על 1',
    ],
    specs: [
      { label: 'פורמט', value: 'קורס אונליין אישי (1 על 1)' },
      { label: 'הרשמה', value: 'בוואטסאפ' },
    ],
    images: [asset('/products/course-stain-removal/1.webp')],
    video: {
      webm: '/video/course-stain-removal.webm',
      mp4: '/video/course-stain-removal.mp4',
      poster: '/video/course-stain-removal-poster.jpg',
    },
    inStock: true,
    featured: false,
    published: true,
  },
];

/** Row shape as it comes back from the `products` table. */
interface ProductRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: CategoryId;
  price: number | null;
  sale_price: number | null;
  badge: string | null;
  fits_models: string[] | null;
  compatibility: string[] | null;
  variants: VariantGroup[] | null;
  highlights: string[] | null;
  specs: SpecRow[] | null;
  images: string[] | null;
  video: { webm: string; mp4: string; poster: string } | null;
  in_stock: boolean;
  featured: boolean;
  published: boolean;
}

/**
 * Images are stored base-relative ("/products/slug/1.webp") so the same row
 * works whether the site sits on a GitHub Pages sub-path or a bare domain —
 * asset() applies whichever prefix this deployment needs. `video` is kept
 * unprefixed on purpose: the gallery and hero components already call
 * asset() on it themselves, same as when this data was hardcoded.
 */
function mapRow(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    category: row.category,
    price: row.price ?? undefined,
    salePrice: row.sale_price ?? undefined,
    badge: row.badge ?? undefined,
    fitsModels: (row.fits_models ?? undefined) as SabrinaModel[] | undefined,
    compatibility: row.compatibility ?? [],
    variants: row.variants ?? [],
    highlights: row.highlights ?? [],
    specs: row.specs ?? [],
    images: (row.images ?? []).map((path) => asset(path)),
    video: row.video ?? undefined,
    inStock: row.in_stock,
    featured: row.featured,
    published: row.published,
  };
}

const SELECT_COLUMNS =
  'id, slug, name, tagline, description, category, price, sale_price, badge, fits_models, compatibility, variants, highlights, specs, images, video, in_stock, featured, published';

/**
 * Used by the public storefront — RLS only ever returns published rows here.
 * Falls back to the built-in catalog when Supabase has nothing to offer
 * (unseeded, unreachable, or misconfigured) so the shop is never empty.
 */
export async function fetchPublishedProducts(): Promise<Product[]> {
  if (!supabase) return fallbackProducts;
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .eq('published', true)
    .order('sort_order', { ascending: true });
  if (error || !data || data.length === 0) return fallbackProducts;
  return (data as unknown as ProductRow[]).map(mapRow);
}

/** Used by the public storefront for a single product page. Same fallback as above. */
export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from('products')
      .select(SELECT_COLUMNS)
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();
    if (!error && data) return mapRow(data as unknown as ProductRow);
  }
  return fallbackProducts.find((p) => p.slug === slug) ?? null;
}

/**
 * Used by the admin panel — returns every row regardless of published state.
 * Relies on RLS: this only succeeds for a signed-in admin session, and an
 * unauthenticated caller gets an empty (or error) result rather than data.
 */
export async function fetchAllProductsAdmin(): Promise<Product[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return (data as unknown as ProductRow[]).map(mapRow);
}

export async function fetchProductByIdAdmin(id: string): Promise<Product | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as unknown as ProductRow);
}
