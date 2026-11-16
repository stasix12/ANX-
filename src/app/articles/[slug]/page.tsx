import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleBody } from '@/components/seo/ArticleBody';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import { ChevronDownIcon, PhoneIcon, WhatsAppIcon } from '@/components/icons';
import {
  fetchCounterpart,
  fetchPublishedArticle,
  fetchPublishedArticles,
  fetchRelated,
  readingMinutes,
} from '@/lib/seo/articles';
import { LANG_META, cityBySlug, pricing, type Lang } from '@/lib/seo/config';
import { site, whatsappLink } from '@/lib/site';

/**
 * A published SEO article.
 *
 * The page is rendered for both languages, which is why `dir` and `lang` are
 * set on the article wrapper rather than inherited: the root layout is
 * permanently `lang="he" dir="rtl"` for the rest of the site, and the spec
 * forbids changing existing behaviour, so a Russian article flips direction
 * inside its own subtree instead.
 *
 * Revalidation rather than a rebuild: approving an article in the dashboard
 * writes to Supabase, and the page picks it up within the window below without
 * a deploy.
 */
export const revalidate = 300;

/**
 * A slug that is never a real article.
 *
 * `output: export` refuses to build a dynamic route whose generateStaticParams
 * returns nothing, and with no articles published yet (or no Supabase
 * configured, as on a bare checkout) that is exactly what happens. Emitting
 * this one sentinel keeps `npm run export` — which this repo uses to publish to
 * GitHub Pages — building on an empty database. The page calls notFound() for
 * it, so the export writes a 404 at that path: nothing links to it, the sitemap
 * never lists it, and it cannot be mistaken for content.
 */
const EXPORT_PLACEHOLDER_SLUG = '__no-articles-yet__';

/**
 * Pre-renders every article published at build time; anything approved later is
 * rendered on first request. In a static export only the build-time set exists,
 * which is correct — a static host has nothing to render on demand.
 */
