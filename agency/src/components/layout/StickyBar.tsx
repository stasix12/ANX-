'use client';

import { useEffect, useState } from 'react';
import { sticky } from '@/content/copy';
import { cn } from '@/lib/cn';
import { CtaLink } from '@/components/ui/CtaLink';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { WhatsAppIcon } from '@/components/ui/icons';

/**
 * Mobile-only fixed bottom bar: [WhatsApp] [קבלו הצעה]. Its height is
 * reserved via --sticky-bar-space (globals.css) so it never covers content.
 * Slides away while the form section is mostly in view, while a form field
 * is focused (soft keyboard) and while the mobile menu is open.
 */
export function StickyBar() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const form = document.getElementById('contact');
    let formInView = false;
    let inputFocused = false;
    let menuOpen = false;

    const update = () => setHidden(formInView || inputFocused || menuOpen);

    const observer = form
      ? new IntersectionObserver(
          ([entry]) => {
            formInView = entry.isIntersecting;
            update();
          },
          { threshold: 0.35 },
        )
      : null;
    if (form && observer) observer.observe(form);

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      inputFocused = Boolean(t && t.closest('form') && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'));
      update();
    };
    const onFocusOut = () => {
      inputFocused = false;
      update();
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    const mo = new MutationObserver(() => {
      menuOpen = document.documentElement.hasAttribute('data-menu-open');
      update();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-menu-open'] });

    return () => {
      observer?.disconnect();
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      mo.disconnect();
    };
  }, []);

  return (
    <nav
      aria-label="פעולות מהירות"
      aria-hidden={hidden}
      inert={hidden}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-1/[0.92] backdrop-blur-md transition-transform duration-200 lg:hidden',
        hidden && 'pointer-events-none translate-y-full',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-2 gap-3 px-4 py-2.5">
        <WhatsAppLink location="sticky_bar" className="btn btn-whatsapp min-h-11 px-3 text-[15px]">
          <WhatsAppIcon className="h-5 w-5" />
          {sticky.whatsapp}
        </WhatsAppLink>
        <CtaLink location="sticky_bar" label={sticky.cta} className="btn btn-primary min-h-11 px-3 text-[15px]">
          {sticky.cta}
        </CtaLink>
      </div>
    </nav>
  );
}
