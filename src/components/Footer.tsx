import { Logo } from '@/components/Logo';
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from '@/components/icons';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import { generalWhatsappLink, site } from '@/lib/site';

const socials = [
  { href: site.instagram, label: 'ANX3D באינסטגרם', Icon: InstagramIcon, hover: 'hover:border-ink-600 hover:text-mist-100' },
  { href: site.tiktok, label: 'ANX3D בטיקטוק', Icon: TikTokIcon, hover: 'hover:border-ink-600 hover:text-mist-100' },
  {
    href: generalWhatsappLink,
    label: 'פנייה בוואטסאפ',
    Icon: WhatsAppIcon,
    hover: 'hover:border-[#1a9e4f] hover:text-[#1a9e4f]',
  },
];

/**
 * Contact details only. The category and section link columns went away with
 * the pages they pointed at — the catalog is the whole site now.
 */
export function Footer() {
  return (
    <footer className="border-t border-ink-700 bg-ink-900">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Logo withTagline />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-mist-500">
              ידיות שאיבה, צינורות ומתאמים למכונות Sabrina — מפותחים ומיוצרים עבור אנשי מקצוע
              בתחום ניקוי הספות והריפודים.
            </p>
          </div>

          <div className="sm:text-end">
            <p className="text-sm font-bold text-mist-100">{site.shippingNote}</p>
            <a
              href={`tel:+${site.whatsappNumber}`}
              className="inline-block py-3 text-sm text-mist-300 tabular-nums transition-colors duration-200 hover:text-mist-100"
              dir="ltr"
            >
              {site.phoneDisplay}
            </a>

            <div className="mt-3 flex items-center gap-2 sm:justify-end">
              {socials.map(({ href, label, Icon, hover }) => (
                <WhatsAppLink
                  key={label}
                  href={href}
                  aria-label={label}
                  className={`grid h-11 w-11 place-items-center rounded-xl border border-ink-700 bg-white text-mist-300 transition-colors duration-200 ${hover}`}
                >
                  <Icon className="h-5 w-5" />
                </WhatsAppLink>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-ink-700 pt-6 text-xs text-mist-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <bdi dir="ltr">© {new Date().getFullYear()} {site.name}</bdi> · ציוד מקצועי לניקוי ריפודים
          </p>
          <p>כל הזכויות שמורות · המחירים באתר כוללים מע״מ</p>
        </div>
      </div>
    </footer>
  );
}
