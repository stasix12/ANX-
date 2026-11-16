import type { Metadata } from 'next';
import Link from 'next/link';
import { PhoneIcon } from '@/components/icons';
import { fetchPublishedArticles, readingMinutes } from '@/lib/seo/articles';
import { CITIES, LANG_META, cityBySlug } from '@/lib/seo/config';
import { site } from '@/lib/site';

/**
 * The article index — the hub every article links back to, and the page that
 * gives Google a single crawlable list of the content.
 *
 * Both languages live on one index rather than two: the list is small, and a
 * reader who lands here from a Russian article should be able to see that
 * Hebrew articles exist (and vice versa). Each entry carries its own `lang` and
 * `dir`, so the two scripts render correctly side by side.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'מאמרים על ניקוי ספות, מזרנים וריפודים בדרום | הפתרון המבריק',
  description:
    'מדריכים מקצועיים על ניקוי ספות, מזרנים, שטיחים וריפודי רכב בבאר שבע, ערד, דימונה ואופקים — איך עובד התהליך, מה משפיע על המחיר ומה ריאלי לצפות.',
  alternates: { canonical: '/articles' },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    url: `${site.url}/articles`,
    title: 'מאמרים על ניקוי ספות וריפודים בדרום | הפתרון המבריק',
    description: 'מדריכים מקצועיים על ניקוי ספות, מזרנים, שטיחים וריפודי רכב באזור הדרום.',
  },
  robots: { index: true, follow: true },
};

export default async function ArticlesIndexPage() {
  const articles = await fetchPublishedArticles();

  return (
    <div className="crm-theme min-h-dvh bg-ink-950 pb-16" dir="rtl">
      <header className="border-b border-ink-800 bg-ink-850">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/sofa-cleaning" className="text-lg font-black">
            <span className="text-brand-400">הפתרון</span> <span className="text-emerald-600">המבריק</span>
          </Link>
          <a
            href={`tel:+${site.whatsappNumber}`}
            className="flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-extrabold text-on-brand"
          >
            <PhoneIcon className="h-4 w-4" />
            <span dir="ltr">{site.phoneDisplay}</span>
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
        <h1 className="text-3xl font-black text-mist-100 sm:text-4xl">מאמרים ומדריכים</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-mist-300">
          תוכן מקצועי על ניקוי ספות, מזרנים, שטיחים וריפודי רכב — מותאם לאזור השירות שלנו:{' '}
          {CITIES.map((c) => c.he).join(', ')} והסביבה.
        </p>

        {articles.length === 0 ? (
          /* An honest empty state. No placeholder cards pretending to be content. */
          <p className="mt-10 rounded-card border border-ink-800 bg-ink-850 p-6 leading-relaxed text-mist-500">
            עוד אין מאמרים שפורסמו. מאמרים חדשים נכתבים בכל שבוע ומתפרסמים לאחר אישור.
          </p>
        ) : (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {articles.map((a) => {
              const meta = LANG_META[a.lang];
              const city = cityBySlug(a.city);
              const cityName = city ? (a.lang === 'he' ? city.he : city.ru) : null;
              return (
                <li key={a.slug}>
                  <Link
                    href={`/articles/${a.slug}`}
                    hrefLang={meta.htmlLang}
                    lang={meta.htmlLang}
                    dir={meta.dir}
                    className="surface flex h-full flex-col rounded-card border border-ink-800 p-5 transition hover:border-brand-500/45"
                  >
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {cityName ? (
                        <span className="rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-bold text-brand-400">
                          {cityName}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-ink-800 px-2.5 py-0.5 text-xs font-bold text-mist-500">
                        {meta.label}
                      </span>
                    </div>
                    <h2 className="text-lg font-extrabold leading-snug text-mist-100">{a.title}</h2>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-mist-300">
                      {a.meta_description}
                    </p>
                    <span className="mt-auto pt-4 text-xs font-medium text-mist-500">
                      {readingMinutes(a)} {a.lang === 'he' ? 'דקות קריאה' : 'мин. чтения'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
