import type { FbAdsConfig } from '@/lib/crm/settings';

/**
 * Reads ad spend straight from the Facebook Marketing API (Graph API), which
 * serves CORS, so the browser can call it directly with the admin's token —
 * no server in the middle. Requires a token with the ads_read permission.
 */

// Overridable so the local mock can stand in for Graph during development.
const GRAPH_BASE = process.env.NEXT_PUBLIC_FB_GRAPH_BASE ?? 'https://graph.facebook.com';
const GRAPH_VERSION = 'v21.0';

export interface AdSpend {
  today: number;
  month: number;
  year: number;
  currency: string;
  /** Messaging conversations started (the "פניות") today / this month. */
  todayConversations: number;
  monthConversations: number;
}

/** Sums messaging-conversation actions out of the insights actions list. */
function countConversations(actions: { action_type?: string; value?: string }[] | undefined): number {
  if (!actions) return 0;
  return actions
    .filter((a) => a.action_type?.includes('messaging_conversation_started'))
    .reduce((sum, a) => sum + Number(a.value ?? 0), 0);
}

async function fetchPreset(
  config: FbAdsConfig,
  datePreset: string,
): Promise<{ spend: number; currency: string | null; conversations: number }> {
  const account = config.accountId.replace(/^act_/, '').trim();
  const url =
    `${GRAPH_BASE}/${GRAPH_VERSION}/act_${account}/insights` +
    `?date_preset=${datePreset}&fields=spend,account_currency,actions` +
    `&access_token=${encodeURIComponent(config.accessToken)}`;

  const response = await fetch(url);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const code = body?.error?.code;
    if (code === 190) throw new Error('הטוקן פג תוקף או שגוי — צור טוקן חדש ועדכן בהגדרות.');
    if (code === 100 || code === 803) throw new Error('מזהה חשבון המודעות לא נמצא — בדוק את המספר.');
    if (code === 10 || code === 200 || code === 294)
      throw new Error('לטוקן אין הרשאת ads_read לחשבון המודעות הזה.');
    throw new Error(body?.error?.message ?? 'שליפת נתוני הפרסום נכשלה.');
  }

  const row = body?.data?.[0];
  return {
    spend: row?.spend ? Number(row.spend) : 0,
    currency: row?.account_currency ?? null,
    conversations: countConversations(row?.actions),
  };
}

export async function fetchAdSpend(config: FbAdsConfig): Promise<AdSpend> {
  const [today, month, year] = await Promise.all([
    fetchPreset(config, 'today'),
    fetchPreset(config, 'this_month'),
    fetchPreset(config, 'this_year'),
  ]);
  return {
    today: today.spend,
    month: month.spend,
    year: year.spend,
    currency: year.currency ?? month.currency ?? today.currency ?? 'ILS',
    todayConversations: today.conversations,
    monthConversations: month.conversations,
  };
}

export function formatSpend(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  if (currency === 'ILS') return `₪${rounded.toLocaleString('he-IL')}`;
  if (currency === 'USD') return `$${rounded.toLocaleString('he-IL')}`;
  if (currency === 'EUR') return `€${rounded.toLocaleString('he-IL')}`;
  return `${rounded.toLocaleString('he-IL')} ${currency}`;
}
