/*
 * THE REAL SIGN-IN PAGE, MOUNTED — the entry point auth-screen.test.ts bundles.
 *
 * It imports src/app/social/login/page.tsx itself rather than a copy of its
 * markup, which is the whole point: a hand-written stand-in would keep passing
 * the day the page changed. Only next/navigation and the auth module are
 * replaced, and only because they cannot run outside Next.
 *
 * Beside the suite, not in a temp directory: esbuild resolves react-dom/client
 * from the entry point's own folder outwards.
 */
import { createRoot } from 'react-dom/client';
import SocialLoginPage from '@/app/social/login/page';

createRoot(document.getElementById('root') as HTMLElement).render(<SocialLoginPage />);
