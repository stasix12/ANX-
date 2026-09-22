import type { Viewport } from 'next';

/**
 * The admin panel keeps its dark theme (.admin-theme) while the storefront at
 * the root went light, so it keeps the dark browser chrome too. No
 * viewportFit: 'cover' here — the admin's fixed bottom nav does not pad for
 * the iPhone home indicator, so the browser should keep it clear instead.
 */
export const viewport: Viewport = {
  themeColor: '#17191c',
  colorScheme: 'dark',
  // Next merges nested viewports, so the root's 'cover' has to be undone
  // explicitly, not just left out.
  viewportFit: 'auto',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
