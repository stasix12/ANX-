import { site } from '@/config/site';
import { readAttribution } from '@/lib/attribution';
import { normalizeIsraeliPhone } from '@/lib/phone';
import { whatsappHref } from '@/lib/whatsapp';

export type Interest = 'website' | 'website_ads' | 'unsure';

export type LeadInput = {
  name: string;
  phone: string;
  business: string;
  interest: Interest;
  /** e.g. "10 × 1,000 ₪ = 10,000 ₪" when the visitor came from the calculator. */
  roiContext?: string;
  intentSource?: string;
};

export const interestLabels: Record<Interest, string> = {
  website: 'אתר לעסק',
  website_ads: 'אתר + Google Ads',
  unsure: 'עדיין לא בטוח',
};

export const leadEndpoint = process.env.NEXT_PUBLIC_LEAD_ENDPOINT ?? '';
const leadAccessKey = process.env.NEXT_PUBLIC_LEAD_ACCESS_KEY ?? '';
export const hasLeadEndpoint = leadEndpoint.length > 0;

// Loud build-time warning: with neither an endpoint nor a WhatsApp number the
// form has nowhere to send leads. Not a hard failure so previews still build.
if (typeof window === 'undefined' && !hasLeadEndpoint && !site.contact.whatsapp) {
  console.warn(
    '\n[leads] ⚠ No lead destination configured: set NEXT_PUBLIC_LEAD_ENDPOINT and/or NEXT_PUBLIC_WHATSAPP_NUMBER before launch (see .env.example).\n',
  );
}

const TIMEOUT_MS = 8000;

/** POST the lead as JSON to the configured endpoint. Throws on any failure. */
export async function postLead(input: LeadInput): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      name: input.name.trim(),
      phone: normalizeIsraeliPhone(input.phone) ?? input.phone,
      phone_raw: input.phone,
      business: input.business.trim(),
      interest: input.interest,
      interest_label: interestLabels[input.interest],
      roi_context: input.roiContext ?? '',
      intent_source: input.intentSource ?? '',
      source: `${site.name} — website form`,
      page: window.location.href,
      submitted_at: new Date().toISOString(),
      ...readAttribution(),
    };
    // Web3Forms expects the access key inside the body; harmless elsewhere.
    if (leadAccessKey) body.access_key = leadAccessKey;
    // A readable subject line for e-mail based endpoints (Web3Forms / Formspree).
    body.subject = `ליד חדש מהאתר: ${body.name} — ${interestLabels[input.interest]}`;

    // Google Apps Script web apps cannot answer a CORS preflight; a
    // text/plain body is a "simple request" and still reaches doPost as JSON.
    const appsScript = leadEndpoint.includes('script.google.com');
    const res = await fetch(leadEndpoint, {
      method: 'POST',
      headers: appsScript
        ? { 'Content-Type': 'text/plain;charset=utf-8' }
        : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Lead endpoint responded ${res.status}`);
  } finally {
    window.clearTimeout(timer);
  }
}

/** WhatsApp message carrying the form contents (fallback / after-submit). */
export function leadWhatsAppHref(input: LeadInput): string {
  const parts = ['היי, הגעתי דרך האתר.', `שם: ${input.name.trim()}`, `טלפון: ${input.phone.trim()}`];
  if (input.business.trim()) parts.push(`עסק: ${input.business.trim()}`);
  parts.push(
    input.interest === 'unsure'
      ? 'עדיין לא בטוח מה מתאים לי — אשמח להתייעץ.'
      : `מעניין אותי: ${interestLabels[input.interest]}.`,
  );
  if (input.roiContext) parts.push(`(לפי המחשבון: ${input.roiContext})`);
  return whatsappHref(parts.join('\n'));
}

export function afterSubmitWhatsAppHref(name: string): string {
  return whatsappHref(`היי, שלחתי עכשיו טופס באתר (שם: ${name.trim()}). אשמח להמשיך כאן.`);
}
