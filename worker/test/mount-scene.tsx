/*
 * THE PUBLISHING SCENE, MOUNTED SO ITS CLAIMS CAN BE TESTED.
 *
 * The scene has one rule that matters more than every pixel in it: a green
 * tick means a post landed in a group, so a tick may appear only when the real
 * publication count rises. That is a claim about a SEQUENCE — run it, wait,
 * nothing appears; raise the number, one appears — and a static render cannot
 * see it. So this is the real component with React behind it, and the test
 * drives it through `window.__publish` and `window.__mode`.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PublishingScene, type SceneMode } from '@/components/social/PublishingScene';

declare global {
  interface Window {
    __publish: (n: number) => void;
    __mode: (m: SceneMode) => void;
  }
}

function Harness() {
  const [published, setPublished] = useState(0);
  const [mode, setMode] = useState<SceneMode>('sending');
  window.__publish = setPublished;
  window.__mode = setMode;
  return (
    <div style={{ padding: 12 }}>
      <PublishingScene mode={mode} published={published} total={279} />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
