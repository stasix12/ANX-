import type { Category, ColorOption, Product, ShopDB, User } from './types';

/**
 * Starting catalogue of the /shop store — professional upholstery / carpet
 * cleaning accessories made by ANX3D with 3D printing.
 *
 * Only facts that already exist in this repository are filled in:
 *  - ANACONDA, the ANACONDA set and the hose clips: name, price, text, colors
 *    and real photos from the existing store (src/lib/products.ts).
 *  - Pump box and modular wand: dimensions from their CAD sources (stl/).
 * Everything that was not supplied — most prices, weights, materials,
 * machine compatibility, usage notes, connection diameters — is left empty
 * for the admin panel (/shop/admin). No ratings or stock counts are invented.
 * Images cut from the design mock-up are captioned "תמונה להמחשה".
 */

const img = (name: string) => `/shop/img2/${name}.webp`;
const real = (slug: string, n: number) => `/products/${slug}/${n}.webp`;
const ILLUSTRATIVE = 'תמונה להמחשה';
const CAD = 'הדמיית תכנון (CAD)';

export const COLORS = {
  black: { id: 'black', name: 'שחור', swatch: ['#1d1f24'] },
  blue: { id: 'blue', name: 'כחול', swatch: ['#2f6bff', '#121419'] },
  green: { id: 'green', name: 'ירוק', swatch: ['#22b04b', '#121419'] },
  jungle: { id: 'jungle', name: 'ירוק ג׳ונגל', swatch: ['#c9e83a'] },
  red: { id: 'red', name: 'אדום', swatch: ['#ef3b3f', '#a3191d'] },
  purple: { id: 'purple', name: 'סגול', swatch: ['#7d4cf2', '#121419'] },
  white: { id: 'white', name: 'לבן', swatch: ['#f5f5f7'] },
} satisfies Record<string, ColorOption>;

export const COLOR_LIST: ColorOption[] = Object.values(COLORS);

export const SEED_CATEGORIES: Category[] = [
  { slug: 'handles', name: 'ידיות לניקוי ספות', shortName: 'ידיות', icon: 'handle', image: img('cat-handles'), sortOrder: 1 },
  { slug: 'wands', name: 'טולים לניקוי שטיחים', shortName: 'טולים שטיחים', icon: 'wand', image: img('cat-wands'), sortOrder: 2 },
  { slug: 'adapters', name: 'מתאמים ומחברים', shortName: 'מתאמים', icon: 'adapter', image: img('cat-adapters'), sortOrder: 3 },
  { slug: 'suction', name: 'אביזרי שאיבה', shortName: 'אביזרי שאיבה', icon: 'suction', image: img('cat-suction'), sortOrder: 4 },
  { slug: 'accessories', name: 'אביזרים משלימים', shortName: 'משלימים', icon: 'accessory', image: img('cat-accessories'), sortOrder: 5 },
  { slug: 'parts', name: 'חלקי חילוף', shortName: 'חלקי חילוף', icon: 'parts', image: img('cat-parts'), sortOrder: 6 },
];

const created = (daysAgo: number) => new Date(Date.UTC(2026, 9, 1) - daysAgo * 86_400_000).toISOString();

const base = {
  subtitle: '',
  compareAtPrice: undefined,
  colors: [] as ColorOption[],
  variants: [],
  imageNotes: {} as Record<string, string>,
  specs: [],
  compatibility: [] as string[],
  highlights: [] as string[],
  usage: '',
  stock: null,
  rating: 0,
  reviewCount: 0,
  featured: false,
  published: true,
  digital: false,
  material: '',
  tags: [] as string[],
} satisfies Partial<Product>;

const anacondaGreen = [1, 2, 3, 4].map((n) => real('anx-anaconda', n));
const anacondaBlack = [5, 6, 7, 8].map((n) => real('anx-anaconda', n));

