import type { MouseEvent } from 'react';

const HANDOFF_TIMEOUT_MS = 900;

function isFramed(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

/**
 * Hands a wa.me link to the browser and calls `onBlocked` when that quietly
 * fails (sandboxed iframes, some in-app browsers). Since a refused hand-off
 * cannot be detected up front, we watch whether the page actually lost focus.
 */
export function openWhatsApp(href: string, onBlocked: () => void): void {
  let opened: Window | null = null;
  try {
    opened = window.open(href, '_blank');
  } catch {
    opened = null;
  }

  if (opened) {
    try {
      opened.opener = null;
    } catch {
      // cross-origin already — fine
    }
    watchForHandoff(opened, onBlocked);
    return;
  }

  if (!isFramed()) {
    window.location.href = href;
    return;
  }

  onBlocked();
}

function didNavigate(opened: Window): boolean {
  try {
    if (opened.closed) return false;
    const { location } = opened;
    if (!location) return false;
    return Boolean(location.href) && location.href !== 'about:blank';
  } catch {
    return true;
  }
}

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
export function openExternal(event: MouseEvent<HTMLAnchorElement>, href: string, onBlocked: () => void): void {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
    return;
  }
  event.preventDefault();
  openWhatsApp(href, onBlocked);
}

export function messageFromLink(href: string): string {
  try {
    return new URL(href).searchParams.get('text') ?? '';
  } catch {
    return '';
  }
}
