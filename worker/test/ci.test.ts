/**
 * THERE IS A GATE, AND IT CANNOT PASS WITH THE PROOFS MISSING.
 *
 * Until .github/workflows/tests.yml existed, nothing ran this suite on a push.
 * The only automatic check was Vercel's typecheck, which catches a wrong type
 * and nothing else — so three thousand assertions ran exactly when somebody
 * remembered to run them. In one night the suite caught four real defects
 * before production, every one of them because it happened to be run by hand.
 *
 * AND THE THREE THAT MATTER MOST NEVER RAN AT ALL. queue-db, tenancy-db and
 * schema-columns need a real Postgres and SKIP without one — printing a line
 * that says "CI does this with a service container" about a CI that did not
 * exist. Those three are what prove the no-double-publish rule and that one
 * business cannot see another's rows. On an ordinary run they print a skip and
 * the suite exits 0. Three times in one night they skipped and had to be run
 * separately.
 *
 * SO THE GUARD THAT MATTERS HERE IS THE SKIP CHECK, not the workflow's
 * existence. A service container that silently failed to come up would hand
 * back a GREEN run with both proofs absent — the exact state the product was
 * already in, now carrying a tick, which is worse than no CI at all.
 *
 * And the names are pinned ACROSS the two files. The check greps for the
 * sentence each suite prints; rename a suite and the grep quietly matches
 * nothing, the skip check passes, and the gate is hollow again with nothing
 * red to show for it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const ci = src('../../.github/workflows/tests.yml');

/*
 * A SENTENCE QUOTING A COMMAND IS NOT THE COMMAND. Three guards in this suite
 * have already been defeated by exactly that — a comment two hundred lines
 * above a call made `indexOf` report the call in the wrong order — so every
 * ORDERING or PRESENCE assertion below reads the YAML with its comment lines
 * removed. This file is heavily commented on purpose, which makes it the most
 * exposed of the lot.
 */
const code = ci
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

/* ─────────────── 1. it runs, on the branch the product ships from ──────── */
{
  is(/name: tests/.test(ci), 'the test workflow is gone');
  is(/branches: \[claude\/facebook-content-manager-gqtv66\]/.test(ci), 'it must run on the branch this product actually ships from');
  is(/pull_request:/.test(ci), 'and on pull requests');
  is(/npm run test:social/.test(ci), 'it must run the suite — a workflow that only typechecks is the gate that already existed');
  is(/npx tsc --noEmit/.test(ci), 'and typecheck, which caught a nonexistent activity kind this session that no test could see');
}

