import { Logo } from '@/components/Logo';
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from '@/components/icons';
import { generalWhatsappLink, site } from '@/lib/site';

const socials = [
  { href: site.instagram, label: 'ANX3D באינסטגרם', Icon: InstagramIcon, hover: 'hover:border-brand-500 hover:text-brand-700' },
  { href: site.tiktok, label: 'ANX3D בטיקטוק', Icon: TikTokIcon, hover: 'hover:border-brand-500 hover:text-brand-700' },
  {
    href: generalWhatsappLink,
    label: 'פנייה בוואטסאפ',
    Icon: WhatsAppIcon,
    hover: 'hover:border-[#25D366] hover:text-[#25D366]',
  },
];

/**
 * Contact details only. The category and section link columns went away with
 * the pages they pointed at — the catalog is the whole site now.
 */
export function Footer() {
  return (
    <footer className="border-t border-ink-700 bg-ink-950/60">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo withTagline />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-mist-300">
              ידיות שאיבה, צינורות ומתאמים למכונות Sabrina — מפותחים ומיוצרים עבור אנשי מקצוע
              בתחום ניקוי הספות והריפודים.
            </p>
          </div>

          <div className="sm:text-end">
            <p className="text-sm font-bold text-mist-100">{site.shippingNote}</p>
            <a
              href={`tel:+${site.whatsappNumber}`}
              className="mt-1.5 inline-block text-sm text-mist-300 transition-colors duration-200 hover:text-brand-700"
              dir="ltr"
            >
              {site.phoneDisplay}
            </a>

            <div className="mt-5 flex items-center gap-2 sm:justify-end">
              {socials.map(({ href, label, Icon, hover }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={`grid h-10 w-10 place-items-center rounded-xl border border-ink-700 text-mist-300 transition-colors duration-200 ${hover}`}
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-ink-700 pt-6 text-xs text-mist-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.name} · {site.tagline}
          </p>
          <p>כל הזכויות שמורות · המחירים באתר כוללים מע״מ</p>
        </div>
      </div>
    </footer>
  );
}
