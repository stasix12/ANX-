import type { Metadata } from 'next';
import { BeforeAfter, type SceneKind } from '@/components/landing/BeforeAfter';
import { JobVideoCard } from '@/components/landing/JobVideoCard';
import { LeadForm } from '@/components/landing/LeadForm';
import { Reveal } from '@/components/landing/Reveal';
import { ReviewsCarousel, type Review } from '@/components/landing/ReviewsCarousel';
import { StickyCta } from '@/components/landing/StickyCta';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  HomeIcon,
  MachineIcon,
  PhoneIcon,
  TagIcon,
  WhatsAppIcon,
} from '@/components/icons';
import { asset, site, whatsappLink } from '@/lib/site';

export const metadata: Metadata = {
  title: 'ניקוי ספות מקצועי עד הבית — החל מ־299 ₪',
  description:
    'ניקוי ספות בבית הלקוח: ניקוי עומק בציוד מקצועי, טיפול בכתמים וייבוש מהיר — החל מ־299 ₪, מחיר סגור מראש בוואטסאפ. שלחו תמונה של הספה וקבלו מחיר תוך דקות.',
  alternates: { canonical: '/sofa-cleaning' },
  openGraph: {
    title: 'ניקוי ספות מקצועי עד הבית — החל מ־299 ₪',
    description: 'שלחו תמונה של הספה בוואטסאפ וקבלו מחיר סגור מראש. ניקוי עומק, טיפול בכתמים וייבוש מהיר.',
  },
};

/* The number the whole page is built around, in one editable place. */
const offer = {
  price: '299',
  includes: ['ניקוי עמוק', 'טיפול בכתמים', 'שאיבה מקצועית', 'עבודה בבית הלקוח', 'מחיר ברור מראש'],
};

/*
 * Every CTA opens WhatsApp with a slightly different opening line, so the
 * business can tell from the first message which part of the page converted.
 */
const waHero = whatsappLink('היי 🙂 מצרפ/ת תמונה של הספה — אשמח לקבל מחיר');
const waResults = whatsappLink('היי, ראיתי את התוצאות באתר 👀 אשמח לדעת כמה יעלה אצלי');
const waPrice = whatsappLink('היי, לגבי ניקוי ספה החל מ־299 ₪ — שולח/ת תמונה לקבלת מחיר');

/* Only claims the business actually stands behind — no invented numbers. */
const trust = [
  { icon: HomeIcon, title: 'מגיעים עד הבית', desc: 'עם כל הציוד — אתם רק פותחים את הדלת' },
  { icon: MachineIcon, title: 'ציוד מקצועי', desc: 'מכונות שאיבה וניקוי בלחץ ייעודיות' },
  { icon: TagIcon, title: 'מחיר ברור מראש', desc: 'נסגר בוואטסאפ, בלי הפתעות ביום הניקוי' },
  { icon: ClockIcon, title: 'שירות מהיר', desc: 'תיאום פשוט וייבוש מהיר בסוף העבודה' },
];

const results: { kind: SceneKind; title: string; chips: string[] }[] = [
  { kind: 'sofa', title: 'ספה תלת-מושבית', chips: ['ניקוי עמוק', 'טיפול בכתמים'] },
  { kind: 'armchair', title: 'כורסה', chips: ['לפני / אחרי', 'שאיבה מקצועית'] },
  { kind: 'mattress', title: 'מזרן', chips: ['ניקוי עמוק', 'הסרת כתמים'] },
];

/* Real footage from the field — the videos already shipped with the site. */
const recentJobs = [
  {
    src: '/video/anx-demo',
    poster: '/video/anx-demo-poster.jpg',
    title: 'ניקוי עומק למזרן',
    chips: ['עוד לקוח מרוצה ✓', 'ניקוי עמוק'],
  },
  {
    src: '/video/anaconda-demo',
    poster: '/video/anaconda-demo-poster.jpg',
    title: 'ריפוד כיסא בבית לקוח',
    chips: ['עבודה מהשטח', 'שאיבה מקצועית'],
  },
  {
    src: '/video/anx-hero',
    poster: '/video/anx-hero-poster.jpg',
    title: 'שאיבת הלכלוך מהריפוד',
    chips: ['ככה זה נראה מקרוב', 'ניקוי עמוק'],
  },
  {
    src: '/video/course-stain-removal',
    poster: '/video/course-stain-removal-poster.jpg',
    title: 'טיפול בכתמים במזרן',
    chips: ['עוד לקוח מרוצה ✓', 'טיפול בכתמים'],
  },
];