export async function generateStaticParams() {
  const articles = await fetchPublishedArticles();
  if (articles.length === 0) return [{ slug: EXPORT_PLACEHOLDER_SLUG }];
  return articles.map((a) => ({ slug: a.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await fetchPublishedArticle(slug);
  if (!article) return { title: 'המאמר לא נמצא', robots: { index: false, follow: false } };

  const other: Lang = article.lang === 'he' ? 'ru' : 'he';
  const counterpart = await fetchCounterpart(article.topic_key, other);

  /*
   * hreflang only ever names versions that are actually live. A tag pointing at
   * an unpublished counterpart would be a broken signal to Google, so the map
   * starts with this version and gains the other only when one exists.
   */
  const languages: Record<string, string> = {
    [LANG_META[article.lang].htmlLang]: `/articles/${article.slug}`,
  };
  if (counterpart) {
    languages[LANG_META[other].htmlLang] = `/articles/${counterpart.slug}`;
  }

  return {
    title: article.title,
    description: article.meta_description,
    alternates: { canonical: `/articles/${article.slug}`, languages },
    openGraph: {
      type: 'article',
      locale: article.lang === 'he' ? 'he_IL' : 'ru_RU',
      url: `${site.url}/articles/${article.slug}`,
      title: article.title,
      description: article.meta_description,
      publishedTime: article.published_at ?? undefined,
      modifiedTime: article.updated_at,
    },
    twitter: { card: 'summary_large_image', title: article.title, description: article.meta_description },
    robots: { index: true, follow: true },
  };
}

/** Per-language UI strings. The articles are bilingual, so the chrome must be too. */
const UI = {
  he: {
    home: 'דף הבית',
    articles: 'מאמרים',
    minutes: 'דקות קריאה',
    faq: 'שאלות ותשובות',
    related: 'עוד בנושא',
    ctaTitle: 'רוצים לדעת כמה זה יעלה אצלכם?',
    ctaText: 'שלחו תמונה של הספה או המזרן בוואטסאפ, ותקבלו הצעת מחיר.',
    whatsapp: 'שליחת תמונה בוואטסאפ',
    call: 'התקשרו עכשיו',
    readMore: 'קראו עוד',
    otherLang: 'Читать по-русски',
  },
  ru: {
    home: 'Главная',
    articles: 'Статьи',
    minutes: 'мин. чтения',
    faq: 'Вопросы и ответы',
    related: 'Похожие статьи',
    ctaTitle: 'Хотите узнать, сколько это будет стоить?',
    ctaText: 'Отправьте фото дивана или матраса в WhatsApp — и получите цену.',
    whatsapp: 'Отправить фото в WhatsApp',
    call: 'Позвонить',
    readMore: 'Читать',
    otherLang: 'קראו בעברית',
  },
} as const;

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await fetchPublishedArticle(slug);
  if (!article) notFound();

  const other: Lang = article.lang === 'he' ? 'ru' : 'he';
  const [counterpart, related] = await Promise.all([
    fetchCounterpart(article.topic_key, other),
    fetchRelated(article),
  ]);

  const t = UI[article.lang];
  const meta = LANG_META[article.lang];
  const city = cityBySlug(article.city);
  const cityName = city ? (article.lang === 'he' ? city.he : city.ru) : null;

  const wa = whatsappLink(
    article.lang === 'he'
      ? `היי, הגעתי מהמאמר "${article.title}" באתר ואשמח לקבל הצעת מחיר לניקוי`
      : `Здравствуйте, я со статьи "${article.title}" на сайте — хочу получить цену на химчистку`,
  );

  /* Article + FAQPage + BreadcrumbList, from the stored content only. */
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.meta_description,
    inLanguage: meta.htmlLang,
    datePublished: article.published_at ?? article.created_at,
    dateModified: article.updated_at,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${site.url}/articles/${article.slug}` },
    author: { '@type': 'Organization', name: 'הפתרון המבריק' },
    publisher: { '@type': 'Organization', name: 'הפתרון המבריק' },
    ...(cityName ? { contentLocation: { '@type': 'Place', name: cityName } } : {}),
  };

  const faqJsonLd = article.faq.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: article.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      }
    : null;

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t.home, item: site.url },
      { '@type': 'ListItem', position: 2, name: t.articles, item: `${site.url}/articles` },
      { '@type': 'ListItem', position: 3, name: article.title, item: `${site.url}/articles/${article.slug}` },
    ],
  };

  return (
    <div
      /* crm-theme is the cleaning business's light palette; the article sets its
         own direction so a Russian page reads LTR inside an RTL site. */
      className="crm-theme min-h-dvh bg-ink-950 pb-16"
      lang={meta.htmlLang}
      dir={meta.dir}
    >
      <header className="border-b border-ink-800 bg-ink-850">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
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

      <article className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
        <nav aria-label="breadcrumb" className="mb-6 text-sm text-mist-500">
          <Link href="/sofa-cleaning" className="hover:text-brand-400">{t.home}</Link>
          <span className="mx-2">/</span>
          <Link href="/articles" className="hover:text-brand-400">{t.articles}</Link>
        </nav>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {cityName ? (
            <span className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-400">
              {cityName}
            </span>
          ) : null}
          <span className="text-xs font-medium text-mist-500">
            {readingMinutes(article)} {t.minutes}
          </span>
          {counterpart ? (
            <Link
              href={`/articles/${counterpart.slug}`}
              hrefLang={LANG_META[other].htmlLang}
              className="ms-auto rounded-full border border-ink-800 px-3 py-1 text-xs font-bold text-brand-400 hover:bg-ink-850"
            >
              {t.otherLang}
            </Link>
          ) : null}
        </div>

        {/* The page's single H1. ArticleBody starts its headings at H2. */}
        <h1 className="text-3xl font-black leading-tight text-mist-100 sm:text-[2.6rem]">
          {article.h1 || article.title}
        </h1>

        <div className="mt-8">
          <ArticleBody body={article.body} />
        </div>

        {/* Price disclaimer, shown whenever the article is about money at all.
            Cheap insurance: the quality gate also demands it in the text. */}
        <p className="mt-10 rounded-2xl border border-ink-800 bg-ink-850 p-4 text-sm leading-relaxed text-mist-500">
          {pricing.disclaimer[article.lang]}
        </p>

        {article.faq.length ? (
          <section className="mt-12">
            <h2 className="text-2xl font-black text-mist-100">{t.faq}</h2>
            <div className="mt-5 space-y-3">
              {article.faq.map((f) => (
                <details
                  key={f.q}
                  className="group surface rounded-2xl border border-ink-800 open:border-brand-500/45"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-start font-extrabold text-mist-100">
                    <span>{f.q}</span>
                    <ChevronDownIcon className="h-5 w-5 shrink-0 text-brand-500 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="px-4 pb-4 leading-relaxed text-mist-300">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {article.internal_links.length ? (
          <nav className="mt-12 rounded-2xl border border-ink-800 bg-ink-850 p-5">
            <ul className="space-y-2">
              {article.internal_links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="font-bold text-brand-400 hover:underline">
                    {l.anchor} →
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <section className="mt-12 rounded-card border border-ink-800 bg-ink-850 p-6 text-center sm:p-8">
          <h2 className="text-2xl font-black text-mist-100">{t.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-md leading-relaxed text-mist-300">{t.ctaText}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <WhatsAppLink
              href={wa}
              className="flex w-full items-center justify-center gap-2.5 rounded-full bg-emerald-500 px-7 py-4 font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600 sm:w-auto"
            >
              <WhatsAppIcon className="h-5 w-5 shrink-0" />
              {t.whatsapp}
            </WhatsAppLink>
            <a
              href={`tel:+${site.whatsappNumber}`}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-ink-800 px-7 py-4 font-extrabold text-brand-400 transition hover:bg-ink-900 sm:w-auto"
            >
              <PhoneIcon className="h-5 w-5 shrink-0" />
              <span dir="ltr">{site.phoneDisplay}</span>
            </a>
          </div>
        </section>

        {related.length ? (
          <section className="mt-12">
            <h2 className="text-xl font-black text-mist-100">{t.related}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/articles/${r.slug}`}
                    className="surface block h-full rounded-2xl border border-ink-800 p-4 font-bold text-mist-100 transition hover:border-brand-500/45"
                  >
                    {r.title}
                    <span className="mt-2 block text-sm font-medium text-brand-400">{t.readMore} →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      {faqJsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
    </div>
  );
}
