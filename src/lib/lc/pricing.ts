import type { Locale, PricingRule, Quote, QuoteAdjustment, QuoteLine, Service } from './types';
import { pick, uid } from './util';

/**
 * Smart pricing engine.
 *
 * The AI agent may ONLY quote numbers that come out of this function. Every
 * number is derived from the owner's services and rules — nothing is guessed.
 */

export interface PriceRequest {
  items: { serviceId: string; quantity: number }[];
  city?: string;
  urgent?: boolean;
  extras?: string[]; // pricing rule ids of type 'extra'
}

export interface PriceResult {
  lines: QuoteLine[];
  adjustments: QuoteAdjustment[];
  subtotal: number;
  total: number;
  durationMin: number;
}

const ruleLabel = (rule: PricingRule, locale: Locale) => pick(rule.name, locale, rule.type);

export function calculatePrice(req: PriceRequest, services: Service[], rules: PricingRule[], locale: Locale = 'he'): PriceResult {
  const active = rules.filter((r) => r.active);
  const lines: QuoteLine[] = [];
  let durationMin = 0;

  for (const item of req.items) {
    const service = services.find((s) => s.id === item.serviceId && s.active);
    if (!service || item.quantity <= 0) continue;
    const qty = Math.max(1, Math.round(item.quantity));
    lines.push({
      serviceId: service.id,
      label: pick(service.name, locale),
      quantity: qty,
      unitPrice: service.basePrice,
      total: service.basePrice * qty,
    });
    durationMin += service.durationMin * qty;
  }

  const adjustments: QuoteAdjustment[] = [];
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  if (lines.length === 0) return { lines, adjustments, subtotal: 0, total: 0, durationMin: 0 };

  // Quantity discounts: from N units of a service → % off that line.
  for (const rule of active.filter((r) => r.type === 'quantity_discount')) {
    const line = lines.find((l) => l.serviceId === rule.config.serviceId);
    const from = rule.config.fromQuantity ?? 2;
    const off = rule.config.percentOff ?? 0;
    if (line && line.quantity >= from && off > 0) {
      adjustments.push({ ruleId: rule.id, label: ruleLabel(rule, locale), amount: -Math.round((line.total * off) / 100) });
    }
  }

  // Package discounts: all listed services present → flat amount off.
  for (const rule of active.filter((r) => r.type === 'package_discount')) {
    const ids = rule.config.serviceIds ?? [];
    if (ids.length >= 2 && ids.every((id) => lines.some((l) => l.serviceId === id))) {
      adjustments.push({ ruleId: rule.id, label: ruleLabel(rule, locale), amount: -(rule.config.amountOff ?? 0) });
    }
  }

  // Location surcharge.
  if (req.city) {
    const city = req.city.trim().toLowerCase();
    for (const rule of active.filter((r) => r.type === 'location_surcharge')) {
      const cities = (rule.config.cities ?? []).map((c) => c.trim().toLowerCase());
      if (cities.includes(city) && rule.config.amount) {
        adjustments.push({ ruleId: rule.id, label: ruleLabel(rule, locale), amount: rule.config.amount });
      }
    }
  }

  // Urgent (same/next-day) surcharge.
  if (req.urgent) {
    for (const rule of active.filter((r) => r.type === 'urgent_surcharge')) {
      const p = rule.config.percent ?? 0;
      if (p > 0) adjustments.push({ ruleId: rule.id, label: ruleLabel(rule, locale), amount: Math.round((subtotal * p) / 100) });
    }
  }

  // Optional extras chosen by the customer.
  for (const id of req.extras ?? []) {
    const rule = active.find((r) => r.id === id && r.type === 'extra');
    if (rule?.config.amount) adjustments.push({ ruleId: rule.id, label: ruleLabel(rule, locale), amount: rule.config.amount });
  }

  let total = subtotal + adjustments.reduce((s, a) => s + a.amount, 0);

  // Minimum order.
  for (const rule of active.filter((r) => r.type === 'min_order')) {
    const min = rule.config.minimum ?? 0;
    if (total < min) {
      adjustments.push({ ruleId: rule.id, label: ruleLabel(rule, locale), amount: min - total });
      total = min;
    }
  }

  return { lines, adjustments, subtotal, total: Math.max(0, Math.round(total)), durationMin };
}

export function buildQuote(
  result: PriceResult,
  ctx: { organizationId: string; leadId: string; conversationId: string },
  status: Quote['status'] = 'sent',
): Quote {
  const now = new Date().toISOString();
  return {
    id: uid('q'),
    organizationId: ctx.organizationId,
    leadId: ctx.leadId,
    conversationId: ctx.conversationId,
    lines: result.lines,
    adjustments: result.adjustments,
    subtotal: result.subtotal,
    total: result.total,
    status,
    sentAt: status === 'sent' ? now : null,
    createdAt: now,
  };
}

/** Human-readable quote breakdown used by the agent in chat, e.g. "Corner sofa ₪350 · Mattress ₪279 · Package -₪30 = ₪599". */
export function describeQuote(result: PriceResult, locale: Locale): string[] {
  const rows: string[] = [];
  for (const l of result.lines) {
    rows.push(`${l.label}${l.quantity > 1 ? ` ×${l.quantity}` : ''} — ₪${l.total}`);
  }
  for (const a of result.adjustments) {
    rows.push(`${a.label} — ${a.amount < 0 ? '-' : '+'}₪${Math.abs(a.amount)}`);
  }
  const totalLabel = { he: 'סה״כ', ru: 'Итого', en: 'Total' }[locale];
  rows.push(`${totalLabel}: ₪${result.total}`);
  return rows;
}
