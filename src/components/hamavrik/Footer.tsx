import Link from 'next/link';
import { PhoneLink, WaLink } from '@/components/hamavrik/CtaLinks';
import { Logo } from '@/components/hamavrik/Logo';
import { FacebookIcon } from '@/components/hamavrik/icons';
import { ChevronDownIcon, InstagramIcon, PhoneIcon, TikTokIcon, WhatsAppIcon } from '@/components/icons';
import { acCleaning, business, landingPages, nav, serviceAreas, services } from '@/lib/hamavrik/config';
import { href, waLink } from '@/lib/hamavrik/links';

/**
 * Footer. On phones the three link groups collapse into native <details>
 * accordions (no JS); on desktop they open as columns. Contact stays visible
 * everywhere.
 */
function LinkGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <details className="group border-b border-ink-800 md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm font-black tracking-wide text-mist-500 [&::-webkit-details-marker]:hidden">
          {title}
          <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="space-y-1 pb-3 text-sm font-bold">{children}</ul>
      </details>
      <div className="hidden md:block">
        <h3 className="mb-3 text-sm font-black tracking-wide text-mist-500">{title}</h3>
        <ul className="space-y-1 text-sm font-bold">{children}</ul>
      </div>
    </>
  );
}

export function Footer() {
  const social = [
    { key: 'instagram', url: business.social.instagram, Icon: InstagramIcon, label: 'אינסטגרם' },
    { key: 'facebook', url: business.social.facebook, Icon: FacebookIcon, label: 'פייסבוק' },
    { key: 'tiktok', url: business.social.tiktok, Icon: TikTokIcon, label: 'טיקטוק' },
  ].filter((s) => s.url);

  return (
    <footer id="contact" className="border-t border-ink-800 bg-white pt-8 sm:pt-10">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-8">
        <div>
          <Logo />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-mist-300">{business.tagline}. {serviceAreas.primary.join(', ')} ו{serviceAreas.regionLabel}.</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
            <PhoneLink location="footer" className="inline-flex items-center gap-2 text-brand-400 hover:underline">
              <PhoneIcon className="h-4 w-4" />
              <span dir="ltr">{business.phoneDisplay}</span>
            </PhoneLink>
            <WaLink href={waLink()} location="footer" className="inline-flex items-center gap-2 text-wa-600 hover:underline">
              <WhatsAppIcon className="h-4 w-4" />
              שלחו תמונה, קבלו מחיר
            </WaLink>
          </div>
          {social.length ? (
            <ul className="mt-3 flex gap-2">
              {social.map(({ key, url, Icon, label }) => (
                <li key={key}>
                  <a href={url} target="_blank" rel="noopener noreferrer" aria-label={label} className="grid h-9 w-9 place-items-center rounded-full bg-ink-900 text-mist-300 transition-colors hover:bg-brand-300 hover:text-brand-400">
                    <Icon className="h-4.5 w-4.5" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="md:contents">
          <LinkGroup title="ניווט">
            {nav.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="block py-2 text-mist-300 hover:text-brand-400">
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link href={href('/gallery')} prefetch={false} className="block py-2 text-mist-300 hover:text-brand-400">
                לפני ואחרי
              </Link>
            </li>
            {business.googleMapsUrl ? (
              <li>
                <a href={business.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="block py-2 text-mist-300 hover:text-brand-400">
                  ראו אותנו בגוגל
                </a>
              </li>
            ) : null}
          </LinkGroup>
          <LinkGroup title="השירותים שלנו">
            {services.map((s) => {
              /* A real page where one exists (the sofa page is the Beer Sheva
                 one); the others point at the services section. */
              const page = s.id === 'sofa' ? landingPages.find((p) => p.slug === 'beer-sheva') : landingPages.find((p) => p.service === s.id);
              return (
                <li key={s.id}>
                  {page ? (
                    <Link href={href(`/${page.slug}`)} prefetch={false} className="block py-2 text-mist-300 hover:text-brand-400">
                      {s.name}
                    </Link>
                  ) : (
                    <a href="#services" className="block py-2 text-mist-300 hover:text-brand-400">
                      {s.name}
                    </a>
                  )}
                </li>
              );
            })}
            <li>
              <a href="#air-conditioners" className="block py-2 text-mist-300 hover:text-brand-400">
                {acCleaning.name}
              </a>
            </li>
          </LinkGroup>
          <LinkGroup title="אזורי שירות">
            {landingPages.map((page) => (
              <li key={page.slug}>
                <Link href={href(`/${page.slug}`)} prefetch={false} className="block py-2 text-mist-300 hover:text-brand-400">
                  {page.h1}
                </Link>
              </li>
            ))}
          </LinkGroup>
        </div>
      </div>

      <div className="mx-auto mt-4 flex max-w-6xl flex-col gap-1 border-t border-ink-800 px-4 py-4 text-xs text-mist-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:mt-8">
        <p>
          © {new Date().getFullYear()} {business.name}. כל הזכויות שמורות.
        </p>
        <p>ניקוי ספות, מזרנים, שטיחים וריפודים – בבית הלקוח.</p>
      </div>
    </footer>
  );
}
