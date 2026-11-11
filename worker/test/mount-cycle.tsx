/*
 * THE CYCLE CARD, MOUNTED FOR REAL — the entry point cycle.test.ts bundles.
 *
 * IN worker/test AND NOT A TEMP DIRECTORY, which is not a detail: esbuild
 * resolves `react-dom/client` from the entry point's own folder outwards, so
 * a mount file written to /tmp cannot find the repository's React at all.
 * Every other browser-driven test here keeps its mount beside itself for the
 * same reason.
 *
 * The state is chosen by `?s=` so one bundle covers all three: a round in
 * progress, a hold counting down, and the mechanism switched off.
 */
import { createRoot } from 'react-dom/client';
import { LiveFlow } from '@/components/social/LiveFlow';
import type { PublishCycle } from '@/lib/social/publish-cycle';

const base: PublishCycle = {
  ok: true,
  enabled: true,
  crossed: false,
  count: 0,
  limit: 100,
  restUntil: null,
  resting: false,
  roundsInWindow: 0,
  roundsPerWindow: 2,
  windowStartedAt: null,
  cycleStartedAt: null,
};

const params = new URLSearchParams(location.search);
const which = params.get('s') ?? 'running';
/*
 * `until` IS WHAT MAKES THE REFRESH TEST MEAN ANYTHING. Without it the page
 * would compute a fresh eight hours on every load, and a reload would show
 * 07:59:59 again for the wrong reason — a timer restarting, which is exactly
 * the bug being ruled out. Passed an absolute instant, the second load has to
 * read the SAME stored instant and show LESS time left.
 */
const until = params.get('until');
const cycle: PublishCycle =
  which === 'resting'
    ? { ...base, count: 0, resting: true, restUntil: until ?? new Date(Date.now() + 7 * 3600_000 + 59 * 60_000 + 59_000).toISOString() }
    : which === 'off'
      ? { ...base, enabled: false }
      : { ...base, count: 37 };

createRoot(document.getElementById('root') as HTMLElement).render(
  <div className="social-theme" style={{ padding: 12 }}>
    <LiveFlow mode="idle" headline="" now={null} rows={[]} cycle={cycle} onCycleToggle={() => undefined} />
  </div>,
);
