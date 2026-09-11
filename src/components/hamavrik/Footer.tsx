import Link from 'next/link';
import { PhoneLink, WaLink } from '@/components/hamavrik/CtaLinks';
import { Logo } from '@/components/hamavrik/Logo';
import { FacebookIcon } from '@/components/hamavrik/icons';
import { InstagramIcon, PhoneIcon, TikTokIcon, WhatsAppIcon } from '@/components/icons';
import { business, landingPages, nav, serviceAreas, services } from '@/lib/hamavrik/config';
import { href, waLinkFor } from '@/lib/hamavrik/links';

export function Footer() {
  const social = [
    { key: 'instagram', url: business.social.instagram, Icon: InstagramIcon, label: 'אינסטגרם' },
    { key: 'facebook', url: business.social.facebook, Icon: FacebookIcon, label: 'פייסבוק' },
    { key: 'tiktok', url: business.social.tiktok, Icon: TikTokIcon, label: 'טיקטוק' },
  ].filter((s) => s.url);

  return (
    <footer id="contact" className="border-t border-ink-800 bg-white pb-28 pt-14 sm:pb-14">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist-300">{business.description}</p>
          <div className="mt-5 flex flex-col gap-2 text-sm font-bold">
            <PhoneLink location="footer" className="inline-flex items-center gap-2 text-brand-400 hover:underline">
              <PhoneIcon className="h-4 w-4" />
              <span dir="ltr">{business.phoneDisplay}</span>
            </PhoneLink>
            <WaLink
              href={waLinkFor('(מהפוטר)')}
              location="footer"
              className="inline-flex items-center gap-2 text-wa-600 hover:underline"
            >
              <WhatsAppIcon className="h-4 w-4" />
              שליחת הודעה ב-WhatsApp
            </WaLink>
          </div>
          {social.length ? (
            <ul className="mt-5 flex gap-2">
              {social.map(({ key, url, Icon, label }) => (
                <li key={key}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="grid h-10 w-10 place-items-center rounded-full bg-ink-900 text-mist-300 transition-colors hover:bg-brand-300 hover:text-brand-400"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-black tracking-wide text-mist-500">ניווט</h3>
          <ul className="space-y-2 text-sm font-bold">
            {nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="text-mist-300 hover:text-brand-400">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-black tracking-wide text-mist-500">השירותים שלנו</h3>
          <ul className="space-y-2 text-sm font-bold">
            {services.map((s) => (
              <li key={s.id}>
                <a href="#services" className="text-mist-300 hover:text-brand-400">
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-black tracking-wide text-mist-500">אזורי שירות</h3>
          <ul className="space-y-2 text-sm font-bold">
            {landingPages.map((page) => (
              <li key={page.slug}>
                <Link href={href(`/${page.slug}`)} className="text-mist-300 hover:text-brand-400">
                  {page.h1}
                </Link>
              </li>
            ))}
            <li className="pt-1 text-xs font-medium text-mist-500">
              {serviceAreas.primary.join(', ')} ו{serviceAreas.regionLabel}
            </li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 border-t border-ink-800 px-4 pt-6 text-xs text-mist-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} {business.name}. כל הזכויות שמורות.
        </p>
        <p>ניקוי ספות, מזרנים, שטיחים וריפודים — בבית הלקוח.</p>
      </div>
    </footer>
  );
}
