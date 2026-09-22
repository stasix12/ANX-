import Link from 'next/link';
import { site } from '@/config/site';
import { footer } from '@/content/copy';
import { navLinks } from '@/lib/navLinks';
import { formatPhoneDisplay, telHref } from '@/lib/phone';
import { hasPhone, hasWhatsApp } from '@/lib/whatsapp';
import { Logo } from '@/components/layout/Logo';
import { PhoneLink } from '@/components/ui/PhoneLink';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { MailIcon, PhoneIcon, WhatsAppIcon } from '@/components/ui/icons';

const linkClass = 'inline-block py-1.5 text-muted transition-colors hover:text-fg';

export function Footer() {
  const year = new Date().getFullYear();
  const hasContact = hasPhone || hasWhatsApp || Boolean(site.contact.email);

  return (
    <footer className="border-t border-border bg-footer pt-12 pb-6 text-sm">
      <div className="container-site">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.2fr] md:gap-8">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm leading-relaxed text-muted">{footer.about}</p>
          </div>

          <nav aria-labelledby="footer-nav-title">
            <p id="footer-nav-title" className="text-sm font-semibold text-fg">
              {footer.navTitle}
            </p>
            <ul className="mt-3 space-y-1">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link href={`/${link.href}`} className={linkClass}>
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/#contact" className={linkClass}>
                  צרו קשר
                </Link>
              </li>
            </ul>
          </nav>

          <div className="hidden md:block">
            <p className="text-sm font-semibold text-fg">{footer.servicesTitle}</p>
            <ul className="mt-3 space-y-1">
              {footer.services.map((s) => (
                <li key={s.href}>
                  <Link href={`/${s.href}`} className={linkClass}>
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-fg">{footer.contactTitle}</p>
            {hasContact ? (
              <ul className="mt-3 space-y-1">
                {hasPhone ? (
                  <li>
                    <PhoneLink
                      href={telHref(site.contact.phone)}
                      location="footer"
                      aria-label={footer.phoneAria}
                      className={`${linkClass} inline-flex items-center gap-2`}
                    >
                      <PhoneIcon className="h-4 w-4 text-accent" />
                      <bdi dir="ltr" className="tabular">
                        {formatPhoneDisplay(site.contact.phone)}
                      </bdi>
                    </PhoneLink>
                  </li>
                ) : null}
                {hasWhatsApp ? (
                  <li>
                    <WhatsAppLink
                      location="footer"
                      aria-label={footer.whatsappAria}
                      className={`${linkClass} inline-flex items-center gap-2`}
                    >
                      <WhatsAppIcon className="h-4 w-4 text-whatsapp" />
                      <span>WhatsApp</span>
                    </WhatsAppLink>
                  </li>
                ) : null}
                {site.contact.email ? (
                  <li>
                    <a href={`mailto:${site.contact.email}`} className={`${linkClass} inline-flex items-center gap-2`}>
                      <MailIcon className="h-4 w-4 text-accent" />
                      <bdi dir="ltr">{site.contact.email}</bdi>
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-3">
                <Link href="/#contact" className={linkClass}>
                  {footer.contactFallback}
                </Link>
              </p>
            )}
            {site.contact.areaServed || site.contact.addressLocality ? (
              <p className="mt-4 text-subtle">
                {footer.areaLabel} {site.contact.addressLocality || site.contact.areaServed}
              </p>
            ) : null}
            {site.openingHours ? (
              <p className="mt-1 text-subtle">
                {footer.hoursLabel} {site.openingHours}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-[13px] text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span dir="ltr">
              © {year} {site.name}
            </span>
            . {footer.rights}
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            <li>
              <Link href="/accessibility" className="inline-block py-1 transition-colors hover:text-fg">
                {footer.accessibility}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="inline-block py-1 transition-colors hover:text-fg">
                {footer.privacy}
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
