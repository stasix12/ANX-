import type { Automation, AutomationRun, Booking, Conversation, Customer, Job, Locale, Message, Quote, Worker } from './types';
import { formatDate, formatTime } from './format';
import { addMinutes, uid } from './util';
import { pick } from './util';

/**
 * Automation runner. Events create scheduled runs; `dueRuns()` returns what
 * should be delivered now. Delivery itself goes through the messaging
 * adapter (mock → appears as a system message in the conversation).
 */

export interface RenderVars {
  name: string;
  date: string;
  time: string;
  address: string;
  service: string;
  worker: string;
  total: string;
  eta: string;
  review_link: string;
}

export function renderMessage(a: Automation, locale: Locale, vars: Partial<RenderVars>): string {
  const lang: Locale = a.language === 'auto' ? locale : a.language;
  const tpl = pick(a.message, lang, pick(a.message, 'en'));
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => String((vars as Record<string, string | undefined>)[k] ?? ''));
}

export interface ScheduleInput {
  organizationId: string;
  automations: Automation[];
  trigger: Automation['trigger'];
  entityType: AutomationRun['entityType'];
  entityId: string;
  conversationId: string | null;
  locale: Locale;
  vars: Partial<RenderVars>;
  /** Anchor time the delay applies to (booking start for reminders, now for the rest). */
  anchor: Date;
  now: Date;
}

export function scheduleRuns(input: ScheduleInput): AutomationRun[] {
  return input.automations
    .filter((a) => a.enabled && a.trigger === input.trigger)
    .map((a) => {
      const scheduledAt = addMinutes(input.anchor, a.delayMinutes);
      return {
        id: uid('run'),
        organizationId: input.organizationId,
        automationId: a.id,
        automationKey: a.key,
        entityType: input.entityType,
        entityId: input.entityId,
        conversationId: input.conversationId,
        scheduledAt: scheduledAt.toISOString(),
        sentAt: null,
        status: 'scheduled' as const,
        renderedMessage: renderMessage(a, input.locale, input.vars),
        recoveredValue: 0,
      };
    })
    .filter((r) => new Date(r.scheduledAt) >= addMinutes(input.now, -5) || r.automationKey === 'lead_ai_reply');
}

export function dueRuns(runs: AutomationRun[], now: Date): AutomationRun[] {
  return runs.filter((r) => r.status === 'scheduled' && new Date(r.scheduledAt) <= now);
}

export function bookingVars(customer: Customer, booking: Booking, job: Job | null, worker: Worker | null, quote: Quote | null, locale: Locale): Partial<RenderVars> {
  return {
    name: customer.name.split(' ')[0],
    date: formatDate(booking.startAt, locale, 'weekday'),
    time: formatTime(booking.startAt, locale),
    address: job?.address || customer.addresses[0]?.street || customer.city,
    service: job?.serviceSummary ?? '',
    worker: worker?.name ?? '',
    total: quote ? `₪${quote.total}` : '',
    eta: '20',
    review_link: 'https://g.page/r/review',
  };
}

/** Quote follow-up: cancel pending follow-ups once the customer replies or books. */
export function cancelFollowUps(runs: AutomationRun[], conversationId: string): AutomationRun[] {
  return runs.map((r) => (r.conversationId === conversationId && r.automationKey.startsWith('quote_followup') && r.status === 'scheduled' ? { ...r, status: 'skipped' as const } : r));
}

export function systemMessageFromRun(run: AutomationRun, conversation: Conversation): Message {
  return {
    id: uid('m'),
    organizationId: run.organizationId,
    conversationId: conversation.id,
    sender: 'ai',
    text: run.renderedMessage,
    attachments: [],
    meta: { kind: run.automationKey.startsWith('quote_followup') ? 'followup' : 'note', automationKey: run.automationKey },
    createdAt: new Date().toISOString(),
  };
}