export const SEED_PRODUCTS: Product[] = [
  {
    ...base,
    id: 'p-anaconda',
    slug: 'anaconda',
    name: 'ANACONDA',
    subtitle: 'ידית מקצועית לניקוי ספות',
    description:
      'ANX ANACONDA היא ידית השאיבה שלנו לניקוי ספות וריפודים. הגוף מיוצר בישראל מחומרים חזקים ועמידים במיוחד לחום ולשחיקה של עבודה יומיומית, עם אטם קצף היקפי סביב פתח השאיבה שנצמד לבד ושומר על ואקום מלא לאורך המשיכה. ההדק מאפשר לשלוט בהתזה תוך כדי עבודה בלי להוריד את היד מהידית, והחיבור המהיר בבסיס מתחבר ומתנתק בלי כלים.',
    categories: ['handles'],
    price: 850,
    images: [...anacondaGreen, ...anacondaBlack],
    colors: [
      { ...COLORS.jungle, images: anacondaGreen },
      { ...COLORS.black, images: anacondaBlack },
    ],
    video: { webm: '/video/anaconda-demo.webm', mp4: '/video/anaconda-demo.mp4', poster: '/video/anaconda-demo-poster.jpg' },
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
    compatibility: ['Sabrina — ידית שאיבה לניקוי ספות וריפודים'],
    featured: true,
    tags: ['anaconda', 'handle', 'ידית', 'שאיבה', 'הזרקה', 'ספות', 'ריפודים', 'sabrina', 'סברינה'],
    createdAt: created(5),
    sortOrder: 1,
  },
  {
    ...base,
    id: 'p-wand-of-troy',
    slug: 'wand-of-troy',
    name: 'Wand of Troy',
    subtitle: 'טול לניקוי שטיחים',
    description: 'טול שאיבה והזרקה לניקוי שטיחים. המפרט, המחיר והתאימות יעודכנו בקרוב.',
    categories: ['wands'],
    price: null,
    images: [img('cat-wands')],
    imageNotes: { [img('cat-wands')]: ILLUSTRATIVE },
    featured: true,
    tags: ['wand', 'troy', 'טול', 'שטיחים', 'שטיח', 'carpet'],
    createdAt: created(3),
    sortOrder: 2,
  },
  {
    ...base,
    id: 'p-connector-360',
    slug: 'connector-360',
    name: 'מחבר מסתובב 360°',
    subtitle: 'בין הידית לצינור השאיבה',
    description:
      'מחבר מסתובב בין הידית לצינור, שמאפשר לסובב את הידית לכל כיוון בלי שהצינור יתפתל או ימשוך את היד אחורה. כלול גם בסט ANACONDA המלא.',
    categories: ['adapters'],
    price: null,
    images: [img('connector-360')],
    imageNotes: { [img('connector-360')]: ILLUSTRATIVE },
    featured: true,
    tags: ['360', 'connector', 'swivel', 'מחבר', 'מסתובב'],
    createdAt: created(8),
    sortOrder: 3,
  },
  {
    ...base,
    id: 'p-crevice-head',
    slug: 'crevice-head',
    name: 'ראש שאיבה לחריצים',
    subtitle: 'לפינות ולאזורים צרים',
    description: 'ראש שאיבה צר לניקוי חריצים, פינות ואזורים צרים. המפרט והמחיר יעודכנו בקרוב.',
    categories: ['suction'],
    price: null,
    images: [img('crevice-head'), img('cat-suction')],
    imageNotes: { [img('crevice-head')]: ILLUSTRATIVE, [img('cat-suction')]: ILLUSTRATIVE },
    featured: true,
    tags: ['crevice', 'nozzle', 'ראש', 'חריצים', 'פינות', 'שאיבה'],
    createdAt: created(10),
    sortOrder: 4,
  },
  {
    ...base,
    id: 'p-hose-adapters',
    slug: 'hose-adapters',
    name: 'מתאמי צינורות שאיבה',
    subtitle: 'מתאמים ומחברי שאיבה',
    description: 'מתאמים לחיבור צינורות שאיבה בקטרים שונים. הקטרים הזמינים, המחיר והתאימות יעודכנו בקרוב.',
    categories: ['adapters'],
    price: null,
    images: [img('cat-adapters')],
    imageNotes: { [img('cat-adapters')]: ILLUSTRATIVE },
    tags: ['adapter', 'hose', 'מתאם', 'צינור', 'שאיבה'],
    createdAt: created(12),
    sortOrder: 5,
  },
  {
    ...base,
    id: 'p-water-fittings',
    slug: 'water-fittings',
    name: 'אביזרי חיבור והזרקת מים',
    subtitle: 'מחברים לקו ההזרקה',
    description: 'מחברים ואביזרים לקו המים וההזרקה. הסוגים, המידות והמחיר יעודכנו בקרוב.',
    categories: ['adapters'],
    price: null,
    images: [img('cat-adapters')],
    imageNotes: { [img('cat-adapters')]: ILLUSTRATIVE },
    tags: ['water', 'fitting', 'injection', 'מים', 'הזרקה', 'מחבר'],
    createdAt: created(14),
    sortOrder: 6,
  },
  {
    ...base,
    id: 'p-shurflo-box',
    slug: 'shurflo-box',
    name: 'קופסה למשאבת Shurflo',
    subtitle: 'מארז מודפס למשאבה',
    description:
      'מארז ANX3D למשאבת הממברנה Shurflo 8095-901-890: בסיס ומכסה הנסגרים בברגים, פתחי מים לחיבורי לחיצה ופתח לכבל החשמל, משטח ורגליות TPU לבידוד רעידות, ואוזני הרכבה בשני הצדדים.',
    categories: ['accessories'],
    price: null,
    images: [img('shurflo-box-cad'), img('shurflo-box-cad-open'), img('shurflo-box-render')],
    imageNotes: { [img('shurflo-box-cad')]: CAD, [img('shurflo-box-cad-open')]: CAD, [img('shurflo-box-render')]: ILLUSTRATIVE },
    cardImage: img('shurflo-box-render'),
    specs: [
      { label: 'מידות חיצוניות', value: '210 × 170 × 120 מ״מ' },
      { label: 'מבנה', value: 'בסיס (82 מ״מ) + מכסה (38 מ״מ), 6 ברגי M4' },
      { label: 'חיבורי מים', value: 'כניסה ויציאה — פתחי 17 מ״מ לחיבורי לחיצה PM8 (צינור 8 מ״מ)' },
      { label: 'חשמל', value: 'פתח לגלנד M16' },
      { label: 'בידוד רעידות', value: 'משטח TPU מתחת למשאבה ו-4 רגליות TPU' },
      { label: 'הרכבה', value: 'אוזני הרכבה בשני הצדדים, חורי 5.5 מ״מ' },
    ],
    compatibility: ['משאבת Shurflo 8095-901-890 (230VAC) עם זוויות לחיצה PL 3/8" בשני הפתחים'],
    tags: ['shurflo', 'pump', 'box', 'משאבה', 'קופסה', 'מארז'],
    createdAt: created(1),
    sortOrder: 7,
  },
  {
    ...base,
    id: 'p-anaconda-set',
    slug: 'anaconda-set',
    name: 'סט ANACONDA מלא',
    subtitle: 'ידית, צינור משולב ומחבר 360°',
    description:
      'הסט המלא של ANACONDA: ידית השאיבה, צינור הזרקה שעובר בתוך צינור השאיבה, ומחבר מסתובב 360° בין הידית לצינור. צינור אחד במקום שניים מקבילים — פחות סיבוכים מתחת לרגליים ופחות מה לגרור בין חדר לחדר.',
    categories: ['handles', 'accessories'],
    price: 1600,
    images: [1, 2, 3, 4].map((n) => real('anx-anaconda-set', n)),
    colors: [{ ...COLORS.jungle }, { ...COLORS.black }],
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
    compatibility: ['Sabrina — סט שאיבה והזרקה לניקוי ספות וריפודים'],
    tags: ['anaconda', 'set', 'סט', 'ערכה', 'צינור', 'ידית'],
    createdAt: created(6),
    sortOrder: 8,
  },
  {
    ...base,
    id: 'p-hose-clips',
    slug: 'hose-clips',
    name: 'סט קליפסים לצינורות',
    subtitle: '6 יחידות',
    description:
      'הקליפסים מחברים את צינור השאיבה וצינור ההזרקה לקו אחד לאורך כל המשיכה — במקום שני צינורות שנפרדים באמצע העבודה ומסתבכים. הקליפס נפתח בצד: לוחצים אותו על הצינורות ביד, בלי כלים ובלי אזיקונים, ומזיזים אותו לאורך הצינור בכל רגע.',
    categories: ['accessories'],
    price: 279,
    images: [1, 2, 3, 4].map((n) => real('anx-hose-clips', n)),
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
    compatibility: ['מאחד צינור שאיבה וצינור הזרקה', 'ניתן להוסיף לסט צינורות קיים'],
    tags: ['clips', 'hose', 'קליפס', 'קליפסים', 'צינור'],
    createdAt: created(9),
    sortOrder: 9,
  },
  {
    ...base,
    id: 'p-modular-wand',
    slug: 'modular-wand',
    name: 'מוט שאיבה מודולרי 1 מ׳',
    subtitle: '4 חלקים עם חיבורי הברגה',
    description:
      'מוט שאיבה באורך מטר המורכב מארבעה צינורות של 250 מ״מ ושלושה מחברי הברגה נסתרים. קצה אחד נלחץ לראש שאיבה 38 מ״מ, והקצה השני מתאים לצינור פלדה בקוטר פנימי של כ-36–37 מ״מ. כל צינור ניתן להחלפה בנפרד.',
    categories: ['parts'],
    price: null,
    images: [img('wand-tubes-parts-cad'), img('wand-tubes-cad')],
    imageNotes: { [img('wand-tubes-parts-cad')]: CAD, [img('wand-tubes-cad')]: CAD },
    specs: [
      { label: 'אורך מורכב', value: '1000 מ״מ' },
      { label: 'צינורות', value: '4 × 250 מ״מ, קוטר חיצוני 40 מ״מ, דופן 7 מ״מ' },
      { label: 'מחברים', value: '3 מחברי הברגה M34×4, אורך 80 מ״מ' },
      { label: 'קצה לראש השאיבה', value: 'חיבור לחיצה 38 מ״מ' },
      { label: 'קצה לצינור פלדה', value: 'קוטר פנימי ~36–37 מ״מ' },
    ],
    tags: ['wand', 'tube', 'extension', 'מוט', 'צינור', 'הארכה', 'M34'],
    createdAt: created(20),
    sortOrder: 10,
  },
];

