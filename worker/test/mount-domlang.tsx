/*
 * BARE HEBREW, ON PURPOSE — the fixture dom-lang.test.ts bundles.
 *
 * Not one string here is wrapped in t(). That is the whole point: these are
 * the shapes the codemod could never reach — a label map, an options array,
 * a string returned from a helper, an attribute — and they stand in for the
 * two thousand like them across the app. If they turn Russian, the DOM
 * translator is doing the job t() cannot.
 */
import { createRoot } from 'react-dom/client';
import { LangBoundary } from '@/components/social/LangBoundary';
import { LangSwitch } from '@/components/social/LangSwitch';

/* A label map in a module, exactly like the ones in src/lib/social. */
const STATUS: Record<string, string> = { a: 'ארכיון', b: 'הגדרות', c: 'פרסום ידני' };

/* A helper that builds a sentence — never a literal in JSX. */
function describe(): string {
  return 'אין עדיין קבוצות';
}

function Screen() {
  return (
    <div>
      <LangSwitch />
      <p id="map">{STATUS.a}</p>
      <p id="map2">{STATUS.b}</p>
      <p id="fn">{describe()}</p>
      {/* an options array, the other shape a codemod cannot touch */}
      <ul>
        {['קבוצות', 'קמפיינים', 'היסטוריה'].map((x) => (
          <li key={x} className="opt">
            {x}
          </li>
        ))}
      </ul>
      <button id="btn" aria-label="סגור" title="שמור">
        שמור
      </button>
      {/* the customer's own typing must never be rewritten */}
      <input id="typed" readOnly value="ארכיון" />
      <span id="kept" data-no-translate>
        הגדרות
      </span>
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <LangBoundary>
    <Screen />
  </LangBoundary>,
);
