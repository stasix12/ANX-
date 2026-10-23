/**
 * A HOOK BELOW AN EARLY RETURN IS A CRASH, AND THIS REPO HAD NO LINTER.
 *
 * "המסך הזה נתקע — משהו השתבש בהצגת המסך." The screenshot had no route, no
 * line and no code. The cause was six lines of correct-looking code in
 * QuickPublishSheet: a `useRef` declared BELOW `if (!open || !item) return
 * null`. The library mounts that sheet permanently with open={false}, so the
 * first render takes the early return and never reaches the hook; the first
 * tap on "פרסם" renders past it, React counts one hook more than last time
 * and throws #310. A client render error, so `digest` was empty and there was
 * nothing to look up.
 *
 * react-hooks/rules-of-hooks names that in one line — and nothing in this
 * repository has ever run it. `package.json` points "lint" at `next lint`,
 * which Next 16 removed (node_modules/next/dist/docs: "The `next lint`
 * command has been removed"), and `next build` does not check hooks.
 *
 * So the suite checks it. This is not a replacement for the real rule — it is
 * a deliberately narrow reading of the one shape that has actually bitten:
 * a hook call, at the top level of a component, textually after a top-level
 * early `return` in the same component.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(ROOT, dir)).sort()) {
    const rel = path.join(dir, name);
    const full = path.join(ROOT, rel);
    if (statSync(full).isDirectory()) walk(rel, out);
    else if (name.endsWith('.tsx')) out.push(rel);
  }
  return out;
}

/** Comments out, so a hook named in prose is not a hook call. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^(\s*)\/\/.*$/gm, '$1');

/**
 * One file → the component bodies in it, as text.
 *
 * Split on a top-level `function` or `const X = (` at column 0, which is how
 * every component in this repository is declared. Anything indented is inside
 * one already and travels with it.
 */
function components(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /^(?:export\s+)?(?:default\s+)?function\s+([A-Z][\w$]*)\s*\(/gm;
  const starts: { name: string; at: number }[] = [];
  for (const m of src.matchAll(re)) starts.push({ name: m[1], at: m.index ?? 0 });
  for (const [i, s] of starts.entries()) {
    const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
    out.push({ name: s.name, body: src.slice(s.at, end) });
  }
  return out;
}

const HOOK = /^\s{2}(?:const|let)\s+[^=]*=\s*(use[A-Z]\w*)\s*[<(]/;
/* A top-level early return: two spaces of indent, an `if`, and a `return` on
   the same line or the next. Only `return` — a `throw` is not a render. */
const EARLY_RETURN = /^\s{2}if\s*\([^)]*\)\s*return\b/;

const files = [...walk(path.join('src', 'components', 'social')), ...walk(path.join('src', 'app', 'social'))];
is(files.length > 40, `only ${files.length} component files were scanned — the walk is looking in the wrong place`);

const offenders: string[] = [];
for (const rel of files) {
  const src = strip(readFileSync(path.join(ROOT, rel), 'utf8'));
  for (const c of components(src)) {
    const lines = c.body.split('\n');
    let returnedAt = -1;
    for (const [n, line] of lines.entries()) {
      if (returnedAt === -1 && EARLY_RETURN.test(line)) {
        returnedAt = n;
        continue;
      }
      if (returnedAt === -1) continue;
      const hook = HOOK.exec(line);
      /* useRef/useState/useMemo/useCallback/useEffect and every custom hook.
         `useConfirm`-style helpers count: they call hooks inside. */
      if (hook) offenders.push(`${rel}: ${c.name}() calls ${hook[1]}() below the early return on line ${returnedAt + 1} of the function`);
    }
  }
}

assert.deepEqual(
  offenders,
  [],
  'A HOOK IS DECLARED BELOW AN EARLY RETURN. React counts hooks per render, so the first render that gets past that return throws #310 and the screen shows "המסך הזה נתקע":\n  ' +
    offenders.join('\n  '),
);
checks += 1;

/* And the one that bit, by name — so the regression is unmistakable rather
   than being absorbed into a count that happens to stay at zero. */
{
  const sheet = strip(readFileSync(path.join(ROOT, 'src/components/social/QuickPublishSheet.tsx'), 'utf8'));
  const hookAt = sheet.indexOf('const publishing = useRef(false);');
  const returnAt = sheet.indexOf('if (!open || !item) return null;');
  is(hookAt > -1 && returnAt > -1, 'QuickPublishSheet lost either its double-tap guard or its early return — this pin no longer means anything');
  is(hookAt < returnAt, 'QuickPublishSheet declares its useRef below the early return again — the first tap on "פרסם" crashes the library screen');
}

/* The lint command this repository thinks it has does not exist any more.
   Stated here rather than fixed here: adding ESLint is a dependency change
   and a CI job, and this file is the stopgap that covers the one shape that
   has actually cost the owner a screen. */
{
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  const lint = pkg.scripts?.lint ?? '';
  is(
    lint === 'next lint',
    `package.json's lint script is now "${lint}" — if a real linter has been wired up, react-hooks/rules-of-hooks covers this file's job properly and this note can go`,
  );
}

console.log(`hook-order tests OK — ${checks} assertions over ${files.length} component files`);
