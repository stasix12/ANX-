/**
 * THE PC'S PULSE — a clock, proven to be a clock.
 *
 * "המערכת מציגה לפעמים שהמחשב מנותק למרות שהוא מחובר. אצלי המחשב דלוק
 *  והתוכנה פתוחה."
 *
 * The dashboard reads one column against a ninety-second cutoff, and that
 * column was written as a STEP IN THE PUBLISHING LOOP. So every slow thing the
 * worker did pushed the next write out by exactly that long: 2-6 minutes for
 * group discovery, up to SIX MINUTES waiting for a Facebook login code, and
 * all four chores plus the update check back to back on an idle tick.
 *
 * Four rules decide whether the fix is real, and every one of them has a way
 * of looking right in the source while failing in practice:
 *
 *   1. RE-ARM BEFORE THE WRITE. A timer re-armed in the write's `finally` is
 *      the same step one level down — it still waits for the database. This is
 *      the single line the whole fix rests on, so it is tested by hanging the
 *      write for ten intervals and counting the ticks.
 *   2. ONE WRITE AT A TIME, or a slow network stacks a new UPDATE every five
 *      seconds on top of one that never answered.
 *   3. RE-SEND THE CURRENT STATUS. A pulse that sent a fixed 'online' would
 *      promote a worker that is asking for help back to healthy between
 *      transitions — a worse lie than the one being fixed.
 *   4. NEVER THROW. This runs on a bare timer callback, where a rejection ends
 *      the process: the fix would turn "the dashboard thinks the PC is off"
 *      into the PC actually being off.
 *
 * And rule 1 is only true if a write can always settle, which is why the
 * sixty-second request ceiling (worker/timed-fetch.ts) ships in the same
 * change and is tested here too.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PULSE_EVERY_MS, createPulse, type PulseTimers } from '../pulse';
import { REQUEST_TIMEOUT_MS, wantsCeiling } from '../timed-fetch';
import { WORKER_OFFLINE_AFTER_SECONDS } from '@/lib/social/types';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
};

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const flush = () => new Promise((r) => setImmediate(r));

/**
 * One interval, then let the write settle.
 *
 * Worth a helper because of what it exposes: a write only ever OPENS on a tick
 * that finds the lane free, and an async write's own rejection or return lands
 * on a microtask. So several intervals inside one synchronous advance() open
 * ONE write and stand the rest down — which is the overlap guard doing its job,
 * and is why the tests below step interval by interval.
 */
const beat = async (t: FakeTimers, ms: number): Promise<void> => {
  t.advance(ms);
  await flush();
};

