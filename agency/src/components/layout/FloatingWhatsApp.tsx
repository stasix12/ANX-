import { hasWhatsApp } from '@/lib/whatsapp';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { WhatsAppIcon } from '@/components/ui/icons';

/** Desktop-only round WhatsApp button (mobile has the sticky bar). */
export function FloatingWhatsApp() {
  if (!hasWhatsApp) return null;
  return (
    <div className="fixed bottom-6 end-6 z-40 hidden lg:block">
      <WhatsAppLink
        location="floating"
        aria-label="דברו איתנו ב-WhatsApp"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-whatsapp text-navy shadow-[0_12px_32px_-8px_rgba(37,211,102,0.55)] transition-transform hover:scale-105"
      >
        <WhatsAppIcon className="h-7 w-7" />
      </WhatsAppLink>
    </div>
  );
}