/** Demo admin. Password: anx3d-admin (shown on the demo login screen). */
const DEMO_ADMIN: User = {
  id: 'u-admin',
  email: 'admin@anx3d.demo',
  name: 'מנהל חנות (דמו)',
  phone: '',
  passwordHash: '010be5056bf098a10d6560b6fdd4b7531d1446345d6aefbed6d9b78486e33cc9',
  role: 'admin',
  addresses: [],
  marketingOptIn: false,
  createdAt: created(60),
};

/** Bumped when the seed changes shape, so browsers drop the old demo catalogue. */
export const DB_VERSION = 2;

export function buildSeedDB(): ShopDB {
  return {
    version: DB_VERSION,
    products: structuredClone(SEED_PRODUCTS),
    categories: structuredClone(SEED_CATEGORIES),
    users: [structuredClone(DEMO_ADMIN)],
    orders: [],
    settings: {
      sampleDataNotice: false,
      // Delivery options and coupons are placeholders to edit in the admin.
      shippingMethods: [
        { id: 'standard', name: 'משלוח רגיל', eta: '1-3 ימי עסקים', price: 15, freeFrom: null },
        { id: 'express', name: 'משלוח מהיר', eta: 'יום עסקים אחד', price: 35, freeFrom: null },
        { id: 'pickup', name: 'איסוף עצמי', eta: 'בתיאום מראש', price: 0, freeFrom: null },
      ],
      coupons: [],
      nextOrderNumber: 10245,
    },
  };
}
