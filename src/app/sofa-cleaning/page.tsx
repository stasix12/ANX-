import type { Metadata } from 'next';
import { BeforeAfter } from '@/components/landing/BeforeAfter';
import { LeadForm } from '@/components/landing/LeadForm';
import { StickyCta } from '@/components/landing/StickyCta';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldIcon,
  StarIcon,
  WhatsAppIcon,
} from '@/components/icons';
import { site, whatsappLink } from '@/lib/site';

export const metadata: Metadata = {
  title: 'ניקוי ספות מקצועי עד הבית — הספה כמו חדשה עוד היום',
  description:
    'ניקוי ספות, מזרנים ושטיחים בבית הלקוח: ניקוי עומק בציוד מקצועי, חומרים בטוחים לילדים ולבעלי חיים וייבוש מהיר. הצעת מחיר מיידית בוואטסאפ — בלי הפתעות במחיר.',
  alternates: { canonical: '/sofa-cleaning' },
  openGraph: {
    title: 'ניקוי ספות מקצועי עד הבית',
    description: 'ניקוי עומק לספות, מזרנים ושטיחים — עד הבית, עם אחריות מלאה על התוצאה.',
  },
};

const heroWhatsapp = whatsappLink('היי, אשמח להצעת מחיר לניקוי ספה 🛋️');

/*
 * The proof numbers and the testimonials below are realistic placeholders —
 * the business swaps in its own numbers, names and Google-review quotes here.
 * Everything else on the page is generic enough to ship as-is.
 */
const stats = [
  { value: '+1,200', label: 'ספות שניקינו' },
  { value: '7', label: 'שנות ניסיון' },
  { value: '5★', label: 'דירוג בגוגל' },
  { value: '100%', label: 'אחריות על התוצאה' },
];

const services = [
  { emoji: '🛋️', title: 'ניקוי ספות', desc: 'בד, קטיפה, מיקרופייבר ודמוי עור — כולל הסרת כתמים וריחות' },
  { emoji: '🪑', title: 'פינות אוכל וכיסאות', desc: 'ריפודי כיסאות חוזרים לצבע המקורי, בלי סימני שימוש' },
  { emoji: '🛏️', title: 'ניקוי מזרנים', desc: 'ניקוי עומק וחיטוי — קריטי לסובלים מאלרגיות ולחדרי ילדים' },
  { emoji: '🧶', title: 'ניקוי שטיחים', desc: 'שטיחים מקיר לקיר ושטיחים מעוצבים, ישירות בבית שלכם' },
  { emoji: '🚗', title: 'ריפודי רכב', desc: 'מושבים, דיפונים ותקרה — הרכב מרגיש כמו אחרי טיפול סוכנות' },
  { emoji: '🧸', title: 'הדברת קרדית האבק', desc: 'חיטוי בקיטור בטמפרטורה גבוהה — פתרון טבעי, ללא כימיקלים' },
];

const steps = [
  {
    title: 'אבחון קצר',
    desc: 'בודקים את סוג הבד והכתמים ומתאימים חומר וטכניקה — לא כל ספה מנקים אותו דבר.',
  },
  {
    title: 'שאיבת עומק',
    desc: 'מוציאים את האבק, הפירורים וקרדית האבק שמצטברים עמוק בתוך הריפוד.',
  },
  {
    title: 'ניקוי בלחץ + חומר ייעודי',
    desc: 'שטיפה בלחץ עם חומרים מקצועיים ובטוחים לילדים ולבעלי חיים, כתם אחרי כתם.',
  },
  {
    title: 'חיטוי וייבוש מהיר',
    desc: 'מסיימים בחיטוי והצנעת ריחות. הספה מוכנה לישיבה תוך שעות ספורות.',
  },
];

const testimonials = [
  {
    name: 'מיכל, ראשון לציון',
    text: 'הייתי בטוחה שנצטרך לזרוק את הספה אחרי שהילדים "קישטו" אותה. יצאה כמו חדשה, פשוט וואו. שירות אדיב ומהיר.',
  },
  {
    name: 'יוסי, חולון',
    text: 'הגיעו באותו יום, סיימו תוך שעה וחצי, והמחיר היה בדיוק מה שסגרנו בוואטסאפ. בלי הפתעות. ממליץ בחום.',
  },
  {
    name: 'אורית, תל אביב',
    text: 'ניקו לנו ספה ושני מזרנים. הריח בבית השתנה לגמרי והאלרגיה של הבת שלי נרגעה. מזמינה אותם כל חצי שנה.',
  },
];

