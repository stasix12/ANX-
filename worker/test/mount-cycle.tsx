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
import { CYCLE_LIMIT, CYCLE_ROUNDS_PER_WINDOW, type PublishCycle } from '@/lib/social/publish-cycle';

const base: PublishCycle = {
  ok: true,
  enabled: true,
  crossed: false,
  count: 0,
  /*
   * THE ENGINE'S OWN TWO NUMBERS, not literals beside them.
   *
   * The card prints `cycle.limit` — the figure the DATABASE answered with,
   * which is the figure the worker passed it — so a fixture carrying its own
   * 100 would keep this suite green through a change to the ceiling the
   * engine actually enforces. That is exactly what happened when the round
   * became 110 on 15.11.
   */
  limit: CYCLE_LIMIT,
  restUntil: null,
  resting: false,
  roundsInWindow: 0,
  roundsPerWindow: CYCLE_ROUNDS_PER_WINDOW,
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
/*
 * THE OFF ROW CARRIES A COUNT ON PURPOSE, and 76 is his own.
 *
 * social_publish_cycle_tick() leaves `cycle_count` exactly as it was while the
 * switch is off, so a real off row is not a zero — it is whatever stood there
 * when the switch was thrown. His froze at 76 on 13.11 and was still 76 two
 * days later, over a card that drew it as a live round. A fixture with 0 here
 * could not tell the two apart.
 */
const cycle: PublishCycle =
  which === 'resting'
    ? { ...base, count: 0, resting: true, restUntil: until ?? new Date(Date.now() + 7 * 3600_000 + 59 * 60_000 + 59_000).toISOString() }
    : which === 'off'
      ? { ...base, enabled: false, count: 76 }
      : { ...base, count: 37 };

/* What the account really published since local midnight — the number the
   meter counts while the mechanism is off. 41 so it cannot be mistaken for
   the frozen 76, for the round's 37, or for a zero. */
const today = Number(params.get('today') ?? 41);

createRoot(document.getElementById('root') as HTMLElement).render(
  <div className="social-theme" style={{ padding: 12 }}>
    <LiveFlow mode="idle" headline="" now={null} rows={[]} cycle={cycle} publishedToday={today} onCycleToggle={() => undefined} />
  </div>,
);
