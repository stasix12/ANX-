import { supabaseAdmin } from './supabaseAdmin';

/**
 * Business knowledge the bot answers from — price list, service area,
 * working hours. Stored in crm_settings under 'whatsapp_bot' (seeded by
 * supabase/whatsapp-schema.sql) so the admin edits it in the database, not
 * in code. The bot NEVER invents a price: a service with price null makes
 * it ask for a photo or hand off to a human.
 */

export interface PriceItem {
  service: string;
  /** ₪, or null when the price depends on a photo / human quote. */
  price: number | null;
  note: string;
}

export interface BotSettings {
  businessName: string;
  /** Free-text description of where the business works. Empty = unknown → the bot checks per city via a human. */
  serviceArea: string;
  workStartHour: number;
  workEndHour: number;
  /** Working days, JS getDay() numbering: 0 = Sunday … 6 = Saturday. */
  workDays: number[];
  /** Length of one job slot in minutes — spacing for availability offers. */
  slotMinutes: number;
  notes: string;
  priceList: PriceItem[];
}

const DEFAULTS: BotSettings = {
  businessName: 'ANX ניקוי ריפודים',
  serviceArea: '',
  workStartHour: 9,
  workEndHour: 19,
  workDays: [0, 1, 2, 3, 4, 5],
  slotMinutes: 120,
  notes: '',
  priceList: [
    {
      service: 'ניקוי ספה תלת-מושבית',
      price: 299,
      note: 'כולל ניקוי עמוק, טיפול בכתמים, חיטוי וייבוש מואץ',
    },
  ],
};

export async function getBotSettings(): Promise<BotSettings> {
  const { data, error } = await supabaseAdmin()
    .from('crm_settings')
    .select('value')
    .eq('key', 'whatsapp_bot')
    .maybeSingle();
  if (error) throw new Error(error.message);
  const value = (data?.value ?? {}) as Partial<BotSettings>;
  return {
    ...DEFAULTS,
    ...value,
    priceList: Array.isArray(value.priceList) && value.priceList.length > 0
      ? value.priceList
      : DEFAULTS.priceList,
    workDays: Array.isArray(value.workDays) ? value.workDays : DEFAULTS.workDays,
  };
}