const faqItems = [
  {
    question: 'כמה עולה ניקוי ספה?',
    answer:
      'המחיר תלוי בגודל הספה, בסוג הבד ובמצב הכתמים. שלחו לנו תמונה בוואטסאפ ותקבלו מחיר סופי וסגור מראש — המחיר שנסגר הוא המחיר שתשלמו, בלי תוספות ביום הניקוי.',
  },
  {
    question: 'כמה זמן לוקח הניקוי?',
    answer:
      'ספה תלת-מושבית סטנדרטית לוקחת בין 45 דקות לשעה וחצי, תלוי במצבה. אנחנו מגיעים עם כל הציוד — אתם לא צריכים להכין כלום חוץ מגישה לחשמל ולמים.',
  },
  {
    question: 'מתי אפשר לשבת על הספה אחרי הניקוי?',
    answer:
      'הייבוש לוקח בדרך כלל 2–4 שעות, תלוי בבד ובאוורור. אנחנו מסיימים בייבוש מכני שמקצר את הזמן, וברוב הבתים יושבים על הספה עוד באותו ערב.',
  },
  {
    question: 'החומרים בטוחים לילדים ולבעלי חיים?',
    answer:
      'כן. אנחנו עובדים עם חומרים מקצועיים המאושרים לשימוש ביתי, ומסיימים בשטיפה שמוציאה את שאריות החומר מהריפוד. אפשר לבקש מראש ניקוי בקיטור בלבד — ללא כימיקלים כלל.',
  },
  {
    question: 'כל כתם באמת יורד?',
    answer:
      'רוב הכתמים — כן: אוכל, שתייה, לכלוך יומיומי וריחות. כתמים ותיקים מאוד או כאלה שנוקו בעבר בחומר לא נכון עלולים להשאיר סימן. אנחנו אומרים לכם בכנות מה ריאלי עוד לפני שסגרתם, לא אחרי.',
  },
  {
    question: 'לאילו אזורים אתם מגיעים?',
    answer:
      'אנחנו מגיעים לכל אזור המרכז והסביבה. לא בטוחים אם אנחנו מגיעים אליכם? שלחו הודעה בוואטסאפ עם העיר שלכם ותקבלו תשובה תוך דקות.',
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
  priceRange: '₪₪',
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

function CtaPair() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <WhatsAppLink
        href={heroWhatsapp}
        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-7 py-4 text-lg font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600 active:scale-[0.98]"
      >
        <WhatsAppIcon className="h-6 w-6" />
        הצעת מחיר בוואטסאפ
      </WhatsAppLink>
      <a
        href={`tel:+${site.whatsappNumber}`}
        className="flex items-center justify-center gap-2 rounded-xl border-2 border-brand-500 px-7 py-4 text-lg font-extrabold text-brand-400 transition hover:bg-brand-500 hover:text-on-brand active:scale-[0.98]"
      >
        <PhoneIcon className="h-6 w-6" />
        {site.phoneDisplay}
      </a>
    </div>
  );
}

function Stars() {
  return (
    <span aria-hidden className="flex gap-0.5 text-amber-400">
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon key={i} className="h-4 w-4 fill-current" />
      ))}
    </span>
  );
}

