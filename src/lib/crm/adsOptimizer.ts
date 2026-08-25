import { formatSpend, type CampaignPerf, type CampaignWindow } from '@/lib/crm/facebookAds';

/**
 * Turns per-campaign Graph insights into the concrete actions a media buyer
 * would take — pure derivation, no extra API calls. All copy is Hebrew and
 * speaks in imperatives ("העבר תקציב", "רענן קריאייטיב"), not observations.
 */

export type RecommendationTone = 'act' | 'watch' | 'good';

export interface Recommendation {
  emoji: string;
  /** act = do this now, watch = keep an eye, good = working, protect it. */
  tone: RecommendationTone;
  text: string;
  /** The campaign the action refers to, when it refers to one. */
  campaignId?: string;
}

const cplOf = (w: CampaignWindow): number | null =>
  w.conversations > 0 && w.spend > 0 ? w.spend / w.conversations : null;

const money = (v: number, currency: string) => formatSpend(v, currency);

/** Spend below this (₪) in 30 days is too little signal to act on. */
const MIN_ACTIONABLE_SPEND = 150;

export function buildRecommendations(
  campaigns: CampaignPerf[],
  currency: string,
): Recommendation[] {
  const items: Recommendation[] = [];
  if (!campaigns.length) return items;

  const active = campaigns.filter((c) => c.status === 'ACTIVE');
  const totalSpend = campaigns.reduce((sum, c) => sum + c.d30.spend, 0);
  const totalConv = campaigns.reduce((sum, c) => sum + c.d30.conversations, 0);
  const accountCpl = totalConv > 0 ? totalSpend / totalConv : null;

  // 1. Money burners: real spend, zero inquiries — the clearest stop-loss.
  for (const c of active) {
    if (c.d30.spend >= MIN_ACTIONABLE_SPEND && c.d30.conversations === 0) {
      items.push({
        emoji: '🚨',
        tone: 'act',
        campaignId: c.campaignId,
        text: `עצור או שפץ את "${c.name}": ${money(c.d30.spend, currency)} ב‑30 יום בלי אף פנייה. עד שיש קריאייטיב או קהל חדשים — התקציב הזה עדיף בקמפיין אחר.`,
      });
    }
  }

  // 2. Budget shift: priciest vs cheapest campaign with real volume.
  const measured = campaigns.filter(
    (c) => c.d30.conversations >= 3 && c.d30.spend >= MIN_ACTIONABLE_SPEND,
  );
  if (measured.length >= 2 && accountCpl !== null) {
    const best = measured.reduce((a, b) => (cplOf(b.d30)! < cplOf(a.d30)! ? b : a));
    const worst = measured.reduce((a, b) => (cplOf(b.d30)! > cplOf(a.d30)! ? b : a));
    if (best.campaignId !== worst.campaignId && cplOf(worst.d30)! >= cplOf(best.d30)! * 1.5) {
      items.push({
        emoji: '💸',
        tone: 'act',
        campaignId: worst.campaignId,
        text: `העבר תקציב מ"${worst.name}" (${money(cplOf(worst.d30)!, currency)} לפנייה) אל "${best.name}" (${money(cplOf(best.d30)!, currency)} לפנייה) — פי ${(cplOf(worst.d30)! / cplOf(best.d30)!).toFixed(1)} הבדל בעלות פנייה על אותו כסף.`,
      });
    }
  }

  // 3. Scale the winner — gradually, so learning doesn't reset.
  if (accountCpl !== null && measured.length) {
    const best = measured.reduce((a, b) => (cplOf(b.d30)! < cplOf(a.d30)! ? b : a));
    const bestCpl = cplOf(best.d30)!;
    if (best.status === 'ACTIVE' && bestCpl <= accountCpl * 0.85) {
      const budgetNote = best.dailyBudget
        ? ` (תקציב נוכחי: ${money(best.dailyBudget, currency)}/יום)`
        : '';
      items.push({
        emoji: '🚀',
        tone: 'act',
        campaignId: best.campaignId,
        text: `הגדל את "${best.name}"${budgetNote}: הוא מביא פניות ב‑${money(bestCpl, currency)} — זול משמעותית מהממוצע (${money(accountCpl, currency)}). העלה תקציב בכ‑20% ולא יותר מפעם ב‑3 ימים, כדי לא לאפס את הלמידה של פייסבוק.`,
      });
    }
  }

  // 4. Creative fatigue: the same people see the ads again and again.
  for (const c of active) {
    if (c.d30.frequency >= 4 && c.d30.spend >= MIN_ACTIONABLE_SPEND) {
      items.push({
        emoji: '🔁',
        tone: 'act',
        campaignId: c.campaignId,
        text: `רענן קריאייטיב ב"${c.name}": תדירות ${c.d30.frequency.toFixed(1)} — כל אדם בקהל ראה את המודעה ~${Math.round(c.d30.frequency)} פעמים בחודש. מודעה חדשה (וידאו לפני/אחרי עובד מצוין בניקיון) או הרחבת קהל יורידו את העלות.`,
      });
    }
  }

  // 5. Weak hook: people see the ad but don't click.
  for (const c of active) {
    if (c.d30.impressions >= 3000 && c.d30.ctr > 0 && c.d30.ctr < 1) {
      items.push({
        emoji: '🖱️',
        tone: 'watch',
        campaignId: c.campaignId,
        text: `"${c.name}" עם CTR של ${c.d30.ctr.toFixed(2)}% בלבד (מתחת ל‑1%) — המודעה לא עוצרת את הגלילה. נסה פתיח חדש: תמונת לפני/אחרי בולטת או שאלה ישירה בשורה הראשונה.`,
      });
    }
  }

  // 6. Momentum per campaign: this week against the week before.
  for (const c of active) {
    const now = cplOf(c.d7);
    const before = cplOf(c.prev7);
    if (now === null || before === null) continue;
    const change = ((now - before) / before) * 100;
    if (change >= 30) {
      items.push({
        emoji: '📈',
        tone: 'watch',
        campaignId: c.campaignId,
        text: `"${c.name}" מתייקר: ${money(now, currency)} לפנייה השבוע מול ${money(before, currency)} בשבוע שעבר (+${change.toFixed(0)}%). אם זה נמשך עוד כמה ימים — החלף קריאייטיב לפני שמוסיפים תקציב.`,
      });
    } else if (change <= -30) {
      items.push({
        emoji: '📉',
        tone: 'good',
        campaignId: c.campaignId,
        text: `"${c.name}" משתפר: ${money(now, currency)} לפנייה השבוע מול ${money(before, currency)} בשבוע שעבר (${change.toFixed(0)}%). מומנטום טוב — זה המועמד הטבעי לתוספת תקציב.`,
      });
    }
  }

  // 7. All eggs in one basket — no backup if the single campaign tires.
  if (active.length === 1 && totalSpend >= MIN_ACTIONABLE_SPEND) {
    items.push({
      emoji: '🧺',
      tone: 'watch',
      text: `כל התקציב רץ על קמפיין פעיל אחד. שווה להריץ במקביל קמפיין בדיקה קטן (10–15% מהתקציב) עם קהל או קריאייטיב אחרים — כך יש תחליף מוכן כשהקמפיין הראשי יתעייף.`,
    });
  }

  // Nothing demanded action — say so explicitly instead of an empty screen.
  if (!items.some((i) => i.tone === 'act')) {
    items.unshift({
      emoji: '✅',
      tone: 'good',
      text:
        accountCpl !== null
          ? `הקמפיינים מאוזנים — אין צעד דחוף. עלות פנייה ממוצעת ב‑30 הימים האחרונים: ${money(accountCpl, currency)}. המשך לרענן קריאייטיב כל 3–4 שבועות כדי לשמור עליה.`
          : 'אין עדיין מספיק פניות ב‑30 הימים האחרונים כדי להמליץ על צעד — תן לקמפיינים לצבור נתונים.',
    });
  }

  const order: RecommendationTone[] = ['act', 'watch', 'good'];
  items.sort((a, b) => order.indexOf(a.tone) - order.indexOf(b.tone));
  return items;
}