/* ─────────────── 2. the suite is given a real database ─────────────────── */
{
  is(/image: postgres:16/.test(ci), 'the three real-Postgres suites need a server, and without one they skip');
  is(/ANX_TEST_DATABASE_URL: postgresql:\/\//.test(ci), 'and the one variable the harness reads must be set');
  /*
   * The probe names its user and its database. Bare `pg_isready` connects as
   * the invoking OS user, which inside the postgres image is root — a role the
   * server has never heard of — so the first run of this workflow printed
   * `FATAL: role "root" does not exist` ten times before going healthy. It did
   * answer, because the error proves the socket is up, but a health check that
   * logs a FATAL on every beat is a health check nobody will read twice.
   */
  is(
    /--health-cmd "pg_isready -U postgres -d anxtest"/.test(code),
    'the container must be health-checked as a role that exists, against the database the tests use: tests that start against a still-booting server skip, which is the failure this workflow exists to prevent',
  );
}

/* ───── 3. THE GUARD: a run where the proofs skipped must go red ────────── */
{
  is(/tee suite\.log/.test(ci), 'the suite output must be captured — the exit code is 0 on a skip, by design, so the log is the only evidence');
  is(/SKIPPED/.test(ci), 'nothing checks whether the proofs skipped — a container that did not come up gives a green run with both proofs missing');
  is(/::error::/.test(ci), 'and the failure must be annotated, so the run says which proof went missing rather than "a test skipped"');
  is(/exit \$fail/.test(ci), 'the skip check must actually fail the job');
  /* Neither-ran-nor-skipped is its own case: a suite deleted from the chain
     would otherwise satisfy a check that only looks for the skip line. */
  is(/neither ran nor skipped/.test(ci), 'a proof missing from the chain entirely must fail too, not pass by producing no line at all');
}

/* ─── 4. THE APP BUILD'S ONE UNDECLARED DEPENDENCY ──────────────────────── */
{
  /*
   * THE SECOND RUN OF THIS WORKFLOW DIED HERE, five and a half minutes in.
   *
   * package.test.ts runs the real app build, which bundles desktop/updates.ts,
   * so electron-updater must be resolvable on disk — and it is deliberately
   * absent from package.json. That absence is load-bearing: the manifest guard
   * in package.test.ts fails the build if anything matching electron* reaches
   * the manifest or the lockfile, because it was a devDependency for ninety
   * minutes and took the live website down for two and a half hours. So the
   * only correct fix is the one build-app.yml already uses, --no-save, and
   * these three assertions hold that shape:
   *
   *   · the test job installs it at all;
   *   · at the SAME version the installer bundles, or a green run here proves
   *     a build nobody ships;
   *   · and never into the manifest, which is the outage above.
   */
  const build = src('../../.github/workflows/build-app.yml');
  const buildCode = build
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  const spec = (text: string) => /electron-updater@(\S+)/.exec(text)?.[1] ?? '';
  const here = spec(code);
  const installer = spec(buildCode);

  is(
    here.length > 0,
    'the test job no longer installs electron-updater — package.test.ts runs the real app build and the bundle cannot resolve it, which is exactly how the second run of this workflow died',
  );
  is(installer.length > 0, "and build-app.yml no longer installs it either, so there is nothing left to pin the test job's version to");
  is(
    here === installer,
    `the test job bundles electron-updater@${here} and the installer bundles @${installer} — a green run here would be proving a build nobody ships`,
  );
  /* --no-save on the same line, not merely somewhere in the file. */
  const line = code.split('\n').find((l) => l.includes('electron-updater@')) ?? '';
  is(
    /--no-save/.test(line),
    'electron-updater must be installed --no-save: in the manifest it reaches Vercel, and it has already taken the live website down for two and a half hours once',
  );
}

/* ──── 5. THE GATE'S OWN BUGS — its first run found two of them ────────── */
{
  /*
   * `a | tee b` EXITS WITH TEE'S STATUS, NOT a's.
   *
   * On the first run of this workflow the suite crashed at test 26 and this
   * step reported SUCCESS in nine seconds. The only reason that run went red
   * at all is the skip check in section 3, which noticed three proofs missing
   * from a log that had stopped early — the guard caught the gate's own bug on
   * its first outing, which is the best argument for the guard there is.
   *
   * Without pipefail, every failure after the first printing suite is reported
   * as a pass: 3,000 assertions behind a green tick.
   */
  const suite = code.slice(code.indexOf('- name: the suite'), code.indexOf('- name: the real-Postgres proofs'));
  is(suite.length > 40, 'the step that runs the suite is gone, or the step after it was renamed');
  is(/set -o pipefail/.test(suite), "the suite's exit code is swallowed by tee again — a crashed suite reports success in nine seconds");
  is(
    suite.indexOf('set -o pipefail') < suite.indexOf('npm run test:social'),
    'pipefail must be set before the pipe it governs, in the same shell',
  );

  /*
   * AND THE EIGHT MEASURED SUITES NEED A BUILD.
   *
   * campaign-card, comment-timeline, crm-shell, dashboard-hero, discovery-row,
   * quick-comments, schedule-panel and swiper each load the compiled
   * stylesheet out of .next/static/chunks and measure the real rendered
   * product in a browser. Without a build seven of them skip and discovery-row
   * throws — which is how the first run of this file died. Everything they
   * assert (a 40px thumb target, no sideways scroll at 360px, a card that has
   * not regrown the height the owner asked to lose) is asserted nowhere else.
   */
  const build = code.indexOf('run: npm run build');
  is(build > 0, 'nothing builds the app, so seven measured suites skip and discovery-row refuses to run — that is how the first run of this workflow died');
  is(build < code.indexOf('npm run test:social'), 'the build must come before the suite, or the measured tests still find no CSS to measure');

  /*
   * And the escape hatch must stay unused HERE. ALLOW_UNMEASURED=1 exists for
   * a person who deliberately wants the rest of the suite without waiting for
   * a build; typing it into the gate would turn the one suite that refuses to
   * skip into one that skips quietly, on every push, for ever.
   */
  is(!/ALLOW_UNMEASURED/.test(ci), 'the gate must not switch the measurement off — a skipped check is not a check');
}

/* ───── 6. the names agree across the two files, or the grep is hollow ──── */
{
  const nameOf = (rel: string) => /^const NAME = '([^']+)';/m.exec(src(rel))?.[1] ?? '';
  const proofs = [
    ['../../worker/test/queue-db.test.ts', 'the no-double-publish proof'],
    ['../../worker/test/tenancy-db.test.ts', 'the cross-business isolation proof'],
    ['../../worker/test/schema-columns.test.ts', 'the schema-matches-the-code proof'],
  ] as const;

  for (const [rel, what] of proofs) {
    const name = nameOf(rel);
    is(name.length > 0, `${what}: its NAME constant is gone, so nothing can be pinned to it`);
    /* The workflow builds the sentence in a loop — `"$proof SKIPPED"` over a
       list of names — so BOTH halves have to be pinned: the name must be in
       the list, and the list must still be used to build that exact line. */
    is(
      ci.includes(`"${name}"`),
      `${what} is named "${name}" but the workflow's proof list does not contain it — rename a suite and the check matches nothing, passes, and the gate is hollow with nothing red to show for it`,
    );
  }

  /* And the two sentences the loop builds out of those names. */
  is(
    /grep -qF "\$proof SKIPPED"/.test(ci),
    'the skip check must grep for "<name> SKIPPED" built from the pinned list — any other spelling and the names above pin nothing',
  );
  is(/grep -qF "\$proof OK"/.test(ci), 'and for the success line, so a suite that prints neither is caught');

  /* And the sentence the harness prints must still be the one being grepped. */
  const harness = src('./db/harness.ts');
  is(/\$\{name\} SKIPPED/.test(harness), 'the harness no longer prints "<name> SKIPPED" — the workflow greps for exactly that');
}

console.log(`ci OK — ${checks} assertions`);
