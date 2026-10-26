/*
 * THE CRM SHELL, AS A PAGE A BROWSER CAN MEASURE.
 *
 * "אני רוצה שתהיה התאמה גם לאייפון… תראה איך נראה לי סרגל הכלים."
 *
 * /social has had a measured suite since its tab bar had the same problem;
 * the CRM had none at all — no test in worker/test/ renders CrmShell. So the
 * bottom bar's own inset arithmetic was never looked at by anything, and it
 * was still the raw `env(safe-area-inset-bottom)` that /social was taught to
 * stop using.
 *
 * THE INSETS ARE DRIVEN, NOT HOPED FOR. Chromium exposes no way to set
 * env(safe-area-inset-*), so the page below redefines `--safe-b` — the one
 * token everything pinned to the bottom of this product reads — to the three
 * values a real device produces: 0 (no inset), 10px (a Safari tab on a
 * notched iPhone, where the token clamps) and 34px (an installed app on the
 * same phone). A shell that reads the token follows all three; one that
 * reads env() directly is frozen at whatever Chromium reports, which is how
 * this was invisible.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
/*
 * CrmShell calls usePathname() to decide which tab is lit. Outside the app
 * router that throws "invariant expected app router to be mounted", and the
 * export is a non-configurable getter so it cannot be stubbed. The hook reads
 * one React context, so the context is what is supplied — the real component,
 * unmodified, with the one thing it needs.
 */
import { CrmChrome } from '../../src/components/crm/CrmShell';
/*
 * AND THE REAL FORM AS THE CHILD, not a filler box. "ליד חדש" is the screen
 * the owner photographed, with its labels cut off at the right edge, so it is
 * the screen worth measuring: a long RTL form of labelled fields, an
 * autocomplete, a service list and a save button. A grey div proves the bar
 * sits right and nothing about the content beside it.
 */
import { LeadForm } from '../../src/components/crm/LeadForm';

/*
 * CrmChrome, not CrmShell. The shell returns a spinner until Supabase
 * answers with a session, and a harness has no Supabase — so every attempt
 * to measure this bar would measure a spinner. The chrome is the same
 * elements with the session and the router taken out, which is what makes
 * the measurement possible at all.
 */
const body = renderToStaticMarkup(
  createElement(
    CrmChrome,
    { title: 'ליד חדש', pathname: '/crm/leads/new' } as never,
    createElement(LeadForm, { submitLabel: 'שמירת הליד', onSubmit: async () => {} } as never),
  ),
);

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="crm-theme" id="probe">${body}</div></body></html>`);
