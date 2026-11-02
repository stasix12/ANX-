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
  is(
    /--health-cmd pg_isready/.test(ci),
    'the container must be health-checked: tests that start against a still-booting server skip, which is the failure this workflow exists to prevent',
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

/* ───── 4. the names agree across the two files, or the grep is hollow ──── */
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