const steps = [
  {
    title: 'שולחים תמונה',
    desc: 'מצלמים את הספה, שולחים בוואטסאפ ומקבלים מחיר סגור מראש — בלי ביקור מדידה.',
  },
  {
    title: 'מגיעים אליכם',
    desc: 'מתאמים מועד נוח, ואנחנו מגיעים עם כל הציוד והחומרים. אין מה להכין מראש.',
  },
  {
    title: 'ניקוי עומק וטיפול בכתמים',
    desc: 'שאיבה מקצועית, ניקוי בלחץ עם חומר שמותאם לסוג הבד, וטיפול נקודתי בכל כתם.',
  },
  {
    title: 'ייבוש מהיר ותוצאה',
    desc: 'מסיימים בייבוש מהיר, והספה נשארת רעננה ונקייה — מוכנה לשימוש בהקדם.',
  },
];

/*
 * PLACEHOLDER testimonials, carried over from the previous version of this
 * page — swap for real customer quotes (with permission) before running paid
 * traffic. Do not add ratings/averages that don't exist.
 */
const reviews: Review[] = [
  {
    name: 'מיכל',
    city: 'ראשון לציון',
    text: 'הייתי בטוחה שנצטרך לזרוק את הספה אחרי שהילדים "קישטו" אותה. יצאה כמו חדשה, פשוט וואו. שירות אדיב ומהיר.',
  },
  {
    name: 'יוסי',
    city: 'חולון',
    text: 'הגיעו באותו יום, סיימו תוך שעה וחצי, והמחיר היה בדיוק מה שסגרנו בוואטסאפ. בלי הפתעות. ממליץ בחום.',
  },
  {
    name: 'אורית',
    city: 'תל אביב',
    text: 'ניקו לנו ספה ושני מזרנים. הריח בבית השתנה לגמרי והאלרגיה של הבת שלי נרגעה. מזמינה אותם כל חצי שנה.',
  },
];

const faqItems = [
  {
    question: 'כמה עולה ניקוי ספה?',
    answer:
      'החל מ־299 ₪ לספה תלת-מושבית סטנדרטית. המחיר המדויק תלוי בגודל, בסוג הבד ובמצב הכתמים — שלחו תמונה בוואטסאפ ותקבלו מחיר סופי וסגור מראש. המחיר שנסגר הוא המחיר שתשלמו, בלי תוספות ביום הניקוי.',
  },
  {
    question: 'כמה זמן לוקח הניקוי?',
    answer:
      'ספה תלת-מושבית סטנדרטית לוקחת בדרך כלל בין 45 דקות לשעה וחצי, תלוי במצבה. אנחנו מגיעים עם כל הציוד — אתם לא צריכים להכין כלום חוץ מגישה לחשמל ולמים.',
  },
  {
    question: 'מתי אפשר לשבת על הספה אחרי הניקוי?',
    answer:
      'אנחנו מסיימים בייבוש מהיר שמקצר משמעותית את ההמתנה, וברוב המקרים הספה מוכנה לשימוש תוך שעות ספורות — תלוי בסוג הבד ובאוורור בבית.',
  },
  {
    question: 'כל כתם באמת יורד?',
    answer:
      'רוב הכתמים — כן: אוכל, שתייה, לכלוך יומיומי וריחות. כתמים ותיקים מאוד או כאלה שנוקו בעבר בחומר לא נכון עלולים להשאיר סימן. אנחנו אומרים לכם בכנות מה ריאלי עוד לפני שסגרתם, לא אחרי.',
  },
  {
    question: 'מה עוד אתם מנקים חוץ מספות?',
    answer:
      'גם מזרנים, שטיחים, כורסאות, כיסאות פינת אוכל וריפודי רכב. אפשר לשלב כמה פריטים באותו ביקור — ציינו את זה בהודעה ותקבלו מחיר לחבילה.',
  },
  {
    question: 'לאילו אזורים אתם מגיעים?',
    answer:
      'שלחו לנו בוואטסאפ את העיר שלכם יחד עם תמונת הספה — ותקבלו תשובה מיידית אם אנחנו מגיעים אליכם ומה המחיר.',
  },
];

const businessJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'הפתרון המבריק — ניקוי ספות',
  description: 'ניקוי ספות, מזרנים ושטיחים מקצועי בבית הלקוח.',
  url: `${site.url}/sofa-cleaning`,
  telephone: `+${site.whatsappNumber}`,
  areaServed: 'IL',
  makesOffer: {
    '@type': 'Offer',
    itemOffered: { '@type': 'Service', name: 'ניקוי ספה בבית הלקוח' },
    price: offer.price,
    priceCurrency: 'ILS',
  },
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
};

/** The big green button, reworded per placement; size classes come from the call site. */
function WaButton({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <WhatsAppLink
      href={href}
      className={`flex items-center justify-center gap-2.5 rounded-full bg-emerald-500 font-extrabold text-white shadow-lg shadow-emerald-500/25 transition duration-300 hover:bg-emerald-600 hover:shadow-xl hover:shadow-emerald-500/30 active:scale-[0.98] ${className}`}
    >
      <WhatsAppIcon className="h-6 w-6 shrink-0" />
      {children}
    </WhatsAppLink>
  );
}

export default function SofaCleaningLandingPage() {
  return (
    /*
     * crm-theme flips the site's dark-amber tokens to the cleaning business's
     * light water-blue palette; the opaque bg covers the store's dark fixed
     * backdrop that layout.tsx paints behind every page. Bottom padding keeps
     * the floating mobile CTA off the footer text.
     */
    <div className="crm-theme relative min-h-dvh overflow-x-clip bg-ink-950 pb-28 text-mist-100 sm:pb-0">
      {/* Minimal header: brand + phone. No nav — nowhere to leak out of the funnel. */}
      <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-850/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <p className="text-lg font-black">
            <span className="text-brand-400">הפתרון</span>{' '}
            <span className="text-emerald-600">המבריק</span>
          </p>
          <a
            href={`tel:+${site.whatsappNumber}`}
            className="flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 font-extrabold text-on-brand transition hover:bg-brand-600"
          >
            <PhoneIcon className="h-4 w-4" />
            <span dir="ltr">{site.phoneDisplay}</span>
          </a>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pt-20 lg:pb-24">
        <div>
          <h1 className="text-[2.6rem] font-black leading-[1.08] text-balance-he sm:text-6xl">
            הספה נראית אבודה?
            <br />
            <span className="text-brand-400">תנו לנו שעה.</span>
          </h1>

          <p className="mt-6 text-xl leading-relaxed text-mist-300">
            ניקוי ספות מקצועי בבית הלקוח, החל מ־
          </p>
          <p className="lp-price-pop mt-1 flex items-baseline gap-2">
            <span className="text-6xl font-black tracking-tight text-brand-400 sm:text-7xl">
              299&nbsp;₪
            </span>
            <span className="text-lg font-bold text-mist-500">מחיר סגור מראש</span>
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <WaButton href={waHero} className="px-8 py-4 text-lg">
              📸 שלחו תמונה וקבלו מחיר ב-WhatsApp
            </WaButton>
            <a
              href={`tel:+${site.whatsappNumber}`}
              className="flex items-center justify-center gap-2 rounded-full px-6 py-4 text-lg font-extrabold text-brand-400 transition hover:bg-ink-850"
            >
              <PhoneIcon className="h-5 w-5 shrink-0" />
              או התקשרו: <span dir="ltr" className="whitespace-nowrap">{site.phoneDisplay}</span>
            </a>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2.5 text-sm font-bold text-mist-300">
            {['מגיעים עד הבית', 'ציוד מקצועי', 'מחיר ברור מראש', 'שירות מהיר'].map((chip) => (
              <li key={chip} className="flex items-center gap-1.5">
                <CheckIcon className="h-4 w-4 text-emerald-600" />
                {chip}
              </li>
            ))}
          </ul>
        </div>

        {/* Real process footage, not a stock image: an extraction wand pulling
            the dirt out of upholstery. Muted loop, poster first — the page
            paints before the video arrives. */}
        <Reveal>
          <figure className="relative overflow-hidden rounded-card shadow-2xl">
            <video
              className="aspect-4/3 w-full object-cover"
              poster={asset('/video/anx-hero-poster.jpg')}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label="צילום אמיתי של שאיבת הלכלוך מריפוד במהלך ניקוי"
            >
              <source src={asset('/video/anx-hero.webm')} type="video/webm" />
              <source src={asset('/video/anx-hero.mp4')} type="video/mp4" />
            </video>
            <figcaption className="absolute bottom-3 start-3 rounded-full bg-black/50 px-4 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
              🎥 צילום אמיתי מעבודה שלנו
            </figcaption>
          </figure>
        </Reveal>
      </section>

      {/* ── Trust indicators ─────────────────────────────────────────────── */}
      <section aria-label="למה לבחור בנו" className="border-y border-ink-800 bg-ink-850">
        <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4">
          {trust.map((item, i) => (
            <li key={item.title}>
              <Reveal delay={i * 90} className="flex flex-col items-center gap-2 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400">
                  <item.icon className="h-6 w-6" />
                </span>
                <span className="font-extrabold">{item.title}</span>
                <span className="text-sm leading-snug text-mist-500">{item.desc}</span>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Before / after results ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <Reveal>
          <h2 className="text-center text-3xl font-black sm:text-4xl">
            ההבדל שרואים (ומריחים) מיד
          </h2>
          <p className="mx-auto mt-3 mb-10 max-w-lg text-center text-lg text-mist-300">
            גררו את הידית על כל כרטיס וראו מה ניקוי עומק מקצועי עושה.
          </p>
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-3">
          {results.map((result, i) => (
            <Reveal key={result.kind} delay={i * 110}>
              <div className="transition-transform duration-300 sm:hover:-translate-y-1.5">
                <BeforeAfter kind={result.kind} />
                <div className="mt-3 flex items-center justify-between px-1">
                  <p className="font-extrabold">{result.title}</p>
                  <p className="flex gap-1.5">
                    {result.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-bold text-brand-400"
                      >
                        {chip}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-12">
          <div className="surface flex flex-col items-center justify-between gap-4 rounded-card p-6 text-center sm:flex-row sm:text-start">
            <p className="text-lg font-extrabold sm:text-xl">
              רוצים לדעת כמה יעלה לכם?
              <span className="block text-sm font-medium text-mist-500 sm:mt-1">
                שלחו תמונה של הספה — התשובה מגיעה תוך דקות.
              </span>
            </p>
            <WaButton href={waResults} className="shrink-0 px-6 py-4 text-base">
              קבלו הצעת מחיר ב-WhatsApp
            </WaButton>
          </div>
        </Reveal>
      </section>

      {/* ── Recent jobs ──────────────────────────────────────────────────── */}
      <section className="overflow-x-clip bg-ink-850 py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h2 className="text-3xl font-black sm:text-4xl">עבודות מהימים האחרונים</h2>
            <p className="mt-3 mb-8 max-w-lg text-lg text-mist-300">
              וידאו אמיתי מהשטח — בלי פילטרים ובלי תמונות סטוק. גללו הצידה ולחצו להפעלה.
            </p>
          </Reveal>
          <Reveal>
            <div className="crm-snap -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-1">
              {recentJobs.map((job) => (
                <JobVideoCard key={job.src} {...job} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Price card ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <Reveal>
          <div className="relative mx-auto max-w-md">
            {/* Soft brand glow behind the card sells "premium" without noise. */}
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-brand-400/25 via-transparent to-emerald-400/25 blur-2xl"
            />
            <div className="overflow-hidden rounded-card border border-ink-800 bg-ink-850 shadow-2xl">
              <div className="crm-hero relative p-7 text-center text-white">
                <span className="bubble" />
                <span className="bubble" />
                <span className="bubble" />
                <span className="bubble" />
                <p className="text-lg font-black">🔥 המחיר שלנו</p>
                <p className="mt-3 text-xl font-bold">ניקוי ספה</p>
                <p className="mt-1 text-sm font-medium text-white/85">החל מ־</p>
                <p className="text-6xl font-black tracking-tight">299&nbsp;₪</p>
              </div>
              <div className="p-7">
                <ul className="space-y-3">
                  {offer.includes.map((line) => (
                    <li key={line} className="flex items-center gap-3 font-bold">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <CheckIcon className="h-4 w-4" />
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
                <WaButton href={waPrice} className="mt-7 w-full px-6 py-4 text-base">
                  שלחו תמונה לקבלת מחיר
                </WaButton>
                <p className="mt-3 text-center text-xs text-mist-500">
                  המחיר הסופי נקבע לפי גודל הספה ומצבה — ונסגר מראש, לפני שהגענו.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Process ──────────────────────────────────────────────────────── */}
      <section className="bg-ink-850 py-16 lg:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <h2 className="text-center text-3xl font-black sm:text-4xl">איך זה עובד?</h2>
            <p className="mx-auto mt-3 mb-12 max-w-lg text-center text-lg text-mist-300">
              מתמונה בוואטסאפ ועד ספה נקייה — בארבעה שלבים.
            </p>
          </Reveal>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li key={step.title}>
                <Reveal delay={i * 110} className="h-full">
                  <div className="surface h-full rounded-card p-6 transition-transform duration-300 sm:hover:-translate-y-1.5">
                    <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-lg font-black text-on-brand">
                      {i + 1}
                    </span>
                    <h3 className="mb-1.5 font-extrabold">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-mist-300">{step.desc}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Reviews ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <Reveal>
          <h2 className="text-center text-3xl font-black sm:text-4xl">לקוחות שכבר ניקו איתנו</h2>
          <p className="mx-auto mt-3 mb-10 max-w-lg text-center text-lg text-mist-300">
            ככה זה מרגיש כשהספה חוזרת הביתה נקייה.
          </p>
        </Reveal>
        <Reveal>
          <ReviewsCarousel reviews={reviews} />
        </Reveal>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-title" className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <Reveal>
          <h2 id="faq-title" className="text-center text-3xl font-black sm:text-4xl">
            שאלות נפוצות
          </h2>
        </Reveal>
        <div className="mt-10 space-y-3">
          {faqItems.map((item, i) => (
            <Reveal key={item.question} delay={Math.min(i * 60, 240)}>
              <details className="group surface rounded-2xl border border-ink-800 transition-colors duration-300 open:border-brand-500/45">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-start font-extrabold">
                  <span>{item.question}</span>
                  <ChevronDownIcon className="h-5 w-5 shrink-0 text-brand-500 transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-5 leading-relaxed text-mist-300">{item.answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="border-t border-ink-800 bg-ink-850">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6 lg:py-24">
          <Reveal>
            <h2 className="text-3xl font-black text-balance-he sm:text-4xl">
              רוצים לדעת כמה יעלה לכם?
            </h2>
            <p className="mx-auto mt-4 mb-10 max-w-md text-lg text-mist-300">
              שלחו תמונה בוואטסאפ או השאירו פרטים — ותקבלו מחיר סגור מראש, בלי ביקור מדידה ובלי
              התחייבות.
            </p>
          </Reveal>
          <Reveal>
            <div className="surface mx-auto max-w-md rounded-card p-6 text-start sm:p-7">
              <LeadForm compact />
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="px-4 py-8 text-center text-sm text-mist-500">
        הפתרון המבריק — ניקוי ספות, מזרנים ושטיחים עד הבית ·{' '}
        <a href={`tel:+${site.whatsappNumber}`} className="font-bold text-brand-400">
          <span dir="ltr" className="whitespace-nowrap">{site.phoneDisplay}</span>
        </a>
      </footer>

      <StickyCta />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </div>
  );
}