/** A clock the test drives by hand, so none of this runs in real seconds. */
class FakeTimers implements PulseTimers {
  now = 0;
  private seq = 0;
  private pending = new Map<number, { at: number; fn: () => void }>();
  setTimeout(fn: () => void, ms: number): unknown {
    const id = (this.seq += 1);
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  get armed(): number {
    return this.pending.size;
  }
  /** Fires everything due up to now+ms, in order, re-scanning after each one. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      let pick: [number, { at: number; fn: () => void }] | null = null;
      for (const entry of this.pending) if (entry[1].at <= target && (!pick || entry[1].at < pick[1].at)) pick = entry;
      if (!pick) break;
      this.pending.delete(pick[0]);
      this.now = pick[1].at;
      pick[1].fn();
    }
    this.now = target;
  }
}

/* tsx compiles these files to CJS, where top-level await is not available,
   so the whole run is one async function and its failure is the exit code. */
async function run(): Promise<void> {
  /* ─────────── 1. the interval is the interval, whatever the DB does ───────── */
  {
    const t = new FakeTimers();
    /* A write that never settles — a dead socket, which is an ordinary event on
       the machine this runs on and the exact thing that used to freeze the loop. */
    let starts = 0;
    const releases: Array<() => void> = [];
    const pulse = createPulse({
      everyMs: 5_000,
      timers: t,
      write: () => { starts += 1; return new Promise<void>((r) => releases.push(r)); },
    });
    pulse.start();
    is(t.armed === 1, 'start() must arm the timer at once — a pulse that waits for the first tick is already a gap');

    t.advance(5_000);
    await flush();
    eq(pulse.stats().writes, 0, 'the first write has not settled yet');
    is(pulse.stats().inFlight, 'and it is still in flight');

    /* TEN MORE INTERVALS while that write hangs. This is the fix: the ticks
       happen anyway. Re-armed in a `finally` instead, the count here would be 0. */
    t.advance(50_000);
    await flush();
    eq(pulse.stats().skipped, 10, 'the timer must keep firing while a write hangs — this is the whole fix, and 0 here means the pulse is still a step in the loop');
    is(t.armed === 1, 'and it must still be armed for the next one');

    eq(starts, 1, 'and only the first of those eleven ticks may have opened a write');

    releases[0]();
    await flush();
    eq(pulse.stats().writes, 1, 'the hung write settles');
    is(!pulse.stats().inFlight, 'and the lane is free again');

    t.advance(5_000);
    await flush();
    eq(starts, 2, 'after which the very next tick writes again, on the same clock and with no restart needed');
    releases[1]();
    await flush();
    eq(pulse.stats().writes, 2, 'and it settles');
    pulse.stop();
  }

  /* ──────────────── 2. one write at a time, never stacked ─────────────────── */
  {
    const t = new FakeTimers();
    let starts = 0;
    const releases: Array<() => void> = [];
    const pulse = createPulse({
      everyMs: 1_000,
      timers: t,
      write: () => { starts += 1; return new Promise<void>((r) => releases.push(r)); },
    });
    pulse.start();
    t.advance(10_000);
    await flush();
    eq(starts, 1, 'ten ticks over one hung write must start ONE write, not ten — the same row, and a stack of them is how a slow network becomes a queue of UPDATEs');
    eq(pulse.stats().skipped, 9, 'and the other nine must be counted as stood down, not lost');
    releases.forEach((r) => r());
    await flush();
    pulse.stop();
  }

  /* ─────────── 3. the status it re-sends is the CURRENT one ────────────────── */
  {
    const t = new FakeTimers();
    const sent: string[] = [];
    /* Stands in for state.pulseStatus, which heartbeat() rewrites on every
       transition. The write must read it at FIRE time, not at create time. */
    let status = 'online';
    const pulse = createPulse({ everyMs: 5_000, timers: t, write: async () => { sent.push(status); } });
    pulse.start();
    t.advance(5_000);
    await flush();
    status = 'needs_attention';
    t.advance(5_000);
    await flush();
    status = 'offline';
    t.advance(5_000);
    await flush();
    eq(sent, ['online', 'needs_attention', 'offline'], 'the pulse must repeat whatever the last transition reported — a fixed "online" would promote a worker that is asking for help back to healthy every five seconds');
    pulse.stop();
  }

  /* ─────────────────── 4. it can never take the process down ───────────────── */
  {
    const t = new FakeTimers();
    const seen: string[] = [];
    const pulse = createPulse({
      everyMs: 1_000,
      timers: t,
      write: async () => { throw new Error('getaddrinfo ENOTFOUND'); },
      onError: (err) => { seen.push(err instanceof Error ? err.message : String(err)); },
    });
    pulse.start();
    await beat(t, 1_000);
    await beat(t, 1_000);
    await beat(t, 1_000);
    eq(pulse.stats().errors, 3, 'a failing write must be counted, not swallowed silently');
    eq(seen.length, 3, 'and reported');
    eq(pulse.stats().writes, 0, 'and must not be counted as a successful write');
    await beat(t, 1_000);
    eq(pulse.stats().errors, 4, 'and the timer must keep going — a database that is down is exactly when the pulse matters');
    pulse.stop();

    /* A reporter that itself throws is still not allowed to end the worker. */
    const t2 = new FakeTimers();
    const p2 = createPulse({
      everyMs: 1_000,
      timers: t2,
      write: async () => { throw new Error('boom'); },
      onError: () => { throw new Error('the reporter is broken too'); },
    });
    p2.start();
    await beat(t2, 1_000);
    await beat(t2, 1_000);
    eq(p2.stats().errors, 2, 'an onError that throws must not stop the pulse');
    p2.stop();
  }

  /* ───────────────────────── 5. stop means stop ───────────────────────────── */
  {
    const t = new FakeTimers();
    let writes = 0;
    const pulse = createPulse({ everyMs: 1_000, timers: t, write: async () => { writes += 1; } });
    pulse.start();
    await beat(t, 1_000);
    await beat(t, 1_000);
    eq(writes, 2, 'two intervals, two writes');
    pulse.stop();
    eq(t.armed, 0, 'stop() must disarm the timer, or the process cannot exit');
    t.advance(60_000);
    await flush();
    eq(writes, 2, 'nothing may be written after stop() — the shutdown heartbeat is the last word and a stray tick would re-assert "online" after it');
    is(!pulse.stats().running, 'and it must report itself stopped');

    /* start() twice must not run two clocks. */
    const t2 = new FakeTimers();
    const p2 = createPulse({ everyMs: 1_000, timers: t2, write: async () => undefined });
    p2.start();
    p2.start();
    eq(t2.armed, 1, 'a second start() must not arm a second timer');
    p2.stop();
  }

  /* ─────────────────── 6. the interval, and the cutoff it serves ───────────── */
  {
    is(PULSE_EVERY_MS * 2 < WORKER_OFFLINE_AFTER_SECONDS * 1000, `the pulse (${PULSE_EVERY_MS}ms) must fit several times inside the ${WORKER_OFFLINE_AFTER_SECONDS}s offline cutoff, so one missed write is never a disconnection`);

    /* A nonsense interval may not become a spin. */
    const t = new FakeTimers();
    let writes = 0;
    const p = createPulse({ everyMs: 0, timers: t, write: async () => { writes += 1; } });
    p.start();
    t.advance(1_000);
    await flush();
    is(writes <= 4, `a zero interval must fall back to a floor, not spin — ${writes} writes in one second`);
    p.stop();
  }

  /* ───────────── 7. a write can always settle: the request ceiling ─────────── */
  {
    is(wantsCeiling('https://x.supabase.co/rest/v1/social_workers?id=eq.1'), 'an ordinary request must get a ceiling — without one a dead socket holds the pulse in flight for ever and the timer, correct as it is, never writes again');
    is(!wantsCeiling('https://x.supabase.co/storage/v1/object/social/a.jpg'), "storage must stay exempt — a post's images over a slow uplink honestly take minutes, and cutting an upload to fix a freeze breaks publishing");
    is(REQUEST_TIMEOUT_MS === 60_000, 'the ceiling must match the browser’s, which is the fix this one is the second instance of');
    is(REQUEST_TIMEOUT_MS < WORKER_OFFLINE_AFTER_SECONDS * 1000, 'and it must be shorter than the offline cutoff, or one hung write is still a disconnection on screen');

    const db = src('../db.ts');
    is(/global: \{ fetch: timedWorkerFetch \}/.test(db), 'the worker’s Supabase client no longer passes the timed fetch — supabase-js sets no timeout, so the ceiling exists only if it is wired here');
    is(/from '\.\/timed-fetch'/.test(db), 'and the import is gone');
  }

  /* ──────────────── 8. the worker really runs it, and stops it ─────────────── */
  {
    const worker = src('../social-worker.ts');
    is(/pulse = createPulse\(\{/.test(worker), 'the worker no longer creates the pulse at all');
    is(/pulse\.start\(\);/.test(worker), 'nor starts it');
    is(
      /write: \(\) => heartbeat\(state, state\.pulseStatus \?\? 'online', state\.pulseDebug \?\? false\)/.test(worker),
      'the pulse must write the status the last transition recorded — anything fixed here re-asserts a stale "online" every five seconds',
    );
    is(/state\.pulseStatus = status;/.test(worker), 'heartbeat() must record what it reported, or the pulse has nothing current to re-send');

    /* Started before the long awaits that used to starve it, not inside tick(). */
    const main = worker.slice(worker.indexOf('async function main('), worker.indexOf('async function idleWait('));
    is(main.length > 400, 'main() is found');
    is(
      main.indexOf('pulse.start();') < main.indexOf('session.checkLogin'),
      'the pulse must start BEFORE the Facebook login check — that check is itself one of the long awaits that used to make the dashboard say the computer is off',
    );
    is(!/await tick\([\s\S]{0,200}pulse\.start/.test(worker), 'and it must not be started inside the tick — a timer that only exists while the loop runs is the same step in disguise');

    /* Both ways out stop it, so nothing re-asserts 'online' after goodbye. */
    const stops = worker.match(/pulse\?\.stop\(\);/g) ?? [];
    is(stops.length >= 2, `both exits must stop the pulse — the normal shutdown and the self-update restart; found ${stops.length}`);
    is(
      /pulse\?\.stop\(\);\s*await heartbeat\(state, 'offline'\);/.test(worker),
      'the stop must come BEFORE the final offline heartbeat, or a tick can overwrite it',
    );
  }

  /* ──────── 9. and the dashboard believes the computer's own last word ─────── */
  {
    const client = src('../../src/lib/social/client.ts');
    const fn = client.slice(client.indexOf('export async function listWorkers'), client.indexOf('export async function listWorkers') + 700);
    is(fn.length > 200, 'listWorkers is found');
    is(
      /w\.status !== 'offline'/.test(fn),
      'a worker that reported "offline" must not be drawn as connected for another ninety seconds — the same fault as the one being fixed, pointing the other way, and the more expensive direction: a round launched in that window shows a green computer and then nothing moves',
    );
    is(/last_seen_at && new Date\(w\.last_seen_at\)\.getTime\(\) > cutoff/.test(fn), 'and the freshness half must stay — a stale stamp with status "online" is a machine that stopped answering mid-sentence');
  }
}

run().then(
  () => console.log(`pulse OK — ${checks} assertions`),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
