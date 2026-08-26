import type { SceneKind } from '@/components/landing/BeforeAfter';

/**
 * Central configuration for the /sofa-cleaning landing page.
 *
 * Everything the business will want to touch lives here — price, service
 * area, the hero video, the before/after gallery and the recent-jobs rail —
 * so swapping a photo or updating the area never means hunting through JSX.
 */
export const landing = {
  /** The anchor price. Shown in the hero, the price section, FAQ and JSON-LD. */
  price: 299,
  priceUnit: 'לספה תלת-מושבית',
  priceIncludes: ['ניקוי עמוק', 'טיפול בכתמים', 'חיטוי', 'ייבוש מואץ', 'מגיעים עד הבית'],

  /**
   * Service area, in ONE place. Kept deliberately non-specific until the
   * business supplies the exact list of cities — do not invent areas.
   */
  serviceAreaNote:
    'שלחו לנו בוואטסאפ את העיר שלכם יחד עם תמונת הספה — ותקבלו תשובה מיידית אם אנחנו מגיעים אליכם ומה המחיר.',

  /**
   * Hero video: 8–15s, autoplay/muted/loop, with a poster so the page paints
   * before a byte of video arrives. To swap in the dirty-sofa→clean-sofa clip
   * later, drop the files in /public/video and change these three paths.
   */
  heroVideo: {
    webm: '/video/anx-hero.webm',
    mp4: '/video/anx-hero.mp4',
    poster: '/video/anx-hero-poster.jpg',
    label: '🎥 צילום אמיתי מעבודה שלנו',
  },

  /**
   * Before/after gallery. Each entry renders an interactive drag slider.
   * `before` / `after` are optional real-photo paths (put files in
   * /public/lp/, e.g. before-1.webp + after-1.webp, ideally 1200×750);
   * while they are null the card draws its built-in illustration, so the
   * page never shows a grey "image missing" box.
   */
  beforeAfter: [
    { kind: 'sofa' as SceneKind, title: 'ספה תלת-מושבית', chips: ['ניקוי עמוק', 'טיפול בכתמים'], before: null, after: null },
    { kind: 'armchair' as SceneKind, title: 'כורסה', chips: ['לפני / אחרי', 'שאיבה מקצועית'], before: null, after: null },
    { kind: 'mattress' as SceneKind, title: 'מזרן', chips: ['ניקוי עמוק', 'הסרת כתמים'], before: null, after: null },
  ] as { kind: SceneKind; title: string; chips: string[]; before: string | null; after: string | null }[],

  /**
   * The recent-jobs rail. Only REAL content goes here — the field videos and
   * equipment photos that ship with the project. To add a photo card, drop
   * the file in /public/lp/ and add an entry with type: 'image'.
   * Wanted from the business (as .jpg/.webp, portrait or square):
   *   /lp/job-before-after-1.webp  — ספה אצל לקוח, לפני/אחרי
   *   /lp/dirty-water.webp         — המים המלוכלכים שנשאבו
   *   /lp/process-1.webp           — תהליך השאיבה אצל לקוח
   */
  jobs: [
    {
      type: 'video' as const,
      src: '/video/anx-demo',
      poster: '/video/anx-demo-poster.jpg',
      title: 'ניקוי עומק למזרן',
      chips: ['✓ ניקוי עמוק', '✓ תוצאה אמיתית'],
    },
    {
      type: 'video' as const,
      src: '/video/anaconda-demo',
      poster: '/video/anaconda-demo-poster.jpg',
      title: 'ריפוד כיסא בבית לקוח',
      chips: ['✓ עבודה מהשטח'],
    },
    {
      type: 'video' as const,
      src: '/video/anx-hero',
      poster: '/video/anx-hero-poster.jpg',
      title: 'שאיבת הלכלוך מהריפוד',
      chips: ['✓ ניקוי עמוק'],
    },
    {
      type: 'video' as const,
      src: '/video/course-stain-removal',
      poster: '/video/course-stain-removal-poster.jpg',
      title: 'טיפול בכתמים במזרן',
      chips: ['✓ הסרת כתמים'],
    },
    {
      type: 'image' as const,
      src: '/lp/equipment.webp',
      alt: 'ידית השאיבה המקצועית והצינורות — הציוד שאיתו אנחנו מגיעים',
      title: 'הציוד המקצועי שלנו',
      chips: ['✓ ציוד מקצועי'],
    },
    {
      type: 'image' as const,
      src: '/lp/equipment-2.webp',
      alt: 'ידית שאיבה מקצועית לניקוי ריפודים',
      title: 'הכלים שעושים את ההבדל',
      chips: ['✓ ציוד מקצועי'],
    },
  ] as (
    | { type: 'video'; src: string; poster: string; title: string; chips: string[] }
    | { type: 'image'; src: string; alt: string; title: string; chips: string[] }
  )[],
};
