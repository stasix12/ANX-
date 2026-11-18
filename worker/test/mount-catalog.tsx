/*
 * THE "מאגר ארצי" TAB, MOUNTED FOR REAL — the entry point
 * worker/test/catalog-screen.test.ts bundles and drives.
 *
 * The real component, React running, with src/lib/social/client.ts's catalog
 * reads aliased to worker/test/stub-catalog.ts so there is a 20,000-group
 * catalog behind it and every query it sends is recorded.
 *
 * `onAdd` is the groups screen's hand-off: it records what it was given in
 * window.__added and answers true, exactly as a successful adoption does.
 */
import { createRoot } from 'react-dom/client';
import { GroupCatalog } from '@/components/social/GroupCatalog';
import { markAdded } from './stub-catalog';
import { ToastProvider } from '@/components/social/ui';

declare global {
  interface Window {
    /** Each hand-off to the groups screen: the ids it was given. */
    __added: string[][];
    /** Set by the test to make the hand-off fail, which must keep the selection. */
    __addFails: boolean;
  }
}
window.__added = [];
window.__addFails = false;

createRoot(document.getElementById('root') as HTMLElement).render(
  <ToastProvider>
    <div className="social-theme" style={{ padding: 16 }}>
      <GroupCatalog
        onAdd={(picked) => {
          window.__added.push(picked.map((g) => g.external_id));
          if (window.__addFails) return false;
          /* The write really happened, so the stand-in database knows about
             it — which is what the screen re-reads. A FAILED hand-off tells
             it nothing, and that is the case worth testing: those rows must
             not come back marked as his. */
          markAdded(picked.map((g) => g.external_id));
          return true;
        }}
      />
    </div>
  </ToastProvider>,
);
