import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toggle } from '@/components/social/ui';

declare global {
  interface Window {
    __calls: string[];
  }
}
window.__calls = [];

/** One switch, with the save its parent performs made controllable. */
function Case({
  id,
  mode,
  delay = 0,
}: {
  id: string;
  /* commit  — the parent adopts the new value, as a real save does
     ignore  — the save "succeeds" but the parent never changes: the exact
               shape of a caller that swallows its own error
     reject  — the save fails */
  mode: 'commit' | 'ignore' | 'reject' | 'blind';
  delay?: number;
}) {
  const [on, setOn] = useState(false);
  /*
   * 'blind' is the shape half the real call sites have: the handler starts
   * the write and returns NOTHING, so the switch is told when it began and
   * never when it finished. It is the case the first version of this
   * component got wrong — it dropped its guess mid-write and the knob slid
   * back, then forward again when the refetch landed.
   */
  if (mode === 'blind') {
    return (
      <div style={{ padding: 8 }}>
        <Toggle
          checked={on}
          label={id}
          onChange={(next) => {
            window.__calls.push(`${id}:${next}`);
            setTimeout(() => setOn(next), delay);
          }}
        />
      </div>
    );
  }
  return (
    <div style={{ padding: 8 }}>
      <Toggle
        checked={on}
        label={id}
        onChange={async (next) => {
          window.__calls.push(`${id}:${next}`);
          if (delay) await new Promise((r) => setTimeout(r, delay));
          if (mode === 'reject') throw new Error('נכשל');
          if (mode === 'commit') setOn(next);
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <div data-toggles>
    <Case id="fast" mode="commit" />
    <Case id="slow" mode="commit" delay={400} />
    <Case id="fails" mode="reject" delay={120} />
    <Case id="silent" mode="ignore" delay={60} />
    <Case id="blind" mode="blind" delay={700} />
    {/* A switch the screen has locked: the tap must not reach the handler AND
        must not move the knob, which is the part the optimistic guess broke. */}
    <div style={{ padding: 8 }}>
      <Toggle checked={false} disabled label="locked" onChange={(next) => { window.__calls.push(`locked:${next}`); }} />
    </div>
  </div>,
);
