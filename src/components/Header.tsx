import { Logo } from '@/components/Logo';
import { InstagramIcon, TikTokIcon, WhatsAppIcon } from '@/components/icons';
import { generalWhatsappLink, site } from '@/lib/site';

const socials = [
  { href: site.instagram, label: 'ANX3D באינסטגרם', Icon: InstagramIcon },
  { href: site.tiktok, label: 'ANX3D בטיקטוק', Icon: TikTokIcon },
];

/**
 * The page is a single catalog, so there is nowhere to navigate to: no nav
 * links, no mobile drawer, and no transparent-over-hero state to track — which
 * leaves nothing that needs client-side state.
 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-700 bg-ink-950/90 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6">
        <Logo />

        <div className="flex items-center gap-1.5 sm:gap-2">
          {socials.map(({ href, label, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="grid h-10 w-10 place-items-center rounded-xl border border-ink-700 text-mist-300 transition-colors duration-200 hover:border-brand-500 hover:text-brand-700"
            >
              <Icon className="h-5 w-5" />
            </a>
          ))}

          {/* Label collapses on narrow screens so the row still fits at 375px. */}
          <a
            href={generalWhatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="הזמנה בוואטסאפ"
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-3 py-2.5 text-sm font-bold text-mist-100 transition-colors duration-200 hover:bg-[#1fbe5a] sm:px-4"
          >
            <WhatsAppIcon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>
      </div>
    </header>
  );
}
