import Link from 'next/link';
import { LEGAL_DOCS } from '@/lib/shop/legal';
import { ShopFrame } from '../Chrome';

/** Terms / returns / privacy / accessibility — one static page per document. */
export function LegalView({ slug }: { slug: string }) {
  const doc = LEGAL_DOCS.find((d) => d.slug === slug) ?? LEGAL_DOCS[0];
  return (
    <ShopFrame nav={false} back="/">
      <article className="mx-auto max-w-3xl px-5 pt-4 pb-10 text-x-ink lg:pt-10">
        <h1 className="text-[26px] leading-tight font-black lg:text-4xl">{doc.title}</h1>
        <p className="mt-1 text-[13px] text-x-muted">עודכן לאחרונה: {doc.updated}</p>
        <p className="mt-4 text-[15px] leading-relaxed text-x-ink-2">{doc.intro}</p>
        {doc.sections.map((sec) => (
          <section key={sec.title} className="mt-6">
            <h2 className="text-[18px] font-extrabold">{sec.title}</h2>
            <div className="mt-2 space-y-2 text-[14.5px] leading-relaxed text-x-ink-2">
              {sec.body.map((b, i) =>
                typeof b === 'string' ? (
                  <p key={i}>{b}</p>
                ) : (
                  <ul key={i} className="list-disc space-y-1 ps-5">
                    {b.list.map((li) => (
                      <li key={li}>{li}</li>
                    ))}
                  </ul>
                ),
              )}
            </div>
          </section>
        ))}
        <nav aria-label="מסמכים נוספים" className="mt-10 border-t border-x-line pt-5">
          <ul className="flex flex-wrap gap-2">
            {LEGAL_DOCS.filter((d) => d.slug !== doc.slug).map((d) => (
              <li key={d.slug}>
                <Link href={`/shop/legal/${d.slug}`} className="inline-flex h-10 items-center rounded-full bg-x-soft px-4 text-[14px] font-bold text-x-ink-2 hover:text-x-blue">
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
    </ShopFrame>
  );
}
