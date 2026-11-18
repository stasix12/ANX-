/*
 * THE FOUR SPEED CARDS, MOUNTED FOR REAL — the entry point
 * worker/test/pace-cards.test.ts bundles and drives.
 *
 * The brief that moved this control to הגדרות asks for tests that are
 * actually run: "בדיקה ויזואלית מול הרפרנס · מעבר בין כל ארבעת המצבים ·
 * בדיקה מלאה בתצוגת מובייל · אין לדווח שבדיקה הצליחה אם לא בוצעה בפועל."
 * Static markup cannot answer any of those: nothing is selected until
 * something is pressed, and "two rows of two on a narrow screen" is a
 * measurement, not a class name.
 *
 * So this is the card with React running behind it, holding the mode the way
 * the settings screen holds it — the stored value handed down, the tap written
 * back — and recording every mode it emits in `window.__picked`, which is
 * what would reach applyPace() in production.
 *
 * IT STARTS WITH NOTHING CHOSEN, which is the state every live account loads
 * in: `pace` is absent from DEFAULT_LIMITS on purpose, so the screen opens on
 * the honest "no mode picked" card rather than lighting the nearest one.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SmartPaceCard } from '@/components/social/SmartPaceCard';
import { ToastProvider } from '@/components/social/ui';
import type { PaceId } from '@/lib/social/types';

declare global {
  interface Window {
    /** Every mode the card has emitted, in order. */
    __picked: PaceId[];
    /** Switched on by the test to prove the whole group goes dead while saving. */
    __busy: (on: boolean) => void;
  }
}
window.__picked = [];

function Harness() {
  const [pace, setPace] = useState<PaceId | null>(null);
  const [busy, setBusy] = useState(false);
  window.__busy = setBusy;
  return (
    <ToastProvider>
      <div className="social-theme" style={{ padding: 16 }}>
        <SmartPaceCard
          pace={pace}
          disabled={busy}
          /* The account's enforced gap while nothing is chosen — 65 minutes out
             of the box, which is what the real screen hands it. */
          currentGapSeconds={3900}
          onChange={(id) => {
            window.__picked.push(id);
            setPace(id);
          }}
        />
      </div>
    </ToastProvider>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
