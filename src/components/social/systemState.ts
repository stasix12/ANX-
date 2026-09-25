import type { Tone } from './ui';

/**
 * THE FOUR SYSTEM STATES — decided once by the dashboard, rendered wherever.
 *
 * They lived inside LiveCampaignHero.tsx, which was right while the system
 * card was the only thing that said them. The identity bar says them now, on
 * every screen the dashboard hands them to, and a bar shown on eleven routes
 * must not drag a dashboard card into its bundle to read four strings.
 *
 * Nothing about the rule changed: the page decides, everything else renders.
 */
export type SystemState = 'active' | 'paused' | 'needs_intervention' | 'empty';

export const SYSTEM_STATE_LABEL: Record<SystemState, string> = {
  active: 'המערכת פעילה',
  paused: 'המערכת מושהית',
  needs_intervention: 'נדרשת התערבות',
  // NOT "פעילה". Claiming the system is working while nothing is queued is
  // the same lie as an invented number, and it is the state a brand-new
  // install spends its first hour in.
  empty: 'אין מה לפרסם כרגע',
};

export const SYSTEM_STATE_TONE: Record<SystemState, Tone> = {
  active: 'good',
  // Paused is a deliberate act by the owner, not an alarm. Amber here cries
  // wolf on the one state they caused themselves.
  paused: 'neutral',
  needs_intervention: 'warn',
  empty: 'neutral',
};
