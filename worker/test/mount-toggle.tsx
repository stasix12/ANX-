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
  mode: 'commit' | 'ignore' | 'reject';
  delay?: number;
}) {
  const [on, setOn] = useState(false);
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
  </div>,
);
