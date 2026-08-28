/**
 * Service taxonomy, code-side source of truth. runSync upserts these into
 * adsignal_niches on every run, so adding a service here is all it takes.
 * The first entry's first keyword is the comparison ANCHOR: every relative-
 * volume batch includes it, which makes volumes comparable across services.
 */
export type ServiceDef = {
  key: string;
  name_he: string;
  name_en: string;
  keywords_he: string[];
  keywords_en: string[];
  sort: number;
};

export const SERVICES: ServiceDef[] = [
  { key: 'sofa_cleaning', name_he: 'ניקוי ספות', name_en: 'Sofa Cleaning', keywords_he: ['ניקוי ספות', 'ניקוי ריפודים'], keywords_en: ['sofa cleaning'], sort: 10 },
  { key: 'hvac', name_he: 'מזגנים', name_en: 'Air Conditioning', keywords_he: ['תיקון מזגנים', 'ניקוי מזגנים'], keywords_en: ['ac repair'], sort: 20 },
  { key: 'plumbing', name_he: 'אינסטלציה', name_en: 'Plumbing', keywords_he: ['אינסטלטור', 'פתיחת סתימות'], keywords_en: ['plumber'], sort: 30 },
  { key: 'pest_control', name_he: 'הדברה', name_en: 'Pest Control', keywords_he: ['הדברה', 'מדביר'], keywords_en: ['pest control'], sort: 40 },
  { key: 'renovation', name_he: 'שיפוצים', name_en: 'Renovation', keywords_he: ['שיפוצים', 'קבלן שיפוצים'], keywords_en: ['renovation'], sort: 50 },
  { key: 'auto', name_he: 'רכב', name_en: 'Auto Services', keywords_he: ['פוליש לרכב', 'מוסך נייד'], keywords_en: ['car detailing'], sort: 60 },
  { key: 'beauty', name_he: 'קוסמטיקה', name_en: 'Beauty', keywords_he: ['קוסמטיקאית', 'הסרת שיער בלייזר'], keywords_en: ['beauty salon'], sort: 70 },
  { key: 'dental', name_he: 'רפואת שיניים', name_en: 'Dental', keywords_he: ['רופא שיניים', 'השתלות שיניים'], keywords_en: ['dentist'], sort: 80 },
  { key: 'real_estate', name_he: 'נדל״ן', name_en: 'Real Estate', keywords_he: ['דירות למכירה', 'תיווך דירות'], keywords_en: ['real estate'], sort: 90 },
  { key: 'solar', name_he: 'סולארי', name_en: 'Solar', keywords_he: ['פאנלים סולאריים'], keywords_en: ['solar panels'], sort: 100 },
  { key: 'insurance', name_he: 'ביטוח', name_en: 'Insurance', keywords_he: ['ביטוח רכב', 'ביטוח דירה'], keywords_en: ['car insurance'], sort: 110 },
  { key: 'ecommerce', name_he: 'מסחר אלקטרוני', name_en: 'E-commerce', keywords_he: ['משלוח חינם קנייה'], keywords_en: ['online store'], sort: 120 },
  // Services added for the search-demand ranking
  { key: 'locksmith', name_he: 'מנעולן', name_en: 'Locksmith', keywords_he: ['מנעולן', 'פורץ מנעולים'], keywords_en: ['locksmith'], sort: 130 },
  { key: 'electrician', name_he: 'חשמלאי', name_en: 'Electrician', keywords_he: ['חשמלאי', 'חשמלאי מוסמך'], keywords_en: ['electrician'], sort: 140 },
  { key: 'moving', name_he: 'הובלות', name_en: 'Moving', keywords_he: ['הובלות', 'הובלת דירה'], keywords_en: ['moving company'], sort: 150 },
  { key: 'gardening', name_he: 'גינון', name_en: 'Gardening', keywords_he: ['גנן', 'עיצוב גינות'], keywords_en: ['gardening'], sort: 160 },
  { key: 'towing', name_he: 'גרר', name_en: 'Towing', keywords_he: ['גרר רכב', 'גרירת רכב'], keywords_en: ['towing'], sort: 170 },
  { key: 'waterproofing', name_he: 'איטום גגות', name_en: 'Waterproofing', keywords_he: ['איטום גגות', 'איטום'], keywords_en: ['roof waterproofing'], sort: 180 },
  { key: 'carpet_cleaning', name_he: 'ניקוי שטיחים', name_en: 'Carpet Cleaning', keywords_he: ['ניקוי שטיחים'], keywords_en: ['carpet cleaning'], sort: 190 },
  { key: 'window_cleaning', name_he: 'פוליש וניקיון', name_en: 'Cleaning Services', keywords_he: ['חברת ניקיון', 'פוליש'], keywords_en: ['cleaning services'], sort: 200 },
];

export const ANCHOR_KEYWORD = SERVICES[0].keywords_he[0]; // ניקוי ספות