export default function SofaCleaningLandingPage() {
  return (
    /*
     * crm-theme flips the site's dark-amber tokens to the cleaning business's
     * light water-blue palette; the opaque bg covers the store's dark fixed
     * backdrop that layout.tsx paints behind every page.
     */
    <div className="crm-theme relative min-h-dvh bg-ink-950 pb-24 text-mist-100 sm:pb-0">
      {/* Minimal header: brand + phone. No nav — nowhere to leak out of the funnel. */}
      <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-850/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <p className="text-lg font-black">
            <span className="text-brand-400">הפתרון</span>{' '}
            <span className="text-emerald-600">המבריק</span>
          </p>
          <a
            href={`tel:+${site.whatsappNumber}`}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 font-extrabold text-on-brand transition hover:bg-brand-600"
          >
            <PhoneIcon className="h-4 w-4" />
            <span dir="ltr">{site.phoneDisplay}</span>
          </a>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-10 pb-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-bold text-emerald-800">
            <ShieldIcon className="h-4 w-4" />
            לא מרוצים מהתוצאה? לא שילמתם.
          </p>

          <h1 className="text-4xl font-black leading-tight text-balance-he sm:text-5xl">
            ניקוי ספות מקצועי עד הבית —{' '}
            <span className="text-brand-400">הספה שלכם כמו חדשה, עוד היום</span>
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist-300">
            ניקוי עומק עם ציוד מקצועי, חומרים בטוחים לילדים ולבעלי חיים וייבוש מהיר. אנחנו מגיעים
            אליכם עם הכול — אתם רק פותחים את הדלת.
          </p>

          <ul className="mt-6 space-y-2.5">
            {[
              'הסרת כתמים, ריחות וקרדית האבק',
              'מחיר נסגר מראש בוואטסאפ — בלי הפתעות',
              'זמינות גם לימים הקרובים',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 font-medium">
                <CheckIcon className="mt-1 h-5 w-5 shrink-0 text-emerald-600" />
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <CtaPair />
          </div>

          <div className="mt-6 flex items-center gap-3 text-sm text-mist-500">
            <Stars />
            מבוסס על ביקורות אמיתיות של לקוחות בגוגל
          </div>
        </div>

        {/* The form is in the first viewport on desktop; on mobile it comes
            right after the pitch, before any scrolling content. */}
        <div className="surface rounded-card border border-ink-800 p-6 sm:p-7">
          <h2 className="text-xl font-black">קבלו מחיר תוך דקות</h2>
          <p className="mt-1 mb-5 text-sm text-mist-500">
            משאירים פרטים — וחוזרים אליכם בוואטסאפ עם מחיר סגור.
          </p>
          <LeadForm />
        </div>
      </section>

      {/* ── Proof numbers ────────────────────────────────────────────────── */}
      <section className="border-y border-ink-800 bg-ink-850">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:grid-cols-4 sm:px-6">
          {stats.map((s) => (
            // flex-col + order put the big number above its label while the
            // DOM keeps the dt-before-dd order the <dl> element requires.
            <div key={s.label} className="flex flex-col">
              <dt className="order-2 text-sm font-medium text-mist-500">{s.label}</dt>
              <dd className="text-3xl font-black text-brand-400">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Before / after ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-black">ההבדל שרואים (ומריחים) מיד</h2>
        <p className="mx-auto mt-2 mb-8 max-w-lg text-center text-mist-300">
          גררו את הידית וראו מה ניקוי עומק מקצועי עושה לספה.
        </p>
        <BeforeAfter />
      </section>

      {/* ── Process ──────────────────────────────────────────────────────── */}
      <section className="bg-ink-850 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-black">איך זה עובד?</h2>
          <p className="mx-auto mt-2 mb-10 max-w-lg text-center text-mist-300">
            תהליך של 4 שלבים שמחזיר לספה את היום הראשון שלה.
          </p>
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li key={step.title} className="surface rounded-card p-6">
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-lg font-black text-on-brand">
                  {i + 1}
                </span>
                <h3 className="mb-1.5 font-extrabold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-mist-300">{step.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center text-3xl font-black">לא רק ספות</h2>
        <p className="mx-auto mt-2 mb-10 max-w-lg text-center text-mist-300">
          מזמינים כמה שירותים באותו ביקור — ומקבלים מחיר משתלם יותר על החבילה.
        </p>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <li key={s.title} className="surface flex items-start gap-4 rounded-card p-5">
              <span aria-hidden className="text-3xl">
                {s.emoji}
              </span>
              <div>
                <h3 className="font-extrabold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mist-300">{s.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="bg-ink-850 py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-black">לקוחות מספרים</h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {testimonials.map((t) => (
              <figure key={t.name} className="surface rounded-card p-6">
                <Stars />
                <blockquote className="mt-3 leading-relaxed text-mist-100">
                  &ldquo;{t.text}&rdquo;
                </blockquote>
                <figcaption className="mt-4 text-sm font-bold text-mist-500">{t.name}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Guarantee banner ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="crm-hero relative overflow-hidden rounded-card p-8 text-center text-white sm:p-12">
          <span className="bubble" />
          <span className="bubble" />
          <span className="bubble" />
          <span className="bubble" />
          <span className="bubble" />
          <span className="bubble" />
          <ShieldIcon className="mx-auto mb-4 h-12 w-12" />
          <h2 className="text-3xl font-black text-balance-he">
            אחריות מלאה: לא מרוצים? לא שילמתם.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-lg leading-relaxed text-white/90">
            אנחנו כל כך בטוחים בתוצאה, שאם הספה לא תיראה טוב יותר באופן משמעותי — הביקור עלינו. בלי
            אותיות קטנות.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-bold">
            <span className="flex items-center gap-1.5">
              <ClockIcon className="h-4 w-4" /> זמינות גם לימים הקרובים
            </span>
            <span className="flex items-center gap-1.5">
              <MapPinIcon className="h-4 w-4" /> שירות עד הבית באזור המרכז והסביבה
            </span>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-title" className="mx-auto max-w-3xl px-4 pb-14 sm:px-6">
        <h2 id="faq-title" className="text-center text-3xl font-black">
          שאלות נפוצות
        </h2>
        <div className="mt-8 space-y-2.5">
          {faqItems.map((item) => (
            <details
              key={item.question}
              className="group surface rounded-2xl border border-ink-800 open:border-brand-500/45"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-start font-bold">
                <span>{item.question}</span>
                <ChevronDownIcon className="h-5 w-5 shrink-0 text-brand-500 transition-transform duration-300 group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-4 leading-relaxed text-mist-300">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="border-t border-ink-800 bg-ink-850">
        <div className="mx-auto max-w-2xl px-4 py-14 text-center sm:px-6">
          <h2 className="text-3xl font-black text-balance-he">
            הספה מחכה. קבלו מחיר סגור תוך דקות.
          </h2>
          <p className="mx-auto mt-3 mb-8 max-w-md text-mist-300">
            שלחו תמונה של הספה בוואטסאפ ותקבלו הצעת מחיר מיידית — בלי ביקור מדידה ובלי התחייבות.
          </p>
          <div className="surface mx-auto max-w-md rounded-card p-6 text-start">
            <LeadForm compact />
          </div>
        </div>
      </section>

      <footer className="px-4 py-6 pb-28 text-center text-sm text-mist-500 sm:pb-6">
        הפתרון המבריק — ניקוי ספות, מזרנים ושטיחים עד הבית ·{' '}
        <a href={`tel:+${site.whatsappNumber}`} className="font-bold text-brand-400">
          <span dir="ltr">{site.phoneDisplay}</span>
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
