/*
 * THE CAMPAIGN CARD'S TIME BLOCK, MOUNTED SO THE FREEZE COUNTDOWN CAN BE
 * MEASURED RATHER THAN READ.
 *
 * The claim under test is about a SEQUENCE and about a contradiction: with a
 * slot that is already due, the card says "אמור לצאת עכשיו"; hand it a freeze
 * and that sentence must be replaced by a counter that really moves. A
 * rendered string proves neither.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { NextPublication } from '@/components/social/NextPublication';

declare global {
  interface Window {
    /** The freeze instant, or null for "not frozen". */
    __freeze: (iso: string | null) => void;
  }
}

function Harness() {
  const [frozen, setFrozen] = useState<string | null>(null);
  window.__freeze = setFrozen;
  /* FIVE SECONDS IN THE PAST: inside the two-minute grace, so the card reads
     "אמור לצאת עכשיו" — the exact sentence a freeze has to replace, and the
     one his own screen showed over a stopped queue. */
  const at = new Date(Date.now() - 5_000).toISOString();
  return (
    <div data-card style={{ padding: 12, width: 360 }}>
      <NextPublication readout={{ kind: 'due', at }} workerOnline frozenUntil={frozen} />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
