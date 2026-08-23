import type { MouseEvent } from 'react';

/**
 * Opens a link in a new tab, falling back to navigating the current frame.
 *
 * Every order on this site leaves through a wa.me link. When the page is
 * embedded in a sandboxed iframe — a preview, an in-app browser, anything
 * without allow-popups — a plain target="_blank" is silently blocked by the
 * browser and the button appears to do nothing at all. Self-navigation is
 * still permitted there, and on a phone wa.me hands straight off to the
 * WhatsApp app, so the fallback costs nothing.
 */
export function openExternal(event: MouseEvent<HTMLAnchorElement>, href: string) {
  // Let modified clicks (new tab, new window, download) behave normally.
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
    return;
  }

  event.preventDefault();

  /*
   * No 'noopener' in the feature string: several browsers return null for it
   * by design, which is indistinguishable from a blocked popup and would send
   * the visitor through the fallback as well, navigating away from the shop
   * while a tab is already opening. The opener is severed below instead.
   */
  const opened = window.open(href, '_blank');

  if (opened) {
    opened.opener = null;
    return;
  }

  window.location.href = href;
}
