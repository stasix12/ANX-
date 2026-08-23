import type { MouseEvent } from 'react';

/**
 * How long to wait for the browser to actually leave the page before deciding
 * the hand-off never happened. A real tab open or an app hand-off blurs this
 * window well inside a second.
 */
const HANDOFF_TIMEOUT_MS = 900;

/** True when this page is running inside an iframe (a preview, an embed). */
function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    // A cross-origin parent throws on access, which itself means we are framed.
    return true;
  }
}

/**
 * Hands a wa.me link to the browser, and calls `onBlocked` when that quietly
 * fails.
 *
 * Every order on this site leaves through such a link, so a refused hand-off
 * is not a cosmetic problem — it is the whole checkout doing nothing. It gets
 * refused more often than it looks:
 *
 *   - a sandboxed iframe without allow-popups (the shared preview) blocks
 *     window.open outright and returns null;
 *   - some in-app browsers — Instagram and TikTok, which is where this shop's
 *     buyers come from — return a Window that never navigates anywhere;
 *   - a framed page cannot fall back to navigating itself either, because
 *     WhatsApp refuses to be framed and the frame would just go blank.
 *
 * Since none of that can be detected up front, the hand-off is watched
 * instead: if the page still has focus a moment later, nothing happened, and
 * the caller is told so it can offer the message for copying by hand.
 */
export function openWhatsApp(href: string, onBlocked: () => void): void {
  let opened: Window | null = null;
  try {
    /*
     * No 'noopener' in the feature string: several browsers return null for it
     * by design, which is indistinguishable from a blocked popup and would send
     * the visitor down the fallback path while a tab is already opening. The
     * opener is severed below instead.
     */
    opened = window.open(href, '_blank');
  } catch {
    opened = null;
  }

  if (opened) {
    try {
      opened.opener = null;
    } catch {
      // Cross-origin by the time it is reachable; the tab is open either way.
    }
    watchForHandoff(opened, onBlocked);
    return;
  }

  // Unframed: navigating this tab is allowed, and on a phone the OS takes the
  // wa.me link straight to the WhatsApp app without losing the shop.
  if (!isFramed()) {
    window.location.href = href;
    return;
  }

  onBlocked();
}

/**
 * Did the window we opened actually go anywhere?
 *
 * A window that navigated to wa.me is cross-origin, so reading its location
 * throws — that throw is the success signal. One that is still sitting on
 * about:blank, or was closed again by a popup blocker, never left.
 */
function didNavigate(opened: Window): boolean {
  try {
    if (opened.closed) return false;
    const { location } = opened;
    // An in-app browser can hand back a stub with no usable location at all.
    if (!location) return false;
    return Boolean(location.href) && location.href !== 'about:blank';
  } catch {
    return true;
  }
}

/**
 * Resolves either way: the page goes away (the hand-off worked) or it does
 * not. Losing focus or visibility settles it immediately — that is the tab or
 * the WhatsApp app taking over — and otherwise the opened window is inspected
 * once the timeout is up, because a browser can open a tab in the background
 * without ever blurring this one. Every listener is torn down on the first
 * outcome so a later unrelated blur cannot fire the fallback.
 */
function watchForHandoff(opened: Window, onBlocked: () => void): void {
  let settled = false;
  let timer = 0;

  const settle = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    window.removeEventListener('blur', settle);
    window.removeEventListener('pagehide', settle);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') settle();
  };

  window.addEventListener('blur', settle);
  window.addEventListener('pagehide', settle);
  document.addEventListener('visibilitychange', onVisibilityChange);

  timer = window.setTimeout(() => {
    if (settled) return;
    settle();
    if (document.visibilityState === 'hidden' || !document.hasFocus()) return;
    if (didNavigate(opened)) return;
    onBlocked();
  }, HANDOFF_TIMEOUT_MS);
}

/** Click handler for an anchor pointing at wa.me. */
export function openExternal(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
  onBlocked: () => void,
): void {
  // Let modified clicks (new tab, new window, download) behave normally.
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.button !== 0
  ) {
    return;
  }

  event.preventDefault();
  openWhatsApp(href, onBlocked);
}

/**
 * Pulls the composed order back out of a wa.me link, so the fallback can show
 * the exact text that was about to be sent without every call site having to
 * pass it separately.
 */
export function messageFromLink(href: string): string {
  try {
    return new URL(href).searchParams.get('text') ?? '';
  } catch {
    return '';
  }
}
