/**
 * Tiny in-memory + sessionStorage channel between CTAs and the lead form:
 * "the visitor clicked the Google package" → the form pre-selects it.
 */
export type Intent = 'website' | 'website_ads' | 'unsure';

const KEY = 'lead_intent';
const EVENT = 'lead-intent-change';

export type IntentPayload = { intent: Intent; source: string; roiContext?: string };

export function setIntent(intent: Intent, source: string, roiContext?: string): void {
  if (typeof window === 'undefined') return;
  const payload: IntentPayload = { intent, source, roiContext };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent<IntentPayload>(EVENT, { detail: payload }));
}

export function setRoiContext(roiContext: string): void {
  if (typeof window === 'undefined') return;
  const current = getIntent();
  const payload: IntentPayload = { intent: current?.intent ?? 'unsure', source: current?.source ?? 'roi', roiContext };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent<IntentPayload>(EVENT, { detail: payload }));
}

export function getIntent(): IntentPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as IntentPayload) : null;
  } catch {
    return null;
  }
}

export function onIntentChange(handler: (payload: IntentPayload) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<IntentPayload>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
