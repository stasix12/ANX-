import { asset } from '@/lib/site';

export type CategoryId = 'handles' | 'hoses' | 'adapters';

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
  slug: string;
  name: string;
  /** One line for the product card. */
  tagline: string;
  /** Full paragraph for the product page. */
  description: string;
  category: CategoryId;
  /** Optional — omit and the card shows "לפרטי מחיר בוואטסאפ". */
  price?: number;
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
  /**
   * Image paths under /public. These are numbered SVG placeholders — replace the
   * files in public/products/<slug>/ with real photos, or point these entries at
   * your own .jpg / .webp files.
   */
  images: string[];
  /**
   * Optional clip of the product in use, shown under the gallery. Both formats
   * are needed — Safari plays the MP4, Chrome and Firefox take the smaller
   * WebM — and the paths are prefixed by the component, not here.
   */
  video?: { webm: string; mp4: string; poster: string };
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
];

export const categoryName = (id: CategoryId): string =>
  categories.find((c) => c.id === id)?.name ?? '';

/**
 * Three numbered placeholders per product.
 *
 * Prefixed through asset(): next/image applies basePath only when it routes a
 * source through the optimiser, and a static export has none, so these would
 * 404 on a sub-path deployment without it.
 */
const gallery = (slug: string): string[] => [
  asset(`/products/${slug}/1.svg`),
  asset(`/products/${slug}/2.svg`),
  asset(`/products/${slug}/3.svg`),
];

export const products: Product[] = [
  /*
   * The only entry so far with real photographs and a real price. Everything
   * below it is still placeholder copy against numbered SVGs.
   *
   * Its specs are deliberately short: they list what the photographs actually
   * show and what the shop confirmed. Nothing here is a guess.
   */
  {
    slug: 'anx-anaconda',
    name: 'ANX ANACONDA',
    tagline: 'ידית שאיבה מודפסת בתלת־מימד, בירוק ג׳ונגל או בשחור — עם אטם קצף היקפי והדק לשליטה מלאה.',
    description:
      'ANX ANACONDA היא ידית השאיבה שלנו לניקוי ספות וריפודים. הגוף מודפס בתלת־מימד ומיוצר בישראל, עם אטם קצף היקפי סביב פתח השאיבה שנצמד לבד ושומר על ואקום מלא לאורך המשיכה. ההדק מאפשר לשלוט בהתזה תוך כדי עבודה בלי להוריד את היד מהידית, והחיבור המהיר בבסיס מתחבר ומתנתק בלי כלים. הידית מגיעה בשני צבעים: ירוק ג׳ונגל, שקל לאתר באתר עבודה עמוס, ושחור נקי ומקצועי.',
    category: 'handles',
    price: 850,
    compatibility: ['Sabrina — ידית שאיבה לניקוי ספות וריפודים'],
    variants: [{ id: 'color', label: 'צבע', options: ['ירוק ג׳ונגל', 'שחור'] }],
    highlights: [
      'אטם קצף היקפי סביב פתח השאיבה',
      'הדק לשליטה בהתזה תוך כדי עבודה',
      'חיבור מהיר — מתחבר ומתנתק בלי כלים',
      'גוף מודפס בתלת־מימד, מיוצר בישראל',
    ],
    specs: [
      { label: 'צבעים', value: 'ירוק ג׳ונגל · שחור' },
      { label: 'ייצור', value: 'הדפסת תלת־מימד, מיוצר בישראל' },
      { label: 'אטימה', value: 'אטם קצף היקפי' },
      { label: 'שליטה', value: 'הדק התזה מובנה' },
    ],
    // First four are the jungle-green handle, last four the same handle in black.
    images: [
      asset('/products/anx-anaconda/1.webp'),
      asset('/products/anx-anaconda/2.webp'),
      asset('/products/anx-anaconda/3.webp'),
      asset('/products/anx-anaconda/4.webp'),
      asset('/products/anx-anaconda/5.webp'),
      asset('/products/anx-anaconda/6.webp'),
      asset('/products/anx-anaconda/7.webp'),
      asset('/products/anx-anaconda/8.webp'),
    ],
    video: {
      webm: '/video/anaconda-demo.webm',
      mp4: '/video/anaconda-demo.mp4',
      poster: '/video/anaconda-demo-poster.jpg',
    },
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
  },
];

export const getProduct = (slug: string): Product | undefined =>
  products.find((p) => p.slug === slug);

export const formatPrice = (price: number): string => `₪${price.toLocaleString('he-IL')}`;
