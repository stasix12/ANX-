import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from '@/components/icons';
import { categories } from '@/lib/products';
import { generalWhatsappLink, site } from '@/lib/site';

const siteLinks = [
  { href: '/#products', label: 'כל המוצרים' },
  { href: '/#why', label: 'למה ANX3D' },
  { href: '/#faq', label: 'שאלות נפוצות' },
  { href: '/#contact', label: 'צור קשר' },
];

export function Footer() {
  return (
    <footer className="border-t border-ink-700 bg-ink-950/60">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Logo withTagline />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-mist-300">
              ידיות שאיבה, צינורות ומתאמים למכונות Sabrina — מפותחים ומיוצרים עבור אנשי מקצוע
              בתחום ניקוי הספות והריפודים.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <a
                href={site.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="ANX3D באינסטגרם"
                className="grid h-10 w-10 place-items-center rounded-xl border border-ink-700 text-mist-300 transition-colors duration-200 hover:border-brand-500 hover:text-brand-700"
              >
                <InstagramIcon className="h-5 w-5" />
              </a>
              <a
                href={site.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="ANX3D בטיקטוק"
                className="grid h-10 w-10 place-items-center rounded-xl border border-ink-700 text-mist-300 transition-colors duration-200 hover:border-brand-500 hover:text-brand-700"
              >
                <TikTokIcon className="h-5 w-5" />
              </a>
              <a
                href={generalWhatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="פנייה בוואטסאפ"
                className="grid h-10 w-10 place-items-center rounded-xl border border-ink-700 text-mist-300 transition-colors duration-200 hover:border-[#25D366] hover:text-[#25D366]"
              >
                <WhatsAppIcon className="h-5 w-5" />
              </a>
            </div>
          </div>

          <nav aria-labelledby="footer-categories">
            <h2 id="footer-categories" className="text-sm font-bold tracking-wide text-mist-100">
              קטגוריות
            </h2>
            <ul className="mt-4 space-y-2.5">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href="/#products"
                    className="text-sm text-mist-300 transition-colors duration-200 hover:text-brand-700"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-links">
            <h2 id="footer-links" className="text-sm font-bold tracking-wide text-mist-100">
              ניווט
            </h2>
            <ul className="mt-4 space-y-2.5">
              {siteLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-mist-300 transition-colors duration-200 hover:text-brand-700"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm font-bold text-mist-100">{site.shippingNote}</p>
            <a
              href={`tel:+${site.whatsappNumber}`}
              className="mt-1.5 inline-block text-sm text-mist-300 transition-colors duration-200 hover:text-brand-700"
              dir="ltr"
            >
              {site.phoneDisplay}
            </a>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-ink-700 pt-6 text-xs text-mist-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.name} · {site.tagline}
          </p>
          <p>כל הזכויות שמורות · המחירים באתר כוללים מע״מ</p>
        </div>
      </div>
    </footer>
  );
}
